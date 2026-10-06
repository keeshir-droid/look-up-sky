// node tests/engine/card.test.js   (plain asserts, no dependencies)
// Every engine file loads in Node (no document, no window), every PLAN.md 7.3 name exists, and the card's
// contract that needs no canvas holds.
const assert = require("assert");
const path = require("path");
["util", "decode", "sky", "trace", "moon", "words", "finishes", "card", "sample", "export", "share"].forEach(function (f) {
  require(path.join(__dirname, "../../src/engine/" + f + ".js"));
});
const LU = globalThis.LU;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

(async function () {
  await test("no browser globals were needed to load", function () {
    assert(typeof document === "undefined" && typeof window === "undefined");
  });

  await test("every name of PLAN.md 7.3 exists", function () {
    assert.deepStrictEqual(LU.PENS.map(function (p) { return p.id; }), ["white", "gold", "ink"]);
    assert.deepStrictEqual(LU.FINISHES.map(function (p) { return p.id; }), ["postcard", "polaroid", "film", "letter", "plain"]);
    assert.deepStrictEqual(LU.DEFAULTS, { finish: "postcard", pen: "white", glow: false, said: "", city: "", to: "", when: 0 });
    assert.strictEqual(LU.END, 5);
    [["decode", "fileToImageData"], ["sky", "prepare"], ["trace", "finish"], ["trace", "hasClosed"], ["words", "when"], ["words", "slug"],
      ["moon", "phase"], ["moon", "draw"], ["sample", "load"], ["card", "create"], ["card", "startPreview"], ["card", "drawEditor"],
      ["export", "support"], ["export", "makeImage"], ["export", "makeVideo"], ["export", "fileName"],
      ["share", "platform"], ["share", "canShare"], ["share", "share"], ["share", "save"]].forEach(function (n) {
      assert.strictEqual(typeof LU[n[0]][n[1]], "function", n.join("."));
    });
  });

  await test("card: settings are default-filled, update() and setStrokes() work, drawFrame tolerates 0x0 and nonsense", async function () {
    const sky = { width: 1280, height: 960, image: null };
    const c = await LU.card.create(sky, [], { said: "hi" });
    assert.strictEqual(c.settings.finish, "postcard");
    assert.strictEqual(c.settings.said, "hi");
    assert(c.settings.when > 0, "when 0 becomes now");
    const rev = c._rev;
    await c.update({ finish: "film", pen: "gold", glow: true, said: "yo", city: "Rome", to: "Maya", when: 0 });
    assert.strictEqual(c.settings.finish, "film"); assert.strictEqual(c.settings.pen, "gold"); assert.strictEqual(c.settings.glow, true);
    assert.strictEqual(c.settings.city, "Rome"); assert(c.settings.when > 0, "when 0 is ignored");
    assert(c._rev > rev, "a preview can see the change");
    c.setStrokes([{ kind: "dot", points: [{ x: 5, y: 5, w: 1 }], closed: false, length: 0, seed: 1 }]);
    assert.strictEqual(c.strokes.length, 1);
    const calls = [];
    const dead = { canvas: { width: 0, height: 0 }, scale: function () { calls.push("scale"); } };
    c.drawFrame(dead, 1, "square", 1);
    c.drawFrame(dead, NaN, "story", 0);
    c.drawFrame(null, 1, "square", 1);
    assert.strictEqual(calls.length, 0, "nothing drawn on a 0x0 canvas");
    const snap = c._snapshot();
    assert.deepStrictEqual(snap.settings, c.settings);
  });

  await test("the sample load rejects with a friendly error when there is no picture (Node has no Image)", async function () {
    try { await LU.sample.load(); assert.fail("should reject"); }
    catch (e) { assert(e.code && e.title && e.detail, "an Error with code, title and detail: " + e.message); }
  });

  console.log(passed + " passed");
})();
