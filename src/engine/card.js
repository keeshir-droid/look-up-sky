// The card (PLAN.md 6.4, 7.3) and the editor view.
//
//   LU.card.create(sky, strokes, settings) -> Promise<Card>     resolves once the Caveat font is ready (never hangs)
//     card.settings                    current settings, LU.DEFAULTS filled in (settings.when 0 = now)
//     card.update(partial)             -> Promise<void>. Accepts finish, pen, glow, said, city, to, when. Caches that depend on
//                                      them rebuild by themselves; a running preview redraws at once, even in its pause.
//     card.setStrokes(strokes)
//     card.drawFrame(ctx, t, format, scale)
//         THE one drawing function: the live preview, the still image (t = LU.END) and the video all call it.
//         format "square" (1080x1080) or "story" (1080x1920); scale 1 = full size; t in seconds (clamped to 0..END).
//         It draws relative to the context's current transform (the preview uses that to centre the card).
//         A 0x0 canvas or a scale of 0 draws nothing, without an error.
//         Timeline (PLAN.md 6.4):
//           0-0.6   the card settles (scale 1.05 -> 1, fades in); the sky drifts very slowly the whole time
//           0.6-2.4 the strokes draw on, in the order they were drawn (LU.trace.strokeProgress / ease / pop)
//           2.4-3.2 the glow comes in (if on) and the words write in, left to right
//           3.2-3.7 the postmark stamps down (Postcard) / the date line fades in (every look)
//           3.7-5.0 hold
//     card._snapshot()                 a copy with its own caches (the exporter draws from it)
//   LU.card.startPreview(canvas, card, format) -> { stop(), setFormat(f), setCard(c) }
//     Loops 0 -> END with a 1 s pause. The canvas is sized from its CSS box x devicePixelRatio (capped at 2). Pauses while
//     the page is hidden or the canvas is off screen. Calling it twice on one canvas stops the first loop.
//   LU.card.drawEditor(canvas, sky, strokes, livePoints, pen)
//     The trace view. Fits the improved sky into the canvas's CURRENT pixel size (aspect kept, centred), then draws the
//     smoothed strokes (the white pen) and the live line. pen is a LU.PENS id; livePoints is [{x,y,t}] in sky pixels or null.
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});
  const card = (LU.card = LU.card || {});
  const U = function () { return LU.util; };

  const T_SETTLE = 0.6, T_DRAW_END = 2.4, T_WORDS_END = 3.2, T_MARK_END = 3.7;
  const ZOOM = 1.03; // the sky is shown 3% closer than its crop, so the slow drift never shows an edge (same as LU.finishes.ZOOM)

  function ss(a, b, t) { return U().smoothstep((t - a) / (b - a)); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---------- text measuring ----------
  let mctx;
  function measure(font, text) {
    if (mctx === undefined) { try { mctx = U().createCanvas(2, 2).getContext("2d"); } catch (e) { mctx = null; } }
    if (mctx) { mctx.font = font; return mctx.measureText(text).width; }
    const m = /(\d+(?:\.\d+)?)px/.exec(font); // no canvas (Node): a rough width
    return text.length * (m ? +m[1] : 16) * 0.5;
  }

  // ---------- the sky as a canvas ----------
  function skyCanvas(sky) {
    const img = sky && sky.image;
    if (!img) return null;
    if (img.data) { // an ImageData (no canvas was around when the sky was made)
      const t = U().createCanvas(img.width, img.height);
      t.getContext("2d").putImageData(img, 0, 0);
      sky.image = t;
      return t;
    }
    return img;
  }

  // draws a part of an image into a rectangle, halving step by step so thin detail survives a big reduction
  function drawScaled(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return;
    let src = img, cw = sw, ch = sh, ox = sx, oy = sy;
    while (cw / dw >= 2 && ch / dh >= 2) {
      const nw = Math.max(Math.ceil(dw), Math.floor(cw / 2)), nh = Math.max(Math.ceil(dh), Math.floor(ch / 2));
      const t = U().createCanvas(nw, nh), tc = t.getContext("2d");
      tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = "high";
      tc.drawImage(src, ox, oy, cw, ch, 0, 0, nw, nh);
      src = t; ox = 0; oy = 0; cw = nw; ch = nh;
    }
    ctx.drawImage(src, ox, oy, cw, ch, dx, dy, dw, dh);
  }

  function layer(w, h, scale, fn) {
    const c = U().createCanvas(Math.max(1, Math.ceil(w * scale)), Math.max(1, Math.ceil(h * scale)));
    const x = c.getContext("2d");
    x.scale(c.width / w, c.height / h);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    fn(x);
    return c;
  }

  // The part of a window the photo does not reach: the SAME photo, heavily blurred, so the colours carry on from the sharp
  // photo's edge. (img = the photo; the sharp photo lands at rx,ry,rw,rh of the w x h layer, from the part sx,sy,sw0,sh0
  // of the photo.) Built small: near the sharp photo it is the photo's own edge colours (a blurred, edge-extended copy: no
  // streaks survive the blur), further away it turns into a cover-scaled copy of the whole photo, with a gentle darkening and
  // a vignette toward the very top and bottom. Then it is box blurred three times and scaled back up.
  function blurredFill(img, W, H, w, h, rx, ry, rw, rh, sx, sy, sw0, sh0) {
    const sw = Math.max(8, Math.round(w / 9)), sh = Math.max(8, Math.round(h / 9)), f = sw / w, n = sw * sh;
    const cc = U().createCanvas(sw, sh), cg = cc.getContext("2d", { willReadFrequently: true });
    cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = "high";
    const s = Math.max(sw / W, sh / H), dw = W * s, dh = H * s;
    drawScaled(cg, img, 0, 0, W, H, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
    const C = cg.getImageData(0, 0, sw, sh).data;
    // the sharp photo, small
    const x0 = clamp(Math.round(rx * f), 0, sw - 1), y0 = clamp(Math.round(ry * f), 0, sh - 1);
    const x1 = clamp(Math.round((rx + rw) * f), x0 + 1, sw), y1 = clamp(Math.round((ry + rh) * f), y0 + 1, sh);
    const pc = U().createCanvas(sw, sh), pg = pc.getContext("2d", { willReadFrequently: true });
    pg.imageSmoothingEnabled = true; pg.imageSmoothingQuality = "high";
    drawScaled(pg, img, sx, sy, sw0, sh0, x0, y0, x1 - x0, y1 - y0);
    const P = pg.getImageData(0, 0, sw, sh).data;
    const D = 0.3 * Math.max(sw, sh), out = new Float32Array(n * 3);
    for (let y = 0; y < sh; y++) {
      const vy = Math.abs(2 * (y + 0.5) / sh - 1), vig = 1 - 0.12 * ss(0.5, 1, vy);
      for (let x = 0; x < sw; x++) {
        const px = clamp(x, x0, x1 - 1), py = clamp(y, y0, y1 - 1);
        const d = Math.hypot(x - px, y - py), t = ss(0, 1, d / D), dark = (1 - 0.1 * t) * vig, i = y * sw + x, e = (py * sw + px) * 4, c = i * 4;
        for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (P[e + ch] * (1 - t) + C[c + ch] * t) * dark;
      }
    }
    const r = Math.max(3, Math.round(sw * 0.075)), id = cg.createImageData(sw, sh);
    for (let ch = 0; ch < 3; ch++) {
      const b = U().boxBlur(out.subarray(ch * n, (ch + 1) * n), sw, sh, r, 3);
      for (let i = 0; i < n; i++) id.data[i * 4 + ch] = b[i];
    }
    for (let i = 0; i < n; i++) id.data[i * 4 + 3] = 255;
    cg.putImageData(id, 0, 0);
    const c = U().createCanvas(w, h), g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(cc, 0, 0, sw, sh, 0, 0, w, h);
    return c;
  }

  // The sky in the window: the crop of the improved photo. The crop never runs past the photo, except when the drawing
  // is too big for the window (crop.fill): then the sky is scaled down to fit it, and what the photo does not reach is the
  // blurred copy of the same photo, with the sharp photo feathered softly into it.
  function buildPhoto(env) {
    const lay = env.lay, crop = env.crop, sky = env.sky;
    const pw = lay.pw, ph = lay.ph;
    const c = U().createCanvas(pw, ph), x = c.getContext("2d");
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    const img = skyCanvas(sky);
    if (!img) { x.fillStyle = "#9db9d6"; x.fillRect(0, 0, pw, ph); }
    else {
      const W = sky.width, H = sky.height, kx = pw / crop.w, ky = ph / crop.h;
      const ix0 = Math.max(0, crop.x), iy0 = Math.max(0, crop.y), ix1 = Math.min(W, crop.x + crop.w), iy1 = Math.min(H, crop.y + crop.h);
      const dx = (ix0 - crop.x) * kx, dy = (iy0 - crop.y) * ky, dw = (ix1 - ix0) * kx, dh = (iy1 - iy0) * ky;
      if (!crop.fill) drawScaled(x, img, ix0, iy0, ix1 - ix0, iy1 - iy0, 0, 0, pw, ph);
      else {
        x.drawImage(blurredFill(img, W, H, pw, ph, dx, dy, dw, dh, ix0, iy0, ix1 - ix0, iy1 - iy0), 0, 0);
        // the sharp photo, feathered where it stops inside the window
        const P = U().createCanvas(pw, ph), p = P.getContext("2d");
        p.imageSmoothingEnabled = true; p.imageSmoothingQuality = "high";
        drawScaled(p, img, ix0, iy0, ix1 - ix0, iy1 - iy0, dx, dy, dw, dh);
        const f = Math.max(14, 0.14 * Math.min(pw, ph)); // a wide, smooth feather (about 155 px on a story frame)
        p.globalCompositeOperation = "destination-in";
        function ramp(x0, y0, x1, y1) { // alpha 0 at (x0,y0) to 1 at (x1,y1), a smoothstep
          const g = p.createLinearGradient(x0, y0, x1, y1);
          for (let i = 0; i <= 8; i++) { const t = i / 8; g.addColorStop(t, "rgba(0,0,0," + (t * t * (3 - 2 * t)).toFixed(4) + ")"); }
          p.fillStyle = g; p.fillRect(0, 0, pw, ph);
        }
        const fx = Math.min(f, dw / 2.2), fy = Math.min(f, dh / 2.2);
        if (dx > 0.5) ramp(dx, 0, dx + fx, 0);
        if (dx + dw < pw - 0.5) ramp(dx + dw, 0, dx + dw - fx, 0);
        if (dy > 0.5) ramp(0, dy, 0, dy + fy);
        if (dy + dh < ph - 0.5) ramp(0, dy + dh, 0, dy + dh - fy);
        x.drawImage(P, 0, 0);
      }
    }
    if (env.look.grade) {
      x.save();
      x.scale(pw / lay.w, ph / lay.h);
      env.look.grade(x, lay.w, lay.h, env.format, env);
      x.restore();
    }
    return c;
  }

  // ---------- the card's working set for one look / format / size ----------
  function buildEnv(cd, format, scale, key) {
    const S = cd.settings, look = LU.finishes.get(S.finish);
    // the crop (and for the Postcard where the stamp and postmark go) is worked out by LU.finishes.plan: see finishes.js
    const plan = LU.finishes.plan(look, format, cd.strokes, cd.sky.width, cd.sky.height);
    const geo = plan.geo, crop = plan.crop;
    // The sky picture is made 3% bigger than the window (the crop already has that 3% in it), at exactly the output's pixel
    // size, so showing it is a plain copy (moved by whole pixels for the slow drift); no resampling every frame.
    const win = geo.win;
    const pw = Math.max(1, Math.round(win.w * ZOOM * scale)), ph = Math.max(1, Math.round(win.h * ZOOM * scale));
    const lw = pw / scale, lh = ph / scale;
    const lay = { pw: pw, ph: ph, w: lw, h: lh, x: win.x + (win.w - lw) / 2, y: win.y + (win.h - lh) / 2 };
    const env = {
      key: key, card: cd, look: look, geo: geo, format: format, scale: scale, crop: crop, lay: lay, arr: plan.arr,
      sky: cd.sky, strokes: cd.strokes, settings: Object.assign({}, S), info: LU.words.when(S.when), ms: S.when,
      measure: measure
    };
    return env;
  }
  function lazy(env, name, fn) { if (env[name] === undefined) { try { env[name] = fn(); } catch (e) { env[name] = null; if (typeof console !== "undefined") console.error(e); } } return env[name]; }

  // ---------- the Card ----------
  function Card(sky, strokes, settings) {
    this.sky = sky;
    this.strokes = (strokes || []).slice();
    this.settings = Object.assign({}, LU.DEFAULTS, settings || {});
    if (!this.settings.when) this.settings.when = Date.now();
    this._sv = 1;      // strokes version
    this._rev = 1;     // bumped by every change (a preview watches it)
    this._envs = {};
  }

  Card.prototype.update = function (partial) {
    partial = partial || {};
    for (const k in partial) {
      if (partial[k] === undefined) continue;
      if (k === "when" && !partial[k]) continue;
      this.settings[k] = partial[k];
    }
    this._rev++;
    return Promise.resolve();
  };

  Card.prototype.setStrokes = function (strokes) {
    this.strokes = (strokes || []).slice();
    this._sv++; this._rev++;
  };

  Card.prototype._snapshot = function () {
    return new Card(this.sky, this.strokes, this.settings);
  };

  Card.prototype._env = function (format, scale) {
    const S = this.settings;
    const key = [S.finish, format, scale.toFixed(3), this._sv, S.said, S.city, S.to, S.when].join("|");
    let e = this._envs[format];
    if (!e || e.key !== key) { e = buildEnv(this, format, scale, key); this._envs[format] = e; }
    return e;
  };

  Card.prototype.drawFrame = function (ctx, t, format, scale) {
    const cv = ctx && ctx.canvas;
    if (!ctx || (cv && (!cv.width || !cv.height)) || !(scale > 0)) return;
    format = format === "story" ? "story" : "square";
    t = clamp(isFinite(t) ? t : 0, 0, LU.END);
    const S = this.settings, env = this._env(format, scale), g = env.geo, look = env.look, win = g.win;
    const W = g.W, H = g.H;

    ctx.save();
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

    // the desk
    const bg = lazy(env, "bgC", function () { return layer(W, H, scale, function (x) { look.background(x, format); }); });
    if (bg) ctx.drawImage(bg, 0, 0, W, H); else look.background(ctx, format);

    // the piece settles in
    const settle = ss(0, T_SETTLE, t), sc = 1 + 0.05 * (1 - settle) * (1 - settle);
    ctx.save();
    ctx.globalAlpha = settle;
    ctx.translate(g.cx, g.cy); ctx.rotate(g.tilt); ctx.scale(sc, sc); ctx.translate(-g.cx, -g.cy);
    const base = lazy(env, "baseC", function () { return layer(W, H, scale, function (x) { look.base(x, format, env); }); });
    if (base) ctx.drawImage(base, 0, 0, W, H); else look.base(ctx, format, env);

    // the sky, the glow and the pen, in the window, drifting very slowly
    const photo = lazy(env, "photoC", function () { return buildPhoto(env); });
    ctx.save();
    ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
    const u = t / LU.END - 0.5, L = env.lay;
    // the drift is moved by whole output pixels, so the sky picture and the line stay crisp
    ctx.translate(Math.round(u * 0.015 * win.w * scale) / scale, Math.round(u * 0.006 * win.h * scale) / scale);
    if (photo) ctx.drawImage(photo, L.x, L.y, L.w, L.h);
    const hasStrokes = env.strokes.length > 0, k = L.w / env.crop.w;
    if (S.glow && photo && hasStrokes && LU.trace.hasClosed(env.strokes)) {
      const glow = lazy(env, "glowO", function () {
        const kp = photo.width / env.crop.w;
        return LU.trace.makeGlow(photo, env.strokes, { w: photo.width, h: photo.height, scale: kp, x: -env.crop.x * kp, y: -env.crop.y * (photo.height / env.crop.h), feather: 30 * scale });
      });
      const amount = ss(T_DRAW_END, T_WORDS_END, t);
      if (glow && amount > 0) {
        ctx.save();
        ctx.translate(L.x, L.y); ctx.scale(L.w / photo.width, L.h / photo.height);
        LU.trace.applyGlow(ctx, glow, amount, 0, 0);
        ctx.restore();
      }
    }
    if (hasStrokes) {
      const prog = clamp((t - T_SETTLE) / (T_DRAW_END - T_SETTLE), 0, 1);
      const o = { pen: S.pen, scale: k, x: L.x - env.crop.x * k, y: L.y - env.crop.y * k, width: g.lineW, progress: prog };
      // Once the drawing is complete its soft glow is the same picture every frame: it is kept as a picture (a blur
      // survives being resampled), while the line itself is always drawn as crisp vector.
      let gl = null;
      if (prog >= 1 && photo) {
        if (!env.glowLayer || env.glowLayer.pen !== S.pen) {
          try {
            const kp = photo.width / env.crop.w, kq = photo.height / env.crop.h;
            const c = U().createCanvas(photo.width, photo.height);
            LU.trace.drawStrokes(c.getContext("2d"), env.strokes, { pen: S.pen, scale: kp, x: -env.crop.x * kp, y: -env.crop.y * kq,
              width: g.lineW * photo.width / L.w, core: false, shadow: false, progress: 1 });
            env.glowLayer = { pen: S.pen, c: c };
          } catch (e) { env.glowLayer = { pen: S.pen, c: null }; }
        }
        gl = env.glowLayer.c;
      }
      if (gl) { ctx.drawImage(gl, L.x, L.y, L.w, L.h); o.glow = false; }
      LU.trace.drawStrokes(ctx, env.strokes, o);
    }
    ctx.restore();

    // stamp, tape, shading
    const over = lazy(env, "overC", function () { return layer(W, H, scale, function (x) { look.over(x, format, env); }); });
    if (over) ctx.drawImage(over, 0, 0, W, H);

    // the words write in; the date line fades in
    const words = lazy(env, "layout", function () { return look.text(env); });
    const fade = ss(T_WORDS_END, T_MARK_END, t);
    if (words) LU.finishes.drawBlocks(ctx, words.blocks, env, ss(T_DRAW_END, T_WORDS_END, t), fade);

    // the postmark stamps down
    if (look.postmark && t > T_WORDS_END) {
      const pm = lazy(env, "pmS", function () { return look.postmark(env); });
      const pmC = pm && lazy(env, "pmC", function () {
        const b = pm.bounds;
        return layer(b.w, b.h, scale, function (x) { x.translate(-b.x, -b.y); pm.draw(x); });
      });
      if (pm && pmC) {
        const p = clamp((t - T_WORDS_END) / (T_MARK_END - T_WORDS_END), 0, 1);
        const s = p < 0.7 ? 1.25 - 0.28 * (1 - Math.pow(1 - p / 0.7, 3)) : 0.97 + 0.03 * ss(0.7, 1, p);
        const lo = pm.skyDark ? 0.93 : 0.75; // light ink on a dark sky stays strong
        const a = p < 0.3 ? 0.95 * p / 0.3 : 0.95 - (0.95 - lo) * ss(0.3, 1, p);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(pm.cx, pm.cy); ctx.rotate(pm.rot); ctx.scale(s, s);
        ctx.drawImage(pmC, pm.bounds.x, pm.bounds.y, pm.bounds.w, pm.bounds.h);
        ctx.restore();
      }
    }
    ctx.restore(); // the piece

    // the made-with mark, always in the same place
    ctx.save();
    ctx.globalAlpha = settle;
    look.mark(ctx, format, env);
    ctx.restore();
    ctx.restore();
  };

  // resolves once the handwriting font is ready (but never waits more than a moment)
  card.create = async function (sky, strokes, settings) {
    try {
      if (typeof document !== "undefined" && document.fonts && document.fonts.load) {
        let timer = 0;
        await Promise.race([
          document.fonts.load('600 40px "Caveat"', "Aa").catch(function () { }),
          new Promise(function (res) { timer = setTimeout(res, 2500); })
        ]);
        clearTimeout(timer);
      }
    } catch (e) { /* the fallback handwriting font is fine */ }
    return new Card(sky, strokes, settings);
  };

  // ---------- the live preview ----------
  const running = typeof WeakMap === "function" ? new WeakMap() : null;

  card.startPreview = function (canvas, cardObj, format) {
    if (running) { const old = running.get(canvas); if (old) old.stop(); }
    let cur = cardObj, fmt = format === "story" ? "story" : "square";
    let raf = 0, stopped = false, visible = true, startT = null, lastKey = "", lastRev = -1;
    const PAUSE = 1.0;

    function size() {
      const dpr = Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
      let cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw) cw = canvas.width / dpr || 360;
      if (!ch) ch = cw * (fmt === "story" ? 16 / 9 : 1);
      const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; lastKey = ""; }
    }

    function frame(now) {
      raf = 0;
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) { startT = null; schedule(); return; }
      if (visible && cur) {
        size();
        if (cur._rev !== lastRev) { // something changed: show it now (the finished card, then the loop goes on)
          if (lastRev !== -1) startT = now - LU.END * 1000;
          lastRev = cur._rev;
        }
        if (startT === null) startT = now;
        const period = LU.END + PAUSE;
        const el = ((now - startT) / 1000) % period;
        const t = Math.min(el, LU.END);
        const H = fmt === "story" ? 1920 : 1080;
        const sc = Math.min(canvas.width / 1080, canvas.height / H);
        const key = t.toFixed(3) + "|" + fmt + "|" + canvas.width + "x" + canvas.height + "|" + cur._rev;
        if (t < LU.END || key !== lastKey) {
          const ctx = canvas.getContext("2d");
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate((canvas.width - 1080 * sc) / 2, (canvas.height - H * sc) / 2);
          try { cur.drawFrame(ctx, t, fmt, sc); } catch (e) { if (typeof console !== "undefined") console.error(e); }
          ctx.restore();
          lastKey = key;
        }
      }
      schedule();
    }
    function schedule() { if (!stopped && !raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame); }

    let io = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(function (entries) { visible = entries[entries.length - 1].isIntersecting; });
      io.observe(canvas);
    }
    schedule();
    const handle = {
      stop: function () { stopped = true; if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); raf = 0; if (io) io.disconnect(); io = null; if (running && running.get(canvas) === handle) running.delete(canvas); },
      setFormat: function (f) { fmt = f === "story" ? "story" : "square"; startT = null; lastKey = ""; },
      setCard: function (c) { cur = c; startT = null; lastKey = ""; lastRev = -1; }
    };
    if (running) running.set(canvas, handle);
    return handle;
  };

  // ---------- the editor view ----------
  card.drawEditor = function (canvas, sky, strokes, livePoints, pen) {
    const ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (!sky || !sky.width || !sky.height) { ctx.restore(); return; }
    const sc = Math.min(W / sky.width, H / sky.height);
    const ox = (W - sky.width * sc) / 2, oy = (H - sky.height * sc) / 2;
    const img = skyCanvas(sky);
    if (img) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, ox, oy, sky.width * sc, sky.height * sc);
    }
    const width = Math.max(LU.trace.lineWidth(Math.min(sky.width, sky.height) * sc), 3);
    if (strokes && strokes.length) LU.trace.drawStrokes(ctx, strokes, { pen: pen || "white", scale: sc, x: ox, y: oy, width: width });
    if (livePoints && livePoints.length) LU.trace.drawLive(ctx, livePoints, pen || "white", sc, { x: ox, y: oy, width: width });
    ctx.restore();
  };
})();
