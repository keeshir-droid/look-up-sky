// node tests/engine/draw.test.js
// Drawing with a recording fake canvas context (no browser), and the sky on a synthetic picture.
const assert = require("assert");
const path = require("path");
["util", "sky", "trace"].forEach(function (f) { require(path.join(__dirname, "../../src/engine/" + f + ".js")); });
require(path.join(__dirname, "simulate.js"));
const LU = globalThis.LU, SIM = globalThis.LUTEST.simulate;

let passed = 0;
function test(name, fn) {
  const done = function () { passed++; console.log("ok   " + name); };
  const fail = function (e) { console.log("FAIL " + name + "\n     " + (e && e.stack || e)); process.exitCode = 1; };
  try { const r = fn(); if (r && r.then) return r.then(done, fail); done(); } catch (e) { fail(e); }
}

function fakeCtx() {
  const calls = { fill: 0, stroke: 0, arc: 0, lineTo: 0, shadows: [] };
  const stack = [];
  const ctx = {
    globalAlpha: 1, shadowBlur: 0, shadowColor: "", shadowOffsetX: 0, shadowOffsetY: 0, fillStyle: "", strokeStyle: "", lineWidth: 1,
    save() { stack.push({ a: this.globalAlpha }); }, restore() { const s = stack.pop(); if (s) this.globalAlpha = s.a; },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() { calls.lineTo++; }, arc() { calls.arc++; },
    fill() { calls.fill++; calls.shadows.push({ blur: this.shadowBlur, ox: this.shadowOffsetX, color: this.shadowColor, fill: this.fillStyle }); },
    stroke() { calls.stroke++; }
  };
  ctx.calls = calls;
  return ctx;
}

const sky = { width: 1600, height: 1200 };
const box = { cx: 800, cy: 600, size: 700 };
const whale = LU.trace.finish(sky, SIM.whale(box, { seed: 5, photoWidth: 1600 }).points);
const swoosh = LU.trace.finish(sky, SIM.swoosh(box, { seed: 5, photoWidth: 1600 }).points);
const dot = LU.trace.finish(sky, SIM.taps(box, { seed: 5, photoWidth: 1600 })[0].points);

test("drawStrokes draws glow + core, and nothing for no strokes", function () {
  const c = fakeCtx();
  LU.trace.drawStrokes(c, [whale, swoosh, dot], { pen: "white", short: 1080 });
  const n = LU.trace.CONFIG.glowLayers.length;
  assert.strictEqual(c.calls.fill, n + 2, "the glow layers, one core fill for the lines and one for the dots");
  assert(/^rgba\(255,255,255,/.test(c.calls.shadows[0].fill), "glow is in the pen colour");
  assert.strictEqual(c.calls.shadows[n].fill, "#ffffff");
  assert(/rgba\(20,30,50/.test(c.calls.shadows[n].color), "faint dark shadow under the core");
  assert.strictEqual(c.calls.shadows[n + 1].fill, "#ffffff");
  assert(/rgba\(14,22,40,0\.6/.test(c.calls.shadows[n + 1].color) && c.calls.shadows[n + 1].blur > c.calls.shadows[n].blur, "a tapped dot has a darker, wider shadow ring");
  const noGlow = fakeCtx(); LU.trace.drawStrokes(noGlow, [swoosh], { glow: false });
  assert.strictEqual(noGlow.calls.fill, 1);
  assert.strictEqual(c.globalAlpha, 1, "alpha restored");
  const e = fakeCtx(); LU.trace.drawStrokes(e, [], {}); LU.trace.drawStrokes(e, null, {});
  assert.strictEqual(e.calls.fill, 0);
});

test("pens", function () {
  ["white", "gold", "ink", "#abcdef", "nonsense", undefined].forEach(function (pen) {
    const c = fakeCtx(); LU.trace.drawStrokes(c, [swoosh], { pen: pen, short: 800 });
    const last = c.calls.shadows[c.calls.shadows.length - 1];
    assert(/^#[0-9a-f]{6}$/i.test(last.fill), String(pen));
  });
  assert.strictEqual(LU.trace.penHex("gold"), "#ffd27a");
  assert.strictEqual(LU.trace.penHex("ink"), "#1f3a5f");
});

test("draw-on: progress 0 draws nothing, partial and full work, any number is tolerated", function () {
  const c0 = fakeCtx(); LU.trace.drawStrokes(c0, [whale, dot], { progress: 0 }); assert.strictEqual(c0.calls.fill, 0);
  [0.01, 0.3, 0.5, 0.97, 1, 1.5, -1, NaN].forEach(function (p) {
    const c = fakeCtx(); LU.trace.drawStrokes(c, [whale, swoosh, dot], { progress: p });
  });
  const part = fakeCtx(), full = fakeCtx();
  LU.trace.drawStrokes(part, [swoosh], { progress: 0.5 }); LU.trace.drawStrokes(full, [swoosh], { progress: 1 });
  assert(part.calls.arc < full.calls.arc, "half drawn has fewer parts");
});

test("drawLive handles 0, 1 and many points", function () {
  const c = fakeCtx();
  LU.trace.drawLive(c, [], "white", 1);
  LU.trace.drawLive(c, [{ x: 5, y: 5 }], "white", 0.25);
  LU.trace.drawLive(c, [{ x: 5, y: 5 }, { x: 50, y: 60 }, { x: 80, y: 20 }], "ink", 0.25, { width: 4 });
  assert.strictEqual(c.calls.stroke, 1); assert.strictEqual(c.calls.fill, 1);
});

test("glowMask is null when nothing is closed", function () {
  assert.strictEqual(LU.trace.glowMask([swoosh, dot], 800, 600), null);
  assert.strictEqual(LU.trace.makeGlow({ width: 10, height: 10 }, [swoosh], {}), null);
});

function synthetic(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x / w, y / h), i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return LU.util.makeImageData(w, h, data);
}

test("sky.prepare: blue day, grey overcast, sunset, dark", async function () {
  const day = await LU.sky.prepare(synthetic(400, 300, function (u, v) { return [60 + 60 * v + 80 * Math.abs(Math.sin(u * 9) * Math.sin(v * 7)), 120 + 60 * v, 200 + 40 * v]; }));
  assert.strictEqual(day.tone, "day"); assert.strictEqual(day.suggestedPen, "white"); assert.strictEqual(day.warning, null);
  assert.strictEqual(day.width, 400); assert.strictEqual(day.height, 300); assert(day.image);
  const grey = await LU.sky.prepare(synthetic(400, 300, function (u, v) { const g = 180 + 25 * Math.sin(u * 6 + v * 3); return [g, g + 1, g + 3]; }));
  assert.strictEqual(grey.tone, "grey"); assert.strictEqual(grey.suggestedPen, "ink");
  const sun = await LU.sky.prepare(synthetic(400, 300, function (u, v) { return [255 - 40 * v, 150 - 70 * v, 70 - 30 * v + 40 * (1 - v)]; }));
  assert.strictEqual(sun.tone, "sunset"); assert.strictEqual(sun.suggestedPen, "gold");
  const dark = await LU.sky.prepare(synthetic(400, 300, function (u, v) { return [14 + 10 * u, 18 + 10 * u, 38 + 12 * v]; }));
  assert.strictEqual(dark.tone, "dark"); assert.strictEqual(dark.warning, "dark");
});

test("sky.prepare is gentle: no pixel moves by a huge amount on a normal photo", async function () {
  const src = synthetic(500, 400, function (u, v) { return [90 + 90 * v + 30 * Math.sin(u * 20), 140 + 70 * v + 30 * Math.sin(u * 20), 215 + 30 * v + 20 * Math.sin(u * 20)]; });
  const out = await LU.sky.prepare(src);
  let big = 0, sum = 0;
  const a = src.data, b = out.image.data;
  for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); sum += d / 3; if (d / 3 > 40) big++; }
  console.log("     mean change " + (sum / (a.length / 4)).toFixed(1) + " levels, pixels moved by more than 40: " + big);
  assert(big === 0, "no big jumps");
  assert(sum / (a.length / 4) < 25, "mean change small");
});

Promise.resolve().then(function () { setTimeout(function () { console.log("\n" + passed + " passed" + (process.exitCode ? ", some FAILED" : "")); }, 50); });
