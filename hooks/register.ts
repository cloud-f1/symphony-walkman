// Symphony Walkman: native Claude Code Mod. Thin adapter: every mods API call lives in this file,
// every decision lives in ../core (pure, testable without a session). Read only: it never writes
// to Jira, to symphony-workflow's run files, or to any repo.
import type { EngineInterface as Engine, On, PluginOptions, RenderElement } from 'claude-code' // types only; erased at run time
import { cardFromBranch, parseWorktrees } from '../core/card.ts'
import { deriveLight, parseRunState } from '../core/lights.ts'
import { parseDf } from '../core/disk.ts'
import { renderBoard } from '../core/board.ts'
import { buildJql, mergeJira, parseSearch } from '../core/jira.ts'
import type { JiraIssue } from '../core/jira.ts'
import { HELP, LEGEND, plain, stylePane, styleBand } from '../core/style.ts'
import type { Line, Tone } from '../core/style.ts'
import { signalSvg } from '../core/svg.ts'
import type { CardRow, Disk, RunState } from '../core/contracts.ts'

const PANE_ID = 'walkman-pane'
const SETUP_COMMAND = 'npx --yes github:cloud-f1/symphony-walkman setup'
const REFRESH_MS = 3000 // draws can repeat often; reread git / files at most this often

// Session-local state. Resets on reload.
let pluginOptions: Record<string, unknown> = {}
const live = new Map<string, { isWorking: boolean; askPending: boolean; lastTurnFailed: boolean; sinceMs: number }>()
const cache: { at: number; rows: CardRow[]; disk?: Disk; why?: string } = { at: -Infinity, rows: [] }

function option(name: string, fallback: string): string {
  const v = pluginOptions[name]
  return typeof v === 'string' && v !== '' ? v : fallback
}

// Same rule as jev-agent-kit: only "~" and "~/..." expand, and a result that is not absolute is ignored.
async function expandHome($: Engine, p: string): Promise<string> {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  const out = p === '~' || p.startsWith('~/') ? home + p.slice(1) : p
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(out) ? out : ''
}


// Tones follow the person's theme (the same keys the status line colors map to).
const THEME: Record<Tone, string> = { success: 'success', error: 'error', warning: 'warning', subtle: 'inactive', text: 'text' }

// One styled line as a row of Text pieces. Wrapping is off so a narrow pane never splits a card.
function styled(Box: never, Text: never, line: Line): unknown {
  if (line.length === 0) return h(Text, null, ' ')
  return h(Box, { flexDirection: 'row' }, ...line.map((seg) => h(Text, { color: THEME[seg.tone ?? 'text'], bold: seg.bold === true, wrap: 'truncate-end' }, seg.text)))
}

async function readRunState($: Engine, key: string): Promise<RunState | undefined> {
  const dir = await expandHome($, option('runs_dir', ''))
  if (dir === '') return undefined
  try {
    const path = dir + '/' + key + '/run.json'
    return (await $.fs.exists(path)) ? parseRunState(await $.fs.read(path)) : undefined
  } catch {
    return undefined // unreadable run file: no symphony signal, never a crash
  }
}

async function readDisk($: Engine): Promise<Disk | undefined> {
  if ((await $.env.get('OS')) === 'Windows_NT') return undefined // df is POSIX; no Windows branch yet
  try {
    const path = (await expandHome($, option('disk_path', '/'))) || '/'
    const run = await $.process.run(['df', '-Pk', path], { timeoutMs: 1500 })
    return run.exitCode === 0 ? parseDf(run.stdout) : undefined
  } catch {
    return undefined
  }
}

let inflight: Promise<void> | undefined

// Optional, read only Jira lookup through `symphony-workflow search` (settings jira_project and
// symphony_workflow_dir). It runs in the background and is cached, so a draw never waits for it.
const JIRA_MS = 60_000
const JIRA_RETRY_MS = 300_000
const jira: { at: number; keys: string; issues: JiraIssue[]; error?: string; inflight?: Promise<void> } = { at: -Infinity, keys: '', issues: [] }

// The project is per repo, so WALKMAN_JIRA_PROJECT (set in the repo's .claude/settings.json env) wins over the
// plugin setting; the symphony-workflow folder is per person, so the setting is the usual place for it.
async function jiraSettings($: Engine): Promise<{ project: string; dir: string }> {
  const project = ((await $.env.get('WALKMAN_JIRA_PROJECT')) || option('jira_project', '')).trim()
  const dir = await expandHome($, (await $.env.get('WALKMAN_SYMPHONY_WORKFLOW_DIR')) || option('symphony_workflow_dir', ''))
  return { project, dir }
}

async function fetchJira($: Engine, keys: string[]): Promise<void> {
  let settings: { project: string; dir: string }
  try {
    settings = await jiraSettings($)
  } catch (err) {
    jira.error = 'settings: ' + String(err).slice(0, 100) // a background read must never reject
    jira.at = Date.now()
    return
  }
  const { project, dir } = settings
  const jql = buildJql(project, keys)
  if (jql === undefined || dir === '') {
    jira.issues = []
    jira.error = project === '' ? undefined : 'jira_project or symphony_workflow_dir is not valid'
    return
  }
  try {
    // Fixed arguments; the only variable part is the JQL built from validated pieces. A search never writes.
    const run = await $.process.run(['uv', 'run', '--env-file', '.env', 'symphony-workflow', 'search', jql], { cwd: dir, timeoutMs: 20000 })
    if (run.exitCode === 0) {
      jira.issues = parseSearch(run.stdout)
      jira.error = undefined
    } else {
      jira.error = `exit ${run.exitCode}: ${(run.stderr || run.stdout).trim().slice(0, 100)}`
    }
  } catch (err) {
    jira.error = 'threw: ' + String(err).slice(0, 100)
  }
  jira.keys = keys.join(',')
  jira.at = await $.clock.now()
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // a redraw is a courtesy
  }
}

// Starts a lookup when one is due (new cards, or the cache is old); returns the running one, if any.
function ensureJira($: Engine, now: number, keys: string[]): Promise<void> | undefined {
  if (jira.inflight) return jira.inflight
  const due = jira.keys !== keys.join(',') || now - jira.at >= (jira.error ? JIRA_RETRY_MS : JIRA_MS)
  if (!due) return undefined
  jira.inflight = fetchJira($, keys).finally(() => {
    jira.inflight = undefined
  })
  return jira.inflight
}

// What the board draws: worktree cards with their titles, and the Jira cards that have no worktree.
function view(): { rows: CardRow[]; others: JiraIssue[] } {
  return mergeJira(cache.rows, jira.issues)
}
let lastBand = ''
let renders = 0
let ticker: { cancel: () => void } | undefined
const trace: string[] = [] // last few signal events, for /walkman debug
const note = (line: string) => {
  trace.push(line)
  if (trace.length > 12) trace.shift()
}

// Rereads the cards at most every REFRESH_MS. Overlapping callers share one read, and a read that fails
// keeps the last good rows: a call can be aborted while the pane is drawing, and an empty board then
// would say "no card" about a card that is there.
async function refresh($: Engine): Promise<void> {
  const now = await $.clock.now()
  if (now - cache.at >= 0 && now - cache.at < REFRESH_MS) return
  if (inflight) return inflight
  inflight = load($, now).finally(() => {
    inflight = undefined
  })
  return inflight
}

async function listWorktrees($: Engine): Promise<string | undefined> {
  const cwd = await $.session.cwd()
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const run = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd, timeoutMs: 2000 })
      cache.why = `cwd=${cwd} git=${run.exitCode} ${run.stderr.trim().slice(0, 80)}`
      return run.exitCode === 0 ? run.stdout : undefined
    } catch (err) {
      cache.why = 'threw: ' + String(err).slice(0, 80)
    }
  }
  return undefined
}

async function load($: Engine, now: number): Promise<void> {
  const out = await listWorktrees($)
  if (out === undefined) {
    cache.at = -Infinity // not read: try again on the next draw, and keep the rows we had
    return
  }
  cache.at = now
  const rows: CardRow[] = []
  for (const wt of parseWorktrees(out)) {
    const card = cardFromBranch(wt.branch, wt.path)
    if (!card) continue
    const sig = live.get(wt.path)
    const runState = await readRunState($, card.key)
    rows.push({
      ...card,
      runState,
      light: deriveLight({ isWorking: sig?.isWorking ?? false, askPending: sig?.askPending ?? false, lastTurnFailed: sig?.lastTurnFailed ?? false, runState }),
      sinceMs: sig?.sinceMs ?? now,
    })
  }
  cache.rows = rows
  cache.disk = await readDisk($)
  void ensureJira($, now, rows.map((r) => r.key)) // background; never awaited here
}

// Mark the session's current worktree. Unknown (non-card) worktrees are ignored by refresh().
async function mark($: Engine, patch: Partial<{ isWorking: boolean; askPending: boolean; lastTurnFailed: boolean }>): Promise<void> {
  try {
    const cwd = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd, timeoutMs: 1500 })
    const path = top.exitCode === 0 ? top.stdout.trim() : cwd
    const prev = live.get(path) ?? { isWorking: false, askPending: false, lastTurnFailed: false, sinceMs: 0 }
    live.set(path, { ...prev, ...patch, sinceMs: await $.clock.now() })
    note(`mark ${JSON.stringify(patch)} path=${path} cwd=${cwd}`)
    cache.at = -Infinity // a signal changed: reread on the next draw
    $.ui.invalidate('ui.render')
    const working = [...live.values()].some((v) => v.isWorking)
    if (working && !ticker) ticker = $.clock.every(1000, () => $.ui.invalidate('ui.render')) // the clock on a running card ticks
    if (!working && ticker) {
      ticker.cancel()
      ticker = undefined
    }
  } catch (err) {
    // A signal is a courtesy; it must never affect the turn or the tool.
    note(`mark failed ${JSON.stringify(patch)}: ${String(err).slice(0, 100)}`)
  }
}

export function register(on: On, options?: PluginOptions) {
  pluginOptions = (options ?? {}) as Record<string, unknown>

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'walkman', description: 'Card board: colored side pane (default), board (print), pane close', argumentHint: 'board|pane|pane close', immediate: true })
    } catch {
      // A taken command name must not stop the session from starting.
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await mark($, { isWorking: true, askPending: false, lastTurnFailed: false })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // `reason` values beyond 'aborted' and 'refusal' are not enumerated here; anything error-like counts as failed.
    const reason = String((e as { reason?: unknown }).reason ?? '')
    const failed = reason === 'refusal' || reason.includes('error')
    await mark($, { isWorking: false, askPending: false, lastTurnFailed: failed })
    return next(e)
  })

  // A permission ask is the red man: the engine's verdict is 'ask' until the person answers.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if ((verdict as { decision?: unknown }).decision === 'ask') await mark($, { askPending: true })
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    await mark($, { askPending: false }) // a call running means the ask was answered
    return next(e)
  })

  on('command.run', { command: 'walkman' }, async ($, e) => {
    const [sub, arg] = String(e.args ?? '').trim().split(/\s+/)
    const openPane = async () => {
      try {
        const opened = await $.ui.open({ id: PANE_ID, title: 'Walkman', closeOnEscape: true })
        return opened.isPlaced
      } catch {
        return false
      }
    }
    if (sub === 'debug') {
      await refresh($)
      return { text: ['Walkman debug', `rows: ${cache.rows.map((r) => r.key + ':' + r.light + '@' + r.worktree).join(', ') || '(none)'}`, `live: ${[...live.entries()].map(([k, v]) => k + '=' + JSON.stringify(v)).join('; ') || '(none)'}`, `read: ${cache.why ?? '(none)'}`, `band renders: ${renders}`, `jira: ${jira.issues.length} issues, last read ${jira.at === -Infinity ? 'never' : 'ok'}${jira.error ? ', error ' + jira.error : ''}`, ...trace].join('\n') }
    }
    if (sub === 'help') return { text: ['Walkman', HELP, 'Set up Jira linking: ' + SETUP_COMMAND, plain(LEGEND)].join('\n') }
    if (sub === 'pane' && arg === 'close') {
      try {
        await $.ui.close({ id: PANE_ID })
        return { text: 'Pane closed.' }
      } catch {
        return { text: 'Could not close the pane here.' }
      }
    }
    if (sub === 'pane' || sub === undefined || sub === '') {
      if (await openPane()) return { text: 'Walkman pane opened. /walkman pane close (or Esc) closes it.' }
      if (sub === 'pane') return { text: 'Walkman pane is waiting: widen the terminal to see it.' }
      // /walkman with no room for a pane: fall through to the printed board.
    }
    await refresh($)
    if (jira.at === -Infinity) await ensureJira($, await $.clock.now(), cache.rows.map((r) => r.key)) // first board: wait once so titles show
    // The host puts "<plugin>:" in front of the first line, so a header line keeps the rows aligned.
    const v = view()
    const lines = renderBoard(v.rows, cache.disk, await $.clock.now(), v.others)
    const linked = (await jiraSettings($).catch(() => ({ project: '', dir: '' }))).project !== ''
    return { text: ['Walkman board', ...lines, ...(cache.rows.length === 0 && cache.why && !/ git=0\b/.test(cache.why) ? ['(could not read git: ' + cache.why + ')'] : []), ...(jira.error ? ['(jira lookup: ' + jira.error + ')'] : []), ...(linked ? [] : ['', 'Not linked to Jira. Set WALKMAN_JIRA_PROJECT, or run: ' + SETUP_COMMAND]), '', plain(LEGEND)].join('\n') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await refresh($)
    const v = view()
    const lines = stylePane(v.rows, cache.disk, await $.clock.now(), v.others)
    return h(Box, { flexDirection: 'column', paddingX: 1 }, ...lines.map((line) => styled(Box as never, Text as never, line))) as RenderElement
  })

  // The always-on strip above the prompt: one text line on the terminal, the signal drawing on Desktop.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await refresh($)
    if (cache.rows.length === 0) return next(e) // not in a card worktree: draw nothing of our own
    const now = await $.clock.now()
    renders++
    const sig = cache.rows.map((r) => r.key + ':' + r.light).join(',')
    if (sig !== lastBand) note(`band render ${sig}`)
    lastBand = sig
    const lead = cache.rows.find((r) => r.light === 'failed' || r.light === 'waiting') ?? cache.rows.find((r) => r.light === 'walking') ?? cache.rows[0]
    const elements = $.ui.resolve(e) as Record<string, unknown>
    if (e.surface === 'desktop' && lead && elements['Svg']) {
      const { Box, Svg, Text } = elements as never as { Box: never; Svg: never; Text: never }
      return h(
        Box,
        { flexDirection: 'row', paddingX: 1 },
        // Svg is a leaf: call the constructor directly, since h() would hand it an empty `children`.
        (Svg as (props: object) => unknown)({ source: signalSvg(lead.light, Math.floor((now - lead.sinceMs) / 1000)), alt: `${lead.key} is ${lead.light}`, width: 120, height: 64 }),
        h(Box, { flexDirection: 'row', paddingX: 1 }, styled(Box as never, Text as never, styleBand(cache.rows, now))),
      ) as RenderElement
    }
    const { Box, Text } = $.ui.resolve(e)
    return h(Box, { paddingX: 1 }, styled(Box as never, Text as never, styleBand(cache.rows, now))) as RenderElement
  })
}
