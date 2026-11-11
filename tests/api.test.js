const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const codec = require("../js/codec.js");

process.chdir(path.join(__dirname, ".."));
const page = require("../api/l.js");
const { createHandler } = require("../api/letters.js");

function call(handler, req) {
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
    handler(Object.assign({ method: "GET", headers: {} }, req), res);
  });
}
const json = async (handler, req) => { const r = await call(handler, req); return { status: r.status, body: JSON.parse(r.body) }; };

function memoryStore() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    setNew: async (k, v) => (m.has(k) ? false : (m.set(k, v), true)),
    hit: async (k) => { m.set(k, (m.get(k) || 0) + 1); return m.get(k); },
  };
}

test("link previews are private unless the sender opted in", async () => {
  const r = await call(page, { url: "/l", headers: { host: "example.com" } });
  assert.match(r.body, /og:title" content="A letter is waiting for you/);
  assert.match(r.body, /id="gateName">for you<\/span>/);
  assert.match(r.body, /og:image" content="https:\/\/example\.com\/img\/og\.jpg"/);
  assert.doesNotMatch(r.body, /<!--META-->|<!--GATE_NAME-->/);
});

test("opted-in names are shown and escaped", async () => {
  const r = await call(page, { url: "/s/abc?t=Riya%20%24%26%20%3C3&f=%22Alex%22", headers: {} });
  assert.match(r.body, /<title>For Riya \$&amp; &lt;3<\/title>/);
  assert.match(r.body, /og:title" content="A letter for Riya \$&amp; &lt;3 /);
  assert.match(r.body, /From &quot;Alex&quot;\. Tap to open\./);
  assert.match(r.body, /id="gateName">Riya \$&amp; &lt;3<\/span>/);
});

test("the letter page template has the placeholders the function fills", () => {
  const html = fs.readFileSync("letter.html", "utf8");
  assert.equal(html.split("<!--META-->").length, 2);
  assert.equal(html.split("<!--GATE_NAME-->").length, 2);
});

test("short links: store, fetch, and say when storage is off", async () => {
  const store = memoryStore();
  const h = createHandler({ store });
  assert.deepEqual((await json(h, { url: "/api/letters" })).body, { ok: true });
  assert.deepEqual((await json(createHandler({ store: null }), { url: "/api/letters" })).body, { ok: false });
  assert.equal((await json(createHandler({ store: null }), { method: "POST", url: "/api/letters", body: {} })).status, 503);

  const sealed = await codec.seal(codec.tidy({ to: "Riya", msg: "hello" }));
  const { key, record } = await codec.lockForServer(sealed);
  const made = await json(h, { method: "POST", url: "/api/letters", body: record, headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(made.status, 201);
  assert.match(made.body.id, /^[A-Za-z0-9]{10}$/);
  assert.ok(![...store.m.keys()].some((k) => k.includes("203.0.113.9")), "addresses are hashed, never stored");

  const got = await json(h, { url: "/api/letters?id=" + made.body.id });
  assert.equal(got.status, 200);
  assert.deepEqual(await codec.unlockFromServer(got.body, key), sealed);

  assert.equal((await json(h, { url: "/api/letters?id=AAAAAAAAAA" })).status, 404);
  assert.equal((await json(h, { url: "/api/letters?id=../etc" })).status, 404);
});

test("a sealed letter cannot be fetched before its date", async () => {
  const store = memoryStore();
  let clock = 1_000_000;
  const h = createHandler({ store, now: () => clock });
  const { record } = await codec.lockForServer(await codec.seal(codec.tidy({ msg: "happy birthday" }), { openAt: 2_000_000 }));
  const { body } = await json(h, { method: "POST", url: "/api/letters", body: record });
  const early = await json(h, { url: "/api/letters?id=" + body.id });
  assert.equal(early.status, 423);
  assert.deepEqual(early.body, { error: "sealed", openAt: 2_000_000, now: 1_000_000 });
  assert.equal(early.body.c, undefined);
  clock = 2_000_001;
  assert.equal((await json(h, { url: "/api/letters?id=" + body.id })).status, 200);
});

test("bad uploads are refused and uploads are rate-limited", async () => {
  const h = createHandler({ store: memoryStore() });
  const post = (body) => json(h, { method: "POST", url: "/api/letters", body });
  assert.equal((await post({ v: 1, i: "short", c: "A".repeat(40) })).status, 400);
  assert.equal((await post({ v: 1, i: "A".repeat(16), c: "not base64!!".repeat(4) })).status, 400);
  assert.equal((await post({ v: 1, i: "A".repeat(16), c: "A".repeat(40), o: Date.now() + 40 * 365 * 86400000 })).status, 400);
  assert.equal((await post("{nope")).status, 400);
  const good = { v: 1, i: "A".repeat(16), c: "A".repeat(40) };
  let last;
  for (let i = 0; i < 41; i++) last = await post(good);
  assert.equal(last.status, 429);
});
