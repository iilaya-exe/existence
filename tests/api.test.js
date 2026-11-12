const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const codec = require("../js/codec.js");

process.chdir(path.join(__dirname, ".."));
const page = require("../api/l.js");
const letters = require("../api/letters.js");
const { createHandler, detect, redisTcp, upstashRest } = letters;
const memoryStore = require("../scripts/memory-store.js");
const http = require("node:http");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");

function call(handler, req) {
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
    handler(Object.assign({ method: "GET", headers: {} }, req), res);
  });
}
const json = async (handler, req) => { const r = await call(handler, req); return { status: r.status, body: JSON.parse(r.body) }; };

test("the link preview names no one, whatever is in the address", async () => {
  for (const url of ["/l", "/s/Ab3k9xQz2m", "/l?t=Riya&f=Alex"]) {
    const r = await call(page, { url, headers: { host: "example.com" } });
    assert.match(r.body, /<title>A letter for you<\/title>/);
    assert.match(r.body, /og:title" content="A letter is waiting for you/);
    assert.match(r.body, /og:image" content="https:\/\/example\.com\/img\/og\.jpg"/);
    assert.doesNotMatch(r.body, /Riya|Alex|<!--META-->/);
  }
});

test("served from /s/<id>, the page still finds its files", async () => {
  const r = await call(page, { url: "/s/Ab3k9xQz2m", headers: { host: "exam\"ple.com" } });
  assert.match(r.body, /<base href="\/">/);
  assert.doesNotMatch(r.body, /exam"ple/, "the host header cannot inject markup");
  const html = fs.readFileSync("letter.html", "utf8");
  assert.equal(html.split("<!--META-->").length, 2);
  // opened straight from a folder there is no "/", so the page must point at its files relatively
  assert.doesNotMatch(html, /(src|href)="\/[a-z]/);
  for (const m of html.matchAll(/(?:src|href)="((?:js|css|img)\/[^"]+)"/g)) assert.ok(fs.existsSync(m[1]), m[1] + " exists");
});

// a letter of a given ciphertext size, as the browser would upload it
const record = (chars) => ({ v: 1, i: "A".repeat(16), c: "B".repeat(chars - 1) + "C" });

// the whole trip against one store: health check, a small letter, a large one (several MB), a miss
async function roundTrip(store, label) {
  const h = createHandler({ store });
  const health = await json(h, { url: "/api/letters" });
  assert.equal(health.body.ok, true, label + ": health " + JSON.stringify(health.body));

  const letter = codec.tidy({ to: "Riya", msg: "hello" });
  const { key, record: small } = await codec.lockForServer(letter);
  const made = await json(h, { method: "POST", url: "/api/letters", body: small, headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(made.status, 201, label + ": " + JSON.stringify(made.body));
  assert.match(made.body.id, /^[A-Za-z0-9]{10}$/);
  const got = await json(h, { url: "/api/letters?id=" + made.body.id });
  assert.deepEqual(await codec.unlockFromServer(got.body, key), letter);

  const big = record(2600000); // four photos and a voice note: well past a 1 MB request limit
  const madeBig = await json(h, { method: "POST", url: "/api/letters", body: big });
  assert.equal(madeBig.status, 201, label + " (large): " + JSON.stringify(madeBig.body));
  const gotBig = await json(h, { url: "/api/letters?id=" + madeBig.body.id });
  assert.equal(gotBig.body.c, big.c, label + ": the large letter comes back whole");

  assert.equal((await json(h, { url: "/api/letters?id=AAAAAAAAAA" })).status, 404);
  assert.equal((await json(h, { url: "/api/letters?id=../etc" })).status, 404);
}

test("the database is found under any name Vercel gives it", () => {
  const kind = (env) => { const f = detect(env); return f.store ? f.store.kind : "none:" + f.other; };
  assert.equal(kind({ KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_TOKEN: "t" }), "upstash");
  assert.equal(kind({ UPSTASH_REDIS_REST_URL: "https://a.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }), "upstash");
  assert.equal(kind({ STORAGE_KV_REST_API_URL: "https://a.upstash.io", STORAGE_KV_REST_API_TOKEN: "t" }), "upstash", "custom prefix");
  assert.equal(kind({ KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_READ_ONLY_TOKEN: "t" }), "none:null", "a read-only token alone is not enough");
  assert.equal(kind({ REDIS_URL: "redis://default:pw@redis-123.cloud.redislabs.com:12345" }), "redis", "Redis Cloud");
  assert.equal(kind({ KV_URL: "rediss://default:pw@a.upstash.io:6379" }), "redis");
  assert.equal(kind({ TENDERLY_REDIS_URL: "rediss://default:pw@a.upstash.io:6379" }), "redis", "custom prefix");
  assert.equal(kind({ KV_REST_API_URL: "https://a.upstash.io", KV_REST_API_TOKEN: "t", REDIS_URL: "rediss://x@y:1" }), "upstash", "HTTPS preferred");
  assert.equal(kind({ POSTGRES_URL: "postgres://u:p@h/db" }), "none:Postgres");
  assert.equal(kind({ DATABASE_URL: "postgresql://u:p@h/db" }), "none:Postgres");
  assert.equal(kind({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }), "none:Blob");
  assert.equal(kind({ PATH: "/usr/bin" }), "none:null");
});

test("the health check says why short links are off", async () => {
  const none = await json(createHandler({ store: null }), { url: "/api/letters" });
  assert.deepEqual(none.body, { ok: false, reason: "no_storage" });
  assert.equal((await json(createHandler({ store: null }), { method: "POST", url: "/api/letters", body: record(40) })).status, 503);

  const old = process.env;
  process.env = { POSTGRES_URL: "postgres://u:p@h/db" };
  try { assert.deepEqual((await json(createHandler(), { url: "/api/letters" })).body, { ok: false, reason: "unsupported", other: "Postgres" }); }
  finally { process.env = old; }

  const broken = { kind: "upstash", run: async () => { throw new Error("WRONGPASS invalid username-password pair"); }, many: async () => { throw new Error("WRONGPASS"); } };
  const h = createHandler({ store: broken });
  const orig = console.error; console.error = () => {};
  try {
    assert.deepEqual((await json(h, { url: "/api/letters" })).body, { ok: false, store: "upstash", reason: "auth" });
    assert.deepEqual((await json(h, { method: "POST", url: "/api/letters", body: record(40) })).body, { error: "auth" });
  } finally { console.error = orig; }
});

test("short links: in memory, with a 1 MB request limit like a free database plan", async () => {
  const store = memoryStore({ maxRequest: 1000000 });
  await roundTrip(store, "memory");
  assert.ok(![...store.m.keys()].some((k) => k.includes("203.0.113.9")), "addresses are hashed, never stored");
  assert.ok([...store.m.keys()].some((k) => /^letter:[A-Za-z0-9]{10}:2$/.test(k)), "large letters are stored in pieces");
});

test("short links: Upstash over HTTPS (emulated, 1 MB request limit)", async () => {
  const backing = memoryStore({ maxRequest: 1000000 });
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== "Bearer right-token") { res.statusCode = 401; return res.end('{"error":"Unauthorized"}'); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      // run commands one after another on the backing store
      (async () => {
        const run = async (cmd) => { try { return { result: await backing.run(cmd) }; } catch (e) { return { error: e.message }; } };
        if (req.url === "/pipeline") { const out = []; for (const c of body) out.push(await run(c)); return res.end(JSON.stringify(out)); }
        const out = await run(body);
        if (out.error) res.statusCode = 400;
        res.end(JSON.stringify(out));
      })();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await roundTrip(upstashRest(url, "right-token"), "upstash");
    const orig = console.error; console.error = () => {};
    try { assert.deepEqual((await json(createHandler({ store: upstashRest(url, "wrong") }), { url: "/api/letters" })).body, { ok: false, store: "upstash", reason: "auth" }); }
    finally { console.error = orig; }
  } finally { server.close(); }
});

const hasRedis = spawnSync("redis-server", ["--version"]).status === 0;
test("short links: a real Redis server over TCP, with a password", { skip: !hasRedis && "redis-server is not installed" }, async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
  const proc = spawn("redis-server", ["--port", String(port), "--requirepass", "s3cret pass", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { // wait for it to listen
      const up = await new Promise((r) => { const c = net.connect(port, "127.0.0.1", () => { c.end(); r(true); }).on("error", () => r(false)); });
      if (up) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await roundTrip(redisTcp(`redis://default:${encodeURIComponent("s3cret pass")}@127.0.0.1:${port}/2`), "redis");
    const orig = console.error; console.error = () => {};
    try {
      assert.equal((await json(createHandler({ store: redisTcp(`redis://default:nope@127.0.0.1:${port}`) }), { url: "/api/letters" })).body.reason, "auth");
      assert.equal((await json(createHandler({ store: redisTcp("redis://127.0.0.1:1") }), { url: "/api/letters" })).body.reason, "unreachable");
    } finally { console.error = orig; }
  } finally { proc.kill(); }
});

test("bad uploads are refused and uploads are rate-limited", async () => {
  const h = createHandler({ store: memoryStore() });
  const post = (body) => json(h, { method: "POST", url: "/api/letters", body });
  assert.equal((await post({ v: 1, i: "short", c: "A".repeat(40) })).status, 400);
  assert.equal((await post({ v: 1, i: "A".repeat(16), c: "not base64!!".repeat(4) })).status, 400);
  assert.equal((await post("{nope")).status, 400);
  const huge = await post(record(4000001));
  assert.deepEqual([huge.status, huge.body.error], [413, "too_large"]);
  let last;
  for (let i = 0; i < 41; i++) last = await post(record(40));
  assert.equal(last.status, 429);
});
