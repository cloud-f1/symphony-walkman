---
name: jira-walk
description: Track and sync this project's work in the Jira project WALK through the symphony-workflow CLI and Jira REST. Use when the user asks to audit, sync, create, comment on or close tickets for symphony-walkman, or says "Jira WALK".
---

# Jira WALK (project tickets for symphony-walkman)

This skill is the write side that the Walkman plugin deliberately lacks. The plugin only reads; this skill moves tickets, and only through the symphony-workflow CLI or the Jira REST API. Do not use a Jira MCP server for this project.

## Prerequisite

The `symphony-workflow` CLI comes from the `symphony-workflow-ops` plugin's repo (cloud-f1/symphony-workflow, private). Install that plugin and clone the repo so `symphony-workflow` runs. If the CLI is missing, say so and stop; do not fall back to a Jira MCP server.

## Rules

- Project key is **WALK**. Every ticket for this repo lives there. Never file it in another project.
- Hierarchy is Epic -> Story -> Sub-task. Build nothing directly under an Epic; decompose first. Every non-Epic ticket needs a parent.
- Branches and worktrees start with the key (`WALK-n-slug`), so the Walkman board can pick the card up.
- Close bottom-up with `rollup` after merge confirmation, not before. A Story is Done only when all its Sub-tasks are.
- Credentials come from the symphony-workflow `.env` (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`). Never print them or write them into this repo.
- Ask the owner before any bulk create or bulk transition.

## Commands

Run from a symphony-workflow checkout, with `uv run --env-file .env symphony-workflow ...`:

| Need | Command |
|---|---|
| Read one ticket | `get WALK-12` |
| Audit the project | `search 'project = WALK ORDER BY key ASC'` |
| Comment | `comment WALK-12 "text"` |
| Move a ticket | `transition WALK-12 "In Progress"` |
| Close upward | `rollup WALK-12` (add `--dry-run` first) |
| Everything else | `list-tools`, then `call <tool> '<json>'` (`create_issue`, `update_issue`, `create_remote_link`) |

Use raw REST only for what the CLI has no command for, such as creating a project or searching with extra fields.

## Audit checklist

1. Count tickets by type and status.
2. Every non-Epic has a parent, and every Story sits under the Epic.
3. No Done Story has an open Sub-task.
4. The README "What is verified" table matches the open WALK verification Sub-tasks.
5. Report the numbers, fix only what was asked.
