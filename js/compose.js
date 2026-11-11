// The composer. Gathers the letter, shows it live in the real letter page, keeps a draft on this
// device, and turns it into something to send: a private link, a heart QR code, or a keepsake file.
(function () {
  "use strict";
  const codec = window.Tenderly.codec;
  const $ = (id) => document.getElementById(id);
  const radio = (name) => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;
  const setRadio = (name, value) => { const el = document.querySelector(`input[name="${name}"][value="${value}"]`); if (el) el.checked = true; };

  const to = $("to"), from = $("from"), msg = $("msg"), pv = $("pv");
  const DRAFT_KEY = "tenderly-draft-v1";
  // Opened straight from a folder, pages have no real origin to name or compare, so the preview
  // messages are checked by which window sent them instead.
  const FROM_FOLDER = location.protocol === "file:" || location.origin === "null";

  // What the site can do here. "short": encrypted short links (Vercel + storage).
  // "long": the server is there but has no storage. "static": plain file hosting, no server at all.
  let mode = "static";
  const ready = (FROM_FOLDER ? Promise.resolve(null) : fetch("api/letters", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)))
    .then((j) => { if (j && typeof j.ok === "boolean") mode = j.ok ? "short" : "long"; })
    .catch(() => {});

  let photos = []; // [{ src, cap }]
  let voice = null; // data URL

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 2000);
  }

  // ================= the letter as it stands =================
  function gather() {
    return codec.tidy({
      to: to.value, from: from.value, msg: msg.value,
      paper: radio("paper"), hand: radio("hand"), flower: radio("flower"), look: radio("look"),
      music: $("music").checked, photos, voice, sent: Date.now(),
    });
  }

  // ================= live preview =================
  let pvReady = false, show = "flowers", pvTimer = 0;
  pv.src = "letter.html?preview=1";
  window.addEventListener("message", (e) => {
    if (e.source !== pv.contentWindow || !e.data || e.data.type !== "tenderly-preview-ready") return;
    if (!FROM_FOLDER && e.origin !== location.origin) return;
    pvReady = true;
    pushPreview();
  });
  function pushPreview() {
    if (!pvReady) return;
    const letter = gather();
    letter.voice = null; // the preview never plays sound
    if (!letter.msg) letter.msg = "Your words will appear here as you write.";
    pv.contentWindow.postMessage({ type: "tenderly-preview", letter, show }, FROM_FOLDER ? "*" : location.origin);
  }
  function setTab(next) {
    show = next;
    $("tabFlowers").setAttribute("aria-pressed", String(show === "flowers"));
    $("tabLetter").setAttribute("aria-pressed", String(show === "letter"));
    $("shield").hidden = show === "letter"; // the letter can be scrolled; the flowers have nothing to press
    pushPreview();
  }
  $("tabFlowers").addEventListener("click", () => setTab("flowers"));
  $("tabLetter").addEventListener("click", () => setTab("letter"));
  msg.addEventListener("focus", () => { if (show !== "letter") setTab("letter"); });

  // ================= drafts =================
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        to: to.value, from: from.value, msg: msg.value,
        paper: radio("paper"), hand: radio("hand"), flower: radio("flower"), look: radio("look"),
        music: $("music").checked,
      }));
      $("draftNote").hidden = !(to.value || from.value || msg.value);
    } catch (e) { /* private window or storage full: the page works without drafts */ }
  }
  function loadDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) {}
    if (d) {
      to.value = d.to || ""; from.value = d.from || ""; msg.value = d.msg || "";
      ["paper", "hand", "flower", "look"].forEach((k) => d[k] && setRadio(k, d[k]));
      $("music").checked = d.music !== false;
      $("draftNote").hidden = !(to.value || from.value || msg.value);
    }
    // "Write back" on a letter lands here with the two names swapped (after the "#", so no server sees them)
    if (/^#reply\b/.test(location.hash)) {
      const q = new URLSearchParams(location.hash.slice(1));
      const rTo = codec.line(q.get("to"), 40), rFrom = codec.line(q.get("from"), 40);
      if (rTo) { to.value = rTo; if (rFrom) from.value = rFrom; msg.value = d && d.to === rTo ? msg.value : ""; }
      if (rTo) { $("replyNote").textContent = "Writing back to " + rTo; $("replyNote").hidden = false; }
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
  }
  function onInput() {
    $("count").textContent = msg.value.length + " / 4000";
    if (msg.value.trim()) $("msgErr").hidden = true;
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => { pushPreview(); saveDraft(); }, 180);
  }
  $("f").addEventListener("input", onInput);
  $("f").addEventListener("change", onInput);

  // ================= photos =================
  // Shrunk in the browser before they travel: smaller when the whole letter must fit in a link.
  function shrink(file) {
    const max = mode === "short" ? 1000 : 560, quality = mode === "short" ? 0.76 : 0.55;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }
  function drawThumbs() {
    const box = $("thumbs");
    box.textContent = "";
    photos.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "thumb";
      const img = document.createElement("img");
      img.src = p.src; img.alt = "Photo " + (i + 1);
      const cap = document.createElement("input");
      cap.maxLength = 60; cap.placeholder = "A few words under it"; cap.value = p.cap;
      cap.setAttribute("aria-label", "Caption for photo " + (i + 1));
      cap.addEventListener("input", () => { p.cap = cap.value; });
      const x = document.createElement("button");
      x.type = "button"; x.textContent = "×";
      x.setAttribute("aria-label", "Remove photo " + (i + 1));
      x.addEventListener("click", () => { photos.splice(i, 1); drawThumbs(); pushPreview(); });
      row.append(img, cap, x);
      box.appendChild(row);
    });
    $("photoAdd").hidden = photos.length >= codec.LIMITS.photos;
  }
  $("photos").addEventListener("change", async (e) => {
    await ready;
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    let skipped = 0;
    for (const f of files) {
      if (photos.length >= codec.LIMITS.photos) { skipped++; continue; }
      try { photos.push({ src: await shrink(f), cap: "" }); } catch (err) { skipped++; }
    }
    drawThumbs();
    pushPreview();
    if (skipped) toast(photos.length >= codec.LIMITS.photos ? "Four photos is the most a letter holds" : "One photo couldn't be read");
  });

  // ================= voice note =================
  const MAX_VOICE_SECONDS = 60;
  let recorder = null, recTimer = 0;
  const voiceLimit = () => (mode === "short" ? 1500000 : 400000);
  function showVoice(state) {
    $("voiceIdle").hidden = state !== "idle";
    $("voiceRec").hidden = state !== "rec";
    $("voiceDone").hidden = state !== "done";
  }
  function setVoice(dataUrl) {
    voice = dataUrl;
    if (voice) { $("voicePlay").src = voice; showVoice("done"); }
    else { $("voicePlay").removeAttribute("src"); showVoice("idle"); }
  }
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  function voiceProblem(text) { $("voiceTip").textContent = text; $("voiceTip").classList.add("warn"); }

  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) $("recBtn").hidden = true;
  $("recBtn").addEventListener("click", async () => {
    await ready;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { voiceProblem("The microphone isn't available. Allow it in your browser, or choose a recording instead."); return; }
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const chunks = [];
    recorder = new MediaRecorder(stream, Object.assign({ audioBitsPerSecond: 32000 }, type ? { mimeType: type } : {}));
    recorder.addEventListener("dataavailable", (e) => { if (e.data.size) chunks.push(e.data); });
    recorder.addEventListener("stop", async () => {
      clearInterval(recTimer);
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" });
      recorder = null;
      if (!blob.size) { showVoice("idle"); voiceProblem("Nothing was recorded. Try again."); return; }
      if (blob.size > voiceLimit()) { showVoice("idle"); voiceProblem("That recording is too large to send. Try a shorter one."); return; }
      setVoice(await blobToDataUrl(blob));
    });
    const t0 = Date.now();
    $("recTime").textContent = "0:00";
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $("recTime").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      if (s >= MAX_VOICE_SECONDS && recorder) recorder.stop();
    }, 250);
    recorder.start();
    showVoice("rec");
  });
  $("recStop").addEventListener("click", () => { if (recorder) recorder.stop(); });
  $("voiceFile").addEventListener("change", async (e) => {
    await ready;
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > voiceLimit()) { voiceProblem(`That file is too large (the most is about ${Math.round(voiceLimit() / 100000) / 10} MB). Try a shorter clip.`); return; }
    const url = await blobToDataUrl(f);
    if (!codec.tidy({ voice: url }).voice) { voiceProblem("That file isn't a sound recording."); return; }
    setVoice(url);
  });
  $("voiceRemove").addEventListener("click", () => setVoice(null));

  // ================= sealing and sending =================
  let current = { link: "", fragment: "", letter: null };

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("make");
    if (btn.disabled) return;
    const letter = gather();
    if (!letter.msg) { $("msgErr").hidden = false; msg.focus(); return; }

    btn.disabled = true;
    btn.textContent = "Sealing…";
    try {
      await ready;
      const fragment = await codec.toFragment(letter);
      let link = "", kind = "long";
      if (mode === "short") {
        try {
          const { key, record } = await codec.lockForServer(letter);
          const r = await fetch("api/letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
          if (r.ok) { link = location.origin + "/s/" + (await r.json()).id + "#k=" + key; kind = "short"; }
        } catch (err) { /* fall back to a link that carries the letter itself */ }
      }
      if (!link) link = (mode === "static" ? new URL("letter.html", location.href).href : location.origin + "/l") + "#" + fragment;
      current = { link, fragment, letter, kind };
      showResult();
    } catch (err) {
      toast("Something went wrong sealing the letter. Try again.");
    }
    btn.disabled = false;
    btn.textContent = "Seal the letter";
  });

  function showResult() {
    const { link, kind, letter } = current;
    $("resultTitle").textContent = letter.to ? "Your letter for " + letter.to + " is sealed." : "Your letter is sealed.";
    const notes = [];
    if (kind === "short") notes.push("Send this link. The letter was locked in your browser first; the key is the part after the #, which never leaves the link.");
    else notes.push("Send this link. The whole letter lives inside it (after the #) and is stored nowhere else.");
    if (kind === "long" && link.length > 6000) notes.push("It is a long link because of what's tucked inside, and some chat apps cut long links short. If it arrives broken, send the keepsake file instead.");
    $("resultNote").textContent = notes.join(" ");
    $("link").textContent = link;
    $("open").href = link;
    $("share").hidden = !navigator.share;
    $("qrbox").hidden = true;
    $("makeqr").hidden = link.length > 900 || !window.drawHeartQR; // a QR can only hold a short link
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectLink() {
    const r = document.createRange();
    r.selectNodeContents($("link"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    toast("Press Copy to copy the link");
  }
  $("copy").addEventListener("click", () => {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(current.link).then(() => toast("Link copied")).catch(selectLink);
    else selectLink();
  });
  $("share").addEventListener("click", () => {
    navigator.share({ title: current.letter.to ? "A letter for " + current.letter.to : "A letter for you", url: current.link }).catch(() => {});
  });
  $("again").addEventListener("click", () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    $("f").reset();
    photos = []; drawThumbs(); setVoice(null);
    $("result").hidden = true;
    $("draftNote").hidden = true;
    $("replyNote").hidden = true;
    onInput();
    window.scrollTo({ top: 0, behavior: "smooth" });
    to.focus();
  });

  const slug = (s) => codec.line(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "you";
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- heart QR (from Rebloom) ----------
  let plainQR = false;
  function drawQR() {
    (plainQR ? window.drawPlainQR : window.drawHeartQR)($("qr"), current.link);
    $("qrstyle").textContent = plainQR ? "Back to the heart QR" : "Not scanning? Use a plain QR";
  }
  $("qrstyle").addEventListener("click", () => { plainQR = !plainQR; drawQR(); });
  $("makeqr").addEventListener("click", () => {
    plainQR = false;
    drawQR();
    $("qrbox").hidden = false;
    $("makeqr").hidden = true;
    let canShareFiles = false;
    try { canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) {}
    $("qrshare").hidden = !canShareFiles;
    $("qrbox").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  const qrName = () => "letter-for-" + slug(current.letter.to) + "-qr.png";
  $("qrsave").addEventListener("click", () => $("qr").toBlob((blob) => { download(blob, qrName()); toast("QR saved"); }, "image/png"));
  $("qrshare").addEventListener("click", () => $("qr").toBlob((blob) => {
    navigator.share({ files: [new File([blob], qrName(), { type: "image/png" })], title: "A letter for you" }).catch(() => {});
  }, "image/png"));

  // ---------- keepsake file ----------
  // One HTML file with the letter page, its scripts and styles, the music and the letter itself
  // inside. It opens straight from a phone or laptop, with no site behind it.
  async function buildKeepsake() {
    const text = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.text(); };
    let html = await text("letter.html");
    const cssHref = /<link rel="stylesheet" href="(css\/[^"]+)">/.exec(html);
    const css = await text(cssHref[1]);
    const scripts = [];
    html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => { scripts.push(src); return m; });
    const code = await Promise.all(scripts.map((s) => text(s)));
    let audio = "";
    if (current.letter.music) {
      try { const r = await fetch("audio/bloom.mp3"); if (r.ok) audio = await blobToDataUrl(await r.blob()); } catch (e) {}
    }
    const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const boot = "window.__TENDERLY_KEEPSAKE=" + JSON.stringify({ letter: current.fragment, audio, home: new URL("./", location.href).href }).replace(/</g, "\\u003c") + ";";
    html = html
      .replace("<!--META-->", () => "<title>" + esc(current.letter.to ? "For " + current.letter.to : "A letter for you") + "</title>")
      .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n?/g, "")
      .replace(cssHref[0], () => "<style>\n" + css + "\n</style>");
    scripts.forEach((src, i) => {
      html = html.replace(`<script src="${src}"></script>`, () => "<script>\n" + (i === 0 ? boot + "\n" : "") + safe(code[i]) + "\n</script>");
    });
    return new Blob([html], { type: "text/html" });
  }
  $("keep").addEventListener("click", async () => {
    const btn = $("keep");
    btn.disabled = true;
    btn.textContent = "Wrapping…";
    try {
      download(await buildKeepsake(), "letter-for-" + slug(current.letter.to) + ".html");
      toast("Keepsake saved");
    } catch (e) { toast(location.protocol === "file:" ? "The keepsake can only be made from the website, not from a folder" : "Couldn't build the keepsake. Check your connection."); }
    btn.disabled = false;
    btn.textContent = "Download keepsake file";
  });

  // ================= begin =================
  ready.then(() => {
    if (mode !== "short") {
      $("privacy").textContent = "Your whole letter travels inside its link. It is stored nowhere else, and this site never sees it.";
      $("photoTip").textContent = "Up to 4. They are kept small so the letter still fits in its link.";
    }
  });
  loadDraft();
  showVoice("idle");
  onInput();
})();
