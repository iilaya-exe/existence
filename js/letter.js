// The recipient's side. In order: read the letter out of the link, wait if it is sealed until a
// date, ask for the passphrase if it is locked, then: their name and falling stars -> a tap ->
// music and the bouquet -> an envelope under the flowers -> the letter on paper.
(function () {
  "use strict";
  const T = window.Tenderly;
  const codec = T.codec;
  const { TAU, clamp } = T.kit;
  const $ = (id) => document.getElementById(id);

  const PREVIEW = new URLSearchParams(location.search).get("preview") === "1"; // the composer's live preview: no gate, no sound
  const KEEP = window.__TENDERLY_KEEPSAKE || null; // a saved keepsake file carries its letter, music and home address inside
  const HOME = KEEP ? KEEP.home : /letter\.html$/.test(location.pathname) ? "./" : "/";
  const MUSIC = KEEP ? KEEP.audio : "/audio/bloom.mp3";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let letter = null;
  let scene = null;
  let skew = 0; // server clock minus this device's clock, when we know it

  const show = (el) => { el.hidden = false; };
  const hide = (el) => { el.hidden = true; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ================= reading the link =================
  function fail(kind) { const e = new Error(kind); e.kind = kind; return e; }

  async function load() {
    const short = /^\/s\/([A-Za-z0-9]{10})\/?$/.exec(location.pathname);
    const hash = KEEP ? "#" + KEEP.letter : location.hash;
    if (short) {
      const key = /^#k=([A-Za-z0-9_-]{43})$/.exec(hash);
      if (!key) throw fail("broken");
      return fetchShort(short[1], key[1]);
    }
    if (!hash || hash.length < 4) throw fail("empty");
    try { return await codec.fromFragment(hash); } catch (e) { throw fail("broken"); }
  }

  async function fetchShort(id, key) {
    for (;;) {
      let r;
      try { r = await fetch("/api/letters?id=" + id, { cache: "no-store" }); } catch (e) { throw fail("offline"); }
      if (r.status === 423) { // still sealed: the server will not hand it over yet
        const j = await r.json();
        skew = j.now - Date.now();
        await sealedUntil(j.openAt, "");
        continue;
      }
      if (r.status === 404) throw fail("gone");
      if (!r.ok) throw fail("offline");
      try { return await codec.unlockFromServer(await r.json(), key); } catch (e) { throw fail("broken"); }
    }
  }

  function showBroken(kind) {
    const words = {
      empty: ["There's no letter here yet.", "This page opens letters, and this link doesn't carry one."],
      gone: ["This letter can't be found.", "It may have been removed, or the link is incomplete. Ask whoever sent it to copy it again."],
      offline: ["Couldn't reach your letter.", "Check your connection, then open the link again."],
      broken: ["This letter lost its way.", "The link may be incomplete. Ask whoever sent it to copy it again."],
    }[kind] || null;
    if (words) { $("brokenTitle").textContent = words[0]; $("brokenNote").textContent = words[1]; }
    $("brokenHome").href = HOME;
    show($("broken"));
  }

  // ================= sealed until a date =================
  function sealedUntil(openAt, name) {
    return new Promise((resolve) => {
      const panel = $("wait");
      $("waitFor").textContent = name ? "a letter for " + name : "a letter for you";
      $("waitDate").textContent = new Date(openAt).toLocaleString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      show(panel);
      if (!reduce) starRain($("waitRain"), () => !panel.hidden);
      const pad = (n) => String(n).padStart(2, "0");
      (function tick() {
        const left = openAt - (Date.now() + skew);
        if (left <= 0) { hide(panel); resolve(); return; }
        const s = Math.ceil(left / 1000);
        $("cD").textContent = Math.floor(s / 86400);
        $("cH").textContent = pad(Math.floor((s % 86400) / 3600));
        $("cM").textContent = pad(Math.floor((s % 3600) / 60));
        $("cS").textContent = pad(s % 60);
        setTimeout(tick, Math.min(250, left));
      })();
    });
  }

  // ================= locked with a passphrase =================
  function askPassphrase(sealed) {
    return new Promise((resolve) => {
      const panel = $("lock"), input = $("lockInput"), btn = $("lockBtn"), err = $("lockErr");
      show(panel);
      input.focus();
      $("lockForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "Unlocking…";
        try {
          const raw = await codec.unseal(sealed, input.value);
          hide(panel);
          resolve(raw);
        } catch (ex) {
          show(err);
          btn.disabled = false;
          btn.textContent = "Unlock";
          input.select();
        }
      });
    });
  }

  // ================= falling stars (from Rebloom's opening screen) =================
  // text-character stars drift down at a slant, each with a fading tail; stops when alive() says so
  function starRain(cv, alive) {
    const cx = cv.getContext("2d");
    const GLYPHS = ["*", "+", "✦", "·", "✧"];
    const TINTS = ["255,255,255", "255,236,200", "200,220,255", "255,205,215"];
    let w = 0, h = 0, stars = [], last = 0;
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(anywhere) {
      const z = 0.4 + Math.random() * 0.6; // depth: nearer stars are bigger, brighter and faster
      return {
        x: Math.random() * (w + h * 0.35) - h * 0.1,
        y: anywhere ? Math.random() * h : -20 - Math.random() * h * 0.3,
        v: (40 + Math.random() * 70) * z, z,
        g: GLYPHS[(Math.random() * GLYPHS.length) | 0],
        c: TINTS[(Math.random() * TINTS.length) | 0],
        tw: Math.random() * TAU,
      };
    }
    size();
    const count = clamp(Math.round((w * h) / 9000), 24, 90);
    for (let i = 0; i < count; i++) stars.push(spawn(true));
    window.addEventListener("resize", size);
    function tick(now) {
      if (!alive()) { window.removeEventListener("resize", size); return; }
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      cx.clearRect(0, 0, w, h);
      cx.textAlign = "center"; cx.textBaseline = "middle";
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.y += s.v * dt; s.x -= s.v * 0.35 * dt; s.tw += dt * 3;
        if (s.y > h + 20 || s.x < -40) { stars[i] = spawn(false); continue; }
        const a = (0.35 + 0.65 * s.z) * (0.75 + 0.25 * Math.sin(s.tw));
        const tail = 10 + s.v * 0.22;
        const grad = cx.createLinearGradient(s.x, s.y, s.x + tail * 0.35, s.y - tail);
        grad.addColorStop(0, `rgba(${s.c},${(a * 0.45).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${s.c},0)`);
        cx.strokeStyle = grad; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(s.x + tail * 0.35, s.y - tail); cx.stroke();
        cx.fillStyle = `rgba(${s.c},${a.toFixed(3)})`;
        cx.font = `${Math.round(8 + 8 * s.z)}px ui-monospace, Menlo, Consolas, monospace`;
        cx.fillText(s.g, s.x, s.y);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ================= music =================
  // Starts with the tap on the opening screen. When the track ends the bouquet fades and
  // blooms again with it. The voice note, while playing, hushes the music.
  const bgm = $("bgm"), snd = $("snd");
  const BGM_VOL = 0.85;
  let musicOn = false;
  function setSound(state) {
    snd.dataset.state = state;
    snd.setAttribute("aria-label", state === "on" ? "Mute sound" : "Turn sound on");
  }
  function startMusic(fromStart) {
    if (!musicOn) return Promise.resolve(false);
    if (fromStart) { try { bgm.currentTime = 0; } catch (e) {} }
    const p = bgm.play();
    if (p && p.then) return p.then(() => { setSound(bgm.muted ? "muted" : "on"); return true; }).catch(() => { setSound("blocked"); return false; });
    return Promise.resolve(!bgm.paused);
  }
  function setupMusic() {
    musicOn = !!letter.music && !PREVIEW;
    if (!musicOn) { setSound("none"); return; }
    bgm.volume = BGM_VOL;
    bgm.src = MUSIC;
    bgm.preload = "auto";
    bgm.addEventListener("error", () => { musicOn = false; setSound("none"); });
    bgm.addEventListener("ended", () => {
      if (document.hidden) return;
      startMusic(true);
      scene.restart();
    });
    snd.addEventListener("click", () => {
      if (snd.dataset.state === "blocked") { bgm.muted = false; startMusic(true); return; }
      bgm.muted = !bgm.muted;
      if (!bgm.muted && bgm.paused) startMusic(false);
      setSound(bgm.muted ? "muted" : "on");
    });
    // stop when the page is hidden (tab switched, phone locked), pick up again on return
    let resume = false;
    const onHide = () => { if (!bgm.paused) { resume = true; bgm.pause(); } };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHide();
      else if (resume) { resume = false; if (!bgm.muted) startMusic(false); }
    });
    window.addEventListener("pagehide", onHide);
  }
  const FADE = 0.45;
  function musicFade() { // while music plays the bouquet follows it: fade out as the track ends
    if (!musicOn || bgm.paused || !isFinite(bgm.duration) || bgm.duration < 2) return null;
    return clamp((bgm.currentTime - (bgm.duration - FADE)) / FADE);
  }

  // ================= the bouquet =================
  function buildScene() {
    scene = T.createScene($("stage"), { world: letter.flower, look: letter.look, reserveTop: 0.15, autoQuality: !PREVIEW });
    scene.fadeSource = musicFade;
    scene.onGrown = () => {
      $("hello").classList.add("show");
      setTimeout(() => { show($("envelope")); requestAnimationFrame(() => requestAnimationFrame(() => $("envelope").classList.add("in"))); }, reduce ? 0 : 700);
    };
  }
  function setWords() {
    $("gateName").textContent = letter.to || "for you";
    $("helloTo").textContent = letter.to ? "for " + letter.to : "for you";
    $("helloFrom").textContent = letter.from ? "a letter from " + letter.from : "a letter";
    $("envSeal").textContent = letter.from ? Array.from(letter.from)[0].toUpperCase() : "♥";
    if (!PREVIEW) document.title = letter.to ? "For " + letter.to : "A letter for you";
  }

  function openGate() {
    const gate = $("gate");
    setWords();
    setupMusic();
    buildScene();
    show(gate);
    if (!reduce) starRain($("gateRain"), () => !gate.hidden);
    gate.addEventListener("click", () => {
      if (musicOn) { bgm.muted = false; startMusic(true); show(snd); }
      gate.classList.add("leaving");
      setTimeout(() => hide(gate), 750);
      scene.start();
    }, { once: true });
  }

  // ================= the envelope and the letter =================
  const envelope = $("envelope"), sheet = $("sheet"), paper = $("paper");
  let typed = false, sheetOpen = false, stopTyping = null;

  const SPRIGS = { ivory: ["blush", "rose"], blush: ["cream", "rose"], kraft: ["cream", "coral"], midnight: ["blush", "lilac"] };
  function fillPaper() {
    paper.className = "paper " + letter.paper + (letter.hand === "script" ? " script" : "");
    $("sprig").src = T.peony.sprig(380, SPRIGS[letter.paper] || SPRIGS.ivory, 7);
    $("pDate").textContent = letter.sent ? new Date(letter.sent).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
    $("pTo").textContent = letter.to ? "For " + letter.to : "For you";
    $("pFrom").textContent = letter.from ? "— " + letter.from : "";
    $("pFrom").hidden = !letter.from;
    $("replyBtn").href = HOME + "#reply&to=" + encodeURIComponent(letter.from) + "&from=" + encodeURIComponent(letter.to);
    $("replyBtn").hidden = !letter.from;
    $("madeLink").href = HOME;

    const box = $("photos");
    box.textContent = "";
    box.className = "photos" + (letter.photos.length === 1 ? " one" : "");
    box.hidden = !letter.photos.length;
    for (const p of letter.photos) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "photo";
      b.setAttribute("aria-label", p.cap ? "Photo: " + p.cap : "Photo");
      const img = document.createElement("img");
      img.src = p.src; img.alt = p.cap || ""; img.loading = "lazy";
      const cap = document.createElement("span");
      cap.textContent = p.cap;
      b.append(img, cap);
      b.addEventListener("click", () => openLightbox(p));
      box.appendChild(b);
    }
    setupVoice();
  }

  // the words write themselves the first time; a tap on the paper finishes them at once
  function typeBody(instant) {
    const body = $("pBody"), text = letter.msg;
    if (stopTyping) stopTyping();
    const finish = () => { body.textContent = text; paper.classList.add("done"); typed = true; stopTyping = null; };
    if (instant || reduce || typed || !text) { finish(); return; }
    paper.classList.remove("done");
    const chars = Array.from(text);
    const total = clamp(chars.length * 26, 1200, 7500);
    const node = document.createTextNode(""), caret = document.createElement("span");
    caret.className = "caret";
    body.textContent = "";
    body.append(node, caret);
    let raf = 0, t0 = 0, stopped = false;
    const onTap = () => stopTyping && stopTyping();
    stopTyping = () => { stopped = true; cancelAnimationFrame(raf); paper.removeEventListener("click", onTap); finish(); };
    paper.addEventListener("click", onTap);
    (function step(now) {
      if (stopped) return;
      if (!t0) t0 = now || performance.now();
      const n = Math.floor(chars.length * clamp(((now || t0) - t0) / total));
      node.data = chars.slice(0, n).join("");
      if (n >= chars.length) { stopTyping(); return; }
      raf = requestAnimationFrame(step);
    })();
  }

  function openSheet(instant) {
    if (sheetOpen) return;
    sheetOpen = true;
    $("hello").classList.add("dim");
    envelope.classList.add("away");
    show(sheet);
    sheet.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.classList.add("in");
      setTimeout(() => typeBody(instant), instant || reduce ? 0 : 650);
    }));
    if (!PREVIEW) paper.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    if (stopTyping) stopTyping();
    voiceAudio.pause();
    sheet.classList.remove("in");
    $("hello").classList.remove("dim");
    $("envLabel").textContent = "read it again";
    envelope.classList.remove("away");
    setTimeout(() => { if (!sheetOpen) hide(sheet); }, reduce ? 0 : 700);
  }
  envelope.addEventListener("click", () => {
    if (envelope.classList.contains("open")) { openSheet(); return; }
    envelope.classList.add("open");
    setTimeout(openSheet, reduce ? 0 : 1350);
  });
  $("backBtn").addEventListener("click", closeSheet);

  // ---------- voice note ----------
  const voiceAudio = $("voiceAudio");
  const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  let voiceReady = false;
  function setupVoice() {
    const box = $("voice");
    box.hidden = !letter.voice;
    if (!letter.voice) { voiceAudio.removeAttribute("src"); return; }
    voiceAudio.src = letter.voice;
    if (voiceReady) return;
    voiceReady = true;
    const fill = $("voiceFill"), time = $("voiceTime");
    const known = () => isFinite(voiceAudio.duration) && voiceAudio.duration > 0;
    const paint = () => {
      fill.style.width = known() ? (voiceAudio.currentTime / voiceAudio.duration) * 100 + "%" : "0";
      time.textContent = voiceAudio.paused && voiceAudio.currentTime === 0 && known() ? mmss(voiceAudio.duration) : mmss(voiceAudio.currentTime);
    };
    $("voiceBtn").addEventListener("click", () => { if (voiceAudio.paused) voiceAudio.play().catch(() => {}); else voiceAudio.pause(); });
    $("voiceTrack").addEventListener("click", (e) => {
      if (!known()) return;
      const r = e.currentTarget.getBoundingClientRect();
      voiceAudio.currentTime = clamp((e.clientX - r.left) / r.width) * voiceAudio.duration;
    });
    voiceAudio.addEventListener("play", () => { box.classList.add("playing"); $("voiceBtn").setAttribute("aria-label", "Pause the voice note"); bgm.volume = 0.12; });
    const quiet = () => { box.classList.remove("playing"); $("voiceBtn").setAttribute("aria-label", "Play the voice note"); bgm.volume = BGM_VOL; paint(); };
    voiceAudio.addEventListener("pause", quiet);
    voiceAudio.addEventListener("ended", () => { voiceAudio.currentTime = 0; quiet(); });
    voiceAudio.addEventListener("timeupdate", paint);
    voiceAudio.addEventListener("loadedmetadata", paint);
  }

  // ---------- photo viewer ----------
  const lightbox = $("lightbox");
  function openLightbox(p) {
    $("lightboxImg").src = p.src;
    $("lightboxImg").alt = p.cap || "";
    $("lightboxCap").textContent = p.cap;
    show(lightbox);
  }
  lightbox.addEventListener("click", () => hide(lightbox));
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!lightbox.hidden) hide(lightbox);
    else if (sheetOpen && !PREVIEW) closeSheet();
  });

  // ---------- save the letter as a picture ----------
  function wrapLines(g, text, maxW) {
    const out = [];
    for (const para of text.split("\n")) {
      if (!para.trim()) { out.push(""); continue; }
      let lineStr = "";
      for (const word of para.split(/(\s+)/)) {
        if (g.measureText(lineStr + word).width <= maxW) { lineStr += word; continue; }
        if (lineStr.trim()) { out.push(lineStr.trimEnd()); lineStr = ""; }
        let w = word.trimStart();
        while (g.measureText(w).width > maxW) { // a word longer than the line: break it
          let n = w.length;
          while (n > 1 && g.measureText(w.slice(0, n)).width > maxW) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        lineStr = w;
      }
      out.push(lineStr.trimEnd());
    }
    return out;
  }
  function loadImage(src) {
    return new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; });
  }
  async function saveImage() {
    const btn = $("saveBtn");
    btn.disabled = true;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const css = getComputedStyle(paper);
      const v = (n) => css.getPropertyValue(n).trim();
      const script = letter.hand === "script";
      const W = 1080, PAD = 96, IN = W - PAD * 2;
      const fBody = script ? '400 46px Caveat, cursive' : '400 37px "Cormorant Garamond", Georgia, serif';
      const fTo = script ? '500 72px Caveat, cursive' : 'italic 400 66px "Cormorant Garamond", Georgia, serif';
      const fFrom = script ? '500 54px Caveat, cursive' : 'italic 400 46px "Cormorant Garamond", Georgia, serif';
      const fMono = '500 19px ui-monospace, Menlo, Consolas, monospace';
      const fCap = '500 32px Caveat, cursive';
      const LH = script ? 62 : 58;

      const probe = document.createElement("canvas").getContext("2d");
      probe.font = fBody;
      const lines = wrapLines(probe, letter.msg, IN);
      const photos = (await Promise.all(letter.photos.map((p) => loadImage(p.src)))).map((im, i) => ({ im, cap: letter.photos[i].cap })).filter((p) => p.im);
      const cols = photos.length === 1 ? 1 : 2, gap = 36;
      const cell = cols === 1 ? Math.round(IN * 0.7) : (IN - gap) / 2;
      const photoRows = Math.ceil(photos.length / cols);
      const photoH = photoRows ? photoRows * (cell + 78) + (photoRows - 1) * gap + 60 : 0;

      const top = PAD + 70;
      const H = Math.ceil(top + 96 + lines.length * LH + (letter.from ? 110 : 30) + photoH + 120);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, v("--paper")); bg.addColorStop(1, v("--paper-edge"));
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      const sprig = await loadImage(T.peony.sprig(520, SPRIGS[letter.paper] || SPRIGS.ivory, 7));
      if (sprig) g.drawImage(sprig, W - 300, -56, 330, 330);

      g.textBaseline = "alphabetic";
      g.fillStyle = v("--soft");
      g.font = fMono;
      if (letter.sent) g.fillText(new Date(letter.sent).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }).toUpperCase().split("").join(" "), PAD, PAD);
      g.fillStyle = v("--accent");
      g.font = fTo;
      let toText = letter.to ? "For " + letter.to : "For you";
      while (g.measureText(toText).width > IN - 300 && toText.length > 8) toText = toText.slice(0, -2) + "…";
      g.fillText(toText, PAD, top + 30);

      g.fillStyle = v("--ink");
      g.font = fBody;
      let y = top + 96 + LH * 0.5;
      for (const l of lines) { g.fillText(l, PAD, y); y += LH; }

      if (letter.from) {
        g.fillStyle = v("--accent");
        g.font = fFrom;
        g.textAlign = "right";
        g.fillText("— " + letter.from, W - PAD, y + 40);
        g.textAlign = "left";
        y += 110;
      } else y += 30;

      if (photos.length) {
        y += 30;
        const x0 = cols === 1 ? (W - cell) / 2 : PAD;
        photos.forEach((p, i) => {
          const px = x0 + (i % cols) * (cell + gap), py = y + Math.floor(i / cols) * (cell + 78 + gap);
          g.save();
          g.shadowColor = "rgba(0,0,0,0.22)"; g.shadowBlur = 24; g.shadowOffsetY = 8;
          g.fillStyle = "#fffdf8";
          g.fillRect(px, py, cell, cell + 78);
          g.restore();
          const s = Math.min(p.im.width, p.im.height); // centre-crop to a square
          g.drawImage(p.im, (p.im.width - s) / 2, (p.im.height - s) / 2, s, s, px + 14, py + 14, cell - 28, cell - 28);
          if (p.cap) { g.fillStyle = "#4a4234"; g.font = fCap; g.textAlign = "center"; g.fillText(p.cap, px + cell / 2, py + cell + 44, cell - 30); g.textAlign = "left"; }
        });
      }
      g.fillStyle = v("--soft");
      g.font = fMono;
      g.textAlign = "center";
      g.fillText("T E N D E R L Y", W / 2, H - 52);

      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      const a = document.createElement("a");
      const slug = (letter.from || "someone").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "someone";
      a.href = URL.createObjectURL(blob);
      a.download = "letter-from-" + slug + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      btn.textContent = "Saved";
    } catch (e) {
      btn.textContent = "Couldn't save";
    }
    setTimeout(() => { btn.textContent = "Save as image"; btn.disabled = false; }, 1800);
  }
  $("saveBtn").addEventListener("click", saveImage);

  // ================= the composer's live preview =================
  // The create page shows this very page in a frame and posts the letter as it is typed.
  function previewMode() {
    document.body.classList.add("preview");
    let first = true;
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== "tenderly-preview") return;
      const prev = letter;
      letter = codec.tidy(e.data.letter);
      setWords();
      if (first) {
        first = false;
        buildScene();
        scene.start();
      } else if (prev.flower !== letter.flower || prev.look !== letter.look) {
        scene.setWorld(letter.flower);
        scene.setLook(letter.look);
        scene.restart();
      }
      typed = true; // in the preview the words are simply there
      fillPaper();
      if (sheetOpen) typeBody(true);
      if (e.data.show === "letter") { envelope.classList.add("open"); openSheet(true); }
      else if (sheetOpen) { closeSheet(); envelope.classList.remove("open"); $("envLabel").textContent = "tap to open your letter"; }
    });
    if (window.parent !== window) window.parent.postMessage({ type: "tenderly-preview-ready" }, location.origin);
  }

  // ================= begin =================
  async function main() {
    if (PREVIEW) { previewMode(); return; }
    let sealed;
    try { sealed = await load(); } catch (e) { showBroken(e.kind); return; }
    const locked = codec.isLocked(sealed);
    if (sealed.o && sealed.o > Date.now() + skew) await sealedUntil(sealed.o, locked ? "" : codec.line(sealed.d.to, 40));
    letter = codec.tidy(locked ? await askPassphrase(sealed) : sealed.d);
    fillPaper();
    openGate();
  }
  main();
})();
