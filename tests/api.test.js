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

test("short links: store, fetch, and say when storage is off", async () => {
  const store = memoryStore();
  const h = createHandler({ store });
  assert.deepEqual((await json(h, { url: "/api/letters" })).body, { ok: true });
  assert.deepEqual((await json(createHandler({ store: null }), { url: "/api/letters" })).body, { ok: false });
  assert.equal((await json(createHandler({ store: null }), { method: "POST", url: "/api/letters", body: {} })).status, 503);

  const letter = codec.tidy({ to: "Riya", msg: "hello" });
  const { key, record } = await codec.lockForServer(letter);
  const made = await json(h, { method: "POST", url: "/api/letters", body: record, headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(made.status, 201);
  assert.match(made.body.id, /^[A-Za-z0-9]{10}$/);
  assert.ok(![...store.m.keys()].some((k) => k.includes("203.0.113.9")), "addresses are hashed, never stored");

  const got = await json(h, { url: "/api/letters?id=" + made.body.id });
  assert.equal(got.status, 200);
  assert.deepEqual(await codec.unlockFromServer(got.body, key), letter);

  assert.equal((await json(h, { url: "/api/letters?id=AAAAAAAAAA" })).status, 404);
  assert.equal((await json(h, { url: "/api/letters?id=../etc" })).status, 404);
});

test("bad uploads are refused and uploads are rate-limited", async () => {
  const h = createHandler({ store: memoryStore() });
  const post = (body) => json(h, { method: "POST", url: "/api/letters", body });
  assert.equal((await post({ v: 1, i: "short", c: "A".repeat(40) })).status, 400);
  assert.equal((await post({ v: 1, i: "A".repeat(16), c: "not base64!!".repeat(4) })).status, 400);
  assert.equal((await post("{nope")).status, 400);
  const good = { v: 1, i: "A".repeat(16), c: "A".repeat(40) };
  let last;
  for (let i = 0; i < 41; i++) last = await post(good);
  assert.equal(last.status, 429);
});
