---
name: walkman-dev
user-invocable: false
description: Contributor rules for the symphony-walkman repo itself (architecture rules, test commands, honesty rules). Use when editing core/, hooks/register.ts, tests or the README of symphony-walkman.
---

# symphony-walkman contributor rules

## What this is

A native Claude Code Mod (TypeScript, no build step, no runtime dependencies) that shows which Jira card Claude is working on as a pedestrian signal, in the terminal and in Claude Desktop. Read-only by design.

## Commands

```bash
node --test checks/*.check.ts      # pure core checks (Node >= 22.18)
claude plugin test                 # Mod tests on a stubbed host (Claude Code 2.1.287+)
claude plugin validate --strict .  # manifests + Mod static analysis
npm test                           # both of the first two
```

Core checks live in `checks/*.check.ts` on purpose: `claude plugin test` loads every `*.test.ts` and refuses `node:test` imports.

## Architecture rules

- `core/*.ts` is **pure**: no `$`, no I/O, no clock reads. Time and files are passed in.
- `hooks/register.ts` is the **only** file that calls the mods API. Write calls in full (`$.ns.method`), event names as string literals, helpers taking `$` as top-level functions in that file (`validate` enforces this).
- `Svg` is a leaf: call the constructor directly, not through `h()` (which adds an empty `children` the engine refuses).
- Never write to Jira, symphony-workflow run files or any repo. Never add a network call or a key.
- Every signal path is best effort: a failing signal must not change a turn or a tool result (`mark()` and `refresh()` swallow errors by design).
- A card = a git worktree whose branch matches `KEY-n[-slug]` (`core/card.ts`). Do not add per-project config for this.

## Honesty rules

- Say exactly what ran. Stub results are not evidence of real-session behavior; keep the README "What is verified" table current when that changes.
- Do not push or publish without the owner's go-ahead (the repo is public). Never put a real key in the repo, tests or chat.

## Releasing

- Any user-visible change bumps `version` in `.claude-plugin/plugin.json` and `package.json` together (`checks/release.check.ts` enforces it). Without a new version string, installed copies never update.
- Tag the merge commit `vX.Y.Z` and push the tag.
- Auto-update is verified only when an installed copy picks up a later release; say so in the README if that has not been seen yet.
