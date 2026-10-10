# Plan and research notes (2026-10-10)

## References

- **jev-agent-kit** (`cloud-f1/jev-agent-kit`): the template. Plugin manifest + marketplace, one Mod file (`hooks/register.ts`) over a pure `core/`, tests via `claude plugin test`, gate via `claude plugin validate --strict`.
- **symphony-workflow** (`cloud-f1/symphony-workflow`): Run states `created, planning, plan_ready, implementing, completed, failed` in `docs/runs/<KEY>/run.json`. `plan_ready` is the human review gate, so it maps to the red man.
- **@dominikmartn's board** (running / done / failed / needs you, plus disk space): the layout idea for the board and the summary row.
- **Pedestrian signals**: green walking man with a countdown, red standing man.

## Decisions

1. **Card identity = git branch.** The CAS convention `CF1-{n}-{slug}` for branches and worktrees means no extra config and no Jira call is needed to know which card a worktree belongs to.
2. **Read-only.** Jira writes stay in symphony-workflow's own flow.
3. **Two surfaces, one core.** Terminal draws text; Desktop draws the SVG signal (SMIL animation, no script) plus the same text line.
4. **Fail quiet.** Any missing input removes a row or a line; it never raises into the session.

## Open questions (need a real session)

- Does `tool.check` really resolve `ask` while the permission dialog is open, and does the next `tool.call` always mean it was answered?
- Which `turn.complete` `reason` values mean failure?
- Does the Desktop `AbovePrompt` band render `Svg` with the SMIL animation as expected, and at what size?
- Subagent turns carry `agentId`; v0.1 treats the whole session as one worker per worktree.

## Later

- Per-subagent rows; Jira title lookup (read-only) for readable card names; a Windows disk branch; a 5-step progress bar from the symphony run state.
