// How a letter travels.
//
//   letter  = { v, to, from, msg, paper, hand, flower, look, music, photos:[{src,cap}], voice, sent }
//   sealed  = { v:1, o: openAt (ms, 0 = none), d: letter }                 no passphrase
//           | { v:1, o, s: salt, i: iv, c: ciphertext }                   passphrase (PBKDF2 + AES-GCM)
//
// A sealed letter is gzipped and travels one of two ways:
//   long link   /l#z=<base64url>            everything lives after the "#", which browsers never send
//                                           to a server (#j= is the same without gzip, for old browsers)
//   short link  /s/<id>#k=<base64url key>   the gzipped bytes are encrypted in the browser with a random
//                                           key; the server stores only ciphertext, the key stays in the "#"
//
// Works in browsers and in Node (for the tests). No dependencies.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Tenderly = root.Tenderly || {}).codec = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  const subtle = root.crypto && root.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();

  const LIMITS = { to: 40, from: 40, msg: 4000, cap: 60, photos: 4 };

  // ---------- base64url ----------
  function toB64u(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64u(str) {
    const bin = atob(String(str).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ---------- gzip ----------
  const CAN_GZIP = typeof root.CompressionStream !== "undefined" && typeof root.DecompressionStream !== "undefined";
  async function pipe(bytes, stream) {
    const w = stream.writable.getWriter();
    w.write(bytes).catch(() => {}); // a stream error also rejects the read below, which is the one we surface
    w.close().catch(() => {});
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  const gzip = (bytes) => pipe(bytes, new root.CompressionStream("gzip"));
  const gunzip = (bytes) => pipe(bytes, new root.DecompressionStream("gzip"));

  // ---------- passphrase lock ----------
  async function passKey(passphrase, salt) {
    const material = await subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
    return subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  // letter (+ optional passphrase and open date) -> sealed
  async function seal(letter, o) {
    o = o || {};
    const openAt = Math.max(0, Math.floor(Number(o.openAt) || 0));
    if (!o.passphrase) return { v: 1, o: openAt, d: letter };
    const salt = root.crypto.getRandomValues(new Uint8Array(16));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await passKey(o.passphrase, salt);
    const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(letter)));
    return { v: 1, o: openAt, s: toB64u(salt), i: toB64u(iv), c: toB64u(new Uint8Array(ct)) };
  }
  const isLocked = (sealed) => !!(sealed && sealed.c);
  // sealed (+ passphrase if locked) -> letter. Throws on a wrong passphrase.
  async function unseal(sealed, passphrase) {
    if (!isLocked(sealed)) return sealed.d;
    const key = await passKey(passphrase || "", fromB64u(sealed.s));
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: fromB64u(sealed.i) }, key, fromB64u(sealed.c));
    return JSON.parse(dec.decode(pt));
  }

  // ---------- packing ----------
  // sealed -> bytes. First byte says how: 1 = gzip, 0 = plain JSON.
  async function pack(sealed) {
    const json = enc.encode(JSON.stringify(sealed));
    let body = json, mode = 0;
    if (CAN_GZIP) {
      try { const gz = await gzip(json); if (gz.length < json.length) { body = gz; mode = 1; } } catch (e) { /* keep plain */ }
    }
    const out = new Uint8Array(body.length + 1);
    out[0] = mode;
    out.set(body, 1);
    return out;
  }
  async function unpack(bytes) {
    const body = bytes.subarray(1);
    const json = bytes[0] === 1 ? await gunzip(body) : body;
    return check(JSON.parse(dec.decode(json)));
  }
  function check(sealed) {
    if (!sealed || sealed.v !== 1 || (!sealed.d && !sealed.c)) throw new Error("not a letter");
    return sealed;
  }

  // ---------- long links: the whole letter after the "#" ----------
  async function toFragment(sealed) {
    const bytes = await pack(sealed);
    return (bytes[0] === 1 ? "z=" : "j=") + toB64u(bytes.subarray(1));
  }
  async function fromFragment(frag) {
    const m = /^#?([zj])=([A-Za-z0-9_-]+)$/.exec(String(frag));
    if (!m) throw new Error("bad link");
    const body = fromB64u(m[2]);
    const bytes = new Uint8Array(body.length + 1);
    bytes[0] = m[1] === "z" ? 1 : 0;
    bytes.set(body, 1);
    return unpack(bytes);
  }

  // ---------- short links: ciphertext on the server, key after the "#" ----------
  async function lockForServer(sealed) {
    const raw = root.crypto.getRandomValues(new Uint8Array(32));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
    const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, await pack(sealed));
    // the open date is stored beside the ciphertext so the server can refuse to hand it out early
    return { key: toB64u(raw), record: { v: 1, i: toB64u(iv), c: toB64u(new Uint8Array(ct)), o: sealed.o || 0 } };
  }
  async function unlockFromServer(record, keyB64u) {
    const key = await subtle.importKey("raw", fromB64u(keyB64u), { name: "AES-GCM" }, false, ["decrypt"]);
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: fromB64u(record.i) }, key, fromB64u(record.c));
    return unpack(new Uint8Array(pt));
  }

  // ---------- tidy what people type ----------
  const line = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  const prose = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{4,}/g, "\n\n\n").replace(/[ \t]+$/gm, "").trim().slice(0, n);
  const pick = (v, list) => (list.indexOf(v) >= 0 ? v : list[0]);
  const PAPERS = ["ivory", "blush", "kraft", "midnight"];
  const HANDS = ["serif", "script"];
  const FLOWERS = ["peonies", "mixed", "lilies"];
  const LOOKS = ["ascii", "painted"];
  const isImage = (s) => typeof s === "string" && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  const isAudio = (s) => typeof s === "string" && /^data:audio\/[a-z0-9.+-]+(;[a-z0-9=.+ -]+)*;base64,[A-Za-z0-9+/=]+$/i.test(s);

  // Whatever arrives in a link is untrusted: keep only known fields, of known shape.
  function tidy(raw) {
    raw = raw || {};
    const photos = (Array.isArray(raw.photos) ? raw.photos : [])
      .filter((p) => p && isImage(p.src)).slice(0, LIMITS.photos)
      .map((p) => ({ src: p.src, cap: line(p.cap, LIMITS.cap) }));
    return {
      v: 1,
      to: line(raw.to, LIMITS.to),
      from: line(raw.from, LIMITS.from),
      msg: prose(raw.msg, LIMITS.msg),
      paper: pick(raw.paper, PAPERS),
      hand: pick(raw.hand, HANDS),
      flower: pick(raw.flower, FLOWERS),
      look: pick(raw.look, LOOKS),
      music: raw.music !== false,
      photos,
      voice: isAudio(raw.voice) ? raw.voice : null,
      sent: Number.isFinite(raw.sent) ? Math.floor(raw.sent) : 0,
    };
  }

  return {
    LIMITS, PAPERS, HANDS, FLOWERS, LOOKS, CAN_GZIP,
    toB64u, fromB64u, seal, unseal, isLocked, pack, unpack,
    toFragment, fromFragment, lockForServer, unlockFromServer,
    line, prose, tidy,
  };
});
