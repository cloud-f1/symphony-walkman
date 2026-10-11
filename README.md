# Symphony Walkman

A [Claude Code](https://claude.com/claude-code) plugin (a native Mod) that answers one question at a glance: **which card is Claude working on right now?** It works in the terminal and in Claude Desktop, and draws a pedestrian signal like the ones on Taiwanese crossings.

Unofficial community project. MIT licensed.

> **Status: v0.1.0, early.** The pure logic is unit-tested and the Mod passes `claude plugin test` and `claude plugin validate --strict` against stubbed hosts. It has **not** yet been run in a real interactive session, and the Desktop drawing has never been seen on a real screen. See [What is verified](#what-is-verified).

## The signal

| Light | Meaning |
|---|---|
| 🟢 walking man, with seconds | Claude is working on this card |
| 🔴 standing man | The card needs you: a permission ask is open, or a symphony-workflow run is in `plan_ready` (the human review gate) |
| 🔴 blinking | The last turn failed, or the run is `failed` |
| ✓ | The run is `completed` |
| · | Idle |

## What it shows

```
🟢 CF1-195   devopsday-visuals         implementing  12:04
🔴 CF1-201   pitch-copy                plan_ready    0:41
✓  CF1-188   course-pricing            completed     3:12

disk · 74 GB free · 84% used

1 running · 1 done · 1 needs you
```

- A strip above the prompt shows the most urgent card (terminal: one colored line; Desktop: the signal drawing plus the line).
- Colors follow your theme and the status line: green is going, red is needs-you or failed, dim is idle; the disk line turns yellow at 80% used and red at 90%.

One command does it all:

| You type | You get |
|---|---|
| `/walkman` | The colored side pane. If there is no room for a pane, the printed board instead |
| `/walkman board` | The board printed into the conversation (plain text, a legend underneath) |
| `/walkman pane close` | Closes the pane (Esc does too) |
| `/walkman help` | The three lines above plus the legend |
| `/walkman debug` | What the plugin last read and signalled (for bug reports). It also runs while Claude is working |

The plugin also ships three skills (`using-walkman`, `developing-walkman`, `tracking-walk-tickets`). They are for Claude, not for you, and are hidden from the `/` menu.

## How it knows the card

A card is a **git worktree whose branch starts with a Jira key**: `CF1-195-devopsday-visuals`. The Mod runs `git worktree list --porcelain`, so every card worktree of the repo gets its own row. Branches like `main` or `chore-x` are not cards. No Jira call is needed for this.

Optional: set **symphony-workflow runs folder** in the plugin settings to the folder that holds `<KEY>/run.json` (symphony-workflow's `docs/runs`). The Mod then reads the run `state` and lights `plan_ready` red. It only reads.

## What it will not do

- It never writes to Jira, to symphony-workflow's files, or to your repo.
- It makes no network calls and needs no API key.
- If git, a run file or `df` is missing or unreadable, the row or the disk line is simply left out. It never throws into your session.

## Install

Needs Claude Code **2.1.287 or later**.

```
/plugin marketplace add cloud-f1/symphony-walkman
/plugin install symphony-walkman@symphony-walkman
```

### Optional: pair it with symphony-workflow

Walkman only reads. To move the Jira cards it shows (audit, transition, roll up), add the `symphony-workflow-ops` plugin, which ships the `jira-ticket-ops` skill:

```
/plugin marketplace add cloud-f1/symphony-workflow
/plugin install symphony-workflow-ops@symphony-workflow-marketplace
```

That plugin does not include the CLI itself; clone [cloud-f1/symphony-workflow](https://github.com/cloud-f1/symphony-workflow) and run `uv sync`. Walkman works without any of this. If you set `runs_dir` to that repo's `docs/runs`, a card whose run is in `plan_ready` lights the red man.

## Updates

Claude Code only offers an update when the plugin's `version` changes, so every release bumps it (`.claude-plugin/plugin.json` and `package.json`, kept equal by `npm test`).

Turn on auto-update for this marketplace once: in Claude Code run `/plugin`, open **Marketplaces**, pick `symphony-walkman` and choose **Enable auto-update**. Third-party marketplaces start with it off.

To set it up for everyone who opens a project, commit this to the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "symphony-walkman": {
      "source": { "source": "github", "repo": "cloud-f1/symphony-walkman" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": { "symphony-walkman@symphony-walkman": true }
}
```

Update by hand at any time:

```
/plugin marketplace update symphony-walkman
/reload-plugins
```

Auto-update has had reports of fetching without applying a new version in some 2.1.x builds. If a release does not arrive, run the two commands above.

## What is verified

| Check | Result |
|---|---|
| `checks/*.check.ts` (17 tests: branch parsing, light priority, run state, `df`, board, styled board and pane, SVG, release version match) | Passed |
| `claude plugin test` (8 Mod tests on a stubbed host, terminal and desktop surfaces) | Passed |
| `claude plugin validate --strict .` | Passed |
| Real engine, headless (`claude -p --plugin-dir`, scratch repo with two card worktrees, 2026-10-11) | Passed: module loaded, all 7 event kinds registered, `turn.start` fired and ran `git`. Slash commands are not run headless, so the board output was not seen this way |
| Real interactive terminal session, installed from the public marketplace (owner screenshots, 2026-10-11) | Passed: `/walkman board` printed both card rows with the disk line; the pane opened and closed |
| Real interactive terminal session, scripted (a pty with a terminal emulator, `--plugin-dir`, a scratch repo with two card worktrees, 2026-10-11) | Passed: `/walkman` is in the `/` menu with its description; the pane opens with theme colors (green, red, dim) and a legend; `/walkman board` prints after the pane was open; the band shows `🟢 running` with the clock ticking 0:03, 0:07 during a real turn and goes back to idle. Found and fixed in 0.1.5: an empty board after the pane opened, and a band that stayed idle during a turn |
| Claude Desktop (the `Svg` signal, walking animation) | **Not run**; the drawing is only checked as a string |
| `tool.check` returning `ask` while a permission dialog is open | Assumed from the API docs; stub-tested only |
| `turn.complete` `reason` values meaning "failed" | **Guess**: `refusal` or anything containing `error` |
| `plan_ready` lighting red from a real `run.json` | Parser tested; the Mod path with `runs_dir` set is **not** covered |
| Windows | Disk line is skipped; paths untested |

## Develop

```bash
npm ci
npm test            # core checks (node --test) then `claude plugin test`
claude plugin validate --strict .
```

`core/*.ts` is pure. `hooks/register.ts` is the only file that calls the mods API. See [skills/developing-walkman/SKILL.md](skills/developing-walkman/SKILL.md) and [docs/PLAN.md](docs/PLAN.md).
