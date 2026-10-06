// node tests/engine/perf.test.js : timings in Node (V8, no canvas). The phone will be a few times slower.
const path = require("path");
["util", "sky", "trace"].forEach(function (f) { require(path.join(__dirname, "../../src/engine/" + f + ".js")); });
require(path.join(__dirname, "simulate.js"));
const LU = globalThis.LU, SIM = globalThis.LUTEST.simulate;

const w = 2000, h = 1500;
const data = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4, u = x / w, v = y / h;
  const cloud = 40 * Math.sin(u * 14) * Math.sin(v * 9) + 25 * Math.sin(u * 40 + v * 11);
  data[i] = 70 + 90 * v + cloud; data[i + 1] = 130 + 70 * v + cloud; data[i + 2] = 210 + 30 * v + cloud * 0.8; data[i + 3] = 255;
}
const img = LU.util.makeImageData(w, h, data);

(async function () {
  await LU.sky.prepare(img); // warm up
  const t0 = LU.util.now();
  const runs = 3;
  for (let i = 0; i < runs; i++) await LU.sky.prepare(img);
  console.log("sky.prepare 2000x1500: " + ((LU.util.now() - t0) / runs).toFixed(0) + " ms (target under 100 ms here)");

  const sky = { width: w, height: h };
  const sim = SIM.whale({ cx: 1000, cy: 800, size: 1100 }, { seed: 7, photoWidth: w });
  const t1 = LU.util.now();
  const reps = 50;
  for (let i = 0; i < reps; i++) LU.trace.finish(sky, sim.points);
  console.log("trace.finish whale (" + sim.points.length + " points): " + ((LU.util.now() - t1) / reps).toFixed(2) + " ms (target: a few ms)");
})();
