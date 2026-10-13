# Symphony Walkman

[![Version](https://img.shields.io/github/v/tag/cloud-f1/symphony-walkman?label=version&sort=semver&color=2ea043)](https://github.com/cloud-f1/symphony-walkman/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea043)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-d97757)](https://claude.com/claude-code)
[![Plugin type](https://img.shields.io/badge/plugin-native%20Mod-1f6feb)](https://code.claude.com/docs/en/plugins-reference)
[![Node](https://img.shields.io/badge/setup%20CLI-Node%20%E2%89%A5%2018-5fa04e)](cli/walkman.mjs)
[![Jira](https://img.shields.io/badge/Jira-read--only-0052cc)](#what-it-will-not-do)

A [Claude Code](https://claude.com/claude-code) plugin (a native Mod) that answers one question at a glance: **which card is Claude working on right now?** It works in the terminal and in Claude Desktop, and draws a pedestrian signal like the ones on Taiwanese crossings.

Unofficial community project. MIT licensed.

> **Status: v0.5, in use.** Checked in real interactive terminal sessions (pane, band, permission ask, failed turn, Jira lookup through `uvx`, `doctor`, one install for both plugins). **Not yet checked:** the drawings inside Claude Desktop itself (WALK-23) and Windows (WALK-30). Every claim and its date is in [What is verified](#what-is-verified).

## The signal

| Light | Meaning |
|---|---|
| 🟢 walking man, with seconds | Claude is working on this card |
| 🔴 standing man | The card needs you: a permission ask is open, or a symphony-workflow run is in `plan_ready` (the human review gate) |
| 🔴 failed | The last turn failed, or the run is `failed`. On Desktop the red man also blinks; in the terminal it is the word `failed` in red |
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
| `/walkman doctor` | Checks the Jira link, credentials, `uvx` and worktrees, and says how to fix each (never shows a secret) |
| `/walkman version` | Plugin version, the pinned symphony-workflow release, Claude Code version |
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

It runs the released [symphony-workflow](https://github.com/cloud-f1/symphony-workflow) CLI with `uvx` (no clone, no `uv sync`): `uvx --env-file ~/.config/symphony-workflow/.env --from git+https://github.com/cloud-f1/symphony-workflow@v0.5.2 symphony-workflow search '<JQL>'`. It runs in the background, at most once a minute, and never while drawing; the first run downloads about 95 MB (`setup` does that for you). The query is fixed to your project's Story-level cards that are In Progress, plus the cards that have a worktree. Two settings:

- Per repo, in that repo's `.claude/settings.json` (so each repo names its own project): `{ "env": { "WALKMAN_JIRA_PROJECT": "JEV" } }`
- Per person, once, **the Jira credentials**, in either place:
  1. **In the plugin** (no file): `/plugin` → Installed → Symphony Walkman → Configure options, then fill **Jira site URL**, **Jira account email** and **Jira API token** (the token is a sensitive setting kept in Claude Code's secure storage; create one at <https://id.atlassian.com/manage-profile/security/api-tokens>). After `/plugin install`, Claude Code also prints the `--config KEY=VALUE` form. Walkman hands them to the lookup as environment variables, never on a command line. All three are needed; a partial set is reported, not half used. Environment variables `WALKMAN_JIRA_BASE_URL`, `WALKMAN_JIRA_EMAIL` and `WALKMAN_JIRA_API_TOKEN` work too, for scripts, but do not put the token in a committed settings file.
  2. **In a file**: `~/.config/symphony-workflow/.env` with `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` (`npx … setup` creates it), or point `WALKMAN_JIRA_ENV_FILE` (or the plugin setting **Jira credentials file**) somewhere else. If you run symphony-workflow from a clone, set `WALKMAN_SYMPHONY_WORKFLOW_DIR` and Walkman uses that clone's `.env` the old way.
  Order of use: a configured clone, then the plugin settings, then the credentials file.
- The plugin settings are enough for the board. The ticket skills (`jira-ticket-ops`) and the `symphony-workflow` CLI run in the Bash tool, which does not see plugin settings, so they still read the credentials file; `/walkman doctor` tells you if it is missing.

If the lookup fails (no `uvx`, no credentials file, bad credentials, offline), the board still prints and says `jira lookup: …` on one line. `/walkman debug` shows the last result.

## What it will not do

- The plugin never writes to Jira, to symphony-workflow's files, or to your repo. (The separate setup CLI below does write the repo's `.claude/settings.json` and your credentials file, but only after it shows a plan and you agree.)
- The plugin makes no network calls of its own and holds no API key. The optional Jira lookup only runs the read-only `symphony-workflow search`; your credentials stay in the credentials file you chose.
- If git, a run file or `df` is missing or unreadable, the row or the disk line is simply left out. It never throws into your session.

## Quick setup (CLI)

One command checks your machine and configures a repo. Node 18 or newer, nothing to install first:

```bash
cd your-repo
npx --yes github:cloud-f1/symphony-walkman doctor    # what is set, what is missing, how to fix each
npx --yes github:cloud-f1/symphony-walkman setup     # shows a plan, asks, then does it
npx --yes github:cloud-f1/symphony-walkman card JEV-47   # worktree + branch JEV-47-<title> for a card
```

`setup` does, in order, only what is missing: installs the plugin (its marketplace also installs the `symphony-workflow-ops` skills, see Install), creates `~/.config/symphony-workflow/.env` (mode 600) for your Jira credentials, or copies them from an older symphony-workflow clone if it finds one, downloads the symphony-workflow CLI once (about 95 MB) so lookups are fast, writes `WALKMAN_JIRA_PROJECT` to the repo's `.claude/settings.json` (guessed from your git history, or `--project JEV`), then runs the Jira lookup to prove it works. It never asks for or prints a token, never writes to Jira, and `--dry-run` shows the plan without changing anything. Restart Claude Code afterwards. This CLI is separate from the plugin: the plugin only reads, the CLI writes settings after showing you a plan.

## Install

Needs Claude Code **2.1.287 or later**. Two commands, inside Claude Code:

```
/plugin marketplace add cloud-f1/symphony-walkman
/plugin install symphony-walkman@symphony-walkman
```

The second one also installs `symphony-workflow-ops` (skills for ticket work with the symphony-workflow CLI): this marketplace lists it next to Walkman, so one install brings both. If you already installed `symphony-workflow-ops` from its own marketplace you will have two copies of those skills; uninstall one. Then type `/walkman`.

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
| One install brings both plugins (isolated Claude profile, 2026-10-11) | Passed: with only this marketplace added, `/plugin install symphony-walkman@symphony-walkman` printed `+ 1 dependency: symphony-workflow-ops` and both plugins and all their skills were present. A dependency on a plugin in a different marketplace failed instead (`Dependency ... not found. Is the marketplace added?`), which is why the skills plugin is listed here |
| Jira lookup through `uvx` with a credentials file, no clone (real session, 2026-10-11) | Passed: on `main` of a scratch repo with only `WALKMAN_JIRA_PROJECT` and `WALKMAN_JIRA_ENV_FILE` set, `/walkman board` listed the JEV cards and `/walkman debug` said `jira: 4 issues, last read ok` |
| `/walkman version` and `doctor` in a real session (2026-10-11) | Passed: version printed 0.5.0 / v0.5.2 / Claude Code 2.1.296; `doctor` worded the state and the token never appeared on screen (0 occurrences). Not run: Windows |
| Credentials from the environment, no file (real session, 2026-10-11) | Passed: with only `WALKMAN_JIRA_*` variables set and no credentials file, the lookup ran through `uvx` and the board showed the Jira title. **Not exercised:** the three plugin settings themselves (reading them from Claude Code's secure storage); the same code path is used once the values are read |
| Setup CLI on the real jev-agent-kit and a scratch clone of it (2026-10-11) | Passed: `doctor` found the live JEV lookup (4 In Progress Stories) and suggested the project from git history; `setup --yes` wrote both settings files and the next real session listed the JEV cards; `card JEV-48` made the worktree with a slug from the Jira title. Not run: the plugin install and clone steps (the machine already had both), and Windows |
| The signal drawings | Rendered in headless Chrome and looked at: green walking man, red standing man, darker red failed, green done, grey idle, with the countdown. **Not run:** inside Claude Desktop itself (the `Svg` element and animation there), which I cannot drive |
| A permission ask lights the red man | Passed in a real session (default permission mode, a Write tool call): while the dialog "Do you want to create hello.txt?" was open, the pane showed `🔴 WALK-21 needs you` with a running clock, and the trace showed `tool.check verdict="ask"`. Note: the dialog replaces the prompt area, so the band above the prompt is hidden while it is open; keep the pane open (`/walkman`) to see the red man then |
| A failed turn lights the red light | Passed in a real session: with the API pointed at a dead port the turn failed after Claude Code's retries (about 4 minutes) with `turn.complete reason="error"`, and the pane showed `🔴 WALK-21 failed`. The rule `reason` contains `error` or is `refusal` matches what was seen; `refusal` itself was not triggered |
| `plan_ready` lighting red from a real `run.json` | Passed in a real session (`WALKMAN_RUNS_DIR` pointing at a folder with `WALK-22/run.json` in `plan_ready`): the band showed `🔴 WALK-22 needs you`, the board row said `plan_ready`, and its clock advanced |
| Fewer repeated reads in 0.5.2 (real session, scratch repo with two card worktrees, one Bash tool call, 2026-10-14) | Passed: compared with 0.5.1 in the same steps, `/walkman debug` showed one fewer `mark {"askPending":false}` at the tool call, and with no Jira project set `jira: 0 issues, last read ok` instead of `last read never`. **Not seen in a real session:** the 30-second disk cache (a stubbed test covers it: one `df` over four rereads) |
| Setup CLI and doctor in 0.5.3 (real CLI, real `grep --color=always` output as a credentials file with dummy values, and a real session, 2026-10-14) | Passed: `doctor` in the CLI and `/walkman doctor` in a real session both said the file has terminal color codes and printed the `perl` command; running it left no escape bytes and `uv` parsed the file. `card KEY-n` with no slug ran none of `claude`, `uv`, `uvx` (it ran all three in 0.5.1). The token never appeared on screen (0 occurrences). **Not run:** `setup` copying credentials from an old clone (a stubbed check covers `pickJiraEnv`) |
| Docs and skills in 0.5.4 (2026-10-14) | Checked: the six badge URLs return an SVG (the version badge reads the latest tag), `claude plugin validate --strict .` passes. Documentation only; no behavior change, so no new real-session run |
| Windows | **Not run**: no Windows machine. The disk line is skipped there and paths are untested |

## Develop

```bash
npm ci
npm test            # core checks (node --test, with the strip-types flag) then `claude plugin test`
claude plugin validate --strict .
```

Picking the project up? Read [docs/HANDOVER.md](docs/HANDOVER.md) (links, ticket map, decisions, gotchas). To check behavior the way a person sees it, use the real-session harness in [tools/real-session](tools/real-session/README.md).

`core/*.ts` is pure. `hooks/register.ts` is the only file that calls the mods API. See [skills/developing-walkman/SKILL.md](skills/developing-walkman/SKILL.md) and [docs/PLAN.md](docs/PLAN.md).
