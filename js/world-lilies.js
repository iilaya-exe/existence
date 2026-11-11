// The lily bouquet from Rebloom: thirteen 3D lilies and two buds that grow from the bottom
// of their paper wrap, open, then sway in a soft breeze. Drawn in world units onto a 2D canvas;
// js/scene.js shows that painted, or turns it into embroidered text characters.
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  T.worlds = T.worlds || {};

  T.worlds.lilies = function createLilies() {
    const { TAU, clamp, lerp, smooth, easeOut, easeInOut, mulberry, add, mul, dot, cross, norm, mix3, LIGHT, mixHex, hexA, stemPoint, stemAngle } = T.kit;
    const garden = T.kit.createGarden(2.9);
    const { windAmt, swayX, flutter, drawStem, drawBaseLeaf, drawStemLeaves } = garden;

  // ================= timeline (seconds), matched to the video =================
  const GROW_END = 3.3;   // everything open by here
  const LOOP = 11.0;      // replay after holding the finished bouquet
  const FADE = 0.45;

  // ================= palettes =================
  // c: throat, body, tip   an: anther   fk: freckles (null = none)   rays: brown rays from the throat
  const PAL = {
    red:     { c: ["#600812", "#d81e26", "#ff6a5c"], an: "#f6c838", fk: "#4a0208", rays: false },
    cream:   { c: ["#a2a868", "#efe4d0", "#fff8ec"], an: "#a8541a", fk: "#8a6a50", rays: false },
    peach:   { c: ["#5a2a14", "#dcc0a0", "#f2e2cc"], an: "#9c4a14", fk: "#8a4a20", rays: true },
    magenta: { c: ["#f4cdea", "#d43cbc", "#e478d4"], an: "#f2b44a", fk: "#4e0646", rays: false },
    yellow:  { c: ["#a06c1c", "#dcc054", "#f2e4a2"], an: "#b45c14", fk: null, rays: false },
    tan:     { c: ["#6e3622", "#c48e6e", "#eed0b8"], an: "#8e3c14", fk: "#4e2012", rays: true },
    plum:    { c: ["#3e1430", "#8e4a7a", "#bc80a8"], an: "#f4c440", fk: "#3a0626", rays: false, longStamens: true },
    oxblood: { c: ["#2e0608", "#74141a", "#9e3a34"], an: "#ffd83c", fk: "#2a0206", rays: false, longStamens: true },
    maroon:  { c: ["#2e5e22", "#7a0e1c", "#a8222c"], an: "#e0a020", fk: null, rays: false },
    budgreen:{ c: ["#2a6a26", "#4caa40", "#8ad870"], an: "#e0a020", fk: null, rays: false },
  };

  // ================= layout traced from the video =================
  // World units: stems gather at (0,0); up is negative y. Each lily sits at the tip of its stem.
  // x, y, petal length, palette, final facing direction [x,y,z], spin, opening order.
  // Listed back to front: top peach, upper-left white, yellows and plum, then white and pink, then red and the front peach.
  const LILY_DEFS = [
    [   19, -1000, 170, "tan",     [ 0.00, -0.55, 0.83], 0.35, 4],
    [ -186,  -894, 175, "cream",   [-0.42, -0.42, 0.80], 0.10, 6],
    [  206,  -900, 175, "yellow",  [ 0.45, -0.40, 0.80], 0.55, 8],
    [ -274,  -820, 100, "yellow",  [-0.88, -0.30, 0.37], 0.20, 9],
    [  289,  -810, 100, "tan",     [ 0.88, -0.30, 0.37], 0.80, 10],
    [ -258,  -680, 210, "yellow",  [-0.74, -0.05, 0.67], 0.45, 7],
    [  250,  -662, 215, "plum",    [ 0.80, -0.20, 0.56], 0.15, 5],
    [ -276,  -335, 192, "yellow",  [-0.76,  0.10, 0.64], 0.60, 11],
    [  271,  -300, 168, "oxblood", [ 0.75,  0.20, 0.63], 0.30, 12],
    [  140,  -505, 265, "cream",   [ 0.20, -0.10, 0.97], 0.25, 2],
    [ -146,  -535, 250, "magenta", [-0.22, -0.15, 0.96], 0.70, 1],
    [  -21,  -800, 250, "red",     [ 0.00, -0.30, 0.95], 0.52, 0],
    [    0,  -325, 245, "peach",   [ 0.00,  0.05, 1.00], 0.05, 3],
  ];
  // closed buds that stay closed at the top: a green one and a maroon teardrop
  const STAY_BUDS = [
    [ -52, -1028, 70, "budgreen"],
    [ 104, -1036, 80, "maroon"],
  ];

  const R = mulberry(54440);

  function makeStem(x, y) {
    const bx = clamp(x * 0.26, -80, 80) + (R() - 0.5) * 24;
    return {
      bx, by: 0,
      cx: bx + (x - bx) * 0.42 + (R() - 0.5) * 24, cy: y * 0.5,
      x, y,
      start: R() * 0.15, dur: 0.8 + R() * 0.2,
      leaves: [],
    };
  }
  // long narrow arching leaves along each stem, plus one high up that fills the gaps between flowers
  function addStemLeaves(st, n, high) {
    for (let k = 0; k < n; k++) {
      const u = 0.2 + (k / n) * 0.42 + R() * 0.08;
      const side = (k + (st.x > 0 ? 1 : 0)) % 2 ? 1 : -1;
      st.leaves.push({ u: u * 0.8, side, L: 120 + R() * 60, w: 13 + R() * 4, spread: 0.45 + R() * 0.4, droop: 0.3 });
    }
    if (high) {
      const side = st.x > 0 ? 1 : -1;
      st.leaves.push({ u: 0.66 + R() * 0.16, side: R() < 0.5 ? side : -side, L: 140 + R() * 70, w: 19 + R() * 5, spread: 0.5 + R() * 0.5, droop: 0.22 });
    }
  }

  const lilies = LILY_DEFS.map(([x, y, s, key, axis, spin, order]) => {
    const st = makeStem(x, y);
    addStemLeaves(st, 0, false);
    const reach = st.start + st.dur;
    return {
      x, y, s, p: PAL[key], st, axis: norm(axis), spin: spin * TAU,
      budStart: reach - 0.1,
      bloomStart: 1.4 + order * 0.03 + R() * 0.08,
      bloomDur: 1.35 + R() * 0.2,
      seed: 1000 + order * 97,
    };
  });
  const stayBuds = STAY_BUDS.map(([x, y, s, key]) => {
    const st = makeStem(x, y);
    addStemLeaves(st, 0, false);
    return { x, y, s, p: PAL[key], st, spin: R() * TAU, budStart: st.start + st.dur - 0.15, seed: 7 };
  });

  // extra stems in the bundle that disappear behind the front flowers
  const bundle = [];
  for (let i = 0; i < 0; i++) {
    const x = (i / 3 - 0.5) * 300 + (R() - 0.5) * 30;
    bundle.push(makeStem(x, -300 - R() * 120));
  }
  // every stem gets its own foot, spread evenly across the base in the order of where it ends up,
  // so the stems are already separate at the bottom instead of rising as one trunk
  {
    const all = [...lilies.map((f) => f.st), ...stayBuds.map((f) => f.st), ...bundle];
    all.sort((a, b) => a.x - b.x);
    // a fan: feet sit close together at a narrow base, each stem runs almost straight to its flower
    // (so outer stems lean 20-35 degrees outward), with its own small bow; a few neighbours swap feet so they cross
    const n = all.length;
    const feet = all.map((_, i) => lerp(-72, 72, i / (n - 1)));
    for (let i = 1; i < n - 1; i += 4) [feet[i], feet[i + 1]] = [feet[i + 1], feet[i]];
    all.forEach((st, i) => {
      st.bx = feet[i] + (R() - 0.5) * 6;
      st.thick = 0.55 + R() * 0.5;
      st.extK = 0.55 + R() * 0.45;
      const bow = (R() - 0.5) * 50 + Math.sign(st.x) * 12;
      st.cx = lerp(st.bx, st.x, 0.45) + bow;
      st.cy = st.y * 0.45;
    });
    all[Math.floor(n * 0.2)].thick = 1.35;
    all[Math.floor(n * 0.62)].thick = 1.3;
  }
  // six lance-shaped leaves, low on the bundle and deliberately asymmetric (traced from the video):
  // a long nearly-horizontal one far left, two rising up-left between flowers, drooping ones on the right.
  // x, y, direction (radians, 0 = right, PI = left, y down), length, half-width, droop
  const BASE_LEAF_DEFS = [
    [ -40,  -45, Math.PI - 0.06, 330, 26, 0.1],
    [ -60, -130, Math.PI + 0.08, 250, 26, 0.14],
    [ -70, -210, Math.PI + 0.6, 215, 22, 0.08],
    [ -20,   20, Math.PI - 0.32, 230, 22, 0.16],
    [ -45,  -95, Math.PI + 0.32, 200, 22, 0.1],
    [ -35, -170, Math.PI - 0.2, 180, 20, 0.14],
    [  45,  -55, 0.05, 260, 26, 0.13],
    [  65, -140, -0.06, 240, 26, 0.16],
    [  25,   15, 0.3, 220, 22, 0.18],
    [  55, -100, -0.38, 200, 22, 0.1],
    [  70, -205, -0.62, 190, 20, 0.08],
    [  35, -175, 0.22, 170, 20, 0.15],
  ];
  // Rebloom drew these low and drooping around bare stems. Here the stems are wrapped in paper,
  // so each leaf starts above the paper's edge and reaches outward and up, keeping the wrap in view.
  const liftLeaf = ([x, y, ang, L, w, droop]) => {
    const left = Math.cos(ang) < 0, off = left ? ang - Math.PI : ang; // tilt from level: negative is upward
    const up = -(0.1 + Math.abs(off) * 0.55);
    return [x, y - 130, left ? Math.PI - up : up, L, w, droop * 0.6];
  };
  const baseLeaves = BASE_LEAF_DEFS.map(liftLeaf).map(([x, y, ang, L, w, droop], i) => ({
    x, y, ang, L, w,
    bend: (Math.cos(ang) > 0 ? 1 : -1) * L * droop,
    start: 0.35 + i * 0.06 + R() * 0.1, dur: 0.65,
  }));

  // ================= 3D lily =================
  // Six tepals (3 narrower outer, 3 wider inner) around a facing axis.
  // "open" goes 0 (closed bud) -> 1 (fully open, tips curled back).
  function frame3(A, spin) {
    // reference direction blends smoothly (a hard switch here made petals twist and relight in one frame)
    const ref = norm(mix3([0, 0, 1], [0, -1, 0], smooth((Math.abs(A[2]) - 0.75) / 0.22)));
    const U = norm(cross(A, ref));
    const V = cross(A, U);
    const c = Math.cos(spin), s = Math.sin(spin);
    return [add(mul(U, c), mul(V, s)), add(mul(U, -s), mul(V, c))];
  }

  // rotate v by the smallest rotation that turns direction `from` into `to` (smooth as `to` moves; no twisting)
  function rotTo(v, from, to) {
    const k0 = cross(from, to), sn = Math.hypot(k0[0], k0[1], k0[2]), cs = dot(from, to);
    if (sn < 1e-6) return v;
    const k = mul(k0, 1 / sn);
    return add(add(mul(v, cs), mul(cross(k, v), sn)), mul(k, dot(k, v) * (1 - cs)));
  }

  const PN = 16;           // samples along a tepal
  const BANDS = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]; // across a tepal, for folded shading

  function buildPetal(A, U, V, phi, L, hwMax, thB, thT, cup, twist, fold) {
    const Rd = add(mul(U, Math.cos(phi)), mul(V, Math.sin(phi)));
    const T = add(mul(U, -Math.sin(phi)), mul(V, Math.cos(phi)));
    const ctr = [], hws = [], nrm = [];
    let p = [0, 0, 0];
    for (let i = 0; i <= PN; i++) {
      const u = i / PN;
      const th = lerp(thB, thT, Math.pow(u, 1.45)); // flatter near the base, curling hard toward the tip
      const d = add(mul(A, Math.cos(th)), mul(Rd, Math.sin(th)));
      const n = add(mul(A, Math.sin(th)), mul(Rd, -Math.cos(th))); // inner face
      // lance shape: narrow base, widest about 40% along, fine point
      const m = 0.38; // widest point, then the edges converge to a V tip
      const hw = hwMax * ((u < m ? Math.pow(Math.sin((Math.PI / 2) * (u / m)), 0.8) : Math.pow((1 - u) / (1 - m), 0.8)) + 0.14 * (1 - u));
      // tip bends a little sideways
      ctr.push(add(p, mul(T, twist * L * u * u * u)));
      hws.push(hw);
      nrm.push(n);
      p = add(p, mul(d, L / PN));
    }
    // surface point: v in [-1,1] across the width; edges lift toward the inner face (cupped)
    const at = (i, v) => add(add(ctr[i], mul(T, hws[i] * v)), mul(nrm[i], (cup * v * v + fold * Math.abs(v)) * hws[i]));
    let z = 0;
    for (const q of ctr) z += q[2];
    return { ctr, hws, nrm, T, at, cup, fold, z: z / ctr.length, nMid: nrm[Math.round(PN * 0.45)] };
  }

  function drawPetal3(g, fx, fy, pt, pal, seed, budMix) {
    // budMix: 1 = closed-bud colouring, 0 = open-flower colouring; everything below blends on it, nothing switches
    const P = (q) => [fx + q[0], fy + q[1]];
    const outline = () => {
      g.beginPath();
      for (let i = 0; i <= PN; i++) { const [x, y] = P(pt.at(i, 1)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (let i = PN; i >= 0; i--) { const [x, y] = P(pt.at(i, -1)); g.lineTo(x, y); }
      g.closePath();
    };
    const [throat, body, tip] = pal.c;
    const a = P(pt.ctr[0]), b = P(pt.ctr[PN]);
    const gr = g.createLinearGradient(a[0], a[1], b[0] + 0.01, b[1] + 0.01);
    gr.addColorStop(0, mixHex(throat, "#3e8a32", budMix));
    gr.addColorStop(lerp(0.32, 0.25, budMix), mixHex(body, throat, budMix));
    gr.addColorStop(0.75, body);
    gr.addColorStop(1, tip);

    // how much of the inner (front) face is turned toward us: eases from 0 to 1 as a tepal turns, instead of flipping
    const frontness = smooth((pt.nMid[2] + 0.22) / 0.44);
    const front = frontness >= 0.5;
    const openDetail = 1 - budMix;

    // fill in bands across the width; each band is lit by its own (cupped) normal
    for (let j = 0; j < BANDS.length - 1; j++) {
      const v0 = BANDS[j], v1 = BANDS[j + 1], vm = (v0 + v1) / 2;
      g.beginPath();
      for (let i = 0; i <= PN; i++) { const [x, y] = P(pt.at(i, v0)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      for (let i = PN; i >= 0; i--) { const [x, y] = P(pt.at(i, v1)); g.lineTo(x, y); }
      g.closePath();
      g.fillStyle = gr;
      g.fill();
      // each half of the folded tepal faces a different way, so one side catches the light and the other falls into shade
      const nb = norm(add(pt.nMid, mul(pt.T, -(2 * pt.cup * vm + pt.fold * Math.sign(vm)))));
      const litFront = 0.55 + 0.68 * Math.max(0, dot(nb, LIGHT));
      const litBack = (0.55 + 0.68 * Math.max(0, -dot(nb, LIGHT))) * 0.8;
      const lam = lerp(litBack, litFront, frontness) * pt.tone;
      const dark = clamp(1 - lam + Math.abs(vm) * 0.07, 0, 0.62);
      if (dark > 0.01) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fill(); }
      else if (lam > 1.02) { g.fillStyle = `rgba(255,248,240,${clamp((lam - 1) * 0.45, 0, 0.16)})`; g.fill(); }
      g.lineWidth = 0.8;
      g.strokeStyle = gr;
      g.stroke(); // seal hairline seams between bands
    }

    g.save();
    outline();
    g.clip();
    const n = PN;
    // veins: lengthwise streaks that follow the tepal
    if (openDetail > 0.01) {
      g.lineWidth = 1.6;
      for (const [v, col, al0] of [[-0.7, throat, 0.2], [-0.45, tip, 0.1], [-0.22, throat, 0.18], [0.22, throat, 0.18], [0.45, tip, 0.1], [0.7, throat, 0.2]]) {
        const al = al0 * openDetail;
        g.globalAlpha = al;
        g.strokeStyle = col;
        g.beginPath();
        for (let i = 1; i <= n - 1; i++) { const [x, y] = P(pt.at(i, v * (1 - i / n * 0.6))); i > 1 ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    }
    // midrib
    // a clearly darker crease down the centre of each tepal (soft dark band, then a sharper dark line)
    const ribA = lerp(0.5, 1, frontness) * (0.35 + 0.65 * openDetail);
    g.strokeStyle = mixHex(throat, "#000000", 0.35);
    g.beginPath();
    for (let i = 0; i <= n * 0.9; i++) { const [x, y] = P(add(pt.ctr[i], mul(pt.nrm[i], 1.5))); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.globalAlpha = 0.26 * ribA;
    g.lineWidth = Math.max(3, pt.hws[6] * 0.28);
    g.stroke();
    g.globalAlpha = 0.78 * ribA;
    g.lineWidth = Math.max(1.8, pt.hws[6] * 0.11);
    g.stroke();
    // freckles on the inner third, and brown rays on peach/tan
    const markA = frontness * openDetail;
    if (markA > 0.01) {
      const r = mulberry(seed);
      if (pal.rays) {
        g.globalAlpha = 0.6 * markA;
        g.strokeStyle = pal.fk;
        g.lineWidth = 2.4;
        for (let k = 0; k < 7; k++) {
          const v = (k / 6 - 0.5) * 1.3;
          const e = Math.floor(n * (0.3 + r() * 0.14));
          const [x0, y0] = P(pt.ctr[1]);
          const [x1, y1] = P(pt.at(e, v));
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
      }
      if (pal.fk) {
        g.globalAlpha = 0.55 * markA;
        g.fillStyle = pal.fk;
        for (let k = 0; k < 9; k++) {
          const i = 1 + Math.floor(r() * n * 0.36);
          const [x, y] = P(pt.at(i, (r() - 0.5) * 1.5));
          g.beginPath();
          g.arc(x, y, 1.1 + r() * 1.1, 0, TAU);
          g.fill();
        }
      }
    }
    g.restore();

    // darker edge so overlapping tepals stay separate
    outline();
    g.globalAlpha = 0.14;
    g.strokeStyle = throat;
    g.lineWidth = 2;
    g.stroke();
    g.globalAlpha = 1;
  }

  // one lily at stem tip (fx,fy): A facing axis, L current tepal length, open 0..1, budShape 0 (round) .. 1 (teardrop)
  function drawLily3(g, fx, fy, A, spin, L, open, pal, seed, budShape = 0, Aref = A) {
    if (L < 2) return;
    // one fixed petal layout per flower (from its final pose), tilted smoothly onto the current facing direction
    const [Ur, Vr] = frame3(Aref, spin);
    const U = rotTo(Ur, Aref, A), V = rotTo(Vr, Aref, A);
    const o = open;
    const budMix = 1 - smooth((o - 0.04) / 0.42);
    const petals = [];
    for (let k = 0; k < 6; k++) {
      const inner = k % 2 === 1;
      const phi = (k * Math.PI) / 3;
      const thB = lerp(lerp(0.78, 0.5, budShape), inner ? 0.98 : 1.04, o);
      const thT = lerp(lerp(-0.5, -0.32, budShape), inner ? 2.45 : 2.6, Math.pow(o, 1.15));
      const hw = L * lerp(lerp(0.36, 0.3, budShape), inner ? 0.27 : 0.235, smooth(o));
      const cup = lerp(0.15, 0.1, o);
      const fold = lerp(0.05, 0.42, o);
      const twist = ((k * 53 + seed) % 7 - 3) / 3 * 0.07 * o;
      const pt = buildPetal(A, U, V, phi, (inner ? 0.97 : 1) * L * 1.03, hw, thB, thT, cup, twist, fold);
      pt.k = k;
      const Rr = add(mul(Ur, Math.cos(phi)), mul(Vr, Math.sin(phi)));
      pt.key = Rr[2] + (inner ? 0.12 : 0); // tepals pointing at the viewer go on top; inner ones sit over outer ones
      pt.tone = 0.84 + (((k * 71 + seed * 13) % 11) / 10) * 0.3; // each tepal a touch lighter or darker
      petals.push(pt);
    }
    petals.sort((a, b) => a.key - b.key);

    const sv = smooth((o - 0.45) / 0.5);
    const stamenZ = A[2] * L * 0.4;
    const drawCentre = () => {
      if (sv <= 0) return;
      // green-yellow glowing throat, about 18% of the flower
      const rT = L * 0.26;
      const th = g.createRadialGradient(fx, fy, 0, fx, fy, rT);
      const al = sv * clamp(A[2] + 0.3);
      th.addColorStop(0, `rgba(200,220,110,${0.75 * al})`);
      th.addColorStop(0.3, `rgba(160,180,70,${0.45 * al})`);
      th.addColorStop(1, "rgba(160,180,70,0)");
      g.fillStyle = th;
      g.beginPath();
      g.arc(fx, fy, rT, 0, TAU);
      g.fill();
      // six long filaments, each ending in an elongated anther
      g.lineCap = "round";
      for (let k = 0; k < 6; k++) {
        const phi = (k * Math.PI) / 3 + Math.PI / 6 + 0.08;
        const Rd = add(mul(U, Math.cos(phi)), mul(V, Math.sin(phi)));
        const side = Math.abs(A[2]) < 0.7 && !pal.longStamens ? 0.7 : 1; // keep side-on stamens from poking into empty sky
        const len = L * (0.6 + ((k * 37 + seed) % 10) / 50) * sv * side;
        const mid = add(mul(A, len * 0.55), mul(Rd, len * 0.14));
        const end = add(mul(A, len * 0.82), mul(Rd, len * 0.52));
        g.strokeStyle = "rgba(226,226,160,0.9)";
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(fx, fy);
        g.quadraticCurveTo(fx + mid[0], fy + mid[1], fx + end[0], fy + end[1]);
        g.stroke();
        g.fillStyle = pal.an;
        g.beginPath();
        g.ellipse(fx + end[0], fy + end[1], L * 0.05, L * 0.02, Math.atan2(end[1], end[0]) + Math.PI / 2, 0, TAU);
        g.fill();
      }
      // pistil
      const pe = add(mul(A, L * 0.74 * sv), mul(U, L * 0.08 * sv));
      g.strokeStyle = "rgba(200,214,140,0.75)";
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + pe[0], fy + pe[1]);
      g.stroke();
      g.fillStyle = "#a8ce66";
      g.beginPath();
      g.arc(fx + pe[0], fy + pe[1], L * 0.035, 0, TAU);
      g.fill();
    };

    let centreDone = false;
    for (const pt of petals) {
      if (!centreDone && pt.key > 0.5) { drawCentre(); centreDone = true; }
      drawPetal3(g, fx, fy, pt, pal, seed + pt.k, budMix);
    }
    if (!centreDone) drawCentre();
  }

  function budAxis(st) {
    const a = stemAngle(st, 1);
    return norm([Math.cos(a), Math.sin(a), 0.22]);
  }

  function drawLily(g, f, t) {
    const budP = easeOut((t - f.budStart) / 0.6);
    if (budP <= 0) return;
    const b = clamp((t - f.bloomStart) / f.bloomDur);
    const o = smooth(b / 0.75);
    // bud swells, then the flower keeps growing to full size after it has opened
    const L = f.s * lerp(0.5 * budP, 1, easeInOut(b));
    const A0 = norm(mix3(budAxis(f.st), f.axis, smooth((b - 0.1) / 0.8)));
    // sway: the head rides on the stem tip and nods slightly with the gust
    const dx = swayX(f.y, t) + flutter(f.seed, t);
    const A = norm([A0[0] + dx * 0.004, A0[1], A0[2]]);
    drawLily3(g, f.x + dx, f.y, A, f.spin, L, o, f.p, f.seed, 0, f.axis);
  }

  let wrapName = "ivory"; // which paper the bouquet is wrapped in
  function drawWorld(g, t) {
    const stemP = new Map();
    T.kit.wrap.back(g, wrapName, easeOut((t - 0.3) / 1.5));
    for (const st of bundle) drawStem(g, st, t, 0);
    for (const f of stayBuds) stemP.set(f, drawStem(g, f.st, t, flutter(f.seed, t)));
    for (const f of lilies) stemP.set(f, drawStem(g, f.st, t, flutter(f.seed, t)));
    T.kit.wrap.front(g, wrapName, easeOut(t / 0.9)); // the stems are gathered inside the wrap
    for (const lf of baseLeaves) drawBaseLeaf(g, lf, t);
    for (const f of stayBuds) drawStemLeaves(g, f.st, t, stemP.get(f), flutter(f.seed, t));
    for (const f of lilies) drawStemLeaves(g, f.st, t, stemP.get(f), flutter(f.seed, t));
    for (const f of stayBuds) {
      const bp = easeOut((t - f.budStart) / 0.75);
      const dx = swayX(f.y, t) + flutter(f.seed, t);
      if (bp > 0) drawLily3(g, f.x + dx, f.y, budAxis(f.st), f.spin, f.s * bp, 0.03, f.p, f.seed, 1);
    }
    for (const f of lilies) drawLily(g, f, t);
  }

    // the topmost bud ends near y = -1200; the stage (wrap, table) is shared with the other bouquets
    return { name: "lilies", GROW_END, LOOP, FADE, frame: Object.assign({ top: -1200 }, T.kit.STAGE), setBottom: garden.setBottom, setWrap(name) { wrapName = name; }, draw: drawWorld };
  };
})(typeof window !== "undefined" ? window : globalThis);
