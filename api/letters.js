// Short links. The browser encrypts a letter with a random key before it gets here, so this
// stores only ciphertext it cannot read; the key stays after the "#" in the link.
//
//   GET  /api/letters           -> { ok, store, reason }   are short links working? (open it in a
//                                                         browser to see why not)
//   POST /api/letters {v,i,c}   -> { id }                  store one encrypted letter
//   GET  /api/letters?id=…      -> { v,i,c }               fetch it
//
// Storage is any Redis database. It is found from the project's environment variables, under
// whatever names Vercel gave them:
//   Upstash over HTTPS   …KV_REST_API_URL + …KV_REST_API_TOKEN, or …REDIS_REST_URL + …REDIS_REST_TOKEN
//   Redis over TCP       …REDIS_URL or …KV_URL (redis:// or rediss://), e.g. Redis Cloud, Upstash
// Without one this answers 503 and the app falls back to long links that carry the whole letter.
const crypto = require("crypto");
const net = require("net");
const tls = require("tls");

const MAX_CIPHER_CHARS = 4000000;         // about 3 MB of letter; Vercel caps request bodies at 4.5 MB
const CHUNK = 700000;                     // stored in pieces this size, under every Redis plan's request limit
const PER_HOUR = 40;                      // letters one address may store per hour
const B64U = /^[A-Za-z0-9_-]+$/;
const ID = /^[A-Za-z0-9]{10}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes

// ================= storage =================
// Each kind of store offers: run([cmd, ...args]) -> reply, and many([[cmd...], ...]) -> [replies].

function upstashRest(url, token) {
  const call = async (path, body) => {
    const r = await fetch(url.replace(/\/+$/, "") + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let out;
    try { out = await r.json(); } catch (e) { throw new Error(`storage answered ${r.status}`); }
    if (!r.ok && !Array.isArray(out)) throw new Error((out && out.error) || `storage answered ${r.status}`);
    return out;
  };
  return {
    kind: "upstash",
    async run(cmd) { const out = await call("", cmd); if (out.error) throw new Error(out.error); return out.result; },
    async many(cmds) {
      const out = await call("/pipeline", cmds);
      return out.map((o) => { if (o.error) throw new Error(o.error); return o.result; });
    },
  };
}

// A small Redis client (RESP over TCP/TLS): one connection per request, as suits serverless.
function redisTcp(urlStr) {
  const u = new URL(urlStr);
  const secure = u.protocol === "rediss:";
  const host = u.hostname, port = Number(u.port) || 6379;
  const user = decodeURIComponent(u.username || ""), pass = decodeURIComponent(u.password || "");
  const db = Number((u.pathname || "").replace("/", "")) || 0;

  const encode = (args) => {
    const parts = [`*${args.length}\r\n`];
    for (const a of args) { const s = String(a); parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`); }
    return parts.join("");
  };
  // read one reply from buf at pos -> [value, nextPos], or null if more bytes are needed
  function parse(buf, pos) {
    const end = buf.indexOf("\r\n", pos);
    if (end < 0) return null;
    const type = String.fromCharCode(buf[pos]), line = buf.toString("utf8", pos + 1, end);
    if (type === "+") return [line, end + 2];
    if (type === "-") return [new Error(line), end + 2];
    if (type === ":") return [Number(line), end + 2];
    if (type === "$") {
      const n = Number(line);
      if (n < 0) return [null, end + 2];
      if (buf.length < end + 2 + n + 2) return null;
      return [buf.toString("utf8", end + 2, end + 2 + n), end + 2 + n + 2];
    }
    if (type === "*") {
      const n = Number(line);
      if (n < 0) return [null, end + 2];
      const arr = [];
      let p = end + 2;
      for (let i = 0; i < n; i++) { const r = parse(buf, p); if (!r) return null; arr.push(r[0]); p = r[1]; }
      return [arr, p];
    }
    return [new Error("unexpected reply from storage"), buf.length];
  }

  function exchange(cmds) {
    const pre = [];
    if (pass) pre.push(user ? ["AUTH", user, pass] : ["AUTH", pass]);
    if (db) pre.push(["SELECT", db]);
    const all = pre.concat(cmds);
    return new Promise((resolve, reject) => {
      const sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
      let buf = Buffer.alloc(0), done = false;
      const replies = [];
      const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); err ? reject(err) : resolve(val); };
      const timer = setTimeout(() => finish(new Error("storage timed out")), 8000);
      sock.on(secure ? "secureConnect" : "connect", () => sock.write(all.map(encode).join("")));
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        let p = 0, r;
        while (replies.length < all.length && (r = parse(buf, p))) { replies.push(r[0]); p = r[1]; }
        buf = buf.subarray(p);
        if (replies.length === all.length) {
          const bad = replies.find((x) => x instanceof Error);
          if (bad) finish(bad);
          else finish(null, replies.slice(pre.length));
        }
      });
      sock.on("error", (e) => finish(e));
      sock.on("close", () => finish(new Error("storage closed the connection")));
    });
  }
  return { kind: "redis", run: async (cmd) => (await exchange([cmd]))[0], many: (cmds) => exchange(cmds) };
}

// Find a Redis database among the environment variables, under any prefix Vercel gave them.
// Returns { store } or { store: null, other } where other names a database we can't use.
function detect(env) {
  const keys = Object.keys(env).sort((a, b) => a.length - b.length); // unprefixed names first
  const val = (k) => String(env[k] || "").trim();
  for (const k of keys) {
    const m = /^(.*?)(KV_REST_API|REDIS_REST)_URL$/.exec(k);
    if (!m || !/^https:\/\//.test(val(k))) continue;
    const token = val(`${m[1]}${m[2]}_TOKEN`);
    if (token) return { store: upstashRest(val(k), token) };
  }
  for (const k of keys) {
    if (/(REDIS|KV)_URL$/.test(k) && /^rediss?:\/\//.test(val(k))) return { store: redisTcp(val(k)) };
  }
  // something else is connected: say what, so the sender knows to add Redis
  const vals = keys.map(val).join(" ");
  const other =
    /postgres(ql)?:\/\//.test(vals) || keys.some((k) => /POSTGRES|NEON/.test(k)) ? "Postgres" :
    /mysql:\/\//.test(vals) ? "MySQL" :
    /mongodb(\+srv)?:\/\//.test(vals) ? "MongoDB" :
    keys.some((k) => /SUPABASE/.test(k)) ? "Supabase" :
    keys.some((k) => /BLOB_READ_WRITE_TOKEN$/.test(k)) ? "Blob" :
    keys.some((k) => /^EDGE_CONFIG/.test(k)) ? "Edge Config" : null;
  return { store: null, other };
}

// What went wrong with the store, in one word the composer can explain. The raw error goes to the logs.
function trouble(e) {
  const m = String((e && (e.code || "") + " " + e.message) || "");
  if (/WRONGPASS|NOAUTH|invalid password|unauthori[sz]ed|\b401\b|\b403\b|invalid token/i.test(m)) return "auth";
  if (/NOPERM|READONLY|read.?only/i.test(m)) return "readonly";
  if (/max.*(request|size)|too large|\b413\b|exceed/i.test(m)) return "too_large";
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|timed out|closed the connection|fetch failed/i.test(m)) return "unreachable";
  return "storage_error";
}

// letters are kept whole when small, in numbered pieces when large
async function saveLetter(store, id, i, c) {
  if (c.length <= CHUNK) return (await store.run(["SET", "letter:" + id, JSON.stringify({ i, c }), "NX"])) === "OK";
  const n = Math.ceil(c.length / CHUNK);
  if ((await store.run(["SET", "letter:" + id, JSON.stringify({ i, n }), "NX"])) !== "OK") return false;
  try {
    for (let k = 0; k < n; k++) await store.run(["SET", `letter:${id}:${k}`, c.slice(k * CHUNK, (k + 1) * CHUNK)]);
  } catch (e) {
    await store.many([["DEL", "letter:" + id], ...Array.from({ length: n }, (_, k) => ["DEL", `letter:${id}:${k}`])]).catch(() => {});
    throw e;
  }
  return true;
}
async function loadLetter(store, id) {
  const raw = await store.run(["GET", "letter:" + id]);
  if (!raw) return null;
  const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof rec.c === "string") return { i: rec.i, c: rec.c };
  let c = "";
  for (let k = 0; k < rec.n; k++) {
    const part = await store.run(["GET", `letter:${id}:${k}`]);
    if (typeof part !== "string") return null;
    c += part;
  }
  return { i: rec.i, c };
}

function newId() {
  const bytes = crypto.randomBytes(10);
  let id = "";
  for (let i = 0; i < 10; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

const TOO_BIG = { tooBig: true };
// the upload as JSON, or null if it isn't JSON, or TOO_BIG if it is over the limit
function readBody(req, limit) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { resolve(TOO_BIG); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

function createHandler(deps) {
  deps = deps || {};
  const now = deps.now || Date.now;
  return async (req, res) => {
    const found = deps.store !== undefined ? { store: deps.store, other: null } : detect(process.env);
    const store = found.store;
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body, null, req.method === "GET" ? 2 : 0));
    };
    const fault = (e) => { console.error("[letters] storage:", e && e.message); return trouble(e); };
    try {
      const url = new URL(req.url, "https://placeholder.local");
      const id = url.searchParams.get("id");

      // health check: is a database connected, and does it answer?
      if (req.method === "GET" && !id) {
        if (!store) return send(200, found.other ? { ok: false, reason: "unsupported", other: found.other } : { ok: false, reason: "no_storage" });
        try {
          await store.run(["PING"]);
          return send(200, { ok: true, store: store.kind || "custom" });
        } catch (e) {
          return send(200, { ok: false, store: store.kind || "custom", reason: fault(e) });
        }
      }
      if (!store) return send(503, { error: found.other ? "unsupported" : "no_storage", other: found.other || undefined });

      if (req.method === "GET") {
        if (!ID.test(id)) return send(404, { error: "not_found" });
        const rec = await loadLetter(store, id);
        if (!rec) return send(404, { error: "not_found" });
        return send(200, { v: 1, i: rec.i, c: rec.c });
      }

      if (req.method === "POST") {
        const body = await readBody(req, MAX_CIPHER_CHARS + 4096);
        const ok = body && body.v === 1 &&
          typeof body.i === "string" && B64U.test(body.i) && body.i.length === 16 &&
          typeof body.c === "string" && B64U.test(body.c) && body.c.length >= 24 && body.c.length <= MAX_CIPHER_CHARS;
        if (body === TOO_BIG || (body && typeof body.c === "string" && body.c.length > MAX_CIPHER_CHARS)) return send(413, { error: "too_large" });
        if (!ok) return send(400, { error: "bad_request" });

        const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
        const who = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16); // never store the address itself
        const rate = `rate:${who}:${Math.floor(now() / 3600000)}`;
        let count;
        try { count = (await store.many([["SET", rate, "0", "EX", "3700", "NX"], ["INCR", rate]]))[1]; }
        catch (e) { return send(502, { error: fault(e) }); }
        if (count > PER_HOUR) return send(429, { error: "slow_down" });

        try {
          for (let tries = 0; tries < 4; tries++) {
            const newid = newId();
            if (await saveLetter(store, newid, body.i, body.c)) return send(201, { id: newid });
          }
        } catch (e) { return send(502, { error: fault(e) }); }
        return send(500, { error: "storage_error" });
      }

      res.setHeader("Allow", "GET, POST");
      return send(405, { error: "method" });
    } catch (e) {
      return send(502, { error: fault(e) });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.detect = detect;
module.exports.redisTcp = redisTcp;
module.exports.upstashRest = upstashRest;
module.exports.CHUNK = CHUNK;
