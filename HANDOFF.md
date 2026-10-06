# HANDOFF: building Look Up (Day 5)

## Before you start (Rishi)

1. **Open a new Claude Code session in this folder:** `C:\creative technologist projects\look-up`. The four agents in `.claude/agents/` only load when the session opens here.
2. **Start the local server** in a separate terminal and leave it running. Stop Underline's server first if it's still on port 8000.
   ```bash
   cd "C:\creative technologist projects\look-up"
   ```
   ```bash
   python -m http.server 8000
   ```
3. **No photos needed from you.** The build session finds free-licensed sky photos and asks you once before downloading them.
4. Paste the prompt below into the new session.

---

## The prompt to paste

```
You are the main session building Look Up, Day 5 of my 21 Days of Creative Tech. Everything is planned. Your job is to coordinate the build with the agents in .claude/agents/ and get it right the first time.

Read first, fully: PLAN.md (the single source of truth), .claude/agents/README.md (the agents and the order to use them), ../shared-kit/README.md (the family kit we copy from), and the root ../CLAUDE.md (project-wide rules, loaded automatically). Decisions are already made and listed at the top of PLAN.md. Don't reopen them.

How to run the build:
- M0 first (PLAN.md §8): find 6–8 free-licensed sky photos (Unsplash, Pexels or Wikimedia Commons) that look like real, slightly messy phone photos, plus one with an obvious shape in the clouds as the sample sky. Show me one list (file name, source page, licence, size) and wait for my okay before downloading. Save them to tests/real/ with tests/real/CREDITS.md, and the sample to assets/sample-sky.jpg (≤1600 px, ≤300 KB).
- Then follow the order in .claude/agents/README.md exactly: M1 (engine-builder) → go/no-go with me → M2 + M3 in parallel (engine-builder + site-builder) → integrator → ui-verifier → fix loop → M4 → join/verify/fix again → ship.
- Give each agent a precise task: the milestone, the PLAN.md sections it serves, and what "done" means. Agents don't see this conversation.
- After every agent finishes, read its report and open the key screenshots yourself before telling me it's done. "It passed" isn't proof; look at the actual output.
- M1 is the go/no-go. Show me full-size crops of the smoothed line on at least 3 test photos (blue, grey, sunset), with and without glow, and the before/after sky. Offer the optional Wi-Fi phone check (PLAN.md §8 M1): find this PC's Wi-Fi address with ipconfig and give me the link. Wait for my "go" and my glow choice before M2/M3.
- Keep the load on my laptop light: one heavy command at a time, never several Edge windows at once, and never start or stop the local server (I run it on port 8000).
- Stay inside this folder. Don't edit ../shared-kit/ or other projects without asking me.
- Ask me before: downloading anything, creating the GitHub repo, pushing, deploying, enabling analytics.
- If an agent's instructions conflict with PLAN.md, PLAN.md wins. Tell me about the conflict.
- Explain things to me in plain English. After each milestone, give me a short update: what works, what I should look at, and what's still unverified.

Ship (M5, with my okay at each step):
- git init (with the .gitignore from PLAN.md §6.1; tests/real/, tests/out/ and shots/ must never be committed), create keeshir-droid/look-up-sky, push.
- Create the Vercel project "look-up-sky" (address look-up-sky.vercel.app) and turn on Web Analytics.
- Write README.md with the standard sections from the root CLAUDE.md, including the sample sky photo's credit.
- Update the root ../README.md (Day 3, 4 and 5 rows) and the ../CLAUDE.md "Where we are" table (Day 5 live).
- Ask me before adding Look Up to the Day 2, 3 and 4 footers (from ../shared-kit/footer/siblings.js).
- Then hand me the real-phone checklist from VERIFY.md "Needs a real phone" (iPhone Safari, Instagram in-app browser, Android Chrome).

Start now: confirm the local server answers at http://localhost:8000, then do M0.
```

---

## What "done" looks like
- See PLAN.md §10 for the full checklist.
- **The short version:** on a real phone, photograph the sky → trace → type what you saw → Save works.
- The line looks lovely on the sky, not like a scribble.
- The postcard lands in Photos, and the story video posts to Instagram.
- It's live at `look-up-sky.vercel.app` with the footer and the made-with mark.
