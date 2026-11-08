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
  Found in the spike (item 6 below): one Mod instance runs per Claude Code session and knows only its own session, so the
  file is one per session (for example `~/.walkman/state/<session>.json`) and the pet merges them. A session that is killed
  never writes again, so every file carries a written-at time and the pet ignores a file older than a few seconds beyond
  its refresh interval ("when does the next update never come?").
- **Input, fallback:** if the Mod cannot write when no pane is open, the pet reads
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

Answered by the owner on 2026-11-08 (second round):

5. **On whenever the app runs.** No separate "pet on" switch inside the app; `/walkman pet off` still quits it.
8. **The bubble is the look of the `emotion-bubble` repo** (item 7 stands).
6. **The cat and the dog: "ok"**, read as accepting the P0 look as the first version and moving on. The owner did not say
   what to change, so any change comes later from seeing them on screen.
- **Repo name `walkman-pet`: yes.** The repo is **not created yet**; nobody has said who creates it. The spike below was
  built outside every repo so this does not block it.

Still open: who creates `walkman-pet` (owner, or this session on a clear go).

## 10. Phases and what "done" means

| Phase | Work | Done when |
|---|---|---|
| P0 | Design sheet and a clickable web demo of the three pets walking, the states, and the run across a mock screen. **Built:** `docs/pet-demo.html` (open it in a browser; no server needed) | the owner picks the look of each pet |
| P1 | Companion MVP: one pet, original style, walks while a card walks, reads session records. **Built:** the Mod writes the state file (v0.18.0, WALK-292); the app is `cloud-f1/walkman-pet` (private), started from `tauri-app-template` | on the owner's Mac the pet runs while a card runs and stops when it does (real session, not a mock). **Not yet:** only a state file written by the Mod's own builder was read, no real session has written one |
| P2 | Cat and dog sprites, all five states, bubbles, click to focus the terminal, several pets. **Built:** the pane's real side-view man, the cat, the dog, a bubble for an ask or a failure, a right-click menu to choose the pet and to quit (WALK-299) | each state seen on screen. **Not yet:** click to focus the terminal; several pets at once; the cat and the original man asking or failed were not looked at |
| P3 | Settings, the exit effect, optional window-frame lookup, optional state file (B). **Built (2026-11-08, as the owner asked):** click the pet to bring the card's terminal forward (WALK-304), `/walkman pet on|off|status` and the `own` mark in the state file (v0.19.0, WALK-307), an unsigned macOS `.dmg` (WALK-310). **Not built:** settings, the exit effect, the window-frame lookup | the owner signs off the behaviour. **Not yet:** the owner has not used it from a real session |
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

### Build status, 2026-11-08

| Piece | Where | State |
|---|---|---|
| State file writer | this repo, `core/petstate.ts` and `writePetState` in `hooks/register.ts`, v0.18.0, gate `auditWrites` | released; one file per session; a real session writing it has **not** been seen (the owner's Claude Code was not yet on 0.18.0) |
| The pet app | `cloud-f1/walkman-pet` (private), Tauri 2, 30 TypeScript and 11 Rust tests | runs on the owner's Mac (debug and release); the man running, the dog running and lying down, the menu, Dog, Quit, and one click bringing Ghostty to the front from Claude (a real session id, a synthetic click) were seen |
| Terminal focus | `src-tauri/src/focus.rs` | best effort: the terminal **app** comes forward, not the tab or window; with an older Mod two sessions listing one card can pick the wrong session, `own` (v0.19.0) fixes that once a real session writes it |
| Pet control | this repo, `core/petcontrol.ts`, v0.19.0 | `open -a`, `pkill -x`, `pgrep -x` were run against the real app and exited as the Mod expects; on a Mac that built the app `open -a "Walkman Pet"` already finds it in the build folder |
| Installer | `npm run build:mac` in walkman-pet | `.dmg` 1.86 MiB, checksum valid, ad-hoc signed only; release build 0.2 to 0.9 % CPU and about 20 MB (the app process, not WebKit's web-content process); not tried on a second Mac |
| Not built | | several pets at once; settings; the exit effect; signing and notarising; an app icon of its own |

Things found while building that the plan did not say: the app's first man was drawn from memory (a front view) and was replaced
by the pane's own bitmaps (the README had claimed they were the same); a click on the menu within about 50 ms of opening it falls
through to the window below, because the window needs one 50 ms tick to start taking clicks; macOS spends the first click on a
background app just activating it, so without `acceptFirstMouse` a click on the pet never reached the page; a drag region swallows a
click, so the drag is started by hand after 4 px; a state file is stale after 90 s, which a test that waits longer must keep refreshing.

### P1 spike results (WALK-288, 2026-11-08, the owner's Mac, a throwaway app outside every repo)

The spike was `tauri-app-template` with one 260x240 window and a 120x120 canvas: transparent, borderless, always on top,
visible on all workspaces, no Dock icon (activation policy Accessory), a 50 ms thread that switches click-through on and off
by the pointer position, a drag region on the pet, and a 500 ms reader of a state file. It was built and run (a debug build,
Rust 1.99, Tauri 2.11) and then deleted.

| # | Item | Result | What backs it |
|---|---|---|---|
| 1 | Transparent window | **Yes** | Capturing only that window gave 249,600 pixels, 177,700 fully transparent, 71,712 opaque. It needs `app.macOSPrivateApi: true` and the `macos-private-api` feature of the `tauri` crate; that is a private macOS API, which rules out the Mac App Store (an unsigned `.dmg`, as planned, is not affected) |
| 2 | Always on top, all Spaces, no Dock icon | **Partly** | The window sits at level 5 (a normal window is 0) and is on screen. **Not checked:** above a full-screen app, following to another Space, the missing Dock icon |
| 3 | Click-through except over the pet | **Partly** | The log shows the switch going true and false as the pointer moved on and off the pet. **Not checked:** a click on the terminal actually passing through, and a click on the pet arriving (the spike logged no clicks) |
| 4 | Drag | **Partly** | The window moved in steps (2420,1432 to 2346,1208 to 2324,1104 to 2322,1102, later 2452,1204) with the pointer over the pet, which looks like the owner dragging it. **Not checked:** remembering where it was left (the spike does not save a position) |
| 5 | Read the state file | **Yes** | Seen 93, 404 and 402 ms after three writes, with a 500 ms poll; the limit was 2 seconds |
| 6 | Does the Mod write with no pane open? | **Yes by reading the code, not run** | `turn.start`, `turn.complete` and `tool.check` in `hooks/register.ts` call `mark()` and none of them looks at `paneOpen`; only the title and the animation timer do. A write inside `mark()` would therefore run with no pane. Writing is not implemented, so this was not run. Consequence: one file per session (section 7) |
| 7 | Cost | **Partly** | The app process used 0.9, 4.6 and 2.9 percent CPU in three samples, in a debug build, with the 50 ms thread, an 8 frames a second canvas and the 500 ms reader. **Not measured:** WebKit's separate web-content process, battery, a release build |
| 8 | Several displays | **Not checked** | The owner's window ended up on a second display (its position is beyond the first screen's width) but running from one display to the other was not watched |

What the spike changes in the plan:

- The Tauri route works for the parts that were run (1, 5, and the switch in 3). The 50 ms polling thread for click-through is a
  guess at the cheapest way; a release build and the web-content process must be measured before P1 is called done.
- Items 2, 3 (a real click), 4 (position kept) and 8 need the owner's eyes and hands on the real app, not on a spike.
- `macOSPrivateApi` is a small, known cost of transparency; it belongs in the install guide (P4).

## 11. What this plan rests on, and what it does not

- **Read:** the clawd-on-desk README, its custom HTTP agent guide, its repo layout and licence notes; this repo's
  Mod API types (`$.fs.write`, `$.process.run`) and rules; Claude Code 2.1.316's session record parser.
- **Read for decisions 2, 3 and 7 (2026-11-08):** the README, `tauri.conf.json`, Cargo and npm dependencies of
  `tauri-app-template` and `emotion-bubble`, and the `CLAUDE.md` and licence of `emotion-bubble`. `emotion-bubble-installers`
  holds only a `v0.1.0` folder and was not opened further.
- **Run for P1 (2026-11-08):** a throwaway Tauri window on the owner's Mac (results table in section 10); the Mod source
  for item 6 (read, not run).
- **Not verified:** above a full-screen app and across Spaces; a real click passing through, and a click on the pet; the
  position being kept; two displays; the web-content process and battery cost; a release build; that the Mod can write the
  state file without breaking its read-only audit; how the Clawd theme format treats a non-crab walking pet; the System
  Events window lookup; the size of the art work for the cat and the dog.
