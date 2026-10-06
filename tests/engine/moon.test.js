// node tests/engine/moon.test.js   (plain asserts, no dependencies)
const assert = require("assert");
const path = require("path");
require(path.join(__dirname, "../../src/engine/moon.js"));
const LU = globalThis.LU;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

test("the new moon of 2000-01-06 18:14 UTC is new", function () {
  const p = LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14));
  assert(p.age < 0.01 || p.age > 29.5, "age " + p.age);
  assert(p.fraction < 0.001, "fraction " + p.fraction);
  assert.strictEqual(p.name, "New Moon");
});

test("full moons are full (real dates, the mean-moon model is good to about half a day)", function () {
  [Date.UTC(2026, 9, 26, 4, 12), Date.UTC(2024, 3, 23, 23, 49), Date.UTC(2000, 0, 21, 4, 40)].forEach(function (ms) {
    const p = LU.moon.phase(ms);
    assert(p.fraction > 0.97, new Date(ms).toISOString() + " fraction " + p.fraction);
    assert.strictEqual(p.name, "Full Moon");
  });
});

test("first quarter and waxing / waning", function () {
  const q = LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 7.38 * 86400000);
  assert(Math.abs(q.fraction - 0.5) < 0.02, "fraction " + q.fraction);
  assert(q.waxing === true);
  assert.strictEqual(q.name, "First Quarter");
  const w = LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 22.15 * 86400000);
  assert(w.waxing === false && Math.abs(w.fraction - 0.5) < 0.02);
  assert.strictEqual(w.name, "Last Quarter");
  assert.strictEqual(LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 3.7 * 86400000).name, "Waxing Crescent");
  assert.strictEqual(LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 11 * 86400000).name, "Waxing Gibbous");
  assert.strictEqual(LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 18.5 * 86400000).name, "Waning Gibbous");
  assert.strictEqual(LU.moon.phase(Date.UTC(2000, 0, 6, 18, 14) + 26 * 86400000).name, "Waning Crescent");
});

test("dates before the epoch still give an age between 0 and 29.53", function () {
  const p = LU.moon.phase(Date.UTC(1969, 6, 20, 20, 17)); // Apollo 11 landing, a waxing crescent (about 4.5 days old)
  assert(p.age >= 0 && p.age < 29.531, "age " + p.age);
  assert(p.waxing && p.fraction > 0.1 && p.fraction < 0.4, JSON.stringify(p));
});

test("0 means now", function () {
  const a = LU.moon.phase(0), b = LU.moon.phase(Date.now());
  assert(Math.abs(a.age - b.age) < 0.01);
});

test("southern hemisphere time zones are recognised", function () {
  ["Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Santiago", "Africa/Johannesburg"].forEach(function (z) {
    assert(LU.moon.isSouthern(z), z);
  });
  ["Europe/Rome", "America/New_York", "Asia/Kolkata", "Africa/Cairo", "America/Bogota", "Asia/Tokyo", "", undefined === 1].forEach(function (z) {
    assert(!LU.moon.isSouthern(z), String(z));
  });
});

test("the lit side: right while waxing in the north, flipped in the south", function () {
  const waxing = Date.UTC(2000, 0, 6, 18, 14) + 4 * 86400000;
  const waning = Date.UTC(2000, 0, 6, 18, 14) + 25 * 86400000;
  assert.strictEqual(LU.moon.shape(waxing, false).litRight, true);
  assert.strictEqual(LU.moon.shape(waning, false).litRight, false);
  assert.strictEqual(LU.moon.shape(waxing, true).litRight, false);
  assert.strictEqual(LU.moon.shape(waning, true).litRight, true);
});

test("draw() paints a dark disc and a lit shape with the right terminator", function () {
  const calls = [];
  const ctx = {
    globalAlpha: 1, fillStyle: "",
    save: function () { calls.push(["save"]); }, restore: function () { calls.push(["restore"]); },
    beginPath: function () { calls.push(["beginPath"]); }, closePath: function () { },
    arc: function (x, y, r) { calls.push(["arc", x, y, r, this.globalAlpha]); },
    moveTo: function (x, y) { calls.push(["moveTo", x, y]); }, lineTo: function (x, y) { calls.push(["lineTo", x, y]); },
    fill: function () { calls.push(["fill", this.globalAlpha, this.fillStyle]); }
  };
  // a half moon, waxing, north: lit on the right, so every lit point has x >= centre
  LU.moon.draw(ctx, 100, 50, 20, Date.UTC(2000, 0, 6, 18, 14) + 7.38 * 86400000, "#fff", { southern: false });
  const fills = calls.filter(function (c) { return c[0] === "fill"; });
  assert.strictEqual(fills.length, 2);
  assert(Math.abs(fills[0][1] - 0.35) < 1e-9, "dark part at 35%");
  assert.strictEqual(fills[1][1], 1);
  const arc = calls.find(function (c) { return c[0] === "arc"; });
  assert.deepStrictEqual([arc[1], arc[2], arc[3]], [100, 50, 10], "(x, y) is the centre");
  const pts = calls.filter(function (c) { return c[0] === "lineTo" || c[0] === "moveTo"; });
  pts.forEach(function (p) { assert(p[1] >= 100 - 0.6, "lit point left of centre: " + p[1]); });
  // a new moon draws no lit part
  calls.length = 0;
  LU.moon.draw(ctx, 0, 0, 20, Date.UTC(2000, 0, 6, 18, 14), "#fff", { southern: false });
  assert.strictEqual(calls.filter(function (c) { return c[0] === "fill"; }).length, 1);
});

console.log(passed + " passed");
