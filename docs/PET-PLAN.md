# Walkman Pet: the green man as a desktop pet (plan, 2026-11-07)

**Status: a plan, route A plus a state file chosen by the owner on 2026-11-07; no app code is written yet.** P0 (the look) is
`docs/pet-demo.html`. Section 9 lists the decisions made and the ones still open.

## 1. What was asked

Take the green walking man of the signal box and make it a cute pet that runs on the screen, out of the pane and across
the desktop, as [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) does for Claude Code. Three styles:
**original** (the Taiwan crossing man), **cat**, **dog**.

## 2. What the reference does (read from its README and docs, 2026-11-07)

- A desktop app (its source install pulls in Electron) with a pixel pet that reacts to agent state: 12 animated states,
  a sleep sequence, a HUD, a dashboard of live sessions with a jump to the terminal, permission bubbles.
- It learns the state from **hooks** it registers in Claude Code's settings on first launch, and it listens on a local
  port (`127.0.0.1`, written to `~/.clawd/runtime.json`). Other tools can report through a **custom HTTP agent**:
  register an app in its settings, then `POST /state` with `agent_id`, `session_id`, `state`, `event`. That path is
  state-only (no approval protocol).
- It has **themes** (a folder with `theme.json` and assets), so another pet can be drawn without touching its engine.
- **Licence:** the source is AGPL-3.0. The artwork (`assets/`, `themes/*/assets/`) is *not* covered by it and is all
  rights reserved by its artists (Clawd belongs to Anthropic; Calico and Cloudling to their author). Consequences:
  copying its code would put our code under AGPL, and none of its sprites may be reused. Talking to it over HTTP, or
  shipping a theme of our own drawing, does not copy anything.

### Is it a separate app, or a Claude Code Mod? (checked in its source, 2026-11-07)

**A separate app.** Its `package.json` has `main: src/main.js`, `electron` and `electron-builder` (macOS `dmg` and `zip`,
appId `com.clawd.on-desk`) and `electron-updater`; releases are installers. It is not a Claude Code plugin or Mod: the repo
has no root `.claude-plugin`, and its `.claude-plugin` and `plugin.json` mentions are about installing *other* tools' plugins
(MiniMax, Hermes, OpenClaw). Its own `AGENTS.md` describes it as an Electron desktop pet that senses agents "through hooks,
log polling, plugins and extensions".

How it listens to Claude Code: it writes **command hooks** into Claude Code's settings (`hooks/clawd-hook.js` reads the
hook's stdin JSON and posts it to the app's local port), and it maps events to animations (`SessionStart` idle,
`PreToolUse` and `PostToolUse` working, `Stop` attention, `SubagentStart` juggling, `Notification` notification,
`PostToolUseFailure` and `StopFailure` error). It also ships a statusline script that reads rate limits and context from the
statusline JSON, and a VS Code extension that jumps back to the terminal.

On authorship: `CLAUDE.md` in that repo is a one-line pointer to `AGENTS.md`, so it is set up for coding agents, and 1 of
its last 100 commits carries a `Co-Authored-By: Claude` trailer. That does not show how much of it was written with Claude;
this plan does not rely on it.

## 3. What limits us in this repo

- The Mod draws only inside the pane, in terminal cells (or the Desktop SVG). It cannot put a window on the screen, and
  it never learns the pane's position in pixels.
- The repo's rules: `core/*.ts` is pure; `hooks/register.ts` is the only file that calls the Mod API; the Mod never
  writes to Jira or any repo; it makes no network call of its own; it reads session records only through
  `isRecordName` and never a `.key` file. The release gate audits all of these.
- The Mod API does offer `$.fs.write` and `$.process.run`, so a Mod *could* write a state file or start a program. The
  current rules were written for a read-only Mod, so doing either is a change to the rules, not a free option.
- A plugin installs only inside Claude Code. A desktop app cannot ride along in the plugin: it needs its own install.
- Facts the pet can use without any change to the Mod: `~/.claude/sessions/<pid>.json` (status `busy`, `shell`, `idle`,
  `waiting`, checked in Claude Code 2.1.316), `git worktree list` (card = branch `KEY-n-slug`), and the Jira lookup the
  Mod already runs.

## 4. Options

| | How | Gives | Costs |
|---|---|---|---|
| **A. Own companion app** (recommended) | A small separate program (own folder or repo, MIT) draws a transparent, always-on-top window. It reads the session records and the worktree list itself and reuses `core/` (lights, lead, number, figure bitmaps). | Card-aware pets with Walkman's own meaning; our art, our licence; works without the Mod. | We build and ship an app: window, sprites, packaging. |
| B. A plus a state file from the Mod | Same app, and the Mod writes `~/.walkman/state.json` so the pet also gets the reason (`Bash is waiting for...`), the TodoWrite steps and the Jira title. | The pet shows what the pane shows. | Breaks the read-only rule; needs the owner's decision and a new audit gate. |
| C. Feed Clawd | A small relay (not in the Mod) polls the session records and posts `/state` per card to Clawd; we ship our man, cat and dog as Clawd themes. | Almost no engine work; Clawd already does windows, bubbles, jump-to-terminal. | The owner installs Clawd; its states are not card-aware beyond what we post; the Clawd theme format is outside our control. |
| D. Terminal only | Draw the cat and the dog as pane sprites. | Cheap. | Not on the screen: not what was asked. |
| E. Fork Clawd | Copy its code. | Fastest to something running. | Our code becomes AGPL; its art cannot be reused. Not recommended. |

**Chosen (2026-11-07): A, with B.** The owner picked route A and agreed that the Mod may write a small state file. C stays
as the fallback if an own app proves too much work.

## 5. The three pets

Pixel art on a small grid, drawn as 1-bit shapes with a few fixed colours, shown at 4x to 6x with
`image-rendering: pixelated`. All three share one state set, so the code is the same; only the sprite sheet differs.

| | Original | Cat | Dog |
|---|---|---|---|
| Source | the existing 10 x 14 side-view man (`WALK_A`, `WALK_B` in `core/signal.ts`), grown to 4 frames (walk, run) | new, about 16 x 11, side view | new, about 18 x 12, side view |
| Look | green, head forward, arms swinging, the crossing light's walk | pointed ears, tail up with a curl | floppy ear, wagging tail, longer stride |
| Walk cycle | 4 frames | 4 frames, tail swishes | 4 frames, tail wags, ears bounce |
| Colour | green (`success`) | a card colour (`cardTone`) so two cats differ | a card colour |

States (the same five lights as the pane):

| Light | Pet |
|---|---|
| walking | runs along the bottom of the screen, speed from the card (as `runnerOf` does) |
| waiting (needs you) | stops near the terminal window, sits, an amber `⚠` bubble with the reason |
| failed | lies down, red `✕` |
| idle | sleeps, `z z z` (hidden after a while) |
| done | a short jump, then leaves or fades |

More than one card walking means more than one pet (cap 3 to 4), coloured by card as the terminal playground does.

## 6. "Running out of the pane"

The pane never reports where it is on the screen, so the exit is an effect, not a measurement:

1. **MVP:** when a card starts walking, the pet appears at the right edge of the screen and runs to its home spot above
   the Dock. The pane keeps drawing its own man.
2. **Better (optional, needs a permission):** ask macOS for the terminal window's frame (System Events, which needs the
   Accessibility permission) and start the run from the pane's side of that window.
3. **Handshake (needs B):** while the pet is out, the pane's signal box could show the man as gone (`out running`).
   Without a state file the pane cannot know the pet exists, so this stays out of the MVP.

## 7. How the companion works

- **Window:** transparent, borderless, always on top, all Spaces, click-through except over the pet. Tauri 2 (decision 2).
  The webview is TypeScript, so the drawing code can reuse the Mod's pixel tables; reading files and the window flags
  live on the Rust side. None of this is tried yet (see the P1 spike list in section 10).
- **Input, main path:** the state file (decision 4). The Mod already knows each card's light, reason, steps and
  since-time, so it writes them once and the pet only reads: one copy of the light logic, not two.
- **Input, fallback:** if the spike shows the Mod does not keep writing when no pane is open, the pet reads
  `~/.claude/sessions/*.json` itself (names matching `isRecordName` only, never a `.key` file) and `git worktree list`
  for the repos found there; map a record to a card by its worktree, as `otherSessionLights` does; add
  `lightWhileWorking` and `sinceWithWork` (work between turns, WALK-263 and WALK-265). That duplicates logic and
  would have to follow every Mod change (the `shell` status was missed once); take it only if the main path fails.
- **Output:** pets drawn on a canvas at about 8 frames a second; the loop stops when nothing walks.
- **Controls:** click a pet to focus its terminal; right-click for a menu (style, hide, quit); a setting for the style.
- **Safety:** read-only like the Mod: no Jira writes, no network of its own, no secrets read. The Jira title is optional
  and goes through the same read-only lookup.

### Mod and pet together (decision 3 does not cut them apart)

The pet is a separate app in its own repo, but it is not separate from Walkman:

1. **State file.** The Mod writes one versioned file (`schema` field first, for example `~/.walkman/state.json`); the
   pet reads it. Both repos pin the same `schema` number and a change to it is a version bump on both sides.
2. **Control.** A `/walkman pet on|off` command in the Mod starts or quits the pet; the pane says "the pet is out on the
   screen" (the P0 demo already draws that line).
3. **One home for the light logic.** `core/` stays in this repo and the Mod stays the only place that works out a card's
   light. The pet draws; it does not decide.

Cost: two repos to keep in step, and the pet only has data while the Mod runs. Whether the Mod runs and writes in a
session with no pane open is **not known**; it is the first thing P1 checks.

## 8. Risks and open points

- **Distraction and battery:** a pet that runs all day is a cost. Default to quiet (only moves while a card walks) and make
  the animation stop when idle.
- **Distribution:** an unsigned app triggers Gatekeeper; a signed, notarised build needs a developer account. Windows and
  Linux are out of the MVP (the Mod itself is not yet verified on Windows).
- **Fullscreen apps and several displays:** window level and Space behaviour need testing on the owner's machine.
- **Multiple sessions on one card or one session on several worktrees:** reuse `onePerCard`; the pet follows the lead.
- **A stale subagent** keeps a card walking up to 12 hours (WALK-276); the pet inherits that cap.
- **Art:** the cat and the dog are new drawings; nothing is taken from Clawd, Calico or Cloudling.

## 9. Decisions

Made by the owner on 2026-11-07:

1. **Route A**: an own companion app, not Clawd themes.
4. **The Mod may write a small state file** (option B), so the pet can show the reason, the steps and the title. This is a
   change to the Mod's read-only rule and is *not yet implemented*. When it is, three things change together: the rule in
   `skills/developing-walkman/SKILL.md`, a release-gate check that the Mod writes only that one file and nothing else, and
   the README's "what it touches" text. The file lives outside every repo (for example `~/.walkman/state.json`) and holds
   no secret: card key, light, the reason, steps, since-time, nothing from Jira beyond the title the pane already shows.

Made by the owner on 2026-11-08, after the sibling repos in `../git_saas` were read:

2. **Tauri 2.** The owner has `cloud-f1/tauri-app-template` (v0.3.0: Tauri 2, React 19, TypeScript, Tailwind v4,
   setup and doctor scripts for macOS, Linux and Windows, no product features) and `cloud-f1/emotion-bubble`, built from
   that template. The pet starts from the template. Both repos use ordinary windows today (no transparency, no
   always-on-top, no borderless), so those flags are new work, not something to copy.
3. **A new repo**, suggested name `walkman-pet` under `cloud-f1`. The repo is created by the owner; nobody creates it
   from here. The Mod stays in this repo and the two meet through the state file (section 7).
7. **The bubble borrows the look, not the scene.** From `emotion-bubble`: the emotion colours (single source
   `docs/research/emotion-vocabulary.json`, read through `colorOf()`) and its wording rule (neutral, never judging, no
   therapy claims). Not borrowed: the three.js soap-bubble scene (`Scene3D.tsx`, a custom shader), which is too heavy for a
   small window that stays on screen all day. The pet's bubble is drawn in CSS or SVG; three.js is considered only for a
   "pop" moment. `emotion-bubble` is `UNLICENSED` and owned by the same organisation, so reuse needs no licence step.

Still open:

5. Default: pet off until switched on, or on whenever the companion runs?
6. The cat and the dog are our own pixel art (the plan assumes this); P0 shows a first version of each.
8. Is "the emotion bubble" the owner meant the look of `emotion-bubble` (as read above), or the speech bubble over the
   pet's head? Item 7 assumes the first.

## 10. Phases and what "done" means

| Phase | Work | Done when |
|---|---|---|
| P0 | Design sheet and a clickable web demo of the three pets walking, the states, and the run across a mock screen. **Built:** `docs/pet-demo.html` (open it in a browser; no server needed) | the owner picks the look of each pet |
| P1 | Companion MVP: one pet, original style, walks while a card walks, reads session records | on the owner's Mac the pet runs while a card runs and stops when it does (real session, not a mock) |
| P2 | Cat and dog sprites, all five states, bubbles, click to focus the terminal, several pets | each state seen on screen |
| P3 | Settings, the exit effect, optional window-frame lookup, optional state file (B) | the owner signs off the behaviour |
| P4 | Packaging and a short install guide; a line in the README | a clean install on a second Mac works |

### P1 spike list (run first, each is a yes or no on the owner's Mac)

A spike is a small throwaway app from the template; nothing here ships. "Cannot check" counts as a failure.

1. **Transparent window:** a borderless transparent window shows only the drawn pixels. On macOS this is expected to need
   `macOSPrivateApi` in the Tauri config (from Tauri's docs, **not yet tried**); note what it costs for distribution.
2. **Always on top, all Spaces, no Dock icon:** the window stays above a full-screen terminal and follows to another Space.
3. **Click-through except over the pet:** clicks pass to the terminal; a click on the pet is received.
4. **Drag:** the pet can be moved and remembers where it was left.
5. **Read the state file:** the webview sees a change within 2 seconds of the Mod writing it.
6. **Does the Mod keep writing with no pane open?** Run a session without `/walkman`, change a card's light, and see
   whether the file moves. If not, fallback input (section 7) is the plan.
7. **Cost:** CPU and battery of the window idle and animating (a number, not a feeling).
8. **Several displays:** the pet runs from one screen to another.

## 11. What this plan rests on, and what it does not

- **Read:** the clawd-on-desk README, its custom HTTP agent guide, its repo layout and licence notes; this repo's
  Mod API types (`$.fs.write`, `$.process.run`) and rules; Claude Code 2.1.316's session record parser.
- **Read for decisions 2, 3 and 7 (2026-11-08):** the README, `tauri.conf.json`, Cargo and npm dependencies of
  `tauri-app-template` and `emotion-bubble`, and the `CLAUDE.md` and licence of `emotion-bubble`. `emotion-bubble-installers`
  holds only a `v0.1.0` folder and was not opened further.
- **Not verified:** that a Tauri transparent, always-on-top, click-through window behaves as needed on the owner's macOS
  and display setup (the P1 spike list); whether the Mod writes with no pane open; how the Clawd theme format treats a
  non-crab walking pet; the System Events window lookup; battery cost; the size of the art work for the cat and the dog.
