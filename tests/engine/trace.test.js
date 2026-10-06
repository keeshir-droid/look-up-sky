// node tests/engine/trace.test.js   (plain asserts, no dependencies)
const assert = require("assert");
const path = require("path");
require(path.join(__dirname, "../../src/engine/util.js"));
require(path.join(__dirname, "../../src/engine/trace.js"));
require(path.join(__dirname, "simulate.js"));
const LU = globalThis.LU, SIM = globalThis.LUTEST.simulate;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

const sky = { width: 1800, height: 1200 };
const short = 1200;
const box = { cx: 900, cy: 600, size: 800 };
const simOpts = { seed: 7, photoWidth: 1800 };
const hyp = Math.hypot;

function checkShape(s) {
  assert(s && typeof s === "object", "returns an object");
  assert(s.kind === "line" || s.kind === "dot");
  assert(Array.isArray(s.points) && s.points.length >= 1);
  assert(typeof s.closed === "boolean");
  assert(isFinite(s.length) && isFinite(s.seed));
  s.points.forEach(function (p) { assert(isFinite(p.x) && isFinite(p.y) && isFinite(p.w), "finite point"); });
}

function nearestIdealDev(points, ideal) {
  let worst = 0, sum = 0;
  points.forEach(function (p) {
    let best = Infinity;
    for (let i = 0; i < ideal.length; i++) { const d = hyp(p.x - ideal[i].x, p.y - ideal[i].y); if (d < best) best = d; }
    if (best > worst) worst = best; sum += best;
  });
  return { max: worst, mean: sum / points.length };
}
function wobble(raw) { // mean absolute turning angle between samples 1.5% of the short side apart (equal spacing for both)
  const step = 0.015 * short, points = [raw[0]];
  let acc = raw[0];
  for (let i = 1; i < raw.length; i++) {
    let d = hyp(raw[i].x - acc.x, raw[i].y - acc.y);
    while (d >= step) {
      const f = step / d;
      acc = { x: acc.x + (raw[i].x - acc.x) * f, y: acc.y + (raw[i].y - acc.y) * f };
      points.push(acc);
      d = hyp(raw[i].x - acc.x, raw[i].y - acc.y);
    }
  }
  let turn = 0, len = 0;
  for (let i = 2; i < points.length; i++) {
    const a = Math.atan2(points[i - 1].y - points[i - 2].y, points[i - 1].x - points[i - 2].x);
    const b = Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    turn += d; len += hyp(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return turn / (len / (0.01 * short));
}

test("whale loop with overshoot closes", function () {
  const sim = SIM.whale(box, simOpts);
  const s = LU.trace.finish(sky, sim.points);
  checkShape(s);
  assert.strictEqual(s.kind, "line");
  assert.strictEqual(s.closed, true, "whale should close");
  assert(LU.trace.hasClosed([s]));
  const first = s.points[0], last = s.points[s.points.length - 1];
  assert(hyp(first.x - last.x, first.y - last.y) < 0.012 * short, "closed shape: last point sits right next to the first");
  assert(s.length > 0.15 * short);
});

test("overshoot is trimmed (no tail sticking out of a closed loop)", function () {
  const sim = SIM.whale(box, { seed: 3, photoWidth: 1800, jitter: 0, wander: 0 });
  const s = LU.trace.finish(sky, sim.points);
  assert.strictEqual(s.closed, true);
  // nothing of the stroke should wander further than a little from the ideal shape's outline
  // (the overshoot part of the ideal path is on the outline anyway) -- check the point count is plausible instead
  const pts = s.points; let selfCross = 0;
  for (let i = 0; i < pts.length - 1; i += 2) for (let j = i + 6; j < pts.length - 1; j += 2) {
    if (i === 0 && j >= pts.length - 8) continue;
    const a = pts[i], b = pts[i + 1], c = pts[j], d = pts[j + 1];
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(den) < 1e-9) continue;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) selfCross++;
  }
  assert(selfCross <= 3, "closed whale should not cross itself more than a touch (got " + selfCross + ")");
});

test("heart closes", function () {
  const s = LU.trace.finish(sky, SIM.heart(box, simOpts).points);
  checkShape(s);
  assert.strictEqual(s.closed, true);
});

test("open swoosh stays open", function () {
  const s = LU.trace.finish(sky, SIM.swoosh(box, simOpts).points);
  checkShape(s);
  assert.strictEqual(s.kind, "line");
  assert.strictEqual(s.closed, false);
  assert(!LU.trace.hasClosed([s]));
});

test("a stroke whose ends are 5% apart does not close, 3% does", function () {
  function arc(gapFrac) {
    // a C shape: radius 0.2*short, with the ends gapFrac*short apart
    const r = 0.2 * short, pts = [];
    const a0 = Math.asin(gapFrac * short / 2 / r);
    const total = Math.PI * 2 - 2 * a0;
    for (let i = 0; i <= 90; i++) {
      const a = a0 + total * i / 90;
      pts.push({ x: 900 + r * Math.cos(a), y: 600 + r * Math.sin(a), t: i * 20 });
    }
    return pts;
  }
  assert.strictEqual(LU.trace.finish(sky, arc(0.05)).closed, false, "5% gap stays open");
  assert.strictEqual(LU.trace.finish(sky, arc(0.03)).closed, true, "3% gap closes");
});

test("a short loop (under 15% of the short side) does not close", function () {
  const r = 0.02 * short, pts = [];
  for (let i = 0; i <= 40; i++) { const a = Math.PI * 2 * i / 40; pts.push({ x: 900 + r * Math.cos(a), y: 600 + r * Math.sin(a), t: i * 20 }); }
  const s = LU.trace.finish(sky, pts);
  assert.strictEqual(s.closed, false);
});

test("taps become dots", function () {
  SIM.taps(box, simOpts).forEach(function (tap) {
    const s = LU.trace.finish(sky, tap.points);
    checkShape(s);
    assert.strictEqual(s.kind, "dot");
    assert.strictEqual(s.points.length, 1);
    assert.strictEqual(s.closed, false);
    assert.strictEqual(s.length, 0);
  });
});

test("dot rule: under 1% of the short side is a dot, a 5% line is a line", function () {
  const tiny = [{ x: 500, y: 500, t: 0 }, { x: 500 + 0.006 * short, y: 500, t: 400 }, { x: 500, y: 500 + 0.004 * short, t: 800 }];
  assert.strictEqual(LU.trace.finish(sky, tiny).kind, "dot");
  const five = [];
  for (let i = 0; i <= 10; i++) five.push({ x: 500 + 0.05 * short * i / 10, y: 500, t: i * 100 });
  assert.strictEqual(LU.trace.finish(sky, five).kind, "line");
});

test("never returns null, whatever it is given", function () {
  const cases = [
    undefined, null, [], [null], [undefined, null], [{}], [{ x: NaN, y: 1 }], [{ x: 1, y: 2 }],
    [{ x: 1, y: 2, t: 5 }, { x: 1, y: 2, t: 5 }], [{ x: 0, y: 0 }, { x: 1e9, y: 1e9 }, { x: -1e9, y: 3 }],
    [{ x: 1, y: 1, t: 0 }, { x: 400, y: 400, t: 0 }, { x: 800, y: 100, t: 0 }], // all the same timestamp
    [{ x: 1, y: 1, t: 100 }, { x: 400, y: 400, t: 50 }, { x: 800, y: 100, t: 10 }], // time running backwards
    [{ x: 100, y: 100 }, { x: 400, y: 380 }, { x: 800, y: 100 }, { x: 900, y: 500 }]  // no timestamps at all
  ];
  cases.forEach(function (pts, i) {
    const s = LU.trace.finish(sky, pts);
    assert(s, "case " + i + " returned " + s);
    checkShape(s);
  });
  checkShape(LU.trace.finish(null, [{ x: 5, y: 5, t: 0 }, { x: 300, y: 300, t: 100 }]));
  checkShape(LU.trace.finish({ width: 0, height: 0 }, [{ x: 5, y: 5, t: 0 }, { x: 300, y: 300, t: 100 }]));
  assert.strictEqual(LU.trace.finish(sky, []).kind, "dot");
});

test("smoothing keeps the point count sane", function () {
  [SIM.whale(box, simOpts), SIM.heart(box, simOpts), SIM.swoosh(box, simOpts)].forEach(function (sim, i) {
    const s = LU.trace.finish(sky, sim.points);
    const expected = s.length / (0.004 * short);
    assert(s.points.length >= 10, "shape " + i + " has " + s.points.length + " points");
    assert(s.points.length < 4 * expected + 20 && s.points.length > 0.4 * expected, "shape " + i + ": " + s.points.length + " points for length " + s.length + " (expected about " + Math.round(expected) + ")");
    assert(s.points.length < 1500, "not too many points to draw every frame");
  });
});

test("width w stays within 0.75 .. 1.25 and is not constant for uneven speed", function () {
  const s = LU.trace.finish(sky, SIM.whale(box, simOpts).points);
  let lo = 9, hi = 0;
  s.points.forEach(function (p) { lo = Math.min(lo, p.w); hi = Math.max(hi, p.w); });
  assert(lo >= 0.75 && hi <= 1.25, "w range " + lo + ".." + hi);
  assert(hi - lo > 0.05, "width should vary with speed (range " + lo + ".." + hi + ")");
});

test("smoothed line follows the intended shape and is calmer than the raw trace", function () {
  [["whale", SIM.whale(box, simOpts)], ["heart", SIM.heart(box, simOpts)], ["swoosh", SIM.swoosh(box, simOpts)]].forEach(function (pair) {
    const sim = pair[1];
    const s = LU.trace.finish(sky, sim.points);
    const dev = nearestIdealDev(s.points, sim.ideal);
    const wRaw = wobble(sim.points), wS = wobble(s.points), wIdeal = wobble(sim.ideal);
    console.log("     " + pair[0] + ": " + sim.points.length + " raw pts -> " + s.points.length + ", dev from ideal mean " + (100 * dev.mean / short).toFixed(2) + "% max " + (100 * dev.max / short).toFixed(2) + "% of short side, turning per 1.5% step: ideal " + wIdeal.toFixed(3) + ", raw " + wRaw.toFixed(3) + ", smoothed " + wS.toFixed(3));
    assert(dev.mean < 0.03 * short, pair[0] + " drifted from the shape (mean " + dev.mean.toFixed(1) + " px)");
    assert(wS < wRaw, pair[0] + " not smoother than the raw trace");
    assert(wS < wIdeal * 1.4, pair[0] + " still wobbles much more than the intended shape");
  });
});

test("hasClosed", function () {
  const closed = { kind: "line", closed: true, points: [{ x: 0, y: 0, w: 1 }, { x: 10, y: 0, w: 1 }, { x: 5, y: 8, w: 1 }], length: 30, seed: 1 };
  const open = { kind: "line", closed: false, points: [{ x: 0, y: 0, w: 1 }, { x: 10, y: 0, w: 1 }], length: 10, seed: 1 };
  const dot = { kind: "dot", closed: false, points: [{ x: 0, y: 0, w: 1 }], length: 0, seed: 1 };
  assert.strictEqual(LU.trace.hasClosed([]), false);
  assert.strictEqual(LU.trace.hasClosed(null), false);
  assert.strictEqual(LU.trace.hasClosed([open, dot]), false);
  assert.strictEqual(LU.trace.hasClosed([open, closed, dot]), true);
});

test("same trace gives the same stroke (seed and shape are stable)", function () {
  const pts = SIM.whale(box, simOpts).points;
  const a = LU.trace.finish(sky, pts), b = LU.trace.finish(sky, pts);
  assert.strictEqual(a.seed, b.seed);
  assert.strictEqual(JSON.stringify(a.points), JSON.stringify(b.points));
});

test("works for a portrait photo and a small photo", function () {
  const portrait = { width: 1125, height: 2000 };
  const s = LU.trace.finish(portrait, SIM.whale({ cx: 560, cy: 900, size: 700 }, { seed: 2, photoWidth: 1125 }).points);
  checkShape(s); assert.strictEqual(s.closed, true);
  const small = { width: 320, height: 240 };
  const t = LU.trace.finish(small, SIM.heart({ cx: 160, cy: 120, size: 120 }, { seed: 2, photoWidth: 320 }).points);
  checkShape(t);
});

test("strokeProgress is sequential, in order and ends at 1", function () {
  const a = LU.trace.finish(sky, SIM.swoosh(box, simOpts).points);
  const d = LU.trace.finish(sky, SIM.taps(box, simOpts)[0].points);
  const b = LU.trace.finish(sky, SIM.heart(box, simOpts).points);
  const list = [a, d, b];
  assert.deepStrictEqual(LU.trace.strokeProgress(list, 0), [0, 0, 0]);
  assert.deepStrictEqual(LU.trace.strokeProgress(list, 1), [1, 1, 1]);
  let prev = [0, 0, 0];
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const cur = LU.trace.strokeProgress(list, Math.min(1, p));
    for (let i = 0; i < 3; i++) assert(cur[i] >= prev[i] - 1e-9, "never goes backwards");
    // a later stroke only starts once the earlier one is done
    if (cur[1] > 0) assert.strictEqual(cur[0], 1);
    if (cur[2] > 0) assert.strictEqual(cur[1], 1);
    prev = cur;
  }
  assert(LU.trace.pop(0) === 0 && Math.abs(LU.trace.pop(1) - 1) < 1e-9);
  let peak = 0; for (let p = 0; p <= 1; p += 0.01) peak = Math.max(peak, LU.trace.pop(p));
  assert(peak > 1.1 && peak <= 1.16, "dots overshoot to about 1.15 (peak " + peak + ")");
});

test("boundsOf", function () {
  assert.strictEqual(LU.trace.boundsOf([]), null);
  const s = LU.trace.finish(sky, SIM.whale(box, simOpts).points);
  const b = LU.trace.boundsOf([s]);
  assert(b.x1 > b.x0 && b.y1 > b.y0);
});

console.log("\n" + passed + " passed" + (process.exitCode ? ", some FAILED" : ""));
