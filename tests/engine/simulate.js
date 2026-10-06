// Simulated finger traces for the tests and for tests/trace.html. Honestly messy on purpose:
// uneven speed (slower in the curves, sudden bursts), hand wander (slow drift of the whole line),
// finger tremor at 8-15 Hz, 60 Hz timestamps with uneven gaps, and overshoot where a loop closes.
// A classic script: attaches to globalThis.LUTEST, loads in Node and in the browser.
//
//   LUTEST.simulate.whale(box, opts?)  -> { points:[{x,y,t}], ideal:[{x,y}] }   closed loop with overshoot
//   LUTEST.simulate.swoosh(box, opts?) -> open quick stroke
//   LUTEST.simulate.heart(box, opts?)  -> heart, closed with a small overshoot
//   LUTEST.simulate.taps(box, opts?)   -> [ {points}, {points} ]   two taps (eyes)
//   box  = { cx, cy, size }   centre and width of the shape in sky pixels
//   opts = { seed, jitter (css px peak-to-peak, default 3), displayWidth (css px the photo is shown at, default 390),
//            photoWidth (sky px, default box.size*3), duration (ms), wander (fraction of size, default 0.02) }
(function () {
  const T = (globalThis.LUTEST = globalThis.LUTEST || {});

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // uniform Catmull-Rom through unit-space control points -> dense polyline
  function spline(ctrl, perSeg) {
    const out = [];
    const n = ctrl.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
      for (let k = 0; k < perSeg; k++) {
        const t = k / perSeg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        });
      }
    }
    out.push({ x: ctrl[n - 1][0], y: ctrl[n - 1][1] });
    return out;
  }

  // smooth band-limited noise: random knots at `freq` Hz, cosine-interpolated
  function noise1(rand, freq) {
    const knots = [];
    for (let i = 0; i < 400; i++) knots.push(rand() * 2 - 1);
    return function (tMs) {
      const u = tMs / 1000 * freq, i = Math.floor(u), f = u - i;
      const a = knots[i % knots.length], b = knots[(i + 1) % knots.length];
      const s = (1 - Math.cos(f * Math.PI)) / 2;
      return a * (1 - s) + b * s;
    };
  }

  // walk the dense ideal polyline (unit coords) like a finger would
  function walk(ideal, box, o, defaultMs, speedBias) {
    const rand = rng(o.seed || 1);
    const size = box.size;
    // unit -> sky px (unit space is -1..1 in x; keep aspect)
    const P = ideal.map(function (p) { return { x: box.cx + p.x * size / 2, y: box.cy + p.y * size / 2 }; });
    const n = P.length;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const total = cum[n - 1];
    // curvature -> slow down in the curves
    const curv = new Array(n).fill(0);
    for (let i = 3; i < n - 3; i++) {
      const a = Math.atan2(P[i].y - P[i - 3].y, P[i].x - P[i - 3].x), b = Math.atan2(P[i + 3].y - P[i].y, P[i + 3].x - P[i].x);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
      curv[i] = d;
    }
    const duration = o.duration || defaultMs;
    const baseV = total / duration;                    // px per ms on average
    const burst = noise1(rand, 1.3), burst2 = noise1(rand, 0.6);
    const jitterAmp = (o.jitter == null ? 3 : o.jitter) / 2 * ((o.photoWidth || size * 3) / (o.displayWidth || 390)); // sky px, peak
    const jf = 8 + rand() * 7;
    const jx = noise1(rand, jf), jy = noise1(rand, jf * 0.93), jx2 = noise1(rand, jf * 1.7), jy2 = noise1(rand, jf * 1.3);
    const wanderAmp = (o.wander == null ? 0.02 : o.wander) * size;
    const wx = noise1(rand, 0.9), wy = noise1(rand, 0.8);
    const pts = [];
    let t = 0, s = 0, idx = 0;
    const endBias = speedBias || 0;
    while (s < total && t < 20000) {
      while (idx < n - 2 && cum[idx + 1] < s) idx++;
      const f = (s - cum[idx]) / Math.max(1e-6, cum[idx + 1] - cum[idx]);
      const bx = P[idx].x + (P[idx + 1].x - P[idx].x) * f, by = P[idx].y + (P[idx + 1].y - P[idx].y) * f;
      const x = bx + jitterAmp * (0.75 * jx(t) + 0.25 * jx2(t)) + wanderAmp * wx(t);
      const y = by + jitterAmp * (0.75 * jy(t) + 0.25 * jy2(t)) + wanderAmp * wy(t);
      pts.push({ x: x, y: y, t: Math.round(t * 10) / 10 });
      const dt = 16.7 + (rand() - 0.5) * 7;            // 60 Hz with uneven gaps
      const k = Math.min(1, curv[idx] / 0.35);
      const uneven = 1 + 0.55 * burst(t) + 0.3 * burst2(t); // bursts of speed
      const v = baseV * Math.max(0.25, uneven) * (1 - 0.5 * k) * (1 + endBias * (s / total - 0.5));
      s += v * dt;
      t += dt;
    }
    return { points: pts, ideal: P };
  }

  T.simulate = {
    rng: rng,

    // a whale facing left, tail up on the right; the loop overshoots past where it began
    whale: function (box, o) {
      o = o || {};
      const c = [
        [-1.0, 0.12], [-0.9, -0.12], [-0.68, -0.3], [-0.35, -0.4], [0.0, -0.36], [0.32, -0.22],
        [0.55, -0.1], [0.72, -0.3], [0.8, -0.58], [0.98, -0.78], [0.72, -0.7], [0.5, -0.82],
        [0.46, -0.5], [0.4, -0.1], [0.22, 0.2], [-0.1, 0.38], [-0.45, 0.42], [-0.78, 0.34], [-0.96, 0.22],
        [-1.0, 0.1], [-0.95, -0.07], [-0.86, -0.17]   // overshoot past the start
      ];
      const ideal = spline(c, 14).map(function (p) { return { x: p.x, y: p.y * 1.0 }; });
      return walk(ideal, box, o, 2600, 0);
    },

    // a quick open swoosh (a wing / wind)
    swoosh: function (box, o) {
      o = o || {};
      const c = [[-1, 0.5], [-0.6, 0.1], [-0.15, -0.2], [0.3, -0.25], [0.7, -0.05], [1.0, 0.35]];
      return walk(spline(c, 16), box, o, 900, 0.5);
    },

    // a heart, started in the dip at the top, a little overshoot at the end
    heart: function (box, o) {
      o = o || {};
      const ideal = [];
      // classic parametric heart from the top dip round and back
      const N = 220;
      for (let i = 0; i <= N; i++) {
        const t = Math.PI * 2 * (i / N) * 1.04; // 4% overshoot
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        ideal.push({ x: x / 17, y: (y + 2) / 17 });
      }
      return walk(ideal, box, o, 2200, 0);
    },

    // two taps (the eyes), each 40-110 ms with a few px of movement
    taps: function (box, o) {
      o = o || {};
      const rand = rng((o.seed || 1) + 99);
      const out = [];
      const spots = [[-0.2, 0], [0.2, 0.02]];
      for (let s = 0; s < spots.length; s++) {
        const pts = [];
        const n = 4 + Math.floor(rand() * 4);
        const dur = 40 + rand() * 70;
        const wob = (o.jitter == null ? 3 : o.jitter) * 0.5 * ((o.photoWidth || box.size * 3) / (o.displayWidth || 390)) * 0.4;
        for (let i = 0; i < n; i++) {
          pts.push({
            x: box.cx + spots[s][0] * box.size + (rand() - 0.5) * wob,
            y: box.cy + spots[s][1] * box.size + (rand() - 0.5) * wob,
            t: Math.round(i * dur / (n - 1))
          });
        }
        out.push({ points: pts });
      }
      return out;
    }
  };
})();
