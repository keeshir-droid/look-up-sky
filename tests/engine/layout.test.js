// node tests/engine/layout.test.js   (plain asserts, no dependencies, no canvas)
// Where the sky lands on every card, for every look, both formats and awkward drawings:
//   - the crop never runs past the photo unless `fill` says the sky was scaled down (blurred copy around it)
//   - the drawing and its glow stay inside the window (square) / inside the 90 px side margins (full-bleed stories)
//   - the Postcard's stamp + postmark group stays off the drawing
//   - the words never run into Film's date stamp, empty words fall back, the moon is about 1.1x the cap height
const assert = require("assert");
const path = require("path");
["util", "sky", "trace", "moon", "words", "finishes", "sample"].forEach(function (f) { require(path.join(__dirname, "../../src/engine/" + f + ".js")); });
require(path.join(__dirname, "simulate.js"));
const LU = globalThis.LU, SIM = globalThis.LUTEST.simulate;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

// ---------- drawings ----------
function timed(pts, step) { return pts.map(function (p, i) { return { x: p[0], y: p[1], t: i * (step || 40) }; }); }
function sampleWhale() { // the sample sky's preset drawing: 1280 x 960
  const sky = { width: 1280, height: 960 };
  const strokes = [LU.trace.finish(sky, timed(LU.sample._outline, 40)), LU.trace.finish(sky, timed(LU.sample._flipper, 40)),
    LU.trace.finish(sky, [{ x: 402, y: 302, t: 0 }, { x: 402.5, y: 301.7, t: 40 }, { x: 402.2, y: 302.2, t: 80 }])];
  return { name: "sample whale", sky: sky, strokes: strokes };
}
function simulated(name, W, H, size, cx, cy, seed) { // a messy finger loop plus two taps, like tests/trace.html
  const sky = { width: W, height: H }, box = { cx: W * cx, cy: H * cy, size: size * Math.min(W, H) };
  const base = { seed: seed || 7, photoWidth: W, jitter: 3 };
  const strokes = [LU.trace.finish(sky, SIM.whale(box, base).points)];
  SIM.taps({ cx: box.cx, cy: box.cy, size: 0.3 * box.size }, base).forEach(function (t) { strokes.push(LU.trace.finish(sky, t.points)); });
  return { name: name, sky: sky, strokes: strokes };
}
const DRAWINGS = [
  sampleWhale(),
  simulated("portrait photo, big loop", 1500, 2000, 0.62 * 1500 / 1500, 0.5, 0.55, 7),
  simulated("portrait photo, small loop", 1500, 2000, 0.3, 0.5, 0.4, 3),
  simulated("landscape photo, loop", 2000, 1500, 0.55, 0.45, 0.5, 5),
  simulated("landscape photo, loop at the very edge", 2000, 1500, 0.4, 0.88, 0.2, 9),
  { name: "one tap", sky: { width: 1600, height: 1200 }, strokes: [LU.trace.finish({ width: 1600, height: 1200 }, [{ x: 900, y: 500, t: 0 }])] },
  { name: "no strokes", sky: { width: 1280, height: 960 }, strokes: [] },
  { name: "tiny photo-wide swoosh", sky: { width: 1280, height: 960 }, strokes: [LU.trace.finish({ width: 1280, height: 960 }, SIM.swoosh({ cx: 640, cy: 480, size: 1250 }, { seed: 4, photoWidth: 1280 }).points)] }
];

const GLOW = 14; // the line's half width plus its soft glow, in card px

function view(look, format, d) { return LU.finishes.plan(LU.finishes.get(look), format, d.strokes, d.sky.width, d.sky.height); }
function mapped(pl, d) { // the drawing's box in piece space (card units before the tilt)
  const b = LU.trace.boundsOf(d.strokes);
  if (!b) return null;
  return { x0: pl.lay.x + pl.k * (b.x0 - pl.crop.x), x1: pl.lay.x + pl.k * (b.x1 - pl.crop.x), y0: pl.lay.y + pl.k * (b.y0 - pl.crop.y), y1: pl.lay.y + pl.k * (b.y1 - pl.crop.y) };
}

test("every look, both formats: the crop stays inside the photo unless the sky was scaled down", function () {
  LU.FINISHES.forEach(function (f) {
    ["square", "story"].forEach(function (format) {
      DRAWINGS.forEach(function (d) {
        const pl = view(f.id, format, d), c = pl.crop, tag = f.id + " " + format + " / " + d.name + " " + JSON.stringify(c);
        assert(c.ext === undefined, "the stretched-edge extension is gone");
        assert(Math.abs(c.w / c.h - pl.lay.w / pl.lay.h) < 1e-6, "crop has the window's shape: " + tag);
        if (!c.fill) assert(c.x >= -1e-6 && c.y >= -1e-6 && c.x + c.w <= d.sky.width + 1e-6 && c.y + c.h <= d.sky.height + 1e-6, "inside the photo: " + tag);
        else assert(c.x < 0 || c.y < 0 || c.x + c.w > d.sky.width || c.y + c.h > d.sky.height, "fill only when the crop reaches past: " + tag);
      });
    });
  });
});

test("every look, both formats: the drawing and its glow stay inside the window (the safe width on full-bleed stories)", function () {
  LU.FINISHES.forEach(function (f) {
    ["square", "story"].forEach(function (format) {
      DRAWINGS.forEach(function (d) {
        const pl = view(f.id, format, d), m = mapped(pl, d);
        if (!m) return;
        const g = pl.geo, w = g.win, tag = f.id + " " + format + " / " + d.name + " drawing " + [m.x0, m.x1, m.y0, m.y1].map(Math.round);
        assert(m.x0 - GLOW >= w.x - 1e-6 && m.x1 + GLOW <= w.x + w.w + 1e-6 && m.y0 - GLOW >= w.y - 1e-6 && m.y1 + GLOW <= w.y + w.h + 1e-6, "inside the window: " + tag);
        if (g.target) assert(m.x0 - GLOW >= g.target.x - 1e-6 && m.x1 + GLOW <= g.target.x + g.target.w + 1e-6 && m.y0 >= g.target.y - 1e-6 && m.y1 <= g.target.y + g.target.h + 1e-6, "inside the safe box: " + tag);
        if (format === "story" && (f.id === "film" || f.id === "plain")) assert(m.x0 - GLOW >= 90 - 1e-6 && m.x1 + GLOW <= 990 + 1e-6, "90 px side margins: " + tag);
      });
    });
  });
});

test("the sample whale in the full-bleed stories: no line on x < 90 or x > 990, and the sky is never scaled up past cover", function () {
  const d = DRAWINGS[0];
  ["film", "plain"].forEach(function (id) {
    const pl = view(id, "story", d), m = mapped(pl, d);
    assert(m.x0 - GLOW >= 90 && m.x1 + GLOW <= 990, id + " " + [m.x0, m.x1]);
    const cover = Math.max(1080 / d.sky.width, 1920 / d.sky.height);
    assert(pl.k <= cover * 1.03 * 1.0001, id + " k " + pl.k + " cover " + cover);
    assert(pl.crop.fill === true, id + " the wide drawing needs the blurred fill");
  });
});

test("the Postcard: the stamp, the postmark and the lines never sit on the drawing", function () {
  const bad = [];
  ["square", "story"].forEach(function (format) {
    DRAWINGS.forEach(function (d) {
      const pl = view("postcard", format, d), a = pl.arr;
      assert(a && a.stamp && a.pm, "arrangement exists");
      if (a.overlap !== 0) bad.push(format + " / " + d.name + " corner " + a.corner + " s " + a.s + " overlap " + a.overlap);
      assert(["tr", "tl", "br", "bl"].indexOf(a.corner) >= 0);
      assert(a.s >= 0.7 - 1e-9 && a.s <= 1);
      // the group stays inside the photo window
      const w = pl.geo.win, s = a.stamp, p = a.pm;
      assert(s.cx - s.w / 2 >= w.x && s.cx + s.w / 2 <= w.x + w.w && s.cy - s.h / 2 >= w.y && s.cy + s.h / 2 <= w.y + w.h, "stamp inside the window: " + d.name);
      assert(p.cx - p.R >= w.x - 40 && p.cx + p.R <= w.x + w.w + 40, "postmark nearly inside: " + d.name);
      // only the ring's outer edge reaches onto the stamp: about 7% of the ring diameter, so the text stays clear
      const depth = (s.w / 2 + p.R) - Math.abs(p.cx - s.cx);
      assert(Math.abs(depth / (2 * p.R) - 0.075) < 0.01, "ring overlap " + depth / (2 * p.R) + " of the diameter");
      // the lines point towards the nearer card edge
      assert(p.dir === (a.corner === "tr" || a.corner === "br" ? 1 : -1));
    });
  });
  assert.strictEqual(bad.length, 0, "overlaps remain: " + bad.join("; "));
});

test("the Postcard prefers the top-right corner when it is free", function () {
  const d = simulated("tiny loop, low left", 2000, 1500, 0.12, 0.35, 0.65, 3);
  const a = view("postcard", "square", d).arr;
  assert.strictEqual(a.corner, "tr");
  assert.strictEqual(a.s, 1);
  assert.strictEqual(view("postcard", "square", { sky: { width: 1280, height: 960 }, strokes: [] }).arr.corner, "tr", "no drawing: top-right");
});

test("the Postcard moves the group to a free corner (or shrinks it) when the drawing is in the way", function () {
  // a drawing that fills the top-right of the window
  const d = simulated("big loop", 2000, 1500, 0.9, 0.55, 0.5, 5);
  const a = view("postcard", "square", d).arr;
  assert(a.corner !== "tr" || a.s < 1, JSON.stringify([a.corner, a.s]));
});

// ---------- the words ----------
const MS = Date.UTC(2026, 9, 6, 19, 42);
function fakeEnv(format, settings) {
  return {
    format: format, settings: settings, ms: MS, info: LU.words.when(MS, { locale: "en-GB", timeZone: "Europe/London" }),
    measure: function (font, text) { const m = /(\d+(?:\.\d+)?)px/.exec(font); return text.length * (m ? +m[1] : 16) * 0.46; }
  };
}
const LONG = { said: "I saw a very large whale eating a cloud", city: "Thiruvananthapuram Kerala IN", to: "Maximiliano Fernando" };

test("Film: the words never run into the date stamp (story and square), the details line has its own row", function () {
  ["story", "square"].forEach(function (format) {
    [LONG, { said: "x".repeat(40), city: "y".repeat(28), to: "z".repeat(20) }, { said: "I saw a whale.", city: "Rome", to: "" }].forEach(function (c) {
      const lay = LU.finishes.get("film").text(fakeEnv(format, c));
      const stamp = lay.blocks.find(function (b) { return b.custom; }), words = lay.blocks[0];
      assert(stamp, "the date stamp");
      assert(words.x1 <= stamp.x0 - 20, format + " words end " + words.x1 + " stamp starts " + stamp.x0);
      assert(words.lines.length <= 2);
      const detail = lay.blocks.find(function (b) { return b.moon; });
      // the details line never gets smaller than 24 px (story) / 20 px (square): it wraps to two lines first
      assert(detail.size >= (format === "story" ? 24 : 20) - 1e-6, format + " the details line stays readable: " + detail.size);
      assert(detail.lines.length <= 2);
      const story = format === "story";
      assert(words.x0 >= (story ? 90 : 60) - 0.5 && detail.x1 <= (story ? 990 : 1020) + 0.5);
    });
  });
});

test("empty words: Postcard, Polaroid and Letter fall back to 'Look up.'; Film and Just the sky stay quiet", function () {
  const empty = { said: "  ", city: "", to: "" };
  ["postcard", "polaroid", "letter"].forEach(function (id) {
    ["square", "story"].forEach(function (format) {
      const texts = [].concat.apply([], LU.finishes.get(id).text(fakeEnv(format, empty)).blocks.map(function (b) { return b.lines.map(function (l) { return l.t; }); }));
      assert(texts.indexOf("Look up.") >= 0, id + " " + format + " " + JSON.stringify(texts));
    });
  });
  ["film", "plain"].forEach(function (id) {
    const texts = [].concat.apply([], LU.finishes.get(id).text(fakeEnv("square", empty)).blocks.map(function (b) { return b.lines.map(function (l) { return l.t; }); }));
    assert(texts.indexOf("Look up.") < 0, id + " " + JSON.stringify(texts));
    assert(texts.some(function (t) { return /The sky today/.test(t); }), id + " keeps the city fallback " + JSON.stringify(texts));
  });
  const withWords = LU.finishes.get("postcard").text(fakeEnv("square", { said: "Hello there", city: "", to: "" }));
  assert(withWords.blocks.some(function (b) { return b.lines[0].t === "Hello there"; }) && !withWords.blocks.some(function (b) { return b.lines[0].t === "Look up."; }));
});

test("the moon icon is about 1.1x the date text's cap height", function () {
  ["postcard", "polaroid", "film", "letter", "plain"].forEach(function (id) {
    ["square", "story"].forEach(function (format) {
      LU.finishes.get(id).text(fakeEnv(format, LONG)).blocks.forEach(function (b) {
        if (!b.moon) return;
        const ratio = b.moon.d / (0.7 * b.size);
        assert(ratio >= 1.05 && ratio <= 1.25, id + " " + format + " moon/cap " + ratio.toFixed(2));
      });
    });
  });
});

console.log(passed + " passed");
