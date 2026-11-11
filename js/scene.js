// Scene engine: draws a bouquet world on a night sky and shows it either as embroidered
// text characters (Rebloom's ASCII pass, WebGL with a 2D fallback) or painted directly.
// Steps detail down on slow phones, loops the bloom, and honours reduced motion.
//
//   const scene = Tenderly.createScene(container, { world: "peonies", look: "ascii", reserveTop: 0.15 });
//   scene.start();            // grow from the stems
//   scene.restart();          // grow again
//   scene.fadeSource = () => 0..1 | null;  // let music drive the fade-out before a restart
//   scene.onGrown = () => {}; // called once the flowers are open
(function (root) {
  "use strict";
  const T = (root.Tenderly = root.Tenderly || {});
  const { TAU, clamp, mulberry } = T.kit;

// ================= character atlas =================
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
  opts = Object.assign({ world: "lilies", look: "ascii", reserveTop: 0.15, autoQuality: true }, opts || {});
  const reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let world = T.worlds[opts.world]();
  let look = opts.look === "painted" ? "painted" : "ascii";
  let reserveTop = opts.reserveTop;

  let cv = null;
  const scene = document.createElement("canvas");
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
  let W, H, dpr, cw, ch, cols, rows, S, ox, oy, stars;
  let QUALITY_DROP = 0; // 0 = full detail; raised automatically on slow devices
  const SCN = 2; // hidden-canvas pixels per cell, per axis

  function layout() {
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    const cssW = container.clientWidth || root.innerWidth;
    const cssH = container.clientHeight || root.innerHeight;
    W = Math.max(2, Math.round(cssW * dpr));
    H = Math.max(2, Math.round(cssH * dpr));
    cv.width = W;
    cv.height = H;

    if (world.setLook) world.setLook(look);
    const F = world.frame;
    const Hb = H * (1 - reserveTop); // top share of the screen kept for words
    S = Math.min(W / F.w, Hb / F.h);
    ox = W / 2;
    oy = H * reserveTop + Hb / 2 + F.anchor * S + Math.max(0, (Hb - F.h * S) / 2) * 0.6; // tall screens: sit lower
    world.setBottom((H - oy) / S + 40); // stems continue past the bottom edge

    // fine grid: about 260 character rows across the bouquet's height
    ch = Math.max(5, Math.round((1180 * S) / (260 / (1 + 0.38 * QUALITY_DROP))));
    cw = Math.max(3, Math.round(ch * 0.78));
    cols = Math.ceil(W / cw);
    rows = Math.ceil(H / ch);
    if (look === "ascii") {
      scene.width = cols * SCN;
      scene.height = rows * SCN;
      buildAtlas(cw, ch);
    }

    // sparse, small, white stars, a few brighter
    const sr = mulberry(424242);
    const count = Math.round((cssW * cssH) / 4200);
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({ x: sr(), y: sr(), ph: sr() * TAU, sp: 0.5 + sr() * 1.4, a: 0.55 + sr() * 0.45, big: sr() < 0.18 });
    }
  }

  function drawStars(g, w, h, unit, t) {
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.pow(Math.sin(t * s.sp + s.ph), 2);
      const v = Math.round(255 * s.a * tw);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const r = s.big ? unit * 1.4 : unit * 0.9;
      g.fillRect(s.x * w - r / 2, s.y * h - r / 2, r, r);
    }
  }

  // ascii look: paint into the small hidden canvas, one pixel block per character cell
  function paintScene(t, fadeOverride) {
    const g = sctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = "#000";
    g.fillRect(0, 0, scene.width, scene.height);
    drawStars(g, scene.width, scene.height, SCN, t);
    g.setTransform((SCN * S) / cw, 0, 0, (SCN * S) / ch, (SCN * ox) / cw, (SCN * oy) / ch);
    world.draw(g, t);
    fadeOut(g, scene.width, scene.height, t, fadeOverride);
  }

  // painted look: draw the world straight onto the screen at full resolution
  function paintDirect(t, fadeOverride) {
    const g = out.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const bg = g.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, Math.max(W, H) * 0.8);
    bg.addColorStop(0, "#14101a");
    bg.addColorStop(1, "#030205");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    drawStars(g, W, H, 1.6 * dpr, t);
    g.setTransform(S, 0, 0, S, ox, oy);
    world.draw(g, t);
    fadeOut(g, W, H, t, fadeOverride);
  }

  function fadeOut(g, w, h, t, fadeOverride) {
    const fade = fadeOverride !== undefined ? fadeOverride : clamp((t - (world.LOOP - world.FADE)) / world.FADE);
    if (fade > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(0,0,0,${fade})`;
      g.fillRect(0, 0, w, h);
    }
  }

// ================= ASCII pass: WebGL =================
function makeGL() {
  const gl = cv.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const fs = `
    precision mediump float;
    uniform sampler2D uScene, uGlyph;
    uniform vec2 uRes, uCell, uGrid;
    uniform float uLevels, uVar;
    float hash(vec2 c){ return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 sat(vec3 c, float k){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return clamp(mix(vec3(l), c, k), 0.0, 1.0); }
    void main(){
      vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
      vec2 full = uCell * uGrid;
      // soft glow around bright areas, sampled per pixel so it stays smooth
      vec2 uv = px / full;
      vec2 r1 = 3.0 * uCell / full, r2 = 6.0 * uCell / full;
      vec3 glow = (
        texture2D(uScene, uv + vec2(r1.x, 0.0)).rgb + texture2D(uScene, uv - vec2(r1.x, 0.0)).rgb +
        texture2D(uScene, uv + vec2(0.0, r1.y)).rgb + texture2D(uScene, uv - vec2(0.0, r1.y)).rgb +
        texture2D(uScene, uv + r2 * vec2(0.7, 0.7)).rgb + texture2D(uScene, uv - r2 * vec2(0.7, 0.7)).rgb +
        texture2D(uScene, uv + r2 * vec2(0.7, -0.7)).rgb + texture2D(uScene, uv - r2 * vec2(0.7, -0.7)).rgb
      ) / 8.0;
      glow = sat(glow, 1.0) * 0.045;

      vec2 cell = floor(px / uCell);
      vec3 c = texture2D(uScene, (cell + 0.5) / uGrid).rgb;
      float m = max(c.r, max(c.g, c.b));
      if (m < 0.06) { gl_FragColor = vec4(glow, 1.0); return; }

      float v = pow(m, 0.6);
      float lvl = 1.0 + clamp(floor(v * (uLevels - 1.0) + (hash(cell) - 0.5) * 1.1), 0.0, uLevels - 2.0);
      float vi = floor(hash(cell + 17.31) * uVar);
      float idx = lvl * uVar + vi;
      vec2 lp = (px - cell * uCell) / uCell;
      float g = texture2D(uGlyph, vec2((idx + lp.x) / (uLevels * uVar), lp.y)).r;

      // per-character brightness jitter (about +/-10%) for an embroidered shimmer
      float jit = 0.82 + 0.36 * hash(cell * 1.73 + 5.1);
      vec3 col = sat(c, 1.1) * min(1.0 / m, 1.36) * jit;
      // glyph strokes on top of a dimmer solid fill, so surfaces read as continuous
      vec3 outc = col * mix(0.3, 1.32, g) + glow;
      gl_FragColor = vec4(outc, 1.0);
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
  const tScene = tex(0, gl.LINEAR);
  const tGlyph = tex(1, gl.NEAREST);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform1i(U("uScene"), 0);
  gl.uniform1i(U("uGlyph"), 1);
  const uRes = U("uRes"), uCell = U("uCell"), uGrid = U("uGrid"), uLevels = U("uLevels"), uVar = U("uVar");

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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// ================= ASCII pass: 2D fallback (no WebGL) =================
function make2D() {
  const ctx = cv.getContext("2d");
  const small = document.createElement("canvas");
  const mctx = small.getContext("2d", { willReadFrequently: true });
  const wa = document.createElement("canvas");
  const wctx = wa.getContext("2d");
  return {
    resize() {
      small.width = cols;
      small.height = rows;
      wa.width = atlas.width;
      wa.height = atlas.height;
      const id = actx.getImageData(0, 0, atlas.width, atlas.height);
      for (let i = 0; i < id.data.length; i += 4) { id.data[i + 3] = 110 + id.data[i] * 0.57; id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; }
      wctx.putImageData(id, 0, 0);
    },
    draw() {
      mctx.drawImage(scene, 0, 0, cols, rows);
      const img = mctx.getImageData(0, 0, cols, rows), d = img.data;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      const n = LEVELS.length;
      for (let y = 0, k = 0; y < rows; y++) for (let x = 0; x < cols; x++, k++) {
        const i = k * 4, m = Math.max(d[i], d[i + 1], d[i + 2]);
        if (m < 15) { d[i + 3] = 0; continue; }
        const v = Math.pow(m / 255, 0.6);
        const lvl = 1 + Math.floor(clamp(v * (n - 1), 0, n - 2));
        const idx = lvl * VAR + ((x * 7 + y * 13) % VAR);
        ctx.drawImage(wa, idx * cw, 0, cw, ch, x * cw, y * ch, cw, ch);
        const f = Math.min(255 / m, 1.4);
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; d[i + 3] = 255;
      }
      mctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cols * cw, rows * ch);
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    },
  };
}

  function makePainted() {
    const ctx = cv.getContext("2d");
    return { ctx, resize() {}, draw() {} };
  }

  function mount() {
    if (cv) cv.remove();
    cv = document.createElement("canvas");
    cv.className = "scene-canvas";
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
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
  const api = { onGrown: null, fadeSource: null, reduce };

  function render(t, fade) {
    if (look === "ascii") { paintScene(t, fade); out.draw(); }
    else paintDirect(t, fade);
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
    if (frozen !== null) { render(frozen, 0); return; }
    if (!started) { render(0); requestAnimationFrame(frame); return; }
    if (reduce) { render(world.GROW_END + 1, 0); grown(); return; }
    watchSpeed(now);
    let t = (now - t0) / 1000;
    let fade;
    const f = api.fadeSource ? api.fadeSource() : null;
    if (typeof f === "number") fade = f; // music-driven: the caller fades and restarts with the track
    else if (opts.loop) { if (t >= world.LOOP) { t0 = now; t = 0; } } // bloom again every few seconds
    else fade = 0; // otherwise stay in bloom and keep swaying
    render(t, fade);
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
  api.resume = function () { if (frozen !== null) { frozen = null; kick(); } };
  api.setWorld = function (name) {
    if (!T.worlds[name] || name === world.name) return;
    world = T.worlds[name]();
    layout(); out.resize();
    t0 = performance.now();
    if (frozen !== null) render(frozen, 0);
    else if (reduce) kick();
  };
  api.setLook = function (l) {
    l = l === "painted" ? "painted" : "ascii";
    if (l === look) return;
    look = l;
    mount();
    if (frozen !== null) render(frozen, 0);
    else if (reduce) kick();
  };
  api.setReserve = function (r) { reserveTop = r; onResize(); };
  api.elapsed = function () { return (performance.now() - t0) / 1000; };
  api.growEnd = function () { return world.GROW_END; };
  api.destroy = function () { destroyed = true; root.removeEventListener("resize", onResize); if (cv) cv.remove(); };

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
