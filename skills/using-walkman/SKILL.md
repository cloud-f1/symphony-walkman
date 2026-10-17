---
name: using-walkman
user-invocable: false
description: Explain and operate the Symphony Walkman board. Use when the user asks which card Claude is working on, whether anything needs them, what the green or red man means, how to see the Jira board, or how to open the board or pane.
---

# Using Symphony Walkman

A model cannot run slash commands. Answer from what you know, then tell the user which command to type.

## What to tell the user to type

| They want | They type |
|---|---|
| Does anything need me, what is running | `/walkman` (the pane, cards view) |
| The whole Jira board | `/walkman board` (the pane's board view; `b` switches views, `h` / `l` move columns, arrows scroll, Esc closes) |
| The same as text in the conversation | `/walkman board print` |
| Why something is empty or stale | `/walkman doctor` |
| Versions | `/walkman version`; legend: `/walkman help` |

Outside a session: `npx --yes github:cloud-f1/symphony-walkman doctor` checks the setup, `... card KEY-n` creates a card worktree, `... configure --dry-run` plans the Jira project for every repo in a folder.

## What they will see

- **The pedestrian signal** (top of the cards view): a green man walking = a card is running (he hurries near the end of its step list, the number is steps left or minutes); amber man standing = a card needs you; red man blinking = failed; grey man standing = nothing is running.
- **Symbols everywhere:** `⚠` amber needs you, `✕` red failed, `●` green running, `✓` done, `○` idle. The strip above the prompt shows the most urgent card in one line.
- **One pane, two views; `b` switches.** Cards view, top to bottom: the title with the counts and the switch; thin `disk` and `jira` meters; a rule; needs-you and failed cards each in a bold box of their colour under a chip (` NEEDS YOU `, ` FAILED `); running cards in one round green box (title, TodoWrite `done/total`, minutes, a row per subagent); in-progress Stories with no worktree. The tab title says how many cards need you (`Walkman · 2`). With nothing to act on it says `✓ all quiet`.
- **Other sessions and subagents:** a card where another Claude Code session on this machine works is lit too (green running, amber waiting for the user), read from Claude Code's own session records; `WALKMAN_OTHER_SESSIONS=off` turns that off. Subagents this session started are rows under its running card (`└ ● Explore  task  2m`).
- **Why a card needs you** comes only from known events: a tool waiting for approval (its name only), a question you asked with AskUserQuestion, or a symphony run in `plan_ready`.
- **Board view:** every status column side by side; each open Story is a round box with key, title, Epic (`◆`), assignee and subtask progress (`━━─ 2/4`); the card being worked on has its border in its colour. Done is a count of the last 14 days. A key bar at the bottom lists the keys.
- **Where:** panes show in a terminal. A terminal session watched from Desktop or a phone through Remote Control shows only the printed text, so suggest `/walkman board print` there.

## How it decides

- A card is a git worktree whose branch starts with a Jira key (`WALK-27-subagent-rows`). To light a card, work in its own worktree.
- Jira is optional and read-only: the project is a per-repo setting (`WALKMAN_JIRA_PROJECT` in the repo's `.claude/settings.local.json`); credentials are per person (`~/.config/symphony-workflow/.env` or the plugin settings). Keep the global `jira_project` plugin option unset.
- Titles and the board come from a background lookup through `uvx` and symphony-workflow; a fresh session can show cards without titles for a few seconds, and the first run downloads about 95 MB.
- To change a Jira card, use `symphony-workflow` (`transition`, `rollup`), never this plugin.
