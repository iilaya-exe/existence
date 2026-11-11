// Shared drawing kit for the bouquet worlds: math helpers, wind, stems and leaves.
// The stem, leaf and wind code comes from Rebloom's lily bouquet, unchanged in behaviour,
// lifted out so the lily and peony worlds can share it.
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});

  // ================= helpers =================
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const easeOut = (t) => { t = clamp(t); return 1 - Math.pow(1 - t, 3); };
  const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  function mulberry(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 3D vectors: x right, y down, z toward the viewer
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const LIGHT = norm([-0.45, -0.65, 0.65]);
  function mixHex(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const ch = (sh) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // stems are quadratic curves from a foot near (0,0) up to the flower
  function stemPoint(st, u) {
    const a = 1 - u;
    return [a * a * st.bx + 2 * a * u * st.cx + u * u * st.x, a * a * st.by + 2 * a * u * st.cy + u * u * st.y];
  }
  function stemAngle(st, u) {
    const dx = 2 * (1 - u) * (st.cx - st.bx) + 2 * u * (st.x - st.cx);
    const dy = 2 * (1 - u) * (st.cy - st.by) + 2 * u * (st.y - st.cy);
    return Math.atan2(dy, dx);
  }

  // A garden holds the wind and screen-bottom state for one world.
  // windStart: when the breeze begins (seconds); it reaches full strength 1.6s later.
  function createGarden(windStart) {
    let BOTTOM = 200; // world y of the bottom edge of the screen (set in layout)
    const windAmt = (t) => smooth((t - windStart) / 1.6);
    function swayX(y, t) {
      const w = windAmt(t);
      const h = clamp(-y / 1100, 0, 1.2);
      if (w <= 0 || h <= 0) return 0;
      const ph = -y * 0.0016;
      const gust = Math.sin(t * 1.2 - ph) * 0.6 + Math.sin(t * 2.2 - ph * 1.6 + 1.3) * 0.22 + Math.sin(t * 0.53 + 0.7) * 0.35;
      return w * 11 * Math.pow(h, 1.5) * gust;
    }
    const flutter = (seed, t) => windAmt(t) * 2 * Math.sin(t * 2.4 + seed);
  
    // ================= stems and leaves =================
    // Each stem runs from below the bottom edge of the screen up to its flower. Returns growth of the visible curve part (0..1).
    function drawStem(g, st, t, fl = 0) {
      const p = easeInOut((t - st.start) / st.dur);
      if (p <= 0) return 0;
      // below the base each stem carries on along its own line, past the bottom edge of the screen,
      // so the stems enter from off-screen and fan up into the bouquet
      // all stems aim at one meeting point below the screen, so they converge but never cross
      const ext = Math.max(60, BOTTOM + 30);
      const meetY = Math.max(ext * 1.5, 320);
      const footX = st.bx * (1 - ext / meetY);
      const curveLen = Math.hypot(st.x - st.bx, st.y) * 1.05;
      const e = ext / (ext + curveLen);
      const pts = [];
      const extP = clamp(p / e);
      const ne = 6;
      for (let k = 0; k <= ne; k++) {
        const u = (k / ne) * extP;
        pts.push([lerp(footX, st.bx, u), lerp(ext, 0, u)]);
      }
      const q = e >= 1 ? 0 : clamp((p - e) / (1 - e));
      if (q > 0) {
        const n = Math.max(2, Math.ceil(30 * q));
        for (let k = 1; k <= n; k++) {
          const u = (k / n) * q;
          const [x, y] = stemPoint(st, u);
          pts.push([x + swayX(y, t) + fl * u * u, y]);
        }
      }
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.lineCap = "round";
      g.lineJoin = "round";
      const th = st.thick || 1;
      // rounded tube: dark shadow edge, mid green body, yellow-green highlight on the lit side
      g.strokeStyle = "#123a14";
      g.lineWidth = 13 * th;
      g.stroke();
      g.strokeStyle = "#2c7428";
      g.lineWidth = 9 * th;
      g.stroke();
      g.save();
      g.translate(-2.4 * th, 0);
      g.strokeStyle = "rgba(112,176,72,0.8)";
      g.lineWidth = 2.8 * th;
      g.stroke();
      g.restore();
      return q;
    }
  
    function drawLeafAt(g, x, y, ang, L, w, b) {
      if (L < 1) return;
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(L * 0.25, -w, L * 0.68, -w * 0.62 + b * 0.55, L, b);
      g.bezierCurveTo(L * 0.68, w * 0.5 + b * 0.55, L * 0.25, w * 0.85, 0, 0);
      const gr = g.createLinearGradient(0, 0, L, 0);
      gr.addColorStop(0, "#143e16");
      gr.addColorStop(0.45, "#2f7a2c");
      gr.addColorStop(1, "#5a9c44");
      g.fillStyle = gr;
      g.fill();
      // darker edges
      g.strokeStyle = "#1e5e22";
      g.lineWidth = Math.max(1.5, w * 0.2);
      g.stroke();
      // light centre highlight
      g.beginPath();
      g.moveTo(L * 0.02, 0);
      g.quadraticCurveTo(L * 0.5, b * 0.3, L * 0.93, b * 0.92);
      g.strokeStyle = "rgba(10,38,12,0.92)"; // dark midrib, as in the reel
      g.lineWidth = Math.max(1.8, w * 0.2);
      g.stroke();
      g.restore();
    }
    function drawBaseLeaf(g, lf, t) {
      const p = easeOut((t - lf.start) / lf.dur);
      const rustle = windAmt(t) * 0.02 * Math.sin(t * 1.6 + lf.L);
      if (p > 0) drawLeafAt(g, lf.x + swayX(lf.y, t), lf.y, lf.ang + rustle, lf.L * p, lf.w * (0.5 + 0.5 * p), lf.bend * p);
    }
    function drawStemLeaves(g, st, t, stemP, fl = 0) {
      for (const lf of st.leaves) {
        if (stemP < lf.u) continue;
        const p = easeOut((stemP - lf.u) / 0.3 + Math.max(0, t - (st.start + st.dur)) * 2.5);
        const [x0, y] = stemPoint(st, lf.u);
        const x = x0 + swayX(y, t) + fl * lf.u * lf.u;
        const a = stemAngle(st, lf.u) + lf.side * lf.spread + windAmt(t) * 0.025 * Math.sin(t * 1.8 + lf.L);
        drawLeafAt(g, x, y, a, lf.L * p, lf.w * (0.5 + 0.5 * p), lf.side * lf.L * lf.droop * p);
      }
    }
    return {
      windAmt, swayX, flutter, drawStem, drawLeafAt, drawBaseLeaf, drawStemLeaves,
      setBottom(b) { BOTTOM = b; },
    };
  }

  T.kit = { TAU, clamp, lerp, smooth, easeOut, easeInOut, mulberry, add, mul, dot, cross, norm, mix3, LIGHT, mixHex, hexA, stemPoint, stemAngle, createGarden };
})(typeof window !== "undefined" ? window : globalThis);
