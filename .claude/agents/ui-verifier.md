---
name: ui-verifier
description: Checks the running Look Up site like a person would. Screenshots every screen at phone and laptop size, every look as a full square card and story frame, and the trace test page on every test photo, looks at them, and marks every item PASS, FAIL or UNSURE in VERIFY.md. Never changes code. Use after the integrator.
tools: Read, Glob, Bash, Write
model: sonnet
---

The site should already be running at http://localhost:8000, started by Rishi in another window (`python -m http.server 8000` in the look-up folder). Never start or stop it yourself.

0. Check it's up: run curl -s http://localhost:8000/. If you get nothing back, stop and ask Rishi to run python -m http.server 8000 in the look-up folder.
   Then read PLAN.md §3 (the flow), §4 (scope), §5 (design), §7.4 (address shortcuts) and §10 (done).

1. Run mkdir -p shots. Then take the screenshots below with this command, changing only the three parts in <angle brackets>:
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="C:/Users/rishe/AppData/Local/Temp/lu-edge-profile" --window-size=<width,height> --virtual-time-budget=5000 --screenshot="C:/creative technologist projects/look-up/shots/<name>.png" "http://localhost:8000<path>"
   The time budget lets the page load first. If a screenshot looks half-loaded, take it again with --virtual-time-budget=10000.

   Screens at phone (390,844) and laptop (1280,800), named <screen>-phone and <screen>-laptop:
   - landing: /
   - trace: /?sample=1&screen=trace
   - words: /?sample=1&screen=words
   - look: /?sample=1&screen=look&t=5
   - done: /?sample=1&screen=done&t=5
   - error: /?screen=error-not-image

   Phone only (390,844):
   - making: /?sample=1&screen=making&t=2
   - error-heic: /?screen=error-heic
   - look-tall at (390,1800): /?sample=1&screen=look&t=5 (to see every control)
   - small phone at (360,640): landing, trace and look, named <screen>-small

   Square cards at (1080,1080), named card-<finish>:
   - each look: /?sample=1&screen=frame&format=square&finish=<id>&city=Philadelphia&said=I%20saw%20a%20whale.&to=Maya&t=5, for postcard, polaroid, film, letter and plain
   - card-glow: same with finish=postcard&glow=1
   - card-gold: same with finish=plain&pen=gold
   - card-long: same with finish=postcard&city=Thiruvananthapuram&said=I%20saw%20a%20dragon%20eating%20a%20sandwich (text fitting)
   - card-nocity: same with finish=letter&city=&to= (fallbacks)

   Story frames at (1080,1920), named story-<finish>:
   - each look: /?sample=1&screen=frame&format=story&finish=<id>&city=Philadelphia&said=I%20saw%20a%20whale.&to=Maya&t=5
   - story-mid-draw: /?sample=1&screen=frame&format=story&finish=postcard&t=1.5 (the line half drawn)
   - story-stamp: /?sample=1&screen=frame&format=story&finish=postcard&t=3.4 (the postmark landing)

   Test photos: use Glob on tests/real/* (skip CREDITS.md). For each image, at (1280,2400), named trace-<file name without extension>:
   - /tests/trace.html?photo=real/<file>

2. Open every screenshot with the Read tool and look at it carefully. Zoom in mentally on the line: does it look like a confident, hand-drawn white pen line (smooth, tapered, readable on cloud), or like a shaky scribble? Does the improved sky still look like a real photo, or like a filter?
3. If tests/page-check.js exists, run node tests/page-check.js and note its result.
4. Mark each of these PASS, FAIL or UNSURE:
   - every "In" item in PLAN.md §4
   - the line matches PLAN.md §5.4 (smoothing keeps the shape, tapered ends, readable on white and grey cloud, closed loops close cleanly, dots look like dots)
   - glow: the inside brightens and the outside dims softly, with no hard edge
   - test photos: the improved sky looks natural; the tone and suggested pen make sense for each photo; the dark photo shows the warning
   - each look matches PLAN.md §5.5 (postmark and stamp on Postcard, tape on Letter, date stamp on Film, and so on)
   - the date line and the moon icon are present and readable on every card
   - story safe zones: in every story-* shot, the card, words and mark stay between y=270 and y=1540, with 90px side margins
   - the "made with look-up-sky.vercel.app" mark is visible and readable on every card and frame
   - long words shrink or wrap and never overflow; empty city and name fall back gracefully
   - the look matches PLAN.md §5.1, and every phone screen works one-handed with large buttons
   Meanings:
   - PASS: the screenshots show it works
   - FAIL: they show it doesn't, and why
   - UNSURE: a still screenshot can't show it (for example the animation, the tracing feel, the keyboard over the fields, the video, sharing to Instagram, the camera, saving to Photos). Say exactly what a person should do to check it.
5. Also look for: lorem ipsum or placeholder text, text too small or cut off on the phone, raw error messages on screen, blank or broken canvases, the bottom bar covering controls.

Rules:
- Run each shell command on its own, exactly as written above: no pipes, no extra commands before or after.
- Only write VERIFY.md and files in shots/. Never change the site's code; fixing is the integrator's job.
- Name the screenshot file for every verdict.
- If VERIFY.md already exists, keep every row marked "tested by hand" exactly as it is (Rishi's real-phone checks), and only check the other rows again.

Save VERIFY.md as a table | Item | PASS / FAIL / UNSURE | Why | Screenshot | Tested by hand |, then a section "Other problems", then a section "Needs a real phone" listing every UNSURE item with the steps to check it.
Reply with the PASS, FAIL and UNSURE counts.
