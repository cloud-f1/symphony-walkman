---
name: using-walkman
user-invocable: false
description: Explain and operate the Symphony Walkman board. Use when the user asks which card Claude is working on, what the green or red man means, or how to open the board or pane.
---

# Using Symphony Walkman

- `/walkman` opens the colored side pane (it prints the board when there is no room for a pane).
- `/walkman board` prints one row per card worktree (`KEY-n-slug` branch) with its light, state and elapsed time, plus free disk space.
- `/walkman pane` opens the same board as a side pane; `/walkman pane close` closes it.
- Green walking man = Claude is working on that card. Red standing man = it needs the person (a permission ask or a symphony-workflow run in `plan_ready`). Red with the word `failed` = the last turn failed (on Desktop the red man also blinks).
- The plugin is read-only. To change a Jira card, use `symphony-workflow` (for example `transition` or `rollup`), not this plugin.
- A model cannot run slash commands; if the user wants the board, tell them to type `/walkman` (colored pane) or `/walkman board` (printed), and `/walkman help` for the legend, `/walkman doctor` to check the setup and `/walkman version` for versions.
