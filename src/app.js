/* Look Up: screens, state and wiring.
   The engine (src/engine/) is used only through the names in PLAN.md section 7.3.
   Flow: photo -> trace the shape -> say what you saw -> pick a look -> save or share. */

// The name in the footer ("More from ...").  (shared-kit/footer/siblings.js, Look Up's own entry dropped)
const MAKER_NAME = "Risheek";

// Every live sibling site. icon is a key of SIB_SVG below.
const SIBLINGS = [
  { name: "Handwriting → Font", url: "https://handwriting-font-converter.vercel.app", blurb: "Type in your own handwriting.", icon: "aa" },
  { name: "Doodle Alive", url: "https://doodle-alive.vercel.app", blurb: "Snap a doodle, watch it come alive.", icon: "doodle" },
  { name: "Underline", url: "https://underline-it.vercel.app", blurb: "Highlight the line you love, without ruining your book.", icon: "underline" }
];

/* ---------- the footer (shared-kit/footer/footer.js, copied) ---------- */

var SIB_SVG = {
  aa: "Aa",
  doodle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 16c2-5 4-5 5-1s3 3 4-2 3-6 4-2 2 5 3 3"/><path d="M19 4l.8 1.8L21.6 6.6 19.8 7.4 19 9.2 18.2 7.4 16.4 6.6 18.2 5.8z"/></svg>',
  underline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 8h14M5 12h10"/><path d="M4 17.5c3-.8 6 .6 9-.2s5-.6 7 .2" stroke-width="3" opacity=".55"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 4.2 4.2 0 0 0 7 18z"/></svg>'
};

function footerEsc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function footerHTML() {
  var cards = SIBLINGS.map(function (s) {
    return '<a class="sib-card" href="' + footerEsc(s.url) + '" target="_blank" rel="noopener">' +
      '<span class="sib-ico" aria-hidden="true">' + (SIB_SVG[s.icon] || "") + "</span>" +
      '<span class="sib-text"><strong>' + footerEsc(s.name) + "</strong><span>" + footerEsc(s.blurb) + "</span></span></a>";
  }).join("");
  return '<footer class="site-footer"><p class="more-from">More from ' + footerEsc(MAKER_NAME) + "</p>" + cards + "</footer>";
}

function fillFooter() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-footer]"), function (el) { el.innerHTML = footerHTML(); });
}

(function () {
  "use strict";

  var W = window;
  var D = document;
  var L = W.LU || {};

  /* ---------- tiny helpers ---------- */

  function $(id) { return D.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
  function dpr() { return Math.min(W.devicePixelRatio || 1, 2); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function warn() { if (W.console && console.warn) console.warn.apply(console, arguments); }
  function buzz() { try { if (W.navigator && W.navigator.vibrate) W.navigator.vibrate(8); } catch (e) { /* ignore */ } }
  function reduceMotion() {
    try { return !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }
  function idsOf(list) {
    return (Array.isArray(list) ? list : []).map(function (x) { return typeof x === "string" ? x : x && x.id; });
  }
  function capital(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clampText(s, n) { return Array.from(String(s || "").replace(/[\r\n]+/g, " ")).slice(0, n).join(""); }
  // curly quotes and a real ellipsis for copy we didn't write ourselves (the engine's messages)
  function typo(s) {
    return String(s == null ? "" : s)
      .replace(/(\w)'(\w)/g, "$1’$2")
      .replace(/(^|[\s(\[])"(?=\S)/g, "$1“")
      .replace(/"/g, "”")
      .replace(/\.\.\./g, "…");
  }

  /* ---------- icons (inline SVG) ---------- */

  var ICONS = {
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    clear: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  /* ---------- the engine must be there ---------- */

  var NEEDED = [
    "PENS", "FINISHES", "DEFAULTS", "END",
    "decode.fileToImageData", "sky.prepare", "trace.finish", "trace.hasClosed",
    "words.when", "sample.load",
    "card.create", "card.startPreview", "card.drawEditor",
    "export.support", "export.makeImage", "export.makeVideo",
    "share.platform", "share.canShare", "share.share", "share.save"
  ];
  function missingParts() {
    return NEEDED.filter(function (path) {
      var o = L;
      var keys = path.split(".");
      for (var i = 0; i < keys.length; i += 1) {
        if (o == null || o[keys[i]] == null) return true;
        o = o[keys[i]];
      }
      return false;
    });
  }
  var missing = missingParts();
  var engineOk = missing.length === 0;
  if (!engineOk) warn("Look Up: engine parts missing:", missing.join(", "));

  /* ---------- address shortcuts (PLAN.md section 7.4) ---------- */

  var Q = new URLSearchParams(location.search);
  var devScreen = Q.get("screen");
  var DEV_FLOWS = ["trace", "words", "look", "making", "done", "frame"];
  var devMode = Q.get("sample") === "1" || (devScreen != null && devScreen !== "");   // dev runs never write to localStorage
  var devT = null;
  if (Q.has("t")) {
    var tt = parseFloat(Q.get("t"));
    if (isFinite(tt)) devT = tt;
  }
  var devFormat = Q.get("format") === "story" ? "story" : "square";

  // Opened inside Instagram, Facebook, TikTok, Snapchat or Line? Those browsers often can't save files.
  // ?inapp=1 forces the tip on; ?inapp=sheet also opens the "saving didn't work" sheet.
  var inappDev = Q.get("inapp");
  var IN_APP = inappDev === "1" || inappDev === "sheet" || (function () {
    try { return /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|\bLine\//.test(W.navigator.userAgent || ""); }
    catch (e) { return false; }
  })();
  var inappDismissed = false;

  /* ---------- remembered on this device: city, last look, pen, glow, hint seen. Nothing else. ---------- */

  var PREF_KEY = "lookup.v1";
  var prefs = {};
  function loadPrefs() {
    if (devMode) return;
    try {
      var raw = W.localStorage.getItem(PREF_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === "object") prefs = o;
      }
    } catch (e) { /* the site works without it */ }
  }
  function savePrefs() {
    if (devMode) return;
    try { W.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  /* ---------- state ---------- */

  var FALLBACK_DEFAULTS = { finish: "postcard", pen: "white", glow: false, said: "", city: "", to: "", when: 0 };

  var S = {
    screen: "landing",
    screenName: "landing",
    settings: null,
    sky: null,
    strokes: [],
    card: null,
    preview: null,
    still: null,            // set when a preview is drawn as one still frame (reduced motion, or the t= shortcut)
    job: 0,                 // bumped whenever the session restarts, so late results can be ignored
    queue: Promise.resolve(),
    photoUrl: null,
    doneUrl: null,
    // the trace
    drag: null,
    pointers: [],
    multi: false,
    drawQueued: false,
    hintOn: false,
    // outputs
    imageFile: null,
    imageToken: 0,
    imageFailed: false,
    imageTimer: 0,
    imagePromise: null,
    videoFile: null,
    videoToken: 0,
    ctrl: null,
    makeState: "making",    // making | ready
    shareFailed: { image: false, video: false },
    returnTo: "look",
    doneKind: "image",
    doneResult: "saved",
    support: null,
    wordsTimer: 0,
    wordsPending: null
  };

  // window.__lookup: kept current for scripts, e.g. LU.export.makeVideo(window.__lookup.card)
  var dbg = {};
  Object.defineProperties(dbg, {
    screen: { enumerable: true, get: function () { return S.screenName; } },
    settings: { enumerable: true, get: function () { return S.settings; } },
    sky: { enumerable: true, get: function () { return S.sky; } },
    strokes: { enumerable: true, get: function () { return S.strokes; } },
    card: { enumerable: true, get: function () { return S.card; } }
  });
  W.__lookup = dbg;

  /* ---------- settings ---------- */

  function validPen(id) { return idsOf(L.PENS).indexOf(id) !== -1 ? id : null; }
  function validFinish(id) { return idsOf(L.FINISHES).indexOf(id) !== -1 ? id : null; }

  function initialSettings() {
    var s = Object.assign({}, FALLBACK_DEFAULTS, L.DEFAULTS || {});
    if (validFinish(prefs.finish)) s.finish = prefs.finish;
    if (typeof prefs.glow === "boolean") s.glow = prefs.glow;
    if (typeof prefs.city === "string") s.city = clampText(prefs.city, 28);
    return s;
  }

  // the address shortcuts (&finish= &pen= &glow= &said= &city= &to= &when=)
  function applyDevSettings(s) {
    if (validFinish(Q.get("finish"))) s.finish = Q.get("finish");
    if (validPen(Q.get("pen"))) s.pen = Q.get("pen");
    if (Q.get("glow") === "0") s.glow = false;
    if (Q.get("glow") === "1") s.glow = true;
    if (Q.has("said")) s.said = clampText(Q.get("said"), 40);
    if (Q.has("city")) s.city = clampText(Q.get("city"), 28);
    if (Q.has("to")) s.to = clampText(Q.get("to"), 20);
    if (Q.has("when")) {
      var w = parseFloat(Q.get("when"));
      if (isFinite(w)) s.when = w;
    }
    return s;
  }

  function hasClosed() {
    try { return !!(S.strokes.length && L.trace.hasClosed(S.strokes)); } catch (e) { return false; }
  }

  // what the card gets: the glow only counts when there is a closed shape
  function cardSettings() {
    var s = Object.assign({}, S.settings);
    s.glow = !!s.glow && hasClosed();
    return s;
  }

  /* ---------- errors ---------- */

  function normalizeError(e) {
    if (e && typeof e === "object") {
      if (typeof e.title === "string" && e.title) {
        return { code: e.code || "unknown", title: typo(e.title), detail: typeof e.detail === "string" ? typo(e.detail) : "" };
      }
      if (e.error && typeof e.error.title === "string") return normalizeError(e.error);
    }
    if (e) warn("Look Up:", e);
    return { code: "unknown", title: "Hmm, that didn’t work.", detail: "Give it another go. A fresh photo sometimes helps." };
  }

  var VIDEO_ERROR = { code: "video-unsupported", title: "This browser can’t make videos.", detail: "You can still save your sky as a picture." };
  var DEV_ERRORS = {
    "error-heic": { code: "heic", title: "Your phone saved this in a format I can’t read.", detail: "Take a screenshot of it and use that." },
    "error-not-image": { code: "not-image", title: "That doesn’t look like a photo.", detail: "Choose a picture (a JPG or PNG), or take a new photo of the sky." },
    "error-video": VIDEO_ERROR
  };

  /* ---------- screens ---------- */

  // the browser's address bar takes the colour of the sky on each screen (where the browser allows it)
  var THEME = {
    landing: "#9cc7f2", working: "#9cc7f2", trace: "#26316b", words: "#ffe6d4", look: "#dacaf8",
    making: "#38458d", done: "#ffe2a0", error: "#dcecfd", broken: "#dcecfd"
  };
  function setThemeColor(name) {
    var m = D.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", THEME[name] || THEME.landing);
  }

  function showScreen(name, dbgName) {
    closeInAppSheet();
    if (S.screen === "landing" && name !== "landing") stopHero();
    qsa(".screen").forEach(function (s) { s.classList.toggle("is-active", s.id === "screen-" + name); });
    S.screen = name;
    S.screenName = dbgName || name;
    D.body.setAttribute("data-screen", S.screenName);
    setThemeColor(name);
    W.scrollTo(0, 0);
    var focusEl = null;
    if (name === "landing") focusEl = qsa(".headline")[0];
    else if (name === "error") focusEl = $("errTitle");
    else if (name === "done") focusEl = $("doneTitle");
    if (focusEl) { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    onViewport();
  }

  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $("toast");
    t.textContent = typo(msg);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 3600);
  }

  function ensureEngine() {
    if (engineOk) return true;
    showScreen("broken");
    return false;
  }

  /* ---------- previews ---------- */

  function stopPreview() {
    if (S.preview) { try { S.preview.stop(); } catch (e) { /* ignore */ } S.preview = null; }
    S.still = null;
  }

  // One still frame (reduced motion, and the t= shortcut)
  function drawStill(canvas, card, format, t) {
    try {
      var w = canvas.clientWidth || 360;
      var h = canvas.clientHeight || (format === "story" ? Math.round(w * 16 / 9) : w);
      var d = dpr();
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
      var ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      card.drawFrame(ctx, t, format, canvas.width / 1080);
    } catch (e) { warn("Look Up: could not draw the frame", e); }
  }
  function redrawStill() {
    var st = S.still;
    if (st && st.card === S.card) drawStill(st.canvas, st.card, st.format, st.t);
  }

  function mountPreview(canvas, card, format) {
    stopPreview();
    if (!card) return;
    try {
      if (devT != null || reduceMotion()) {
        S.still = { canvas: canvas, card: card, format: format, t: devT != null ? devT : L.END };
        drawStill(canvas, card, format, S.still.t);
      } else {
        S.preview = L.card.startPreview(canvas, card, format);
      }
    } catch (e) { warn("Look Up: preview failed", e); }
  }

  /* ---------- 1. landing: the sample postcard playing (Step 1) ---------- */

  var hero = { card: null, preview: null, starting: false, failed: false };

  function stopHero() {
    if (hero.preview) { try { hero.preview.stop(); } catch (e) { /* ignore */ } hero.preview = null; }
    $("heroCard").classList.remove("is-live");
  }

  async function startHero() {
    if (!engineOk || hero.starting || hero.failed || S.screen !== "landing") return;
    hero.starting = true;
    try {
      if (!hero.card) {
        var smp = await L.sample.load();
        var hs = Object.assign({}, FALLBACK_DEFAULTS, L.DEFAULTS || {}, smp.settings || {}, { finish: "postcard", pen: "white", glow: false, when: Date.now() });
        hero.card = await L.card.create(smp.sky, smp.strokes, hs);
      }
      if (S.screen !== "landing") return;
      stopHero();
      var cv = $("heroCanvas");
      if (devT != null || reduceMotion()) drawStill(cv, hero.card, "square", devT != null ? devT : L.END);
      else hero.preview = L.card.startPreview(cv, hero.card, "square");
      $("heroCard").classList.add("is-live");
    } catch (e) {
      hero.failed = true;   // the drawn postcard stays, and the page still works
      warn("Look Up: the sample card is not available", e);
    } finally {
      hero.starting = false;
    }
  }
  function startHeroSoon() {
    var go = function () { startHero(); };
    if ("requestIdleCallback" in W) W.requestIdleCallback(go, { timeout: 1200 });
    else setTimeout(go, 300);
  }

  function goLanding() {
    S.job += 1;
    resetSession(true);
    showScreen("landing");
    startHeroSoon();
  }

  /* ---------- session reset ---------- */

  function releasePhotoUrl() {
    if (S.photoUrl) { try { URL.revokeObjectURL(S.photoUrl); } catch (e) { /* ignore */ } S.photoUrl = null; }
  }
  function releaseDoneUrl() {
    if (S.doneUrl) { try { URL.revokeObjectURL(S.doneUrl); } catch (e) { /* ignore */ } S.doneUrl = null; }
  }

  function resetSession(forNewPhoto) {
    stopPreview();
    stopHero();
    abortVideo();
    invalidateOutputs();
    clearTimeout(S.wordsTimer);
    S.wordsPending = null;
    S.sky = null;
    S.strokes = [];
    S.card = null;
    S.drag = null;
    S.pointers = [];
    S.multi = false;
    S.queue = Promise.resolve();
    S.shareFailed = { image: false, video: false };
    releaseDoneUrl();
    if (forNewPhoto && S.settings) S.settings.said = "";   // the city and the name stay; what you saw doesn't
  }

  /* ---------- photo in (Step 2) ---------- */

  function setWorking(url) {
    var img = $("workImg");
    img.onerror = function () { img.hidden = true; };
    if (url) { img.hidden = false; img.src = url; } else { img.hidden = true; img.removeAttribute("src"); }
  }

  async function handleFile(file) {
    if (!file || !ensureEngine()) return;
    S.job += 1;
    var job = S.job;
    resetSession(true);
    releasePhotoUrl();
    var url = null;
    try { url = URL.createObjectURL(file); S.photoUrl = url; } catch (e) { url = null; }
    setWorking(url);
    showScreen("working");
    S.settings.when = Date.now();   // when the photo came in: this is the time on the card
    try {
      var imageData = await L.decode.fileToImageData(file, { maxSide: 2000 });
      if (job !== S.job) return;
      var sky = await L.sky.prepare(imageData);
      if (job !== S.job) return;
      setSky(sky);
      releasePhotoUrl();
      enterTrace();
    } catch (e) {
      if (job !== S.job) return;
      if (e && e.code === "cancelled") { goLanding(); return; }
      showError(e);
    }
  }

  async function trySample() {
    if (!ensureEngine()) return;
    S.job += 1;
    var job = S.job;
    resetSession(true);
    releasePhotoUrl();
    setWorking(null);
    showScreen("working");
    S.settings.when = Date.now();
    try {
      var smp = await L.sample.load();
      if (job !== S.job) return;
      setSky(smp.sky);   // the sample's preset drawing is for the landing; here you trace your own shape
      enterTrace();
    } catch (e) {
      if (job !== S.job) return;
      showError(e);
    }
  }

  // The sky is in: pick the pen. The person's own choice (this session or remembered) wins over the suggestion.
  function setSky(sky) {
    S.sky = sky;
    S.strokes = [];
    S.settings.pen = validPen(prefs.pen) || validPen(sky && sky.suggestedPen) || "white";
  }

  /* ---------- errors: one friendly message, one button ---------- */

  function showError(err) {
    var e = normalizeError(err);
    stopPreview();
    stopHero();
    releasePhotoUrl();
    $("errTitle").textContent = e.title;
    $("errDetail").textContent = e.detail;
    var btn = $("errBtn");
    var action;
    if (e.code === "not-image" || e.code === "heic" || e.code === "unreadable") {
      btn.textContent = "Choose another photo";
      action = function () { $("galleryInput").click(); };
    } else if (e.code === "video-unsupported" && (S.card || S.imageFile)) {
      btn.textContent = "Save the image instead";
      action = function () { onSave(); };
    } else if (e.code === "export-failed" && S.card) {
      btn.textContent = "Try again";
      action = function () { backToLook(); };
    } else {
      btn.textContent = "Start over";
      action = goLanding;
    }
    btn.onclick = action;
    showScreen("error", "error-" + e.code);
  }

  /* ---------- 2. trace: the magic moment (Step 3, PLAN.md section 6.3) ---------- */

  var STAGE_PAD_X = 0;    // a wide photo runs edge to edge
  var STAGE_PAD_Y = 8;

  function buildPens() {
    var row = $("penRow");
    row.innerHTML = "";
    (L.PENS || []).forEach(function (p) {
      var b = D.createElement("button");
      b.type = "button";
      b.className = "pen";
      b.dataset.id = p.id;
      b.setAttribute("aria-label", capital(p.id) + " pen");
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<i style="--c:' + footerEsc(p.hex) + '"></i>';
      b.addEventListener("click", function () { setPen(p.id); });
      row.appendChild(b);
    });
  }
  function syncPens() {
    qsa("#penRow .pen").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.id === S.settings.pen ? "true" : "false"); });
  }
  function setPen(id) {
    if (!validPen(id) || S.settings.pen === id) return;
    S.settings.pen = id;
    prefs.pen = id;   // picked by the person: remembered, and it beats the suggestion next time
    savePrefs();
    syncPens();
    invalidateOutputs();
    requestDraw();
    var card = S.card;
    if (card) {
      var job = S.job;
      S.queue = S.queue.then(function () { if (job === S.job) return card.update({ pen: id }); })
        .catch(function (e) { warn("Look Up: pen update failed", e); });
    }
  }

  function enterTrace() {
    stopPreview();
    S.drag = null;
    S.pointers = [];
    S.multi = false;
    S.hintOn = S.strokes.length === 0 && !(prefs.hintSeen && !devMode);
    showScreen("trace");
    syncPens();
    $("hint").classList.toggle("is-gone", !S.hintOn);
    $("darkNote").hidden = !(S.sky && S.sky.warning === "dark");
    fadeReset();
    updateTraceUi();
    fitTrace();
  }

  // Size the canvas to its CSS box x devicePixelRatio (cap 2), keeping the photo's shape.
  function fitTrace() {
    if (!S.sky || S.screen !== "trace") return;
    var stage = $("stage");
    var cw = stage.clientWidth - STAGE_PAD_X;
    var ch = stage.clientHeight - STAGE_PAD_Y;
    if (cw < 40 || ch < 40) return;
    var ar = S.sky.width / S.sky.height;
    var w = cw;
    var h = w / ar;
    if (h > ch) { h = ch; w = h * ar; }
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    var wrap = $("skyWrap");
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    wrap.classList.toggle("is-bleed", w >= stage.clientWidth - 1);
    var cv = $("traceCanvas");
    var d = dpr();
    var pw = Math.max(1, Math.round(w * d));
    var ph = Math.max(1, Math.round(h * d));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    drawTraceNow();
  }

  // Every animation frame while the finger is down: the sky, the finished strokes and the live line.
  function drawTraceNow() {
    S.drawQueued = false;
    if (!S.sky || S.screen !== "trace") return;
    try { L.card.drawEditor($("traceCanvas"), S.sky, S.strokes, S.drag ? S.drag.points : null, S.settings.pen); }
    catch (e) { warn("Look Up: could not draw the sky", e); }
  }
  function requestDraw() {
    if (S.drawQueued) return;
    S.drawQueued = true;
    W.requestAnimationFrame(drawTraceNow);
  }

  // screen pixels -> sky pixels (the canvas fills its box, so the box ratio is all we need)
  function toSky(ev) {
    var r = $("traceCanvas").getBoundingClientRect();
    var t = ev.timeStamp;
    if (!(t > 0) || t > 1e11) t = W.performance.now();
    return {
      x: clamp((ev.clientX - r.left) / (r.width || 1), 0, 1) * S.sky.width,
      y: clamp((ev.clientY - r.top) / (r.height || 1), 0, 1) * S.sky.height,
      t: t
    };
  }

  function hideHint() {
    if (!S.hintOn) return;
    S.hintOn = false;
    $("hint").classList.add("is-gone");
    prefs.hintSeen = true;
    savePrefs();
  }

  // the 120 ms cross-fade from the live line to the smoothed stroke
  function fadeReset() {
    var fc = $("fadeCanvas");
    fc.style.transition = "none";
    fc.style.opacity = "0";
  }
  function commitStroke(stroke) {
    var fc = $("fadeCanvas");
    var fade = !reduceMotion();
    if (fade) {
      try {
        var cv = $("traceCanvas");
        fc.width = cv.width; fc.height = cv.height;
        fc.getContext("2d").drawImage(cv, 0, 0);   // the frame with the live line, as the finger left it
        fc.style.transition = "none";
        fc.style.opacity = "1";
      } catch (e) { fade = false; }
    }
    S.strokes.push(stroke);
    S.drag = null;
    drawTraceNow();
    if (fade) {
      void fc.offsetWidth;
      fc.style.transition = "opacity 120ms linear";
      fc.style.opacity = "0";
    }
    buzz();
    invalidateOutputs();
    updateTraceUi();
  }

  function updateTraceUi() {
    var n = S.strokes.length;
    $("btnUndo").disabled = n === 0;
    $("btnClear").disabled = n === 0;
    var cap = $("traceCaption");
    cap.classList.remove("is-nudge");
    if (n === 0) cap.textContent = "";
    else cap.textContent = n === 1 ? "Lovely. Trace more, or tap Next." : "Trace more, or tap Next.";
  }

  function onPointerDown(ev) {
    if (!S.sky || S.screen !== "trace") return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (S.pointers.indexOf(ev.pointerId) === -1) S.pointers.push(ev.pointerId);
    if (S.pointers.length > 1) {
      // a second finger: it's a pinch or a palm, so throw the line away and wait until every finger is up
      S.multi = true;
      if (S.drag) { S.drag = null; requestDraw(); }
      return;
    }
    if (S.multi || S.drag) return;
    ev.preventDefault();
    try { $("traceCanvas").setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    S.drag = { id: ev.pointerId, points: [toSky(ev)] };
    hideHint();
    requestDraw();
  }

  function onPointerMove(ev) {
    var d = S.drag;
    if (!d || ev.pointerId !== d.id) return;
    ev.preventDefault();
    var evs = (typeof ev.getCoalescedEvents === "function" && ev.getCoalescedEvents()) || [];
    if (!evs.length) evs = [ev];
    for (var i = 0; i < evs.length && d.points.length < 6000; i += 1) d.points.push(toSky(evs[i]));
    requestDraw();
  }

  function forgetPointer(ev) {
    var i = S.pointers.indexOf(ev.pointerId);
    if (i !== -1) S.pointers.splice(i, 1);
    if (!S.pointers.length) S.multi = false;
  }

  function onPointerUp(ev) {
    var d = S.drag;
    forgetPointer(ev);
    if (!d || ev.pointerId !== d.id) return;
    ev.preventDefault();
    S.drag = null;   // before releasing the capture, so the lostpointercapture that follows has nothing to cancel
    try { $("traceCanvas").releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    d.points.push(toSky(ev));
    var stroke = null;
    try { stroke = L.trace.finish(S.sky, d.points); } catch (e) { warn("Look Up: could not smooth the line", e); }
    if (!stroke) { S.drag = null; drawTraceNow(); return; }
    commitStroke(stroke);
  }

  function onPointerCancel(ev) {
    var d = S.drag;
    forgetPointer(ev);
    if (!d || ev.pointerId !== d.id) return;
    S.drag = null;
    requestDraw();
  }

  function undo() {
    if (!S.strokes.length) return;
    S.strokes.pop();
    fadeReset();
    invalidateOutputs();
    updateTraceUi();
    drawTraceNow();
  }
  function clearAll() {
    if (!S.strokes.length) return;
    S.strokes.length = 0;
    fadeReset();
    invalidateOutputs();
    updateTraceUi();
    drawTraceNow();
  }

  /* ---------- the card: made once, then kept in step ---------- */

  // Bring the card up to date with the sky, the strokes and the settings (one at a time, in order).
  function syncCard() {
    var job = S.job;
    var strokes = S.strokes.slice();
    var settings = cardSettings();
    var run = S.queue.then(async function () {
      if (job !== S.job) return;
      if (!S.card) {
        var made = await L.card.create(S.sky, strokes, settings);
        if (job === S.job) S.card = made;
      } else {
        S.card.setStrokes(strokes);
        await S.card.update(settings);
      }
    });
    S.queue = run.catch(function () { /* the caller shows the error */ });
    return run;
  }

  /* ---------- 3. words (Step 4) ---------- */

  var WORD_FIELDS = [["fSaid", "said", 40], ["fCity", "city", 28], ["fTo", "to", 20]];

  function whenLine() {
    try { return L.words.when(S.settings.when || Date.now()).line; } catch (e) { return ""; }
  }

  function syncWordsFields() {
    WORD_FIELDS.forEach(function (f) {
      var el = $(f[0]);
      var v = S.settings[f[1]] || "";
      if (el.value !== v) el.value = v;
    });
    $("whenLine").textContent = whenLine();
    syncSaidHint();
  }

  // the kind hint under "What did you see?" shows only while the field is empty (its space stays, so nothing jumps)
  function syncSaidHint() {
    var empty = !$("fSaid").value.trim();
    var h = $("saidHint");
    h.classList.toggle("is-off", !empty);
    h.setAttribute("aria-hidden", empty ? "false" : "true");
  }

  async function goWords() {
    if (!S.sky) { goLanding(); return; }
    stopPreview();
    syncWordsFields();
    showScreen("words");
    var job = S.job;
    try { await syncCard(); }
    catch (e) { if (job === S.job && S.screen === "words") showError(e); return; }
    if (job !== S.job || S.screen !== "words" || !S.card) return;
    mountPreview($("wordsCanvas"), S.card, "square");
  }

  // The settings follow every key; the card waits for a short pause in typing.
  function queueWords(partial) {
    S.wordsPending = Object.assign(S.wordsPending || {}, partial);
    clearTimeout(S.wordsTimer);
    S.wordsTimer = setTimeout(flushWords, 160);
  }
  function flushWords() {
    clearTimeout(S.wordsTimer);
    var p = S.wordsPending;
    S.wordsPending = null;
    var card = S.card;
    if (!p || !card) return;
    var job = S.job;
    S.queue = S.queue.then(function () { if (job === S.job) return card.update(p); })
      .then(function () { redrawStill(); })
      .catch(function (e) { warn("Look Up: words update failed", e); });
  }

  // the field being typed in stays above the keyboard
  function keepVisible(el) {
    var sc = $("wordsScroll");
    if (!el || !sc) return;
    var box = el.closest ? (el.closest(".field") || el) : el;
    var vr = sc.getBoundingClientRect();
    var er = box.getBoundingClientRect();
    var pad = 14;
    if (er.bottom > vr.bottom - pad) sc.scrollTop += er.bottom - vr.bottom + pad;
    else if (er.top < vr.top + pad) sc.scrollTop -= vr.top + pad - er.top;
  }

  // visualViewport: when the keyboard is up, the words screen is exactly as tall as what is visible
  function onViewport() {
    var vv = W.visualViewport;
    var root = D.documentElement;
    if (!vv) return;
    var active = D.activeElement;
    var typing = !!(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA"));
    var kb = typing && S.screen === "words" && (W.innerHeight - vv.height) > 120;
    D.body.classList.toggle("kb", kb);
    if (kb) {
      root.style.setProperty("--vvh", Math.round(vv.height) + "px");
      root.style.setProperty("--vvtop", Math.round(vv.offsetTop) + "px");
      keepVisible(active);
    } else {
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
    }
  }

  function onWordsNext() {
    flushWords();
    if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    goLook();
  }

  /* ---------- 4. look (Step 5) ---------- */

  var lookBuilt = false;

  function buildLookControls() {
    if (lookBuilt) return;
    lookBuilt = true;
    var row = $("finishRow");
    (L.FINISHES || []).forEach(function (f) {
      var b = D.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.id = f.id;
      b.setAttribute("aria-pressed", "false");
      b.textContent = f.name;
      b.addEventListener("click", function () { change({ finish: f.id }); });
      row.appendChild(b);
    });
    row.addEventListener("scroll", updateChipFades, { passive: true });
    W.addEventListener("resize", function () { if (S.screen === "look") { updateChipFades(); chipIntoView(false); } });
  }

  // the soft fades at the row's edges tell you there are more looks to swipe to
  function updateChipFades() {
    var row = $("finishRow");
    var wrap = $("chipsWrap");
    if (!row || !wrap) return;
    var max = row.scrollWidth - row.clientWidth;
    wrap.classList.toggle("can-left", row.scrollLeft > 4);
    wrap.classList.toggle("can-right", max > 4 && row.scrollLeft < max - 4);
  }

  // bring the picked look to the middle of the row (every look is reachable with a thumb swipe)
  function chipIntoView(smooth) {
    var row = $("finishRow");
    var chip = qsa("#finishRow .chip[aria-pressed='true']")[0];
    if (!row || !chip || S.screen !== "look") return;
    var rr = row.getBoundingClientRect();
    var cr = chip.getBoundingClientRect();
    if (!rr.width) return;
    var left = row.scrollLeft + (cr.left - rr.left) - (rr.width - cr.width) / 2;
    var max = row.scrollWidth - row.clientWidth;
    left = clamp(left, 0, Math.max(0, max));
    try { row.scrollTo({ left: left, behavior: smooth && !reduceMotion() ? "smooth" : "auto" }); }
    catch (e) { row.scrollLeft = left; }
    updateChipFades();
  }

  function syncLookUi() {
    var s = S.settings;
    qsa("#finishRow .chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.id === s.finish ? "true" : "false"); });
    var closed = hasClosed();
    var tg = $("glowToggle");
    tg.setAttribute("aria-checked", closed && s.glow ? "true" : "false");
    tg.setAttribute("aria-disabled", closed ? "false" : "true");
    $("glowHint").textContent = closed ? "The cloud inside your shape lights up." : "Close your shape to make it glow";
    updateShareLabels();
    updateSaveState();
  }

  async function goLook() {
    if (!S.sky || !engineOk) { goLanding(); return; }
    flushWords();
    stopPreview();
    buildLookControls();
    syncLookUi();
    showScreen("look");
    chipIntoView(false);
    var job = S.job;
    try { await syncCard(); }
    catch (e) { if (job === S.job && S.screen === "look") showError(e); return; }
    if (job !== S.job || S.screen !== "look" || !S.card) return;
    mountPreview($("lookCanvas"), S.card, "square");
    if (!S.imageFile && !S.imagePromise) scheduleImage(0);
  }

  function backToLook() {
    if (!S.card) { goLanding(); return; }
    abortVideo();
    buildLookControls();
    syncLookUi();
    showScreen("look");
    chipIntoView(false);
    mountPreview($("lookCanvas"), S.card, "square");
    if (!S.imageFile && !S.imagePromise) scheduleImage(0);
  }

  // a look or the glow changed: the card follows, the preview plays again, the image is remade
  function change(partial) {
    var changed = Object.keys(partial).some(function (k) { return S.settings[k] !== partial[k]; });
    if (!changed) return;
    Object.assign(S.settings, partial);
    if ("finish" in partial) prefs.finish = S.settings.finish;
    if ("glow" in partial) prefs.glow = S.settings.glow;
    savePrefs();
    invalidateOutputs();
    syncLookUi();
    if ("finish" in partial) chipIntoView(true);
    var card = S.card;
    if (!card) return;
    var job = S.job;
    var next = cardSettings();
    S.queue = S.queue
      .then(function () { if (job === S.job) return card.update(next); })
      .then(function () {
        if (job !== S.job || card !== S.card) return;
        if (S.preview && S.screen === "look") { try { S.preview.setCard(card); } catch (e) { /* ignore */ } }
        redrawStill();
      })
      .catch(function (e) { warn("Look Up: update failed", e); toast("That one didn’t stick. Try again?"); });
    scheduleImage(350);
  }

  function onGlowToggle() {
    if (!hasClosed()) {
      var tg = $("glowToggle");
      tg.classList.remove("is-nudge");
      void tg.offsetWidth;
      tg.classList.add("is-nudge");
      return;
    }
    change({ glow: !S.settings.glow });
    if (S.settings.glow) sparkleToggle();
  }

  // a few little stars pop off the switch when the glow turns on
  function sparkleToggle() {
    if (reduceMotion()) return;
    var tg = $("glowToggle");
    tg.classList.remove("sparkle");
    void tg.offsetWidth;
    tg.classList.add("sparkle");
    setTimeout(function () { tg.classList.remove("sparkle"); }, 1000);
  }

  // a soft ripple where a finger lands on a button or a look (a small span that removes itself)
  function ripple(ev) {
    if (reduceMotion()) return;
    var t = ev.target && ev.target.closest ? ev.target.closest(".btn, .chip") : null;
    if (!t || t.disabled) return;
    var r = t.getBoundingClientRect();
    var s = D.createElement("span");
    s.className = "rip";
    s.setAttribute("aria-hidden", "true");
    s.style.left = (ev.clientX - r.left) + "px";
    s.style.top = (ev.clientY - r.top) + "px";
    t.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 700);
  }

  /* ---------- the image makes itself as soon as the look settles (PLAN.md 6.6) ---------- */

  function updateShareLabels() {
    var label = S.videoFile ? "Share now" : "Share story";
    qsa(".shareLabel").forEach(function (el) { el.textContent = label; });
  }

  function updateSaveState() {
    var b = $("btnSave");
    if (!b) return;
    var busy = !S.imageFile && !S.imageFailed && !!S.card;
    b.classList.toggle("is-busy", busy);
    b.setAttribute("aria-busy", busy ? "true" : "false");
    $("saveLabel").textContent = busy ? "One sec…" : "Save image";
  }

  function invalidateOutputs() {
    S.imageToken += 1;
    S.imageFile = null;
    S.imagePromise = null;
    clearTimeout(S.imageTimer);
    S.imageFailed = false;
    S.videoFile = null;
    S.shareFailed = { image: false, video: false };
    updateShareLabels();
    updateSaveState();
  }

  function scheduleImage(delay) {
    if (!S.card) return;
    clearTimeout(S.imageTimer);
    S.imageToken += 1;
    S.imageFile = null;
    S.imagePromise = null;
    S.imageFailed = false;
    updateSaveState();
    var tok = S.imageToken;
    if (!delay) { buildImage(tok); return; }
    S.imageTimer = setTimeout(function () { buildImage(tok); }, delay);
  }

  function buildImage(tok) {
    var card = S.card;
    if (!card) return Promise.resolve(null);
    var p = S.queue.then(function () { return L.export.makeImage(card); }).then(function (file) {
      if (tok === S.imageToken && card === S.card) { S.imageFile = file; updateSaveState(); }
      return file;
    });
    p.catch(function (e) {
      if (tok !== S.imageToken) return;
      warn("Look Up: image failed", e);
      S.imagePromise = null;
      S.imageFailed = true;
      updateSaveState();
    });
    S.imagePromise = p;
    return p;
  }

  /* ---------- saving and sharing: called straight from the tap, with the file already made (Step 6) ---------- */

  // The image always goes through LU.share.save (PLAN.md 3 Step 6): the share sheet on iPhone, a download on Android and
  // computers. The story video uses the share sheet where the phone has one (the second tap), and a download where it doesn't.
  function runShare(file, kind) {
    var can = false;
    try { can = !!L.share.canShare(file); } catch (e) { can = false; }
    var useShare = kind === "video" && can && !S.shareFailed[kind];
    var promise;
    // inside another app's browser with no share sheet and no download: there is no way to save, so say so kindly
    var noWay = IN_APP && !can && !("download" in D.createElement("a"));
    try { promise = noWay ? Promise.resolve("failed") : (useShare ? L.share.share(file) : L.share.save(file)); }
    catch (e) { promise = Promise.resolve("failed"); }
    Promise.resolve(promise).then(
      function (r) { afterShare(r, kind, useShare); },
      function () { afterShare("failed", kind, useShare); }
    );
  }

  function afterShare(result, kind, usedShare) {
    if (result === "cancelled") return;
    if (result === "failed") {
      if (usedShare) S.shareFailed[kind] = true;   // the next tap saves the file instead
      if (kind === "video") renderMaking();
      if (IN_APP) { openInAppSheet(kind); return; }   // never a dead end inside another app's browser
      if (kind === "video") toast("Sharing didn’t open. Tap Save video, then post it from your gallery.");
      else toast("That didn’t save. Give it another tap.");
      return;
    }
    goDone(kind, result);
  }

  function onSave() {
    flushWords();
    var file = S.imageFile;
    if (file) { runShare(file, "image"); return; }
    // not ready yet (the look only just changed): wait for it, then go
    if (!S.card) { toast("Trace a shape first."); return; }
    toast("One moment…", 1500);
    var tok = S.imageToken;
    var p = S.imagePromise;
    if (!p) { clearTimeout(S.imageTimer); p = buildImage(tok); }
    Promise.resolve(p).then(function () {
      if (tok !== S.imageToken || !S.imageFile) return;
      runShare(S.imageFile, "image");
    }, function (e) { showError(e); });
  }

  /* ---------- 5. share story: make the video first, then a second tap shares it (Step 6) ---------- */

  async function onShareStory(from) {
    S.returnTo = from;
    if (S.videoFile) { shareVideoNow(); return; }
    if (!S.card) return;
    var sup = S.support;
    if (!sup) {
      try { sup = S.support = await L.export.support(); } catch (e) { sup = null; }
    }
    if (sup && sup.video === false) { showError(VIDEO_ERROR); return; }
    startVideo();
  }

  function setProgress(f) {
    f = clamp(+f || 0, 0, 1);
    var bar = $("makeProgress");
    bar.style.setProperty("--p", String(f));
    bar.setAttribute("aria-valuenow", String(Math.round(f * 100)));
  }

  function abortVideo() {
    S.videoToken += 1;
    if (S.ctrl) { try { S.ctrl.abort(); } catch (e) { /* ignore */ } S.ctrl = null; }
  }

  async function startVideo() {
    var card = S.card;
    if (!card) return;
    abortVideo();
    var tok = S.videoToken;
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    S.ctrl = ctrl;
    S.makeState = "making";
    S.shareFailed.video = false;
    setProgress(0);
    showScreen("making");
    renderMaking();
    mountPreview($("makeCanvas"), card, "story");   // the preview keeps playing while the video is made
    try {
      await S.queue;
      var file = await L.export.makeVideo(card, {
        onProgress: function (f) { if (tok === S.videoToken) setProgress(f); },
        signal: ctrl ? ctrl.signal : undefined
      });
      if (tok !== S.videoToken) return;
      S.ctrl = null;
      S.videoFile = file;
      S.makeState = "ready";
      setProgress(1);
      updateShareLabels();
      renderMaking();
    } catch (e) {
      if (tok !== S.videoToken) return;
      S.ctrl = null;
      if (e && e.code === "cancelled") return;
      showError(e);
    }
  }

  function renderMaking() {
    var ready = S.makeState === "ready";
    $("screen-making").classList.toggle("is-ready", ready);
    var canShare = false;
    try { canShare = !!(S.videoFile && L.share.canShare(S.videoFile)) && !S.shareFailed.video; } catch (e) { canShare = false; }
    $("makeTitle").textContent = ready ? "Your video is ready." : "Making your video…";
    $("btnMakeCancel").hidden = ready;
    $("btnShareNow").hidden = !ready;
    $("btnMakeBack").hidden = !ready;
    $("shareNowLabel").textContent = canShare ? "Share now" : "Save video";
    $("shareNowIcon").innerHTML = icon(canShare ? "share" : "download");
    if (ready) {
      $("makeNote").textContent = canShare
        ? "Tap Share now, then pick who gets it."
        : "Save it, then post it from your gallery.";
    } else {
      $("makeNote").textContent = "Hang tight, this only takes a few seconds.";
    }
  }

  function shareVideoNow() {
    var file = S.videoFile;
    if (file) runShare(file, "video");
  }

  function leaveMaking() {
    abortVideo();
    if (S.returnTo === "done") showDone(); else backToLook();
  }

  /* ---------- inside another app's browser (Instagram, Facebook, TikTok, ...) ---------- */

  // the small dismissible tip on the start and done screens: only inside those apps, only until it's dismissed
  function syncInApp() {
    qsa("[data-inapp]").forEach(function (el) { el.hidden = !(IN_APP && !inappDismissed); });
  }

  var sheetUrl = null;
  var sheetReturn = null;

  function closeInAppSheet() {
    var sheet = $("inappSheet");
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (sheetUrl) { try { URL.revokeObjectURL(sheetUrl); } catch (e) { /* ignore */ } sheetUrl = null; }
    $("inappSheetImg").removeAttribute("src");
    if (sheetReturn && sheetReturn.focus) { try { sheetReturn.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    sheetReturn = null;
  }

  // saving failed in one of those browsers: the same note, prominent, with a way forward
  function openInAppSheet(kind) {
    var sheet = $("inappSheet");
    sheetReturn = D.activeElement;
    var showPic = false;
    if (kind !== "video" && S.imageFile) {
      try {
        if (sheetUrl) URL.revokeObjectURL(sheetUrl);
        sheetUrl = URL.createObjectURL(S.imageFile);
        $("inappSheetImg").src = sheetUrl;   // iPhones let you press and hold a picture to save it
        showPic = true;
      } catch (e) { showPic = false; }
    }
    $("inappPic").hidden = !showPic;
    sheet.hidden = false;
    try { $("btnInappCopy").focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function legacyCopy(text) {
    var ok = false;
    try {
      var ta = D.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
      D.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = !!D.execCommand("copy");
      D.body.removeChild(ta);
    } catch (e) { ok = false; }
    return ok;
  }

  function copyLink() {
    var url = W.location.origin + W.location.pathname;
    var good = function () { toast("Link copied. Paste it into your browser."); };
    var other = function () {
      if (legacyCopy(url)) good();
      else toast("Tap ••• then Open in browser.");
    };
    try {
      if (W.navigator.clipboard && W.navigator.clipboard.writeText) { W.navigator.clipboard.writeText(url).then(good, other); return; }
    } catch (e) { /* fall through */ }
    other();
  }

  /* ---------- 6. done (Step 7) ---------- */

  function goDone(kind, result) {
    S.doneKind = kind;
    S.doneResult = result;
    showDone();
  }

  function showDone() {
    stopPreview();
    $("doneTitle").textContent = "Saved.";
    var note = "";
    if (S.doneResult === "saved") {
      var p = "desktop";
      try { p = L.share.platform(); } catch (e) { p = "desktop"; }
      note = p === "android" ? "It’s in your Gallery or your Downloads." : (p === "ios" ? "" : "It’s in your Downloads folder.");
    }
    $("doneNote").textContent = note;
    releaseDoneUrl();
    var img = $("doneImg");
    if (S.imageFile) {
      try { S.doneUrl = URL.createObjectURL(S.imageFile); img.src = S.doneUrl; img.hidden = false; } catch (e) { img.hidden = true; }
    } else {
      img.hidden = true;
    }
    updateShareLabels();
    showScreen("done");
  }

  // same photo, back to the trace: a new shape, new words
  function traceAgain() {
    if (!S.sky) { goLanding(); return; }
    S.strokes = [];
    S.settings.said = "";
    invalidateOutputs();
    enterTrace();
  }

  /* ---------- wiring ---------- */

  function fillStatic() {
    fillFooter();
    qsa("[data-icon]").forEach(function (el) { el.innerHTML = icon(el.getAttribute("data-icon")); });
  }

  function wire() {
    D.addEventListener("pointerdown", ripple, { passive: true });

    // landing
    $("btnPhoto").addEventListener("click", function () { if (ensureEngine()) $("cameraInput").click(); });
    $("btnChoose").addEventListener("click", function () { if (ensureEngine()) $("galleryInput").click(); });
    $("btnSample").addEventListener("click", trySample);
    $("brokenBtn").addEventListener("click", function () { W.location.reload(); });

    // the "opened inside another app" tip and sheet
    qsa("[data-inapp-close]").forEach(function (b) {
      b.addEventListener("click", function () { inappDismissed = true; syncInApp(); });
    });
    qsa("[data-inapp-sheet-close]").forEach(function (b) { b.addEventListener("click", closeInAppSheet); });
    $("btnInappCopy").addEventListener("click", copyLink);
    D.addEventListener("keydown", function (e) { if (e.key === "Escape") closeInAppSheet(); });

    ["cameraInput", "galleryInput"].forEach(function (id) {
      var input = $(id);
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        input.value = "";
        if (f) handleFile(f);
      });
    });

    // trace
    var cv = $("traceCanvas");
    cv.addEventListener("pointerdown", onPointerDown);
    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointercancel", onPointerCancel);
    cv.addEventListener("lostpointercapture", onPointerCancel);   // after a normal release there is no stroke left to cancel
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    $("btnUndo").addEventListener("click", undo);
    $("btnClear").addEventListener("click", clearAll);
    $("btnTraceNext").addEventListener("click", goWords);   // works with no strokes: a sky postcard is fine
    $("btnTraceBack").addEventListener("click", goLanding);
    if ("ResizeObserver" in W) new ResizeObserver(function () { fitTrace(); }).observe($("stage"));
    W.addEventListener("resize", fitTrace);
    W.addEventListener("orientationchange", function () { setTimeout(fitTrace, 200); });

    // words
    WORD_FIELDS.forEach(function (f, i) {
      var el = $(f[0]);
      el.addEventListener("input", function () {
        var v = clampText(el.value, f[2]);
        if (v !== el.value) el.value = v;
        S.settings[f[1]] = v;
        if (f[1] === "city") { prefs.city = v; savePrefs(); }
        invalidateOutputs();
        var p = {};
        p[f[1]] = v;
        if (f[1] === "said") syncSaidHint();
        queueWords(p);
      });
      el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        var nextField = WORD_FIELDS[i + 1];
        if (nextField) $(nextField[0]).focus(); else onWordsNext();   // Enter walks down the fields, then Next
      });
      el.addEventListener("focus", function () {
        setTimeout(function () { keepVisible(el); }, 60);
        setTimeout(function () { onViewport(); keepVisible(el); }, 350);
      });
      el.addEventListener("blur", function () { setTimeout(onViewport, 120); });
    });
    $("btnWordsNext").addEventListener("click", onWordsNext);
    $("btnWordsBack").addEventListener("click", function () { flushWords(); stopPreview(); enterTrace(); });
    if (W.visualViewport) {
      W.visualViewport.addEventListener("resize", onViewport);
      W.visualViewport.addEventListener("scroll", onViewport);
    }

    // look
    $("btnLookBack").addEventListener("click", function () { goWords(); });
    $("btnEditWords").addEventListener("click", function () { goWords(); });
    $("btnEditDrawing").addEventListener("click", function () { stopPreview(); enterTrace(); });
    $("glowToggle").addEventListener("click", onGlowToggle);
    $("btnSave").addEventListener("click", onSave);
    $("btnShareStory").addEventListener("click", function () { onShareStory("look"); });

    // making
    $("btnMakeCancel").addEventListener("click", leaveMaking);
    $("btnMakeBack").addEventListener("click", leaveMaking);
    $("btnShareNow").addEventListener("click", shareVideoNow);

    // done
    $("btnDoneShare").addEventListener("click", function () { onShareStory("done"); });
    $("btnDoneSave").addEventListener("click", onSave);
    $("btnTraceAgain").addEventListener("click", traceAgain);
    $("btnNewSky").addEventListener("click", goLanding);

    // paste a photo (computers): on the start, done and error screens
    D.addEventListener("paste", function (e) {
      if (!engineOk) return;
      if (S.screen !== "landing" && S.screen !== "done" && S.screen !== "error") return;
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].kind === "file" && items[i].type.indexOf("image/") === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); handleFile(f); return; }
        }
      }
    });

    // something unexpected while a photo is being opened: never a blank screen
    W.addEventListener("unhandledrejection", function (ev) {
      if (S.screen === "working") showError(ev.reason);
    });

    // the hint's little finger: a still picture with reduced motion
    if (reduceMotion()) {
      qsa("#hint animateMotion, #hint animate").forEach(function (el) { el.parentNode.removeChild(el); });
      qsa("#hint .hint-finger").forEach(function (el) { el.setAttribute("opacity", "1"); });
    }
  }

  /* ---------- address shortcut screens (PLAN.md section 7.4) ---------- */

  async function devSample() {
    var smp = await L.sample.load();
    S.settings = applyDevSettings(Object.assign({}, FALLBACK_DEFAULTS, L.DEFAULTS || {}, smp.settings || {}, { when: Date.now() }));
    setSky(smp.sky);
    if (validPen(Q.get("pen"))) S.settings.pen = Q.get("pen");
    return smp;
  }

  // screen=frame: one frame, full size, on a 1080-wide canvas, and the animation stops
  async function devFrame() {
    try {
      var smp = await devSample();
      S.strokes = (smp.strokes || []).slice();
      S.card = await L.card.create(S.sky, S.strokes.slice(), cardSettings());
      var cv = $("frameCanvas");
      cv.width = 1080;
      cv.height = devFormat === "story" ? 1920 : 1080;
      S.card.drawFrame(cv.getContext("2d"), devT == null ? L.END : devT, devFormat, 1);
      D.documentElement.classList.add("frame-only");
      S.screen = "frame";
      S.screenName = "frame";
      D.body.setAttribute("data-screen", "frame");
    } catch (e) {
      D.documentElement.classList.remove("frame-only");
      showError(e);
    }
  }

  async function devFlow(target) {
    try {
      var smp = await devSample();
      // the trace screen starts empty so you can draw (add &strokes=1 to see the sample's drawing); the rest use the preset
      var keep = target !== "trace" || Q.get("strokes") === "1";
      S.strokes = keep ? (smp.strokes || []).slice() : [];
      if (target === "trace") { enterTrace(); return; }
      if (target === "words") { await goWords(); return; }
      await goLook();
      if (S.screen !== "look") return;
      if (target === "making") {
        S.returnTo = "look";
        S.makeState = "making";
        setProgress(0.55);
        showScreen("making");
        renderMaking();
        mountPreview($("makeCanvas"), S.card, "story");
      } else if (target === "done") {
        if (S.imagePromise) { try { await S.imagePromise; } catch (e) { /* ignore */ } }
        goDone("image", "saved");
      }
    } catch (e) {
      showError(e);
    }
  }

  /* ---------- start ---------- */

  function boot() {
    loadPrefs();
    S.settings = initialSettings();
    fillStatic();
    syncInApp();
    buildPens();
    wire();
    if (inappDev === "sheet") setTimeout(function () { openInAppSheet("image"); }, 2500);   // dev shortcut: show the "saving didn't work" sheet

    // states that don't need the engine
    if (devScreen && DEV_ERRORS[devScreen]) { showError(DEV_ERRORS[devScreen]); return; }
    if (devScreen === "landing") { showScreen("landing"); startHeroSoon(); return; }
    if (!engineOk) { showScreen("broken"); return; }   // a friendly message instead of a blank page

    try { L.export.support().then(function (s) { S.support = s; }, function () { /* ignore */ }); } catch (e) { /* ignore */ }
    if (devScreen === "frame") { devFrame(); return; }
    if (DEV_FLOWS.indexOf(devScreen) !== -1 || Q.get("sample") === "1") { devFlow(DEV_FLOWS.indexOf(devScreen) !== -1 ? devScreen : "trace"); return; }
    showScreen("landing");
    startHeroSoon();
  }

  boot();
})();
