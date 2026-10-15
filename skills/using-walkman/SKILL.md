---
name: using-walkman
user-invocable: false
description: Explain and operate the Symphony Walkman board. Use when the user asks which card Claude is working on, what the green or red man means, or how to open the board or pane.
---

# Using Symphony Walkman

- `/walkman` opens the colored side pane (it prints the board when there is no room for a pane).
- `/walkman board` prints one row per card worktree (`KEY-n-slug` branch) with its light, state and elapsed time, plus free disk space.
- In a repo linked to a Jira project (`WALKMAN_JIRA_PROJECT`), `/walkman board` also prints the project's Jira board (open Story-level issues by status column, with key, title and assignee; Done only as a 14-day count), and the pane shows the same as a `▤ BOARD` lane: one line per column with a meter and the count. Epic and subtask progress are not shown: symphony-workflow does not return them yet.
- `/walkman pane` opens the same board as a side pane; `/walkman pane close` closes it.
- Green walking man = Claude is working on that card. Red standing man = it needs the person (a permission ask or a symphony-workflow run in `plan_ready`). Red with the word `failed` = the last turn failed (on Desktop the red man also blinks).
- In the side pane the same states are `⚠` amber needs you, `✕` red failed, `● ` green running, `✓` done, `○` idle; only needs-you and failed expand into cards, a running card is one line, and a pane with nothing to act on shows `✓ all quiet`. Times are in minutes.
- The plugin is read-only. To change a Jira card, use `symphony-workflow` (for example `transition` or `rollup`), not this plugin.
- A model cannot run slash commands; if the user wants the board, tell them to type `/walkman` (colored pane) or `/walkman board` (printed), and `/walkman help` for the legend, `/walkman doctor` to check the setup (it also says when the credentials file holds terminal color codes) and `/walkman version` for versions.
- Card titles come from a background Jira lookup, so a fresh session may show the cards without titles for a few seconds; the first run downloads the symphony-workflow CLI through `uvx` (about 95 MB) and is slower.
- Outside a terminal session, `npx --yes github:cloud-f1/symphony-walkman doctor` checks the same setup from the shell, and `... card KEY-n` creates a card worktree.
- To set the Jira project for many repos at once, `npx --yes github:cloud-f1/symphony-walkman configure --dry-run` prints a plan (a project guessed from git history is used only if Jira has issues in it); the project is a per-repo setting, the credentials are per person, and a global `jira_project` plugin option would apply to every repo, so keep it unset.
