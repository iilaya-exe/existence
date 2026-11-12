// The recipient's side. In order: read the letter out of the link, then: their name in an empty
// room -> a tap -> music, and a wrapped bouquet grows -> an envelope beside it -> the letter on
// paper. It is one-way: there is nothing here for sending anything back.
(function () {
  "use strict";
  const T = window.Tenderly;
  const codec = T.codec;
  const { clamp } = T.kit;
  const $ = (id) => document.getElementById(id);

  const PREVIEW = new URLSearchParams(location.search).get("preview") === "1"; // the composer's live preview: no gate, no sound
  const KEEP = window.__TENDERLY_KEEPSAKE || null; // a saved keepsake file carries its letter and music inside
  const MUSIC = KEEP ? KEEP.audio : "audio/bloom.mp3";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Opened straight from a folder, pages have no real origin to name or compare, so the preview
  // messages are checked by which window sent them instead.
  const FROM_FOLDER = location.protocol === "file:" || location.origin === "null";

  const envelope = $("envelope"), envLabel = $("envLabel");
  let letter = null;
  let scene = null;

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
    let r;
    try { r = await fetch("/api/letters?id=" + id, { cache: "no-store" }); } catch (e) { throw fail("offline"); }
    if (r.status === 404) throw fail("gone");
    if (!r.ok) throw fail("offline");
    try { return await codec.unlockFromServer(await r.json(), key); } catch (e) { throw fail("broken"); }
  }

  function showBroken(kind) {
    const words = {
      empty: ["There's no letter here yet.", "This page opens letters, and this link doesn't carry one."],
      gone: ["This letter can't be found.", "It may have been removed, or the link is incomplete. Ask whoever sent it to copy it again."],
      offline: ["Couldn't reach your letter.", "Check your connection, then open the link again."],
      broken: ["This letter lost its way.", "The link may be incomplete. Ask whoever sent it to copy it again."],
    }[kind] || null;
    if (words) { $("brokenTitle").textContent = words[0]; $("brokenNote").textContent = words[1]; }
    show($("broken"));
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
    scene = T.createScene($("stage"), { world: letter.flower, look: letter.look, wrap: letter.paper, autoQuality: !PREVIEW }); // the bouquet is wrapped in the letter's paper
    scene.fadeSource = musicFade;
    scene.onLayout = placeEnvelope;
    placeEnvelope(scene.metrics());
    scene.onGrown = () => {
      $("hello").classList.add("show");
      setTimeout(() => {
        show(envelope); show(envLabel);
        requestAnimationFrame(() => requestAnimationFrame(() => { envelope.classList.add("in"); envLabel.classList.add("in"); }));
      }, reduce ? 0 : 700);
    };
  }
  // The envelope rests on the table to the right of the wrapped stems, clear of the flowers.
  // m: where the stage sits on screen (see scene.metrics); world units below are the stage's.
  function placeEnvelope(m) {
    const w = clamp(340 * m.scale, 104, 250);
    const x = Math.min(m.x + 286 * m.scale, window.innerWidth - w / 2 - 10);
    envelope.style.setProperty("--ew", w.toFixed(1) + "px");
    envelope.style.setProperty("--ex", x.toFixed(1) + "px");
    envelope.style.setProperty("--ey", (m.table + 150 * m.scale).toFixed(1) + "px");
  }
  function setWords() {
    $("gateName").textContent = letter.to || "for you";
    $("helloTo").textContent = letter.to ? "for " + letter.to : "for you";
    $("helloFrom").textContent = letter.from ? "a letter from " + letter.from : "a letter";
    if (!PREVIEW) document.title = letter.to ? "For " + letter.to : "A letter for you";
  }

  function openGate() {
    const gate = $("gate");
    setWords();
    setupMusic();
    buildScene();
    show(gate);
    gate.addEventListener("click", () => {
      if (musicOn) { bgm.muted = false; startMusic(true); show(snd); }
      gate.classList.add("leaving");
      setTimeout(() => hide(gate), 750);
      scene.start();
    }, { once: true });
  }

  // ================= the envelope and the letter =================
  const sheet = $("sheet"), paper = $("paper");
  let typed = false, sheetOpen = false, stopTyping = null;

  const SPRIGS = { ivory: ["blush", "rose"], blush: ["cream", "rose"], kraft: ["cream", "coral"], midnight: ["blush", "lilac"] };
  function fillPaper() {
    paper.className = "paper " + letter.paper + (letter.hand === "script" ? " script" : "");
    const blooms = SPRIGS[letter.paper] || SPRIGS.ivory;
    $("sprig").src = T.peony.sprig(380, blooms, 7);
    $("sprigLow").src = T.peony.sprig(260, [blooms[1]], 19);
    $("pTo").textContent = letter.to || "you";
    // the envelope's letter, and the sheet that unfolds from it, are made of this same paper
    const look = getComputedStyle(paper), page = document.documentElement.style;
    page.setProperty("--letter-paper", look.getPropertyValue("--paper"));
    page.setProperty("--letter-paper-edge", look.getPropertyValue("--paper-edge"));
    page.setProperty("--letter-soft", look.getPropertyValue("--soft"));
    $("pFrom").textContent = letter.from ? "— " + letter.from : "";
    $("pFrom").hidden = !letter.from;

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
    envLabel.classList.remove("in");
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
    envLabel.textContent = "read it again";
    envelope.classList.remove("away");
    envLabel.classList.add("in");
    setTimeout(() => { if (!sheetOpen) hide(sheet); }, reduce ? 0 : 700);
  }
  // ---------- the opening ----------
  // The first time, the envelope is lifted off the table into the middle of the screen, its seal
  // breaks, the flap opens, and the letter slides out and unfolds into the page. Each step is a
  // CSS transition; this only sets them going in order. A tap during it skips to the open letter.
  const opener = $("opener"), opSheet = $("opSheet");
  let opening = null; // the timers of an opening in progress
  function openEnvelope() {
    if (opening || sheetOpen) return;
    const px = (name) => parseFloat(envelope.style.getPropertyValue(name)) || 0;
    const ew = px("--ew"), ex = px("--ex"), ey = px("--ey"); // where the envelope rests on the table
    const vw = window.innerWidth, vh = window.innerHeight;
    const ow = Math.min(300, vw * 0.76), oh = (ow * 2) / 3;
    const cx = vw / 2, bottom = Math.min(vh * 0.62 + oh / 2, vh - 36); // where it is held up
    opener.className = "opener";
    opSheet.removeAttribute("style");
    opener.style.setProperty("--ow", ow + "px");
    opener.style.setProperty("--ol", cx - ow / 2 + "px");
    opener.style.setProperty("--ot", bottom - oh + "px");
    // begin exactly over the resting envelope, then let go: it travels to the middle
    opener.style.transition = "none";
    opener.style.transform = `translate(${ex - cx}px, ${ey - bottom}px) scale(${ew / ow}) rotate(-5deg)`;
    show(opener);
    envelope.classList.add("gone");
    envLabel.classList.remove("in");
    $("hello").classList.add("dim");
    sheet.classList.add("staged", "veil");
    show(sheet);
    sheet.scrollTop = 0;
    void opener.offsetWidth; // take the starting position before the transition is switched back on
    opener.style.transition = "";
    opener.style.transform = "none";

    opening = [];
    const at = (ms, fn) => opening.push(setTimeout(fn, ms));
    at(520, () => opener.classList.add("unsealed"));
    at(1080, () => opener.classList.add("flap-up", "risen"));
    at(1800, () => { // unfold: from where the little sheet is now to where the page lies
      const o = opener.getBoundingClientRect(), from = opSheet.getBoundingClientRect(), to = paper.getBoundingClientRect();
      const put = (r) => Object.assign(opSheet.style, { left: r.left - o.left + "px", top: r.top - o.top + "px", width: r.width + "px", height: r.height + "px", right: "auto" });
      opSheet.style.transition = "none";
      opSheet.style.transform = "none";
      put(from);
      void opSheet.offsetWidth;
      opSheet.style.transition = "";
      opener.classList.add("unfold");
      put(to);
    });
    at(2620, landLetter);
  }
  // the page itself takes over from the unfolded sheet, and the words begin
  function landLetter() {
    if (!opening) return;
    opening.forEach(clearTimeout);
    opening = null;
    sheetOpen = true;
    sheet.classList.add("in"); // staged: the page appears at once, already in place
    envelope.classList.remove("gone");
    envelope.classList.add("open", "away");
    if (opener.classList.contains("unfold")) opSheet.style.opacity = "0"; // the stand-in sheet fades off the page
    else hide(opener); // skipped before the letter was out: the envelope just goes
    setTimeout(() => { hide(opener); sheet.classList.remove("staged", "veil"); }, 380);
    setTimeout(() => typeBody(false), 160);
    paper.focus({ preventScroll: true });
  }
  sheet.addEventListener("click", () => { if (opening) landLetter(); });

  envelope.addEventListener("click", () => {
    if (envelope.classList.contains("open")) openSheet();      // read again: the page simply returns
    else if (reduce) { envelope.classList.add("open"); openSheet(); }
    else openEnvelope();
  });
  envLabel.addEventListener("click", () => envelope.click());
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
    else if (opening) landLetter();
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
      const fMono = '500 19px Karla, system-ui, sans-serif';
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

      const top = PAD + 124; // the words begin below the sprig in the corner
      const H = Math.ceil(top + 150 + lines.length * LH + (letter.from ? 110 : 30) + photoH + 210);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, v("--paper")); bg.addColorStop(1, v("--paper-edge"));
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // the double frame
      g.strokeStyle = v("--soft");
      g.lineWidth = 2;
      g.globalAlpha = 0.4; g.strokeRect(22, 22, W - 44, H - 44);
      g.globalAlpha = 0.2; g.strokeRect(31, 31, W - 62, H - 62);
      g.globalAlpha = 1;

      const blooms = SPRIGS[letter.paper] || SPRIGS.ivory;
      const sprig = await loadImage(T.peony.sprig(520, blooms, 7));
      if (sprig) g.drawImage(sprig, W - 372, -84, 420, 420);
      const low = await loadImage(T.peony.sprig(360, [blooms[1]], 19));
      if (low) { g.save(); g.translate(96, H - 96); g.rotate(-0.42); g.drawImage(low, -130, -130, 260, 260); g.restore(); }

      g.textBaseline = "alphabetic";
      g.fillStyle = v("--soft");
      g.font = fMono;
      g.fillText("A LETTER FOR".split("").join("\u200a"), PAD, top - 44);
      g.fillStyle = v("--hue");
      g.font = fTo;
      let toText = letter.to || "you";
      while (g.measureText(toText).width > IN - 300 && toText.length > 8) toText = toText.slice(0, -2) + "…";
      g.fillText(toText, PAD, top + 30);
      // the little flower and its line
      g.save();
      g.translate(PAD + 13, top + 76);
      for (let k = 0; k < 5; k++) { g.rotate((Math.PI * 2) / 5); g.beginPath(); g.ellipse(0, -8, 4.6, 8, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      const line = g.createLinearGradient(PAD + 40, 0, PAD + IN - 260, 0);
      line.addColorStop(0, v("--hue")); line.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.55; g.fillStyle = line; g.fillRect(PAD + 40, top + 75, IN - 300, 2); g.globalAlpha = 1;

      g.fillStyle = v("--pen");
      g.font = fBody;
      let y = top + 150 + LH * 0.5;
      for (const l of lines) { g.fillText(l, PAD, y); y += LH; }

      if (letter.from) {
        g.fillStyle = v("--hue");
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
      g.fillText("T E N D E R L Y", W / 2, H - 64);

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
      if (e.source !== window.parent || !e.data || e.data.type !== "tenderly-preview") return;
      if (!FROM_FOLDER && e.origin !== location.origin) return;
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
        scene.setWrap(letter.paper);
        scene.restart();
      } else if (prev.paper !== letter.paper) scene.setWrap(letter.paper);
      typed = true; // in the preview the words are simply there
      fillPaper();
      if (sheetOpen) typeBody(true);
      if (e.data.show === "letter") { envelope.classList.add("open"); openSheet(true); }
      else if (sheetOpen) { closeSheet(); envelope.classList.remove("open"); envLabel.textContent = "tap to open your letter"; }
    });
    if (window.parent !== window) window.parent.postMessage({ type: "tenderly-preview-ready" }, FROM_FOLDER ? "*" : location.origin);
  }

  // ================= begin =================
  async function main() {
    if (PREVIEW) { previewMode(); return; }
    try { letter = codec.tidy(await load()); } catch (e) { showBroken(e.kind); return; }
    fillPaper();
    openGate();
  }
  main();
})();
