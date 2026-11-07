# Walkman Pet: the green man as a desktop pet (plan, 2026-11-07)

**Status: a plan. Nothing is built and the owner has not approved it.** Section 9 lists what the owner has to decide
before any code is written.

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

**Recommendation: A first (A needs nothing from the Mod), keep C as the cheap fallback if the owner would rather install
Clawd than own an app, and decide B only after seeing A run.**

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

- **Window:** transparent, borderless, always on top, all Spaces, click-through except over the pet. Electron is the
  likely choice because `core/*.ts` is TypeScript and reusable as is; Swift/AppKit is smaller but macOS-only and shares
  no code. Tauri sits between. (Decision in section 9.)
- **Input:** every 1 to 2 seconds read `~/.claude/sessions/*.json` (names matching `isRecordName` only, never a `.key`
  file) and `git worktree list` for the repos found there; map a record to a card by its worktree, as `otherSessionLights`
  does; add `lightWhileWorking` and `sinceWithWork` (work between turns, WALK-263 and WALK-265).
- **Output:** pets drawn on a canvas at about 8 frames a second; the loop stops when nothing walks.
- **Controls:** click a pet to focus its terminal; right-click for a menu (style, hide, quit); a setting for the style.
- **Safety:** read-only like the Mod: no Jira writes, no network of its own, no secrets read. The Jira title is optional
  and goes through the same read-only lookup.

## 8. Risks and open points

- **Distraction and battery:** a pet that runs all day is a cost. Default to quiet (only moves while a card walks) and make
  the animation stop when idle.
- **Distribution:** an unsigned app triggers Gatekeeper; a signed, notarised build needs a developer account. Windows and
  Linux are out of the MVP (the Mod itself is not yet verified on Windows).
- **Fullscreen apps and several displays:** window level and Space behaviour need testing on the owner's machine.
- **Multiple sessions on one card or one session on several worktrees:** reuse `onePerCard`; the pet follows the lead.
- **A stale subagent** keeps a card walking up to 12 hours (WALK-276); the pet inherits that cap.
- **Art:** the cat and the dog are new drawings; nothing is taken from Clawd, Calico or Cloudling.

## 9. Decisions for the owner

1. Which route: **A** (own app, recommended) or **C** (Clawd themes plus a relay)?
2. For A: **Electron** (reuses `core/`), **Tauri**, or **Swift** (macOS only)?
3. Where does it live: a `pet/` folder in this repo, or a new repo (the app is not a plugin)?
4. May the Mod write a small state file (option B), or does the pet stay on the session records only?
5. Default: pet off until switched on, or on whenever the companion runs?
6. Who draws the cat and the dog: we draw our own pixel art (the plan assumes this).

## 10. Phases and what "done" means

| Phase | Work | Done when |
|---|---|---|
| P0 | Design sheet and a clickable web demo of the three pets walking, the states, and the run across a mock screen | the owner picks the look of each pet |
| P1 | Companion MVP: one pet, original style, walks while a card walks, reads session records | on the owner's Mac the pet runs while a card runs and stops when it does (real session, not a mock) |
| P2 | Cat and dog sprites, all five states, bubbles, click to focus the terminal, several pets | each state seen on screen |
| P3 | Settings, the exit effect, optional window-frame lookup, optional state file (B) | the owner signs off the behaviour |
| P4 | Packaging and a short install guide; a line in the README | a clean install on a second Mac works |

## 11. What this plan rests on, and what it does not

- **Read:** the clawd-on-desk README, its custom HTTP agent guide, its repo layout and licence notes; this repo's
  Mod API types (`$.fs.write`, `$.process.run`) and rules; Claude Code 2.1.316's session record parser.
- **Not verified:** that Electron's transparent click-through window behaves as needed on the owner's macOS and display
  setup; how the Clawd theme format treats a non-crab walking pet; the System Events window lookup; battery cost; the
  size of the art work for the cat and the dog.
