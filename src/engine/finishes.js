// The five looks: the card around the sky (PLAN.md section 5.5). Everything is drawn in code.
//
//   LU.finishes.get(id) -> look            (unknown id gives Postcard)
//   LU.finishes.box(format) -> { W, H, x, y, w, h }    the canvas and the safe box (story: y 270..1540, 90 px side margins)
//   LU.finishes.cropFor(strokes, skyW, skyH, win, focusY?, focusX?, target?) -> { x, y, w, h, fill }   the part of the sky a window shows
//       (focus = where in the target the drawing's centre sits, 0.5 = the middle; target = where the drawing + padding must sit,
//       default the window). The crop stays inside the photo; fill = true means the sky was scaled down and the card fills the
//       rest of the window with a blurred copy of the same photo (see the long comment above cropFor)
//   LU.finishes.plan(look, format, strokes, skyW, skyH) -> { geo, crop, arr, lay, k, ox, oy }   the whole view without a canvas
//       (arr: Postcard only, where the stamp, postmark and lines go; look.arrange picks the corner with no drawing under it)
//   LU.finishes.drawBlocks(ctx, blocks, env, reveal, fade)   draws the laid-out words (see below)
//   LU.finishes.mark(ctx, x, y, size, color, shadow)         "made with look-up-sky.vercel.app", right aligned
//
// Everything is in CARD UNITS: the card is 1080 wide and 1080 ("square") or 1920 ("story") high. The caller scales the
// context. A look is an object:
//   look.geo(format)               -> { W, H, cx, cy, tilt, win:{x,y,w,h}, lineW, focusY }   the piece's centre and tilt, the
//                                     window the sky shows in, the pen's width, where in the window the drawing is centred
//   look.background(ctx, format)   static, card space (the desk)
//   look.base(ctx, format, env)    static, piece space (paper, shadow, frame; no sky)
//   look.grade(ctx, w, h, format)  optional, baked into the sky picture (film fade, grain)
//   look.over(ctx, format, env)    static, piece space, drawn above the sky and the pen (stamp, tape, shading)
//   look.text(env)                 -> { blocks }  the words, laid out (cached by the card)
//   look.postmark(env)             optional -> { cx, cy, rot, bounds, draw(ctx) }
//   look.mark(ctx, format, env)    card space, the made-with mark
// "piece space" is card space before the piece is tilted and settled around (cx, cy).
// env (made by card.js): { settings, info (LU.words.when), ms, format, scale, sky, crop, geo, measure(font, text) }
//
// Story safe zone: every look keeps its paper, tape, words and mark inside y 270..1540 and x 90..990 (tilt included);
// only the sky itself may run full-bleed behind.
// Nothing here touches document/window at load time.
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});
  const U = function () { return LU.util; };

  const HAND = '"Caveat","Segoe Print","Bradley Hand","Comic Sans MS",cursive';
  const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif';
  const SANS = '"Helvetica Neue",Helvetica,Arial,sans-serif';
  const SITE = "look-up-sky.vercel.app";
  const INK = "#2b3d63";       // handwriting ink
  const POSTMARK = "#2c3e5c";  // --postmark
  const DEG = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function box(format) {
    return format === "story"
      ? { W: 1080, H: 1920, x: 90, y: 270, w: 900, h: 1270 }
      : { W: 1080, H: 1080, x: 60, y: 60, w: 960, h: 960 };
  }

  // ---------- drawing helpers ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function canvasOf(w, h) { return U().createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); }

  let noiseCanvas = null;
  function noise() { // seeded grey noise, reused for paper and film grain
    if (noiseCanvas !== null) return noiseCanvas || null;
    try {
      const c = U().createCanvas(192, 192), x = c.getContext("2d"), img = x.createImageData(192, 192), r = U().mulberry32(3);
      for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      x.putImageData(img, 0, 0);
      noiseCanvas = c;
    } catch (e) { noiseCanvas = false; }
    return noiseCanvas || null;
  }
  function grain(ctx, x, y, w, h, op, alpha) {
    const n = noise(); if (!n) return;
    ctx.save();
    ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.createPattern(n, "repeat");
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function softStops(grad, rgb, peak, n) { // a gaussian-ish ramp as gradient stops, so nothing has a visible edge
    for (let i = 0; i <= n; i++) { const t = i / n; grad.addColorStop(t, "rgba(" + rgb + "," + (peak * Math.exp(-3.4 * t * t)).toFixed(4) + ")"); }
  }

  // ---------- the crop: which part of the sky a window shows (PLAN.md 5.5) ----------
  // The sky is shown 3% closer than its crop (ZOOM), so the slow drift never shows an edge: the picture the card draws (the
  // "layer") is 3% bigger than the window and the crop maps onto the whole layer.
  //
  // The rules, in order:
  //   1. The strokes' bounding box + 25% padding, grown to the window's shape and centred on the drawing (focus = where in
  //      the target the drawing's centre sits). The crop never runs past the photo.
  //   2. When that does not fit inside the photo, the padding shrinks first (down to about 6% each side), and the window
  //      slides along the photo (still holding the whole drawing) before anything else gives way.
  //   3. When even that is impossible (a wide drawing in a tall window, a portrait photo in a landscape window, a drawing
  //      at the photo's very edge) the sky is scaled DOWN until the drawing and its padding fit the target, and the part of
  //      the window the photo does not reach is filled by the card with a blurred, darkened copy of the same photo. Nothing
  //      is ever stretched or invented: `fill` is true and the crop reaches past the photo only in that case.
  // target = the part of the window the drawing + padding must sit in (default: the whole window). The full-bleed
  // stories pass their safe box so the drawing keeps the 90 px side margins.
  const ZOOM = 1.03;
  const PAD_WANT = 1.5, PAD_MIN = 1.12, PAD_FILL = 1.16, PAD_FILL_BLEED = 1.07, PAD_PX = 20; // PAD_PX: card px the drawing keeps from the edge, whatever its size

  function layerRect(win) {
    const w = win.w * ZOOM, h = win.h * ZOOM;
    return { x: (win.x || 0) + (win.w - w) / 2, y: (win.y || 0) + (win.h - h) / 2, w: w, h: h };
  }

  function cropFor(strokes, skyW, skyH, win, focusY, focusX, target, opts) {
    opts = opts || {};
    const W = skyW, H = skyH, L = layerRect(win);
    const T = target || { x: win.x || 0, y: win.y || 0, w: win.w, h: win.h };
    focusX = focusX === undefined ? 0.5 : focusX;
    focusY = focusY === undefined ? 0.5 : focusY;
    const kcover = Math.max(L.w / W, L.h / H); // the scale at which the photo exactly covers the layer
    const b = LU.trace.boundsOf(strokes);
    if (!b) {
      const w = L.w / kcover, h = L.h / kcover;
      return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h, fill: false };
    }
    const short = Math.min(W, H);
    const bw = Math.max(b.x1 - b.x0, 0.04 * short), bh = Math.max(b.y1 - b.y0, 0.04 * short);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const minW = Math.min(W, Math.max(0.2 * W, 0.5 * win.w), H * L.w / L.h);
    const kmax = Math.max(kcover, L.w / minW);
    const Tcx = T.x + focusX * T.w, Tcy = T.y + focusY * T.h;
    function kpad(f) { return Math.min(T.w / (bw * f), T.h / (bh * f)); }
    // one axis: the origins of the crop (sky px) that keep the drawing + minimum padding inside the target (tLo..tHi),
    // and inside the photo (0..P-len)
    function axis(k, c, bs, t0, tl, l0, ll, P, focus) {
      const half = bs / 2 + Math.max(bs * (PAD_MIN - 1) / 2, PAD_PX / k), len = ll / k; // at least 6% of the drawing, and room for the line and its glow
      const tHi = c - half - (t0 - l0) / k, tLo = c + half - (t0 + tl - l0) / k;
      return { tLo: tLo, tHi: tHi, lo: Math.max(tLo, 0), hi: Math.min(tHi, P - len), len: len, want: c - (focus - l0) / k };
    }
    function both(k) {
      return { x: axis(k, cx, bw, T.x, T.w, L.x, L.w, W, Tcx), y: axis(k, cy, bh, T.y, T.h, L.y, L.h, H, Tcy) };
    }
    // plain crop: the biggest scale that gives 25% padding, backing off towards the photo-covering scale until the
    // window can sit inside the photo with the whole drawing in the target
    const k0 = clamp(kpad(opts.padWant || PAD_WANT), kcover, kmax);
    for (let i = 0; i <= 14; i++) {
      const k = k0 * Math.pow(kcover / k0, i / 14), a = both(k);
      if (a.x.lo <= a.x.hi + 1e-6 && a.y.lo <= a.y.hi + 1e-6) {
        return { x: clamp(a.x.want, a.x.lo, a.x.hi), y: clamp(a.y.want, a.y.lo, a.y.hi), w: a.x.len, h: a.y.len, fill: false };
      }
    }
    // scaled down, with the photo's own blur around it
    // a full-bleed story (a target was given) lets the drawing reach nearly to its 90 px margins, so the sharp photo is as big as it can be
    const kf = Math.max(Math.min(kcover, kpad(target ? PAD_FILL_BLEED : PAD_FILL)), 0.2 * kcover), a = both(kf);
    function pick(ax, P) {
      let o = ax.len >= P ? (P - ax.len) / 2 : clamp(ax.want, 0, P - ax.len);
      return ax.tLo <= ax.tHi ? clamp(o, ax.tLo, ax.tHi) : (ax.tLo + ax.tHi) / 2;
    }
    const x = pick(a.x, W), y = pick(a.y, H);
    return { x: x, y: y, w: a.x.len, h: a.y.len, fill: x < -0.5 || y < -0.5 || x + a.x.len > W + 0.5 || y + a.y.len > H + 0.5 };
  }

  // The whole view of one look for one drawing: the crop, where the sky lands on the card, and (Postcard) where the stamp
  // and postmark go. Pure numbers, no canvas, so the tests can check them in Node.
  //   card X = lay.x + k * (skyX - crop.x),   card Y = lay.y + k * (skyY - crop.y)   (piece space: before the tilt)
  function plan(look, format, strokes, skyW, skyH) {
    const geo = look.geo(format);
    let crop = cropFor(strokes, skyW, skyH, geo.win, geo.focusY, geo.focusX, geo.target);
    let arr = null;
    if (look.arrange) {
      arr = look.arrange({
        geo: geo, format: format, strokes: strokes, crop: crop,
        recrop: function (padWant) { return cropFor(strokes, skyW, skyH, geo.win, geo.focusY, geo.focusX, geo.target, { padWant: padWant }); }
      });
      if (arr && arr.crop) crop = arr.crop;
    }
    const lay = layerRect(geo.win), k = lay.w / crop.w;
    return { geo: geo, crop: crop, arr: arr, lay: lay, k: k, ox: lay.x - crop.x * k, oy: lay.y - crop.y * k };
  }

  // ---------- words: laid-out blocks ----------
  // the moon is about 1.1x the date text's cap height (the cap height of these fonts is about 0.7 of the size)
  function moonD(size) { return Math.max(13, 0.77 * size); }

  // Lays out one piece of text (fitting, wrapping, alignment). o = {
  //   text, family, style, weight, size, maxW, maxH, minRatio, maxLines, lineRatio (x size, default 1.1), lineH (px, overrides),
  //   align "left"|"right"|"center", x (the anchor), y (first baseline) | top (top of the first line) | vcenter,
  //   color, kind "write"|"fade", moon (true: the moon icon after the last line), moonColor (default: color),
  //   shadow {color, blur, dx, dy}, custom(ctx) }
  function block(env, o) {
    const style = o.style || "normal", weight = o.weight || 400;
    function fontOf(s) { return style + " " + weight + " " + (Math.round(s * 10) / 10) + "px " + o.family; }
    const gapOf = function (s) { return s * 0.35; };
    const reserve = o.moon ? moonD(o.size) + gapOf(o.size) : 0;
    const fr = LU.words.fit(function (t, s) { return env.measure(fontOf(s), t); }, o.text, Math.max(10, o.maxW - reserve), o.size,
      { minRatio: o.minRatio, maxLines: o.maxLines, maxH: o.maxH, lineHeight: o.lineRatio || 1.1 });
    if (!fr.lines.length) return null;
    const size = fr.size, step = o.lineH > 0 ? o.lineH : fr.lineHeight, n = fr.lines.length;
    const capH = size * 0.7;
    let y0;
    if (o.y !== undefined) y0 = o.y;
    else if (o.top !== undefined) y0 = o.top + size * 0.8;
    else y0 = o.vcenter - ((n - 1) * step + capH) / 2 + capH;
    const font = fontOf(size), mD = moonD(size), gap = gapOf(size);
    const align = o.align || "left";
    const lines = [];
    let x0 = Infinity, x1 = -Infinity, moon = null;
    for (let i = 0; i < n; i++) {
      const t = fr.lines[i], w = env.measure(font, t);
      const withMoon = o.moon && i === n - 1;
      const total = w + (withMoon ? mD + gap : 0);
      const left = align === "left" ? o.x : (align === "right" ? o.x - total : o.x - total / 2);
      const y = y0 + i * step;
      lines.push({ t: t, x: left, y: y, w: w });
      x0 = Math.min(x0, left); x1 = Math.max(x1, left + total);
      if (withMoon) moon = { x: left + w + gap + mD / 2, y: y - capH * 0.5, d: mD };
    }
    return {
      kind: o.kind || "write", lines: lines, font: font, color: o.color || "#222", moonColor: o.moonColor || o.color || "#222", size: size, moon: moon,
      shadow: o.shadow || null, custom: o.custom || null, x0: x0, x1: x1, top: y0 - size * 1.0, bottom: y0 + (n - 1) * step + size * 0.45
    };
  }

  // reveal: 0..1 over all "write" blocks in order (left to right); fade: 0..1 for the "fade" blocks (the date line)
  function drawBlocks(ctx, blocks, env, reveal, fade) {
    if (!blocks || !blocks.length) return;
    let total = 0;
    blocks.forEach(function (b) { if (b.kind === "write") total += Math.max(40, b.x1 - b.x0); });
    let acc = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let a = 1, p = 1;
      if (b.kind === "write") {
        const wgt = Math.max(40, b.x1 - b.x0), s0 = acc / total, s1 = (acc + wgt) / total;
        acc += wgt;
        p = clamp((reveal - s0) / (s1 - s0), 0, 1);
        if (p <= 0) continue;
      } else {
        a = fade;
        if (!(a > 0)) continue;
      }
      ctx.save();
      ctx.globalAlpha *= a;
      if (p < 1) {
        const w = (b.x1 - b.x0 + 16) * p;
        ctx.beginPath(); ctx.rect(b.x0 - 8, b.top - 10, w, b.bottom - b.top + 20); ctx.clip();
      }
      if (b.custom) { b.custom(ctx); ctx.restore(); continue; }
      ctx.font = b.font; ctx.fillStyle = b.color; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      if (b.shadow) { ctx.shadowColor = b.shadow.color; ctx.shadowBlur = b.shadow.blur; ctx.shadowOffsetX = b.shadow.dx || 0; ctx.shadowOffsetY = b.shadow.dy || 0; }
      for (let k = 0; k < b.lines.length; k++) ctx.fillText(b.lines[k].t, b.lines[k].x, b.lines[k].y);
      if (b.moon) LU.moon.draw(ctx, b.moon.x, b.moon.y, b.moon.d, env.ms, b.moonColor);
      ctx.restore();
    }
  }

  function mark(ctx, x, y, size, color, shadow, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha === undefined ? 0.66 : alpha;
    ctx.fillStyle = color;
    ctx.font = "italic 500 " + size + "px " + SERIF;
    ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1; }
    ctx.fillText("made with " + SITE, x, y);
    ctx.restore();
  }

  function cityOf(env) { return (env.settings.city || "").trim() || "The sky today"; }
  function toOf(env) { const t = (env.settings.to || "").trim(); return t ? "for " + t : ""; }
  function saidOf(env) { return (env.settings.said || "").trim(); }
  // Postcard, Polaroid and Letter always have a line in the strip; Film and Just the sky stay quiet when it is empty.
  function saidOr(env, fallback) { return saidOf(env) || fallback; }

  // ---------- seven-segment date stamp (the film's orange stamp) ----------
  const SEG = { "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
  function sevenSegWidth(str, h) {
    const w = h * 0.56, t = h * 0.11, gap = h * 0.26;
    let total = 0;
    str.split("").forEach(function (c) { total += (c === " " ? w * 0.6 : (c === "'" ? t * 2.2 : w)) + gap; });
    return total - gap;
  }
  function sevenSeg(ctx, str, x, y, h, color) { // x = right edge, y = baseline
    const w = h * 0.56, t = h * 0.11, gap = h * 0.26;
    const chars = str.split("");
    let cx = x - sevenSegWidth(str, h);
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = "rgba(255,110,0,.85)"; ctx.shadowBlur = h * 0.35;
    ctx.transform(1, 0, -0.12, 1, 0.12 * y, 0); // a little slant
    chars.forEach(function (c) {
      if (c === " ") { cx += w * 0.6 + gap; return; }
      if (c === "'") { ctx.beginPath(); ctx.moveTo(cx, y - h); ctx.lineTo(cx + t * 1.6, y - h); ctx.lineTo(cx + t * 0.6, y - h * 0.8); ctx.closePath(); ctx.fill(); cx += t * 2.2 + gap; return; }
      const on = SEG[c] || "";
      const seg = { a: [0, 0, w, t], b: [w - t, 0, t, h / 2], c: [w - t, h / 2, t, h / 2], d: [0, h - t, w, t], e: [0, h / 2, t, h / 2], f: [0, 0, t, h / 2], g: [0, h / 2 - t / 2, w, t] };
      for (let i = 0; i < on.length; i++) { const s = seg[on[i]]; ctx.fillRect(cx + s[0], y - h + s[1], s[2], s[3]); }
      cx += w + gap;
    });
    ctx.restore();
  }

  // ---------- washi tape (adapted from Underline's torn page) ----------
  function washi(ctx, cx, cy, rot, tw, th, rgb) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.shadowColor = "rgba(40,25,10,.25)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = "rgba(" + rgb + ",.84)";
    ctx.beginPath();
    ctx.moveTo(-tw / 2, -th / 2);
    for (let y = -th / 2; y <= th / 2; y += 6) ctx.lineTo(-tw / 2 + (Math.floor((y + th / 2) / 6) % 2 ? 4 : 0), y);
    ctx.lineTo(-tw / 2, th / 2); ctx.lineTo(tw / 2, th / 2);
    for (let y = th / 2; y >= -th / 2; y -= 6) ctx.lineTo(tw / 2 - (Math.floor((y + th / 2) / 6) % 2 ? 4 : 0), y);
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 7;
    for (let x = -tw; x < tw; x += 22) { ctx.beginPath(); ctx.moveTo(x, th); ctx.lineTo(x + th, -th); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
  }

  function pieceShadowCard(ctx, x, y, w, h, r, fill, blur, dy, alpha) {
    ctx.save();
    ctx.shadowColor = "rgba(60,40,20," + alpha + ")"; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy;
    ctx.fillStyle = fill; rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
  }

  function deskBackground(ctx, format, base, hi, lo) {
    const b = box(format);
    ctx.fillStyle = base; ctx.fillRect(0, 0, b.W, b.H);
    const g = ctx.createRadialGradient(b.W * 0.45, b.H * 0.4, 80, b.W / 2, b.H / 2, b.H * 0.8);
    g.addColorStop(0, hi); g.addColorStop(1, lo);
    ctx.fillStyle = g; ctx.fillRect(0, 0, b.W, b.H);
    // window light from the top left
    const l = ctx.createLinearGradient(0, 0, b.W, b.H * 0.7);
    l.addColorStop(0, "rgba(255,255,255,.28)"); l.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = l; ctx.fillRect(0, 0, b.W, b.H);
    grain(ctx, 0, 0, b.W, b.H, "multiply", 0.07);
  }

  // =====================================================================================
  // POSTCARD (the hero)
  // =====================================================================================
  const postcard = (function () {
    const CREAM_INK = "#f7f0dc";
    const CORNERS = ["tr", "tl", "br", "bl"]; // the order we like them in: top-right is the classic place
    function parts(story) {
      return { sw: story ? 140 : 126, sh: story ? 172 : 156, R: story ? 118 : 106, dx: story ? 104 : 96, dy: story ? 52 : 46, lines: story ? 210 : 190, ix: 12, iy: 10 };
    }

    function geo(format) {
      const story = format === "story";
      const W = 1080, H = story ? 1920 : 1080;
      const cw = story ? 780 : 1000, ch = story ? 1170 : 667, cx = 540, cy = story ? 877 : 512;
      const border = story ? 20 : 18, strip = story ? 164 : 138;
      const x = cx - cw / 2, y = cy - ch / 2;
      return {
        W: W, H: H, cx: cx, cy: cy, tilt: -1.5 * DEG, card: { x: x, y: y, w: cw, h: ch }, border: border, strip: strip,
        win: { x: x + border, y: y + border, w: cw - 2 * border, h: ch - 2 * border - strip },
        lineW: 5.94, focusY: 0.55, focusX: 0.46 // the drawing sits a little down and left, away from the usual stamp corner
      };
    }

    // The stamp, the postmark and the cancellation lines are one group that sits in a corner of the photo window. (s = the
    // group's size, 1 = full.) The postmark overlaps the stamp's inner side and the wavy lines run across the stamp towards
    // the nearer card edge, like a real cancellation.
    function placeGroup(g, story, corner, s) {
      const P = parts(story), win = g.win;
      const right = corner === "tr" || corner === "br", top = corner === "tr" || corner === "tl";
      const sw = P.sw * s, sh = P.sh * s, R = P.R * s;
      const scx = right ? win.x + win.w - P.ix - sw / 2 : win.x + P.ix + sw / 2;
      const scy = top ? win.y + P.iy + sh / 2 : win.y + win.h - P.iy - sh / 2;
      const dir = right ? 1 : -1, vdir = top ? 1 : -1;
      // only the ring's outer edge reaches onto the stamp (about 7% of the ring's diameter), so the time, the city arc and the
      // "LOOK UP" label stay clear of the paper
      const pcx = scx - dir * (sw / 2 + R * 0.85), pcy = scy + vdir * P.dy * s;
      const ly = scy - 10 * s - pcy; // the wavy lines run across the stamp's picture, above its label
      const start = pcx + dir * 0.9 * R, edge = right ? win.x + win.w - 6 : win.x + 6;
      const len = Math.max(0, Math.min(P.lines * s, dir * (edge - start)));
      return {
        corner: corner, s: s, dir: dir,
        stamp: { cx: scx, cy: scy, w: sw, h: sh, rot: dir * 3.5 * DEG },
        pm: { cx: pcx, cy: pcy, R: R, rot: -dir * 10 * DEG, dir: dir, len: len, ly: ly }
      };
    }

    // the drawing's samples in piece space (card units, before the tilt), with the crop's own mapping
    function cardPoints(strokes, crop, win) {
      const lay = layerRect(win), k = lay.w / crop.w, out = [];
      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (!s || !s.points) continue;
        const pts = s.points, step = Math.max(1, Math.floor(pts.length / 1200));
        for (let j = 0; j < pts.length; j += step) out.push({ x: lay.x + k * (pts[j].x - crop.x), y: lay.y + k * (pts[j].y - crop.y), w: s.kind === "dot" ? 8 : 1 });
        if (pts.length > 1 && (pts.length - 1) % step) { const q = pts[pts.length - 1]; out.push({ x: lay.x + k * (q.x - crop.x), y: lay.y + k * (q.y - crop.y), w: 1 }); }
      }
      return out;
    }

    // how much of the drawing (plus its glow and the slow drift, m) lies under the stamp, the postmark or the lines
    function overlap(pts, G, m) {
      const st = G.stamp, pm = G.pm, R = pm.R, dir = pm.dir;
      const cs = Math.cos(-st.rot), sn = Math.sin(-st.rot), cp = Math.cos(-pm.rot), sp = Math.sin(-pm.rot);
      let n = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        const dx = q.x - st.cx, dy = q.y - st.cy, lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
        if (Math.abs(lx) <= st.w / 2 + m && Math.abs(ly) <= st.h / 2 + m) { n += q.w; continue; }
        const ex = q.x - pm.cx, ey = q.y - pm.cy, px = ex * cp - ey * sp, py = ex * sp + ey * cp;
        if (px * px + py * py <= (R + m) * (R + m)) { n += q.w; continue; }
        const along = dir * px; // along the lines
        if (pm.len > 4 && along >= 0.6 * R && along <= 0.9 * R + pm.len + m && Math.abs(py - pm.ly) <= 0.45 * R + m) n += q.w;
      }
      return n;
    }

    // Looks for the corner (and size, and a slightly wider crop) where the group does not sit on the drawing.
    function arrange(p) {
      const g = p.geo, story = p.format === "story", strokes = p.strokes || [];
      const scales = [1, 0.88, 0.78, 0.7], M = 22;
      let best = null, crop = p.crop, lastW = -1;
      for (let ci = 0; ci < 3; ci++) {
        if (ci > 0) { crop = p.recrop(ci === 1 ? 1.8 : 2.1); if (Math.abs(crop.w - lastW) < 0.01) continue; }
        lastW = crop.w;
        const pts = cardPoints(strokes, crop, g.win);
        for (let si = 0; si < scales.length; si++) {
          for (let c = 0; c < CORNERS.length; c++) {
            const G = placeGroup(g, story, CORNERS[c], scales[si]), pen = overlap(pts, G, M);
            if (!best || pen < best.pen) best = { pen: pen, G: G, crop: crop };
            if (pen === 0) return Object.assign({}, G, { crop: crop, overlap: 0 });
          }
        }
      }
      return Object.assign({}, best.G, { crop: best.crop, overlap: best.pen });
    }
    function arrOf(env) {
      if (!env.arr) {
        const g = geo(env.format);
        env.arr = Object.assign(placeGroup(g, env.format === "story", "tr", 1), { crop: env.crop, overlap: 0 });
      }
      return env.arr;
    }

    // the little crop of their own sky on the stamp (a part of the photo near the top left of the drawing)
    function thumbOf(env) {
      const img = env.sky && env.sky.image, W = env.sky ? env.sky.width : 0, H = env.sky ? env.sky.height : 0;
      if (!(img && W && H) || img.data) return null;
      const b = LU.trace.boundsOf(env.strokes || []);
      const side = 0.42 * Math.min(W, H);
      const cxs = b ? b.x0 + 0.3 * (b.x1 - b.x0) : W / 2, cys = b ? b.y0 + 0.35 * (b.y1 - b.y0) : H / 2;
      return { img: img, sx: clamp(cxs - side / 2, 0, W - side), sy: clamp(cys - side / 2, 0, H - side), side: side };
    }
    function meanLuma(source, sx, sy, sw, sh) { // 0 (black) .. 1 (white) of a part of a picture; null when it can't be read
      try {
        const c = U().createCanvas(8, 8), g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(source, sx, sy, sw, sh, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
        return n ? sum / n / 255 : null;
      } catch (e) { return null; }
    }

    function drawStamp(ctx, env, arr) {
      const s = arr.stamp, sc = env.scale, k = arr.s, sw = s.w / k, sh = s.h / k; // drawn in full-size units, then scaled by k
      const tmp = canvasOf(s.w * sc, s.h * sc), x = tmp.getContext("2d");
      x.scale(tmp.width / sw, tmp.height / sh);
      x.fillStyle = "#fbf6ea"; x.fillRect(0, 0, sw, sh);
      // the perforated edge: half circles bitten out all the way round
      x.globalCompositeOperation = "destination-out";
      const nW = Math.round(sw / 11), nH = Math.round(sh / 11), r = 3.6;
      x.fillStyle = "#000";
      for (let i = 0; i < nW; i++) { const px = (i + 0.5) * sw / nW; x.beginPath(); x.arc(px, 0, r, 0, 7); x.fill(); x.beginPath(); x.arc(px, sh, r, 0, 7); x.fill(); }
      for (let i = 0; i < nH; i++) { const py = (i + 0.5) * sh / nH; x.beginPath(); x.arc(0, py, r, 0, 7); x.fill(); x.beginPath(); x.arc(sw, py, r, 0, 7); x.fill(); }
      x.globalCompositeOperation = "source-over";
      // a tiny crop of their own sky
      const m = 11, pw = sw - 2 * m, ph = pw;
      x.save(); x.beginPath(); x.rect(m, m, pw, ph); x.clip();
      x.fillStyle = "#9db9d6"; x.fillRect(m, m, pw, ph);
      const th = thumbOf(env);
      if (th) { x.imageSmoothingQuality = "high"; x.drawImage(th.img, th.sx, th.sy, th.side, th.side, m, m, pw, ph); }
      x.fillStyle = "rgba(255,225,170,.10)"; x.fillRect(m, m, pw, ph);
      grain(x, m, m, pw, ph, "overlay", 0.12);
      x.restore();
      x.strokeStyle = "rgba(44,62,92,.5)"; x.lineWidth = 1; x.strokeRect(m - 0.5, m - 0.5, pw + 1, ph + 1);
      // LOOK UP in small caps
      x.fillStyle = POSTMARK; x.textBaseline = "alphabetic";
      const fs = 12.5, label = "LOOK UP", ls = 3;
      x.font = "700 " + fs + "px " + SANS;
      let tw = 0; for (let i = 0; i < label.length; i++) tw += env.measure(x.font, label[i]) + ls; tw -= ls;
      let tx = (sw - tw) / 2;
      for (let i = 0; i < label.length; i++) { x.fillText(label[i], tx, m + ph + (sh - m - ph) / 2 + fs * 0.36 + 1); tx += env.measure(x.font, label[i]) + ls; }
      grain(x, 0, 0, sw, sh, "multiply", 0.10);
      // onto the piece, a little tilted, with its own soft shadow
      ctx.save();
      ctx.translate(s.cx, s.cy); ctx.rotate(s.rot);
      ctx.shadowColor = "rgba(30,20,10,.38)"; ctx.shadowBlur = 8; ctx.shadowOffsetX = 2 * k; ctx.shadowOffsetY = 3 * k;
      ctx.drawImage(tmp, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }

    function arcText(ctx, env, text, radius, centreAngle, fs, top, font) {
      // top: glyph tops point outwards (the city); otherwise the text reads along the bottom (the date)
      const ls = fs * 0.14;
      const ws = [];
      let total = 0;
      for (let i = 0; i < text.length; i++) { const w = env.measure(font, text[i]); ws.push(w); total += w + ls; }
      total -= ls;
      const span = total / radius;
      ctx.save();
      ctx.font = font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      let a = top ? centreAngle - span / 2 : centreAngle + span / 2;
      for (let i = 0; i < text.length; i++) {
        const w = ws[i], da = (w + ls) / radius;
        const mid = top ? a + (w / 2) / radius : a - (w / 2) / radius;
        ctx.save();
        ctx.translate(radius * Math.cos(mid), radius * Math.sin(mid));
        ctx.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
        ctx.fillText(text[i], -w / 2, 0);
        ctx.restore();
        a = top ? a + da : a - da;
      }
      ctx.restore();
    }

    function fitArc(env, text, radius, maxSpan, fs, font) {
      // the biggest size (down to about half) at which the text fits the arc, else cut with an ellipsis
      const fr = LU.words.fit(function (t, s) {
        const f = "700 " + s + "px " + SANS;
        let w = 0; for (let i = 0; i < t.length; i++) w += env.measure(f, t[i]) + s * 0.14;
        return w - s * 0.14;
      }, text, maxSpan * radius, fs, { minRatio: 0.55, maxLines: 1 });
      return { text: fr.lines[0] || "", size: fr.size };
    }

    // the sky under the postmark, 0 (black) .. 1 (white); 0.7 when it can't be read (no canvas)
    function skyLuma(env, cx, cy, R) {
      try {
        const ph = env.photoC, lay = env.lay;
        if (!ph || !lay || !ph.width) return 0.7;
        const kx = ph.width / lay.w, ky = ph.height / lay.h;
        const c = U().createCanvas(10, 10), g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(ph, (cx - R * 0.8 - lay.x) * kx, (cy - R * 0.8 - lay.y) * ky, 1.6 * R * kx, 1.6 * R * ky, 0, 0, 10, 10);
        const d = g.getImageData(0, 0, 10, 10).data;
        let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
        return n ? sum / n / 255 : 0.7;
      } catch (e) { return 0.7; }
    }

    function postmarkSpec(env) {
      const arr = arrOf(env), p = arr.pm, R = p.R, dir = p.dir, st = arr.stamp;
      const minX = Math.min(-R, dir < 0 ? -(0.9 * R + p.len) : -R) - 8, maxX = Math.max(R, dir > 0 ? 0.9 * R + p.len : R) + 8;
      const bounds = { x: minX, y: -R - 8, w: maxX - minX, h: 2 * R + 16 };
      const info = env.info;
      // The ink colour depends on what lies under it: navy on a light sky, light cream with a thin dark halo on a dark one.
      // The stamp is its own little piece of paper: its cream border always takes navy, its picture takes whatever reads on it.
      const dark = skyLuma(env, p.cx, p.cy, R) < 0.5;
      let thumbDark = dark;
      const th = thumbOf(env);
      if (th) { const l = meanLuma(th.img, th.sx, th.sy, th.side, th.side); if (l !== null) thumbDark = l < 0.5; }
      // a rectangle of the stamp (x0..x1, y0..y1 from its centre, card units) in the postmark's own coordinates
      function stampRect(x0, y0, x1, y1) {
        return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(function (c) {
          const X = st.cx + c[0] * Math.cos(st.rot) - c[1] * Math.sin(st.rot) - p.cx, Y = st.cy + c[0] * Math.sin(st.rot) + c[1] * Math.cos(st.rot) - p.cy;
          return [X * Math.cos(-p.rot) - Y * Math.sin(-p.rot), X * Math.sin(-p.rot) + Y * Math.cos(-p.rot)];
        });
      }
      const mm = 11 * arr.s; // the picture's inset in the stamp
      const polyAll = stampRect(-st.w / 2 + 1, -st.h / 2 + 1, st.w / 2 - 1, st.h / 2 - 1);
      const polyPic = stampRect(-st.w / 2 + mm, -st.h / 2 + mm, st.w / 2 - mm, -st.h / 2 + mm + (st.w - 2 * mm));
      function polyPath(ctx, poly) { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }

      function ink(ctx, color, halo) {
        const rnd = U().mulberry32(20261006 + Math.round(env.ms / 60000));
        const rgb = U().hexToRgb(color);
        ctx.save();
        ctx.fillStyle = color; ctx.strokeStyle = color;
        if (halo) { ctx.shadowColor = "rgba(10,16,30,.75)"; ctx.shadowBlur = 2.6 * env.scale; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
        // double ring
        ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.arc(0, 0, R * 0.97, 0, 7); ctx.stroke();
        ctx.lineWidth = R * 0.022; ctx.beginPath(); ctx.arc(0, 0, R * 0.88, 0, 7); ctx.stroke();
        ctx.lineWidth = R * 0.02; ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, 7); ctx.stroke();
        // city around the top, date around the bottom
        const mid = R * 0.75;
        const fs0 = R * 0.168, span = 170 * DEG; // the arcs may use up to 170 degrees before the text shrinks (more would hit the dots and the other arc)
        const city = fitArc(env, cityOf(env).toUpperCase(), mid, span, fs0);
        const date = fitArc(env, info.date.toUpperCase(), mid, span, fs0);
        const cap = 0.72;
        arcText(ctx, env, city.text, mid - city.size * cap / 2, -Math.PI / 2, city.size, true, "700 " + city.size + "px " + SANS);
        arcText(ctx, env, date.text, mid + date.size * cap / 2, Math.PI / 2, date.size, false, "700 " + date.size + "px " + SANS);
        // a dot at each end of the arcs
        ctx.beginPath(); ctx.arc(-mid, 0, R * 0.032, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(mid, 0, R * 0.032, 0, 7); ctx.fill();
        // the time and the moon in the middle
        ctx.lineWidth = R * 0.018;
        const rx = R * 0.5;
        ctx.beginPath(); ctx.moveTo(-rx, -R * 0.3); ctx.lineTo(rx, -R * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-rx, R * 0.17); ctx.lineTo(rx, R * 0.17); ctx.stroke();
        const tf = LU.words.fit(function (t, s) { return env.measure("700 " + s + "px " + SANS, t); }, info.time.toUpperCase(), R * 0.92, R * 0.27, { minRatio: 0.5, maxLines: 1 });
        ctx.font = "700 " + tf.size + "px " + SANS; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText(tf.lines[0] || "", 0, -R * 0.065 + tf.size * 0.36);
        LU.moon.draw(ctx, 0, R * 0.395, R * 0.24, env.ms, color);
        // wavy cancellation lines running towards the nearer card edge (across the stamp)
        if (p.len > 3) {
          for (let i = 0; i < 4; i++) {
            const y0 = p.ly + (i - 1.5) * R * 0.15, amp = R * 0.035, wl = R * 0.36, ph = rnd() * 6.28;
            // each line starts at the ring's outer edge
            const x0 = dir * Math.sqrt(Math.max(0, Math.pow(R * 0.97, 2) - y0 * y0)), x1 = x0 + dir * p.len;
            const gr = ctx.createLinearGradient(x0, 0, x1, 0);
            gr.addColorStop(0, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",1)");
            gr.addColorStop(0.7, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",.9)");
            gr.addColorStop(1, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",.25)");
            ctx.strokeStyle = gr; ctx.lineWidth = R * 0.024; ctx.lineCap = "round";
            ctx.beginPath();
            for (let d = 0; d <= p.len; d += 3) {
              const x = x0 + dir * d, y = y0 + amp * Math.sin(d / wl * 6.283 + ph);
              if (d === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        } else { for (let i = 0; i < 4; i++) rnd(); }
        ctx.restore();
        // ink unevenness: tiny bare spots, a few faint patches, a lighter side
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        const spread = R + p.len * 0.5, shift = dir * p.len * 0.5;
        for (let i = 0; i < 260; i++) {
          const x = shift + (rnd() * 2 - 1) * spread, y = (rnd() * 2 - 1) * R;
          ctx.fillStyle = "rgba(0,0,0," + (0.35 + 0.6 * rnd()).toFixed(2) + ")";
          ctx.beginPath(); ctx.arc(x, y, 0.5 + rnd() * 1.6, 0, 7); ctx.fill();
        }
        for (let i = 0; i < 7; i++) {
          const x = (rnd() * 2 - 1) * R * 0.9, y = (rnd() * 2 - 1) * R * 0.9, r = R * (0.12 + 0.2 * rnd());
          const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, "rgba(0,0,0," + (0.18 + 0.2 * rnd()).toFixed(2) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        const lg = ctx.createLinearGradient(-R, R * 0.4, R * 0.8, -R * 0.4);
        lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0," + (halo ? 0.12 : 0.28) + ")");
        ctx.fillStyle = lg; ctx.fillRect(-R - 4, -R - 4, 2 * R + 8, 2 * R + 8);
        ctx.restore();
      }

      return {
        cx: p.cx, cy: p.cy, rot: p.rot, bounds: bounds, dark: dark || thumbDark, skyDark: dark,
        draw: function (ctx) {
          if (!dark && !thumbDark) { ink(ctx, POSTMARK, false); return; }
          // outside the stamp (the sky)
          ctx.save(); ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h); polyPath(ctx, polyAll); ctx.clip("evenodd");
          ink(ctx, dark ? CREAM_INK : POSTMARK, dark);
          ctx.restore();
          // the stamp's cream border
          ctx.save(); ctx.beginPath(); polyPath(ctx, polyAll); polyPath(ctx, polyPic); ctx.clip("evenodd");
          ink(ctx, POSTMARK, false);
          ctx.restore();
          // the stamp's little picture
          ctx.save(); ctx.beginPath(); polyPath(ctx, polyPic); ctx.clip();
          ink(ctx, thumbDark ? CREAM_INK : POSTMARK, thumbDark);
          ctx.restore();
        }
      };
    }

    return {
      id: "postcard",
      geo: geo,
      arrange: arrange,
      background: function (ctx, format) { deskBackground(ctx, format, "#eee5d4", "rgba(255,251,242,.75)", "rgba(160,132,92,.30)"); },
      base: function (ctx, format) {
        const g = geo(format), c = g.card, story = format === "story";
        // a second card underneath, peeking out
        ctx.save(); ctx.translate(g.cx + (story ? 20 : 13), g.cy + (story ? 15 : 12)); ctx.rotate((story ? 3.2 : 2.6) * DEG);
        pieceShadowCard(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 7, "#f2e8d3", 26, 8, 0.28);
        ctx.restore();
        // the card itself, on warm white paper
        pieceShadowCard(ctx, c.x, c.y, c.w, c.h, 7, "#fffdf8", 42, 17, 0.36);
        ctx.save();
        rr(ctx, c.x, c.y, c.w, c.h, 7); ctx.clip();
        const pg = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
        pg.addColorStop(0, "rgba(255,255,255,0)"); pg.addColorStop(1, "rgba(212,196,158,.20)");
        ctx.fillStyle = pg; ctx.fillRect(c.x, c.y, c.w, c.h);
        grain(ctx, c.x, c.y, c.w, c.h, "multiply", 0.06);
        ctx.restore();
        ctx.strokeStyle = "rgba(120,100,70,.22)"; ctx.lineWidth = 1.2; rr(ctx, c.x + 0.6, c.y + 0.6, c.w - 1.2, c.h - 1.2, 7); ctx.stroke();
      },
      over: function (ctx, format, env) {
        const g = geo(format), w = g.win;
        ctx.save();
        ctx.strokeStyle = "rgba(50,40,25,.28)"; ctx.lineWidth = 1.4; ctx.strokeRect(w.x - 0.7, w.y - 0.7, w.w + 1.4, w.h + 1.4);
        ctx.restore();
        drawStamp(ctx, env, arrOf(env));
      },
      text: function (env) {
        const g = geo(env.format), win = g.win, story = env.format === "story";
        const sy = win.y + win.h, x0 = win.x + 10, x1 = win.x + win.w - 10;
        const said = saidOr(env, "Look up."), to = toOf(env);
        const blocks = [];
        const baseRow = sy + g.strip - 30;
        const dateB = block(env, { kind: "fade", text: env.info.line, family: SERIF, style: "italic", weight: 500, size: story ? 25 : 23,
          maxW: win.w * 0.52, maxLines: 1, minRatio: 0.7, align: "right", x: x1, y: baseRow, color: "#6d6a63", moonColor: "#3d3a34", moon: true });
        const toB = to ? block(env, { text: to, family: HAND, weight: 600, size: story ? 44 : 40, maxW: Math.max(120, (dateB ? dateB.x0 : x1) - x0 - 20),
          maxLines: 1, minRatio: 0.6, x: x0, y: baseRow, color: "#4d6089" }) : null;
        const rowReserve = to ? (story ? 52 : 48) : 34;
        const saidB = said ? block(env, { text: said, family: HAND, weight: 600, size: story ? 68 : 62, maxW: x1 - x0, maxH: g.strip - 16 - rowReserve,
          x: x0, top: to ? sy + 8 : undefined, vcenter: to ? undefined : sy + (g.strip - 12 - rowReserve) / 2 + 10, color: INK }) : null;
        [saidB, toB, dateB].forEach(function (b) { if (b) blocks.push(b); });
        return { blocks: blocks };
      },
      postmark: postmarkSpec,
      mark: function (ctx, format) {
        const story = format === "story";
        mark(ctx, story ? 990 : 1020, story ? 1526 : 1044, story ? 26 : 22, "#4f4232", null, 0.66);
      }
    };
  })();

  // =====================================================================================
  // POLAROID (adapted from Underline)
  // =====================================================================================
  const polaroid = (function () {
    function geo(format) {
      const story = format === "story";
      const side = 46, strip = 152;
      const fw = story ? 850 : 790;
      const pw = fw - 2 * side, ph = Math.round(story ? pw * 1.2 : pw * 0.93);
      const fh = side + ph + strip;
      const cx = 540, cy = story ? 880 : 508;
      const f = { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh };
      return { W: 1080, H: story ? 1920 : 1080, cx: cx, cy: cy, tilt: -2 * DEG, side: side, strip: strip, frame: f,
        win: { x: f.x + side, y: f.y + side, w: pw, h: ph }, lineW: 5.94, focusY: 0.5 };
    }
    return {
      id: "polaroid",
      geo: geo,
      background: function (ctx, format) {
        const b = box(format);
        ctx.fillStyle = "#e7e1d5"; ctx.fillRect(0, 0, b.W, b.H);
        const g = ctx.createRadialGradient(b.W / 2, b.H * 0.45, 80, b.W / 2, b.H / 2, b.H * 0.8);
        g.addColorStop(0, "rgba(255,252,244,.7)"); g.addColorStop(1, "rgba(150,135,110,.28)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, b.W, b.H);
        grain(ctx, 0, 0, b.W, b.H, "multiply", 0.06);
      },
      base: function (ctx, format) {
        const g = geo(format), f = g.frame;
        ctx.save();
        ctx.shadowColor = "rgba(50,35,15,.34)"; ctx.shadowBlur = 42; ctx.shadowOffsetY = 18; ctx.shadowOffsetX = 4;
        ctx.fillStyle = "#fdfcf8"; rr(ctx, f.x, f.y, f.w, f.h, 6); ctx.fill();
        ctx.restore();
        const pg = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
        pg.addColorStop(0, "rgba(255,255,255,0)"); pg.addColorStop(1, "rgba(200,185,150,.16)");
        ctx.fillStyle = pg; rr(ctx, f.x, f.y, f.w, f.h, 6); ctx.fill();
        ctx.save(); rr(ctx, f.x, f.y, f.w, f.h, 6); ctx.clip(); grain(ctx, f.x, f.y, f.w, f.h, "multiply", 0.05); ctx.restore();
      },
      over: function (ctx, format) {
        const g = geo(format), p = g.win; // the picture sits slightly sunk into the frame
        ctx.save();
        const sh = ctx.createLinearGradient(0, p.y, 0, p.y + 18);
        sh.addColorStop(0, "rgba(0,0,0,.16)"); sh.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sh; ctx.fillRect(p.x, p.y, p.w, 18);
        ctx.strokeStyle = "rgba(40,30,15,.22)"; ctx.lineWidth = 1.2; ctx.strokeRect(p.x - 0.6, p.y - 0.6, p.w + 1.2, p.h + 1.2);
        ctx.restore();
      },
      text: function (env) {
        const g = geo(env.format), p = g.win, story = env.format === "story";
        const y0 = p.y + p.h, x0 = p.x + 12, x1 = p.x + p.w - 10;
        const said = saidOr(env, "Look up."), to = toOf(env);
        const blocks = [];
        const rightW = p.w * 0.4;
        const cityB = block(env, { kind: "fade", text: cityOf(env), family: SERIF, style: "italic", weight: 500, size: story ? 25 : 23, maxW: rightW, maxLines: 1,
          minRatio: 0.6, align: "right", x: x1, y: y0 + g.strip * 0.43, color: "#5f5d57" });
        const dateB = block(env, { kind: "fade", text: env.info.line, family: SERIF, style: "italic", weight: 500, size: story ? 22 : 20, maxW: rightW, maxLines: 1,
          minRatio: 0.6, align: "right", x: x1, y: y0 + g.strip * 0.43 + 30, color: "#77746c", moonColor: "#3d3a34", moon: true });
        const rx0 = Math.min(cityB ? cityB.x0 : x1, dateB ? dateB.x0 : x1);
        const leftW = Math.max(160, rx0 - x0 - 24);
        const toB = to ? block(env, { text: to, family: HAND, weight: 600, size: story ? 42 : 38, maxW: leftW, maxLines: 1, minRatio: 0.6, x: x0, y: y0 + g.strip - 30, color: "#4d6089" }) : null;
        const saidB = said ? block(env, { text: said, family: HAND, weight: 600, size: story ? 66 : 60, maxW: leftW, maxH: g.strip - 22 - (to ? 46 : 0),
          x: x0, top: to ? y0 + 12 : undefined, vcenter: to ? undefined : y0 + g.strip / 2 + 2, color: INK }) : null;
        [saidB, toB, cityB, dateB].forEach(function (b) { if (b) blocks.push(b); });
        return { blocks: blocks };
      },
      mark: function (ctx, format) {
        const story = format === "story";
        mark(ctx, story ? 990 : 1020, story ? 1526 : 1044, story ? 26 : 22, "#4f4739", null, 0.66);
      }
    };
  })();

  // =====================================================================================
  // FILM (adapted from Underline)
  // =====================================================================================
  const film = (function () {
    const DARK = "#14100b", CREAM = "#f3e7cf", WARM = "#f8d9a8";
    function geo(format) {
      if (format === "story") {
        return { W: 1080, H: 1920, cx: 540, cy: 960, tilt: 0, win: { x: 0, y: 0, w: 1080, h: 1920 }, strip: null, lineW: 5.94, focusY: 0.5,
          target: { x: 90, y: 270, w: 900, h: 1100 } }; // the drawing and its padding stay in the safe width, above the words
      }
      const stripH = 164; // tall enough for the words, the details line (two lines when it is long) and the made-with mark
      return { W: 1080, H: 1080, cx: 540, cy: 540, tilt: 0, win: { x: 0, y: 0, w: 1080, h: 1080 - stripH }, strip: { y: 1080 - stripH, h: stripH }, lineW: 5.94, focusY: 0.5 };
    }
    return {
      id: "film",
      geo: geo,
      background: function (ctx, format) {
        const b = box(format);
        ctx.fillStyle = DARK; ctx.fillRect(0, 0, b.W, b.H);
      },
      base: function (ctx, format) {
        const g = geo(format);
        if (g.strip) {
          ctx.fillStyle = DARK; ctx.fillRect(0, g.strip.y - 2, 1080, g.strip.h + 2);
          grain(ctx, 0, g.strip.y, 1080, g.strip.h, "screen", 0.05);
        }
      },
      // The film look is gentle: warm fade, a soft corner darkening, one light leak and fine grain. How much of it is applied
      // follows the photo (k, 0..1): a photo that is already warm (sunset) or dark gets much less, so it never turns brown.
      grade: function (ctx, w, h, format, env) {
        const sky = env && env.sky, st = sky && sky.stats, tone = sky && sky.tone;
        let k = tone === "sunset" ? 0.4 : (tone === "dark" ? 0.12 : (tone === "grey" ? 0.8 : 1));
        if (st && st.median >= 0) k *= clamp(0.45 + 1.1 * st.median, 0.45, 1); // darker photos get less
        ctx.save();
        // warm fade: slightly lifted blacks, a little warmth in the highlights
        ctx.globalCompositeOperation = "lighten"; ctx.globalAlpha = 0.6 * k; ctx.fillStyle = "#2a2118"; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.3 * k; ctx.fillStyle = "#ffb55c"; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        // soft corner darkening
        ctx.globalCompositeOperation = "multiply";
        ctx.save();
        ctx.translate(w / 2, h / 2); ctx.scale(w * 0.5, h * 0.5);
        let lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.42);
        for (let i = 0; i <= 12; i++) {
          const t = i / 12, e = Math.max(0, (t - 0.5) / 0.5), kk = e * e * (3 - 2 * e), q = kk * (0.3 + 0.2 * k);
          lg.addColorStop(t, "rgba(" + Math.round(255 - 110 * q) + "," + Math.round(255 - 130 * q) + "," + Math.round(255 - 150 * q) + ",1)");
        }
        ctx.fillStyle = lg; ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
        // one gentle warm light leak from the top-right corner
        ctx.globalCompositeOperation = "screen";
        ctx.save();
        ctx.translate(w, 0); ctx.scale(w * 0.8, Math.min(h * 0.46, w * 0.5));
        lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        softStops(lg, "255,130,60", 0.36 * k, 12);
        ctx.fillStyle = lg; ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
        ctx.save();
        ctx.translate(w, h * 0.3); ctx.scale(w * 0.2, h * 0.4);
        lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        softStops(lg, "255,80,55", 0.12 * k, 10);
        ctx.fillStyle = lg; ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
        ctx.globalCompositeOperation = "source-over";
        grain(ctx, 0, 0, w, h, "overlay", 0.085);   // fine film grain
        ctx.restore();
      },
      over: function (ctx, format) {
        if (format === "story") { // the film base fades in under the words, inside the safe zone
          const gr = ctx.createLinearGradient(0, 1230, 0, 1920);
          gr.addColorStop(0, "rgba(18,14,10,0)"); gr.addColorStop(0.45, "rgba(18,14,10,.52)"); gr.addColorStop(1, "rgba(18,14,10,.8)");
          ctx.fillStyle = gr; ctx.fillRect(0, 1230, 1080, 690);
        }
      },
      text: function (env) {
        const story = env.format === "story", g = geo(env.format);
        const x0 = story ? 90 : 60, x1 = story ? 990 : 1020;
        const yA = story ? 1428 : g.strip.y + 64, yB = story ? 1474 : g.strip.y + 106;
        const yStamp = story ? 1440 : g.strip.y + 60;
        const stampH = story ? 36 : 30, stampStr = env.info.stamp;
        const stampW = sevenSegWidth(stampStr, stampH);
        // the words stop short of the date stamp (they shrink to 70%, then wrap to two lines); the details line sits below the stamp
        const wordsW = x1 - stampW - 34 - x0;
        const detailW = story ? x1 - x0 - 20 : x1 - x0 - 370;
        const sh = story ? { color: "rgba(0,0,0,.5)", blur: 6, dy: 1 } : null;
        const said = saidOf(env), to = toOf(env);
        const blocks = [];
        const saidB = said ? block(env, { text: said, family: HAND, weight: 600, size: story ? 60 : 52, maxW: wordsW, maxH: story ? 100 : 66,
          x: x0, y: yA, color: WARM, shadow: sh }) : null;
        const partsB = [to, cityOf(env), env.info.line].filter(Boolean).join(" · ");
        // the details line is never smaller than 24 px (story) / 20 px (square): it wraps to two lines first
        // (two lines are set at 85% of the size, so the sizes below give 24.6 and 20.4 px)
        const dSize = story ? 29 : 24;
        const dateB = block(env, { kind: "fade", text: partsB, family: SERIF, style: "italic", weight: 500, size: dSize, maxW: detailW, maxLines: 2,
          minRatio: (story ? 24 : 20) / dSize, lineRatio: 1.15, x: x0, y: yB, color: CREAM, moon: true, shadow: sh });
        let lift = 0;
        if (story && dateB && dateB.lines.length > 1) { // two detail lines would reach the made-with mark: everything moves up a line
          lift = (dateB.lines.length - 1) * dateB.size * 1.15;
          dateB.lines.forEach(function (l) { l.y -= lift; });
          dateB.top -= lift; dateB.bottom -= lift;
        }
        // when the words are two lines, they sit higher
        const up = saidB && saidB.lines.length > 1 ? (saidB.lines.length - 1) * saidB.size * 1.1 : 0;
        if (saidB) {
          saidB.lines.forEach(function (l) { l.y -= up + lift; });
          saidB.top -= up + lift; saidB.bottom -= up + lift;
        }
        const stamp = {
          kind: "fade", lines: [], x0: x1 - stampW, x1: x1, top: 0, bottom: 0,
          custom: function (ctx) { sevenSeg(ctx, stampStr, x1, yStamp - lift, stampH, "#ff8a1f"); }
        };
        [saidB, dateB, stamp].forEach(function (b) { if (b) blocks.push(b); });
        return { blocks: blocks };
      },
      mark: function (ctx, format) {
        const story = format === "story";
        mark(ctx, story ? 990 : 1020, story ? 1526 : 1056 - 4, story ? 26 : 22, CREAM, story ? "rgba(0,0,0,.45)" : null, 0.66);
      }
    };
  })();

  // =====================================================================================
  // LETTER
  // =====================================================================================
  const letter = (function () {
    function geo(format) {
      const story = format === "story";
      const sheet = story ? { x: 140, y: 300, w: 800, h: 1190 } : { x: 150, y: 40, w: 780, h: 1000 };
      const pad = story ? 50 : 48;
      const win = story ? { x: sheet.x + pad, y: sheet.y + 66, w: sheet.w - 2 * pad, h: 690 } : { x: sheet.x + pad, y: sheet.y + 64, w: sheet.w - 2 * pad, h: 470 };
      const pitch = story ? 62 : 58;
      const r0 = win.y + win.h + (story ? 76 : 72); // first ruled line under the photo
      return { W: 1080, H: story ? 1920 : 1080, cx: sheet.x + sheet.w / 2, cy: sheet.y + sheet.h / 2, tilt: -1 * DEG, sheet: sheet, win: win,
        pitch: pitch, r0: r0, lineW: 5.94, focusY: 0.5 };
    }
    return {
      id: "letter",
      geo: geo,
      background: function (ctx, format) { deskBackground(ctx, format, "#e6dcc8", "rgba(255,249,236,.6)", "rgba(140,112,72,.32)"); },
      base: function (ctx, format) {
        const g = geo(format), s = g.sheet;
        pieceShadowCard(ctx, s.x, s.y, s.w, s.h, 4, "#fbf6e8", 40, 15, 0.34);
        ctx.save();
        rr(ctx, s.x, s.y, s.w, s.h, 4); ctx.clip();
        const pg = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
        pg.addColorStop(0, "rgba(255,255,255,.4)"); pg.addColorStop(1, "rgba(214,196,150,.22)");
        ctx.fillStyle = pg; ctx.fillRect(s.x, s.y, s.w, s.h);
        // faint ruled lines, and a pale margin line
        ctx.strokeStyle = "rgba(96,130,170,.26)"; ctx.lineWidth = 1.4;
        for (let y = g.r0 - g.pitch * Math.floor((g.r0 - s.y - 30) / g.pitch); y < s.y + s.h - 36; y += g.pitch) {
          ctx.beginPath(); ctx.moveTo(s.x + 18, y + 5); ctx.lineTo(s.x + s.w - 18, y + 5); ctx.stroke();
        }
        ctx.strokeStyle = "rgba(210,110,110,.28)"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(s.x + 30, s.y); ctx.lineTo(s.x + 30, s.y + s.h); ctx.stroke();
        // a very soft fold across the middle
        const fy = s.y + s.h * 0.52, fg = ctx.createLinearGradient(0, fy - 14, 0, fy + 14);
        fg.addColorStop(0, "rgba(120,100,60,0)"); fg.addColorStop(0.5, "rgba(120,100,60,.07)"); fg.addColorStop(1, "rgba(255,255,255,.10)");
        ctx.fillStyle = fg; ctx.fillRect(s.x, fy - 14, s.w, 28);
        grain(ctx, s.x, s.y, s.w, s.h, "multiply", 0.09);
        ctx.restore();
        ctx.strokeStyle = "rgba(120,100,70,.18)"; ctx.lineWidth = 1.2; rr(ctx, s.x + 0.6, s.y + 0.6, s.w - 1.2, s.h - 1.2, 4); ctx.stroke();
      },
      over: function (ctx, format) {
        const g = geo(format), w = g.win;
        ctx.save();
        ctx.strokeStyle = "rgba(50,40,25,.25)"; ctx.lineWidth = 1.3; ctx.strokeRect(w.x - 0.6, w.y - 0.6, w.w + 1.2, w.h + 1.2);
        ctx.restore();
        washi(ctx, w.x + w.w / 2 + 6, w.y + 2, 2 * DEG, 210, 52, "244,214,122");
      },
      text: function (env) {
        const g = geo(env.format), story = env.format === "story", s = g.sheet;
        const x0 = s.x + 54, maxW = s.w - 54 - 40;
        const said = saidOr(env, "Look up."), to = (env.settings.to || "").trim();
        const blocks = [];
        let r = 0;
        if (to) {
          const b = block(env, { text: "Dear " + to + ",", family: HAND, weight: 600, size: story ? 54 : 52, maxW: maxW, maxLines: 1, minRatio: 0.6, x: x0, y: g.r0 + r * g.pitch, color: INK });
          if (b) blocks.push(b);
          r += 2;
        } else r += 1;
        if (said) {
          const b = block(env, { text: said, family: HAND, weight: 600, size: story ? 70 : 68, maxW: maxW, lineH: g.pitch, x: x0, y: g.r0 + r * g.pitch, color: "#233459" });
          if (b) { blocks.push(b); r += b.lines.length + 1; }
        } else r += 1;
        const city = (env.settings.city || "").trim();
        const sky = (city ? "the sky over " + city : "the sky today") + ", " + env.info.line;
        const yS = g.r0 + r * g.pitch, limit = s.y + s.h - 64;           // the last line must stay on the sheet
        const rows = Math.max(1, Math.min(2, Math.floor((limit - yS) / g.pitch) + 1));
        const b = block(env, { kind: "fade", text: sky, family: HAND, weight: 600, size: story ? 40 : 38, maxW: maxW, maxLines: rows, lineH: g.pitch, x: x0, y: yS, color: "#4d6089", moonColor: "#2c406e", moon: true });
        if (b) blocks.push(b);
        return { blocks: blocks };
      },
      mark: function (ctx, format) {
        const g = geo(format), s = g.sheet, story = format === "story";
        mark(ctx, s.x + s.w - 34, s.y + s.h - 28, story ? 26 : 22, "#4f4232", null, 0.62);
      }
    };
  })();

  // =====================================================================================
  // JUST THE SKY
  // =====================================================================================
  const plain = (function () {
    function geo(format) {
      const story = format === "story";
      return { W: 1080, H: story ? 1920 : 1080, cx: 540, cy: story ? 960 : 540, tilt: 0, win: { x: 0, y: 0, w: 1080, h: story ? 1920 : 1080 },
        lineW: 5.94, focusY: 0.5, target: story ? { x: 90, y: 270, w: 900, h: 1100 } : undefined };
    }
    return {
      id: "plain",
      geo: geo,
      background: function (ctx, format) { const b = box(format); ctx.fillStyle = "#101826"; ctx.fillRect(0, 0, b.W, b.H); },
      base: function () { /* nothing: the sky is the card */ },
      over: function (ctx, format) {
        const story = format === "story", H = story ? 1920 : 1080, y0 = story ? 1180 : 640;
        const gr = ctx.createLinearGradient(0, y0, 0, H);
        gr.addColorStop(0, "rgba(10,16,30,0)"); gr.addColorStop(0.6, "rgba(10,16,30,.34)"); gr.addColorStop(1, "rgba(10,16,30,.58)");
        ctx.fillStyle = gr; ctx.fillRect(0, y0, 1080, H - y0);
      },
      text: function (env) {
        const story = env.format === "story";
        const x0 = story ? 90 : 60, x1 = story ? 990 : 1020;
        const yA = story ? 1424 : 944, yB = story ? 1474 : 992;
        const sh = { color: "rgba(0,0,0,.5)", blur: 8, dx: 0, dy: 1 };
        const said = saidOf(env), to = toOf(env);
        const blocks = [];
        const saidB = said ? block(env, { text: said, family: SERIF, style: "italic", weight: 500, size: story ? 52 : 46, maxW: x1 - x0, maxH: story ? 120 : 100, x: x0, y: yA, color: "#ffffff", shadow: sh }) : null;
        if (saidB && saidB.lines.length > 1) {
          const up = (saidB.lines.length - 1) * saidB.size * 1.1;
          saidB.lines.forEach(function (l) { l.y -= up; });
          saidB.top -= up; saidB.bottom -= up;
        }
        const line = [to, cityOf(env) + " · " + env.info.time].filter(Boolean).join(" · ");
        const dateB = block(env, { kind: "fade", text: line, family: SERIF, style: "normal", weight: 500, size: story ? 27 : 24, maxW: x1 - x0 - (story ? 0 : 0), maxLines: 1, minRatio: 0.6,
          x: x0, y: yB, color: "rgba(255,255,255,.92)", moon: true, shadow: sh });
        [saidB, dateB].forEach(function (b) { if (b) blocks.push(b); });
        return { blocks: blocks };
      },
      mark: function (ctx, format) {
        const story = format === "story";
        mark(ctx, story ? 990 : 1020, story ? 1526 : 1050, story ? 26 : 22, "#ffffff", "rgba(0,0,0,.5)", 0.7);
      }
    };
  })();

  const ALL = { postcard: postcard, polaroid: polaroid, film: film, letter: letter, plain: plain };
  function get(id) { return ALL[id] || ALL.postcard; }

  LU.finishes = {
    get: get, box: box, cropFor: cropFor, plan: plan, layerRect: layerRect, ZOOM: ZOOM, drawBlocks: drawBlocks, block: block, mark: mark,
    HAND: HAND, SERIF: SERIF, SANS: SANS, POSTMARK: POSTMARK, SITE: SITE, _rr: rr
  };
})();
