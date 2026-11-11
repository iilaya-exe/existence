// Scene engine: a sunlit room. A pale wall, a table, drifting petals, and a bouquet tied in
// paper and ribbon. The bouquet is shown either painted, or embroidered: stitched from tiny text
// characters in the flowers' own colours (the idea, and the character atlas, come from
// Rebloom's ASCII pass; here it is worked on a light ground instead of a night sky).
// Steps detail down on slow phones and honours reduced motion.
//
//   const scene = Tenderly.createScene(container, { world: "mixed", look: "painted", wrap: "blush" });
//   scene.start();            // the wrap arrives and the bouquet grows
//   scene.restart();          // grow again
//   scene.onGrown = () => {}; // called once the flowers are open
//   scene.onLayout = (m) => {}; // where things are on screen (CSS px): m.x, m.y, m.scale, m.table
//   scene.fadeSource = () => 0..1 | null;  // let music drive the fade-out before a restart
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  const { TAU, clamp, mulberry } = T.kit;

  // ten density levels, four interchangeable glyphs per level so no run of characters repeats
  const LEVELS = [
    "    ",
    ".'`,",
    ":;,'",
    "-~^\"",
    "=+<>",
    "*xvc",
    "oaesz",
    "%&$kh",
    "#8BMW",
    "@QNgR",
  ].map((s) => s.slice(0, 4));
  const VAR = 4;
  const NGLYPH = LEVELS.length * VAR;

  function createScene(container, opts) {
    opts = Object.assign({ world: "mixed", look: "painted", wrap: "ivory", reserveTop: 0.13, autoQuality: true, loop: false }, opts || {});
    const reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

    let world = T.worlds[opts.world]();
    let look = opts.look === "ascii" ? "ascii" : "painted";
    let wrapName = opts.wrap; // which paper the bouquet is wrapped in
    let reserveTop = opts.reserveTop;

    // two layers: the room behind, the bouquet in front
    const layer = (cls) => {
      const c = document.createElement("canvas");
      c.className = cls;
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      return c;
    };
    const room = layer("scene-room");
    const rctx = room.getContext("2d");
    container.appendChild(room);
    const still = document.createElement("canvas"); // the parts of the room that never move, painted once
    const stctx = still.getContext("2d");
    let cv = null;
    const scene = document.createElement("canvas"); // embroidered look: one small block of pixels per stitch
    const sctx = scene.getContext("2d");
    const atlas = document.createElement("canvas");
    const actx = atlas.getContext("2d");
    let out = null;

  function buildAtlas(cw, ch) {
    // draw each glyph large, then squeeze it so its ink fills the whole cell height (rows touch, no gaps)
    const big = 64;
    const tmp = document.createElement("canvas");
    tmp.width = Math.ceil(big * 0.8);
    tmp.height = Math.ceil(big * 1.3);
    const tc = tmp.getContext("2d");
    const font = `700 ${big}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace`;
    tc.font = font;
    const m = tc.measureText("@#MWQgjy|");
    const asc = m.actualBoundingBoxAscent || big * 0.78;
    const desc = m.actualBoundingBoxDescent || big * 0.22;
    const adv = tc.measureText("M").width || big * 0.6;
    atlas.width = cw * NGLYPH;
    atlas.height = ch;
    actx.fillStyle = "#000";
    actx.fillRect(0, 0, atlas.width, atlas.height);
    actx.imageSmoothingEnabled = true;
    actx.imageSmoothingQuality = "high";
    LEVELS.forEach((chars, li) => {
      for (let v = 0; v < VAR; v++) {
        const c = chars[v];
        if (c === " ") continue;
        tc.clearRect(0, 0, tmp.width, tmp.height);
        tc.fillStyle = "#fff";
        tc.font = font;
        tc.textBaseline = "alphabetic";
        tc.fillText(c, (tmp.width - adv) / 2, asc + 2);
        actx.drawImage(tmp, (tmp.width - adv) / 2, 2, adv, asc + desc, (li * VAR + v) * cw - cw * 0.06, ch * 0.1, cw * 1.12, ch * 0.8);
      }
    });
  }

    // ================= screen setup =================
    let W, H, dpr, cw, ch, cols, rows, S, ox, oy, tableY, petals = [];
    let QUALITY_DROP = 0; // 0 = full detail; raised automatically on slow devices
    const SCN = 2; // hidden-canvas pixels per stitch, per axis
    const api = { onGrown: null, onLayout: null, fadeSource: null, reduce };

    function layout() {
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      const cssW = container.clientWidth || root.innerWidth;
      const cssH = container.clientHeight || root.innerHeight;
      W = Math.max(2, Math.round(cssW * dpr));
      H = Math.max(2, Math.round(cssH * dpr));
      room.width = still.width = cv.width = W;
      room.height = still.height = cv.height = H;

      // Fit the stage: the table runs to the bottom edge, the tallest bud stays under the words
      // at the top; on a tall screen the spare room goes to the wall above the flowers.
      if (world.setLook) world.setLook(look);
      if (world.setWrap) world.setWrap(wrapName);
      const F = world.frame;
      S = Math.min(W / F.w, (H * (1 - reserveTop)) / (F.bottom - F.top));
      ox = W / 2;
      oy = H - F.bottom * S;
      tableY = oy + F.table * S;
      world.setBottom(F.stemDepth); // the stems end inside the wrap

      // fine grid: about 260 rows of stitches across the bouquet's height
      ch = Math.max(5, Math.round((1180 * S) / (260 / (1 + 0.38 * QUALITY_DROP))));
      cw = Math.max(3, Math.round(ch * 0.78));
      cols = Math.ceil(W / cw);
      rows = Math.ceil(H / ch);
      if (look === "ascii") {
        scene.width = cols * SCN;
        scene.height = rows * SCN;
        buildAtlas(cw, ch);
      }

      // a few petals adrift in the room
      const pr = mulberry(8675309);
      const count = clamp(Math.round((cssW * cssH) / 52000), 7, 22);
      petals = [];
      for (let i = 0; i < count; i++) {
        petals.push({ x: pr(), y: pr(), v: 0.018 + pr() * 0.02, sway: 0.02 + pr() * 0.03, f: 0.3 + pr() * 0.5, ph: pr() * TAU, spin: (pr() - 0.5) * 1.6, r: (5 + pr() * 6) * dpr, tint: pr() });
      }
      paintStill();
      if (api.onLayout) api.onLayout(api.metrics());
    }

    // the wall with its window light, and the table
    function paintStill() {
      const g = stctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      const wall = g.createLinearGradient(0, 0, 0, tableY);
      wall.addColorStop(0, "#faf4ec");
      wall.addColorStop(1, "#f4e2dc");
      g.fillStyle = wall;
      g.fillRect(0, 0, W, H);
      const R = Math.max(W, H);
      let glow = g.createRadialGradient(W * 0.1, H * 0.06, 0, W * 0.1, H * 0.06, R * 0.85); // morning light from a window, upper left
      glow.addColorStop(0, "rgba(255,252,240,0.95)");
      glow.addColorStop(1, "rgba(255,252,240,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, tableY);
      glow = g.createRadialGradient(W * 0.95, tableY * 0.8, 0, W * 0.95, tableY * 0.8, R * 0.6); // a rosy corner
      glow.addColorStop(0, "rgba(240,190,200,0.34)");
      glow.addColorStop(1, "rgba(240,190,200,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, tableY);

      const table = g.createLinearGradient(0, tableY, 0, H);
      table.addColorStop(0, "#ecdcc8");
      table.addColorStop(1, "#dcc6ab");
      g.fillStyle = table;
      g.fillRect(0, tableY, W, H - tableY);
      const edge = g.createLinearGradient(0, tableY - 26 * S, 0, tableY); // the wall darkens a little where it meets the table
      edge.addColorStop(0, "rgba(150,110,90,0)");
      edge.addColorStop(1, "rgba(150,110,90,0.16)");
      g.fillStyle = edge;
      g.fillRect(0, tableY - 26 * S, W, 26 * S);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillRect(0, tableY, W, Math.max(1, dpr));

    }

    function paintRoom(now, t) {
      const g = rctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(still, 0, 0);
      const there = clamp(t / 1.4); // the bouquet's shadow arrives with it, falling to the right
      if (there > 0) {
        g.save();
        g.translate(ox + 46 * S, tableY + 4 * S);
        g.scale(1, 0.12);
        const sh = g.createRadialGradient(0, 0, 0, 0, 0, 230 * S);
        sh.addColorStop(0, `rgba(96,66,50,${0.4 * there})`);
        sh.addColorStop(1, "rgba(96,66,50,0)");
        g.fillStyle = sh;
        g.beginPath();
        g.arc(0, 0, 230 * S, 0, TAU);
        g.fill();
        g.restore();
      }
      if (reduce) return;
      const time = now / 1000;
      for (const p of petals) {
        const y = ((p.y + time * p.v) % 1.1) * tableY - 0.05 * tableY;
        const x = (p.x + Math.sin(time * p.f + p.ph) * p.sway) * W;
        const a = clamp(y / (tableY * 0.12)) * clamp((tableY - y) / (tableY * 0.1)); // fade in at the top, settle out near the table
        if (a <= 0) continue;
        g.save();
        g.translate(x, y);
        g.rotate(p.ph + time * p.spin);
        g.beginPath();
        g.ellipse(0, 0, p.r, p.r * 0.56, 0, 0, TAU);
        g.fillStyle = p.tint < 0.45 ? `rgba(240,158,180,${0.5 * a})` : p.tint < 0.8 ? `rgba(248,196,206,${0.6 * a})` : `rgba(255,236,222,${0.8 * a})`;
        g.fill();
        g.restore();
      }
    }

    // embroidered look: paint the bouquet small, on a clear ground, one pixel block per stitch
    function paintScene(t) {
      const g = sctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.clearRect(0, 0, scene.width, scene.height);
      g.setTransform((SCN * S) / cw, 0, 0, (SCN * S) / ch, (SCN * ox) / cw, (SCN * oy) / ch);
      world.draw(g, t);
    }
    // painted look: draw the bouquet straight onto the screen at full resolution
    function paintDirect(t) {
      const g = out.ctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      g.setTransform(S, 0, 0, S, ox, oy);
      world.draw(g, t);
    }

    // ================= embroidered pass: WebGL =================
    function makeGL() {
      const gl = cv.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true });
      if (!gl) return null;
      const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
      const fs = `
        precision mediump float;
        uniform sampler2D uScene, uGlyph;
        uniform vec2 uRes, uCell, uGrid;
        uniform float uLevels, uVar;
        float hash(vec2 c){ return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
          vec2 cell = floor(px / uCell);
          vec4 s = texture2D(uScene, (cell + 0.5) / uGrid);
          if (s.a < 0.4) { gl_FragColor = vec4(0.0); return; } // bare ground: the room shows through
          vec3 c = s.rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          // darker thread is worked in denser characters
          float lvl = 2.0 + clamp(floor((1.0 - lum) * (uLevels - 3.0) + (hash(cell) - 0.5) * 1.6 + 1.5), 0.0, uLevels - 3.0);
          float vi = floor(hash(cell + 17.31) * uVar);
          float idx = lvl * uVar + vi;
          vec2 lp = (px - cell * uCell) / uCell;
          float g = texture2D(uGlyph, vec2((idx + lp.x) / (uLevels * uVar), lp.y)).r;
          // each stitch: a wash of the thread's colour with its character worked darker on top,
          // and a little variation from stitch to stitch
          float jit = 0.93 + 0.14 * hash(cell * 1.73 + 5.1);
          c = clamp(mix(vec3(lum), c, 1.22), 0.0, 1.0); // thread is a little richer than paint
          vec3 wash = mix(vec3(1.0), c, 0.93) * jit;
          vec3 ink = c * 0.45;
          vec3 col = mix(wash, ink, g * 0.92);
          float a = 0.95;
          gl_FragColor = vec4(col * a, a);
        }`;
      function sh(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      function tex(unit, filter) {
        const tx = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tx;
      }
      const tScene = tex(0, gl.NEAREST);
      const tGlyph = tex(1, gl.NEAREST);
      const U = (n) => gl.getUniformLocation(prog, n);
      gl.uniform1i(U("uScene"), 0);
      gl.uniform1i(U("uGlyph"), 1);
      const uRes = U("uRes"), uCell = U("uCell"), uGrid = U("uGrid"), uLevels = U("uLevels"), uVar = U("uVar");
      gl.clearColor(0, 0, 0, 0);

      return {
        resize() {
          gl.viewport(0, 0, W, H);
          gl.uniform2f(uRes, W, H);
          gl.uniform2f(uCell, cw, ch);
          gl.uniform2f(uGrid, cols, rows);
          gl.uniform1f(uLevels, LEVELS.length);
          gl.uniform1f(uVar, VAR);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, tGlyph);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        },
        draw() {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tScene);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
      };
    }

    // ================= embroidered pass: 2D fallback (no WebGL) =================
    function make2D() {
      const ctx = cv.getContext("2d");
      const small = document.createElement("canvas");
      const mctx = small.getContext("2d", { willReadFrequently: true });
      const ink = document.createElement("canvas"); // the characters as dark, see-through marks
      const ictx = ink.getContext("2d");
      return {
        resize() {
          small.width = cols;
          small.height = rows;
          ink.width = atlas.width;
          ink.height = atlas.height;
          const id = actx.getImageData(0, 0, atlas.width, atlas.height);
          for (let i = 0; i < id.data.length; i += 4) { id.data[i + 3] = id.data[i] * 0.45; id.data[i] = id.data[i + 1] = id.data[i + 2] = 20; }
          ictx.putImageData(id, 0, 0);
        },
        draw() {
          mctx.clearRect(0, 0, cols, rows);
          mctx.drawImage(scene, 0, 0, cols, rows);
          const img = mctx.getImageData(0, 0, cols, rows), d = img.data;
          const n = LEVELS.length, marks = [];
          for (let y = 0, k = 0; y < rows; y++) for (let x = 0; x < cols; x++, k++) {
            const i = k * 4;
            if (d[i + 3] < 100) { d[i + 3] = 0; continue; }
            const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            const lvl = 2 + Math.floor(clamp((1 - lum) * (n - 3) + 1.5, 0, n - 3));
            marks.push(lvl * VAR + ((x * 7 + y * 13) % VAR), x, y);
            d[i + 3] = 242;
          }
          mctx.putImageData(img, 0, 0);
          ctx.clearRect(0, 0, W, H);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(small, 0, 0, cols * cw, rows * ch);
          for (let m = 0; m < marks.length; m += 3) ctx.drawImage(ink, marks[m] * cw, 0, cw, ch, marks[m + 1] * cw, marks[m + 2] * ch, cw, ch);
        },
      };
    }

    function makePainted() {
      return { ctx: cv.getContext("2d"), resize() {}, draw() {} };
    }

    function mount() {
      if (cv) cv.remove();
      cv = layer("scene-canvas");
      container.appendChild(cv);
      layout();
      out = null;
      if (look === "ascii") {
        try { out = makeGL(); } catch (e) { out = null; }
        if (!out) out = make2D();
      } else out = makePainted();
      out.resize();
    }

    // ================= run =================
    mount();
    let t0 = performance.now();
    let started = false;
    let grownFired = false;
    let destroyed = false;
    let frozen = null; // a fixed time to show (preview stills, tests)
    let shownFade = 0;

    function render(t, fade, now) {
      paintRoom(now === undefined ? performance.now() : now, t);
      if (look === "ascii") { paintScene(t); out.draw(); }
      else paintDirect(t);
      fade = fade || 0;
      if (fade !== shownFade) { shownFade = fade; cv.style.opacity = String(1 - fade); } // the bouquet fades; the room stays
    }

    // watch the frame time while the bouquet is growing; on a slow phone, step the detail down (at most twice)
    let lastNow = 0, ema = 16, frames = 0;
    function watchSpeed(now) {
      if (!opts.autoQuality || look !== "ascii") return;
      if (lastNow) {
        const dt = Math.min(200, now - lastNow);
        ema = ema * 0.9 + dt * 0.1;
        if (++frames > 45 && ema > 30 && QUALITY_DROP < 2) {
          QUALITY_DROP++;
          frames = 0;
          ema = 16;
          layout();
          out.resize();
        }
      }
      lastNow = now;
    }

    function grown() {
      if (!grownFired) { grownFired = true; if (api.onGrown) api.onGrown(); }
    }

    function frame(now) {
      if (destroyed) return;
      if (frozen !== null) { render(frozen, 0, now); return; }
      if (!started) { render(0, 0, now); requestAnimationFrame(frame); return; } // an empty room, petals adrift
      if (reduce) { render(world.GROW_END + 1, 0, now); grown(); return; }
      watchSpeed(now);
      let t = (now - t0) / 1000;
      let fade = 0;
      const f = api.fadeSource ? api.fadeSource() : null;
      if (typeof f === "number") fade = f; // music-driven: the caller fades and restarts with the track
      else if (opts.loop) { // bloom again every few seconds
        if (t >= world.LOOP) { t0 = now; t = 0; }
        fade = clamp((t - (world.LOOP - world.FADE)) / world.FADE);
      } // otherwise stay in bloom and keep swaying
      render(t, fade, now);
      if (t > world.GROW_END - 0.5) grown();
      requestAnimationFrame(frame);
    }

    function kick() { requestAnimationFrame(frame); }

    api.start = function () {
      if (started) return;
      started = true;
      frozen = null;
      t0 = performance.now();
      kick();
    };
    api.restart = function () {
      t0 = performance.now();
      if (frozen !== null || reduce) { frozen = null; kick(); }
    };
    api.renderAt = function (t) { frozen = t; render(t, 0); };
    api.setWorld = function (name) {
      if (!T.worlds[name] || name === world.name) return;
      world = T.worlds[name]();
      layout(); out.resize();
      t0 = performance.now();
      if (frozen !== null) render(frozen, 0);
      else if (reduce) kick();
    };
    api.setLook = function (l) {
      l = l === "ascii" ? "ascii" : "painted";
      if (l === look) return;
      look = l;
      mount();
      if (frozen !== null) render(frozen, 0);
      else if (reduce) kick();
    };
    api.setWrap = function (name) {
      wrapName = name;
      if (world.setWrap) world.setWrap(name);
      if (frozen !== null) render(frozen, 0);
      else if (reduce && started) render(world.GROW_END + 1, 0);
    };
    // where the stage sits on screen, in CSS pixels: x, y = where the stems gather, scale = CSS
    // pixels per world unit, table = the table's edge. For placing things beside the bouquet.
    api.metrics = function () { return { x: ox / dpr, y: oy / dpr, scale: S / dpr, table: tableY / dpr }; };
    api.destroy = function () { destroyed = true; root.removeEventListener("resize", onResize); if (cv) cv.remove(); room.remove(); };

    function onResize() {
      layout();
      out.resize();
      if (frozen !== null) render(frozen, 0);
      else if (reduce && started) render(world.GROW_END + 1, 0);
    }
    root.addEventListener("resize", onResize);
    kick();
    return api;
  }

  T.createScene = createScene;
})(typeof window !== "undefined" ? window : globalThis);
