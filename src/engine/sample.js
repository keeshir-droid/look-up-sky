// The sample sky: a free-licensed photo of a dolphin-shaped cloud (Legnaro, Italy), prepared like any photo, with a
// preset trace made of a few hand-placed points that run through LU.trace.finish exactly like finger strokes.
//
//   LU.sample.load() -> Promise<{ sky, strokes, settings }>
//     settings = { said: "I saw a dolphin.", city: "Legnaro", to: "" }
//     Rejects with a friendly Error ({code, title, detail}) when the picture can't be loaded. Never throws synchronously.
//   LU.sample.url   the picture's address (worked out from where this script was loaded; can be changed before load())
//
// The photo's credit: "Dolphin Cloud (137567114).jpg" by Domenico Salvagnin, CC BY 2.0.
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});

  let URL_ = "assets/sample-sky.jpg";
  try {
    if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
      URL_ = document.currentScript.src.replace(/src\/engine\/[^\/]*$/, "") + "assets/sample-sky.jpg";
    }
  } catch (e) { /* keep the default */ }

  // hand-placed points, in photo pixels of the 1280 x 960 picture (head to the left, the cloud's body centre-right)
  const OUTLINE = [ // from the snout, over the forehead and the back, round the tail, back along the belly, past the start
    [284, 322], [312, 294], [370, 262], [440, 240], [520, 236], [596, 246], [650, 238], [712, 218], [800, 205], [900, 202], [1000, 206],
    [1062, 228], [1100, 268], [1086, 330], [1040, 386], [960, 428], [830, 456], [720, 456], [610, 444],
    [510, 424], [430, 398], [366, 372], [318, 354], [288, 338], [278, 316], [290, 296], [318, 288]
  ];
  const FLIPPER = [[556, 432], [590, 486], [640, 536], [706, 576], [772, 596]];
  const EYE = [[402, 302]];

  // dense, uneven-speed "finger" samples through control points: 60 Hz, speed varies, a little jitter
  function fingerPoints(ctrl, seed, pxPerMs) {
    const rnd = LU.util.mulberry32(seed);
    const dense = [];
    const n = ctrl.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
      const seg = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        dense.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    dense.push(ctrl[n - 1].slice());
    const out = [];
    let t = 0, acc = 0, next = 0;
    for (let i = 0; i < dense.length; i++) {
      if (i > 0) {
        const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
        const speed = pxPerMs * (0.75 + 0.5 * (0.5 + 0.5 * Math.sin(i * 0.013 + seed)));
        t += d / speed; acc += d;
      }
      if (t >= next || i === dense.length - 1) {
        out.push({ x: dense[i][0] + (rnd() - 0.5) * 2, y: dense[i][1] + (rnd() - 0.5) * 2, t: Math.round(t * 10) / 10 });
        next = t + 16.7;
      }
    }
    return out;
  }

  function presetTraces() {
    return [
      fingerPoints(OUTLINE, 11, 0.95),
      fingerPoints(FLIPPER, 23, 0.7),
      [{ x: EYE[0][0], y: EYE[0][1], t: 0 }, { x: EYE[0][0] + 0.6, y: EYE[0][1] - 0.4, t: 30 }, { x: EYE[0][0] + 0.2, y: EYE[0][1] + 0.3, t: 70 }]
    ];
  }

  function friendly() {
    return LU.util.error("unreadable", { title: "The sample sky didn’t load.", detail: "Check your connection, or choose a photo of your own." });
  }

  let cached = null;
  async function build() {
    let imageData;
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise(function (ok, bad) {
        const timer = setTimeout(function () { bad(new Error("timeout")); }, 25000);
        img.onload = function () { clearTimeout(timer); ok(); };
        img.onerror = function () { clearTimeout(timer); bad(new Error("could not load " + LU.sample.url)); };
        img.src = LU.sample.url;
      });
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = LU.util.createCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, w, h);
      imageData = g.getImageData(0, 0, w, h);
    } catch (e) {
      throw friendly();
    }
    let sky;
    try { sky = await LU.sky.prepare(imageData); } catch (e) { throw friendly(); }
    // the points are in the 1280 x 960 picture; scale them if the photo was cut down
    const s = sky.width / 1280;
    const strokes = presetTraces().map(function (pts) {
      return LU.trace.finish(sky, pts.map(function (p) { return { x: p.x * s, y: p.y * s, t: p.t }; }));
    });
    return { sky: sky, strokes: strokes };
  }

  function load() {
    if (!cached) {
      cached = build().catch(function (e) { cached = null; throw (e && e.code ? e : friendly()); });
    }
    return cached.then(function (r) {
      return { sky: r.sky, strokes: r.strokes.slice(), settings: { said: "I saw a dolphin.", city: "Legnaro", to: "" } };
    });
  }

  LU.sample = { load: load, url: URL_, _outline: OUTLINE, _flipper: FLIPPER, _eye: EYE };
})();
