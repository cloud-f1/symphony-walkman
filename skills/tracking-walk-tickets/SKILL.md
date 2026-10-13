---
name: tracking-walk-tickets
user-invocable: false
description: WALK-specific rules for symphony-walkman's Jira tickets. Use when the user asks to audit, sync, create, comment on or close tickets for symphony-walkman, or says "Jira WALK". The commands themselves come from the jira-ticket-ops skill.
---

# Jira WALK (project tickets for symphony-walkman)

The Walkman plugin only reads. Ticket changes go through the `jira-ticket-ops` skill, which ships in the `symphony-workflow-ops` plugin (cloud-f1/symphony-workflow, MIT). Load that skill for the command table, the CLI setup and the hierarchy rules; this file only adds what is specific to WALK.

## Prerequisite

The `symphony-workflow-ops` plugin comes with Walkman (one install brings both). The `symphony-workflow` CLI runs through `uvx` with the credentials file (`npx --yes github:cloud-f1/symphony-walkman setup` prepares it). If either is missing, say so and stop. Do not fall back to a Jira MCP server.

## WALK rules

- Project key is **WALK**. Every ticket for this repo lives there; never file it elsewhere.
- Epic is WALK-1. Stories hang under it, Sub-tasks under Stories, and the last Sub-task of a Story is the tests.
- Branch and worktree are `WALK-n-slug`, so the Walkman board can pick the card up.
- Transition Done only after the pull request is merged, then `rollup`.
- The README "What is verified" table must match the open verification Sub-tasks under WALK-20. When a row changes, update both.
- Ask the owner before a bulk create or bulk transition.

## What the CLI does and does not do (seen in practice)

- `create_issue` links a Story to the Epic only with `parent: "WALK-1"`; the `epic` field left it with no Epic. Pass `assignee_account_id` at creation (`get_myself` returns it as `account_id`); `update_issue` cannot set an assignee, and a re-parent through it returned ok without changing anything.
- After creating Stories run `audit WALK`; it should print 0 errors. `audit WALK --assignee-me` also lists the older Done Stories that were never assigned: known and left alone.
- `rollup WALK-<sub-task>` marks that Sub-task Done and rolls up; run it for each Sub-task after the pull request is merged. The Epic stays open while other Stories are open.
- The env file for uvx must not hold terminal color codes (see `/walkman doctor`).
