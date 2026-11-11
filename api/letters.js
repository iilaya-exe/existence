// Short links. The browser encrypts a letter with a random key before it gets here, so this
// stores only ciphertext it cannot read; the key stays after the "#" in the link.
//
//   GET  /api/letters            -> { ok }             are short links switched on?
//   POST /api/letters {v,i,c,o}  -> { id }             store one encrypted letter
//   GET  /api/letters?id=…       -> { v,i,c,o }        fetch it; 423 { openAt } while it is still sealed
//
// "o" is the open date (ms). It is kept in the clear beside the ciphertext so a sealed letter
// cannot be fetched early, however the link is opened.
//
// Storage is Upstash Redis over REST (Vercel: Storage -> Upstash for Redis). Without it this
// answers 503 and the app falls back to long links that carry the whole letter.
const crypto = require("crypto");

const MAX_CIPHER_CHARS = 4000000;         // about 3 MB of letter; Vercel caps request bodies at 4.5 MB
const MAX_SEAL_MS = 20 * 365 * 86400000;  // a letter can wait up to twenty years
const PER_HOUR = 40;                      // letters one address may store per hour
const B64U = /^[A-Za-z0-9_-]+$/;
const ID = /^[A-Za-z0-9]{10}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes

function upstash(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const run = async (cmd) => {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
    const out = await r.json();
    if (!r.ok || out.error) throw new Error(out.error || `storage ${r.status}`);
    return out.result;
  };
  return {
    get: (key) => run(["GET", key]),
    setNew: async (key, value) => (await run(["SET", key, value, "NX"])) === "OK",
    hit: async (key, seconds) => { const n = await run(["INCR", key]); if (n === 1) await run(["EXPIRE", key, seconds]); return n; },
  };
}

function newId() {
  const bytes = crypto.randomBytes(10);
  let id = "";
  for (let i = 0; i < 10; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

function readBody(req, limit) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

function createHandler(deps) {
  deps = deps || {};
  const now = deps.now || Date.now;
  return async (req, res) => {
    const store = deps.store !== undefined ? deps.store : upstash(process.env);
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, "https://placeholder.local");
      const id = url.searchParams.get("id");

      if (req.method === "GET" && !id) return send(200, { ok: !!store });
      if (!store) return send(503, { error: "storage_off" });

      if (req.method === "GET") {
        if (!ID.test(id)) return send(404, { error: "not_found" });
        const raw = await store.get("letter:" + id);
        if (!raw) return send(404, { error: "not_found" });
        const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (rec.o && rec.o > now()) return send(423, { error: "sealed", openAt: rec.o, now: now() });
        return send(200, { v: 1, i: rec.i, c: rec.c, o: rec.o || 0 });
      }

      if (req.method === "POST") {
        const body = await readBody(req, MAX_CIPHER_CHARS + 4096);
        const ok = body && body.v === 1 &&
          typeof body.i === "string" && B64U.test(body.i) && body.i.length === 16 &&
          typeof body.c === "string" && B64U.test(body.c) && body.c.length >= 24 && body.c.length <= MAX_CIPHER_CHARS;
        if (!ok) return send(400, { error: body && typeof body.c === "string" && body.c.length > MAX_CIPHER_CHARS ? "too_large" : "bad_request" });
        const o = Number(body.o) || 0;
        if (!Number.isFinite(o) || o < 0 || o > now() + MAX_SEAL_MS) return send(400, { error: "bad_date" });

        const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
        const who = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16); // never store the address itself
        if ((await store.hit(`rate:${who}:${Math.floor(now() / 3600000)}`, 3700)) > PER_HOUR) return send(429, { error: "slow_down" });

        const value = JSON.stringify({ i: body.i, c: body.c, o: Math.floor(o) });
        for (let tries = 0; tries < 4; tries++) {
          const newid = newId();
          if (await store.setNew("letter:" + newid, value)) return send(201, { id: newid });
        }
        return send(500, { error: "try_again" });
      }

      res.setHeader("Allow", "GET, POST");
      return send(405, { error: "method" });
    } catch (e) {
      return send(502, { error: "storage_error" });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
