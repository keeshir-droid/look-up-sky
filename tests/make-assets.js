// Makes assets/og.jpg (1200x630) and docs/preview-postcard.png (580x580) from tests/og.html with the real engine.
//   node tests/make-assets.js [baseUrl]      (a local server must be running; this never starts one)
const fs = require("fs");
const path = require("path");
const { launch, sleep } = require("./cdp");
const BASE = (process.argv[2] || "http://127.0.0.1:8123").replace(/\/+$/, "");
const ROOT = path.join(__dirname, "..");

async function grab(b, mode, w, h, params, file) {
  const size = mode === "og" ? "" : "&size=" + w;
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await b.open(BASE + "/tests/og.html?mode=" + mode + size);
  const ok = await b.waitFor("window.__ready === true || !!window.__error", 30);
  const err = await b.eval("window.__error || ''");
  if (!ok || err) throw new Error("og.html (" + mode + ") did not finish: " + err);
  await sleep(500);
  const r = await b.send("Page.captureScreenshot", Object.assign({ clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }, params));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
  console.log("wrote " + path.relative(ROOT, file) + "  " + Math.round(fs.statSync(file).size / 1024) + " KB");
}

(async function () {
  let b = null;
  try {
    b = await launch({ width: 1200, height: 630, dpr: 1, mobile: false });
    await grab(b, "og", 1200, 630, { format: "jpeg", quality: 85 }, path.join(ROOT, "assets", "og.jpg"));
    await grab(b, "postcard", 580, 580, { format: "png" }, path.join(ROOT, "docs", "preview-postcard.png"));
    await grab(b, "film", 900, 900, { format: "png" }, path.join(ROOT, "tests", "out", "film-square.png"));
  } finally {
    if (b) await b.close();
  }
})().catch(function (e) { console.log("FAIL " + (e && e.stack || e)); process.exit(1); });
