// Words: the date and time in the phone's own language, file-name slugs, and text fitting (PLAN.md 6.5).
// Plain functions; nothing here touches document/window at load time (loads in Node).
//
//   LU.words.when(ms, opts?) -> { line, date, time, stamp, iso, ms }
//       line  "Tue 6 Oct · 7:42 pm"      date  "Tue 6 Oct"      time  "7:42 pm"
//       stamp "10 06 '26"  (MM DD 'YY, for the film's seven-segment stamp)
//       iso   "2026-10-06" (the LOCAL date; the file name uses it)
//       Uses Intl.DateTimeFormat(undefined, ...) so the phone's language and 12/24-hour style are used
//       (en-GB "Tue 6 Oct · 19:42", de "Di. 6. Okt. · 19:42"). ms of 0 means "now".
//       opts (for tests): { locale, timeZone }
//   LU.words.slug(text) -> string     lower case a-z 0-9 and hyphens, at most 30 characters; may be empty
//                                     (non-Latin names give "")
//   LU.words.fit(measure, text, maxW, size, opts?) -> { size, lines, width, height, lineHeight, ratio }
//       The pure logic of text fitting (no canvas needed): measure(text, size) -> width.
//       Shrinks from `size` down to 70% of it on one line, then wraps to 2 lines (never more), then shrinks again.
//       It NEVER overflows: as a last resort the text is cut with an ellipsis.
//       opts: { minRatio 0.7, lineHeight 1.12 (x size), maxH (px, optional), maxLines 2 }
//   LU.words.fitText(ctx, text, maxW, size, fontOf, opts?) -> the same, measuring with ctx.measureText
//       fontOf(size) returns the CSS font string.
(function () {
  const LU = (globalThis.LU = globalThis.LU || {});

  function two(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- the date and time ----------
  function partsOf(d, timeZone) {
    // en-US is only used to read the numbers back out; the shown text comes from the phone's own locale
    try {
      const f = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timeZone });
      const o = {};
      f.formatToParts(d).forEach(function (p) { if (p.type !== "literal") o[p.type] = p.value; });
      if (o.year && o.month && o.day) return { y: o.year, m: o.month, d: o.day };
    } catch (e) { /* fall through */ }
    return { y: String(d.getFullYear()), m: two(d.getMonth() + 1), d: two(d.getDate()) };
  }

  function when(ms, opts) {
    opts = opts || {};
    if (ms === undefined || ms === null || ms === 0 || !isFinite(ms)) ms = Date.now();
    const d = new Date(+ms);
    const locale = opts.locale, tz = opts.timeZone;
    let date, time;
    try {
      date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
      time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);
    } catch (e) {
      const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const h = d.getHours();
      date = DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
      time = ((h % 12) || 12) + ":" + two(d.getMinutes()) + " " + (h < 12 ? "am" : "pm");
    }
    date = date.replace(/,/g, "").replace(/\s+/g, " ").trim();
    // newer ICU puts a narrow no-break space before AM/PM; the lower-case "pm" matches the plan's example
    time = time.replace(/[  ]/g, " ").replace(/\b(AM|PM)\b/, function (m) { return m.toLowerCase(); }).trim();
    const p = partsOf(d, tz);
    return {
      line: date + " · " + time, date: date, time: time,
      stamp: p.m + " " + p.d + " '" + p.y.slice(-2),
      iso: p.y + "-" + p.m + "-" + p.d,
      ms: +ms
    };
  }

  // ---------- slug ----------
  const MAP = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ð": "d", "þ": "th", "ł": "l", "ı": "i" };
  function slug(s) {
    s = String(s === undefined || s === null ? "" : s);
    try { s = s.normalize("NFKD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* keep as is */ }
    s = s.toLowerCase().replace(/[ßæœøđðþłı]/g, function (c) { return MAP[c]; });
    return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  }

  // ---------- fitting ----------
  function clean(text) { return String(text === undefined || text === null ? "" : text).replace(/\s+/g, " ").trim(); }

  function ellipsize(measure, text, maxW, size) {
    let t = text;
    while (t.length > 1 && measure(t + "…", size) > maxW) t = t.slice(0, -1).replace(/\s+$/, "");
    return t.length ? t + "…" : "…";
  }

  function bestSplit(measure, words, size) {
    if (words.length < 2) return null;
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const w = Math.max(measure(a, size), measure(b, size));
      if (!best || w < best.w) best = { lines: [a, b], w: w };
    }
    return best;
  }

  function fit(measure, text, maxW, size, opts) {
    opts = opts || {};
    const minR = opts.minRatio > 0 ? opts.minRatio : 0.7;
    const lh = opts.lineHeight > 0 ? opts.lineHeight : 1.12;
    const maxH = opts.maxH > 0 ? opts.maxH : Infinity;
    const maxLines = opts.maxLines === undefined ? 2 : opts.maxLines;
    text = clean(text);
    function make(lines, s, w) {
      return { size: s, lines: lines, width: w, height: lines.length * lh * s, lineHeight: lh * s, ratio: s / size };
    }
    if (!text) return make([], size, 0);
    const step = Math.max(0.5, size * 0.01);

    // 1. one line, shrinking down to 70%
    const top = Math.min(size, maxH / lh);
    const lo = Math.min(top, size * minR);
    for (let s = top; s >= lo - 1e-6; s -= step) {
      const w = measure(text, s);
      if (w <= maxW) return make([text], s, w);
    }
    // 2. two lines
    const words = text.split(" ");
    if (maxLines >= 2 && words.length >= 2) {
      const top2 = Math.min(size * 0.85, maxH / (2 * lh));
      for (let s = top2; s >= size * 0.45 - 1e-6; s -= step) {
        const sp = bestSplit(measure, words, s);
        if (sp && sp.w <= maxW) return make(sp.lines, s, sp.w);
      }
    }
    // 3. keep shrinking one line
    const floor = Math.min(top, size * 0.4);
    let s = lo;
    for (; s >= floor - 1e-6; s -= step) {
      const w = measure(text, s);
      if (w <= maxW) return make([text], s, w);
    }
    // 4. cut it
    s = Math.max(1, floor);
    const cut = ellipsize(measure, text, maxW, s);
    return make([cut], s, measure(cut, s));
  }

  function fitText(ctx, text, maxW, size, fontOf, opts) {
    return fit(function (t, s) { ctx.font = fontOf(s); return ctx.measureText(t).width; }, text, maxW, size, opts);
  }

  LU.words = { when: when, slug: slug, fit: fit, fitText: fitText };
})();
