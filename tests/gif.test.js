const test = require("node:test");
const assert = require("node:assert/strict");
const gif = require("../js/gif.js");

// A minimal GIF reader, enough to check what the encoder writes: frames, their placement,
// delays, and the decoded palette indices (LZW).
function read(bytes) {
  let p = 0;
  const u8 = () => bytes[p++], u16 = () => bytes[p++] | (bytes[p++] << 8);
  const sig = String.fromCharCode(...bytes.subarray(0, 6)); p = 6;
  const width = u16(), height = u16(), packed = u8(); u8(); u8();
  const pal = bytes.subarray(p, p + 3 * (1 << ((packed & 7) + 1))); p += pal.length;
  const frames = []; let gce = null, loops = false;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xf9) { u8(); const f = u8(); gce = { dispose: (f >> 2) & 7, transparent: f & 1, delay: u16(), index: u8() }; u8(); continue; }
      if (label === 0xff) loops = true;
      for (let n = u8(); n; n = u8()) p += n;
      continue;
    }
    assert.equal(b, 0x2c, "image descriptor");
    const x = u16(), y = u16(), w = u16(), h = u16(); u8();
    const min = u8(); const data = [];
    for (let n = u8(); n; n = u8()) { for (let i = 0; i < n; i++) data.push(bytes[p + i]); p += n; }
    frames.push({ x, y, w, h, gce, idx: unlzw(data, min, w * h) });
  }
  return { sig, width, height, pal, frames, loops };
}
function unlzw(data, min, count) {
  const CLEAR = 1 << min, EOI = CLEAR + 1, out = [];
  let size = min + 1, dict = [], prev = null, bit = 0;
  const reset = () => { dict = []; for (let i = 0; i < CLEAR; i++) dict[i] = [i]; dict[CLEAR] = []; dict[EOI] = null; size = min + 1; prev = null; };
  reset();
  const code = () => { let v = 0; for (let i = 0; i < size; i++, bit++) v |= ((data[bit >> 3] >> (bit & 7)) & 1) << i; return v; };
  for (;;) {
    const c = code();
    if (c === CLEAR) { reset(); continue; }
    if (c === EOI) break;
    let entry;
    if (c < dict.length) entry = dict[c];
    else if (c === dict.length && prev) entry = prev.concat(prev[0]);
    else throw new Error("bad code " + c);
    out.push(...entry);
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  assert.equal(out.length, count, "decoded the whole frame");
  return out;
}

function picture(w, h, paint) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = paint(x, y); px.set([r, g, b, 255], (y * w + x) * 4); }
  return px;
}

test("a looping GIF: the first frame whole, later ones only what changed", () => {
  const W = 40, H = 30;
  const room = (x, y) => (y > 20 ? [220, 200, 170] : [250, 240, 230]);
  const a = picture(W, H, room);
  const b = picture(W, H, (x, y) => (x >= 10 && x < 15 && y >= 5 && y < 9 ? [200, 40, 90] : room(x, y)));
  const pal = gif.palette([a, b], 255);
  const enc = gif.encoder(W, H, pal);
  enc.frame(a, 40); enc.frame(b, 8); enc.frame(b, 250);
  const g = read(enc.finish());

  assert.equal(g.sig, "GIF89a");
  assert.deepEqual([g.width, g.height, g.loops, g.frames.length], [W, H, true, 3]);
  assert.deepEqual(g.frames.map((f) => f.gce.delay), [40, 8, 250]);
  const [f0, f1, f2] = g.frames;
  assert.deepEqual([f0.x, f0.y, f0.w, f0.h], [0, 0, W, H], "the first frame is whole");
  assert.deepEqual([f1.x, f1.y, f1.w, f1.h], [10, 5, 5, 4], "the next is cropped to the change");
  assert.ok(f1.idx.every((i) => i !== gif.SEE_THROUGH), "every changed pixel is drawn");
  assert.deepEqual([f2.w, f2.h, f2.idx[0]], [1, 1, gif.SEE_THROUGH], "an unchanged frame is one see-through pixel");
  assert.ok(f0.idx.every((i) => i < pal.count), "no real pixel uses the see-through slot");

  // the colours come back close to what went in
  const col = (i) => [g.pal[i * 3], g.pal[i * 3 + 1], g.pal[i * 3 + 2]];
  const near = (c, want) => c.every((v, k) => Math.abs(v - want[k]) <= 14);
  assert.ok(near(col(f0.idx[0]), [250, 240, 230]), "wall");
  assert.ok(near(col(f0.idx[25 * W]), [220, 200, 170]), "table");
  assert.ok(near(col(f1.idx[0]), [200, 40, 90]), "flower");
});

test("large, busy frames stay decodable (dictionary resets past 4096 codes)", () => {
  const W = 160, H = 120;
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const noise = picture(W, H, () => [rnd() * 255, rnd() * 255, rnd() * 255]);
  const pal = gif.palette([noise], 255);
  assert.ok(pal.count > 200, "a busy picture fills the palette");
  const enc = gif.encoder(W, H, pal);
  enc.frame(noise, 10);
  const g = read(enc.finish());
  assert.equal(g.frames[0].idx.length, W * H);
});
