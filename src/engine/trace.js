// Tracing: turning a finger trace into a clean white-pen stroke, and drawing it (PLAN.md 5.4, 6.3).
// Everything here is plain functions; nothing touches document/window at load time (loads in Node).
//
// =====================================================================================
// THE API (card.js and the site use these)
//
//   LU.trace.finish(sky, points) -> Stroke                       (never null)
//       points: [{x, y, t}] in sky pixels, t in ms. sky: anything with .width and .height.
//       Stroke: { kind: "line"|"dot", points: [{x, y, w}], closed, length, seed }
//         w = relative width (about 1; 0.8 fast .. 1.2 slow), length in sky px, closed lines have
//         no repeated first point (the last point joins back to the first).
//   LU.trace.hasClosed(strokes) -> boolean
//
//   LU.trace.lineWidth(shortSideOut) -> core line width in output px (0.55% of the short side)
//   LU.trace.boundsOf(strokes) -> {x0,y0,x1,y1} in sky px (dots padded a little) or null
//
//   LU.trace.strokeProgress(strokes, progress) -> number[]
//       progress 0..1 over all strokes, sequential, proportional to length. Returns each
//       stroke's LINEAR local progress (0..1). Dots count as a short stroke.
//   LU.trace.ease(p)  ease-in-out for p in 0..1       LU.trace.pop(p)  0 -> 1.15 -> 1 for dots
//
//   LU.trace.drawStrokes(ctx, strokes, opts)
//       Draws the pen: faint shadow + soft glow + core line, tapered ends, speed-based width.
//       opts = {
//         pen:      "white" | "gold" | "ink" | "#rrggbb"   (default "white")
//         scale:    ctx px per sky px      (default 1)
//         x, y:     ctx position of sky (0,0)   (default 0, 0)   i.e. X = x + scale * px
//         width:    core width in ctx px   (default lineWidth(opts.short || 1080))
//         short:    short side of the photo as shown, in ctx px (only used for the default width)
//         progress: 0..1 overall draw-on (default 1); each stroke eases in and out in its turn
//         local:    optional array of linear per-stroke progress (overrides progress)
//         glow:     soft glow under the line (default true)    shadow: faint dark shadow (default true)
//         core:     false = draw the glow only, not the line (the card caches the glow as a picture; default true)
//         alpha:    overall opacity (default 1)
//       }
//       Fine to call every frame. The ctx may carry a transform (e.g. devicePixelRatio).
//
//   LU.trace.drawLive(ctx, points, pen, scale, opts?)
//       The simple live line while the finger is down: round caps, constant width, pen colour.
//       points in sky px; opts = {x, y, width, short} as above.
//
//   Glow ("Make it glow", closed shapes only):
//   LU.trace.glowMask(strokes, w, h, opts?) -> { canvas, w, h } | null
//       Feathered alpha mask (canvas, size w*h or half that on big sizes) of the closed shapes.
//       opts = { scale, x, y, feather }  feather in px of the w*h space (default 30 * min(w,h)/1080).
//       Cached per stroke set and size. null when nothing is closed.
//   LU.trace.makeGlow(image, strokes, opts?) -> Glow | null
//       image: a canvas/image already drawn at w*h (the sky as it will show, same crop). opts as above
//       plus {w, h} (default image size). Builds the layers once; keep it in the card's static cache.
//   LU.trace.applyGlow(ctx, glow, amount, x?, y?)
//       amount 0..1 (the glow coming in). Draw it right after the sky, under the pen, with the same
//       transform the sky was drawn with. Inside: ~12% brighter (screen) and a little more contrast
//       (overlay). Outside: 15% toward the sky's average colour.
//
//   LU.trace.CONFIG  the numbers (fractions of the short side) for tuning.
// =====================================================================================
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});
  const TAU = Math.PI * 2;

  const CONFIG = {
    drop: 0.003,        // drop points closer than this
    rdp: 0.0025,        // simplify tolerance
    sample: 0.004,      // final spacing of the curve
    prespace: 0.005,    // spacing of the working polyline
    sigma: 0.008,       // low-pass smoothing of the working polyline, on top of the time low-pass
    sigmaNoTime: 0.016, // ... when there are no usable timestamps
    tremorMs: 40,       // time low-pass (Gaussian sigma, ms) that removes 8-15 Hz finger tremor
    maxStrideCap: 0.02, // ... but never smooth by more than this much of the short side in space
    closeDist: 0.04,    // ends this close (or crossing) + long enough => closed
    closeMinLen: 0.15,
    overshoot: 0.12,    // how far past the start we look for the end crossing it (of short side)
    dot: 0.01,          // a stroke whose extent is below this is a dot
    dotQuick: 0.025,    // ... or below this, if it was a very quick touch
    dotQuickMs: 260,
    lineW: 0.0055,      // core line width, of the short side at output size
    taper: 0.06,        // fraction of the length for each tapered end
    speedSwing: 0.2,    // width varies +-20% with speed
    glowLayers: [3.4, 2.9, 2.45, 2.0, 1.6, 1.3], // widths of the nested glow layers (x core width)
    glowLayerAlpha: 0.065,                         // 6 layers stack to about 33% next to the line
    shadowRGBA: "rgba(20,30,50,0.15)",
    dotShadowRGBA: "rgba(14,22,40,0.62)", // the shadow ring around a tapped dot
    dotDiameter: 2.2,
    featherPx: 30,
    brighten: 0.32,     // alpha of the screen-blended copy (about +8% at mid-tones; 0.5 blew out bright cloud)
    contrast: 0.2,      // alpha of the overlay-blended copy
    darkPenGlow: 0.5,   // dark pens (ink) get a weaker glow so it doesn't smudge
    dim: 0.15
  };

  // ---------- small helpers ----------
  function hypot(a, b) { return Math.sqrt(a * a + b * b); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sm(t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
  function ease(p) { p = clamp(p, 0, 1); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function pop(p) { // 0 -> 1.15 -> 1
    p = clamp(p, 0, 1);
    if (p <= 0) return 0;
    if (p < 0.6) { const q = p / 0.6; return 1.15 * (1 - Math.pow(1 - q, 3)); }
    const q = (p - 0.6) / 0.4;
    return 1.15 - 0.15 * sm(q);
  }
  function shortOf(sky) {
    const w = sky && +sky.width, h = sky && +sky.height;
    return Math.max(8, Math.min(w > 0 ? w : 1000, h > 0 ? h : 1000));
  }
  function penHex(pen) {
    if (typeof pen === "string" && pen.charAt(0) === "#") return pen;
    const list = (LU.PENS || []);
    for (let i = 0; i < list.length; i++) if (list[i].id === pen) return list[i].hex;
    return "#ffffff";
  }
  function rgbOf(hex) {
    const h = String(hex).replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function hashSeed(a, b, c, d) {
    let h = 2166136261 >>> 0;
    const vals = [a, b, c, d];
    for (let i = 0; i < vals.length; i++) {
      h = Math.imul(h ^ (Math.floor(vals[i]) | 0), 16777619) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
    }
    return (h % 2147483646) + 1;
  }

  // ---------- geometry for finish() ----------
  function cleanPoints(points) {
    const out = [];
    if (!points || !points.length) return out;
    let lastT = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) continue;
      const x = +p.x, y = +p.y;
      if (!isFinite(x) || !isFinite(y)) continue;
      let t = +p.t;
      if (!isFinite(t)) t = i === 0 ? 0 : lastT + 16;
      lastT = t;
      out.push({ x: x, y: y, t: t });
    }
    return out;
  }

  // Resamples the trace on a uniform time grid and low-passes it in time. Returns `raw` itself when the
  // timestamps can't be used (so the caller knows).
  function temporalSmooth(raw, short) {
    const n = raw.length;
    if (n < 4) return raw;
    const t0 = raw[0].t, dur = raw[n - 1].t - t0;
    if (!(dur >= 80)) return raw;
    for (let i = 1; i < n; i++) if (raw[i].t < raw[i - 1].t) return raw; // out of order: don't trust
    let pathLen = 0;
    for (let i = 1; i < n; i++) pathLen += hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    const vMed = pathLen / dur; // px per ms, on average
    let dt = 8;
    if (dur / dt > 2500) dt = dur / 2500;
    const m = Math.floor(dur / dt) + 1;
    const xs = new Array(m), ys = new Array(m);
    let j = 0;
    for (let k = 0; k < m; k++) {
      const t = t0 + k * dt;
      while (j < n - 2 && raw[j + 1].t < t) j++;
      const a = raw[j], b = raw[j + 1], span = b.t - a.t;
      const f = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 0;
      xs[k] = a.x + (b.x - a.x) * f; ys[k] = a.y + (b.y - a.y) * f;
    }
    let sigmaMs = CONFIG.tremorMs;
    if (vMed > 1e-6) sigmaMs = Math.min(sigmaMs, CONFIG.maxStrideCap * short / vMed);
    const sig = sigmaMs / dt;
    if (sig < 0.5) return raw;
    const sx = gaussSmooth(xs, sig, false, true), sy = gaussSmooth(ys, sig, false, true);
    const out = new Array(m);
    for (let k = 0; k < m; k++) out[k] = { x: sx[k], y: sy[k], t: t0 + k * dt };
    // the very first and last points stay where the finger really started and stopped
    out[0].x = raw[0].x; out[0].y = raw[0].y;
    out[m - 1].x = raw[n - 1].x; out[m - 1].y = raw[n - 1].y;
    return out;
  }

  // Arc-length resample of a polyline to uniform spacing. Carries a per-vertex value v along.
  // closed: treat as a polygon (the closing chord is included), no repeated last point returned.
  function resampleUniform(xs, ys, vs, spacing, closed) {
    const n = xs.length;
    const px = xs.slice(), py = ys.slice(), pv = vs.slice();
    if (closed) { px.push(xs[0]); py.push(ys[0]); pv.push(vs[0]); }
    const m = px.length;
    const cum = new Float64Array(m);
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    const total = cum[m - 1];
    if (total < 1e-9) return { xs: [xs[0]], ys: [ys[0]], vs: [vs[0]], total: 0 };
    let count = Math.min(4000, Math.max(closed ? 3 : 2, Math.round(total / spacing) + (closed ? 0 : 1)));
    const denom = closed ? count : count - 1;
    const ox = [], oy = [], ov = [];
    let seg = 1;
    for (let k = 0; k < count; k++) {
      const s = total * k / denom;
      while (seg < m - 1 && cum[seg] < s) seg++;
      const segLen = cum[seg] - cum[seg - 1];
      const f = segLen > 1e-12 ? (s - cum[seg - 1]) / segLen : 0;
      ox.push(px[seg - 1] + (px[seg] - px[seg - 1]) * f);
      oy.push(py[seg - 1] + (py[seg] - py[seg - 1]) * f);
      ov.push(pv[seg - 1] + (pv[seg] - pv[seg - 1]) * f);
    }
    return { xs: ox, ys: oy, vs: ov, total: total };
  }

  function gaussSmooth(arr, sigma, closed, reflectPoint) {
    const n = arr.length;
    if (n < 3 || sigma < 0.3) return arr.slice();
    const half = Math.max(1, Math.ceil(sigma * 3));
    const wts = new Float64Array(half + 1);
    let norm = 0;
    for (let i = 0; i <= half; i++) { wts[i] = Math.exp(-(i * i) / (2 * sigma * sigma)); norm += i === 0 ? wts[i] : 2 * wts[i]; }
    function at(i) {
      if (closed) { i %= n; if (i < 0) i += n; return arr[i]; }
      if (i < 0) { const j = Math.min(n - 1, -i); return reflectPoint ? 2 * arr[0] - arr[j] : arr[Math.min(n - 1, j)]; }
      if (i > n - 1) { const j = Math.max(0, 2 * (n - 1) - i); return reflectPoint ? 2 * arr[n - 1] - arr[j] : arr[Math.max(0, j)]; }
      return arr[i];
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = arr[i] * wts[0];
      for (let k = 1; k <= half; k++) s += wts[k] * (at(i - k) + at(i + k));
      out[i] = s / norm;
    }
    return out;
  }

  // Ramer-Douglas-Peucker on indices lo..hi of (xs, ys). Returns sorted kept indices (lo and hi included).
  function rdpIndices(xs, ys, lo, hi, tol) {
    const keep = new Uint8Array(xs.length);
    keep[lo] = 1; keep[hi] = 1;
    const stack = [[lo, hi]];
    while (stack.length) {
      const seg = stack.pop();
      const a = seg[0], b = seg[1];
      if (b <= a + 1) continue;
      const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b];
      const dx = bx - ax, dy = by - ay, len = hypot(dx, dy);
      let best = -1, bestD = tol;
      for (let i = a + 1; i < b; i++) {
        let d;
        if (len < 1e-9) d = hypot(xs[i] - ax, ys[i] - ay);
        else d = Math.abs((xs[i] - ax) * dy - (ys[i] - ay) * dx) / len;
        if (d > bestD) { bestD = d; best = i; }
      }
      if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    const out = [];
    for (let i = lo; i <= hi; i++) if (keep[i]) out.push(i);
    return out;
  }

  // Centripetal Catmull-Rom (Barry-Goldman). Appends n points of the segment p1 -> p2 (p2 excluded).
  function crSegment(p0, p1, p2, p3, n, outX, outY) {
    const EPS = 1e-4;
    const t0 = 0;
    const t1 = t0 + Math.sqrt(hypot(p1.x - p0.x, p1.y - p0.y) + EPS);
    const t2 = t1 + Math.sqrt(hypot(p2.x - p1.x, p2.y - p1.y) + EPS);
    const t3 = t2 + Math.sqrt(hypot(p3.x - p2.x, p3.y - p2.y) + EPS);
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * k / n;
      const f = function (a, b, ta, tb, key) { return a[key] * (tb - t) / (tb - ta) + b[key] * (t - ta) / (tb - ta); };
      const A1 = { x: f(p0, p1, t0, t1, "x"), y: f(p0, p1, t0, t1, "y") };
      const A2 = { x: f(p1, p2, t1, t2, "x"), y: f(p1, p2, t1, t2, "y") };
      const A3 = { x: f(p2, p3, t2, t3, "x"), y: f(p2, p3, t2, t3, "y") };
      const B1 = { x: f(A1, A2, t0, t2, "x"), y: f(A1, A2, t0, t2, "y") };
      const B2 = { x: f(A2, A3, t1, t3, "x"), y: f(A2, A3, t1, t3, "y") };
      outX.push(f(B1, B2, t1, t2, "x")); outY.push(f(B1, B2, t1, t2, "y"));
    }
  }

  function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy;
    const den = r1x * r2y - r1y * r2x;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den;
    const u = ((cx - ax) * r1y - (cy - ay) * r1x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t: t, u: u, x: ax + r1x * t, y: ay + r1y * t };
  }

  // Decides whether the working polyline R (uniform spacing) closes into a shape. Returns null, or
  // {a, b, X} : keep vertices a..b (inclusive); X is an intersection point to replace the ends with, if any.
  function findClosure(R, d0, short) {
    const m = R.xs.length;
    const total = R.total;
    if (m < 8 || total < CONFIG.closeMinLen * short) return null;
    const winLen = Math.min(CONFIG.overshoot * short, 0.2 * total);
    const wl = Math.max(2, Math.floor(winLen / d0));
    const xs = R.xs, ys = R.ys;
    let best = null, bestScore = Infinity;
    // crossings: a late segment crossing an early one
    for (let a = 0; a < wl && a < m - 1; a++) {
      for (let b = m - 2; b >= m - 1 - wl && b > a + 2; b--) {
        const hit = segIntersect(xs[a], ys[a], xs[a + 1], ys[a + 1], xs[b], ys[b], xs[b + 1], ys[b + 1]);
        if (!hit) continue;
        const trimmed = (a + hit.t + (m - 1 - b) - hit.u) * d0;
        const score = 0.15 * trimmed;
        if (score < bestScore) { bestScore = score; best = { a: a + 1, b: b, X: { x: hit.x, y: hit.y } }; }
      }
    }
    // near misses: the ends (or just behind them) come close without crossing
    for (let a = 0; a <= wl; a++) {
      for (let b = m - 1; b >= m - 1 - wl && b > a + 4; b--) {
        const dist = hypot(xs[a] - xs[b], ys[a] - ys[b]);
        if (dist > CONFIG.closeDist * short) continue;
        const score = dist + 0.15 * (a + (m - 1 - b)) * d0;
        if (score < bestScore) { bestScore = score; best = { a: a, b: b, X: null }; }
      }
    }
    if (!best) return null;
    // the loop that remains must be long enough
    if ((best.b - best.a) * d0 < CONFIG.closeMinLen * short) return null;
    return best;
  }

  // ---------- finish ----------
  function dotStroke(x, y, seed) {
    return { kind: "dot", points: [{ x: round2(x), y: round2(y), w: 1 }], closed: false, length: 0, seed: seed };
  }

  function finish(sky, points) {
    const W = sky && +sky.width > 0 ? +sky.width : 1000, H = sky && +sky.height > 0 ? +sky.height : 1000;
    const short = Math.max(8, Math.min(W, H));
    const raw = cleanPoints(points);
    if (!raw.length) return dotStroke(W / 2, H / 2, 1);
    for (let i = 0; i < raw.length; i++) { // a stray far-away point must not blow up the sampling
      raw[i].x = clamp(raw[i].x, -short, W + short);
      raw[i].y = clamp(raw[i].y, -short, H + short);
    }

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      cx += p.x; cy += p.y;
    }
    cx /= raw.length; cy /= raw.length;
    const seed = hashSeed(raw[0].x, raw[0].y, raw[raw.length - 1].x * 7 + raw.length, raw[raw.length - 1].y * 13);
    const extent = hypot(x1 - x0, y1 - y0);
    const dur = raw[raw.length - 1].t - raw[0].t;
    if (extent < CONFIG.dot * short || (extent < CONFIG.dotQuick * short && dur < CONFIG.dotQuickMs)) {
      return dotStroke(cx, cy, seed);
    }

    // 0. finger tremor lives at 8-15 Hz, the shape at a few Hz: low-pass in TIME first (needs timestamps)
    const timed = temporalSmooth(raw, short);

    // 1. drop points closer than 0.3% of the short side (keep the true last point)
    const dmin = CONFIG.drop * short;
    const kept = [timed[0]];
    for (let i = 1; i < timed.length; i++) {
      const p = timed[i], q = kept[kept.length - 1];
      if (hypot(p.x - q.x, p.y - q.y) >= dmin) kept.push(p);
      else if (i === timed.length - 1) { kept[kept.length - 1] = p; }
    }
    const hasTime = timed !== raw;
    if (kept.length < 2) return dotStroke(cx, cy, seed);

    // speed along the stroke (px per ms), then in log space
    const kx = [], ky = [], kv = [];
    let lastV = 0;
    for (let i = 0; i < kept.length; i++) {
      kx.push(kept[i].x); ky.push(kept[i].y);
      if (i > 0) {
        const dt = Math.max(1, kept[i].t - kept[i - 1].t);
        lastV = hypot(kept[i].x - kept[i - 1].x, kept[i].y - kept[i - 1].y) / dt;
      }
      kv.push(lastV);
    }
    kv[0] = kv.length > 1 ? kv[1] : 0;
    const medV = LU.util.median(kv) || 0;
    const lv = kv.map(function (v) { return medV > 1e-9 ? Math.log(Math.max(v, medV * 0.05) / medV) : 0; });

    // working polyline, uniform spacing
    const d0 = CONFIG.prespace * short;
    let R = resampleUniform(kx, ky, lv, d0, false);
    if (R.xs.length < 2) return dotStroke(cx, cy, seed);

    // 4. closing
    let closed = false;
    const clo = findClosure(R, d0, short);
    if (clo) {
      let cxs = R.xs.slice(clo.a, clo.b + 1), cys = R.ys.slice(clo.a, clo.b + 1), cvs = R.vs.slice(clo.a, clo.b + 1);
      if (clo.X) { // overshoot: the end crossed the start. Both ends become the crossing point.
        cxs.unshift(clo.X.x); cys.unshift(clo.X.y); cvs.unshift(cvs[0]);
        // the last vertex then runs into X through the closing chord
      }
      const C = resampleUniform(cxs, cys, cvs, d0, true);
      if (C.xs.length >= 4) { R = C; closed = true; }
    }

    // low-pass the working polyline (periodic for closed shapes)
    const sigmaPx = Math.min((hasTime ? CONFIG.sigma : CONFIG.sigmaNoTime) * short, 0.04 * R.total);
    const sigma = sigmaPx / (R.total / (closed ? R.xs.length : R.xs.length - 1));
    const sx = gaussSmooth(R.xs, sigma, closed, true);
    const sy = gaussSmooth(R.ys, sigma, closed, true);
    const sv = gaussSmooth(R.vs, Math.max(1, 0.03 * R.xs.length), closed, false);
    const n = sx.length;

    // 2. simplify
    const tol = CONFIG.rdp * short;
    let idx;
    if (closed) {
      let far = 1, fd = -1;
      for (let i = 1; i < n; i++) { const d = hypot(sx[i] - sx[0], sy[i] - sy[0]); if (d > fd) { fd = d; far = i; } }
      const ex = sx.concat([sx[0]]), ey = sy.concat([sy[0]]);
      const a = rdpIndices(ex, ey, 0, far, tol), b = rdpIndices(ex, ey, far, n, tol);
      idx = a.concat(b.slice(1, b.length - 1)); // drop the duplicate far and the wrap index n
      if (idx.length < 4) { idx = []; for (let i = 0; i < n; i += 3) idx.push(i); }
    } else {
      idx = rdpIndices(sx, sy, 0, n - 1, tol);
    }
    const V = idx.map(function (i) { return { x: sx[i], y: sy[i] }; });

    // 3. rebuild as a smooth curve, sampled every 0.4% of the short side
    const step = CONFIG.sample * short;
    const ox = [], oy = [];
    const nv = V.length;
    if (closed) {
      for (let i = 0; i < nv; i++) {
        const p0 = V[(i - 1 + nv) % nv], p1 = V[i], p2 = V[(i + 1) % nv], p3 = V[(i + 2) % nv];
        crSegment(p0, p1, p2, p3, Math.max(1, Math.ceil(hypot(p2.x - p1.x, p2.y - p1.y) / step)), ox, oy);
      }
    } else if (nv === 2) {
      const len = hypot(V[1].x - V[0].x, V[1].y - V[0].y), cnt = Math.max(2, Math.ceil(len / step));
      for (let k = 0; k <= cnt; k++) { ox.push(V[0].x + (V[1].x - V[0].x) * k / cnt); oy.push(V[0].y + (V[1].y - V[0].y) * k / cnt); }
    } else {
      for (let i = 0; i < nv - 1; i++) {
        const p0 = i > 0 ? V[i - 1] : { x: 2 * V[0].x - V[1].x, y: 2 * V[0].y - V[1].y };
        const p3 = i + 2 < nv ? V[i + 2] : { x: 2 * V[nv - 1].x - V[nv - 2].x, y: 2 * V[nv - 1].y - V[nv - 2].y };
        crSegment(p0, V[i], V[i + 1], p3, Math.max(1, Math.ceil(hypot(V[i + 1].x - V[i].x, V[i + 1].y - V[i].y) / step)), ox, oy);
      }
      ox.push(V[nv - 1].x); oy.push(V[nv - 1].y);
    }

    // a light relaxation takes out the last tiny kinks (ends stay put)
    for (let pass = 0; pass < 2; pass++) {
      const m = ox.length, nx = ox.slice(), ny = oy.slice();
      for (let i = 0; i < m; i++) {
        if (!closed && (i === 0 || i === m - 1)) continue;
        const a = (i - 1 + m) % m, b = (i + 1) % m;
        nx[i] = 0.25 * ox[a] + 0.5 * ox[i] + 0.25 * ox[b];
        ny[i] = 0.25 * oy[a] + 0.5 * oy[i] + 0.25 * oy[b];
      }
      for (let i = 0; i < m; i++) { ox[i] = nx[i]; oy[i] = ny[i]; }
    }

    // arc length and the width from speed
    const m = ox.length;
    const cum = new Float64Array(m + (closed ? 1 : 0));
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + hypot(ox[i] - ox[i - 1], oy[i] - oy[i - 1]);
    if (closed) cum[m] = cum[m - 1] + hypot(ox[0] - ox[m - 1], oy[0] - oy[m - 1]);
    const length = closed ? cum[m] : cum[m - 1];
    const wv = new Array(m);
    for (let i = 0; i < m; i++) {
      const u = length > 0 ? cum[i] / length : 0;
      const pos = closed ? u * sv.length : u * (sv.length - 1);
      let i0 = Math.floor(pos), f = pos - i0;
      let i1 = i0 + 1;
      if (closed) { i0 %= sv.length; i1 %= sv.length; } else { i0 = Math.min(i0, sv.length - 1); i1 = Math.min(i1, sv.length - 1); }
      const lg = sv[i0] * (1 - f) + sv[i1] * f;          // ln(speed / median)
      const q = clamp(lg / Math.LN2, -1, 1);             // -1 slow .. +1 fast (2x either way)
      wv[i] = 1 - CONFIG.speedSwing * q;                 // slower is thicker
    }
    const ws = gaussSmooth(wv, 2, closed, false);
    const outPts = new Array(m);
    for (let i = 0; i < m; i++) outPts[i] = { x: round2(ox[i]), y: round2(oy[i]), w: round2(ws[i]) };
    return { kind: "line", points: outPts, closed: closed, length: round2(length), seed: seed };
  }

  function hasClosed(strokes) {
    if (!strokes || !strokes.length) return false;
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (s && s.kind === "line" && s.closed && s.points && s.points.length >= 3) return true;
    }
    return false;
  }

  function boundsOf(strokes) {
    if (!strokes || !strokes.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (!s || !s.points) continue;
      for (let k = 0; k < s.points.length; k++) {
        const p = s.points[k];
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
    }
    if (!isFinite(x0)) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // ---------- draw-on ----------
  function strokeWeight(s, dotWeight) { return s.kind === "dot" ? dotWeight : Math.max(1, s.length || 1); }

  function strokeProgress(strokes, progress) {
    const n = strokes ? strokes.length : 0;
    const out = new Array(n);
    if (!n) return out;
    if (!isFinite(progress)) progress = 1;
    let sumLines = 0;
    for (let i = 0; i < n; i++) if (strokes[i].kind !== "dot") sumLines += strokes[i].length || 0;
    const dotWeight = Math.max(40, 0.05 * sumLines);
    let total = 0;
    for (let i = 0; i < n; i++) total += strokeWeight(strokes[i], dotWeight);
    const pos = clamp(progress, 0, 1) * total;
    let start = 0;
    for (let i = 0; i < n; i++) {
      const wgt = strokeWeight(strokes[i], dotWeight);
      out[i] = clamp((pos - start) / wgt, 0, 1);
      start += wgt;
    }
    if (progress >= 1) for (let i = 0; i < n; i++) out[i] = 1;
    return out;
  }

  // ---------- drawing ----------
  const geomCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function cumOf(stroke) {
    let c = geomCache && geomCache.get(stroke);
    if (c && c.n === stroke.points.length) return c;
    const pts = stroke.points, m = pts.length;
    const cum = new Float64Array(m + 1);
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let total = cum[m - 1];
    if (stroke.closed && m > 1) { cum[m] = total + hypot(pts[0].x - pts[m - 1].x, pts[0].y - pts[m - 1].y); total = cum[m]; }
    c = { n: m, cum: cum, total: total };
    if (geomCache) geomCache.set(stroke, c);
    return c;
  }

  function ctxScale(ctx) {
    try {
      if (ctx.getTransform) { const m = ctx.getTransform(); const k = hypot(m.a, m.b); if (k > 0) return k; }
    } catch (e) { /* ignore */ }
    return 1;
  }

  // Ribbon geometry of a line stroke (output coords), cut at progress p (0..1 of its length).
  // grow: multiplies the width (the glow ribbon is wider).
  function lineGeom(stroke, view, widthUnit, p, grow) {
    const pts = stroke.points, m = pts.length;
    const info = cumOf(stroke);
    const total = info.total;
    const target = clamp(p, 0, 1) * total;
    const xs = [], ys = [], hw = [];
    const closed = !!stroke.closed;
    const taperLen = CONFIG.taper * total;
    const seedRand = LU.util.mulberry32(stroke.seed || 1);
    const ph = seedRand() * TAU, fq = 3 + seedRand() * 3;
    function halfWidth(s, w) {
      let f = 1;
      if (!closed && taperLen > 0) {
        f = 0.12 + 0.88 * sm(s / taperLen);
        f *= 0.12 + 0.88 * sm((total - s) / taperLen);
      }
      const ink = 1 + 0.035 * Math.sin(s / Math.max(1, total) * TAU * fq + ph);
      return 0.5 * widthUnit * grow * w * f * ink;
    }
    const lastIdx = closed ? m : m - 1;
    for (let i = 0; i <= lastIdx; i++) {
      const pi = closed ? i % m : i;
      const s = info.cum[i];
      if (s > target) {
        // interpolate the cut point between i-1 and i
        const s0 = info.cum[i - 1], f = (target - s0) / Math.max(1e-9, s - s0);
        const a = pts[(i - 1 + m) % m], b = pts[pi];
        xs.push(view.x + view.scale * (a.x + (b.x - a.x) * f));
        ys.push(view.y + view.scale * (a.y + (b.y - a.y) * f));
        hw.push(halfWidth(target, a.w + (b.w - a.w) * f));
        break;
      }
      xs.push(view.x + view.scale * pts[pi].x);
      ys.push(view.y + view.scale * pts[pi].y);
      hw.push(halfWidth(s, pts[pi].w));
    }
    return { xs: xs, ys: ys, hw: hw };
  }

  // Adds the ribbon (circles at every sample + quads between them, all wound the same way) to the path.
  // mult scales every half width, add is added to it (px).
  function addRibbon(ctx, g, mult, add) {
    const n = g.xs.length;
    const hw = new Array(n);
    for (let i = 0; i < n; i++) hw[i] = Math.max(0.01, g.hw[i] * mult + add);
    for (let i = 0; i < n; i++) {
      ctx.moveTo(g.xs[i] + hw[i], g.ys[i]);
      ctx.arc(g.xs[i], g.ys[i], hw[i], 0, TAU, false);
    }
    for (let i = 0; i < n - 1; i++) {
      const ax = g.xs[i], ay = g.ys[i], bx = g.xs[i + 1], by = g.ys[i + 1];
      const ex = bx - ax, ey = by - ay, len = hypot(ex, ey);
      if (len < 1e-6) continue;
      const nx = -ey / len, ny = ex / len;
      const h0 = hw[i], h1 = hw[i + 1];
      const q = [
        ax + nx * h0, ay + ny * h0, bx + nx * h1, by + ny * h1,
        bx - nx * h1, by - ny * h1, ax - nx * h0, ay - ny * h0
      ];
      let area = 0;
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; area += q[2 * k] * q[2 * k2 + 1] - q[2 * k2] * q[2 * k + 1]; }
      ctx.moveTo(q[0], q[1]);
      if (area >= 0) { ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); }
      else { ctx.lineTo(q[6], q[7]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[2], q[3]); }
      ctx.closePath();
    }
  }

  function drawStrokes(ctx, strokes, opts) {
    if (!ctx || !strokes || !strokes.length) return;
    opts = opts || {};
    const view = { scale: opts.scale > 0 ? opts.scale : 1, x: opts.x || 0, y: opts.y || 0 };
    const width = opts.width > 0 ? opts.width : lineWidth(opts.short || 1080);
    const hex = penHex(opts.pen);
    const rgb = rgbOf(hex);
    const doGlow = opts.glow !== false, doShadow = opts.shadow !== false;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const progress = opts.progress == null ? 1 : opts.progress;
    const local = opts.local || strokeProgress(strokes, progress);
    const k = ctxScale(ctx);
    const q = width / (0.0055 * 1080); // shadow size relative to a 1080 card

    // geometry per stroke (skip ones not started)
    const items = [];
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (!s || !s.points || !s.points.length) continue;
      const p = clamp(local[i] == null ? 1 : local[i], 0, 1);
      if (p <= 0) continue;
      if (s.kind === "dot") {
        const pt = s.points[0];
        const r = 0.5 * CONFIG.dotDiameter * width * pop(p);
        if (r <= 0.01) continue;
        items.push({ dot: true, x: view.x + view.scale * pt.x, y: view.y + view.scale * pt.y, r: r });
      } else if (s.points.length >= 2) {
        const pe = p >= 1 ? 1 : ease(p);
        if (pe <= 0) continue;
        items.push({ stroke: s, p: pe });
      }
    }
    if (!items.length) return;

    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha == null ? 1 : ctx.globalAlpha) * alpha;
    const baseAlpha = ctx.globalAlpha;

    for (let i = 0; i < items.length; i++) { // the shapes are worked out once, then drawn for the glow and the core
      const it = items[i];
      if (it.dot) it.geom = { xs: [it.x], ys: [it.y], hw: [it.r] };
      else it.geom = lineGeom(it.stroke, view, width, it.p, 1);
    }
    // grow = 1 is the core line; bigger values are the glow layers (lines get wider, dots get a halo).
    // only: 'lines' or 'dots' (the core pass draws the dots with a stronger shadow ring of their own)
    function buildPath(grow, only) {
      ctx.beginPath();
      for (let i = 0; i < items.length; i++) {
        const it = items[i], g = it.geom;
        if (only === 'lines' && it.dot) continue;
        if (only === 'dots' && !it.dot) continue;
        if (grow === 1) { addRibbon(ctx, g, 1, 0); continue; }
        if (it.dot) addRibbon(ctx, g, 1, (grow - 1) * 0.5 * width);
        else addRibbon(ctx, g, grow, 0);
      }
    }

    // soft glow: a few wide, faint, nested layers in the pen colour. They stack to about 30% next to the
    // line and fade to nothing outward, like a blur, and work on every browser (no blur filter needed).
    if (doGlow) {
      ctx.save();
      const layers = CONFIG.glowLayers;
      const dark = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) < 110;
      const la = CONFIG.glowLayerAlpha * (dark ? CONFIG.darkPenGlow : 1);
      for (let i = 0; i < layers.length; i++) {
        ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + la + ")";
        buildPath(layers[i]);
        ctx.fill("nonzero");
      }
      ctx.restore();
    }

    // the core line, with a faint dark shadow so white still reads on white cloud
    if (opts.core !== false) {
      ctx.save();
      if (doShadow) {
        ctx.shadowColor = CONFIG.shadowRGBA;
        ctx.shadowBlur = 2 * q * k;
        ctx.shadowOffsetX = 1 * q * k; ctx.shadowOffsetY = 1 * q * k;
      }
      ctx.fillStyle = hex;
      let nDots = 0;
      for (let i = 0; i < items.length; i++) if (items[i].dot) nDots++;
      buildPath(1, nDots ? 'lines' : undefined);
      ctx.fill("nonzero");
      ctx.restore();
      // a dot has little body to carry a shadow, and a white dot on bright cloud nearly vanishes: it gets a darker, wider
      // shadow ring (the line is untouched)
      if (nDots) {
        ctx.save();
        if (doShadow) {
          ctx.shadowColor = CONFIG.dotShadowRGBA;
          ctx.shadowBlur = 3.6 * q * k;
          ctx.shadowOffsetX = 0.6 * q * k; ctx.shadowOffsetY = 1.2 * q * k;
        }
        ctx.fillStyle = hex;
        buildPath(1, 'dots');
        ctx.fill("nonzero");
        ctx.restore();
      }
    }

    ctx.globalAlpha = baseAlpha;
    ctx.restore();
  }

  function lineWidth(shortSideOut) { return CONFIG.lineW * shortSideOut; }

  function drawLive(ctx, points, pen, scale, opts) {
    if (!ctx || !points || !points.length) return;
    opts = opts || {};
    scale = scale > 0 ? scale : 1;
    const ox = opts.x || 0, oy = opts.y || 0;
    const width = opts.width > 0 ? opts.width : lineWidth(opts.short || 1080);
    const hex = penHex(pen);
    const k = ctxScale(ctx);
    const q = width / (0.0055 * 1080);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = hex; ctx.fillStyle = hex; ctx.lineWidth = width;
    ctx.shadowColor = CONFIG.shadowRGBA; ctx.shadowBlur = 2 * q * k;
    ctx.shadowOffsetX = q * k; ctx.shadowOffsetY = q * k;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(ox + scale * points[0].x, oy + scale * points[0].y, width * 0.5, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(ox + scale * points[0].x, oy + scale * points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(ox + scale * points[i].x, oy + scale * points[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- the glow ----------
  const maskCache = [];

  function closedKey(strokes) {
    let key = "";
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (s && s.kind === "line" && s.closed) {
        const a = s.points[0], b = s.points[s.points.length >> 1];
        key += s.seed + ":" + s.points.length + ":" + Math.round(s.length) + ":" + Math.round(a.x) + "," + Math.round(a.y) + "," + Math.round(b.x) + "," + Math.round(b.y) + ";";
      }
    }
    return key;
  }

  function glowMask(strokes, w, h, opts) {
    if (!hasClosed(strokes)) return null;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    opts = opts || {};
    const scale = opts.scale > 0 ? opts.scale : 1, ox = opts.x || 0, oy = opts.y || 0;
    const feather = opts.feather > 0 ? opts.feather : CONFIG.featherPx * Math.min(w, h) / 1080;
    const key = closedKey(strokes) + "|" + w + "x" + h + "|" + scale.toFixed(4) + "," + Math.round(ox) + "," + Math.round(oy) + "|" + Math.round(feather);
    for (let i = 0; i < maskCache.length; i++) if (maskCache[i].key === key) return maskCache[i].mask;

    const f = w * h > 700000 ? 0.5 : 1;
    const mw = Math.max(1, Math.round(w * f)), mh = Math.max(1, Math.round(h * f));
    const c = LU.util.createCanvas(mw, mh);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff";
    for (let i = 0; i < strokes.length; i++) { // one fill per shape, so shapes never cancel each other out
      const s = strokes[i];
      if (!s || s.kind !== "line" || !s.closed) continue;
      g.beginPath();
      for (let k = 0; k < s.points.length; k++) {
        const X = (ox + scale * s.points[k].x) * f, Y = (oy + scale * s.points[k].y) * f;
        if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.closePath();
      g.fill("nonzero");
    }
    const img = g.getImageData(0, 0, mw, mh);
    const field = new Float32Array(mw * mh);
    for (let i = 0; i < field.length; i++) field[i] = img.data[i * 4 + 3];
    // 3 box passes ~ a Gaussian; sigma so that the edge ramps over about `feather` px
    const sigma = Math.max(0.5, feather * f / 2.56);
    const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
    const blurred = LU.util.boxBlur(field, mw, mh, r, 3);
    for (let i = 0; i < blurred.length; i++) {
      const a = Math.round(clamp(blurred[i], 0, 255));
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    const mask = { canvas: c, w: mw, h: mh };
    maskCache.push({ key: key, mask: mask });
    if (maskCache.length > 4) maskCache.shift();
    return mask;
  }

  function averageColour(image, w, h) {
    const c = LU.util.createCanvas(8, 8);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(image, 0, 0, w, h, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < 64; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; }
    return { r: Math.round(r / 64), g: Math.round(gg / 64), b: Math.round(b / 64) };
  }

  function makeGlow(image, strokes, opts) {
    opts = opts || {};
    const w = Math.round(opts.w || image.width), h = Math.round(opts.h || image.height);
    const mask = glowMask(strokes, w, h, opts);
    if (!mask) return null;
    const bright = LU.util.createCanvas(w, h);
    let g = bright.getContext("2d");
    g.drawImage(image, 0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(mask.canvas, 0, 0, mask.w, mask.h, 0, 0, w, h);
    const avg = averageColour(image, w, h);
    const dim = LU.util.createCanvas(w, h);
    g = dim.getContext("2d");
    g.fillStyle = "rgb(" + avg.r + "," + avg.g + "," + avg.b + ")";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-out";
    g.drawImage(mask.canvas, 0, 0, mask.w, mask.h, 0, 0, w, h);
    return { w: w, h: h, bright: bright, dim: dim, mask: mask, avg: avg };
  }

  function applyGlow(ctx, glow, amount, x, y) {
    if (!ctx || !glow) return;
    const a = clamp(amount == null ? 1 : amount, 0, 1);
    if (a <= 0) return;
    x = x || 0; y = y || 0;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = CONFIG.dim * a;
    ctx.drawImage(glow.dim, x, y);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = CONFIG.brighten * a;
    ctx.drawImage(glow.bright, x, y);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = CONFIG.contrast * a;
    ctx.drawImage(glow.bright, x, y);
    ctx.restore();
  }

  LU.trace = {
    finish: finish, hasClosed: hasClosed, boundsOf: boundsOf, lineWidth: lineWidth,
    strokeProgress: strokeProgress, ease: ease, pop: pop,
    drawStrokes: drawStrokes, drawLive: drawLive,
    glowMask: glowMask, makeGlow: makeGlow, applyGlow: applyGlow,
    penHex: penHex, CONFIG: CONFIG
  };
})();
