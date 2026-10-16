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
| Does anything need me, what is running | `/walkman` (side pane) |
| The whole Jira board | `/walkman board` (board pane; `h` / `l` move columns, arrows scroll, Esc closes) |
| The same as text in the conversation | `/walkman board print` |
| Why something is empty or stale | `/walkman doctor` |
| Versions | `/walkman version`; legend: `/walkman help` |

Outside a session: `npx --yes github:cloud-f1/symphony-walkman doctor` checks the setup, `... card KEY-n` creates a card worktree, `... configure --dry-run` plans the Jira project for every repo in a folder.

## What they will see

- **Symbols everywhere:** `⚠` amber needs you, `✕` red failed, `●` green running, `✓` done, `○` idle. The strip above the prompt shows the most urgent card in one line.
- **Side pane, top to bottom:** the title with the counts; the disk meter; in a linked repo a `jira` meter (to do, in progress, done in 14 days) with its age; a rule; needs-you and failed cards (two lines: title, then why); running cards (one line: title, TodoWrite `done/total`, a symphony five-step bar, minutes); in-progress Stories with no worktree; the `▤ BOARD` lane. With nothing to act on it says `✓ all quiet`.
- **Why a card needs you** comes only from known events: a tool waiting for approval (its name only), a question you asked with AskUserQuestion, or a symphony run in `plan_ready`.
- **Board pane:** every status column side by side; each open Story is a card with key, title, Epic (`◆`), assignee and subtask progress (`▰▰▱▱ 2/4`); the card you work in is lit. Done is a count of the last 14 days. A key bar at the bottom lists the keys that work now.
- **Where:** panes show in a terminal. A terminal session watched from Desktop or a phone through Remote Control shows only the printed text, so suggest `/walkman board print` there. Meter pictures need kitty or Ghostty, not through tmux or herdr.

## How it decides

- A card is a git worktree whose branch starts with a Jira key (`WALK-27-subagent-rows`). To light a card, work in its own worktree.
- Jira is optional and read-only: the project is a per-repo setting (`WALKMAN_JIRA_PROJECT` in the repo's `.claude/settings.local.json`); credentials are per person (`~/.config/symphony-workflow/.env` or the plugin settings). Keep the global `jira_project` plugin option unset.
- Titles and the board come from a background lookup through `uvx` and symphony-workflow; a fresh session can show cards without titles for a few seconds, and the first run downloads about 95 MB.
- To change a Jira card, use `symphony-workflow` (`transition`, `rollup`), never this plugin.
