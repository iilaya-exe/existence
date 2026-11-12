// Peony painter. A peony is drawn as rings of ruffled, cupped petals: wide pale guard petals
// outside, then tighter and deeper rings toward the heart. Each ring's lit rim sits over the
// shaded base of the ring outside it, which is what makes the flower read as a full, soft ball.
// Used by the peony bouquet (js/world-peonies.js) and for the painted sprigs on the letter.
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  const { TAU, clamp, lerp, smooth, mulberry } = T.kit;

  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  // heart: the shaded depth between petals   deep/mid/light: petal base to rim   hi: the lit edge
  const PAL = {
    blush:    { heart: "#8c2f52", deep: "#cf6588", mid: "#f09cb6", light: "#fbd0dc", hi: "#fff3f6" },
    rose:     { heart: "#4e0626", deep: "#a3134e", mid: "#dc3d7c", light: "#f584ab", hi: "#ffd0e0" },
    coral:    { heart: "#7c1f1a", deep: "#cf4a3a", mid: "#f57a62", light: "#ffb096", hi: "#ffe6d8", stamens: true },
    cream:    { heart: "#b9776a", deep: "#e6bfa4", mid: "#f6e3cc", light: "#fff5e6", hi: "#ffffff", blushHeart: "#f0a6b4" },
    burgundy: { heart: "#1e030c", deep: "#5e0a26", mid: "#9a173f", light: "#cc446a", hi: "#f08ca8" },
    lilac:    { heart: "#4a2a5e", deep: "#9566b0", mid: "#c49cd6", light: "#e6cff0", hi: "#fbf2ff" },
  };
  Object.keys(PAL).forEach((k) => {
    const p = PAL[k];
    ["heart", "deep", "mid", "light", "hi"].forEach((n) => { p[n] = rgb(p[n]); });
    if (p.blushHeart) p.blushHeart = rgb(p.blushHeart);
  });

  // rim length (share of the radius), petals in the ring, half-width (radians), ruffle, notch
  const RINGS = [
    [1.00, 8, 0.74, 0.045, 0.075],
    [0.87, 9, 0.68, 0.06, 0.06],
    [0.73, 9, 0.64, 0.08, 0.05],
    [0.59, 9, 0.64, 0.10, 0.03],
    [0.45, 8, 0.68, 0.12, 0],
    [0.32, 7, 0.74, 0.14, 0],
    [0.20, 6, 0.86, 0.16, 0],
    [0.10, 4, 1.00, 0.18, 0],
  ];

  // tilt: 0 faces the viewer, 1 is seen well from the side   lean: rotation of the whole head (radians)
  function makePeony(palKey, seed, o) {
    o = Object.assign({ tilt: 0.2, lean: 0 }, o || {});
    const pal = PAL[palKey] || PAL.blush;
    const rnd = mulberry(seed * 7919 + 13);
    const petals = [];
    const nRings = pal.stamens ? RINGS.length - 3 : RINGS.length; // coral is semi-double: gold stamens show
    for (let k = 0; k < nRings; k++) {
      const [len, n, spread, ruff, notch] = RINGS[k];
      const off = rnd() * TAU;
      const ring = [];
      for (let i = 0; i < n; i++) {
        const ang = off + (i / n) * TAU + (rnd() - 0.5) * 0.34;
        // light falls from the upper left: petals reaching that way are a touch paler
        const lit = -Math.cos(ang - 0.9) * 0.1;
        ring.push({
          k, ang,
          len: len * (0.92 + rnd() * 0.16),
          spread: spread * (0.9 + rnd() * 0.22),
          ruff, notch: notch * (0.4 + rnd() * 1.2),
          p1: rnd() * TAU, p2: rnd() * TAU, f1: 5 + rnd() * 4, f2: 11 + rnd() * 7,
          tone: (rnd() - 0.5) * 0.2 + lit,
        });
      }
      ring.sort((a, b) => Math.sin(a.ang) - Math.sin(b.ang)); // far side first, near side over it
      petals.push(...ring);
    }
    const stamens = [];
    if (pal.stamens) {
      for (let i = 0; i < 46; i++) {
        const r = Math.sqrt(rnd()) * 0.17, a = rnd() * TAU;
        stamens.push([Math.cos(a) * r, Math.sin(a) * r, 0.016 + rnd() * 0.012, rnd()]);
      }
    }
    const sepals = [];
    for (let i = 0; i < 5; i++) sepals.push({ ang: (i / 5) * TAU + rnd() * 0.5, len: 0.5 + rnd() * 0.12 });

    const sq = 1 - 0.36 * o.tilt;
    const NP = 13;
    const xs = new Float32Array(NP + 1), ys = new Float32Array(NP + 1);

    // Draw at the origin. R: radius when fully open.  open: 0 (tight bud) .. 1 (full bloom).
    // punch: 0 for soft painted shading, 1 for the deep shadows the text-character look needs
    // (there, brightness alone decides which character is drawn, so petals must differ in it).
    function draw(g, R, open, punch) {
      open = clamp(open);
      punch = punch || 0;
      g.save();
      g.rotate(o.lean);
      g.scale(1, sq);
      g.lineJoin = "round";

      // green sepals cup the bud and fall away behind the opening flower
      const sepalShow = 1 - smooth((open - 0.25) / 0.5) * 0.45;
      for (const s of sepals) {
        const L = R * s.len * sepalShow * lerp(0.82, 0.95, open), w = L * 0.3;
        g.save();
        g.rotate(s.ang);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(L * 0.3, -w, L * 0.7, -w * 0.7, L, 0);
        g.bezierCurveTo(L * 0.7, w * 0.7, L * 0.3, w, 0, 0);
        g.fillStyle = "#2d6a34";
        g.fill();
        g.strokeStyle = "#17401e";
        g.lineWidth = R * 0.012;
        g.stroke();
        g.restore();
      }

      for (const p of petals) {
        const k = p.k;
        const ok = smooth(clamp((open - k * 0.055) / (1 - k * 0.055))); // the heart opens last
        const budLen = Math.min(p.len, 0.4 - k * 0.036);
        const len = R * lerp(budLen, p.len, ok);
        if (len < 0.5) continue;
        const spread = lerp(Math.max(p.spread, 0.95), p.spread, ok); // wrapped tight around the bud
        const cy = -R * o.tilt * 0.3 * (k / 7) * ok; // tilted heads show their heart higher up
        const ruff = p.ruff * lerp(0.35, 1, ok);

        for (let i = 0; i <= NP; i++) {
          const a = lerp(-spread, spread, i / NP);
          const w = Math.pow(Math.cos((a / spread) * (Math.PI / 2)), 0.42);
          const edge = 1 + ruff * (Math.sin(a * p.f1 + p.p1) + 0.6 * Math.sin(a * p.f2 + p.p2)) - p.notch * ok * Math.exp(-(a * a) / 0.017);
          const r = len * w * edge;
          xs[i] = Math.cos(p.ang + a) * r;
          ys[i] = Math.sin(p.ang + a) * r + cy;
        }
        g.beginPath();
        g.moveTo(0, cy);
        g.lineTo(xs[0], ys[0]);
        for (let i = 1; i < NP; i++) g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
        g.lineTo(xs[NP], ys[NP]);
        g.closePath();

        // a soft dark edge under each petal separates it from the one beneath
        g.strokeStyle = css(mix(pal.heart, BLACK, 0.35 + 0.5 * punch), 0.3 + 0.6 * punch);
        g.lineWidth = R * (0.03 + 0.035 * punch);
        g.stroke();

        const depth = k / 7; // rings deepen toward the heart
        const t = p.tone;
        const shade = (c) => (t > 0 ? mix(c, WHITE, t * 0.7) : mix(c, pal.heart, -t));
        let mid = shade(mix(pal.mid, pal.deep, depth * 0.45));
        let light = shade(mix(pal.light, pal.mid, depth * 0.4));
        let deep = mix(pal.deep, pal.heart, 0.25 + depth * 0.4);
        if (punch) { deep = mix(deep, BLACK, 0.62 * punch); mid = mix(mid, pal.heart, 0.3 * punch); }
        if (pal.blushHeart) { // cream peonies blush toward the middle
          mid = mix(mid, pal.blushHeart, depth * 0.55);
          light = mix(light, pal.blushHeart, depth * 0.3);
        }
        const gr = g.createRadialGradient(0, cy, 0, 0, cy, len * 1.04);
        gr.addColorStop(0, css(punch ? mix(pal.heart, BLACK, 0.7 * punch) : pal.heart));
        gr.addColorStop(0.42 + 0.2 * punch, css(deep));
        gr.addColorStop(0.74 + 0.08 * punch, css(mid));
        gr.addColorStop(0.93, css(light));
        gr.addColorStop(1, css(shade(pal.hi)));
        g.fillStyle = gr;
        g.fill();

        // faint veins on the wide outer petals
        if (k < 3 && ok > 0.5) {
          g.strokeStyle = css(pal.deep, 0.16);
          g.lineWidth = R * 0.008;
          g.beginPath();
          for (let v = -1; v <= 1; v++) {
            const a = p.ang + v * spread * 0.34;
            g.moveTo(Math.cos(a) * len * 0.34, Math.sin(a) * len * 0.34 + cy);
            g.lineTo(Math.cos(a) * len * 0.86, Math.sin(a) * len * 0.86 + cy);
          }
          g.stroke();
        }
      }

      if (stamens.length) {
        const show = smooth((open - 0.55) / 0.35);
        if (show > 0) {
          const cy = -R * o.tilt * 0.3 * 0.7;
          g.globalAlpha = show;
          g.fillStyle = css(mix(pal.heart, BLACK, 0.2));
          g.beginPath();
          g.arc(0, cy, R * 0.19, 0, TAU);
          g.fill();
          for (const [x, y, r, v] of stamens) {
            g.fillStyle = v < 0.3 ? "#c9861e" : v < 0.75 ? "#f2c23a" : "#ffe58a";
            g.beginPath();
            g.arc(x * R, y * R + cy, r * R, 0, TAU);
            g.fill();
          }
          g.globalAlpha = 1;
        }
      }
      g.restore();
    }

    return { draw, pal, tilt: o.tilt, lean: o.lean };
  }

  // A peony leaf: three pointed leaflets from one stalk, deep green with a pale midrib.
  // Drawn from (0,0) pointing along +x; L is the centre leaflet's length.
  function drawLeaf(g, L, grow) {
    if (grow === undefined) grow = 1;
    if (L * grow < 1) return;
    const parts = [[0, 1, 0.19], [-0.62, 0.74, 0.2], [0.62, 0.74, 0.2]];
    for (const [a, len, wid] of parts) {
      const l = L * len * grow, w = l * wid * (0.6 + 0.4 * grow);
      g.save();
      g.translate(L * 0.16 * grow, 0);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(l * 0.22, -w * 1.25, l * 0.66, -w * 1.05, l, 0);
      g.bezierCurveTo(l * 0.66, w * 1.05, l * 0.22, w * 1.25, 0, 0);
      const gr = g.createLinearGradient(0, -w, 0, w);
      gr.addColorStop(0, "#3f8a48");
      gr.addColorStop(0.5, "#2a6b36");
      gr.addColorStop(1, "#174424");
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#12381c";
      g.lineWidth = Math.max(1, w * 0.1);
      g.stroke();
      g.beginPath();
      g.moveTo(l * 0.04, 0);
      g.lineTo(l * 0.92, 0);
      g.strokeStyle = "rgba(150,205,130,0.55)";
      g.lineWidth = Math.max(0.8, w * 0.09);
      g.stroke();
      g.restore();
    }
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(L * 0.17 * grow, 0);
    g.strokeStyle = "#1c4d24";
    g.lineWidth = Math.max(1.2, L * 0.022);
    g.lineCap = "round";
    g.stroke();
  }

  // A small painted sprig (one or two blooms, a bud, leaves) as a PNG data URL, for the letter paper,
  // the envelope seal and the page icon. size: pixel width/height of the square image.
  function sprig(size, palKeys, seed, o) {
    o = Object.assign({ leaves: true }, o || {});
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    // The leaves reach well past the flowers, so the spray is drawn smaller than the canvas:
    // nothing may touch its edges, or it would be cut off there.
    const u = (size / 400) * (o.leaves ? 0.78 : 1);
    g.translate(size / 2, size / 2);
    g.scale(u, u);
    const rnd = mulberry(seed);
    if (o.leaves) {
      const leaves = [[-70, 40, 2.5, 150], [60, 60, 0.5, 150], [-20, 90, 1.55, 130], [90, -30, -0.35, 120], [-95, -40, 3.5, 115]];
      for (const [x, y, a, L] of leaves) {
        g.save();
        g.translate(x, y);
        g.rotate(a + (rnd() - 0.5) * 0.3);
        drawLeaf(g, L);
        g.restore();
      }
    }
    const spots = palKeys.length > 1 ? [[42, 34, 86, 0.25, 0.3], [-48, -30, 104, 0.15, -0.2], [92, -92, 40, 0.5, 0.6]] : [[0, 0, 128, 0.12, 0]];
    if (spots.length > 2) { // the little bud's stalk, so it belongs to the spray instead of floating beside it
      g.beginPath();
      g.moveTo(34, -6);
      g.quadraticCurveTo(84, -30, 92, -86);
      g.lineCap = "round";
      g.strokeStyle = "#1c4d24"; g.lineWidth = 7; g.stroke();
      g.strokeStyle = "#3f8a48"; g.lineWidth = 3.5; g.stroke();
    }
    spots.forEach(([x, y, R, tilt, lean], i) => {
      const key = palKeys[i % palKeys.length];
      const f = makePeony(key, seed + i * 31, { tilt, lean });
      g.save();
      g.translate(x, y);
      f.draw(g, R, i === 2 ? 0.05 : 1);
      g.restore();
    });
    return c.toDataURL("image/png");
  }

  T.peony = { PAL, make: makePeony, drawLeaf, sprig };
})(typeof window !== "undefined" ? window : globalThis);
