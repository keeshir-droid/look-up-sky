// The sky: a gentle improvement, the tone, the suggested pen, the dark warning (PLAN.md 6.2).
//
//   LU.sky.prepare(imageData) -> Promise<Sky>
//     Sky = { width, height, image, tone, suggestedPen, warning, stats }
//       image        an improved canvas (in Node, where there is no canvas: an ImageData look-alike)
//       tone         "day" | "sunset" | "grey" | "dark"
//       suggestedPen a LU.PENS id ("white" | "gold" | "ink")
//       warning      null | "dark"
//       stats        { median, lo, hi, sat, warm, blue, avg: {r,g,b}, ms }  (for the test page)
//   LU.sky.analyze(imageData) -> the stats and tone alone (no pixels changed)
//
// The improvement is meant to be invisible: it should look like the same sky on a good day.
//   1. auto-levels from the 0.5% / 99.5% luminance percentiles, limited and blended 60%
//   2. clarity: (image - box blur at ~2% of the short side) added back at ~25%, weighted toward
//      mid/high brightness and softly capped so edges get no halo
//   3. sky vibrance: +12% saturation on blue/cyan hues only, protecting already-saturated colours
//   4. a touch of warmth in the highlights (+2% red, -1% blue)
// Statistics come from a subsample (well under 1200 px); the pixels are changed at full size.
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});

  const LEVELS_BLEND = 0.6;
  const LEVELS_MAX_GAIN = 1.35;
  const LEVELS_MAX_LIFT = 28;
  const CLARITY = 0.25;
  const CLARITY_CAP = 40; // luminance difference (levels) where the detail starts to be compressed
  const VIBRANCE = 0.12;

  // ---------- statistics on a subsample ----------
  function analyze(imageData) {
    const w = imageData.width, h = imageData.height, d = imageData.data;
    const step = Math.max(1, Math.ceil(Math.max(w, h) / 800));
    const hist = new Uint32Array(256);
    const satHist = new Uint32Array(101);
    let n = 0, sr = 0, sg = 0, sb = 0, warm = 0, blue = 0, lit = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        hist[(L + 0.5) | 0]++;
        n++; sr += r; sg += g; sb += b;
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const dif = mx - mn;
        const s = mx > 0 ? dif / mx : 0;
        satHist[(s * 100 + 0.5) | 0]++;
        if (L > 55 && dif > 0) { // dark silhouettes say nothing about the colour of the sky
          lit++;
          let hh;
          if (mx === r) hh = ((g - b) / dif) % 6;
          else if (mx === g) hh = (b - r) / dif + 2;
          else hh = (r - g) / dif + 4;
          hh *= 60; if (hh < 0) hh += 360;
          if (s > 0.22 && (hh < 55 || hh > 330)) warm++;
          else if (s > 0.18 && hh >= 170 && hh <= 260) blue++;
        } else if (L > 55) lit++;
      }
    }
    function pct(hh, total, p) {
      const target = p * total; let acc = 0;
      for (let i = 0; i < hh.length; i++) { acc += hh[i]; if (acc >= target) return i; }
      return hh.length - 1;
    }
    const median = pct(hist, n, 0.5) / 255;
    let brightN = 0;
    for (let i = 115; i < 256; i++) brightN += hist[i];
    const bright = brightN / n; // how much of the frame is clearly lit (a black rooftop silhouette drags the median down, not this)
    const lo = pct(hist, n, 0.005), hi = pct(hist, n, 0.995);
    const sat = pct(satHist, n, 0.5) / 100;
    const out = {
      median: median, bright: bright, lo: lo, hi: hi, sat: sat,
      warm: lit ? warm / lit : 0, blue: lit ? blue / lit : 0,
      avg: { r: sr / n, g: sg / n, b: sb / n }
    };
    out.tone = pickTone(out);
    out.suggestedPen = out.tone === "grey" ? "ink" : (out.tone === "sunset" ? "gold" : "white");
    out.warning = isDark(out) ? "dark" : null;
    return out;
  }

  // Dark = the median brightness is under about 18% AND not much of the frame is bright. (A backlit
  // sky behind black rooftops has a low median but a big bright area: that is not a dark photo.)
  function isDark(s) { return s.median < 0.18 && s.bright < 0.2; }

  function pickTone(s) {
    if (isDark(s)) return "dark";
    if (s.warm > 0.3 && s.warm > s.blue * 1.2 && s.sat > 0.32) return "sunset"; // a beige haze is warm but not a sunset
    if (s.median > 0.4 && s.sat < 0.2 && s.blue < 0.25) return "grey";
    return "day";
  }

  // ---------- the improvement ----------
  // Blurred luminance at 1/s resolution (the radius is large, so nothing is lost), read back with bilinear sampling.
  function blurredLuma(d, w, h, radius) {
    const s = Math.max(1, Math.floor(Math.max(w, h) / 600));
    const sw = Math.max(1, Math.floor(w / s)), sh = Math.max(1, Math.floor(h / s));
    const small = new Float32Array(sw * sh);
    const half = s > 1 ? s >> 1 : 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        // a block average from up to 4 samples inside the block (cheap and good enough as blur input)
        const ya = Math.min(h - 1, y * s), yb = Math.min(h - 1, y * s + half);
        const xa = Math.min(w - 1, x * s), xb = Math.min(w - 1, x * s + half);
        const i1 = (ya * w + xa) * 4, i2 = (ya * w + xb) * 4, i3 = (yb * w + xa) * 4, i4 = (yb * w + xb) * 4;
        small[y * sw + x] = 0.25 * (
          0.2126 * (d[i1] + d[i2] + d[i3] + d[i4]) +
          0.7152 * (d[i1 + 1] + d[i2 + 1] + d[i3 + 1] + d[i4 + 1]) +
          0.0722 * (d[i1 + 2] + d[i2 + 2] + d[i3 + 2] + d[i4 + 2]));
      }
    }
    const r = Math.max(1, Math.round(radius / s));
    return { data: LU.util.boxBlur(small, sw, sh, r, 2), small: small, sw: sw, sh: sh, s: s };
  }

  // Changes the pixels of `imageData` in place (call it on your own copy).
  function improvePixels(imageData, stats) {
    const w = imageData.width, h = imageData.height, d = imageData.data;
    // 1. levels: one linear map for all channels (keeps the hue), limited, and blended
    const lo = Math.min(stats.lo, LEVELS_MAX_LIFT);
    const range = Math.max(40, stats.hi - lo);
    const gain = Math.min(LEVELS_MAX_GAIN, Math.max(1, 255 / range));
    const k = 1 - LEVELS_BLEND + LEVELS_BLEND * gain;
    const off = -LEVELS_BLEND * lo * gain;

    // 2. clarity: blurred luminance, read at every pixel with bilinear sampling
    const bl = blurredLuma(d, w, h, 0.02 * Math.min(w, h));
    const bdata = bl.data, sdata = bl.small, bsw = bl.sw, bsh = bl.sh, bs = bl.s;
    const x0s = new Int32Array(w), x1s = new Int32Array(w), txs = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let fx = (x + 0.5) / bs - 0.5;
      if (fx < 0) fx = 0; else if (fx > bsw - 1) fx = bsw - 1;
      const x0 = fx | 0;
      x0s[x] = x0; x1s[x] = Math.min(bsw - 1, x0 + 1); txs[x] = fx - x0;
    }
    const invCap = 1 / CLARITY_CAP;

    for (let y = 0; y < h; y++) {
      let fy = (y + 0.5) / bs - 0.5;
      if (fy < 0) fy = 0; else if (fy > bsh - 1) fy = bsh - 1;
      const y0 = fy | 0, y1 = Math.min(bsh - 1, y0 + 1), ty = fy - y0;
      const ra = y0 * bsw, rb = y1 * bsw;
      let i = y * w * 4;
      for (let x = 0; x < w; x++, i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        r = r * k + off; g = g * k + off; b = b * k + off;

        const tx = txs[x], xa = x0s[x], xb = x1s[x];
        const blur = (bdata[ra + xa] * (1 - tx) + bdata[ra + xb] * tx) * (1 - ty) + (bdata[rb + xa] * (1 - tx) + bdata[rb + xb] * tx) * ty;
        // the detail comes from the lightly smoothed (reduced-size) picture, not the full-size pixel, so film grain and
        // sensor noise are not boosted along with the cloud texture
        const soft = (sdata[ra + xa] * (1 - tx) + sdata[ra + xb] * tx) * (1 - ty) + (sdata[rb + xa] * (1 - tx) + sdata[rb + xb] * tx) * ty;
        const dd = soft - blur;
        let t = (L0 * (1 / 255) - 0.2) * (1 / 0.35);  // weight: none in the dark, full from mid-bright up
        t = t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t));
        const add = CLARITY * t * k * dd / (1 + (dd < 0 ? -dd : dd) * invCap); // soft cap: no halos at hard edges
        r += add; g += add; b += add;

        // 3. sky vibrance: blue/cyan hues only (red is the weakest channel), not already-saturated colours
        if (r <= g && r <= b) {
          const mx = g > b ? g : b, dif = mx - r;
          if (dif > 6 && mx > 30) {
            const hh = mx === b ? 60 * ((r - g) / dif + 4) : 60 * ((b - r) / dif + 2); // 120..240
            let hm = (hh - 165) * (1 / 25);
            hm = hm <= 0 ? 0 : (hm >= 1 ? 1 : hm * hm * (3 - 2 * hm));
            if (hm > 0) {
              let p = (dif / mx - 0.55) * (1 / 0.35);
              p = p <= 0 ? 0 : (p >= 1 ? 1 : p * p * (3 - 2 * p));
              const f = 1 + VIBRANCE * hm * (1 - p);
              const Lc = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              r = Lc + (r - Lc) * f; g = Lc + (g - Lc) * f; b = Lc + (b - Lc) * f;
            }
          }
        }

        // 4. warmth in the highlights
        let hl = (0.2126 * r + 0.7152 * g + 0.0722 * b - 120) * (1 / 115);
        hl = hl <= 0 ? 0 : (hl >= 1 ? 1 : hl * hl * (3 - 2 * hl));
        r *= 1 + 0.02 * hl; b *= 1 - 0.01 * hl;

        d[i] = r < 0 ? 0 : (r > 255 ? 255 : r);
        d[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        d[i + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
      }
    }
  }

  async function prepare(imageData) {
    const t0 = LU.util.now();
    const w = imageData.width, h = imageData.height;
    const stats = analyze(imageData);
    const copy = LU.util.makeImageData(w, h, new Uint8ClampedArray(imageData.data));
    improvePixels(copy, stats);
    let image = copy;
    try {
      const c = LU.util.createCanvas(w, h);
      c.getContext("2d").putImageData(copy, 0, 0);
      image = c;
    } catch (e) { /* no canvas here (Node): keep the pixels */ }
    stats.ms = LU.util.now() - t0;
    return {
      width: w, height: h, image: image,
      tone: stats.tone, suggestedPen: stats.suggestedPen, warning: stats.warning,
      stats: stats
    };
  }

  LU.sky = { prepare: prepare, analyze: analyze, improvePixels: improvePixels };
})();
