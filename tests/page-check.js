// Page check: headless Edge (DevTools protocol, no npm packages) against the running local server.
//   node tests/page-check.js [baseUrl] [sections]
// baseUrl: argument 1, or the LU_BASE environment variable, or http://127.0.0.1:8123
// sections: comma list of  dev, widths, inapp, chips, trace, empty, words, flow, video   (default: all). Screenshots go to shots/join-<name>.png.
// Fails on any console error, uncaught exception, failed network request (the Vercel analytics script is the one allowed 404),
// or horizontal scroll. Never starts or stops a server; always closes Edge.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { launch, sleep } = require("./cdp");

const BASE = (process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2] : (process.env.LU_BASE || "http://127.0.0.1:8123")).replace(/\/+$/, "");
const SECTIONS = (process.argv[3] || process.argv.filter(function (a) { return /^(dev|widths|inapp|chips|trace|empty|words|flow|video)(,|$)/.test(a); })[0] || "dev,widths,inapp,chips,trace,empty,words,flow,video").split(",");
const REAL = path.join(__dirname, "real");

let fails = 0;
function report(ok, label, extra) {
  if (!ok) fails += 1;
  console.log((ok ? "PASS " : "FAIL ") + label + (extra !== undefined && extra !== "" ? "  (" + extra + ")" : ""));
}
function note(s) { console.log("     " + s); }

// ---- in-page helpers (strings, run inside the page) ----
const INPAGE = `
window.__nb = function (sel) {
  var c = document.querySelector(sel);
  if (!c || !c.width || !c.height) return { ok: false, why: "no canvas or 0x0", w: c && c.width, h: c && c.height };
  var x = c.getContext("2d"), w = c.width, h = c.height;
  var d = x.getImageData(0, 0, w, h).data, seen = 0, lo = 255, hi = 0, n = 0;
  for (var y = 0; y < h; y += Math.max(1, h >> 6)) for (var i = 0; i < w; i += Math.max(1, w >> 6)) {
    var o = (y * w + i) * 4; n++;
    if (d[o + 3] > 8) { seen++; var l = (d[o] * 3 + d[o + 1] * 6 + d[o + 2]) / 10; if (l < lo) lo = l; if (l > hi) hi = l; }
  }
  return { ok: seen > n * 0.5 && hi - lo > 25, w: w, h: h, painted: Math.round(seen / n * 100) + "%", range: Math.round(hi - lo) };
};
window.__hscroll = function () {
  var vw = window.innerWidth, bad = [];
  var de = document.documentElement;
  var out = { scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, vw: vw, offenders: [] };
  var active = document.querySelector(".screen.is-active") || document.body;
  var els = active.querySelectorAll("*");
  for (var i = 0; i < els.length; i++) {
    var e = els[i];
    if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue;
    if (e.closest(".drift")) continue;
    var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    var r = e.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    var left = r.left, right = r.right, p = e.parentElement, clipped = false;
    while (p && p !== document.body && p !== de) {
      var ps = getComputedStyle(p);
      if (ps.overflowX !== "visible") { var pr = p.getBoundingClientRect(); left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
      if (ps.display === "none") { clipped = true; break; }
      p = p.parentElement;
    }
    if (clipped) continue;
    if (right > vw + 1 || left < -1) out.offenders.push((e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && e.className.baseVal === undefined ? "." + String(e.className).split(" ")[0] : "")) + " " + Math.round(left) + ".." + Math.round(right));
  }
  out.offenders = out.offenders.slice(0, 8);
  return out;
};
window.__hash = function (video) {
  var c = document.createElement("canvas"); c.width = 108; c.height = 192;
  var x = c.getContext("2d"); x.drawImage(video, 0, 0, 108, 192);
  var d = x.getImageData(0, 0, 108, 192).data, s = 0;
  for (var i = 0; i < d.length; i += 4) s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + (i % 97) * d[i];
  return s;
};
true;
`;

async function after(b, label) {
  // collect what the page logged since the last open/clear
  await sleep(150);
  const errs = b.errors.slice(), exc = b.exceptions.slice(), net = b.failedRequests.slice();
  report(errs.length === 0 && exc.length === 0, label + ": no console errors or exceptions", errs.concat(exc).slice(0, 3).join(" | "));
  report(net.length === 0, label + ": no failed network requests", net.slice(0, 3).join(" | "));
  b.clear();
}

async function openUrl(b, qs) {
  await b.open(BASE + "/" + qs);
  await b.waitFor("document.readyState === 'complete'", 15);
  await b.eval(INPAGE);
}

async function readyScreen(b, name, canvasSel, seconds) {
  const ok = await b.waitFor("document.body.dataset.screen === " + JSON.stringify(name) + (canvasSel ? " && window.__nb(" + JSON.stringify(canvasSel) + ").ok" : ""), seconds || 20);
  return ok;
}

// ---------------------------------------------------------------- dev screens (PLAN.md 7.4)
async function devScreens(b) {
  console.log("\n== dev screens (390x844)");
  await b.viewport(390, 844, 1);

  // the plain page: landing with the animated sample postcard
  await openUrl(b, "");
  report(await b.waitFor("document.body.dataset.screen === 'landing'", 10), "/ opens the landing screen");
  const live = await b.waitFor("document.getElementById('heroCard').classList.contains('is-live') && window.__nb('#heroCanvas').ok", 25);
  report(live, "landing: the animated sample postcard appears (hero card is live, canvas painted)", JSON.stringify(await b.eval("window.__nb('#heroCanvas')")));
  await sleep(1800);
  await b.shot("join-landing-animated.png", { full: true });
  report((await b.eval("document.querySelectorAll('#screen-landing .site-footer .sib-card').length")) === 3, "landing: the footer shows the three siblings");
  report(await b.eval("(function(){var f=document.querySelector('#screen-landing .site-footer');var r=f.getBoundingClientRect();return r.height>50&&getComputedStyle(f).display!=='none';})()"), "landing: the footer is visible");
  const names = await b.eval("Array.prototype.map.call(document.querySelectorAll('#screen-landing .site-footer .sib-card strong'),function(e){return e.textContent;}).join(' | ')");
  note("footer siblings: " + names);
  report(/Handwriting/.test(names) && /Doodle Alive/.test(names) && /Underline/.test(names), "landing: sibling names are Handwriting, Doodle Alive, Underline");
  report((await b.eval("!!(window.__lookup && typeof window.__lookup === 'object')")), "window.__lookup exists on the landing");
  await after(b, "landing (plain)");

  const screens = [
    ["landing", "screen=landing&t=5", "landing", "#heroCanvas"],
    ["trace", "sample=1&screen=trace", "trace", "#traceCanvas"],
    ["trace-strokes", "sample=1&screen=trace&strokes=1", "trace", "#traceCanvas"],
    ["words", "sample=1&screen=words&t=5", "words", "#wordsCanvas"],
    ["look", "sample=1&screen=look&t=5", "look", "#lookCanvas"],
    ["look-glow", "sample=1&screen=look&t=5&glow=1&finish=polaroid", "look", "#lookCanvas"],
    ["look-film", "sample=1&screen=look&t=5&finish=film&pen=gold", "look", "#lookCanvas"],
    ["look-letter", "sample=1&screen=look&t=5&finish=letter&to=Maya&city=Philadelphia&said=I%20saw%20a%20whale.", "look", "#lookCanvas"],
    ["look-plain", "sample=1&screen=look&t=5&finish=plain&pen=ink", "look", "#lookCanvas"],
    ["making", "sample=1&screen=making&t=5", "making", "#makeCanvas"],
    ["done", "sample=1&screen=done", "done", null],
    ["frame-square", "sample=1&screen=frame&format=square&t=5", "frame", "#frameCanvas"],
    ["frame-story", "sample=1&screen=frame&format=story&t=5", "frame", "#frameCanvas"],
    ["frame-story-t2", "sample=1&screen=frame&format=story&t=2", "frame", "#frameCanvas"],
    ["error-heic", "screen=error-heic", "error-heic", null],
    ["error-not-image", "screen=error-not-image", "error-not-image", null]
  ];
  for (const s of screens) {
    await openUrl(b, "?" + s[1]);
    const ok = await readyScreen(b, s[2], s[3], 25);
    report(ok, "screen " + s[0] + " (?" + s[1] + ") is ready", ok ? "" : "data-screen=" + (await b.eval("document.body.dataset.screen")) + " " + JSON.stringify(s[3] ? await b.eval("window.__nb(" + JSON.stringify(s[3]) + ")") : ""));
    if (s[0] === "done") {
      const img = await b.waitFor("(function(){var i=document.getElementById('doneImg');return !i.hidden && i.complete && i.naturalWidth>0;})()", 15);
      report(img, "screen done shows the made image", await b.eval("document.getElementById('doneImg').naturalWidth + 'x' + document.getElementById('doneImg').naturalHeight"));
    }
    if (s[2] === "frame") {
      const dim = await b.eval("document.getElementById('frameCanvas').width + 'x' + document.getElementById('frameCanvas').height");
      report(dim === (/story/.test(s[1]) ? "1080x1920" : "1080x1080"), "screen " + s[0] + ": the frame canvas is " + dim);
    }
    if (s[0] === "trace-strokes") {
      const n = await b.eval("window.__lookup.strokes.length");
      report(n === 3, "trace with &strokes=1: the sample's strokes are in (window.__lookup.strokes)", String(n));
    }
    if (s[0] === "look-glow") report(await b.eval("window.__lookup.settings.glow === true && window.__lookup.settings.finish === 'polaroid'"), "address shortcuts reach the settings (glow, finish)", JSON.stringify(await b.eval("window.__lookup.settings")));
    if (s[0] === "look-letter") report(await b.eval("var s=window.__lookup.settings; s.to==='Maya' && s.city==='Philadelphia' && s.said==='I saw a whale.' && s.finish==='letter'"), "address shortcuts reach the settings (to, city, said, finish)");
    if (s[2] !== "frame") report(await b.eval("window.__lookup.screen === document.body.dataset.screen"), "window.__lookup.screen matches the page on " + s[0]);
    await sleep(600);
    await b.shot("join-" + s[0] + ".png", { full: s[0] === "landing" || s[0] === "done" || s[2] === "frame" });
    await after(b, "screen " + s[0]);
  }
}

// ---------------------------------------------------------------- no horizontal scroll at 360, 390 and 430
async function widths(b) {
  console.log("\n== horizontal scroll at 360, 390 and 430 px");
  const list = [["landing", "screen=landing&t=5"], ["trace", "sample=1&screen=trace"], ["words", "sample=1&screen=words&t=5"], ["look", "sample=1&screen=look&t=5"], ["making", "sample=1&screen=making&t=5"], ["done", "sample=1&screen=done"], ["error", "screen=error-heic"]];
  const widthsList = [[360, 740], [390, 844], [430, 932]];
  for (const wh of widthsList) {
    await b.viewport(wh[0], wh[1], 1);
    for (const s of list) {
      await openUrl(b, "?" + s[1]);
      await b.waitFor("document.body.dataset.screen === " + JSON.stringify(s[0] === "error" ? "error-heic" : s[0]), 25);
      await sleep(900);
      const h = await b.eval("window.__hscroll()");
      report(h.scrollW <= h.vw && h.bodyScrollW <= h.vw && h.offenders.length === 0, wh[0] + "px " + s[0] + ": no horizontal scroll", "scrollWidth " + h.scrollW + " / viewport " + h.vw + (h.offenders.length ? " offenders: " + h.offenders.join(", ") : ""));
      if (wh[0] === 360 && (s[0] === "words" || s[0] === "look" || s[0] === "trace" || s[0] === "landing" || s[0] === "done")) await b.shot("join-" + s[0] + "-360.png", { full: s[0] === "landing" || s[0] === "done" });
      if (wh[0] === 430 && (s[0] === "words" || s[0] === "look")) await b.shot("join-" + s[0] + "-430.png");
      b.clear();
    }
  }
  await b.viewport(390, 844, 1);
}

// ---------------------------------------------------------------- the real flow
async function realFlow(b, withVideo) {
  console.log("\n== the real flow (390x844, a real photo through the real file input)");
  await b.viewport(390, 844, 2);
  await openUrl(b, "");
  await b.eval("localStorage.clear()");
  await b.open(BASE + "/");
  await b.eval(INPAGE);
  await b.waitFor("document.body.dataset.screen === 'landing'", 10);
  report(await b.waitFor("window.LU && window.LU.card && !!document.getElementById('btnPhoto')", 10), "landing has its buttons and the engine is loaded");

  // a file that is not an image
  const txt = path.join(os.tmpdir(), "lu-not-a-photo.txt");
  fs.writeFileSync(txt, "hello, this is not a picture");
  await b.setFiles("#galleryInput", [txt]);
  const errShown = await b.waitFor("document.body.dataset.screen === 'error-not-image'", 10);
  report(errShown, "a text file gives the friendly not-an-image screen", await b.eval("document.getElementById('errTitle').textContent + ' / ' + document.getElementById('errBtn').textContent"));
  await b.shot("join-flow-error-notimage.png");
  b.clear(); // the engine logs nothing here; failed decode is not a console error
  try { fs.unlinkSync(txt); } catch (e) { /* ignore */ }

  // go back to the landing and pick a real photo
  await b.open(BASE + "/");
  await b.eval(INPAGE);
  await b.waitFor("document.body.dataset.screen === 'landing' && window.LU", 10);
  const photo = path.join(REAL, "02-cumulus.jpg");
  const t0 = Date.now();
  await b.setFiles("#galleryInput", [photo]);
  const traceOpen = await b.waitFor("document.body.dataset.screen === 'trace' && window.__nb('#traceCanvas').ok", 30);
  report(traceOpen, "picking a real photo (02-cumulus.jpg) opens the trace screen with the sky painted", (Date.now() - t0) + " ms");
  note("sky: " + JSON.stringify(await b.eval("(function(){var s=window.__lookup.sky;return s?{w:s.width,h:s.height,tone:s.tone,pen:s.suggestedPen,warning:s.warning}:null;})()")));
  report(await b.eval("!!window.__lookup.sky && window.__lookup.sky.width > 100"), "window.__lookup.sky is set after the photo");
  report(await b.eval("window.__lookup.settings.when > Date.now() - 120000"), "settings.when is the time the photo came in");
  await sleep(500);
  await b.shot("join-flow-trace-hint.png");
  report(await b.eval("!document.getElementById('hint').classList.contains('is-gone')"), "trace: the hint shows on first use");
  report(await b.eval("document.getElementById('btnUndo').disabled && document.getElementById('btnClear').disabled"), "trace: Undo and Clear are disabled with no strokes");

  // trace a closed loop with real touch events
  const rect = await b.eval("(function(){var r=document.getElementById('traceCanvas').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()");
  note("trace canvas on screen: " + JSON.stringify(rect));
  const cx = rect.l + rect.w * 0.5, cy = rect.t + rect.h * 0.42, rx = rect.w * 0.28, ry = rect.h * 0.16;
  function loopPts(cx, cy, rx, ry) {
    const pts = [], N = 70;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 * 1.01 - 1.6;
      const wob = 1 + 0.08 * Math.sin(3 * a);
      pts.push({ x: cx + rx * wob * Math.cos(a), y: cy + ry * wob * Math.sin(a) });
    }
    return pts;
  }
  await b.touchDrag(loopPts(cx, cy, rx, ry).slice(0, 36), 16);
  // (first half only: check the live line is drawn while the finger is still down is covered below with a second stroke)
  await sleep(300);
  let st = await b.eval("(function(){var s=window.__lookup.strokes;return {n:s.length,kind:s[0]&&s[0].kind,closed:s[0]&&s[0].closed,len:s[0]&&s[0].length};})()");
  report(st.n === 1, "pointer-drawn stroke is added (touch events)", JSON.stringify(st));
  report(await b.eval("document.getElementById('hint').classList.contains('is-gone')"), "the hint goes away on the first touch");
  await b.eval("window.__lookup.strokes.length = 0"); // reset for the full loop below
  await b.eval("document.getElementById('btnUndo').click()");
  await b.eval("document.getElementById('btnClear').click()");

  // live line is drawn while the finger is down: touch start + moves, then compare the canvas to a no-line frame
  const loop = loopPts(cx, cy, rx, ry);
  const before = await b.eval("(function(){var c=document.getElementById('traceCanvas');return c.toDataURL('image/png').length;})()");
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: loop[0].x, y: loop[0].y, id: 1 }] });
  for (let i = 1; i < 40; i++) { await sleep(16); await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: loop[i].x, y: loop[i].y, id: 1 }] }); }
  await sleep(120);
  const during = await b.eval("(function(){var c=document.getElementById('traceCanvas');return c.toDataURL('image/png').length;})()");
  report(during !== before, "the live line draws on the canvas while the finger is down", before + " -> " + during);
  await b.shot("join-flow-trace-live.png");
  for (let i = 40; i < loop.length; i++) { await sleep(16); await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: loop[i].x, y: loop[i].y, id: 1 }] }); }
  await sleep(16);
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(400);
  st = await b.eval("(function(){var s=window.__lookup.strokes,k=window.__lookup.sky;var p=s[0]?s[0].points:[];var inb=p.every(function(q){return q.x>=-k.width*0.1&&q.x<=k.width*1.1&&q.y>=-k.height*0.1&&q.y<=k.height*1.1;});var xs=p.map(function(q){return q.x;}),ys=p.map(function(q){return q.y;});return {n:s.length,kind:s[0]&&s[0].kind,closed:s[0]&&s[0].closed,pts:p.length,inb:inb,xmin:Math.min.apply(0,xs),xmax:Math.max.apply(0,xs),ymin:Math.min.apply(0,ys),ymax:Math.max.apply(0,ys),skyW:k.width,skyH:k.height};})()");
  note("stroke: " + JSON.stringify(st));
  report(st.n === 1 && st.kind === "line" && st.closed === true, "a drawn loop becomes one closed line stroke", JSON.stringify({ n: st.n, kind: st.kind, closed: st.closed }));
  // the loop covers about 56% x 32% of the canvas: in SKY pixels that is a few hundred px, not CSS px
  const spanX = (st.xmax - st.xmin) / st.skyW, spanY = (st.ymax - st.ymin) / st.skyH;
  report(st.inb && spanX > 0.45 && spanX < 0.7 && spanY > 0.24 && spanY < 0.42, "stroke points are in SKY pixels (loop spans the expected share of the sky)", "x " + Math.round(spanX * 100) + "% y " + Math.round(spanY * 100) + "%");
  report(await b.eval("!document.getElementById('btnUndo').disabled"), "Undo is enabled after a stroke");
  await b.shot("join-flow-trace-stroke.png");
  report((await b.eval("window.__nb('#traceCanvas').ok")), "drawEditor shows the sky with the stroke (canvas painted)");

  // Undo removes it, then draw again, then a tap makes a dot
  await b.clickEl("#btnUndo");
  await sleep(200);
  report((await b.eval("window.__lookup.strokes.length")) === 0, "Undo removes the stroke");
  await b.touchDrag(loopPts(cx, cy, rx, ry), 16);
  await sleep(300);
  report((await b.eval("window.__lookup.strokes.length")) === 1, "drew the loop again");
  await b.touchDrag([{ x: cx - rx * 0.4, y: cy - ry * 0.3 }], 16);   // a tap
  await sleep(300);
  const tap = await b.eval("(function(){var s=window.__lookup.strokes;return {n:s.length,kind:s[1]&&s[1].kind};})()");
  report(tap.n === 2 && tap.kind === "dot", "a tap on the sky makes a dot (an eye)", JSON.stringify(tap));
  await b.touchDrag([{ x: rect.l + rect.w * 0.2, y: rect.t + rect.h * 0.8 }, { x: rect.l + rect.w * 0.4, y: rect.t + rect.h * 0.75 }, { x: rect.l + rect.w * 0.6, y: rect.t + rect.h * 0.82 }, { x: rect.l + rect.w * 0.8, y: rect.t + rect.h * 0.74 }], 16);
  await sleep(300);
  report((await b.eval("window.__lookup.strokes.length")) === 3, "an open swoosh is a third stroke");
  report(await b.eval("window.__lookup.strokes[2].closed === false"), "the swoosh stays open");
  // pen colour
  await b.clickEl("#penRow .pen[data-id='gold']");
  await sleep(300);
  report(await b.eval("window.__lookup.settings.pen === 'gold' && document.querySelector('#penRow .pen[data-id=gold]').getAttribute('aria-pressed') === 'true'"), "picking the Gold pen changes the pen");
  await b.clickEl("#penRow .pen[data-id='white']");
  await sleep(200);
  await b.shot("join-flow-trace-3strokes.png");
  report((await b.eval("document.getElementById('traceCaption').textContent.length")) > 0, "trace: a caption nudges to trace more or tap Next");

  // Next -> words
  await b.clickEl("#btnTraceNext");
  const wordsOk = await b.waitFor("document.body.dataset.screen === 'words' && !!window.__lookup.card && window.__nb('#wordsCanvas').ok", 20);
  report(wordsOk, "Next opens the words screen with the live preview", "screen=" + (await b.eval("document.body.dataset.screen")));
  report(await b.eval("window.__lookup.card.strokes.length === 3"), "the card holds the three strokes");
  report((await b.eval("document.getElementById('whenLine').textContent")).length > 5, "words: the time line is shown", await b.eval("document.getElementById('whenLine').textContent"));
  await b.clickEl("#fSaid");
  await b.typeText("I saw a whale.");
  await b.clickEl("#fCity");
  await b.typeText("Philadelphia");
  await b.clickEl("#fTo");
  await b.typeText("Maya");
  await sleep(600);
  const ws1 = await b.eval("(function(){var s=window.__lookup.settings,c=window.__lookup.card.settings;return {said:s.said,city:s.city,to:s.to,cardSaid:c.said,cardCity:c.city,cardTo:c.to};})()");
  report(ws1.said === "I saw a whale." && ws1.city === "Philadelphia" && ws1.to === "Maya", "typed words reach window.__lookup.settings", JSON.stringify(ws1));
  report(ws1.cardSaid === ws1.said && ws1.cardCity === ws1.city && ws1.cardTo === ws1.to, "typed words reach the card (card.update)");
  report(await b.eval("window.__lookup.settings.said.length <= 40"), "words are capped");
  await b.eval("document.activeElement && document.activeElement.blur()");
  await sleep(400);
  await b.shot("join-flow-words.png");
  const hs = await b.eval("window.__hscroll()");
  report(hs.scrollW <= hs.vw && hs.offenders.length === 0, "words (real flow): no horizontal scroll", hs.offenders.join(", "));
  const layout = await b.eval("(function(){function r(id){var e=document.getElementById(id).getBoundingClientRect();return [Math.round(e.top),Math.round(e.bottom)];}return {prev:r('wordsPreviewWrap'),said:r('fSaid'),city:r('fCity'),to:r('fTo'),next:r('btnWordsNext'),vh:innerHeight};})()");
  note("words layout: " + JSON.stringify(layout));
  report(layout.next[1] <= layout.vh + 1 && layout.to[1] <= layout.next[0] + 2, "words: all three fields sit above the Next bar and inside the screen");
  await after(b, "real flow up to words");

  // Next -> look
  await b.clickEl("#btnWordsNext");
  const lookOk = await b.waitFor("document.body.dataset.screen === 'look' && window.__nb('#lookCanvas').ok", 20);
  report(lookOk, "Next opens the look screen", "screen=" + (await b.eval("document.body.dataset.screen")));
  report(await b.eval("document.querySelectorAll('#finishRow .chip').length === 5"), "look: five look chips");
  report(await b.eval("window.__lookup.card.settings.finish === 'postcard'"), "look: Postcard is the default");
  // the image is made as soon as the look settles
  report(await b.waitFor("document.getElementById('saveLabel').textContent === 'Save image'", 10), "look: the image makes itself (Save image is ready)");
  await b.shot("join-flow-look-postcard.png");

  const ids = ["postcard", "polaroid", "film", "letter", "plain"];
  for (const id of ids) {
    await b.clickEl("#finishRow .chip[data-id='" + id + "']");
    await sleep(900);
    const cur = await b.eval("window.__lookup.settings.finish + '|' + window.__lookup.card.settings.finish");
    report(cur === id + "|" + id, "look " + id + ": the chip sets settings and card", cur);
    const info = await b.eval(`(async function(){
      var f = await LU.export.makeImage(window.__lookup.card);
      var bm = await createImageBitmap(f);
      var c = document.createElement("canvas"); c.width = 16; c.height = 16;
      var x = c.getContext("2d"); x.drawImage(bm, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data, lo = 255, hi = 0;
      for (var i = 0; i < d.length; i += 4) { var l = (d[i] + d[i+1] + d[i+2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
      return { type: f.type, size: f.size, name: f.name, isFile: f instanceof File, w: bm.width, h: bm.height, range: Math.round(hi - lo) };
    })()`);
    report(info.isFile && info.type === "image/jpeg" && info.w === 1080 && info.h === 1080 && info.size > 30000, "makeImage (" + id + "): a 1080x1080 JPEG File", info.type + " " + info.w + "x" + info.h + " " + Math.round(info.size / 1024) + " KB, " + info.name + ", range " + info.range);
    if (id === "postcard") report(/^look-up-philadelphia-\d{4}-\d{2}-\d{2}\.jpg$/.test(info.name), "file name is look-up-<city>-<date>.jpg", info.name);
    await b.shot("join-flow-look-" + id + ".png");
  }

  // glow
  await b.clickEl("#finishRow .chip[data-id='postcard']");
  await sleep(500);
  const tg0 = await b.eval("document.getElementById('glowToggle').getAttribute('aria-disabled') + '|' + document.getElementById('glowToggle').getAttribute('aria-checked')");
  report(tg0 === "false|false", "glow toggle is enabled (a closed shape exists) and off", tg0);
  await b.clickEl("#glowToggle");
  await sleep(700);
  const tg1 = await b.eval("document.getElementById('glowToggle').getAttribute('aria-checked') + '|' + window.__lookup.settings.glow + '|' + window.__lookup.card.settings.glow");
  report(tg1 === "true|true|true", "toggling glow switches it on (settings and card)", tg1);
  await sleep(600);
  await b.shot("join-flow-look-glow.png");
  const gimg = await b.eval("(async function(){var f=await LU.export.makeImage(window.__lookup.card);return f.size;})()");
  report(gimg > 30000, "makeImage with glow on works", Math.round(gimg / 1024) + " KB");
  report(await b.eval("window.__lookup.screen === 'look' && window.__lookup.strokes.length === 3 && window.__lookup.card.strokes.length === 3"), "window.__lookup stays current (screen, strokes, card)");
  await after(b, "real flow up to look");

  // Save image: a real tap; on a computer this is a download
  b.downloads.length = 0;
  await b.clickEl("#btnSave");
  const doneOk = await b.waitFor("document.body.dataset.screen === 'done'", 15);
  report(doneOk, "Save image goes to the Done screen", "screen=" + (await b.eval("document.body.dataset.screen")));
  await sleep(600);
  report(await b.eval("(function(){var i=document.getElementById('doneImg');return !i.hidden && i.naturalWidth===1080 && i.naturalHeight===1080;})()"), "done: shows the saved 1080x1080 image");
  report(b.downloads.length === 1 && /^look-up-philadelphia-\d{4}-\d{2}-\d{2}\.jpg$/.test(b.downloads[0].name || ""), "Save image downloaded a file with the right name", JSON.stringify(b.downloads.map(function (d) { return d.name; })));
  await b.shot("join-flow-done.png", { full: true });
  report((await b.eval("document.getElementById('doneTitle').textContent")) === "Saved.", "done: says Saved.");
  await after(b, "real flow save");

  // city is remembered on this device
  const stored = await b.eval("localStorage.getItem('lookup.v1')");
  report(!!stored && /Philadelphia/.test(stored), "the city is remembered in localStorage", stored);
  // Trace again keeps the photo
  await b.clickEl("#btnTraceAgain");
  report(await b.waitFor("document.body.dataset.screen === 'trace' && window.__lookup.strokes.length === 0 && !!window.__lookup.sky", 10), "Trace again: same photo, back to an empty trace");
  await after(b, "trace again");

  // New sky -> landing, then a second photo (portrait) to check the layout, then a dark one for the warning
  await b.clickEl("#btnTraceBack");
  await b.waitFor("document.body.dataset.screen === 'landing'", 10);
  await b.setFiles("#cameraInput", [path.join(REAL, "05-portrait-tree-wires.jpg")]);
  report(await b.waitFor("document.body.dataset.screen === 'trace' && window.__nb('#traceCanvas').ok", 30), "a portrait photo opens the trace screen (camera input)");
  await sleep(500);
  await b.shot("join-flow-trace-portrait.png");
  const hs2 = await b.eval("window.__hscroll()");
  report(hs2.scrollW <= hs2.vw && hs2.offenders.length === 0, "portrait trace: no horizontal scroll", hs2.offenders.join(", "));
  const box = await b.eval("(function(){var r=document.getElementById('traceCanvas').getBoundingClientRect(),n=document.querySelector('.bar-trace').getBoundingClientRect();return {bottom:r.bottom,bar:n.top,right:r.right,vw:innerWidth};})()");
  report(box.bottom <= box.bar + 1 && box.right <= box.vw, "portrait photo fits above the bottom bar", JSON.stringify(box));
  report(await b.eval("window.__lookup.sky.height > window.__lookup.sky.width"), "portrait sky is portrait");
  await b.clickEl("#btnTraceBack");
  await b.waitFor("document.body.dataset.screen === 'landing'", 10);
  await b.setFiles("#galleryInput", [path.join(REAL, "08-dark-dusk.jpg")]);
  report(await b.waitFor("document.body.dataset.screen === 'trace' && window.__nb('#traceCanvas').ok", 30), "a dark photo opens the trace screen");
  report(await b.eval("document.getElementById('darkNote').hidden === false && window.__lookup.sky.warning === 'dark'"), "the dark photo shows the soft daylight note and does not block", await b.eval("String(window.__lookup.sky.warning)"));
  await b.shot("join-flow-trace-dark.png");
  await after(b, "other photos");

  if (!withVideo) return;
  await videoFlow(b);
}

async function videoFlow(b) {
  console.log("\n== story video (through Share story, one real run)");
  // back to a made card: sample sky with strokes, so the line draws on
  await openUrl(b, "?sample=1&screen=look&t=5&glow=1");
  report(await b.waitFor("document.body.dataset.screen === 'look' && !!window.__lookup.card && document.getElementById('saveLabel').textContent === 'Save image'", 25), "look screen ready for the video");
  const sup = await b.eval("LU.export.support()");
  note("LU.export.support() = " + JSON.stringify(sup));
  report(sup && sup.video === true && !!sup.method, "export.support: video is supported", JSON.stringify(sup));
  // wrap the real makeVideo so we can keep its result, without changing what it does
  await b.eval(`(function () {
    var orig = LU.export.makeVideo;
    window.__vid = null; window.__vidErr = null; window.__vidT = 0; window.__progress = [];
    LU.export.makeVideo = function (card, opts) {
      window.__sameCard = (card === window.__lookup.card);
      var t0 = performance.now();
      var o = Object.assign({}, opts || {});
      var op = o.onProgress;
      o.onProgress = function (f) { window.__progress.push(f); if (op) op(f); };
      return orig.call(LU.export, card, o).then(function (f) { window.__vid = f; window.__vidT = performance.now() - t0; return f; }, function (e) { window.__vidErr = (e && (e.code || e.message)) || String(e); throw e; });
    };
    return true;
  })()`);
  await b.clickEl("#btnShareStory");
  const making = await b.waitFor("document.body.dataset.screen === 'making'", 10);
  report(making, "Share story opens the making screen");
  await sleep(500);
  await b.shot("join-flow-making.png");
  report(await b.eval("window.__nb('#makeCanvas').ok"), "making: the story preview keeps playing (canvas painted)");
  const ready = await b.waitFor("!!window.__vid || !!window.__vidErr", 120);
  const err = await b.eval("window.__vidErr");
  report(ready && !err, "makeVideo finished without error", err || (Math.round(await b.eval("window.__vidT")) + " ms"));
  if (!ready || err) return;
  report(await b.eval("window.__sameCard === true"), "the site passes window.__lookup.card to makeVideo");
  const prog = await b.eval("window.__progress");
  report(prog.length > 5 && prog[prog.length - 1] === 1, "onProgress reports up to 1", prog.length + " calls");
  await sleep(500);
  const ui = await b.eval("(function(){return {title:document.getElementById('makeTitle').textContent,share:!document.getElementById('btnShareNow').hidden,label:document.getElementById('shareNowLabel').textContent,back:!document.getElementById('btnMakeBack').hidden};})()");
  report(ui.share && ui.back && /ready/i.test(ui.title), "the making screen turns into Your video is ready, with Share now and Back", JSON.stringify(ui));
  await b.shot("join-flow-making-ready.png");
  const v = await b.eval(`(async function () {
    var f = window.__vid;
    var url = URL.createObjectURL(f);
    var vid = document.createElement("video");
    vid.muted = true; vid.preload = "auto"; vid.src = url; vid.playsInline = true;
    await new Promise(function (ok, bad) { vid.onloadeddata = ok; vid.onerror = function () { bad(new Error("video element could not load the file")); }; setTimeout(function () { bad(new Error("video load timeout")); }, 20000); });
    var out = { type: f.type, name: f.name, kb: Math.round(f.size / 1024), duration: vid.duration, w: vid.videoWidth, h: vid.videoHeight, hashes: [] };
    var times = [0.3, 1.5, 4];
    for (var i = 0; i < times.length; i++) {
      await new Promise(function (ok) { vid.onseeked = ok; vid.currentTime = times[i]; setTimeout(ok, 6000); });
      await new Promise(function (r) { setTimeout(r, 150); });
      out.hashes.push(window.__hash(vid));
    }
    URL.revokeObjectURL(url);
    return out;
  })()`);
  note("video: " + JSON.stringify(v));
  report(v.type === "video/mp4", "the video is an MP4", v.type);
  report(v.kb > 50 && v.kb < 20000, "video size is sensible", v.kb + " KB");
  report(Math.abs(v.duration - 5) < 0.3, "video lasts about 5 s", String(v.duration));
  report(v.w === 1080 && v.h === 1920, "video is 1080x1920", v.w + "x" + v.h);
  report(/^look-up-.*\.mp4$/.test(v.name), "video file name is look-up-...mp4", v.name);
  report(v.hashes[0] !== v.hashes[1] && v.hashes[1] !== v.hashes[2], "frames at 0.3 s, 1.5 s and 4 s differ (the line draws on)", v.hashes.join(" / "));
  // Back returns to the look screen, nothing broke
  await b.clickEl("#btnMakeBack");
  report(await b.waitFor("document.body.dataset.screen === 'look'", 10), "Back from the video returns to the look screen");
  await after(b, "video flow");
}

// ---------------------------------------------------------------- inside another app's browser: the tip and the sheet
async function inapp(b) {
  console.log("\n== in-app browser note and sheet (?inapp=1, ?inapp=sheet)");
  const sizes = [[390, 844], [360, 740]];
  for (const wh of sizes) {
    const w = wh[0], tag = w + "px ";
    await b.viewport(w, wh[1], 1);
    // the tip on the landing
    await openUrl(b, "?inapp=1");
    await b.waitFor("document.body.dataset.screen === 'landing'", 10);
    await sleep(900);
    const tip = await b.eval("(function(){var e=document.querySelector('#screen-landing [data-inapp]');var r=e.getBoundingClientRect();return {hidden:e.hidden,l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),vw:innerWidth,vh:innerHeight,text:e.textContent.trim().replace(/\\s+/g,' ').slice(0,90)};})()");
    note(tag + "landing tip: " + JSON.stringify(tip));
    report(!tip.hidden && tip.l >= 0 && tip.r <= tip.vw, tag + "?inapp=1: the tip shows on the landing and fits the width");
    let h = await b.eval("window.__hscroll()");
    report(h.scrollW <= h.vw && h.offenders.length === 0, tag + "?inapp=1 landing: no horizontal scroll", h.offenders.join(", "));
    await b.shot("join-inapp-landing-" + w + ".png", { full: true });
    const close = await b.eval("(function(){var e=document.querySelector('#screen-landing [data-inapp-close]');var r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};})()");
    report(close.w >= 40 && close.h >= 40, tag + "the tip's close button is a finger-sized target", close.w + "x" + close.h);
    await after(b, tag + "?inapp=1 landing");
    await b.clickEl("#screen-landing [data-inapp-close]");
    await sleep(250);
    report(await b.eval("document.querySelector('#screen-landing [data-inapp]').hidden === true"), tag + "tapping the tip's close button dismisses it");
    // the tip on done
    await openUrl(b, "?sample=1&screen=done&inapp=1");
    await b.waitFor("document.body.dataset.screen === 'done'", 15);
    await b.waitFor("(function(){var i=document.getElementById('doneImg');return !i.hidden && i.complete && i.naturalWidth>0;})()", 15);
    await sleep(600);
    report(await b.eval("(function(){var e=document.querySelector('#screen-done [data-inapp]');var r=e.getBoundingClientRect();return !e.hidden && r.height>20 && r.left>=0 && r.right<=innerWidth;})()"), tag + "?inapp=1: the tip shows on the done screen and fits");
    h = await b.eval("window.__hscroll()");
    report(h.scrollW <= h.vw && h.offenders.length === 0, tag + "?inapp=1 done: no horizontal scroll", h.offenders.join(", "));
    await b.shot("join-inapp-done-" + w + ".png", { full: true });
    await after(b, tag + "?inapp=1 done");
    // the sheet
    await openUrl(b, "?sample=1&screen=look&t=5&inapp=sheet");
    const opened = await b.waitFor("document.getElementById('inappSheet') && !document.getElementById('inappSheet').hidden", 20);
    report(opened, tag + "?inapp=sheet opens the saving sheet");
    await sleep(700);
    const sh = await b.eval(`(function(){
      function R(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height};}
      function reach(sel){var e=document.querySelector(sel);var r=e.getBoundingClientRect();var el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!el && (el===e || e.contains(el));}
      var card=R('#inappSheet .inapp-card');
      return {vw:innerWidth,vh:innerHeight,card:card,copy:R('#btnInappCopy'),close:R('#btnInappClose'),copyReach:reach('#btnInappCopy'),closeReach:reach('#btnInappClose'),
        picShown:!document.getElementById('inappPic').hidden,img:R('#inappSheetImg'),imgOk:document.getElementById('inappSheetImg').naturalWidth,
        scrollable:(function(){var c=document.querySelector('#inappSheet .inapp-card');return c.scrollHeight>c.clientHeight+1;})()};
    })()`);
    note(tag + "sheet: card " + JSON.stringify(sh.card) + " copy " + JSON.stringify(sh.copy) + " close " + JSON.stringify(sh.close) + " pic " + sh.picShown + " scrollable " + sh.scrollable);
    report(sh.card && sh.card.l >= 0 && sh.card.r <= sh.vw && sh.card.t >= 0 && sh.card.b <= sh.vh + 1, tag + "the sheet fits inside the screen", JSON.stringify(sh.card));
    const inV = function (r) { return r && r.l >= 0 && r.r <= sh.vw && r.t >= 0 && r.b <= sh.vh; };
    report(inV(sh.copy) && sh.copyReach, tag + "the sheet's Copy the link button is on screen and reachable");
    report(inV(sh.close) && sh.closeReach, tag + "the sheet's Not now button is on screen and reachable");
    report(sh.picShown && sh.imgOk > 0, tag + "the sheet shows the card picture (press and hold to save)", String(sh.imgOk));
    h = await b.eval("(function(){var de=document.documentElement;return {sw:de.scrollWidth,vw:innerWidth};})()");
    report(h.sw <= h.vw, tag + "?inapp=sheet: no horizontal scroll", h.sw + " / " + h.vw);
    await b.shot("join-inapp-sheet-" + w + ".png");
    // copy the link: must not throw even if the browser refuses the clipboard
    await b.clickEl("#btnInappCopy");
    await sleep(500);
    await after(b, tag + "?inapp=sheet");
    await b.clickEl("#btnInappClose");
    await sleep(300);
    report(await b.eval("document.getElementById('inappSheet').hidden === true"), tag + "Not now closes the sheet");
  }
  await b.viewport(390, 844, 1);
}

// ---------------------------------------------------------------- the look chips: scroll, fades, the fifth chip
async function chips(b) {
  console.log("\n== look chips (scroll, edge fades, the fifth chip)");
  for (const wh of [[360, 740], [390, 844], [320, 640]]) {
    const w = wh[0], tag = w + "px ";
    await b.viewport(w, wh[1], 1);
    await openUrl(b, "?sample=1&screen=look&t=5");
    await b.waitFor("document.body.dataset.screen === 'look' && window.__nb('#lookCanvas').ok", 25);
    await sleep(900);
    const m = async function () {
      return b.eval(`(function(){
        var row=document.getElementById('finishRow'),wrap=document.getElementById('chipsWrap'),rr=row.getBoundingClientRect();
        var cs=row.querySelectorAll('.chip'),last=cs[cs.length-1].getBoundingClientRect();
        return {n:cs.length,sw:row.scrollWidth,cw:row.clientWidth,sl:Math.round(row.scrollLeft),canL:wrap.classList.contains('can-left'),canR:wrap.classList.contains('can-right'),
          lastFull:last.left>=rr.left-1&&last.right<=rr.right+1,lastRight:Math.round(last.right),rowRight:Math.round(rr.right),chipH:Math.round(last.height),vw:innerWidth};
      })()`);
    };
    let m0 = await m();
    note(tag + "chips at rest: " + JSON.stringify(m0));
    report(m0.n === 5, tag + "five look chips");
    report(m0.chipH >= 36, tag + "chips are a finger-sized height", String(m0.chipH));
    const overflow = m0.sw > m0.cw + 4;
    if (overflow) {
      report(m0.canR && !m0.canL, tag + "the right fade shows (more looks to the right), none on the left", JSON.stringify({ canL: m0.canL, canR: m0.canR }));
      await b.shot("join-look-chips-" + w + ".png");
      const rect = await b.eval("(function(){var r=document.getElementById('finishRow').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()");
      // a real swipe with a finger, right to left
      await b.touchDrag([{ x: rect.l + rect.w * 0.85, y: rect.t + rect.h / 2 }, { x: rect.l + rect.w * 0.65, y: rect.t + rect.h / 2 }, { x: rect.l + rect.w * 0.45, y: rect.t + rect.h / 2 }, { x: rect.l + rect.w * 0.2, y: rect.t + rect.h / 2 }, { x: rect.l + rect.w * 0.05, y: rect.t + rect.h / 2 }], 20);
      await sleep(900);
      let m1 = await m();
      note(tag + "chips after a swipe: " + JSON.stringify(m1));
      report(m1.sl > 0, tag + "a finger swipe scrolls the chip row", "scrollLeft " + m1.sl);
      if (!m1.lastFull) { await b.eval("document.getElementById('finishRow').scrollLeft = 9999"); await sleep(400); m1 = await m(); }
      report(m1.lastFull, tag + "the fifth chip can be scrolled fully into view", JSON.stringify({ lastRight: m1.lastRight, rowRight: m1.rowRight }));
      report(m1.canL, tag + "the left fade shows once scrolled");
      await b.shot("join-look-chips-scrolled-" + w + ".png");
    } else {
      report(m0.lastFull, tag + "all five chips fit without scrolling");
    }
    await b.clickEl("#finishRow .chip[data-id='plain']");
    await sleep(900);
    const sel = await b.eval("window.__lookup.settings.finish + '|' + window.__lookup.card.settings.finish + '|' + document.querySelector('#finishRow .chip[data-id=plain]').getAttribute('aria-pressed')");
    report(sel === "plain|plain|true", tag + "tapping the fifth chip (Just the sky) selects it", sel);
    const f = await b.eval("(async function(){var f=await LU.export.makeImage(window.__lookup.card);return f.size+'|'+f.type;})()");
    report(/^\d{5,}\|image\/jpeg$/.test(f), tag + "makeImage works on the fifth look", f);
    const h = await b.eval("window.__hscroll()");
    report(h.scrollW <= h.vw && h.offenders.length === 0, tag + "look screen: no horizontal scroll", h.offenders.join(", "));
    await after(b, tag + "chips");
  }
  await b.viewport(390, 844, 1);
}

// ---------------------------------------------------------------- the trace screen on a landscape and a portrait photo
async function traceLayouts(b) {
  console.log("\n== trace screen layout and sky-pixel mapping (landscape and portrait photos)");
  const photos = [["01-blue-rooftops.jpg", "landscape"], ["02-cumulus.jpg", "landscape"], ["05-portrait-tree-wires.jpg", "portrait"], ["06-portrait-rooftops.jpg", "portrait"]];
  for (const wh of [[360, 740], [390, 844]]) {
    for (const ph of photos) {
      const tag = wh[0] + "x" + wh[1] + " " + ph[1] + " (" + ph[0].slice(0, 2) + ") ";
      await b.viewport(wh[0], wh[1], 2);
      await b.open(BASE + "/");
      await b.eval(INPAGE);
      await b.eval("localStorage.clear()");
      await b.waitFor("document.body.dataset.screen === 'landing' && window.LU && window.LU.card", 10);
      await b.setFiles("#galleryInput", [path.join(REAL, ph[0])]);
      const ok = await b.waitFor("document.body.dataset.screen === 'trace' && window.__nb('#traceCanvas').ok", 30);
      report(ok, tag + "the trace screen opens with the sky painted");
      if (!ok) continue;
      await sleep(900);
      const g = await b.eval(`(function(){
        function R(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height};}
        var k=window.__lookup.sky;
        var st=document.getElementById('stage');
        return {vw:innerWidth,vh:innerHeight,canvas:R('#traceCanvas'),stage:R('#stage'),wrap:R('#skyWrap'),bar:R('.bar-trace'),head:R('#screen-trace .top'),caption:R('#traceCaption'),
          skyW:k.width,skyH:k.height,stageOverflow:st.scrollHeight-st.clientHeight,cw:document.getElementById('traceCanvas').width,ch:document.getElementById('traceCanvas').height,
          undo:R('#btnUndo'),next:R('#btnTraceNext')};
      })()`);
      note(tag + "canvas " + Math.round(g.canvas.w) + "x" + Math.round(g.canvas.h) + " at " + Math.round(g.canvas.l) + "," + Math.round(g.canvas.t) + " stage " + Math.round(g.stage.t) + ".." + Math.round(g.stage.b) + " bar " + Math.round(g.bar.t) + " sky " + g.skyW + "x" + g.skyH);
      const hs = await b.eval("window.__hscroll()");
      report(hs.scrollW <= hs.vw && hs.offenders.length === 0, tag + "no horizontal scroll", hs.offenders.join(", "));
      report(g.canvas.l >= g.stage.l - 1 && g.canvas.r <= g.stage.r + 1 && g.canvas.t >= g.stage.t - 1 && g.canvas.b <= g.stage.b + 1, tag + "the canvas sits inside the stage", JSON.stringify({ c: [g.canvas.t, g.canvas.b], s: [g.stage.t, g.stage.b] }));
      report(g.canvas.b <= g.bar.t + 1 && g.canvas.t >= g.head.b - 1 && g.canvas.r <= g.vw + 1 && g.canvas.l >= -1, tag + "the canvas sits between the header and the bottom bar and inside the screen");
      report(g.bar.b <= g.vh + 1 && g.next.r <= g.vw && g.undo.l >= 0, tag + "the Undo, Clear and Next bar is fully on screen");
      const asp = (g.canvas.w / g.canvas.h) / (g.skyW / g.skyH);
      report(Math.abs(asp - 1) < 0.02, tag + "the whole photo is shown (canvas shape matches the sky shape)", "ratio " + asp.toFixed(3));
      report(g.stageOverflow <= 1, tag + "the stage does not overflow vertically", String(g.stageOverflow));
      if (g.caption && g.caption.h > 0) report(g.caption.b <= g.canvas.t + 1 || g.caption.t >= g.canvas.b - 1, tag + "the caption does not cover the sky", JSON.stringify({ cap: [Math.round(g.caption.t), Math.round(g.caption.b)], cv: [Math.round(g.canvas.t), Math.round(g.canvas.b)] }));
      const minSize = Math.min(g.canvas.w, g.canvas.h);
      report(minSize >= 150, tag + "the canvas is big enough to draw on", Math.round(g.canvas.w) + "x" + Math.round(g.canvas.h));
      await b.shot("join-trace-" + wh[0] + "-" + ph[1] + "-" + ph[0].slice(0, 2) + ".png");
      // tracing maps to sky pixels: a tap at a known spot, then a loop around a known centre
      const c = g.canvas;
      const fx = 0.3, fy = 0.62;
      await b.touchDrag([{ x: c.l + c.w * fx, y: c.t + c.h * fy }], 16);
      await sleep(300);
      const dot = await b.eval("(function(){var s=window.__lookup.strokes[0];return s?{kind:s.kind,x:s.points[0].x,y:s.points[0].y}:null;})()");
      const tolX = g.skyW * 0.02, tolY = g.skyH * 0.02;
      report(!!dot && dot.kind === "dot" && Math.abs(dot.x - fx * g.skyW) < tolX && Math.abs(dot.y - fy * g.skyH) < tolY, tag + "a tap lands on the matching sky pixel", dot ? "wanted " + Math.round(fx * g.skyW) + "," + Math.round(fy * g.skyH) + " got " + Math.round(dot.x) + "," + Math.round(dot.y) : "no stroke");
      const lcx = c.l + c.w * 0.58, lcy = c.t + c.h * 0.4, lrx = c.w * 0.2, lry = c.h * 0.14;
      const pts = [], N = 70;
      for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2 * 1.01 - 1.6; pts.push({ x: lcx + lrx * Math.cos(a), y: lcy + lry * Math.sin(a) }); }
      await b.touchDrag(pts, 16);
      await sleep(400);
      const lp = await b.eval("(function(){var s=window.__lookup.strokes[1];if(!s)return null;var xs=s.points.map(function(q){return q.x;}),ys=s.points.map(function(q){return q.y;});return {kind:s.kind,closed:s.closed,x0:Math.min.apply(0,xs),x1:Math.max.apply(0,xs),y0:Math.min.apply(0,ys),y1:Math.max.apply(0,ys)};})()");
      if (lp) {
        const ex0 = (0.58 - 0.2) * g.skyW, ex1 = (0.58 + 0.2) * g.skyW, ey0 = (0.4 - 0.14) * g.skyH, ey1 = (0.4 + 0.14) * g.skyH;
        const ok2 = lp.kind === "line" && lp.closed && Math.abs(lp.x0 - ex0) < g.skyW * 0.03 && Math.abs(lp.x1 - ex1) < g.skyW * 0.03 && Math.abs(lp.y0 - ey0) < g.skyH * 0.03 && Math.abs(lp.y1 - ey1) < g.skyH * 0.03;
        report(ok2, tag + "a drawn loop covers the matching sky area, and closes", "wanted x " + Math.round(ex0) + ".." + Math.round(ex1) + " y " + Math.round(ey0) + ".." + Math.round(ey1) + "; got x " + Math.round(lp.x0) + ".." + Math.round(lp.x1) + " y " + Math.round(lp.y0) + ".." + Math.round(lp.y1));
      } else report(false, tag + "a drawn loop adds a stroke");
      await b.shot("join-trace-" + wh[0] + "-" + ph[1] + "-" + ph[0].slice(0, 2) + "-drawn.png");
      await after(b, tag + "trace layout");
    }
  }
  await b.viewport(390, 844, 1);
}

// ---------------------------------------------------------------- an empty "said" still makes a card ("Look up." comes from the engine)
async function emptySaid(b) {
  console.log("\n== empty words: the card keeps it simple");
  await b.viewport(390, 844, 1);
  await openUrl(b, "?sample=1&screen=look&t=5");
  await b.waitFor("document.body.dataset.screen === 'look' && !!window.__lookup.card", 25);
  const res = await b.eval(`(async function () {
    var card = window.__lookup.card, orig = card.settings.said, out = {};
    async function px(said) {
      await card.update({ said: said });
      var f = await LU.export.makeImage(card);
      var bm = await createImageBitmap(f);
      var c = document.createElement("canvas"); c.width = 270; c.height = 270;
      var x = c.getContext("2d"); x.drawImage(bm, 0, 0, 270, 270);
      return { d: x.getImageData(0, 0, 270, 270).data, w: bm.width, h: bm.height, size: f.size, type: f.type };
    }
    function diff(a, b) { var s = 0; for (var i = 0; i < a.d.length; i += 4) s += Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i+1] - b.d[i+1]) + Math.abs(a.d[i+2] - b.d[i+2]); return s / (a.d.length / 4) / 3; }
    var ids = ["postcard", "polaroid", "letter", "film", "plain"];
    for (var k = 0; k < ids.length; k++) {
      await card.update({ finish: ids[k] });
      var empty = await px(""), look = await px("Look up."), whale = await px("I saw a dolphin over the roofs.");
      out[ids[k]] = { w: empty.w, h: empty.h, type: empty.type, size: empty.size, emptyVsLookUp: +diff(empty, look).toFixed(3), emptyVsWhale: +diff(empty, whale).toFixed(3) };
    }
    await card.update({ finish: "postcard", said: orig });
    return out;
  })()`);
  note("pixel diffs (mean level change 0..255): " + JSON.stringify(res));
  for (const id of ["postcard", "polaroid", "letter"]) {
    const r = res[id];
    report(r.type === "image/jpeg" && r.w === 1080 && r.h === 1080 && r.size > 30000, id + ": makeImage with empty words works", r.type + " " + r.w + "x" + r.h + " " + Math.round(r.size / 1024) + " KB");
    report(r.emptyVsLookUp < 0.05, id + ": empty words look the same as the words 'Look up.' (the engine's fallback)", "diff " + r.emptyVsLookUp);
    report(r.emptyVsWhale > 0.3, id + ": and differ from a card with other words (so the text really is drawn)", "diff " + r.emptyVsWhale);
  }
  for (const id of ["film", "plain"]) {
    const r = res[id];
    report(r.type === "image/jpeg" && r.w === 1080 && r.size > 30000, id + ": makeImage with empty words works (stays quiet, no fallback text)", r.size + " bytes");
    report(r.emptyVsLookUp > 0.05 || id === "plain", id + ": the fallback words are not forced onto this look", "diff " + r.emptyVsLookUp);
  }

  // through the screens: clear the field, Next, the look screen, Save
  await openUrl(b, "?sample=1&screen=words&t=5");
  await b.waitFor("document.body.dataset.screen === 'words' && window.__nb('#wordsCanvas').ok", 25);
  await b.clickEl("#fSaid");
  await b.eval("(function(){var e=document.getElementById('fSaid');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
  await sleep(500);
  const hint = await b.eval("(function(){var h=document.getElementById('saidHint');var r=h.getBoundingClientRect();var f=document.getElementById('fSaid').getBoundingClientRect();return {text:h.textContent,fs:parseFloat(getComputedStyle(h).fontSize),below:r.top>=f.bottom-1,inside:r.right<=innerWidth&&r.left>=0};})()");
  report(hint.text === "Leave it blank and the card keeps it simple." && hint.below && hint.inside && hint.fs >= 12, "words: the hint line sits under the field and reads right", JSON.stringify(hint));
  report(await b.eval("window.__lookup.settings.said === ''"), "words: the cleared field reaches the settings as empty");
  await b.eval("document.activeElement && document.activeElement.blur()");
  await b.shot("join-words-hint.png");
  await b.clickEl("#btnWordsNext");
  report(await b.waitFor("document.body.dataset.screen === 'look' && window.__nb('#lookCanvas').ok", 20), "empty words: Next opens the look screen");
  report(await b.waitFor("document.getElementById('saveLabel').textContent === 'Save image'", 15), "empty words: the image makes itself");
  await sleep(600);
  await b.shot("join-look-emptysaid.png");
  b.downloads.length = 0;
  await b.clickEl("#btnSave");
  report(await b.waitFor("document.body.dataset.screen === 'done'", 15), "empty words: Save image reaches Done");
  await sleep(500);
  report(await b.eval("(function(){var i=document.getElementById('doneImg');return !i.hidden && i.naturalWidth===1080 && i.naturalHeight===1080;})()"), "empty words: the saved image is 1080x1080");
  await after(b, "empty words");
}


// ---------------------------------------------------------------- the Words screen on short and small phones
async function wordsLayout(b) {
  console.log("\n== words screen layout (no overlaps, scroll, Next bar never covers a field, preview hidden when very short)");
  const probe = `(function () {
    function R(e) { if (!e) return null; var r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }
    var sc = document.getElementById("wordsScroll");
    var out = { vw: innerWidth, vh: innerHeight, scroll: R(sc), sh: sc.scrollHeight, ch: sc.clientHeight, bar: R(document.querySelector(".bar-words")), next: R(document.getElementById("btnWordsNext")),
      prevWrap: R(document.getElementById("wordsPreviewWrap")), prevDisplay: getComputedStyle(document.getElementById("wordsPreviewWrap")).display, prevCanvas: R(document.getElementById("wordsCanvas")),
      when: R(document.getElementById("whenLine")), whenText: document.getElementById("whenLine").textContent, fields: [], labels: [] };
    ["fSaid", "fCity", "fTo"].forEach(function (id) { var f = document.getElementById(id); out.fields.push({ id: id, r: R(f), label: R(f.closest("label")) }); });
    return out;
  })()`;
  const hit = function (a, c) { return a && c && a.w > 0 && a.h > 0 && c.w > 0 && c.h > 0 && a.l < c.r - 0.5 && a.r > c.l + 0.5 && a.t < c.b - 0.5 && a.b > c.t + 0.5; };
  const cases = [[375, 667], [360, 640], [320, 568], [390, 844], [390, 420]];
  for (const wh of cases) {
    const tag = wh[0] + "x" + wh[1] + " ";
    await b.viewport(wh[0], wh[1], 1);
    await openUrl(b, "?sample=1&screen=words&t=5");
    await b.waitFor("document.body.dataset.screen === 'words' && window.__nb('#wordsCanvas').ok", 25);
    await sleep(900);
    const p0 = await b.eval(probe);
    note(tag + "preview " + (p0.prevWrap ? Math.round(p0.prevWrap.h) + "px tall, display " + p0.prevDisplay : "none") + "; scroll area " + p0.ch + " of " + p0.sh + "; bar top " + Math.round(p0.bar.t));
    const veryShort = wh[1] < 520;
    if (veryShort) {
      report(p0.prevDisplay === "none" || p0.prevWrap.h === 0, tag + "the preview is hidden", p0.prevDisplay);
    } else {
      report(p0.prevDisplay !== "none" && p0.prevWrap.h > 40 && (!p0.prevCanvas || p0.prevCanvas.h > 40), tag + "the preview card is visible", p0.prevWrap.h + "px");
      const card = p0.prevCanvas || p0.prevWrap;
      const bad = [];
      p0.fields.forEach(function (f) { if (hit(f.r, card)) bad.push(f.id); if (hit(f.label, card)) bad.push(f.id + " label"); });
      if (hit(p0.when, card)) bad.push("date line");
      report(bad.length === 0, tag + "no field, label or date line overlaps the preview card", bad.join(", "));
    }
    report(p0.when.w > 0 && p0.whenText.length > 5 && p0.when.r <= p0.vw + 1, tag + "the date line is shown and fits", p0.whenText);
    report(p0.sh >= p0.ch, tag + "the screen scrolls when it has to (or fits)", p0.sh + " / " + p0.ch);
    // scroll to the very end: every field inside the scroll window and above the Next bar
    await b.eval("(function(){var s=document.getElementById('wordsScroll');s.scrollTop=s.scrollHeight;return true;})()");
    await sleep(300);
    const p1 = await b.eval(probe);
    const covered = [], clipped = [];
    p1.fields.forEach(function (f) {
      if (hit(f.r, p1.bar) || f.r.b > p1.bar.t + 1 || (f.label && f.label.b > p1.bar.t + 1)) covered.push(f.id);
      if ((!veryShort || f.id === "fTo") && (f.r.t < p1.scroll.t - 1 || f.r.b > p1.scroll.b + 1)) clipped.push(f.id);
    });
    report(covered.length === 0, tag + "scrolled to the end, the Next bar covers no field", covered.join(", "));
    report(clipped.length === 0, tag + "scrolled to the end, all three fields are inside the scroll window (very short: the last one; the rest are checked by scrolling below)", clipped.join(", "));
    report(p1.next.b <= p1.vh + 1 && p1.next.t >= p1.scroll.b - 1, tag + "the Next button is on screen below the fields", Math.round(p1.next.t) + ".." + Math.round(p1.next.b) + " of " + p1.vh);
    if (veryShort) {
      // also reachable from the top: scroll back up and each field can be scrolled into view and tapped
      let ok = true;
      for (const id of ["fSaid", "fCity", "fTo"]) {
        const r = await b.eval("(function(){var e=document.getElementById('" + id + "');e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();var el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el===e;})()");
        if (!r) ok = false;
      }
      report(ok, tag + "each of the three fields can be scrolled to and is the element under a finger");
    }
    const h = await b.eval("window.__hscroll()");
    report(h.scrollW <= h.vw && h.offenders.length === 0, tag + "words: no horizontal scroll", h.offenders.join(", "));
    await b.shot("join-words-" + wh[0] + "x" + wh[1] + ".png");
    await after(b, tag + "words layout");
  }
  await b.viewport(390, 844, 1);
}

(async function main() {
  console.log("Look Up page check against " + BASE + " (sections: " + SECTIONS.join(",") + ")");
  // the server is Rishi's: check it is up, never start it
  try {
    const r = await fetch(BASE + "/index.html");
    if (!r.ok) throw new Error("HTTP " + r.status);
  } catch (e) {
    console.log("FAIL the local server is not answering at " + BASE + " (" + e.message + "). Please start it: python -m http.server 8123 in the look-up folder.");
    process.exit(2);
  }
  let b = null;
  try {
    b = await launch({ width: 390, height: 844, dpr: 1 });
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "" });
    if (SECTIONS.indexOf("dev") >= 0) await devScreens(b);
    if (SECTIONS.indexOf("widths") >= 0) await widths(b);
    if (SECTIONS.indexOf("inapp") >= 0) await inapp(b);
    if (SECTIONS.indexOf("chips") >= 0) await chips(b);
    if (SECTIONS.indexOf("trace") >= 0) await traceLayouts(b);
    if (SECTIONS.indexOf("empty") >= 0) await emptySaid(b);
    if (SECTIONS.indexOf("words") >= 0) await wordsLayout(b);
    if (SECTIONS.indexOf("flow") >= 0) await realFlow(b, SECTIONS.indexOf("video") >= 0);
    else if (SECTIONS.indexOf("video") >= 0) await videoFlow(b);
  } catch (e) {
    report(false, "the page check ran to the end", e && e.stack || String(e));
  } finally {
    if (b) {
      report(true, "analytics script 404s ignored (expected locally)", String((b.ignored || []).length) + " seen");
      await b.close();
    }
  }
  console.log(fails ? "\nPAGE CHECK FAIL (" + fails + " failing)" : "\nPAGE CHECK PASS");
  process.exit(fails ? 1 : 0);
})();
