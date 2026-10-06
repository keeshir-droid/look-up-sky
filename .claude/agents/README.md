# Build agents for Look Up

Four agents build this project, adapted from Day 4's (Underline). They're Claude Code subagents: each one is a Markdown file in this folder, and the main session hands work to them. All of them work from [`PLAN.md`](../../PLAN.md). §7 is the contract that keeps the two builders in step.

| Agent | Builds / does | Owns (only edits) | Can run commands? |
|---|---|---|---|
| [`engine-builder`](engine-builder.md) | Everything that touches the sky: photo in, sky improvement, trace smoothing and the white-pen line, glow, moon, date/time words, the 5 looks, the card and animation, the sample, image and video export, sharing; tests on the test photos | `src/engine/`, `tests/trace.html`, `tests/engine/` | Yes: syntax checks, small Node tests, headless Edge screenshots |
| [`site-builder`](site-builder.md) | The screens, the tracing interaction, the word fields and the warm-paper look | `index.html`, `src/app.js`, `src/styles.css` | No |
| [`integrator`](integrator.md) | Joins the two, runs the checks, fixes errors and the FAILs in VERIFY.md | Small fixes anywhere; `fonts/`, `tests/smoke.js`, `tests/page-check.js`, `tests/cdp.js`, `.gitignore`, `.vercelignore`, `.gitattributes`, `vercel.json` | Yes |
| [`ui-verifier`](ui-verifier.md) | Screenshots every screen, look, story frame and test photo, judges them, writes VERIFY.md. Never changes code | `VERIFY.md`, `shots/` | Yes: screenshots and curl only |

## The order to use them

1. **Before anything:**
   - Open the build session **inside this folder** (`look-up/`) so these agents load.
   - Rishi starts the local server in a separate terminal, inside `look-up/`, and leaves it running:
     ```bash
     python -m http.server 8000
     ```
     (Stop any other project's server on port 8000 first.)
   - **M0:** the main session finds 6–8 free-licensed sky photos and the sample sky, shows Rishi the list, and downloads them with his okay (PLAN.md §8).
2. **M1, the line:** `engine-builder` builds photo in, sky improvement, trace smoothing, the pen line and glow, plus `tests/trace.html`, and checks it on every test photo. The main session shows Rishi full-size crops (and offers the optional Wi-Fi phone check). **Rishi says go or no-go, and glow on or off by default.**
3. **M2 + M3, in parallel:** `engine-builder` (moon, words, the 5 looks, card, sample) and `site-builder` (screens). They own different files, so they can run at the same time.
4. **Join:** `integrator` makes them fit and gets the checks passing.
5. **Check:** `ui-verifier` writes `VERIFY.md`.
6. **Fix loop:** `integrator` fixes the FAILs, then `ui-verifier` checks again. Repeat until clean.
7. **M4, export and sharing:** `engine-builder`, then steps 4–6 again.
8. **Ship (M5):** the main session handles git, GitHub, Vercel and the root README/CLAUDE.md updates (agents never push). Rishi tests on a real iPhone and Android and marks those rows "tested by hand" in `VERIFY.md`.

**Things agents can't do**, so the main session does them with Rishi's okay:
- downloading anything (test photos, the sample sky)
- creating the GitHub repo, pushing, deploying, enabling analytics
- editing `../shared-kit/` or other projects (adding Look Up to the Day 2, 3 and 4 footers)

## How agents work (for editing them)

- Claude Code picks these up **when the session is opened in the `look-up` folder**.
- Each agent works in its **own fresh context** and doesn't see the main conversation. Everything it needs is in its file, PLAN.md, or the task it's given.
- If an agent's instructions conflict with PLAN.md, PLAN.md wins, and the conflict should be reported.
- After editing an agent file, start a new session (or reload agents) so the change is picked up.
