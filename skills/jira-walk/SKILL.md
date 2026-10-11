---
name: jira-walk
user-invocable: false
description: WALK-specific rules for symphony-walkman's Jira tickets. Use when the user asks to audit, sync, create, comment on or close tickets for symphony-walkman, or says "Jira WALK". The commands themselves come from the jira-ticket-ops skill.
---

# Jira WALK (project tickets for symphony-walkman)

The Walkman plugin only reads. Ticket changes go through the `jira-ticket-ops` skill, which ships in the `symphony-workflow-ops` plugin (cloud-f1/symphony-workflow, MIT). Load that skill for the command table, the CLI setup and the hierarchy rules; this file only adds what is specific to WALK.

## Prerequisite

Install the `symphony-workflow-ops` plugin and have the `symphony-workflow` CLI runnable (see that repo's README). If either is missing, say so and stop. Do not fall back to a Jira MCP server.

## WALK rules

- Project key is **WALK**. Every ticket for this repo lives there; never file it elsewhere.
- Epic is WALK-1. Stories hang under it, Sub-tasks under Stories, and the last Sub-task of a Story is the tests.
- Branch and worktree are `WALK-n-slug`, so the Walkman board can pick the card up.
- Transition Done only after the pull request is merged, then `rollup`.
- The README "What is verified" table must match the open verification Sub-tasks under WALK-20. When a row changes, update both.
- Ask the owner before a bulk create or bulk transition.
