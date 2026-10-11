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

A card is a **git worktree whose branch starts with a Jira key**: `CF1-195-devopsday-visuals`. The Mod runs `git worktree list --porcelain`, so every card worktree of the repo gets its own row, and the 🟢 on a row means Claude is working in that worktree. Branches like `main` or `chore-x` are not cards. No Jira call is needed for this.

To light a card in a repo that works on `main`, give each card its own worktree. For a repo linked to Jira project `JEV`:

```bash
git worktree add .claude/worktrees/jev-47-withhold-secrets -b JEV-47-withhold-secrets origin/main
cd .claude/worktrees/jev-47-withhold-secrets && claude
```

Optional: set **symphony-workflow runs folder** in the plugin settings to the folder that holds `<KEY>/run.json` (symphony-workflow's `docs/runs`). The Mod then reads the run `state` and lights `plan_ready` red. It only reads.

## Jira titles and the in-progress list (optional)

A repo linked to a Jira project can show titles and what is in progress, even while you are on `main`:

```
Walkman board
○  JEV-47    Withhold secret-like blocks   idle

In progress in Jira
  JEV-48    Optional masking of personal data  In Progress
  JEV-35    The default goal no longer drops…  In Progress
```

It runs `uv run --env-file .env symphony-workflow search '<JQL>'` in your [symphony-workflow](https://github.com/cloud-f1/symphony-workflow) clone, at most once a minute and never while drawing. The query is fixed to your project's Story-level cards that are In Progress, plus the cards that have a worktree. Set it up in two places:

- Per repo, in that repo's `.claude/settings.json` (so each repo names its own project): `{ "env": { "WALKMAN_JIRA_PROJECT": "JEV" } }`
- Per person, once: the plugin setting **symphony-workflow checkout** (or the env var `WALKMAN_SYMPHONY_WORKFLOW_DIR`) set to your clone, which holds the `.env` with your Jira credentials.

If the lookup fails (no `uv`, bad credentials, offline), the board still prints and says `jira lookup: …` on one line. `/walkman debug` shows the last result.

## What it will not do

- It never writes to Jira, to symphony-workflow's files, or to your repo.
- It makes no network calls of its own and holds no API key. The optional Jira lookup only runs the read-only `symphony-workflow search` you point it at; your credentials stay in that clone's `.env`.
- If git, a run file or `df` is missing or unreadable, the row or the disk line is simply left out. It never throws into your session.

## Quick setup (CLI)

One command checks your machine and configures a repo, including the `symphony-workflow` plugin and clone that the Jira lookup needs. Node 18 or newer, no install:

```bash
cd your-repo
npx --yes github:cloud-f1/symphony-walkman doctor    # what is set, what is missing, how to fix each
npx --yes github:cloud-f1/symphony-walkman setup     # shows a plan, asks, then does it
npx --yes github:cloud-f1/symphony-walkman card JEV-47   # worktree + branch JEV-47-<title> for a card
```

`setup` does, in order, only what is missing: installs the `symphony-workflow-ops` plugin (a separate plugin, the skills for ticket work), clones [symphony-workflow](https://github.com/cloud-f1/symphony-workflow) and runs `uv sync`, copies its `.env.example` to `.env` (mode 600) for you to fill in, writes `WALKMAN_JIRA_PROJECT` to the repo's `.claude/settings.json` (guessed from your git history, or `--project JEV`) and your clone path to `.claude/settings.local.json` (personal, not committed), then runs the Jira lookup to prove it works. It never asks for or prints a token, never writes to Jira, and `--dry-run` shows the plan without changing anything. Restart Claude Code afterwards.

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
| `checks/*.check.ts` (30 tests incl. the CLI: branch parsing, light priority, run state, `df`, board, styled board and pane, SVG, release version match) | Passed |
| `claude plugin test` (8 Mod tests on a stubbed host, terminal and desktop surfaces) | Passed |
| `claude plugin validate --strict .` | Passed |
| Real engine, headless (`claude -p --plugin-dir`, scratch repo with two card worktrees, 2026-10-11) | Passed: module loaded, all 7 event kinds registered, `turn.start` fired and ran `git`. Slash commands are not run headless, so the board output was not seen this way |
| Real interactive terminal session, installed from the public marketplace (owner screenshots, 2026-10-11) | Passed: `/walkman board` printed both card rows with the disk line; the pane opened and closed |
| Real interactive terminal session, scripted (a pty with a terminal emulator, `--plugin-dir`, a scratch repo with two card worktrees, 2026-10-11) | Passed: `/walkman` is in the `/` menu with its description; the pane opens with theme colors (green, red, dim) and a legend; `/walkman board` prints after the pane was open; the band shows `🟢 running` with the clock ticking 0:03, 0:07 during a real turn and goes back to idle. Found and fixed in 0.1.5: an empty board after the pane opened, and a band that stayed idle during a turn |
| Jira lookup in a scripted real session (repo on `main`, `WALKMAN_JIRA_PROJECT=JEV`, the real symphony-workflow CLI, 2026-10-11) | Passed: on `main` the board and pane listed the four In Progress JEV Stories read live from Jira; in a `JEV-48-…` worktree the row showed the Jira title and the list left that card out |
| Setup CLI on the real jev-agent-kit and a scratch clone of it (2026-10-11) | Passed: `doctor` found the live JEV lookup (4 In Progress Stories) and suggested the project from git history; `setup --yes` wrote both settings files and the next real session listed the JEV cards; `card JEV-48` made the worktree with a slug from the Jira title. Not run: the plugin install and clone steps (the machine already had both), and Windows |
| Claude Desktop (the `Svg` signal, walking animation) | **Not run**; the drawing is only checked as a string |
| `tool.check` returning `ask` while a permission dialog is open | Assumed from the API docs; stub-tested only |
| `turn.complete` `reason` values meaning "failed" | **Guess**: `refusal` or anything containing `error` |
| `plan_ready` lighting red from a real `run.json` | Parser tested; the Mod path with `runs_dir` set is **not** covered |
| Windows | Disk line is skipped; paths untested |

## Develop

```bash
npm ci
npm test            # core checks (node --test, with the strip-types flag) then `claude plugin test`
claude plugin validate --strict .
```

`core/*.ts` is pure. `hooks/register.ts` is the only file that calls the mods API. See [skills/developing-walkman/SKILL.md](skills/developing-walkman/SKILL.md) and [docs/PLAN.md](docs/PLAN.md).
