# Handover (state at v0.9.0, refreshed 2026-10-16)

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
| Releases | tags `v0.1.1` … `v0.9.0` here; `v0.5.0` … `v0.12.0` there (its own `docs/HANDOVER.md` holds its state) |
| Install | `/plugin marketplace add cloud-f1/symphony-walkman` then `/plugin install symphony-walkman@symphony-walkman` (also installs `symphony-workflow-ops`) |
| Setup / check a repo | `npx --yes github:cloud-f1/symphony-walkman setup` · `doctor` · `card KEY-n` · `version` |
| Jira | project **WALK**, Epic WALK-1; the companion's work is Epic ADLC-27 in project ADLC |
| Claude Code docs used | plugins reference <https://code.claude.com/docs/en/plugins-reference>, plugin dependencies <https://code.claude.com/docs/en/plugin-dependencies> |

## Plugin repos (all public, MIT)

| Plugin | Repo | Marketplace add | Install |
|---|---|---|---|
| `symphony-walkman` (this repo) | <https://github.com/cloud-f1/symphony-walkman> (`git@github.com:cloud-f1/symphony-walkman.git`) | `/plugin marketplace add cloud-f1/symphony-walkman` | `/plugin install symphony-walkman@symphony-walkman` (brings `symphony-workflow-ops` too) |
| `symphony-workflow-ops` | <https://github.com/cloud-f1/symphony-workflow> (plugin in `plugin/`, v0.9.3) | `/plugin marketplace add cloud-f1/symphony-workflow` | `/plugin install symphony-workflow-ops@symphony-workflow-marketplace` |
| `jev-agent-kit` (a Mod, the template this plugin followed) | <https://github.com/cloud-f1/jev-agent-kit> (v0.8.0, Jira project JEV) | see its README | see its README |

Do not install `symphony-workflow-ops` from both marketplaces; one copy is enough.

## Start a new session (paste this)

> Read `docs/HANDOVER.md` in cloud-f1/symphony-walkman, then `docs/HANDOVER.md` in cloud-f1/symphony-workflow. Jira goes through
> the `symphony-workflow` CLI (project WALK here, ADLC there), never a Jira MCP server. Start with `/walkman doctor` in the
> repo you work in. Open items: WALK-23 (look at the figure in Claude Desktop), WALK-30 (Windows), the next symphony-workflow release (check `search` still prints three TAB columns before moving the pin), ADLC-142, ADLC-146.
> Use a worktree per ticket and verify in a real session, not only the stubs.

## Map of the code

| Path | Role |
|---|---|
| `core/*.ts` | Pure logic: card from branch, light, board and pane layout (`style.ts`; `stylePane` returns `PaneLine`s with an optional right-aligned part), SVG, Jira search parsing and JQL (`jira.ts`), doctor wording, version constants. No I/O, no clock reads. |
| `hooks/register.ts` | The only file that calls the mods API. Caches reads, runs the Jira lookup in the background, redraws once a second while a card is running, waiting or failed. |
| `cli/walkman.mjs` | Setup CLI: plain ESM, Node 18+, no dependencies, runs through `npx`. Commands `doctor`, `setup`, `configure` (every repo in a folder), `card`, `version`. Never prints a credential. |
| `skills/*` | Three skills for Claude, all `user-invocable: false`: `using-walkman`, `developing-walkman` (contributor rules), `tracking-walk-tickets`. |
| `checks/*.check.ts` | Pure and CLI tests (`node --experimental-strip-types --test`). |
| `tests/mod.test.ts` | Mod tests on a stubbed host (`claude plugin test`). |
| `tools/real-session/` | The harness that drives a real Claude Code session; see its README. |
| `.claude-plugin/marketplace.json` | Lists walkman and `symphony-workflow-ops` (from the companion repo, `git-subdir`) so one install brings both. |

## Settings (who sets what)

| Setting | Scope | Where |
|---|---|---|
| `WALKMAN_JIRA_PROJECT` (e.g. `JEV`) | per repo | that repo's `.claude/settings.local.json` (or `settings.json`) `env`; `walkman configure` sets it for every repo in a folder. Do not set the plugin option `jira_project` globally: it applies to every repo without its own setting |
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

Also verified in real sessions since 0.5.1 (README table has the details): fewer repeated reads in 0.5.2 (one fewer `mark` per tool call, compared with 0.5.1 in the same steps) and the color-code message in `doctor` in 0.5.3. The plugin is installed at user scope on the owner's machine with auto-update on (`extraKnownMarketplaces.symphony-walkman.autoUpdate` in `~/.claude/settings.json`).

Not verified: a later release actually arriving through auto-update (the first installed copy was updated by hand from 0.4.0 to 0.5.3), the signal drawings inside Claude Desktop itself (WALK-23; they render correctly in a browser engine), Windows
(WALK-30), reading the three Jira plugin settings from secure storage in a real session (the environment route is verified),
Docker was removed so nothing remains there.

## Gotchas that cost time

- A Claude Code session started under a long-running `herdr server` that was not launched from the normal login session lost the user database: `id` printed no name, `ssh` failed with `No user exists for uid 502`, so every `git fetch` over SSH failed while another terminal worked. Restarting `herdr` from a normal terminal fixed it.
- A credentials file written by `grep --color=always` holds escape bytes and uv says only `Failed to parse environment file`; `/walkman doctor` and the CLI `doctor` now name this.
- Text a command returns is drawn as Markdown, so a `\[` in a copy-paste command loses its backslash; use `[[]`.
- Two tickets in flight conflict on the version lines and the README table; merge in version order and rebase the second.
- Creating Jira Stories: pass `parent` (not `epic`) and `assignee_account_id` at creation; see the `tracking-walk-tickets` skill.
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
| Pin | `SW_REF` in `core/version.ts` and `SW_GIT` in the CLI say symphony-workflow v0.12.0 (2026-10-16: 0.12.0 adds `issue_type`, `parent`, `parent_summary`, `status_category`, `subtasks_done`/`subtasks_total` to `call search_issues`, ADLC-388; `search` still prints three TAB columns). Bump both together, and run a real-session lookup and board. |
| CI | `.github/workflows/ci.yml` runs the core checks, `claude plugin test` and `claude plugin validate --strict .` on pushes to main and on pull requests (first green run 2026-10-14, PR #20). The README CI badge shows the `main` branch, so it reads green after the first merge. |
| WALK-27, 28, 31 | Ideas, not committed: per-subagent rows, a five-step progress bar from the run state. |
| ADLC-54 | No Sub-tasks (needs its plan from the owner). |
| Companion repo | Idea: read credentials from `~/.config/symphony-workflow/.env` when no variables are set; make `claude-agent-sdk` optional (about 95 MB for read-only commands); `ruff format` would change 13 files. |

## How to continue

1. `git worktree add .claude/worktrees/<wt> -b WALK-<n>-<slug> origin/main` for a ticket with Epic → Story → Sub-task in WALK
   (use `symphony-workflow` through the `tracking-walk-tickets` skill; never a Jira MCP server).
2. `npm test` (checks plus `claude plugin test`) and `claude plugin validate --strict .`.
3. Check the behavior in a real session with `tools/real-session/drive.py`, not only the stubs.
4. PR, merge, bump version and tag, close the tickets bottom-up with `rollup` after the merge is confirmed.

## Decisions since 0.5.3

- **The Jira project is per repo, never global.** A global plugin option `jira_project` made every repo without its own setting show that project's cards (it showed JEV cards in unrelated repos). `configure` reports it and removes it only with `--drop-global-project`.
- **`configure` never applies an unconfirmed guess.** The project most often named in git history is used only if a read-only Jira search finds issues in it; on the owner's 75 repos the unchecked guess would have written `BUG`, `HF`, `P2`, `SP` and `TICKET`. `--no-verify` trusts git history.
- **The pane's detail follows how much a card needs you (v0.6.0).** Quiet is nearly empty; a running card is one line (title, five-step bar, minutes); only needs-you (amber) and failed (red) expand. `/walkman board` is unchanged: plain text with titles and a legend. `viewport.columns` is the whole terminal, not the pane, so the pane assumes a conservative width and lets `Text` cut the rest; only `viewport.rows` is used (for `+N more`).
- `configure` scans repos you did not choose, so it ignores their `WALKMAN_SYMPHONY_WORKFLOW_DIR` and `WALKMAN_JIRA_ENV_FILE` settings (a repo could point `uv run` at a directory of its own) and shows a scanned project value only if it is a valid key. `doctor`, `setup` and `card` still read the settings of the repo you run them in; an optional follow-up is to stop trusting those too.
- The panel redesign (v0.6.0) came from a spec the owner pasted on 2026-10-14. Not done from it, because the data is not there: the permission question's text and a failure's message (the pane says why a card needs you only from known state). In 0.6.1 the strip above the prompt shows minutes too and the timer runs every 30 seconds on the terminal; it runs every second only after a Desktop signal has been drawn, because that drawing counts seconds. Possible follow-ups: show the tool name of a pending permission ask (it is in the `tool.check` event), and per-subagent rows from `$.agent.list()` (WALK-28; the Mod API lists each subagent's id, task, type and status).
- The Jira board (v0.7.0, WALK-143) is the owner's option C of 2026-10-15: whole project, open Story-level issues by status column, Done only as a 14-day count; a `▤ BOARD` lane in the pane and a section in `/walkman board`; on kitty/Ghostty the meter is an `Image` (RGBA pixels made in `core/jiraboard.ts`, no font, so text stays terminal text). Not done: Epic labels and subtask progress, because `search_issues` does not return `parent`, issue type or status category. Option A is to add those fields to symphony-workflow's search output (an ADLC ticket), then bump the pin and add them here. The status category comes from running one query per category. `Image` is used on the terminal surface only: in the test host the element table carries an `Image` on Desktop too, and it drew nothing there.
- The board pane (v0.8.0, WALK-151) is the owner's option A of 2026-10-16, with sideways scrolling: a second pane (`walkman-board`, asks for 120 columns and the keyboard), drawn by `core/boardgrid.ts`. The pane scroll is vertical only, and only a digit or a lowercase letter can be a Button hotkey, so sideways is a column offset moved by `h` / `l` Buttons. Esc closes the pane (`closeOnEscape`), so a driven test that sends Esc loses it. The pane props give the real width (`bodyColumns`), unlike the side pane's viewport. The needs-you card in the side pane stays two lines (owner, same day).
- v0.9.0 (WALK-156, 2026-10-16): the owner asked for htop style and the overview on top. Disk and a Jira meter moved under the side pane's title (with a rule under them); the board pane got a key bar and the read age; cards show the Epic and subtask progress from symphony-workflow 0.12. From the switchboard research (github.com/wide3751/switchboard, read only): AskUserQuestion counts as needs-you, the reason names the tool waiting for approval (never its input), TodoWrite gives `done/total`. Not taken yet: cross-session lights from `~/.claude/sessions/*.json` (an internal, undocumented format; never read the `*.key` files there) and jump-to-session. Remote Control (a terminal session watched from Desktop or a phone) shows only printed text: no pane, no strip.
