// node tests/engine/words.test.js   (plain asserts, no dependencies)
const assert = require("assert");
const path = require("path");
["util", "moon", "words", "trace", "finishes", "export"].forEach(function (f) { require(path.join(__dirname, "../../src/engine/" + f + ".js")); });
const LU = globalThis.LU;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

// 2026-10-06 19:42 UTC and in Philadelphia (EDT, UTC-4) it is 15:42
const MS = Date.UTC(2026, 9, 6, 19, 42);

test("when(): English (UK), 24-hour, London summer time", function () {
  const w = LU.words.when(MS, { locale: "en-GB", timeZone: "Europe/London" });
  assert.strictEqual(w.date, "Tue 6 Oct");
  assert.strictEqual(w.time, "20:42");
  assert.strictEqual(w.line, "Tue 6 Oct · 20:42");
  assert.strictEqual(w.stamp, "10 06 '26");
  assert.strictEqual(w.iso, "2026-10-06");
});

test("when(): English (Australia), 12-hour with a lower-case pm", function () {
  const w = LU.words.when(MS, { locale: "en-AU", timeZone: "Australia/Sydney" }); // 2026-10-07 06:42 (AEDT)
  assert.strictEqual(w.iso, "2026-10-07");
  assert.strictEqual(w.stamp, "10 07 '26");
  assert.strictEqual(w.time, "6:42 am");
  assert(/^Wed 7 Oct · 6:42 am$/.test(w.line), w.line);
});

test("when(): US English keeps the phone's own order (no commas, no narrow spaces)", function () {
  const w = LU.words.when(MS, { locale: "en-US", timeZone: "America/New_York" });
  assert.strictEqual(w.time, "3:42 pm");
  assert(!/[,  ]/.test(w.line), JSON.stringify(w.line));
  assert(/Tue/.test(w.date) && /Oct/.test(w.date) && /6/.test(w.date), w.date);
});

test("when(): German", function () {
  const w = LU.words.when(MS, { locale: "de-DE", timeZone: "Europe/Berlin" });
  assert.strictEqual(w.time, "21:42");
  assert(/^Di\.? 6\. Okt\.?$/.test(w.date), w.date);
});

test("when(): the iso date is the LOCAL date, not the UTC one", function () {
  const late = Date.UTC(2026, 9, 6, 23, 30); // already 7 Oct in Tokyo, still 6 Oct in New York
  assert.strictEqual(LU.words.when(late, { locale: "en-GB", timeZone: "Asia/Tokyo" }).iso, "2026-10-07");
  assert.strictEqual(LU.words.when(late, { locale: "en-GB", timeZone: "America/New_York" }).iso, "2026-10-06");
});

test("when(): default (the phone's own settings) returns every field; 0 means now", function () {
  const w = LU.words.when(0);
  ["line", "date", "time", "stamp", "iso"].forEach(function (k) { assert(typeof w[k] === "string" && w[k].length, k); });
  assert(/^\d{4}-\d{2}-\d{2}$/.test(w.iso));
  assert(/^\d{2} \d{2} '\d{2}$/.test(w.stamp), w.stamp);
  assert(w.line.indexOf(" · ") > 0);
  const d = new Date(), pad = function (n) { return (n < 10 ? "0" : "") + n; };
  assert.strictEqual(w.iso, d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()));
});

test("slug()", function () {
  assert.strictEqual(LU.words.slug("Philadelphia"), "philadelphia");
  assert.strictEqual(LU.words.slug("São Paulo"), "sao-paulo");
  assert.strictEqual(LU.words.slug("Zürich!"), "zurich");
  assert.strictEqual(LU.words.slug("  New   York, NY "), "new-york-ny");
  assert.strictEqual(LU.words.slug("Straße"), "strasse");
  assert.strictEqual(LU.words.slug("東京"), "");
  assert.strictEqual(LU.words.slug("Москва"), "");
  assert.strictEqual(LU.words.slug(""), "");
  assert.strictEqual(LU.words.slug(null), "");
  assert.strictEqual(LU.words.slug("---"), "");
  const long = LU.words.slug("Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch");
  assert(long.length <= 30 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(long), long);
  const cut = LU.words.slug("aaaaaaaaaaaaaaaaaaaaaaaaaaaa bbb ccc"); // cut at 30 must not leave a trailing hyphen
  assert(!/-$/.test(cut) && cut.length <= 30, cut);
});

// ----- fit: measured in a fake font where every character is 0.5 x the size wide -----
const measure = function (t, s) { return t.length * s * 0.5; };

test("fit(): short text keeps its full size on one line", function () {
  const r = LU.words.fit(measure, "I saw a whale.", 500, 60);
  assert.strictEqual(r.size, 60); assert.deepStrictEqual(r.lines, ["I saw a whale."]);
});

test("fit(): shrinks down to 70% before it wraps", function () {
  const text = "I saw a giant whale over";               // 24 chars: 720 px at 60
  const r = LU.words.fit(measure, text, 560, 60);         // 0.5*24*s <= 560 -> s <= 46.6 (>= 42 = 70%)
  assert.strictEqual(r.lines.length, 1);
  assert(r.size < 60 && r.size >= 42 - 1e-6, "size " + r.size);
  assert(measure(text, r.size) <= 560);
});

test("fit(): wraps to 2 lines when 70% is not enough, never overflows", function () {
  const text = "I saw a giant sleepy whale over the sea"; // 40 chars
  const r = LU.words.fit(measure, text, 400, 60);
  assert.strictEqual(r.lines.length, 2, JSON.stringify(r));
  r.lines.forEach(function (l) { assert(measure(l, r.size) <= 400 + 1e-6, l); });
  assert.strictEqual(r.lines.join(" "), text);
});

test("fit(): a height limit is respected", function () {
  const r = LU.words.fit(measure, "I saw a giant sleepy whale over the sea", 400, 60, { maxH: 60 });
  assert(r.height <= 60 + 1e-6, "height " + r.height);
  r.lines.forEach(function (l) { assert(measure(l, r.size) <= 400 + 1e-6); });
});

test("fit(): one very long word is shrunk, then cut with an ellipsis, never overflowing", function () {
  const r = LU.words.fit(measure, "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch", 200, 40);
  assert.strictEqual(r.lines.length, 1);
  assert(measure(r.lines[0], r.size) <= 200 + 1e-6, JSON.stringify(r));
  const r2 = LU.words.fit(measure, "x".repeat(400), 100, 40);
  assert(measure(r2.lines[0], r2.size) <= 100 + 1e-6 && /…$/.test(r2.lines[0]), JSON.stringify(r2));
});

test("fit(): empty text, and maxLines 1", function () {
  assert.deepStrictEqual(LU.words.fit(measure, "   ", 100, 30).lines, []);
  const r = LU.words.fit(measure, "one two three four five six seven eight", 150, 30, { maxLines: 1 });
  assert.strictEqual(r.lines.length, 1);
  assert(measure(r.lines[0], r.size) <= 150 + 1e-6);
});

// ----- file names -----
test("fileName(): look-up-<city>-<date>.<ext> and the date-only form", function () {
  const when = new Date(2026, 9, 6, 19, 42).getTime(); // local time on whichever machine runs this
  assert.strictEqual(LU.export.fileName({ city: "Philadelphia", when: when }, "jpg"), "look-up-philadelphia-2026-10-06.jpg");
  assert.strictEqual(LU.export.fileName({ city: "São Paulo", when: when }, "mp4"), "look-up-sao-paulo-2026-10-06.mp4");
  assert.strictEqual(LU.export.fileName({ city: "", when: when }, "jpg"), "look-up-2026-10-06.jpg");
  assert.strictEqual(LU.export.fileName({ city: "東京", when: when }, ".jpg"), "look-up-2026-10-06.jpg");
  assert(/^look-up-\d{4}-\d{2}-\d{2}\.jpg$/.test(LU.export.fileName({}, "jpg")));
});

// ----- the words of every look fit their space (no canvas needed: a rough measure stands in) -----
function fakeEnv(format, settings) {
  return {
    format: format, settings: settings, ms: MS,
    info: LU.words.when(MS, { locale: "en-GB", timeZone: "Europe/London" }),
    measure: function (font, text) { const m = /(\d+(?:\.\d+)?)px/.exec(font); return text.length * (m ? +m[1] : 16) * 0.46; }
  };
}
const CASES = [
  { said: "I saw a whale.", city: "Philadelphia", to: "Maya" },
  { said: "I saw a giant sleepy whale over the sea", city: "Llanfairpwllgwyngyll Wales Uk", to: "Maximiliana Alexandria" },
  { said: "", city: "", to: "" },
  { said: "x".repeat(40), city: "y".repeat(28), to: "z".repeat(20) }
];

test("looks: every block stays inside the story safe zone and inside the square card", function () {
  LU.FINISHES.forEach(function (f) {
    ["square", "story"].forEach(function (format) {
      CASES.forEach(function (c) {
        const look = LU.finishes.get(f.id), lay = look.text(fakeEnv(format, c));
        // story: the real safe zone (y 270..1540, 90 px sides). square: inside the canvas with a 40 px margin (Film's strip runs to the bottom)
        const box = format === "story" ? LU.finishes.box(format) : { x: 40, y: 0, w: 1000, h: 1070 };
        lay.blocks.forEach(function (b) {
          if (b.custom) return;
          assert(b.x0 >= box.x - 0.5 && b.x1 <= box.x + box.w + 0.5, f.id + " " + format + " x " + b.x0 + ".." + b.x1 + " " + JSON.stringify(b.lines[0] && b.lines[0].t));
          assert(b.top >= box.y - 40 && b.bottom <= box.y + box.h + 10, f.id + " " + format + " y " + b.top + ".." + b.bottom);
          assert(b.lines.length <= 2, f.id + " lines " + b.lines.length);
        });
      });
    });
  });
});

test("looks: the words, the date line and the 'for' line are where they should be (empty city = The sky today)", function () {
  const look = LU.finishes.get("postcard");
  const lay = look.text(fakeEnv("square", { said: "Hello", city: "", to: "Maya" }));
  const texts = lay.blocks.map(function (b) { return b.lines.map(function (l) { return l.t; }).join("|"); });
  assert(texts.indexOf("Hello") >= 0 && texts.indexOf("for Maya") >= 0, JSON.stringify(texts));
  assert(texts.some(function (t) { return /^Tue 6 Oct · 20:42$/.test(t); }), JSON.stringify(texts));
  const let_ = LU.finishes.get("letter").text(fakeEnv("square", { said: "Hello", city: "", to: "Maya" }));
  const lt = let_.blocks.map(function (b) { return b.lines.map(function (l) { return l.t; }).join(" "); });
  assert.strictEqual(lt[0], "Dear Maya,");
  assert(/^the sky today, Tue 6 Oct/.test(lt[2]), lt[2]);
  const noTo = LU.finishes.get("letter").text(fakeEnv("square", { said: "Hello", city: "Rome", to: "" }));
  assert(!noTo.blocks.some(function (b) { return /Dear/.test(b.lines[0].t); }), "Dear appears only with a name");
  assert(/the sky over Rome/.test(noTo.blocks[1].lines[0].t));
});

// ----- the crop -----
test("cropFor(): no strokes = the centred photo; strokes = their box + 25%, centred", function () {
  const win = { w: 900, h: 480 }, a = win.w / win.h;
  const none = LU.finishes.cropFor([], 2000, 1500, win);
  assert(Math.abs(none.w / none.h - a) < 1e-6 && none.w === 2000 && Math.abs(none.x) < 1e-6 && Math.abs(none.y - (1500 - none.h) / 2) < 1e-6);
  const line = { kind: "line", closed: false, points: [{ x: 800, y: 600, w: 1 }, { x: 1200, y: 800, w: 1 }] };
  const c = LU.finishes.cropFor([line], 2000, 1500, win);
  assert(Math.abs(c.w / c.h - a) < 1e-6, "window aspect");
  assert(c.w >= 400 * 1.5 - 1e-6, "25% padding each side " + c.w);
  assert(Math.abs((c.x + c.w / 2) - 1000) < 1e-6 && Math.abs((c.y + c.h / 2) - 700) < 1e-6, "centred on the drawing");
  assert(c.fill === false && c.ext === undefined && c.x >= 0 && c.y >= 0 && c.x + c.w <= 2000 && c.y + c.h <= 1500);
});

test("cropFor(): a wide drawing in a tall window scales the sky down (fill: blurred copy around it), the drawing stays inside", function () {
  const win = { w: 700, h: 1000 };
  const line = { kind: "line", closed: false, points: [{ x: 150, y: 400, w: 1 }, { x: 1150, y: 560, w: 1 }] };
  const c = LU.finishes.cropFor([line], 1280, 960, win);
  assert(c.fill === true && c.ext === undefined, JSON.stringify(c));
  assert(c.x <= 150 && c.x + c.w >= 1150 && c.y <= 400 && c.y + c.h >= 560, JSON.stringify(c));
});

console.log(passed + " passed");
