// A small animated-GIF encoder, so the bouquet can be saved blooming. No dependencies.
//
//   const palette = Tenderly.gif.palette([rgbaA, rgbaB], 255);       // pick colours from sample frames
//   const gif = Tenderly.gif.encoder(width, height, palette);
//   gif.frame(rgba, 8);                                               // RGBA pixels, delay in 1/100 s
//   const bytes = gif.finish();                                       // Uint8Array, a looping GIF
//
// Colours are matched to a 255-colour palette with a light ordered dither (stable from frame to
// frame). Pixels that did not change since the previous frame are left transparent and each frame
// is cropped to what changed, so a still room around a growing bouquet costs almost nothing.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Tenderly = root.Tenderly || {}).gif = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SEE_THROUGH = 255; // palette slot kept for "unchanged since the last frame"
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v - 7.5) * 1.7);
  const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

  // ---------- palette: median cut over a 15-bit colour histogram ----------
  function palette(samples, size) {
    size = Math.min(size || 255, 255);
    const hist = new Uint32Array(32768);
    for (const px of samples) for (let i = 0; i < px.length; i += 8) hist[key15(px[i], px[i + 1], px[i + 2])]++; // every other pixel
    const bins = [];
    for (let k = 0; k < 32768; k++) if (hist[k]) bins.push(k);
    const ch = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
    const box = (list) => {
      let lo = [31, 31, 31], hi = [0, 0, 0], n = 0;
      for (const k of list) { n += hist[k]; for (let c = 0; c < 3; c++) { const v = ch(k, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } }
      const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const axis = span[1] >= span[0] && span[1] >= span[2] ? 1 : span[0] >= span[2] ? 0 : 2;
      return { list, n, axis, span: span[axis] };
    };
    let boxes = bins.length ? [box(bins)] : [];
    while (boxes.length < size) {
      // split the box that holds the most colour difference
      let best = -1, score = 0;
      boxes.forEach((b, i) => { const s = b.span * Math.sqrt(b.n); if (b.list.length > 1 && s > score) { score = s; best = i; } });
      if (best < 0) break;
      const b = boxes[best];
      b.list.sort((x, y) => ch(x, b.axis) - ch(y, b.axis));
      let acc = 0, cut = 1;
      for (let i = 0; i < b.list.length - 1; i++) { acc += hist[b.list[i]]; if (acc * 2 >= b.n) { cut = i + 1; break; } }
      boxes.splice(best, 1, box(b.list.slice(0, cut)), box(b.list.slice(cut)));
    }
    const out = new Uint8Array(256 * 3);
    boxes.forEach((b, i) => {
      let r = 0, g = 0, bl = 0;
      for (const k of b.list) { const n = hist[k]; r += (ch(k, 0) * 8 + 4) * n; g += (ch(k, 1) * 8 + 4) * n; bl += (ch(k, 2) * 8 + 4) * n; }
      out[i * 3] = Math.round(r / b.n); out[i * 3 + 1] = Math.round(g / b.n); out[i * 3 + 2] = Math.round(bl / b.n);
    });
    return { rgb: out, count: Math.max(1, boxes.length) };
  }

  // ---------- a growing byte buffer ----------
  function bytes() {
    let buf = new Uint8Array(1 << 16), n = 0;
    const room = (k) => { if (n + k > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, n + k)); b.set(buf.subarray(0, n)); buf = b; } };
    return {
      byte(v) { room(1); buf[n++] = v; },
      word(v) { room(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255; },
      all(arr) { room(arr.length); buf.set(arr, n); n += arr.length; },
      text(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); },
      done: () => buf.slice(0, n),
    };
  }

  // ---------- LZW, written in 255-byte sub-blocks ----------
  const table = new Int16Array(4096 * 256).fill(-1);
  function lzw(out, indices, count) {
    const MIN = 8, CLEAR = 1 << MIN, EOI = CLEAR + 1;
    let next = EOI + 1, size = MIN + 1, cur = 0, shift = 0;
    const used = [];
    const block = new Uint8Array(255);
    let bn = 0;
    const flushByte = (v) => { block[bn++] = v; if (bn === 255) { out.byte(255); out.all(block); bn = 0; } };
    const emit = (code) => { cur |= code << shift; shift += size; while (shift >= 8) { flushByte(cur & 255); cur >>>= 8; shift -= 8; } };
    const reset = () => { for (const k of used) table[k] = -1; used.length = 0; };
    out.byte(MIN);
    emit(CLEAR);
    let prefix = indices[0];
    for (let i = 1; i < count; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const code = table[key];
      if (code >= 0) { prefix = code; continue; }
      emit(prefix);
      if (next === 4096) { emit(CLEAR); reset(); next = EOI + 1; size = MIN + 1; }
      else { if (next >= 1 << size) size++; table[key] = next++; used.push(key); }
      prefix = k;
    }
    emit(prefix);
    emit(EOI);
    if (shift > 0) flushByte(cur & 255);
    if (bn) { out.byte(bn); out.all(block.subarray(0, bn)); }
    out.byte(0);
    reset();
  }

  function encoder(width, height, pal) {
    const out = bytes();
    out.text("GIF89a");
    out.word(width); out.word(height);
    out.byte(0xf7); out.byte(0); out.byte(0); // 256-colour global palette
    out.all(pal.rgb);
    out.byte(0x21); out.byte(0xff); out.byte(11); out.text("NETSCAPE2.0"); // loop forever
    out.byte(3); out.byte(1); out.word(0); out.byte(0);

    const n = width * height;
    const shown = new Uint8Array(n).fill(SEE_THROUGH); // what the viewer sees after the last frame
    const now = new Uint8Array(n);
    const cache = new Int16Array(32768).fill(-1);
    const nearest = (r, g, b) => {
      const k = key15(r, g, b);
      let idx = cache[k];
      if (idx >= 0) return idx;
      let best = 0, bd = Infinity;
      for (let i = 0; i < pal.count; i++) {
        const dr = pal.rgb[i * 3] - r, dg = pal.rgb[i * 3 + 1] - g, db = pal.rgb[i * 3 + 2] - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3; // weighted toward how eyes see
        if (d < bd) { bd = d; best = i; }
      }
      return (cache[k] = best);
    };
    let first = true;

    return {
      frame(rgba, delay) {
        // match each pixel to the palette, with a light, fixed dither
        for (let y = 0, p = 0; y < height; y++) for (let x = 0; x < width; x++, p++) {
          const j = p * 4, d = BAYER[(y & 3) * 4 + (x & 3)];
          const c = (v) => (v + d < 0 ? 0 : v + d > 255 ? 255 : v + d);
          now[p] = nearest(c(rgba[j]), c(rgba[j + 1]), c(rgba[j + 2]));
        }
        // only what changed is drawn; the rest stays see-through over the frame before
        let x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (let y = 0, p = 0; y < height; y++) for (let x = 0; x < width; x++, p++) {
          if (first || now[p] !== shown[p]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) { x0 = y0 = x1 = y1 = 0; } // nothing changed: a single see-through pixel carries the delay
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const idx = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = (y0 + y) * width + x0 + x;
          if (!first && now[p] === shown[p]) idx[y * w + x] = SEE_THROUGH;
          else { idx[y * w + x] = now[p]; shown[p] = now[p]; }
        }
        out.byte(0x21); out.byte(0xf9); out.byte(4);
        out.byte((1 << 2) | 1); // keep the frame below, index 255 is see-through
        out.word(Math.max(2, Math.round(delay))); out.byte(SEE_THROUGH); out.byte(0);
        out.byte(0x2c); out.word(x0); out.word(y0); out.word(w); out.word(h); out.byte(0);
        lzw(out, idx, idx.length);
        first = false;
      },
      finish() { out.byte(0x3b); return out.done(); },
    };
  }

  return { palette, encoder, SEE_THROUGH };
});
