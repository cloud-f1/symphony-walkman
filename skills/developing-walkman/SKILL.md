---
name: developing-walkman
user-invocable: false
description: Contributor rules for the symphony-walkman repo itself (architecture rules, test commands, honesty rules). Use when editing core/, hooks/register.ts, tests or the README of symphony-walkman.
---

# symphony-walkman contributor rules

## What this is

A native Claude Code Mod (TypeScript, no build step, no runtime dependencies) that shows which Jira card Claude is working on as a pedestrian signal, in the terminal and in Claude Desktop. Read-only by design.

## Commands

```bash
node --experimental-strip-types --test checks/*.check.ts      # pure core checks (Node >= 22.6; the flag is needed below 22.18)
claude plugin test                 # Mod tests on a stubbed host (Claude Code 2.1.287+)
claude plugin validate --strict .  # manifests + Mod static analysis
pnpm test                          # both of the first two
```

Core checks live in `checks/*.check.ts` on purpose: `claude plugin test` loads every `*.test.ts` and refuses `node:test` imports.

## Architecture rules

- `core/*.ts` is **pure**: no `$`, no I/O, no clock reads. Time and files are passed in.
- `hooks/register.ts` is the **only** file that calls the mods API. Write calls in full (`$.ns.method`), event names as string literals, helpers taking `$` as top-level functions in that file (`validate` enforces this).
- `Svg` is a leaf: call the constructor directly, not through `h()` (which adds an empty `children` the engine refuses).
- Never write to Jira, symphony-workflow run files or any repo. Never add a network call of the plugin's own or a key. The one allowed outside read is `symphony-workflow search` (core/jira.ts builds its JQL from validated pieces, and a test asserts no write verb is ever run); keep it in the background and cached.
- Every signal path is best effort: a failing signal must not change a turn or a tool result (`mark()` and `refresh()` swallow errors by design).
- A card = a git worktree whose branch matches `KEY-n[-slug]` (`core/card.ts`). Do not add per-project config for this.

## Honesty rules

- Say exactly what ran. Stub results are not evidence of real-session behavior; keep the README "What is verified" table current when that changes.
- Do not push or publish without the owner's go-ahead (the repo is public). Never put a real key in the repo, tests or chat.

## Releasing

- Any user-visible change bumps `version` in `.claude-plugin/plugin.json` and `package.json` together (`checks/release.check.ts` enforces it). Without a new version string, installed copies never update.
- Ship a version only with `pnpm run release` on an up-to-date `main` after the merge: it runs the gate and the audit (`pnpm run release:check` shows the report without writing) and only then tags, pushes and publishes the GitHub Release. Never tag by hand, and never weaken a gate to make it pass. Each release needs a README "What is verified" row for its version, written before the merge.
- Auto-update is verified only when an installed copy picks up a later release; say so in the README if that has not been seen yet.

## Naming

- Skills are named verb-ing, lowercase kebab-case, and say what they do: `using-walkman`, `developing-walkman`, `tracking-walk-tickets`. Do not repeat the plugin name (Claude Code already shows `symphony-walkman:` in front), and keep the folder name equal to `name:`.
- All skills here are `user-invocable: false`; the only thing a person types is `/walkman`.
- Slash commands are short nouns or verbs (`/walkman`), because people type them.

## The setup CLI

`cli/walkman.mjs` (plain ESM, no dependencies, Node 18+ so `npx` runs it anywhere) has `doctor`, `setup`, `configure` (every repo in a folder), `card` and `version`. Keep it that way: it must never print a credential (read `.env` for names only), must show a plan and ask before changing anything, and must refuse to overwrite a settings file it cannot parse. Its pure parts are tested in `checks/cli.check.ts`.

## Lessons from real sessions (keep these true)

- Text a command returns is drawn as Markdown: a backslash before `[` is eaten, so a copy-paste command shown to the person must not rely on `\[` (write `[[]` in a regex instead).
- Mod tests read `VERSION` from `core/version.ts`; never write the version as a literal in a test.
- Compare against the released version in the same real-session steps (`--plugin-dir` of `main` versus the branch) when a change is meant to remove work: `/walkman debug` shows the trace of marks and reads.
- A fresh Claude Code can show an auto-mode onboarding dialog that swallows the next slash command; send Esc twice before `/walkman debug` in a scripted session.
- `git worktree add ... origin/main` sets the new branch to track `origin/main`; push with `git push -u origin <branch>` so it tracks its own branch.
- Two tickets in flight both bump the version and add a README row, so the second one conflicts. Merge in version order, then rebase: keep the higher version and both README rows.
- The owner lets you merge your own walkman PRs once `pnpm test`, `claude plugin validate --strict .` and the real-session check pass (2026-10-16); GitHub CI is not required. Other repos and other outward steps still need their go-ahead.
- A credentials file must never be written by a `grep` that colors its output (`--color=always` puts escape bytes in the file and uv then fails to parse it).
- A `KEY-n` in git history is a guess: `BUG-12`, `HF-1`, `P2-3` are not Jira projects. `configure` applies a guess only when a read-only search finds issues in it; a project that does not exist answers exit 0 and `0 total`, so check the count, not the exit code.
- The CLI checks must run with the `WALKMAN_*` variables removed from the environment (`cleanEnv()`); a machine that has `WALKMAN_JIRA_PROJECT` set otherwise changes what `doctor` and `setup` report.
- Try a new CLI command with `--dry-run` on the real folder of repos before trusting it: the first version of `configure` planned five wrong projects that a scratch repo could not show.
- A repo that is only scanned (`configure`) is untrusted input: its `.claude/settings*.json` must not choose which clone is run (`uv run` builds the project it runs in), which credentials file is read, or be printed unless the value is a valid project key. Only the repo you run the command in (`doctor`, `setup`, `card`) may supply those settings.
