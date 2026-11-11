// How a letter travels.
//
//   letter = { v, to, from, msg, paper, hand, flower, look, music, photos:[{src,cap}], voice, sent }
//
// A letter is wrapped as { v:1, d: letter }, gzipped, and travels one of two ways:
//   long link   letter.html#z=<base64url>   everything lives after the "#", which browsers never send
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

  // ---------- packing ----------
  // letter -> bytes. First byte says how: 1 = gzip, 0 = plain JSON.
  async function pack(letter) {
    const json = enc.encode(JSON.stringify({ v: 1, d: letter }));
    let body = json, mode = 0;
    if (CAN_GZIP) {
      try { const gz = await gzip(json); if (gz.length < json.length) { body = gz; mode = 1; } } catch (e) { /* keep plain */ }
    }
    const out = new Uint8Array(body.length + 1);
    out[0] = mode;
    out.set(body, 1);
    return out;
  }
  // bytes -> letter (as it arrived: pass it through tidy before using it)
  async function unpack(bytes) {
    const body = bytes.subarray(1);
    const json = bytes[0] === 1 ? await gunzip(body) : body;
    const wrapped = JSON.parse(dec.decode(json));
    if (!wrapped || wrapped.v !== 1 || !wrapped.d || typeof wrapped.d !== "object") throw new Error("not a letter");
    return wrapped.d;
  }

  // ---------- long links: the whole letter after the "#" ----------
  async function toFragment(letter) {
    const bytes = await pack(letter);
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
  async function lockForServer(letter) {
    const raw = root.crypto.getRandomValues(new Uint8Array(32));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
    const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, await pack(letter));
    return { key: toB64u(raw), record: { v: 1, i: toB64u(iv), c: toB64u(new Uint8Array(ct)) } };
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
    toB64u, fromB64u, pack, unpack,
    toFragment, fromFragment, lockForServer, unlockFromServer,
    line, prose, tidy,
  };
});
