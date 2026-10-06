# PLAN.md: Look Up (Day 5)

> **Saw a shape in the clouds? Send it to someone far away.**
> Photograph the sky, trace the shape you see with your finger, and get a soft keepsake (a postcard, a polaroid, a film photo, a letter) with your words, your city and the time. Send it as an image or a story video. Free, no account, no AI, nothing uploaded.

This is the single planning file for the project. A build session opened in this folder (`look-up/`) should need only this file, the root `../CLAUDE.md` (loaded automatically), `../shared-kit/README.md` and the agents in `.claude/agents/`.

**Status (2026-10-06):** planned, nothing built. The folder holds only this file, `HANDOFF.md` and the agents. Build in a separate session, starting from `HANDOFF.md`.

**Decisions made by Rishi (2026-10-06):**
- Folder `look-up/`. Address `look-up-sky.vercel.app` (`look-up.vercel.app` is taken; `look-up-sky` confirmed free on 2026-10-06). Repo and Vercel project: `look-up-sky`.
- **City is typed by the person. The time comes from the phone's clock.**
- **One image, the person picks the look:** Postcard (the default), Polaroid, Film, Letter, Just the sky. No front/back.
- **Moon:** only a tiny icon of tonight's real moon phase next to the date, automatic. **No night mode** (no creative act in it; see §4 "Not today").
- **Test photos:** free-licensed sky photos from the web (Unsplash, Pexels, Wikimedia Commons), picked deliberately messy. Rishi tests with his own phone after deploy (and, if he wants, over Wi-Fi at M1, see §8).
- **The shared kit exists:** `../shared-kit/` (created 2026-10-06). Copy from it, never from Day 3/4 folders, unless this plan names a Day 4 file directly.
- Footer siblings: Handwriting → Font, Doodle Alive, Underline.

---

## 1. Why this, and for whom

**Audience:** young (teens to 20s), expressive, non-technical people. Not developers, not content creators.

**The behaviour, which everyone already has:**
- **Looking up and seeing shapes in clouds.** A viewer recognises it in under 3 seconds.
- **Sending the sky to someone.** Sunset photos to a group chat, "look at the sky right now" texts, long-distance friends and partners sharing "the same sky / the same moon".

**Evidence (Reddit research, Oct 5, through the Arctic Shift archive):**
- "Same moon" posts get strong engagement (r/CasualConversation, 274 upvotes).
- Sky and moon sites are big hits on r/InternetIsBeautiful (8.7k and 5.9k upvotes). That's a ready launch channel, and it bans AI sites, which we're not.
- Almost nobody has built for it. The only near neighbour found was skystories.art.

**The friction we remove:** a sky photo on its own says nothing. "I saw a whale" plus a circle drawn with your thumb in Instagram's editor looks messy. Look Up turns the moment into something designed and keepable, which says *I was thinking of you when I looked up*.

**Honest risks:**
- **The trace could look like a scribble.** This is the go/no-go at M1 (§8), judged on real photos at full size before any screens are built.
- **"Cute, used once."** The answer is the sending: every output is designed for one specific person (the optional "To" name, the city and time, the postmark).

## 2. The bar

- **The traced line looks intentional and lovely on the sky,** like a white pen drawing on a photo, not a shaky finger.
- **The sky still looks like their sky,** just on a good day: clearer, a little deeper blue, cloud detail lifted. Never an obvious filter.
- **Fast.** The photo is ready to trace in under about 1 s. The line follows the finger with no lag. The image saves instantly, and the video takes about 5 s at most.
- **Few taps.** Photo → trace → type what you saw → Save. The city is remembered after the first time.
- **Every output is pretty enough to send to someone you love** and carries the made-with mark.

---

## 3. The user flow, from the reel to the next person

### Step 0: the reel
- **What the viewer sees:** someone outside stops and points up, takes a photo, and draws over a cloud with a finger. A soft white line draws a whale onto the real sky. It turns into a postcard with a postmark ("PHILADELPHIA · 6 OCT · 7:42 PM") and "I saw a whale." in handwriting, then gets sent to a friend in another city.
- **Caption hook:** *"send someone the shapes you see in the clouds"*.
- **Getting there:** `look-up-sky.vercel.app`, on screen at the end and in the bio/link sticker.

### Step 1: landing (first 3 seconds)
- **Headline:** *"Saw a shape in the clouds? Send it to someone."*
- **A sample postcard playing:** the sample sky, the whale drawing itself on, the postmark stamping down.
- **One big button, Photograph the sky,** and a smaller *Choose a photo* link.
- **No sky handy?** *Try it on a sample sky.*
- **Trust line:** *"Free. No account. Your photo stays on your phone."*

### Step 2: photo
- Camera (a file input with camera capture) or gallery. HEIC that can't be read gets a friendly message.
- **The sky is gently improved** (§6.2). The site also quietly picks the pen colour that will show up best on this sky (§5.4).
- **Night or very dark photo:** a soft warning, *"Clouds are easier to see in daylight, but you can still draw."* It never blocks.

### Step 3: trace (the magic moment)
- **Hint over the photo:** *"Trace the shape you see."*, with a small animated finger drawing a loop around a cloud.
- **The finger draws a live line.** On release, the line **smooths** into a clean, hand-drawn white-pen stroke with tapered ends (§5.4).
- **More strokes** add more (a fin, a tail). A **tap** makes a dot (an eye!).
- **Undo** removes the last stroke and **Clear** removes them all. **Pen colour** is 3 small dots in the corner: White · Gold · Ink.
- **Next** when done. With no strokes, Next still works: a sky postcard without a drawing is fine.

### Step 4: say what you saw
One small screen, or a sheet over the preview, with three fields:
- **"What did you see?"**, placeholder *"I saw a whale."*, max 40 characters
- **"The sky over…"** (city), remembered on the phone, max 28 characters. Empty is fine: the card then says *"The sky today"*.
- **"For"** (optional name), max 20 characters. The Letter look says *"Dear Maya,"*; the others say *"for Maya"*.
- The **time is taken from the phone's clock** when the photo comes in, shown as for example *"Tue 6 Oct · 7:42 pm"* in the phone's own language and 12/24-hour style. It isn't editable (that keeps it simple and honest: it's when you sent it).

### Step 5: pick a look (live preview, one tap each)
- **Look:** Postcard · Polaroid · Film · Letter · Just the sky (§5.5)
- **Glow:** "Make it glow" (the cloud inside a closed shape brightens and the rest dims a little, §5.4). On or off by default is decided at M1.
- **Back** to edit the trace or the words.

### Step 6: keep it and send it
- **Save image** (primary): a square 1080×1080 image. On iPhone it opens the share sheet, where Save Image puts it in Photos. On Android it downloads.
- **Share story:** a 5 s 1080×1920 video (timeline in §6.4). "Making your video…" shows while the preview plays, then the button becomes **Share now**. iOS needs a fresh tap to open the share sheet.
- **Every output carries** *made with look-up-sky.vercel.app*.
- **File names:** `look-up-<city-slug>-<YYYY-MM-DD>.jpg` / `.mp4`, or `look-up-<YYYY-MM-DD>` with no city.

### Step 7: done
- *"Saved."* A one-line nudge, *"Send it to someone who's far away."*
- Then Share story / Save image again, **Trace again** (same photo, back to the editor), and **New sky**.

### Step 8: the next person (growth loop)
- A friend gets a postcard of the sky over their friend's city with a whale drawn on it, made for them.
- **Their thought:** "I want to send one back." They type the address from the mark and land on Step 1.

### Returning visit
- Remembers the city, last look, pen colour and glow (on the device only).
- **Photograph the sky** → trace → Save takes about 15 seconds.

---

## 4. Scope for today

### In
- Photo intake: camera, gallery, paste on desktop, HEIC message, dark-photo warning.
- Gentle sky improvement and an automatic pen colour suggestion.
- Tracing: live line, smoothing on release, dots, several strokes, undo, clear, 3 pen colours.
- "Make it glow" for closed shapes.
- Words: what you saw, city (remembered), optional "for" name, automatic date and time, tiny moon-phase icon.
- 5 looks: Postcard, Polaroid, Film, Letter, Just the sky.
- Square image (JPEG 1080×1080) and story video (MP4 1080×1920, 5 s).
- Share sheet with save fallbacks, good file names.
- Built-in sample sky (a free-licensed photo, credited) with a preset whale trace, for the landing demo and "Try it on a sample sky".
- Remembers settings on the device. "More from Risheek" footer. Made-with mark on every output.
- Vercel Web Analytics (page views). README with the standard sections. Live on its own address.

### Not today (goes in the README's "next steps")
- **Night mode** (a drawn moon placed on a dark sky). Dropped: there's no creative act in it.
- Bringing in your handwriting font from Day 2 for the message (a strong family link for later, using the export/import format in `../handwriting-font-converter/docs/format.md`).
- "Send yours back" reply link; a postcard back side; story-format still image; 4:5 feed format.
- Snapping the line to cloud edges; stickers.
- Add to Home Screen / offline.

---

## 5. Design

### 5.1 The look: the family, under an open sky
- Copy `../shared-kit/tokens.css` (warm paper, ink-blue pills, serif headings, Caveat). Always light.
- **Feel:** a postcard rack in a sunny shop. Warm paper UI, and the sky photo is the only big colour on screen.
- **Accents for this site only:** sky-blue tint `--sky: #dbe9f6` for the landing's soft background wash, and postmark ink `--postmark: #2c3e5c`.
- Primary buttons are 56px ink-blue pills; chips are 44px.

### 5.2 Voice
- Short, warm, a little wistful, talking to the person: *Look up. Trace what you see. Send it to someone far away.*
- Never "upload", "process", "render", "filter", "AI" or "generate".

### 5.3 Screens (phone first at 390×844, one-handed)
1. **Landing:** headline, the animated sample postcard, Photograph the sky, Choose a photo, Try it on a sample sky, trust line, footer.
2. **Trace:** the photo fits the width (as tall as fits above the bar). Hint on first use, pen dots top-right, bottom bar with Undo · Clear · **Next**.
3. **Words:** the three fields over a small live preview, then **Next**. The city is pre-filled when remembered. The keyboard must not hide the field being typed in.
4. **Look:** the live preview card, look chips (5, scrolling sideways if needed), the Glow toggle, a sticky bottom bar with **Save image** (primary) · **Share story**, and a small "Edit words / Edit drawing" link.
5. **Making video:** the preview keeps playing, "Making your video…" with progress.
6. **Done:** see §3 Step 7.
7. **Errors** (one friendly message plus one button): not an image, HEIC, video not supported (offer the image).

Desktop: the same screens centred in a 480px column, with paste-a-photo support.

### 5.4 The line (the most important visual)
**Smoothing** (on release; a non-artist's finger trace has to come out looking intentional):
1. Drop points closer than 0.3% of the photo's short side.
2. Simplify (Ramer–Douglas–Peucker, tolerance about 0.25% of the short side) to remove jitter but keep the shape.
3. Rebuild as a smooth curve (centripetal Catmull–Rom, sampled every 0.4% of the short side).
4. **Close the shape** if the ends are within 4% of the short side *and* the stroke is longer than 15% of it. The ends then join smoothly.
5. A stroke shorter than 1% of the short side becomes a **dot** (diameter about 2.2× the line width).

**Drawing ("white pen on a photo"):**
- **Core line:** width about 0.55% of the photo's short side, measured at output size (about 5–6 px on a 1080 card). It varies ±20% with the finger's speed (slower is a little thicker, like real ink), and tapers over the first and last 6% of its length.
- **Soft glow** under it, in the pen colour: about 3× the width, blurred, 30% opacity. It makes the line read on bright skies.
- **A faint shadow**, `rgba(20,30,50,.15)`, offset 1px and blurred 2px, so a white line still reads on white cloud.
- **Pens:**
  - White `#ffffff` (default)
  - Gold `#ffd27a` (lovely on sunsets)
  - Ink `#1f3a5f` (for bright, overcast grey skies)
- **Suggested pen:** if the sky's median brightness is high and its colour is low (overcast or haze), suggest Ink. Otherwise suggest White. The person can always change it.

**"Make it glow"** (only for strokes that closed into a shape):
- Inside the shape: brighten about 12% (screen blend) plus a slight lift in local contrast, so the cloud seems lit from within.
- Outside: dim about 15% toward the sky's average colour.
- 30px soft feather at the edge.
- If there's no closed shape, the toggle is greyed out with the hint *"Close your shape to make it glow"*.

**M1 shows both looks** (line only, and line plus glow) on every test photo. Rishi picks the default.

### 5.5 The looks (the card around the sky)
In every look:
- The **sky crop** keeps the drawing centred, with a little sky around it (crop to the strokes' bounding box plus 25% padding, grown to the look's window shape; no strokes means the centred photo).
- The **words** come from §3 Step 4. The **date line** is *"Tue 6 Oct · 7:42 pm"* followed by the moon icon (§6.5).
- The **made-with mark** sits bottom-right, 22px (26 on stories), at 55–70% opacity, readable on its background.
- Everything is **drawn in code** (paper, tape, grain, stamps), with no images from the web except the sample sky photo.

| Look | Square card (1080×1080) | Story frame (1080×1920) |
|---|---|---|
| **Postcard** (default) | A landscape 3:2 postcard tilted −1.5° on warm paper with a soft shadow. The photo sits inside a thin white border. Top-right: a **perforated stamp** (scalloped edge, a tiny crop of their own sky, "LOOK UP" in small caps), overlapped by a **round postmark** in `--postmark` ink at 75% (double ring, the city around the top, the date around the bottom, the time and moon icon in the middle, wavy cancellation lines running left, with slight ink unevenness). The words are in Caveat on a white strip under the photo: *"I saw a whale."* and *"for Maya"* | A portrait 2:3 postcard, same parts, larger |
| **Polaroid** | Adapt the Polaroid from `../underline/src/engine/finishes.js`: a white instant-photo frame tilted −2° on soft warm grey. The words are in Caveat on the bottom strip; the city and date line small at its right | Same, larger |
| **Film** | Adapt Film from `../underline/src/engine/finishes.js`: full-bleed sky, fine grain, warm fade, a soft light leak, the orange 7-segment date stamp. The words and city sit in the film-border strip | Same, full-bleed |
| **Letter** | A sheet of cream letter paper with faint ruled lines and paper grain. The sky photo is taped near the top (a washi-tape strip, tilted ~2°; adapt the tape from Underline's Torn finish). Below, in Caveat ink-blue: *"Dear Maya,"* (only if a name is given), the words, then *"the sky over Philadelphia, Tue 6 Oct · 7:42 pm"* with the moon icon | Same, the photo larger |
| **Just the sky** | The full-bleed sky and the drawing. Bottom-left, a quiet caption in white serif with a soft shadow: the words on one line, then *"Philadelphia · 7:42 pm"* with the moon | Same, full-bleed |

- **Story safe zones:** keep the card, words and mark between y=270 and y=1540, with 90px side margins. The sky itself may run full-bleed behind.

---

## 6. Tech

Plain HTML, CSS and JavaScript, no build step, no framework. Classic scripts attach to `globalThis.LU`. Every engine file must load in Node without touching `document` or `window` at load time.

### 6.1 Files

```
look-up/
├── index.html
├── assets/
│   └── sample-sky.jpg    the sample sky (free licence, ≤1600 px long side, ≤300 KB); credit in README
├── src/
│   ├── app.js            site-builder: screens, state, events; MAKER_NAME + SIBLINGS + footer from ../shared-kit/footer/
│   ├── styles.css        site-builder: starts from ../shared-kit/tokens.css + ../shared-kit/footer/footer.css
│   └── engine/           engine-builder
│       ├── util.js       from ../shared-kit/engine/util.js; namespace UL → LU; the constants block replaced with §7.3; messages adapted (§7.2)
│       ├── decode.js     from ../shared-kit/engine/decode.js; UL → LU; DEFAULT_MAX_SIDE 2000
│       ├── sky.js        new: gentle improvement, tone, suggested pen, dark warning
│       ├── trace.js      new: smoothing, dots, closing, the pen drawing, the glow mask, draw-on by length
│       ├── moon.js       new: moon phase from a date, the tiny moon drawing
│       ├── words.js      new: date/time formatting from the device, slugs, text fitting
│       ├── finishes.js   new: the 5 looks; Polaroid, Film and the tape adapted from ../underline/src/engine/finishes.js
│       ├── card.js       new: the card object (settings, drawFrame, preview loop, editor view); pattern from ../underline/src/engine/card.js
│       ├── sample.js     new: loads assets/sample-sky.jpg, with a preset whale trace and preset words
│       ├── export.js     from ../shared-kit/engine/export.js; UL → LU; fileName per §3 Step 6
│       ├── share.js      from ../shared-kit/engine/share.js; UL → LU; fallback name "look-up"
│       └── vendor/       mp4-muxer.js + LICENSE-mp4-muxer.txt, from ../shared-kit/engine/vendor/
├── fonts/                caveat-600.woff2 + OFL.txt, from ../shared-kit/fonts/
├── tests/                never deployed
│   ├── smoke.js          integrator: every LU name exists (pattern from ../underline/tests/smoke.js)
│   ├── page-check.js     integrator: headless Edge (copy and adapt ../underline/tests/page-check.js and cdp.js)
│   ├── trace.html        engine-builder: the M1 test page (§7.4)
│   ├── engine/           engine-builder: small Node tests (smoothing, closing, dots, moon phase, slugs, date formats)
│   └── real/             test sky photos (gitignored), with CREDITS.md listing source and licence
├── shots/                ui-verifier screenshots (gitignored)
├── notes/
├── README.md, VERIFY.md
├── .gitignore            copy ../underline/.gitignore
├── .vercelignore         copy ../underline/.vercelignore
├── .gitattributes        copy ../underline/.gitattributes
└── vercel.json           copy ../underline/vercel.json, add a long-cache rule for /assets/
```

**Copy, never link.** Never edit anything outside `look-up/`. If a kit file needs a fix, report it; the main session updates `../shared-kit/` with Rishi's okay.

**Script order in `index.html`:**
`util, decode, sky, trace, moon, words, finishes, card, sample, export, share`, then `app.js`. The muxer is loaded by `export.js` only when a video is made.

### 6.2 Photo in and the sky
- `decode.js` as in the kit, `maxSide` 2000.
- **Improve** (at most about 300 ms on a mid-range phone; work on a copy at ≤1200 px for the statistics, apply at full size):
  1. Auto-levels from the 0.5% and 99.5% luminance percentiles, applied gently (blend 60%).
  2. **Clarity** for cloud detail: a large-radius local-contrast boost (the image minus a box-blurred copy at radius about 2% of the short side, from `LU.util.boxBlur`, added back at about 25%). Weight it toward mid and high brightness so clouds gain texture while dark rooftops don't get crunchy.
  3. **Sky vibrance:** +12% saturation on blue/cyan hues only, protecting skin-like and already-saturated colours.
  4. A touch of warmth: +2% red, −1% blue in the highlights.
- **Tone:** `"day" | "sunset" | "grey" | "dark"`, from median brightness, saturation and hue.
- **Suggested pen:** Ink for `grey`; Gold for `sunset`; otherwise White.
- **Dark warning** if the median brightness is under about 18%.

### 6.3 Tracing
- **Live:** the site collects pointer points (screen → photo pixels) with timestamps and calls `LU.card.drawEditor` with the live points every animation frame. The live line is drawn simply (round caps, constant width, the pen colour) for speed.
- **On release:** `LU.trace.finish(sky, points)` runs §5.4's smoothing and returns the stroke. The site animates from the live line to the smoothed stroke over 120 ms (cross-fade).
- Speed comes from the timestamps (pixels per millisecond, smoothed) and becomes the width variation.
- **Glow region:** the union of closed strokes' polygons is rasterised into a mask at card scale, feathered with a blur. Cache it per stroke set and size.
- **Draw-on animation:** each stroke is revealed by length (`setLineDash` / `lineDashOffset`, or by drawing the curve up to a fraction of its points), one after another, with an ease-in-out per stroke. Dots pop in (scale 0 → 1.15 → 1) in their turn.

### 6.4 The card and animation
- `card.drawFrame(ctx, t, format, scale)` is the single drawing function for the preview, the still image and the video:
  - `format` is `"square"` or `"story"`
  - `scale` 1 = full size
  - `t` runs from 0 to `END` (5.0)
- **Timeline:**
  - 0–0.6 s: the sky settles (scale 1.05 → 1, fade in). A very slow drift (about 1.5% across the whole 5 s) keeps the sky feeling alive.
  - 0.6–2.4 s: the strokes draw on, in the order they were drawn.
  - 2.4–3.2 s: the glow comes in (if on), and the words write in (a left-to-right reveal of the Caveat text).
  - 3.2–3.7 s: the postmark stamps down (Postcard: scale 1.25 → 1 with a tiny overshoot, ink at full strength), or the date line fades in (other looks).
  - 3.7–5.0 s: hold.
- **The still image is `drawFrame(t = END)`.** The preview loops 0 → END with a 1 s pause.
- **Cache the static layers** (the look's background, paper, the improved sky crop) and rebuild them only when the look, crop, words or format change.

### 6.5 Words, time and moon
- **When:** `Date` captured when the photo comes in (`settings.when`, ms).
- **Format** with `Intl.DateTimeFormat(undefined, …)`: weekday short, day, month short, and the time in the phone's own 12/24-hour style. For example: `Tue 6 Oct · 7:42 pm` / `Di. 6. Okt. · 19:42`. Film's 7-segment stamp uses `MM DD 'YY` digits.
- **Moon phase:** age = days since the new moon of 2000-01-06 18:14 UTC, modulo 29.530588853. Illuminated fraction = (1 − cos(2π·age/29.53))/2, waxing when age < 14.77.
- **Moon drawing:** a disc in the date-line colour at 25% for the dark part, the lit part at full colour, with the terminator as an ellipse.
  - Diameter about 0.9× the date text's cap height.
  - Lit side on the right while waxing (northern hemisphere). Flip it if the phone's time zone is in the southern hemisphere: `Intl.DateTimeFormat().resolvedOptions().timeZone` starts with `Australia/`, `Pacific/Auckland`, `America/Sao_Paulo`, `America/Argentina`, `America/Santiago`, `Africa/Johannesburg` and similar (a short list is enough).
- **Text fitting:** words shrink to fit their space down to 70% of the normal size, then wrap to 2 lines. They never overflow.
- **Slug:** lower case, a–z0–9 and hyphens, max 30 characters. Non-Latin city names become no slug (the date file name is used instead).

### 6.6 Export, saving and sharing
- **Image:** draw `t = END` at 1080×1080 and save as JPEG quality 0.92.
- **Video:** the kit's `export.js` as is: 5 s, 30 fps, 1080×1920; WebCodecs + mp4-muxer, MediaRecorder fallback; `AbortSignal`.
- **Sharing:** the kit's `share.js`. Share the file only, with no text (some apps drop the file when text comes with it; the made-with mark carries the address).
  - Make the image as soon as the look settles, so Save is instant.
  - Make the video only when Share story is tapped; then **Share now** on a second tap.
- **Remembered on device** (`localStorage`, wrapped in try/catch): city, last look, pen, glow, "hint seen". The page works fine without it.

---

## 7. The contract between screens and engine

The site-builder and engine-builder work in parallel. **This section keeps them in step.** Names, inputs and results must match exactly.

### 7.1 Who owns what
| Owner | Files |
|---|---|
| site-builder | `index.html`, `src/app.js`, `src/styles.css` |
| engine-builder | `src/engine/` (all), `tests/trace.html`, `tests/engine/` |
| integrator | small fixes anywhere; `fonts/`, `tests/smoke.js`, `tests/page-check.js`, `tests/cdp.js`, `.gitignore`, `.vercelignore`, `.gitattributes`, `vercel.json` |
| ui-verifier | `VERIFY.md`, `shots/` |
| main session | downloads (test photos, the sample sky), `assets/`, `tests/real/`, git, GitHub, Vercel, `README.md`, `../shared-kit/`, root `../README.md` and `../CLAUDE.md` |

### 7.2 Errors
Engine functions reject with `Error` objects carrying `{ code, title, detail }`. Here `title` and `detail` are friendly, ready to show.

Codes:
- `not-image`, `heic`, `unreadable`
- `dark` (a warning only: *"Clouds are easier to see in daylight."* / *"You can still draw on it."*)
- `video-unsupported`, `cancelled` (the site ignores this one)
- `export-failed`

### 7.3 Names
**Constants**
- `LU.PENS = [{ id: "white", hex: "#ffffff" }, { id: "gold", hex: "#ffd27a" }, { id: "ink", hex: "#1f3a5f" }]`
- `LU.FINISHES = [{ id: "postcard", name: "Postcard" }, { id: "polaroid", name: "Polaroid" }, { id: "film", name: "Film" }, { id: "letter", name: "Letter" }, { id: "plain", name: "Just the sky" }]`
- `LU.DEFAULTS = { finish: "postcard", pen: "white", glow: false, said: "", city: "", to: "", when: 0 }` (`glow` default set after M1)
- `LU.END = 5.0`

**Photo in**
- `LU.decode.fileToImageData(file, { maxSide }) → Promise<ImageData>`

**The sky**
- `LU.sky.prepare(imageData) → Promise<Sky>`
  - `sky.width`, `sky.height`
  - `sky.image`: the improved canvas or ImageBitmap
  - `sky.tone`: `"day" | "sunset" | "grey" | "dark"`
  - `sky.suggestedPen`: a `PENS` id
  - `sky.warning`: `null` or `"dark"`

**Tracing**
- `LU.trace.finish(sky, points) → Stroke`, where `points` is `[{ x, y, t }]` in sky pixels, `t` in ms.
  - Result: `{ kind: "line" | "dot", points: [{ x, y, w }], closed: boolean, length, seed }`. `w` is the relative width (around 1).
  - Never returns null.
- `LU.trace.hasClosed(strokes) → boolean`

**Words and moon**
- `LU.words.when(ms) → { line: "Tue 6 Oct · 7:42 pm", date: "Tue 6 Oct", time: "7:42 pm", stamp: "10 06 '26", iso: "2026-10-06" }`
- `LU.words.slug(text) → string` (may be empty)
- `LU.moon.phase(ms) → { age, fraction, waxing, name }`
- `LU.moon.draw(ctx, x, y, diameter, ms, color)`

**The sample**
- `LU.sample.load() → Promise<{ sky, strokes, settings }>`: the sample sky, prepared, with the preset whale strokes and `settings` of `{ said: "I saw a whale.", city: "<the city the photo was taken in, or a fitting one>", to: "" }`.

**The card**
- `LU.card.create(sky, strokes, settings) → Promise<Card>`: resolves once fonts are ready.
  - `card.settings`: current settings, defaults filled in
  - `card.update(partialSettings) → Promise<void>`
  - `card.setStrokes(strokes)`
  - `card.drawFrame(ctx, t, format, scale)`: see §6.4. Must tolerate any `t` (clamp) and a 0×0 canvas.
- `LU.card.startPreview(canvas, card, format) → { stop(), setFormat(format), setCard(card) }`: loops the animation, sized to canvas × devicePixelRatio (capped at 2), pauses when hidden.
- `LU.card.drawEditor(canvas, sky, strokes, livePoints, pen)`: the trace view (the improved sky with the smoothed strokes and the live line, no look).

**Export**
- `LU.export.support() → Promise<{ video: boolean, method: "webcodecs" | "mediarecorder" | null }>`
- `LU.export.makeImage(card) → Promise<File>`: JPEG 1080×1080
- `LU.export.makeVideo(card, { onProgress, signal }) → Promise<File>`: MP4 (or WebM fallback) 1080×1920, 5 s
- `LU.export.fileName(settings, ext) → string`

**Sharing**
- `LU.share.platform()`, `LU.share.canShare(file)`, `LU.share.share(file)`, `LU.share.save(file)`: as in the kit

### 7.4 Dev shortcuts in the address (for checks and screenshots)
- `?sample=1`: start in the trace screen with the sample sky
- `&screen=landing|trace|words|look|making|done|frame|error-heic|error-not-image`
- `&finish=<id>&pen=<id>&glow=0|1&said=...&city=...&to=...&when=<ms>`
- `&format=square|story&t=<seconds>`: with `screen=frame`, draw that one frame full size on a 1080-wide canvas and stop the animation
- **`tests/trace.html?photo=real/<file>`:** shows the original and improved sky side by side, then 4 **simulated finger traces** drawn over it:
  - a wobbly closed whale-like loop with uneven speed and finger jitter (noise at 2–4 px, 8–15 Hz)
  - a quick open swoosh
  - a heart
  - two taps (dots)

  Each is shown raw (as captured) and smoothed, in both looks (line only, line + glow), and in the suggested pen. Plus the tone, the suggested pen and the timings.
- **`tests/trace.html?draw=1`:** choose any photo and trace with a real finger (pen dots, glow toggle, undo). This is for Rishi's M1 phone check over Wi-Fi.
- The site keeps `window.__lookup = { screen, settings, sky, strokes, card }` current, so scripts can call `LU.export.makeVideo(window.__lookup.card)`.

---

## 8. Milestones (check on a phone-sized screen after each)

**M0. Test material (main session, before anything; Rishi okays the download list once).**
- **Find 6–8 free-licensed sky photos** (Unsplash, Pexels or Wikimedia Commons; CC0, public domain or the Unsplash/Pexels licence). Pick them to look like real phone photos:
  - fluffy cumulus on blue (the easy case)
  - overcast grey
  - sunset or golden hour
  - rooftops or power lines along the bottom
  - trees at the edge
  - hazy, pale blue
  - a portrait-orientation shot
  - a dark dusk sky (to trigger the warning)
- **Show Rishi the list:** file name, source page, licence and size. Then download to `tests/real/` and write `tests/real/CREDITS.md`.
- **Pick one with an obvious shape** (a whale, dog or bird in the clouds) and a clear free licence as the **sample sky**. Save it to `assets/sample-sky.jpg` (≤1600 px, ≤300 KB), and note its credit for the README.

**M1. The line: go / no-go (engine-builder, about 1 h).**
- Build `decode`, `sky`, `trace` (smoothing, pen, glow) and `tests/trace.html`.
- Screenshot every test photo, and **look at it**.
- **Show Rishi** full-size crops of the smoothed line on at least 3 photos (blue, grey, sunset), in both looks.
- **Optional, about 5 minutes, recommended:** Rishi opens `http://<this PC's Wi-Fi address>:8000/tests/trace.html?draw=1` on his phone (same Wi-Fi) and traces with his own finger. Windows may ask whether to allow Python on the network; Rishi answers that prompt himself. If it doesn't connect, skip it; the deploy test covers it.
- **Rishi decides:** does the line look lovely, and is Glow on or off by default? If it looks like a scribble, fix the line before anything else.

**M2 + M3 in parallel (about 1.5 h).**
- engine-builder: `moon`, `words`, `finishes` (5 looks), `card`, `sample`.
- site-builder: all screens from §5.3, using the §7 names.

**Join (integrator):** smoke and page checks passing. Then ui-verifier writes `VERIFY.md`, and the fix loop runs until it's clean.

**M4. Export and sharing (about 30–45 min; mostly kit code).** Image, video, file names, share/save, the done screen. Then join, verify and fix again.

**M5. Ship (main session with Rishi's okay at each step).**
- `git init` (tests/real/, tests/out/ and shots/ never committed), create the repo `keeshir-droid/look-up-sky`, push.
- Vercel project `look-up-sky` (address `look-up-sky.vercel.app`; fallback `sky-postcard`), and enable Web Analytics.
- README with the standard sections, the sample photo's credit and a demo GIF.
- Rishi tests on a real iPhone and Android and marks the rows "tested by hand" in `VERIFY.md`.
- **Root updates:**
  - `../README.md` gets the Day 3, 4 and 5 rows
  - `../CLAUDE.md` "Where we are" gets Day 5 live
- **With Rishi's okay** (these touch other projects): add Look Up to the footers of Day 2, Day 3 and Day 4, using `../shared-kit/footer/siblings.js`.

---

## 9. Risks and what we do about them

| Risk | Plan |
|---|---|
| The trace looks like a scribble | It's M1's go/no-go, on real photos at full size: smoothing, tapering, glow and shadow, plus the "white pen on a photo" style people already find charming. Rishi traces with his own finger at M1 if Wi-Fi allows |
| A white line disappears on white or grey cloud | A faint dark shadow under the line, plus the suggested Ink pen for grey skies |
| The improved sky looks filtered | Gentle blends (60%, 25%, +12%), judged on the before/after in `tests/trace.html` |
| Video export slow or unsupported on iOS | Kit export (WebCodecs first, MediaRecorder fallback); the image is always available |
| Share sheet needs a fresh tap on iOS | Make files before the tap; the video's Share is a second tap |
| Instagram in-app browser quirks (camera, downloads) | Test from a real Instagram link on both phones; if saving fails in-app, show "Open in your browser" with steps |
| Wrong moon side in the southern hemisphere | Time-zone flip list (§6.5); the icon is tiny either way |
| Stock test photos are cleaner than real phone shots | Pick messy ones on purpose (M0); Rishi's real-phone test after deploy is the final word |

## 10. Definition of done

On top of the root `../CLAUDE.md` checklist:
- [ ] On real sky photos, the traced line looks intentional and lovely (Rishi's judgement)
- [ ] Photo → trace → words → Save works on a real iPhone (Safari and the Instagram in-app browser) and a real Android (Chrome)
- [ ] The saved image lands in Photos / Gallery with a sensible file name
- [ ] The city is remembered, and the time is right in the phone's own format
- [ ] All 5 looks read well, and the story video posts to Instagram inside the safe zones
- [ ] Made-with mark on both outputs; "More from Risheek" footer; analytics on
- [ ] README (with the sample photo credit and a demo GIF), live address, root README and CLAUDE.md updated
