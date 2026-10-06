// Contract check: loads src/engine/*.js in Node (vm, PLAN.md 6.1 order, no browser) and checks that every
// name in PLAN.md 7.3 exists with the right type, that the ids in PENS, FINISHES and DEFAULTS match, that
// fileName gives the names in PLAN.md section 3 Step 6, the moon phase on known dates, the trace smoothing
// (close / stay open / dot), that the screens only call LU names that exist, and the script order.
// Pattern copied from ../underline/tests/smoke.js.
//   node tests/smoke.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ORDER = ["util", "decode", "sky", "trace", "moon", "words", "finishes", "card", "sample", "export", "share"];

// minimal stand-ins for the browser: nothing here may be needed at load time (no document, no window)
const sandbox = {
  console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, URL: URL, Promise: Promise, Intl: Intl, Date: Date, Math: Math,
  Uint8Array: Uint8Array, Float32Array: Float32Array, Float64Array: Float64Array, Int32Array: Int32Array, Uint8ClampedArray: Uint8ClampedArray,
  WeakMap: WeakMap
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let fails = 0;
function report(ok, label, extra) {
  if (!ok) fails += 1;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra ? "  (" + extra + ")" : ""));
}

for (const name of ORDER) {
  const file = path.join(ROOT, "src", "engine", name + ".js");
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
    report(true, "load src/engine/" + name + ".js");
  } catch (e) {
    report(false, "load src/engine/" + name + ".js", e && e.message);
  }
}

const LU = sandbox.LU || {};
function get(p) {
  return p.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, LU);
}
function has(p, type) {
  const v = get(p);
  const t = Array.isArray(v) ? "array" : typeof v;
  report(v != null && t === type, "LU." + p + " is " + type, t === type ? "" : "found " + t);
}

// PLAN.md 7.3
has("PENS", "array");
has("FINISHES", "array");
has("DEFAULTS", "object");
has("END", "number");
has("decode.fileToImageData", "function");
has("sky.prepare", "function");
has("trace.finish", "function");
has("trace.hasClosed", "function");
has("words.when", "function");
has("words.slug", "function");
has("moon.phase", "function");
has("moon.draw", "function");
has("sample.load", "function");
has("card.create", "function");
has("card.startPreview", "function");
has("card.drawEditor", "function");
has("export.support", "function");
has("export.makeImage", "function");
has("export.makeVideo", "function");
has("export.fileName", "function");
has("share.platform", "function");
has("share.canShare", "function");
has("share.share", "function");
has("share.save", "function");

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
// objects made inside the vm have another realm's prototypes: compare through JSON
report(same(get("PENS"), [{ id: "white", hex: "#ffffff" }, { id: "gold", hex: "#ffd27a" }, { id: "ink", hex: "#1f3a5f" }]), "PENS match PLAN.md", JSON.stringify(get("PENS")));
report(same(get("FINISHES"), [{ id: "postcard", name: "Postcard" }, { id: "polaroid", name: "Polaroid" }, { id: "film", name: "Film" }, { id: "letter", name: "Letter" }, { id: "plain", name: "Just the sky" }]), "FINISHES match PLAN.md");
report(same(get("DEFAULTS"), { finish: "postcard", pen: "white", glow: false, said: "", city: "", to: "", when: 0 }), "DEFAULTS match PLAN.md", JSON.stringify(get("DEFAULTS")));
report(get("END") === 5.0, "END is 5.0");

// words.when shape (PLAN.md 7.3)
try {
  const w = LU.words.when(Date.UTC(2026, 9, 6, 12, 0));
  report(["line", "date", "time", "stamp", "iso"].every(function (k) { return typeof w[k] === "string" && w[k]; }), "words.when gives line, date, time, stamp, iso", JSON.stringify(w));
  report(w.line === w.date + " · " + w.time, "words.when line is date · time", w.line);
  report(/^\d{4}-\d{2}-\d{2}$/.test(w.iso) && /^\d{2} \d{2} '\d{2}$/.test(w.stamp), "words.when iso and stamp formats", w.iso + " / " + w.stamp);
} catch (e) { report(false, "words.when runs in Node", e.message); }

// file names, PLAN.md section 3 Step 6
try {
  const fn = LU.export.fileName;
  const ms = new Date(2026, 9, 6, 19, 42).getTime(); // local time, so the local date is 2026-10-06
  const eq = function (got, want, label) { report(got === want, label, got); };
  eq(fn({ city: "Philadelphia", when: ms }, "jpg"), "look-up-philadelphia-2026-10-06.jpg", "fileName: a city");
  eq(fn({ city: "Philadelphia", when: ms }, "mp4"), "look-up-philadelphia-2026-10-06.mp4", "fileName: a city, mp4");
  eq(fn({ city: "São Paulo", when: ms }, "jpg"), "look-up-sao-paulo-2026-10-06.jpg", "fileName: accents fold to Latin letters");
  eq(fn({ city: "", when: ms }, "jpg"), "look-up-2026-10-06.jpg", "fileName: no city");
  eq(fn({ city: "东京", when: ms }, "jpg"), "look-up-2026-10-06.jpg", "fileName: a non-Latin city gives no slug");
  eq(fn({ city: "Москва", when: ms }, "mp4"), "look-up-2026-10-06.mp4", "fileName: a Cyrillic city gives no slug");
  const today = new Date();
  const ymd = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  eq(fn({ city: "", when: 0 }, "jpg"), "look-up-" + ymd + ".jpg", "fileName: no when gives today");
  report(/^look-up-[a-z0-9-]{1,30}-2026-10-06\.jpg$/.test(fn({ city: "A Very Long City Name: With Punctuation and More Words Than Fit", when: ms }, "jpg")), "fileName: slug is a-z0-9 and hyphens, max 30");
} catch (e) { report(false, "fileName runs in Node", e.message); }

// moon phase on known dates
try {
  const nm = LU.moon.phase(Date.UTC(2026, 9, 10, 15, 50));
  report(nm.fraction < 0.03, "moon: new moon 2026-10-10 15:50 UTC has a fraction near 0", String(nm.fraction));
  const fm = LU.moon.phase(Date.UTC(2026, 9, 26, 4, 12));
  report(fm.fraction > 0.97, "moon: full moon 2026-10-26 04:12 UTC has a fraction near 1", String(fm.fraction));
  report(typeof nm.age === "number" && typeof nm.waxing === "boolean" && typeof nm.name === "string", "moon.phase returns { age, fraction, waxing, name }");
  report(LU.moon.phase(Date.UTC(2026, 9, 18)).waxing === true && LU.moon.phase(Date.UTC(2026, 9, 3)).waxing === false, "moon: waxing after new, waning after full");
} catch (e) { report(false, "moon.phase runs in Node", e.message); }

// trace.finish: closes a loop, leaves a swoosh open, turns a tap into a dot
try {
  const sky = { width: 1600, height: 1200 };
  // a loop whose ends are close (about 1.5% of the short side apart), 60 Hz
  const loop = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 * 0.985; // stops just short of a full turn
    loop.push({ x: 800 + 260 * Math.cos(a - 2) * (1 + 0.1 * Math.sin(3 * a)), y: 600 + 190 * Math.sin(a - 2), t: i * 16.7 });
  }
  const closedStroke = LU.trace.finish(sky, loop);
  report(closedStroke && closedStroke.kind === "line" && closedStroke.closed === true, "trace.finish closes a loop whose ends are close", closedStroke && (closedStroke.kind + " closed=" + closedStroke.closed));
  report(LU.trace.hasClosed([closedStroke]) === true, "trace.hasClosed is true for a closed stroke");

  const swoosh = [];
  for (let i = 0; i <= 40; i++) swoosh.push({ x: 300 + i * 25, y: 700 - Math.sin(i / 40 * Math.PI) * 160, t: i * 16.7 });
  const openStroke = LU.trace.finish(sky, swoosh);
  report(openStroke && openStroke.kind === "line" && openStroke.closed === false, "trace.finish leaves an open swoosh open", openStroke && (openStroke.kind + " closed=" + openStroke.closed));
  report(LU.trace.hasClosed([openStroke]) === false, "trace.hasClosed is false for an open stroke");

  const tap = LU.trace.finish(sky, [{ x: 500, y: 500, t: 0 }, { x: 500.5, y: 500.4, t: 40 }, { x: 500.2, y: 500.1, t: 80 }]);
  report(tap && tap.kind === "dot" && tap.points.length >= 1, "trace.finish turns a tap into a dot", tap && tap.kind);
  const one = LU.trace.finish(sky, [{ x: 20, y: 20, t: 0 }]);
  report(one && one.kind === "dot", "trace.finish never returns null (a single point)", one && one.kind);
  const none = LU.trace.finish(sky, []);
  report(none && none.kind === "dot", "trace.finish never returns null (no points)", none && none.kind);
  const shape = closedStroke;
  report(shape.points.every(function (p) { return isFinite(p.x) && isFinite(p.y) && isFinite(p.w); }) && typeof shape.length === "number" && typeof shape.seed === "number", "stroke has points {x,y,w}, length and seed");
} catch (e) { report(false, "trace.finish runs in Node", e.message); }

// errors carry { code, title, detail } (PLAN.md 7.2)
try {
  ["not-image", "heic", "unreadable", "dark", "video-unsupported", "cancelled", "export-failed"].forEach(function (code) {
    const e = LU.util.error(code);
    report(typeof e.message === "string" && typeof e.code === "string","error code " + code + " exists", e.code + " / " + e.title);
    if (code !== "cancelled") report(e.code === code && !!e.title && !!e.detail, "error " + code + " has code, title and detail");
  });
} catch (e) { report(false, "util.error runs in Node", e.message); }

// the screens only use names that exist
const used = new Set();
for (const f of ["index.html", "src/app.js"]) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const re = /\bL(?:U)?\.(decode|sky|trace|moon|words|finishes|sample|card|export|share)\.([A-Za-z_]+)/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1] + "." + m[2]);
}
used.forEach(function (p) { report(get(p) !== undefined, "screens use LU." + p + " and it exists"); });
["PENS", "FINISHES", "DEFAULTS", "END"].forEach(function (n) { report(get(n) !== undefined, "screens use LU." + n + " and it exists"); });

// platform() works without a browser
try {
  const p = LU.share.platform();
  report(["ios", "android", "desktop"].indexOf(p) >= 0, "share.platform() returns ios / android / desktop", p);
} catch (e) { report(false, "share.platform() runs in Node", e.message); }

// the fonts the engine asks for (Gochi Hand 400 and Figtree 400-700, upright only, registered by LU.finishes.loadFonts via the FontFace API)
// are real files with their licences
const engineText = ["card", "finishes"].map(function (n) { return fs.readFileSync(path.join(ROOT, "src", "engine", n + ".js"), "utf8"); }).join("\n");
report(/"Gochi Hand"/.test(engineText) && /gochi-hand-400\.woff2/.test(engineText), "the engine asks for the font family \"Gochi Hand\" (gochi-hand-400.woff2)");
report(/"Figtree"/.test(engineText) && /figtree-var\.woff2/.test(engineText), "the engine asks for the font family \"Figtree\" (figtree-var.woff2)");
report(!/italic/i.test(engineText.replace(/\/\/[^\n]*/g, "")), "the engine never asks for an italic (Figtree has none)");
report(!/Caveat|Fraun/i.test(engineText), "the engine mentions neither Caveat nor the old serif");
report(["gochi-hand-400.woff2", "figtree-var.woff2", "OFL-gochihand.txt", "OFL-figtree.txt"].every(function (f) { return fs.existsSync(path.join(ROOT, "fonts", f)); }), "fonts/ has Gochi Hand and Figtree with their OFL texts");
report(typeof LU.finishes.loadFonts === "function", "LU.finishes.loadFonts exists");

// the sample picture exists and is light
const sampleFile = path.join(ROOT, "assets", "sample-sky.jpg");
report(fs.existsSync(sampleFile) && fs.statSync(sampleFile).size <= 300 * 1024, "assets/sample-sky.jpg exists and is 300 KB or less", fs.existsSync(sampleFile) ? Math.round(fs.statSync(sampleFile).size / 1024) + " KB" : "missing");

// script order in index.html, and every file it names exists
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const order = [];
const srcs = [];
html.replace(/<script[^>]+src="([^"]+)"/g, function (_, s) { srcs.push(s); const m = /^src\/(?:engine\/)?([a-z]+)\.js$/.exec(s); if (m) order.push(m[1]); });
report(same(order, ORDER.concat(["app"])), "index.html script order matches PLAN.md 6.1", order.join(","));
const missingFiles = srcs.filter(function (s) { return !/^(https?:)?\/|^\/_vercel\//.test(s) && !fs.existsSync(path.join(ROOT, s)); });
report(missingFiles.length === 0, "every local script named in index.html exists", missingFiles.join(", "));
report(fs.existsSync(path.join(ROOT, "src", "engine", "vendor", "mp4-muxer.js")), "src/engine/vendor/mp4-muxer.js exists (loaded by export.js when a video is made)");

// every id that app.js looks up exists in index.html
const appSrc = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
const ids = new Set();
appSrc.replace(/\$\("([A-Za-z0-9_-]+)"\)/g, function (_, id) { ids.add(id); });
appSrc.replace(/WORD_FIELDS = \[(.*?)\];/s, function (_, body) { body.replace(/"(f[A-Z][A-Za-z]*)"/g, function (_2, id) { ids.add(id); }); });
const htmlIds = new Set();
html.replace(/\bid="([^"]+)"/g, function (_, id) { htmlIds.add(id); });
const missingIds = Array.from(ids).filter(function (id) { return !htmlIds.has(id); });
report(missingIds.length === 0, "every element id used by app.js exists in index.html (" + ids.size + " ids)", missingIds.join(", "));

// the support files
["vercel.json", ".gitignore", ".vercelignore", ".gitattributes"].forEach(function (f) { report(fs.existsSync(path.join(ROOT, f)), f + " exists"); });
try { JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")); report(true, "vercel.json is valid JSON"); } catch (e) { report(false, "vercel.json is valid JSON", e.message); }
const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
report(["tests/real/", "tests/out/", "shots/"].every(function (l) { return gi.split(/\r?\n/).indexOf(l) >= 0; }), ".gitignore keeps tests/real/, tests/out/ and shots/ out");

console.log(fails ? "\nSMOKE FAIL (" + fails + " failing)" : "\nSMOKE PASS");
process.exit(fails ? 1 : 0);
