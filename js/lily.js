// Lily painter, in the same soft painted style as the peonies (js/peony.js) so the two sit
// together in one bouquet. An oriental lily: three narrow outer tepals, three broad inner ones
// over them, each with a pale margin, a deeper band down the middle and a scatter of freckles;
// a green throat; six stamens with rust anthers curving up out of it.
// (The lilies in js/world-lilies.js are Rebloom's 3D ones and are separate from these.)
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  const { TAU, clamp, lerp, smooth, mulberry } = T.kit;

  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  // edge: the pale margin   body: the petal colour   band: the deeper stripe down the middle
  // throat: the green-gold heart   speck: freckles (null = none)   shade: the shadow between petals
  const PAL = {
    stargazer: { edge: "#fde9f0", body: "#ee6a9c", band: "#c21f62", throat: "#cfdc86", speck: "#8a0f3e", shade: "#5a0a2c", anther: "#b0521c" },
    white:     { edge: "#ffffff", body: "#f8f3ea", band: "#e9e3cf", throat: "#b8cf78", speck: null,      shade: "#8a8468", anther: "#b0521c" },
    blush:     { edge: "#fff6f6", body: "#fbd3dc", band: "#f29bb4", throat: "#cfdc86", speck: "#c4567c", shade: "#8c3a54", anther: "#a84a1c" },
    peach:     { edge: "#fff1e2", body: "#f9bf9a", band: "#ee8a62", throat: "#dcd97e", speck: "#b0553a", shade: "#7c3a22", anther: "#8e3c14" },
  };
  Object.keys(PAL).forEach((k) => {
    const p = PAL[k];
    ["edge", "body", "band", "throat", "shade", "anther"].forEach((n) => { p[n] = rgb(p[n]); });
    if (p.speck) p.speck = rgb(p.speck);
  });

  const UP = -Math.PI / 2;
  const NP = 12;
  // half-width along a tepal: opens quickly from the base, widest a third of the way, fine point
  const shape = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85);

  // tilt: 0 faces the viewer, 1 is seen well from the side   lean: rotation of the whole head (radians)
  function makeLily(palKey, seed, o) {
    o = Object.assign({ tilt: 0.25, lean: 0 }, o || {});
    const pal = PAL[palKey] || PAL.stargazer;
    const rnd = mulberry(seed * 6007 + 5);
    const base = rnd() * TAU;
    const tepals = [];
    for (let i = 0; i < 6; i++) {
      const inner = i % 2 === 1;
      const ang = base + (i / 6) * TAU + (rnd() - 0.5) * 0.16;
      const specks = [];
      if (pal.speck) {
        const n = 14 + Math.floor(rnd() * 10);
        for (let s = 0; s < n; s++) specks.push([0.12 + Math.pow(rnd(), 1.5) * 0.5, (rnd() - 0.5) * 1.3, 0.007 + rnd() * 0.007]);
      }
      tepals.push({
        i, ang, inner,
        len: (inner ? 1 : 0.93) * (0.95 + rnd() * 0.1),
        wid: (inner ? 0.3 : 0.21) * (0.94 + rnd() * 0.12),
        bend: (rnd() - 0.5) * 0.2,
        ph: rnd() * TAU, f: 8 + rnd() * 5,
        tone: (rnd() - 0.5) * 0.12 - Math.cos(ang - 0.9) * 0.07, // lit from the upper left
        specks,
      });
    }
    // outer three first, inner three over them; within each trio the far side first
    tepals.sort((a, b) => (a.inner - b.inner) || (Math.sin(a.ang) - Math.sin(b.ang)));
    const stamens = [];
    for (let i = 0; i < 6; i++) stamens.push({ a: UP + (i - 2.5) * 0.34 + (rnd() - 0.5) * 0.12, l: 0.46 + rnd() * 0.12, curl: (rnd() - 0.5) * 0.5, turn: (rnd() - 0.5) * 1.2 });

    const sq = 1 - 0.34 * o.tilt;
    const xs = new Float32Array(NP + 1), cs = new Float32Array(NP + 1), ws = new Float32Array(NP + 1);

    // one tepal-shaped path, k of the full width (1 = the whole tepal, less = an inner band)
    function path(g, k, u0, u1) {
      const a = Math.round(u0 * NP), b = Math.round(u1 * NP);
      g.beginPath();
      g.moveTo(xs[a], cs[a]);
      for (let i = a + 1; i < b; i++) g.lineTo(xs[i], cs[i] - ws[i] * k);
      g.lineTo(xs[b], cs[b]);
      for (let i = b - 1; i > a; i--) g.lineTo(xs[i], cs[i] + ws[i] * k);
      g.closePath();
    }

    // Draw at the origin. R: tepal length when fully open.  open: 0 (closed bud) .. 1 (full bloom).
    // punch: 0 for soft painted shading, 1 for the deeper shadows the text-character look needs.
    function draw(g, R, open, punch) {
      open = clamp(open);
      punch = punch || 0;
      g.save();
      g.rotate(o.lean);
      g.scale(1, sq);
      g.lineJoin = "round";
      g.lineCap = "round";

      for (const p of tepals) {
        const ok = smooth(clamp((open - (p.inner ? 0.1 : 0)) / 0.9)); // the outer three part first
        const L = R * p.len * lerp(0.46, 1, ok);
        const W = R * p.wid * lerp(0.42, 1, ok);
        // closed, the six tepals stand together pointing up; opening, each swings out to its place
        const a0 = UP + ((p.i - 2.5) / 2.5) * 0.2;
        let d = (p.ang - a0) % TAU;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        const ang = a0 + d * ok;
        for (let i = 0; i <= NP; i++) {
          const u = i / NP;
          xs[i] = L * u;
          cs[i] = p.bend * L * u * u * ok;
          ws[i] = W * shape(u) * (1 + 0.07 * ok * Math.sin(u * p.f + p.ph));
        }
        g.save();
        g.rotate(ang);

        // pale margin, with a soft dark edge beneath to lift it off the tepal behind
        path(g, 1, 0, 1);
        g.strokeStyle = css(mix(pal.shade, BLACK, 0.3 + 0.5 * punch), 0.3 + 0.55 * punch);
        g.lineWidth = R * (0.026 + 0.03 * punch);
        g.stroke();
        const t = p.tone;
        const tint = (c) => (t > 0 ? mix(c, WHITE, t) : mix(c, pal.shade, -t * 0.8));
        const bud = 1 - ok; // closed buds are greener
        const throat = mix(pal.throat, BLACK, 0.45 * punch);
        const edge = tint(mix(pal.edge, pal.throat, bud * 0.35));
        const body = tint(mix(pal.body, pal.shade, 0.22 * punch));
        let gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, css(throat));
        gr.addColorStop(0.2, css(mix(throat, edge, 0.7)));
        gr.addColorStop(0.5, css(edge));
        gr.addColorStop(1, css(mix(edge, body, 0.25)));
        g.fillStyle = gr;
        g.fill();

        // the coloured body, leaving the margin pale
        path(g, 0.78, 0, 1);
        gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, css(throat, 0));
        gr.addColorStop(0.16, css(body, 0.55));
        gr.addColorStop(0.5, css(body, 0.95));
        gr.addColorStop(0.9, css(body, 0.8));
        gr.addColorStop(1, css(body, 0.35));
        g.fillStyle = gr;
        g.fill();

        // the deeper band down the middle, fading toward the tip
        path(g, 0.34, 0, 1);
        const band = mix(pal.band, pal.shade, 0.3 * punch);
        gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, css(band, 0));
        gr.addColorStop(0.14, css(band, 0.85));
        gr.addColorStop(0.6, css(band, 0.6));
        gr.addColorStop(0.95, css(band, 0));
        g.fillStyle = gr;
        g.fill();

        // midrib
        g.beginPath();
        g.moveTo(xs[1], cs[1]);
        for (let i = 2; i < NP; i++) g.lineTo(xs[i], cs[i]);
        g.strokeStyle = css(mix(pal.band, pal.shade, 0.45), 0.5 + 0.3 * punch);
        g.lineWidth = R * 0.011;
        g.stroke();

        // freckles on the inner half
        if (p.specks.length && ok > 0.55) {
          g.fillStyle = css(pal.speck, (ok - 0.55) / 0.45 * 0.85);
          for (const [u, v, r] of p.specks) {
            const w = W * shape(u) * 0.62;
            g.beginPath();
            g.arc(L * u, p.bend * L * u * u * ok + v * w, r * R, 0, TAU);
            g.fill();
          }
        }
        g.restore();
      }

      // the green throat glows through where the tepals meet
      const show = smooth((open - 0.45) / 0.4);
      if (show > 0) {
        g.globalAlpha = show;
        const tg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
        tg.addColorStop(0, css(mix(pal.throat, BLACK, 0.1 + 0.3 * punch), 0.95));
        tg.addColorStop(1, css(pal.throat, 0));
        g.fillStyle = tg;
        g.beginPath();
        g.arc(0, 0, R * 0.2, 0, TAU);
        g.fill();

        // six filaments curving up and out, each tipped with a rust anther; a longer pistil between
        for (const s of stamens) {
          const len = s.l * R * show, ex = Math.cos(s.a) * len, ey = Math.sin(s.a) * len;
          const mx = ex * 0.5 - Math.sin(s.a) * len * 0.16 * s.curl, my = ey * 0.5 + Math.cos(s.a) * len * 0.16 * s.curl;
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(mx, my, ex, ey);
          g.strokeStyle = "#dfe9b0";
          g.lineWidth = R * 0.013;
          g.stroke();
          g.save();
          g.translate(ex, ey);
          g.rotate(s.a + Math.PI / 2 + s.turn);
          g.beginPath();
          g.ellipse(0, 0, R * 0.062, R * 0.022, 0, 0, TAU);
          g.fillStyle = css(pal.anther);
          g.fill();
          g.strokeStyle = css(mix(pal.anther, BLACK, 0.45), 0.8);
          g.lineWidth = R * 0.007;
          g.stroke();
          g.restore();
        }
        const pl = 0.64 * R * show;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(R * 0.05, -pl * 0.5, R * 0.02, -pl);
        g.strokeStyle = "#cfe09a";
        g.lineWidth = R * 0.02;
        g.stroke();
        g.fillStyle = "#8fa84e";
        g.beginPath();
        g.arc(R * 0.02, -pl, R * 0.03, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
      }
      g.restore();
    }

    // A closed bud: a long teardrop, green at the stalk and taking the flower's colour toward its tip.
    // Drawn from the origin pointing up; L is its length.
    function drawBud(g, L, punch) {
      if (L < 1) return;
      punch = punch || 0;
      const w = L * 0.17;
      g.save();
      g.rotate(o.lean);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-w * 1.5, -L * 0.3, -w * 1.1, -L * 0.82, 0, -L);
      g.bezierCurveTo(w * 1.1, -L * 0.82, w * 1.5, -L * 0.3, 0, 0);
      const gr = g.createLinearGradient(0, 0, 0, -L);
      gr.addColorStop(0, "#3d7a3a");
      gr.addColorStop(0.45, css(mix(pal.throat, pal.body, 0.35)));
      gr.addColorStop(1, css(mix(pal.body, pal.edge, 0.3)));
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = css(mix(pal.shade, BLACK, 0.3), 0.35 + 0.4 * punch);
      g.lineWidth = Math.max(1, L * 0.02);
      g.stroke();
      g.beginPath(); // the seams where it will part
      g.moveTo(0, -L * 0.08);
      g.quadraticCurveTo(-w * 0.5, -L * 0.5, 0, -L * 0.97);
      g.moveTo(0, -L * 0.08);
      g.quadraticCurveTo(w * 0.55, -L * 0.5, 0, -L * 0.97);
      g.strokeStyle = css(pal.shade, 0.3 + 0.3 * punch);
      g.lineWidth = Math.max(0.8, L * 0.012);
      g.stroke();
      g.restore();
    }

    return { draw, drawBud, pal, tilt: o.tilt, lean: o.lean };
  }

  T.lily = { PAL, make: makeLily };
})(typeof window !== "undefined" ? window : globalThis);
