const test = require("node:test");
const assert = require("node:assert/strict");
const codec = require("../js/codec.js");

const letter = () => codec.tidy({
  to: "Riya", from: "Alex", msg: "Dear you,\n\nI kept meaning to say this.\n\nLove.", paper: "blush", flower: "peonies", look: "painted",
  photos: [{ src: "data:image/jpeg;base64,/9j/4AAQ", cap: "the lake" }], sent: 1760000000000,
});

test("a letter survives the trip through a long link", async () => {
  const frag = await codec.toFragment(await codec.seal(letter()));
  assert.match(frag, /^[zj]=[A-Za-z0-9_-]+$/);
  const sealed = await codec.fromFragment("#" + frag);
  assert.equal(codec.isLocked(sealed), false);
  assert.deepEqual(codec.tidy(await codec.unseal(sealed)), letter());
});

test("long letters are compressed", async () => {
  const long = codec.tidy({ to: "Riya", msg: "I love you more than words. ".repeat(120) });
  const frag = await codec.toFragment(await codec.seal(long));
  assert.ok(frag.startsWith("z="));
  assert.ok(frag.length < long.msg.length / 4, "link is far shorter than the letter");
});

test("a passphrase really locks the letter", async () => {
  const sealed = await codec.fromFragment(await codec.toFragment(await codec.seal(letter(), { passphrase: "our song", openAt: 1790000000000 })));
  assert.equal(codec.isLocked(sealed), true);
  assert.equal(sealed.o, 1790000000000, "the open date stays readable so the countdown can show before unlocking");
  assert.ok(!JSON.stringify(sealed).includes("Riya"), "nothing readable without the passphrase");
  await assert.rejects(codec.unseal(sealed, "wrong guess"));
  assert.deepEqual(await codec.unseal(sealed, "our song"), letter());
});

test("short links: the server record is unreadable without the key in the link", async () => {
  const sealed = await codec.seal(letter(), { openAt: 1790000000000 });
  const { key, record } = await codec.lockForServer(sealed);
  assert.equal(record.o, 1790000000000);
  assert.equal(record.i.length, 16);
  assert.ok(!Buffer.from(codec.fromB64u(record.c)).toString("latin1").includes("Riya"));
  assert.deepEqual(await codec.unlockFromServer(record, key), sealed);
  const other = (await codec.lockForServer(sealed)).key;
  await assert.rejects(codec.unlockFromServer(record, other));
});

test("broken or foreign links are refused", async () => {
  await assert.rejects(codec.fromFragment("#z=not*valid"));
  await assert.rejects(codec.fromFragment("#q=abcd"));
  await assert.rejects(codec.fromFragment("#j=" + codec.toB64u(new TextEncoder().encode('{"hello":1}'))));
  await assert.rejects(codec.fromFragment("#z=" + codec.toB64u(new Uint8Array([1, 2, 3, 4]))));
});

test("tidy keeps only known, well-shaped fields", () => {
  const t = codec.tidy({
    to: "  Ri\u0000ya \n ", from: "x".repeat(99), msg: "a\r\nb\n\n\n\n\n\nc   \n", paper: "<script>", flower: "roses", look: "neon", hand: 7,
    music: false, evil: "yes", sent: "soon",
    photos: [{ src: "javascript:alert(1)" }, { src: "data:image/svg+xml;base64,AAAA" }, { src: "data:image/png;base64,AAAA", cap: "ok" }, null],
    voice: "https://example.com/a.mp3",
  });
  assert.equal(t.to, "Ri ya");
  assert.equal(t.from.length, 40);
  assert.equal(t.msg, "a\nb\n\n\nc");
  assert.deepEqual([t.paper, t.flower, t.look, t.hand], ["ivory", "peonies", "ascii", "serif"]);
  assert.equal(t.music, false);
  assert.equal(t.evil, undefined);
  assert.equal(t.sent, 0);
  assert.deepEqual(t.photos, [{ src: "data:image/png;base64,AAAA", cap: "ok" }]);
  assert.equal(t.voice, null);
  assert.equal(codec.tidy({ voice: "data:audio/webm;codecs=opus;base64,GkXf" }).voice, "data:audio/webm;codecs=opus;base64,GkXf");
});
