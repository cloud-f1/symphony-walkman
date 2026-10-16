# Symphony Walkman

[![CI](https://github.com/cloud-f1/symphony-walkman/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cloud-f1/symphony-walkman/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/tag/cloud-f1/symphony-walkman?label=version&sort=semver&color=2ea043)](https://github.com/cloud-f1/symphony-walkman/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea043)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-d97757)](https://claude.com/claude-code)
[![Plugin type](https://img.shields.io/badge/plugin-native%20Mod-1f6feb)](https://code.claude.com/docs/en/plugins-reference)
[![Node](https://img.shields.io/badge/setup%20CLI-Node%20%E2%89%A5%2018-5fa04e)](cli/walkman.mjs)
[![Jira](https://img.shields.io/badge/Jira-read--only-0052cc)](#what-it-will-not-do)

A [Claude Code](https://claude.com/claude-code) plugin (a native Mod) that answers, at a glance: **which card is Claude working on, and does anything need me?** It reads your git worktrees and, if you link a Jira project, your Jira board. It never writes to Jira.

Unofficial community project. MIT licensed.

> **Status: v0.10, in use.** Checked in real interactive terminal sessions (side pane, board pane, strip above the prompt, permission ask, failed turn, Jira through `uvx`, `doctor`). **Not yet checked:** a session opened inside Claude Desktop itself (WALK-23) and a real Windows machine (WALK-30; the Windows code is tested on a stubbed host only). A terminal session watched from Desktop through Remote Control shows only the commands' text, not the panes. Every claim and its date is in [What is verified](#what-is-verified).

## Start in three minutes

1. **Install** (once per machine):
   ```
   /plugin marketplace add cloud-f1/symphony-walkman
   /plugin install symphony-walkman@symphony-walkman
   ```
   Restart Claude Code. Updates arrive with the marketplace (`autoUpdate`), or run `claude plugin update symphony-walkman@symphony-walkman`.
2. **Link Jira** (optional, once per repo, and once per person for the credentials): run `npx --yes github:cloud-f1/symphony-walkman setup` in the repo. It shows its plan and asks before it writes anything. For many repos at once: [`configure`](#many-repos-at-once-configure).
3. **Work on a card in its own worktree**, with the Jira key at the start of the branch name:
   ```bash
   git worktree add .claude/worktrees/walk-27 -b WALK-27-subagent-rows origin/main
   cd .claude/worktrees/walk-27 && claude
   ```
4. **Look:** type `/walkman` for the side pane, `/walkman board` for the Jira board. `/walkman doctor` says what is missing if something stays empty.

## Daily use

| You want to know | Type | Look at |
|---|---|---|
| Does anything need me? | nothing | the strip above the prompt, or the `⚠` count in the side pane's title row |
| What is running, and for how long? | `/walkman` | the side pane: `● RUNNING`, minutes, a TodoWrite `3/5` or a symphony five-step bar |
| How is the whole project doing? | `/walkman board` | the board pane: every status column side by side, each card with its Epic and subtask progress |
| Why is it empty or stale? | `/walkman doctor` | each check with how to fix it (no secret is ever shown) |

Symbols are the same everywhere: `⚠` needs you (amber), `✕` failed (red), `●` running (green), `✓` done, `○` idle.

## What it shows

### The strip above the prompt

The most urgent card in one line, for example `⚠ WALK-27 needs you 3m (+1)`. On Claude Desktop (a session opened there) it is the pedestrian-signal drawing plus the line.

### The side pane (`/walkman`)

Like `htop`, the meters sit on top and the details follow; the details only grow when something needs you:

```
WALKMAN                          ⚠ 1  ✕ 0  ● 1  ✓ 3
disk ▕██░░░░░░▏ 25% · 36 GB free
jira ▕████████▏ ○ 3  ● 1  ✓ 28                  2m ago
──────────────────────────────────────────
⚠ NEEDS YOU
┃ WALK-128  Panel redesign…                  7m
┃  Bash is waiting for your approval
● RUNNING
● WALK-129  Real session check…   3/5 ██░░░ 12m
  └ ● Explore  find the login flow           2m
✓ 3 done · ○ 1 idle
◌ IN JIRA
  WALK-27   Per-subagent rows
▤ BOARD
  Backlog                    ▰▰▰▰▰▰▰▰   3
  ✓ 28 done · 14d
```

- **Title row:** how many cards are `⚠` needs you, `✕` failed, `●` running, `✓` done (a zero is dim).
- **Meters (always on top):** the disk (amber from 80% used, red from 90%) and, in a repo linked to Jira, one bar for the project (to do grey, in progress green, done in 14 days), its counts and how long ago it was read.
- **Needs you** (amber) and **failed** (red) expand into cards, the longest-waiting first. The second line says why, only from what is known: the tool waiting for approval (its name only, never its input), a question Claude asked you (`AskUserQuestion`), or a symphony run in `plan_ready`.
- **Running** is one line per card: title, the session's TodoWrite progress (`3/5`), a symphony five-step bar when there is a run, and the minutes. Under it, one row per subagent this session started (`└ ● Explore  task  2m`, at most five, a finished one stays 30 s). Done and idle fold into one line.
- **Other sessions:** a card worktree where another Claude Code session on this machine is working lights green, and amber when that session waits for you, so a window you are not looking at still shows up (with a toast). Walkman reads Claude Code's own session records in `~/.claude/sessions/<pid>.json` (never the `.key` files beside them) and keeps the ones whose process is alive. That format is Claude Code's internal one, so a change there makes this part go quiet, nothing else. Turn it off with `WALKMAN_OTHER_SESSIONS=off`.
- **In Jira:** in-progress Stories that have no worktree. **Board:** one line per status column with its share and count; on kitty or Ghostty the meter is a small picture (not through tmux or herdr), elsewhere `▰▱` text. It is left out whole when the pane is short.
- Times are whole minutes, so the pane redraws every 30 seconds while a card runs. A toast `KEY needs you` appears when a card starts needing you. Rows beyond the pane's height end with `+N more`.

### The board pane (`/walkman board`)

In a repo linked to a Jira project, a wide pane that reads like the Jira board (beside the transcript on a terminal 110 columns or wider in fullscreen, above the prompt otherwise):

```
WALK board · 3 open · 28 done (14d) · read 2m ago
BACKLOG 3                 IN PROGRESS 1             DONE
────────────────────────  ────────────────────────  ──────────
┌──────────────────────┐  ┌──────────────────────┐  28
│ WALK-20              │  │ ● WALK-156       12m │  in 14 days
│ Real-session         │  │ htop-style overview  │
│ verification (inter… │  │ on top, Epic and su… │
│ ◆ WALK-E1: Pedestri… │  │ ◆ WALK-E1: Pedestri… │
│ unassigned  ▰▰▰▱ 5/6 │  │ alex hsieh  ▱▱▱▱ 0/5 │
└──────────────────────┘  └──────────────────────┘

h ◀  l ▶  ↑↓ scroll  Esc close
```

- One column per status in board order; each open Story-level issue is a card: key, two lines of title, its Epic (`◆`), the assignee and its subtask progress. Done is a count of the last 14 days.
- **The card Claude works on is lit:** `●` and minutes with a green border while it runs, `⚠` amber when it needs you, `✕` red when it failed.
- **Keys** (the bar at the bottom shows only the ones that do something): `h` / `l` move the columns when they do not all fit, the arrows scroll, Esc closes. A click on `◀` / `▶` works too.
- Read every five minutes in the background. Where no pane can open, the printed board instead.

### All commands

| You type | You get |
|---|---|
| `/walkman` | The side pane. If there is no room for a pane, the printed board |
| `/walkman board` | In a repo linked to Jira, the board pane; otherwise the printed card board |
| `/walkman board print` | The cards and the Jira board printed into the conversation (with a legend) |
| `/walkman pane close` | Closes the side pane (Esc does too) |
| `/walkman doctor` | Checks the Jira link, credentials, `uvx` and worktrees, and says how to fix each |
| `/walkman version` | Plugin version, the pinned symphony-workflow release, Claude Code version |
| `/walkman help` | The commands and the legend |
| `/walkman debug` | What the plugin last read and signalled (for bug reports). It also runs while Claude is working |

Claude cannot type slash commands for you; ask it "which card are you on?" and it will tell you which one to type. The plugin also ships three skills (`using-walkman`, `developing-walkman`, `tracking-walk-tickets`) for Claude; they are hidden from the `/` menu.

### Where it shows

| Where you run Claude Code | Side pane and board pane | Strip above the prompt | Meter pictures |
|---|---|---|---|
| Terminal (any) | yes | yes | kitty and Ghostty only, not through tmux or herdr |
| Claude Desktop, a session opened there | not checked yet (WALK-23) | the signal drawing | no |
| Desktop or phone watching a terminal session (Remote Control) | no: only the commands' printed text | no | no |
| Windows | not checked on a Windows machine (WALK-30): written and tested on a stubbed host only (disk through PowerShell, other sessions through `tasklist`, `C:\` paths) | | |

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

It runs the released [symphony-workflow](https://github.com/cloud-f1/symphony-workflow) CLI with `uvx` (no clone, no `uv sync`): `uvx --env-file ~/.config/symphony-workflow/.env --from git+https://github.com/cloud-f1/symphony-workflow@v0.12.0 symphony-workflow search '<JQL>'`. It runs in the background, at most once a minute, and never while drawing; the first run downloads about 95 MB (`setup` does that for you). The query is fixed to your project's Story-level cards that are In Progress, plus the cards that have a worktree.

The board (`▤ BOARD` in the pane, the Jira section of `/walkman board`) is three more read-only searches through the same CLI (`call search_issues`), one per status category (To Do, In Progress, and Done changed in the last 14 days, counted up to 100), every five minutes. From symphony-workflow 0.12 each issue also carries its Epic (`parent`, `parent_summary`) and its subtask counts, which the board pane and the printed board show. Columns are ordered by category, then by the usual board names (Backlog, To Do, Blocked, In Progress, In Review…), then A to Z. Two settings:

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

### Many repos at once: `configure`

The Jira project is a per-repo setting (`WALKMAN_JIRA_PROJECT`); the credentials are per person. To set the project in every repo under a folder in one go:

```bash
cd your-repo                                           # the folder that holds your repos is used (or pass --root)
npx --yes github:cloud-f1/symphony-walkman configure --dry-run    # prints the plan, changes nothing
npx --yes github:cloud-f1/symphony-walkman configure --yes --set my-repo=ABC
```

It keeps a project that is already set, and for the others it reads the `KEY-n` that appears most in git history, **but uses the guess only if Jira has issues in that project** (`BUG-12` or `P2-3` are not projects), so a repo is never configured on a guess Jira does not confirm; use `--set repo=KEY` for those, or `--no-verify` to trust git history. It writes `.claude/settings.local.json` (not committed; `--shared` writes `settings.json` instead), turns on auto-update for the marketplace in your Claude user settings, and reports a global plugin option `jira_project`, which would give every repo without its own setting that project (`--drop-global-project` removes it). Nothing is written before you confirm, and it never prints a credential.

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
| Jira lookup through symphony-workflow v0.9.3 (real session, scratch repo with a `WALK-107-…` worktree, 2026-10-14) | Passed: `/walkman board` showed the card with its Jira title and `/walkman debug` said `jira: 1 issues, last read ok`; `search` printed the same three TAB columns on v0.5.2 and v0.9.3. The pin in `core/version.ts` and the CLI was moved to v0.9.3 |
| `walkman configure` on the real folder of repos and the panel in a real session (2026-10-14) | Passed: a dry run over 75 repos kept the four projects already set, planned DCSYS and CF1 (found in Jira) and refused `BUG`, `HF`, `P2`, `SP`, `TICKET` (no issues in Jira, so not applied). In a real session with project RCPM and two worktree cards, the pane and `/walkman board` listed both cards and all four In Progress RCPM Stories (one with its Jira title as a card, three under "In progress in Jira"). **Not seen with real data:** the `+N more` line past six (the largest project has six In Progress; a stubbed check covers it). Note: the pane is narrow, so it shows keys without titles; `/walkman board` shows titles |
| Panel redesign in 0.6.0 (real session, scratch repo with two card worktrees, project RCPM, 2026-10-14) | Passed: idle, running (`● RUNNING`, one line, `<1m`) and a permission ask (`⚠ NEEDS YOU` card with its reason, `┃` bar, time flush right, toast) were drawn; the real foreground colors were amber `#ffc107` bold for needs-you, grey for zero counters, green for the disk bar. **Not seen in a real session:** a failed card (a stubbed test and the core checks cover it; a real failure takes about four minutes of retries), the `+N more` line, and the toast on screen (the Mod test sees the call). Not changed from the owner's spec: the redraw interval stays at one second while a card runs, because the strip above the prompt still shows a seconds clock |
| Strip above the prompt in minutes, 0.6.1 (real session, same steps on 0.6.0 and 0.6.1, 2026-10-14) | Passed: during a running turn the strip read `running 0:06` then `0:20` on 0.6.0 and `running <1m` both times on 0.6.1. The 30-second redraw and the one-second Desktop exception are covered by Mod tests on the mock clock, not observed on a real screen |
| Jira board, 0.7.0 (real session, scratch card worktrees, projects WALK and RCPM, symphony-workflow v0.11.0, 2026-10-15) | Passed: `/walkman board` printed `WALK board · 5 open · 23 done in 14 days` with the five Backlog Stories, titles and assignees; the pane drew `▤ BOARD` with one line per column (RCPM: `To Do 3`, `In Progress 4`, `✓ 93 done · 14d`) above the disk line. That terminal does not draw pictures, so the meter showed as `▰▱` text. **Not seen:** the meter as a picture in Ghostty (a driven session gets no picture support: the engine sent no image command), and a project with more than two columns on a real screen (unit checks cover the order) |
| Board pane, 0.8.0 (real session, scratch card worktree on RCPM, 2026-10-16) | Passed: at 130 columns the pane docked beside the transcript with `TO DO 3`, `IN PROGRESS 5` and `DONE 93` side by side and Chinese titles wrapped by cell width; at 60 columns it opened above the prompt with `1–2/3` and `l: ▶`, `l` moved it to `2–3/3` and `h` back; during a real turn the card `● RCPM-581 <1m` and its border were green (`#4eba65`, bold) and the others grey. **Not seen:** needs-you and failed cards on the board pane on a real screen (Mod and unit checks cover them) |
| Overview on top, Epic and subtasks, 0.9.0 (real session, scratch card worktree on WALK, symphony-workflow v0.12.0, 2026-10-16) | Passed: the side pane read `WALKMAN …`, then `disk ▕██░░░░░░▏ 25% · 36 GB free`, then `jira ▕████████▏ ○ 3  ● 0  ✓ 28  now`, then a rule; the board pane cards showed `◆ WALK-E1: Pedestri…` and `▱▱▱▱ 0/5`, `▰▱▱▱ 1/4`, `▰▰▰▱ 5/6` for WALK-156, 27 and 20 (the numbers Jira has), and the key bar at the bottom. **Not seen live:** the AskUserQuestion needs-you, the tool name in the reason and TodoWrite `3/5` (Mod tests cover them) |
| Subagent rows and other sessions, 0.10.0 (real session, scratch repo on WALK, 2026-10-16) | Passed: during a real turn that started a subagent, the pane showed `● WALK-107 …` and under it `└ ● general-purpose  Write numbers o…  <1m` with a green `●`. Other sessions: `/walkman debug` read `7 records, 7 alive (idle idle busy idle idle idle idle)` from this machine's real records. **Not seen:** another session lighting a card on screen, because sessions started by the test driver write no record (seen with and without the child-session variables); mapping, needs-you priority, the `.key` guard and the off switch are covered by checks and Mod tests |
| Release gate, 0.10.1 (dry runs on the repo, 2026-10-16) | Passed: run in a branch worktree, `npm run release:check` failed the git gate (not on `main`, `package.json` changed) and the version gate (`v0.10.0` already tagged here and on origin); with TypeScript missing the types gate failed with "run npm ci" instead of skipping, and after `npm ci` it found a real type error in `core/jiraboard.ts` (fixed in this release). The audit gates passed on the real files. The first real `npm run release` is this version's own tag |
| Windows branches, 0.10.2 (stubbed host only, 2026-10-16) | Tests pass: the disk from `(Get-PSDrive C).Free; .Used` (107 GB free and 429 GB used reads `100 GB free`, `80%`), live pids from `tasklist /FO CSV /NH`, `C:\…` session folders matched to `C:/…` git worktrees, `USERPROFILE` before `HOME` on Windows. **Not seen:** any of it on a Windows machine |
| A worktree the session left keeps no needs-you, 0.7.1 (2026-10-16) | Mod test only: an ask in one worktree, then a turn in another, leaves the first idle. Seen live before the fix (three worktrees red for 24 hours). **Not seen** in a real session after the fix: moving a real session between worktrees was not driven |
| Windows | **Not run**: no Windows machine. The disk line is skipped there and paths are untested |

## Develop

```bash
npm ci
npm test            # core checks (node --test, with the strip-types flag) then `claude plugin test`
claude plugin validate --strict .
```

### Releasing

A version ships only through the release gate:

```bash
npm run release:check   # every gate and the audit, a report, nothing written
npm run release         # the same, then (only if all passed) tag vX.Y.Z, push it, publish a GitHub Release with the report
```

| Gate | Fails when |
|---|---|
| git | not on `main`, a tracked file is changed, or `HEAD` is not `origin/main` |
| version | the version is already tagged, or `plugin.json`, `package.json`, `core/version.ts` and `marketplace.json` disagree |
| pin | the pinned symphony-workflow release is not a published tag, or the setup CLI pins another one |
| tests | `npm test` fails (core checks and Mod tests) |
| plugin | `claude plugin validate --strict .` fails |
| types | `tsc` reports an error in `core/` or `hooks/`, or TypeScript or the Mod API types are missing |
| audit: read only | the Mod runs any symphony-workflow command other than `search` and `call search_issues` |
| audit: network | the Mod calls `fetch` or `$.http` |
| audit: secrets | a tracked file holds what looks like a token or a private key |
| audit: session records | a session record could be read without `isRecordName`, or that guard lets a `.key` name through |
| audit: verified | the README has no "What is verified" row for the version |
| audit: package | the manifest, the marketplace entry, the hooks or a skill's `SKILL.md` is missing |

A gate that cannot run (no TypeScript, no network to check a tag) counts as failed. GitHub CI is not part of the gate.

Picking the project up? Read [docs/HANDOVER.md](docs/HANDOVER.md) (links, ticket map, decisions, gotchas). To check behavior the way a person sees it, use the real-session harness in [tools/real-session](tools/real-session/README.md).

`core/*.ts` is pure. `hooks/register.ts` is the only file that calls the mods API. See [skills/developing-walkman/SKILL.md](skills/developing-walkman/SKILL.md) and [docs/PLAN.md](docs/PLAN.md).
