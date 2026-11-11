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

  // The wrap the bouquet is tied in: sheets of paper gathered at a binding point and held with a
  // ribbon bow, like flowers handed to someone. Drawn in two parts so the flowers sit inside it:
  // the back sheets first, then (after the stems) the front sheet, the cut stem ends and the bow.
  // World units: the stems gather at (0,0); the bow is tied at TIE, the stem ends rest on the table.
  const TIE = 176, TABLE = 306;
  // paper: the sheet   shade: its darker side   line: edges and creases   ribbon / knot: the bow
  const WRAPS = {
    ivory:    { paper: "#fdf6e6", shade: "#e6d6b8", line: "#b49c72", back: "#f3e6cc", ribbon: "#dd8fa4", knot: "#b25f7a" },
    blush:    { paper: "#fbdde3", shade: "#eab4c2", line: "#c07f93", back: "#f4c9d3", ribbon: "#b5476b", knot: "#86294a" },
    kraft:    { paper: "#d6b68a", shade: "#b59164", line: "#806038", back: "#c4a172", ribbon: "#fbf3e2", knot: "#cdbd9c" },
    midnight: { paper: "#2c3966", shade: "#1a2444", line: "#0c1430", back: "#222d54", ribbon: "#e6bd62", knot: "#ac8530" },
  };
  function sheet(g, pts) { // a sheet of paper as straight-edged folds
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
  // grow a part out of the binding point as the bouquet arrives (k: 0 = not there yet, 1 = full size)
  function fromTie(g, k) { g.translate(0, TIE); g.scale(0.25 + 0.75 * k, k); g.translate(0, -TIE); g.globalAlpha = Math.min(1, k * 2.2); }
  const wrap = {
    // the sheets behind the flowers: their pleated corners show at the sides and between the blooms
    back(g, name, k) {
      if (k <= 0) return;
      const w = WRAPS[name] || WRAPS.ivory;
      g.save();
      fromTie(g, k);
      g.lineJoin = "round";
      sheet(g, [[-34, TIE], [-330, -150], [-474, -392], [-388, -470], [-420, -640], [-250, -610], [-150, -760], [0, -640], [150, -760], [250, -610], [420, -640], [388, -470], [474, -392], [330, -150], [34, TIE]]);
      const gr = g.createLinearGradient(-474, 0, 474, 0); // lit from the left
      gr.addColorStop(0, w.paper);
      gr.addColorStop(0.5, w.back);
      gr.addColorStop(1, w.shade);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = hexA(w.line, 0.55);
      g.lineWidth = 3;
      g.stroke();
      g.beginPath(); // pleats fanning up from the binding
      for (const [x, y] of [[-388, -470], [-250, -610], [0, -640], [250, -610], [388, -470]]) { g.moveTo(x * 0.12, TIE - 60); g.lineTo(x, y); }
      g.strokeStyle = hexA(w.line, 0.22);
      g.lineWidth = 2.5;
      g.stroke();
      g.restore();
    },
    // the front sheet folded across the stems, the cut stem ends below it, and the bow
    front(g, name, k) {
      if (k <= 0) return;
      const w = WRAPS[name] || WRAPS.ivory;
      g.save();
      fromTie(g, k);
      g.lineJoin = "round";
      g.lineCap = "round";

      // cut stem ends, fanning a little below the binding
      for (let i = 0; i < 9; i++) {
        const u = i / 8 - 0.5, x0 = u * 58, x1 = u * 108 + (i % 2 ? 7 : -7), th = 9 + (i % 3) * 2.5;
        g.beginPath();
        g.moveTo(x0, TIE - 8);
        g.lineTo(x1, TABLE - 4);
        g.strokeStyle = "#123a14"; g.lineWidth = th + 4; g.stroke();
        g.strokeStyle = "#2c7428"; g.lineWidth = th; g.stroke();
        g.strokeStyle = "rgba(112,176,72,0.7)"; g.lineWidth = th * 0.28;
        g.beginPath(); g.moveTo(x0 - th * 0.2, TIE - 8); g.lineTo(x1 - th * 0.2, TABLE - 5); g.stroke();
        g.beginPath(); // the pale cut end
        g.ellipse(x1, TABLE - 3, th * 0.62, th * 0.26, 0, 0, TAU);
        g.fillStyle = "#b9d38a";
        g.fill();
      }

      // the right fold, then the left fold over it
      sheet(g, [[-30, TIE + 6], [56, TIE - 2], [338, -176], [176, -112], [0, -6]]);
      let gr = g.createLinearGradient(0, 0, 338, 0);
      gr.addColorStop(0, w.back);
      gr.addColorStop(1, w.shade);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = hexA(w.line, 0.6);
      g.lineWidth = 3;
      g.stroke();
      sheet(g, [[-56, TIE - 2], [-338, -176], [-176, -112], [0, -6], [34, TIE + 6]]);
      gr = g.createLinearGradient(-338, 0, 40, 0);
      gr.addColorStop(0, w.paper);
      gr.addColorStop(0.7, w.paper);
      gr.addColorStop(1, w.back);
      g.fillStyle = gr;
      g.fill();
      g.stroke();
      g.beginPath(); // soft creases toward the binding
      g.moveTo(-176, -112); g.lineTo(-22, TIE - 30);
      g.moveTo(-262, -146); g.lineTo(-40, TIE - 22);
      g.moveTo(176, -112); g.lineTo(34, TIE - 30);
      g.moveTo(262, -146); g.lineTo(46, TIE - 22);
      g.strokeStyle = hexA(w.line, 0.22);
      g.lineWidth = 2.5;
      g.stroke();

      // the bow: two tails, the band around the stems, two loops and the knot
      const tail = (dir) => {
        g.beginPath();
        g.moveTo(dir * 6, TIE);
        g.bezierCurveTo(dir * 40, TIE + 40, dir * 64, TIE + 78, dir * 96, TIE + 118);
        g.lineTo(dir * 104, TIE + 92);
        g.lineTo(dir * 126, TIE + 100);
        g.bezierCurveTo(dir * 92, TIE + 56, dir * 62, TIE + 22, dir * 26, TIE - 8);
        g.closePath();
        g.fillStyle = dir < 0 ? w.ribbon : w.knot;
        g.fill();
        g.strokeStyle = hexA(w.knot, 0.7);
        g.lineWidth = 2;
        g.stroke();
      };
      tail(-1); tail(1);
      g.beginPath(); // the band
      g.moveTo(-58, TIE - 18);
      g.quadraticCurveTo(0, TIE - 6, 58, TIE - 18);
      g.lineTo(54, TIE + 14);
      g.quadraticCurveTo(0, TIE + 26, -54, TIE + 14);
      g.closePath();
      g.fillStyle = w.ribbon;
      g.fill();
      g.strokeStyle = hexA(w.knot, 0.7);
      g.stroke();
      const loop = (dir) => {
        g.beginPath();
        g.moveTo(0, TIE);
        g.bezierCurveTo(dir * 40, TIE - 78, dir * 142, TIE - 70, dir * 132, TIE - 6);
        g.bezierCurveTo(dir * 124, TIE + 40, dir * 44, TIE + 30, 0, TIE);
        g.closePath();
        const lg = g.createLinearGradient(0, TIE - 60, 0, TIE + 34);
        lg.addColorStop(0, w.ribbon);
        lg.addColorStop(1, w.knot);
        g.fillStyle = lg;
        g.fill();
        g.strokeStyle = hexA(w.knot, 0.75);
        g.stroke();
        g.beginPath(); // the hollow of the loop
        g.moveTo(dir * 18, TIE - 2);
        g.bezierCurveTo(dir * 52, TIE - 40, dir * 104, TIE - 38, dir * 104, TIE - 6);
        g.bezierCurveTo(dir * 98, TIE + 14, dir * 50, TIE + 12, dir * 18, TIE - 2);
        g.fillStyle = hexA(w.knot, 0.5);
        g.fill();
      };
      loop(-1); loop(1);
      g.beginPath(); // the knot
      g.ellipse(0, TIE, 21, 25, 0, 0, TAU);
      g.fillStyle = w.ribbon;
      g.fill();
      g.strokeStyle = hexA(w.knot, 0.85);
      g.stroke();
      g.restore();
    },
  };
  // every bouquet shares one stage: this wide, a table at this height, room below it for the letter;
  // the stems end inside the wrap
  const STAGE = { w: 960, bottom: TABLE + 250, table: TABLE, stemDepth: 100 };

  T.kit = { WRAPS, STAGE, wrap, TAU, clamp, lerp, smooth, easeOut, easeInOut, mulberry, add, mul, dot, cross, norm, mix3, LIGHT, mixHex, hexA, stemPoint, stemAngle, createGarden };
})(typeof window !== "undefined" ? window : globalThis);
