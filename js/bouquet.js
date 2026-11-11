// Builds a painted bouquet world from a list of flowers, buds and leaves. Peonies and the
// painted lilies share it, so they can be arranged alone or together. Every bouquet is tied in
// the same paper wrap and grows, opens and sways on the same timeline as Rebloom's lily bouquet, so
// the scene engine can show any of them.
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  T.worlds = T.worlds || {};

  // spec.flowers: [kind, x, y, size, palette, tilt (0 faces you), lean (radians), opening order], back to front
  // spec.buds:    [kind, x, y, size, palette]
  // spec.leaves:  [x, y, direction (radians, 0 = right, y down), length]   peony leaves (three leaflets)
  // spec.blades:  [x, y, direction, length, half-width, droop]             lily leaves (long and narrow)
  // spec.top:     world y where the tallest bud ends (up is negative)
  T.bouquet = function (name, spec) {
    T.worlds[name] = function create() {
      const { clamp, lerp, smooth, easeOut, easeInOut, mulberry } = T.kit;
      const garden = T.kit.createGarden(2.9);
      const { windAmt, swayX, flutter, drawStem, drawBaseLeaf } = garden;
      const GROW_END = 3.3, LOOP = 11.0, FADE = 0.45;
      const R = mulberry(spec.seed || 90210);
      const make = { peony: T.peony.make, lily: T.lily.make };
      let punch = 0; // deeper petal shadows for the text-character look
      let wrapName = "ivory"; // which paper the bouquet is wrapped in

      const makeStem = (x, y) => ({ bx: 0, by: 0, cx: 0, cy: 0, x, y, start: R() * 0.15, dur: 0.8 + R() * 0.2, leaves: [] });
      const flowers = spec.flowers.map(([kind, x, y, r, key, tilt, lean, order], i) => {
        const st = makeStem(x, y);
        return {
          kind, x, y, r, st, seed: 500 + i * 61,
          art: make[kind](key, 500 + i * 61, { tilt, lean }),
          budStart: st.start + st.dur - 0.12,
          bloomStart: 1.35 + order * 0.035 + R() * 0.08,
          bloomDur: 1.4 + R() * 0.2,
          sprite: null, spriteKey: "",
        };
      });
      const buds = (spec.buds || []).map(([kind, x, y, r, key], i) => {
        const st = makeStem(x, y);
        return { kind, x, y, r, st, seed: 40 + i * 17, art: make[kind](key, 40 + i * 17, { tilt: 0.5, lean: Math.atan2(x, -y) * 0.9 }), budStart: st.start + st.dur - 0.15 };
      });

      // a narrow fan of feet at the base, each stem with its own small bow (as in the lily bouquet)
      {
        const all = [...flowers.map((f) => f.st), ...buds.map((f) => f.st)];
        all.sort((a, b) => a.x - b.x);
        const n = all.length;
        all.forEach((st, i) => {
          st.bx = lerp(-66, 66, i / (n - 1)) + (R() - 0.5) * 6;
          st.thick = 0.62 + R() * 0.4;
          const bow = (R() - 0.5) * 44 + Math.sign(st.x) * 12;
          st.cx = lerp(st.bx, st.x, 0.45) + bow;
          st.cy = st.y * 0.45;
        });
      }

      const leaves = (spec.leaves || []).map(([x, y, ang, L], i) => ({ x, y, ang, L, start: 0.4 + (i % 8) * 0.07 + (i >= 8 ? 0.9 : 0) + R() * 0.1, dur: 0.7 }));
      const blades = (spec.blades || []).map(([x, y, ang, L, w, droop], i) => ({ x, y, ang, L, w, bend: (Math.cos(ang) > 0 ? 1 : -1) * L * droop, start: 0.5 + i * 0.08 + R() * 0.1, dur: 0.7 }));

      // Once a flower is fully open its petals no longer change, so it is painted once into a
      // sprite and stamped each frame (only the breeze moves it). Keeps slow phones smooth.
      function spriteFor(g, f) {
        if (!g.getTransform || typeof document === "undefined") return null;
        const m = g.getTransform();
        const sx = Math.hypot(m.a, m.b), sy = Math.hypot(m.c, m.d);
        const key = sx.toFixed(4) + "/" + sy.toFixed(4) + "/" + punch;
        if (f.spriteKey !== key) {
          const half = f.r * 1.22;
          const c = document.createElement("canvas");
          c.width = Math.max(2, Math.ceil(half * 2 * sx));
          c.height = Math.max(2, Math.ceil(half * 2 * sy));
          const cg = c.getContext("2d");
          cg.setTransform(sx, 0, 0, sy, c.width / 2, c.height / 2);
          f.art.draw(cg, f.r, 1, punch);
          f.sprite = c;
          f.spriteKey = key;
          f.half = half;
        }
        return f.sprite;
      }

      function drawFlower(g, f, t) {
        const budP = easeOut((t - f.budStart) / 0.6);
        if (budP <= 0) return;
        const b = clamp((t - f.bloomStart) / f.bloomDur);
        const open = easeInOut(b);
        const dx = swayX(f.y, t) + flutter(f.seed, t);
        g.save();
        g.translate(f.x + dx, f.y);
        g.rotate(dx * 0.0035); // the head nods a little with the gust
        const sp = open >= 1 ? spriteFor(g, f) : null;
        if (sp) g.drawImage(sp, -f.half, -f.half, f.half * 2, f.half * 2);
        else f.art.draw(g, f.r * lerp(0.55 * budP, 1, smooth(b / 0.9)), open, punch);
        g.restore();
      }

      function drawWorld(g, t) {
        T.kit.wrap.back(g, wrapName, easeOut((t - 0.3) / 1.5));
        for (const f of buds) drawStem(g, f.st, t, flutter(f.seed, t));
        for (const f of flowers) drawStem(g, f.st, t, flutter(f.seed, t));
        T.kit.wrap.front(g, wrapName, easeOut(t / 0.9)); // the stems are gathered inside the wrap
        for (const lf of blades) drawBaseLeaf(g, lf, t);
        for (const lf of leaves) {
          const p = easeOut((t - lf.start) / lf.dur);
          if (p <= 0) continue;
          g.save();
          g.translate(lf.x + swayX(lf.y, t), lf.y);
          g.rotate(lf.ang + windAmt(t) * 0.03 * Math.sin(t * 1.6 + lf.L));
          T.peony.drawLeaf(g, lf.L, p);
          g.restore();
        }
        for (const f of buds) {
          const bp = easeOut((t - f.budStart) / 0.75);
          if (bp <= 0) continue;
          const dx = swayX(f.y, t) + flutter(f.seed, t);
          g.save();
          g.translate(f.x + dx, f.y);
          if (f.kind === "lily") f.art.drawBud(g, f.r * bp, punch);
          else f.art.draw(g, f.r * 2.3 * bp, 0.04, punch);
          g.restore();
        }
        for (const f of flowers) drawFlower(g, f, t);
      }

      return {
        name, GROW_END, LOOP, FADE,
        frame: Object.assign({ top: spec.top || -1220 }, T.kit.STAGE), // top: where the tallest bud ends
        setBottom: garden.setBottom,
        setLook(look) { punch = look === "ascii" ? 0.5 : 0; },
        setWrap(name) { wrapName = name; },
        draw: drawWorld,
      };
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
