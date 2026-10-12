# Handover (state at v0.5.1, 2026-10-12)

Read this first when picking the project up. The README is for users; this is for whoever works on it next.

## What it is

A native Claude Code plugin (a Mod, TypeScript, no build step) that shows which Jira card Claude is working on as a
pedestrian signal, in the terminal and in Claude Desktop. The plugin is read only. A separate setup CLI
(`cli/walkman.mjs`) configures a repo and does write settings, after showing a plan.

## Links

| What | Where |
|---|---|
| This repo (public, MIT) | <https://github.com/cloud-f1/symphony-walkman> |
| Companion repo (public, MIT) | <https://github.com/cloud-f1/symphony-workflow> (CLI, skills plugin `symphony-workflow-ops`) |
| Releases | tags `v0.1.1` … `v0.5.1` here; `v0.5.0` … `v0.5.2` there |
| Install | `/plugin marketplace add cloud-f1/symphony-walkman` then `/plugin install symphony-walkman@symphony-walkman` (also installs `symphony-workflow-ops`) |
| Setup / check a repo | `npx --yes github:cloud-f1/symphony-walkman setup` · `doctor` · `card KEY-n` · `version` |
| Jira | project **WALK**, Epic WALK-1; the companion's work is Epic ADLC-27 in project ADLC |
| Claude Code docs used | plugins reference <https://code.claude.com/docs/en/plugins-reference>, plugin dependencies <https://code.claude.com/docs/en/plugin-dependencies> |

## Map of the code

| Path | Role |
|---|---|
| `core/*.ts` | Pure logic: card from branch, light, board and pane layout (`style.ts`), SVG, Jira search parsing and JQL (`jira.ts`), doctor wording, version constants. No I/O, no clock reads. |
| `hooks/register.ts` | The only file that calls the mods API. Caches reads, runs the Jira lookup in the background, redraws once a second while a card is running, waiting or failed. |
| `cli/walkman.mjs` | Setup CLI: plain ESM, Node 18+, no dependencies, runs through `npx`. Never prints a credential. |
| `skills/*` | Three skills for Claude, all `user-invocable: false`: `using-walkman`, `developing-walkman` (contributor rules), `tracking-walk-tickets`. |
| `checks/*.check.ts` | Pure and CLI tests (`node --experimental-strip-types --test`). |
| `tests/mod.test.ts` | Mod tests on a stubbed host (`claude plugin test`). |
| `tools/real-session/` | The harness that drives a real Claude Code session; see its README. |
| `.claude-plugin/marketplace.json` | Lists walkman and `symphony-workflow-ops` (from the companion repo, `git-subdir`) so one install brings both. |

## Settings (who sets what)

| Setting | Scope | Where |
|---|---|---|
| `WALKMAN_JIRA_PROJECT` (e.g. `JEV`) | per repo | that repo's `.claude/settings.json` `env` |
| Jira URL, email, API token | per person | plugin settings (`jira_base_url`, `jira_email`, `jira_api_token`, token is sensitive), or env `WALKMAN_JIRA_*`, or a credentials file |
| Credentials file | per person | `~/.config/symphony-workflow/.env` or `WALKMAN_JIRA_ENV_FILE` / plugin setting `jira_env_file` |
| Old clone | per person | `WALKMAN_SYMPHONY_WORKFLOW_DIR` (uses the clone's `.env`) |
| `WALKMAN_RUNS_DIR` | per repo | folder of `<KEY>/run.json` from symphony-workflow, lights `plan_ready` |

Use order for credentials: configured clone, then plugin settings, then the credentials file. The ticket skills and the
`symphony-workflow` CLI run in the Bash tool, which does not see plugin settings, so they still need the credentials file.

## Decisions and why

- **One marketplace lists both plugins.** A dependency on a plugin in another marketplace failed in an isolated profile unless
  that marketplace was already added; a `git-subdir` listing in this marketplace made one install pull both.
- **The lookup runs the released CLI with `uvx`**, pinned in `core/version.ts` (`SW_REF`) and the CLI (`SW_GIT`); a release check
  keeps them equal. Bump both when symphony-workflow releases. No clone, no `uv sync`; the first run downloads about 95 MB.
- **Single Jira site.** No repo uses the other company site, so there are no per-site profiles. Add them if one appears.
- **Installed copies only update when `version` changes**, so every release bumps `plugin.json` and `package.json` together
  (enforced by `checks/release.check.ts`), then tag `vX.Y.Z`.
- **Skill names are verb-ing kebab-case without the plugin name**; the only thing a person types is `/walkman`.
- **`/walkman docker` was added in 0.5.0 and removed in 0.5.1** by owner decision; unknown options print the help.
- **The CLI flag is `--creds`**, not `--env-file`: Node swallows `--env-file` before the script sees it.

## Verified, and not

Verified in real sessions (details and dates in the README table): pane and band with colors, a ticking clock, the permission
ask, a failed turn (`reason="error"`), `plan_ready`, the Jira lookup through `uvx`, `doctor`, `version`, one install bringing
both plugins, setup end to end from GitHub in an isolated profile.

Not verified: the signal drawings inside Claude Desktop itself (WALK-23; they render correctly in a browser engine), Windows
(WALK-30), reading the three Jira plugin settings from secure storage in a real session (the environment route is verified),
Docker was removed so nothing remains there.

## Gotchas that cost time

- `$.env.get` needs a literal name; `claude plugin validate` rejects a variable.
- Plugin tests cannot set plugin options, so the same settings are also readable from env vars (that is how they are tested).
- `scripts/release.sh` in symphony-workflow tags the current commit: run it after the merge, never before.
- A `tsc` run with a broken tsconfig emits `.js` beside every `.ts`; those are ignored now, and a test would catch a tracked one.
- `gh pr merge --delete-branch` prints errors inside a worktree but works; `git fetch --prune` clears stale remote refs.
- A permission dialog hides the band above the prompt; the pane still shows the red man.
- If the owner already installed `symphony-workflow-ops` from its own marketplace, installing walkman adds a second copy.

## Open items

| Ticket | What |
|---|---|
| WALK-20 / WALK-23 | Look at the figure in Claude Desktop. |
| WALK-30 | Windows (disk line and paths). |
| WALK-27, 28, 31 | Ideas, not committed: per-subagent rows, a five-step progress bar from the run state. |
| ADLC-54 | No Sub-tasks (needs its plan from the owner). |
| Companion repo | Idea: read credentials from `~/.config/symphony-workflow/.env` when no variables are set; make `claude-agent-sdk` optional (about 95 MB for read-only commands); `ruff format` would change 13 files. |

## How to continue

1. `git worktree add .claude/worktrees/<wt> -b WALK-<n>-<slug> origin/main` for a ticket with Epic → Story → Sub-task in WALK
   (use `symphony-workflow` through the `tracking-walk-tickets` skill; never a Jira MCP server).
2. `npm test` (checks plus `claude plugin test`) and `claude plugin validate --strict .`.
3. Check the behavior in a real session with `tools/real-session/drive.py`, not only the stubs.
4. PR, merge, bump version and tag, close the tickets bottom-up with `rollup` after the merge is confirmed.
