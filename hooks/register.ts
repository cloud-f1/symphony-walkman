// Symphony Walkman: native Claude Code Mod. Thin adapter: every mods API call lives in this file,
// every decision lives in ../core (pure, testable without a session). Read only: it never writes
// to Jira, to symphony-workflow's run files, or to any repo.
import type { EngineInterface as Engine, On, PluginOptions, RenderElement } from 'claude-code' // types only; erased at run time
import { cardFromBranch, parseWorktrees } from '../core/card.ts'
import { deriveLight, parseRunState } from '../core/lights.ts'
import { parseDf, parsePsDrive } from '../core/disk.ts'
import { renderBoard } from '../core/board.ts'
import { buildJql, isProject, mergeJira, parseSearch } from '../core/jira.ts'
import { BOARD_CAP, boardJql, boardOverview, boardText, buildBoard, parseIssuesJson } from '../core/jiraboard.ts'
import type { Board, BoardIssue } from '../core/jiraboard.ts'
import { doctorLines, envNames, hasAnsi } from '../core/doctor.ts'
import { SW_GIT, SW_REF, VERSION } from '../core/version.ts'
import type { JiraIssue } from '../core/jira.ts'
import { HELP, LEGEND, SUBCOMMANDS, plain, stylePane, styleBand } from '../core/style.ts'
import type { Line, PaneLine, Seg, Tone } from '../core/style.ts'
import { signalSvg } from '../core/svg.ts'
import { FRAME_MS, SIGNAL_ROWS, leadOf, signalLines, signalNumber, signalPace } from '../core/signal.ts'
import { TRACK_ROWS, playground } from '../core/track.ts'
import { SCENES, demoRows } from '../core/demo.ts'
import { touchedWorktree } from '../core/touch.ts'
import { playgroundSvg } from '../core/tracksvg.ts'
import { isRecordName, otherSessionLights, parsePs, parseRecord, parseTasklist } from '../core/sessions.ts'
import type { SessionRecord } from '../core/sessions.ts'
import { CARD_CELLS, boardGrid } from '../core/boardgrid.ts'
import type { CardLight, GridCard } from '../core/boardgrid.ts'
import type { AgentRow, CardRow, Disk, Light, RunState } from '../core/contracts.ts'

const PANE_ID = 'walkman-pane'
// One pane, two views (WALK-174): `cards` (the side view) and `board` (the Jira columns). b switches.
let paneView: 'cards' | 'board' = 'cards'
// Demo mode (WALK-193): 0 is off, 1..7 a scene of made-up cards; `demoBegan` < 0 starts the scene at the next draw.
let demo = 0
let demoBegan = 0
let paneOpen = false // opened by /walkman and not closed since: only then is the title kept current
let paneTitle = 'Walkman'
let boardOffset = 0 // the first board column the board view shows; h and l move it
const SETUP_COMMAND = 'npx --yes github:cloud-f1/symphony-walkman setup'
const DEFAULT_ENV_FILE = '~/.config/symphony-workflow/.env'
const REFRESH_MS = 3000 // draws can repeat often; reread git / files at most this often
const DISK_MS = 30_000 // free space moves slowly: reread it far less often than the cards

// Session-local state. Resets on reload.
let pluginOptions: Record<string, unknown> = {}
type Live = { isWorking: boolean; askPending: boolean; lastTurnFailed: boolean; sinceMs: number; why?: string; todo?: { done: number; total: number } }
const live = new Map<string, Live>()
const cache: { at: number; rows: CardRow[]; disk?: Disk; diskAt: number; why?: string } = { at: -Infinity, rows: [], diskAt: -Infinity }

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
const THEME: Record<Tone, string> = {
  success: 'success', error: 'error', warning: 'warning', subtle: 'inactive', text: 'text', inverse: 'inverseText',
  // a card's own colour on the playground: theme keys that say nothing about status and draw as different colours
  // (measured 2026-10-18 in the dark theme: suggestion, permission and remember draw alike, so do merged and autoAccept)
  card0: 'claude', card1: 'ide', card2: 'planMode', card3: 'merged', card4: 'suggestion', card5: 'bashBorder',
}

// Secondary text (`subtle`) is drawn dim in the theme's own text colour; a `bg` makes a chip.
const textProps = (seg: Seg): Record<string, unknown> => ({
  ...(seg.tone === 'subtle' ? { dimColor: true } : { color: THEME[seg.tone ?? 'text'] }),
  ...(seg.bg ? { backgroundColor: THEME[seg.bg] } : {}),
  bold: seg.bold === true,
  // a rule is cut at the edge with no ellipsis: Desktop's wider cells overflowed it into "…" (WALK-202)
  wrap: /^─+$/.test(seg.text) ? 'truncate' : 'truncate-end',
})

// One styled line as a row of Text pieces. Wrapping is off so a narrow pane never splits a card.
function styled(Box: never, Text: never, line: Line): unknown {
  if (line.length === 0) return h(Text, null, ' ')
  return h(Box, { flexDirection: 'row' }, ...line.map((seg) => h(Text, textProps(seg), seg.text)))
}

// One pane line: `left` as styled Texts; with `right` (a time), the two sit at opposite edges of the row.
function paneRow(Box: never, Text: never, line: PaneLine): unknown {
  if (!line.right) return styled(Box, Text, line.left)
  return h(Box, { flexDirection: 'row', justifyContent: 'space-between' }, styled(Box, Text, line.left), styled(Box, Text, line.right))
}

// Pane lines, the ones that share a box id drawn inside one bordered Box (bold for a card that needs you or failed,
// round for the running cards), in the box's colour.
function paneBody(Box: never, Text: never, lines: readonly PaneLine[]): unknown[] {
  const out: unknown[] = []
  for (let i = 0; i < lines.length; ) {
    const box = (lines[i] as PaneLine).box
    if (!box) {
      out.push(paneRow(Box, Text, lines[i] as PaneLine))
      i++
      continue
    }
    const group: unknown[] = []
    while (i < lines.length && (lines[i] as PaneLine).box?.id === box.id) group.push(paneRow(Box, Text, lines[i++] as PaneLine))
    out.push(h(Box, { flexDirection: 'column', borderStyle: box.style, borderColor: THEME[box.tone] }, ...group))
  }
  return out
}

// A board card as a real Box: round border, in its tone when lit (running, needs you, failed), dim otherwise.
function cardBox(Box: never, Text: never, c: GridCard): unknown {
  return h(Box, { flexDirection: 'column', borderStyle: 'round', width: CARD_CELLS, paddingX: 1, ...(c.lit ? { borderColor: THEME[c.tone] } : { borderDimColor: true }) }, ...c.body.map((l) => styled(Box, Text, l)))
}

async function readRunState($: Engine, key: string): Promise<RunState | undefined> {
  const dir = await expandHome($, (await $.env.get('WALKMAN_RUNS_DIR')) || option('runs_dir', ''))
  if (dir === '') return undefined
  try {
    const path = dir + '/' + key + '/run.json'
    return (await $.fs.exists(path)) ? parseRunState(await $.fs.read(path)) : undefined
  } catch {
    return undefined // unreadable run file: no symphony signal, never a crash
  }
}

async function readDisk($: Engine): Promise<Disk | undefined> {
  try {
    if ((await $.env.get('OS')) === 'Windows_NT') {
      // Windows (WALK-30): the system drive through PowerShell; df is POSIX only
      const drive = ((await $.env.get('SystemDrive')) || 'C:').replace(/[^A-Za-z]/g, '').slice(0, 1) || 'C'
      const run = await $.process.run(['powershell', '-NoProfile', '-Command', `(Get-PSDrive ${drive}).Free; (Get-PSDrive ${drive}).Used`], { timeoutMs: 5000 })
      return run.exitCode === 0 ? parsePsDrive(run.stdout) : undefined
    }
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
type JiraCreds = { JIRA_BASE_URL: string; JIRA_EMAIL: string; JIRA_API_TOKEN: string }

// Credentials given as plugin settings (the token is stored in secure storage) or, for scripts and tests, as
// WALKMAN_JIRA_BASE_URL / _EMAIL / _API_TOKEN. All three are needed; a partial set is reported, never half-used.
async function jiraCreds($: Engine): Promise<{ creds?: JiraCreds; set: string[] }> {
  // $.env.get needs literal names, so each variable is spelled out.
  const url = ((await $.env.get('WALKMAN_JIRA_BASE_URL')) || option('jira_base_url', '')).trim()
  const email = ((await $.env.get('WALKMAN_JIRA_EMAIL')) || option('jira_email', '')).trim()
  const token = ((await $.env.get('WALKMAN_JIRA_API_TOKEN')) || option('jira_api_token', '')).trim()
  const set = [url && 'URL', email && 'email', token && 'token'].filter(Boolean) as string[]
  return set.length === 3 ? { creds: { JIRA_BASE_URL: url, JIRA_EMAIL: email, JIRA_API_TOKEN: token }, set } : { set }
}

async function jiraSettings($: Engine): Promise<{ project: string; dir: string; envFile: string }> {
  const project = ((await $.env.get('WALKMAN_JIRA_PROJECT')) || option('jira_project', '')).trim()
  const dir = await expandHome($, (await $.env.get('WALKMAN_SYMPHONY_WORKFLOW_DIR')) || option('symphony_workflow_dir', ''))
  const envFile = await expandHome($, (await $.env.get('WALKMAN_JIRA_ENV_FILE')) || option('jira_env_file', '') || DEFAULT_ENV_FILE)
  return { project, dir, envFile }
}

type SwResult = { ok: true; stdout: string } | { ok: false; error: string }

// Runs one read-only symphony-workflow command. Fixed arguments; the only variable parts are JQL built from
// validated pieces. With a symphony-workflow clone configured, run it there (the older way); otherwise run the
// released CLI through uvx with the credentials file, so no clone or `uv sync` is needed. Never rejects.
async function runSw($: Engine, settings: { dir: string; envFile: string }, args: string[]): Promise<SwResult> {
  const { dir, envFile } = settings
  try {
    let run: { exitCode: number; stdout: string; stderr: string }
    const { creds, set } = await jiraCreds($)
    if (dir !== '') {
      run = await $.process.run(['uv', 'run', '--env-file', '.env', 'symphony-workflow', ...args], { cwd: dir, timeoutMs: 20000 })
    } else if (creds) {
      if (!/^https:\/\/[^\s/]+/.test(creds.JIRA_BASE_URL)) return { ok: false, error: 'the Jira site URL must start with https://' }
      run = await $.process.run(['uvx', '--from', SW_GIT, 'symphony-workflow', ...args], { env: { ...creds }, timeoutMs: 90000 }) // credentials go in the child's environment, never in argv
    } else if (set.length > 0) {
      return { ok: false, error: `Jira settings are incomplete (have ${set.join(', ')}; need URL, email and token)` }
    } else if (envFile === '' || !(await $.fs.exists(envFile))) {
      return { ok: false, error: `no credentials: set the plugin's Jira URL, email and token, or put them in ${envFile || DEFAULT_ENV_FILE}; run: ${SETUP_COMMAND}` }
    } else {
      run = await $.process.run(['uvx', '--env-file', envFile, '--from', SW_GIT, 'symphony-workflow', ...args], { timeoutMs: 90000 })
    }
    return run.exitCode === 0 ? { ok: true, stdout: run.stdout } : { ok: false, error: `exit ${run.exitCode}: ${(run.stderr || run.stdout).trim().slice(0, 100)}` }
  } catch (err) {
    return { ok: false, error: 'threw: ' + String(err).slice(0, 100) }
  }
}

// The project's board (open Story-level issues by status, Done as a count): three read-only queries, one per
// status category, every BOARD_MS in the background. Slower than the card lookup: a board moves in minutes.
const BOARD_MS = 300_000
const boardState: { at: number; project: string; board?: Board; error?: string; inflight?: Promise<void> } = { at: -Infinity, project: '' }

async function fetchBoard($: Engine): Promise<void> {
  const before = JSON.stringify([boardState.board, boardState.error])
  try {
    const settings = await jiraSettings($)
    const { project } = settings
    if (!isProject(project)) {
      boardState.board = undefined
      boardState.error = undefined
    } else {
      const lists: BoardIssue[][] = []
      let error: string | undefined
      for (const category of ['To Do', 'In Progress', 'Done'] as const) {
        const jql = boardJql(project, category) as string
        const res = await runSw($, settings, ['call', 'search_issues', JSON.stringify({ jql, max_results: BOARD_CAP })])
        if (!res.ok) {
          error = res.error
          break
        }
        lists.push(parseIssuesJson(res.stdout))
      }
      if (error === undefined) boardState.board = buildBoard({ todo: lists[0] ?? [], inProgress: lists[1] ?? [], done: lists[2] ?? [], cap: BOARD_CAP })
      boardState.error = error // a failed read keeps the last good board
    }
    boardState.project = project
    boardState.at = await $.clock.now()
    if (JSON.stringify([boardState.board, boardState.error]) !== before) $.ui.invalidate('ui.render') // redraw only for news
  } catch (err) {
    boardState.error = 'threw: ' + String(err).slice(0, 100) // a background read must never reject
  }
}

function ensureBoard($: Engine, now: number): Promise<void> | undefined {
  if (boardState.inflight) return boardState.inflight
  if (now - boardState.at < (boardState.error ? JIRA_RETRY_MS : BOARD_MS) && now >= boardState.at) return undefined
  boardState.at = now // an attempt counts, so a read that throws is not restarted on every draw
  boardState.inflight = fetchBoard($).finally(() => {
    boardState.inflight = undefined
  })
  return boardState.inflight
}

async function fetchJira($: Engine, keys: string[]): Promise<void> {
  let settings: { project: string; dir: string; envFile: string }
  try {
    settings = await jiraSettings($)
  } catch (err) {
    jira.error = 'settings: ' + String(err).slice(0, 100) // a background read must never reject
    jira.at = Date.now()
    return
  }
  const { project } = settings
  const jql = buildJql(project, keys)
  if (jql === undefined) {
    jira.issues = []
    jira.error = project === '' ? undefined : 'jira_project is not a valid project key'
    try {
      jira.keys = keys.join(',') // recorded, so the next draw does not start the same empty lookup again
      jira.at = await $.clock.now()
    } catch {
      // a clock read must not reject a background lookup
    }
    return
  }
  const res = await runSw($, settings, ['search', jql])
  if (res.ok) {
    jira.issues = parseSearch(res.stdout)
    jira.error = undefined
  } else {
    jira.error = res.error
  }
  try {
    jira.keys = keys.join(',')
    jira.at = await $.clock.now()
    $.ui.invalidate('ui.render')
  } catch {
    // a redraw is a courtesy; a late rejection after the session is gone must not escape
  }
}

// Starts a lookup when one is due (new cards, or the cache is old); returns the running one, if any.
function ensureJira($: Engine, now: number, keys: string[]): Promise<void> | undefined {
  if (jira.inflight) return jira.inflight
  const due = jira.keys !== keys.join(',') || now - jira.at >= (jira.error ? JIRA_RETRY_MS : JIRA_MS)
  if (!due) return undefined
  jira.inflight = fetchJira($, keys).catch(() => undefined).finally(() => {
    jira.inflight = undefined
  })
  return jira.inflight
}

// What the board draws: worktree cards with their titles, and the Jira cards that have no worktree.
function view(): { rows: CardRow[]; others: JiraIssue[] } {
  return mergeJira(cache.rows, jira.issues)
}
// A toast the moment a card starts needing you (once per card until it stops needing you); not on the first read.
const waitingSeen = new Set<string>()
let toastReady = false
function notifyNeedsYou($: Engine, rows: readonly CardRow[]): void {
  const waiting = rows.filter((r) => r.light === 'waiting').map((r) => r.key)
  try {
    if (toastReady) for (const key of waiting) if (!waitingSeen.has(key)) $.ui.toast(`${key} needs you`)
  } catch {
    // a toast is a courtesy
  }
  waitingSeen.clear()
  for (const key of waiting) waitingSeen.add(key)
  toastReady = true
}
let lastBand = ''
let renders = 0
let ticker: { cancel: () => void } | undefined
const seen = new Map<string, number>() // when a card was first seen in a light, for rows no live signal timed
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

// A card that is running, waiting or failed has a clock that must keep moving; an idle board draws nothing on a timer.
// The terminal shows whole minutes, so 30 seconds is enough; the Desktop signal counts seconds, so once one has been
// drawn the timer runs every second again. While the cards view is open and its signal moves (the green man walking,
// a failed man blinking), the timer runs at the signal's frame rate (WALK-179); a quiet signal stands still.
const TICK_MS = 30_000
const TICK_DESKTOP_MS = 1_000
const RUNNER_MS = 250 // a runner moves about a cell per frame
const LIST_MIN_ROWS = 8 // the card list keeps at least this many rows before any are kept for the playground
let tickerMs = 0
let desktopSeen = false
function syncTicker($: Engine, rows: readonly CardRow[] = cache.rows): void {
  const active = rows.some((r) => r.light === 'walking' || r.light === 'waiting' || r.light === 'failed') || (demo > 1 && paneOpen)
  const lead = leadOf(rows)
  // the playground's runners (WALK-188) move whenever any card runs, even while the signal stands for one that waits
  // a demo scene moves on its own (only the first, Dawn, stands still); its cards never reach the real rows
  const running = rows.some((r) => r.light === 'walking') || demo > 1
  const moving = paneOpen && paneView === 'cards' && (running || lead?.light === 'failed')
  const want = moving ? (running ? RUNNER_MS : FRAME_MS[signalPace(lead)]) : desktopSeen ? TICK_DESKTOP_MS : TICK_MS
  try {
    if (ticker && (!active || tickerMs !== want)) {
      ticker.cancel()
      ticker = undefined
    }
    if (active && !ticker) {
      ticker = $.clock.every(want, () => $.ui.invalidate('ui.render'))
      tickerMs = want
    }
  } catch {
    // a timer is a courtesy
  }
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


// Other Claude Code sessions on this machine (WALK-162): their own records in ~/.claude/sessions, only the
// <pid>.json files (never the .key files beside them), kept when the pid is alive. Off with
// WALKMAN_OTHER_SESSIONS=off. The format is Claude Code's internal one: anything unexpected is skipped.
let othersNote = 'not read' // for /walkman debug
async function otherSessions($: Engine, worktrees: string[]): Promise<Map<string, { light: Light; sinceMs: number }>> {
  try {
    if ((await $.env.get('WALKMAN_OTHER_SESSIONS')) === 'off') {
      othersNote = 'off'
      return new Map()
    }
    // Claude Code keeps ~/.claude under USERPROFILE on Windows, even where a HOME is set (Git Bash)
    const onWindows = (await $.env.get('OS')) === 'Windows_NT'
    const home = ((onWindows && (await $.env.get('USERPROFILE'))) || (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '').replace(/\\/g, '/')
    if (!/^(?:\/|[A-Za-z]:\/)/.test(home)) return new Map()
    const dir = home + '/.claude/sessions'
    if (!(await $.fs.exists(dir))) {
      othersNote = 'no sessions folder'
      return new Map()
    }
    const records: SessionRecord[] = []
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !isRecordName(entry.name)) continue
      const r = parseRecord(await $.fs.read(dir + '/' + entry.name).catch(() => ''))
      if (r) records.push(r)
    }
    if (records.length === 0) {
      othersNote = '0 records'
      return new Map()
    }
    const windows = onWindows
    const ps = windows
      ? await $.process.run(['tasklist', '/FO', 'CSV', '/NH'], { timeoutMs: 3000 }) // Windows (WALK-30)
      : await $.process.run(['ps', '-o', 'pid=', '-p', records.map((r) => r.pid).join(',')], { timeoutMs: 1500 })
    const own = await $.session.id().catch(() => undefined)
    const alive = windows ? parseTasklist(ps.stdout) : parsePs(ps.stdout)
    const lights = otherSessionLights(records, alive, worktrees, own)
    othersNote = `${records.length} records, ${records.filter((r) => alive.has(r.pid)).length} alive (${records.filter((r) => alive.has(r.pid)).map((r) => r.status).join(' ')}), ${lights.size} lit`
    return lights
  } catch (err) {
    othersNote = 'failed: ' + String(err).slice(0, 80)
    return new Map() // another session's state is a courtesy
  }
}

// This session's subagents (WALK-28): the ones still going, and finished ones for 30 s, each with the time first seen.
const agentSeen = new Map<string, { at: number; doneAt?: number }>()
const AGENT_LIGHT: Record<string, Light> = { pending: 'walking', running: 'walking', waiting: 'waiting', idle: 'idle', completed: 'done', failed: 'failed', killed: 'failed' }
async function subagents($: Engine, now: number): Promise<AgentRow[]> {
  let list: { id: string; type: string; description: string; status: string }[]
  try {
    list = (await $.agent.list()) as never
  } catch {
    return []
  }
  const rows: AgentRow[] = []
  const ids = new Set<string>()
  for (const a of list) {
    ids.add(a.id)
    const seen = agentSeen.get(a.id) ?? { at: now }
    const light = AGENT_LIGHT[a.status] ?? 'idle'
    const finished = light === 'done' || light === 'failed' || light === 'idle'
    if (finished && seen.doneAt === undefined) seen.doneAt = now
    agentSeen.set(a.id, seen)
    if (finished && now - (seen.doneAt as number) > 30_000) continue
    rows.push({ type: String(a.type || 'agent'), task: String(a.description || ''), light, sinceMs: seen.at })
  }
  for (const id of [...agentSeen.keys()]) if (!ids.has(id)) agentSeen.delete(id)
  return rows.sort((a, b) => b.sinceMs - a.sinceMs)
}
let currentTree = '' // the worktree this session works in, from the last mark()
// The card worktree this session's tool calls last named (WALK-197): a session started at the repo root works in a
// card without ever standing in it. While the session is not in a card itself, its signals light this card.
let touched: { path: string; at: number } | undefined
const TOUCH_MS = 10 * 60_000
const ASK_GRACE_MS = 2_000 // an ask auto mode settles within this never shows as needs-you
let askTimer: { cancel: () => void } | undefined
async function noteTouch($: Engine, e: unknown): Promise<void> {
  if (cache.rows.length === 0) await refresh($) // before the first read nothing could match
  const path = touchedWorktree(e as Record<string, unknown>, cache.rows.map((r) => r.worktree))
  if (path === undefined) return
  const now = await $.clock.now()
  const changed = touched?.path !== path
  touched = { path, at: now }
  if (changed) {
    note(`touch ${path}`)
    cache.at = -Infinity // a card lights up: reread on the next draw
    try {
      $.ui.invalidate('ui.render')
    } catch {
      // a redraw is a courtesy
    }
  }
}

async function load($: Engine, now: number): Promise<void> {
  const out = await listWorktrees($)
  if (out === undefined) {
    cache.at = -Infinity // not read: try again on the next draw, and keep the rows we had
    return
  }
  cache.at = now
  const rows: CardRow[] = []
  const trees = parseWorktrees(out)
  // the session's own signals, lent to the card its tool calls work in when the session stands in no card itself
  const inCard = trees.some((wt) => wt.path === currentTree && cardFromBranch(wt.branch, wt.path) !== undefined)
  const lent = !inCard && touched !== undefined && now - touched.at < TOUCH_MS && now >= touched.at ? touched.path : undefined
  const signalOf = (path: string): Live | undefined => live.get(path) ?? (path === lent ? live.get(currentTree) : undefined)
  for (const wt of trees) {
    const card = cardFromBranch(wt.branch, wt.path)
    if (!card) continue
    const sig = signalOf(wt.path)
    const runState = await readRunState($, card.key)
    const light = deriveLight({ isWorking: sig?.isWorking ?? false, askPending: sig?.askPending ?? false, lastTurnFailed: sig?.lastTurnFailed ?? false, runState })
    const seenKey = `${wt.path}|${light}`
    if (!seen.has(seenKey)) seen.set(seenKey, now)
    rows.push({ ...card, runState, light, sinceMs: sig?.sinceMs ?? (seen.get(seenKey) as number), ...(light === 'waiting' && sig?.why ? { why: sig.why } : {}), ...(sig?.todo ? { todo: sig.todo } : {}) })
  }
  // other sessions light the cards this session is not working on (its own signals are finer)
  const others = await otherSessions($, rows.map((r) => r.worktree))
  for (const r of rows) {
    const sig = signalOf(r.worktree)
    const mine = sig && (sig.isWorking || sig.askPending || sig.lastTurnFailed)
    const other = others.get(r.worktree)
    if (!mine && other && r.light !== 'failed') {
      r.light = other.light
      r.sinceMs = other.sinceMs || r.sinceMs
    }
  }
  const agents = await subagents($, now)
  const home = rows.find((r) => r.worktree === currentTree) ?? rows.find((r) => r.worktree === lent)
  if (home && agents.length > 0) home.agents = agents
  for (const k of [...seen.keys()]) if (!rows.some((r) => k === `${r.worktree}|${r.light}`)) seen.delete(k)
  cache.rows = rows
  notifyNeedsYou($, rows)
  void keepTitle($, rows)
  syncTicker($, rows)
  if (now - cache.diskAt >= DISK_MS || now < cache.diskAt) {
    cache.disk = await readDisk($)
    cache.diskAt = now
  }
  void ensureJira($, now, rows.map((r) => r.key)) // background; never awaited here
  void ensureBoard($, now)
}

// A tool's name as the engine gives it, safe to draw: letters, digits and a few separators, at most 40.
const toolName = (e: unknown): string => String((e as { tool?: unknown }).tool ?? 'a tool').replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 40) || 'a tool'

// Mark the session's current worktree. Unknown (non-card) worktrees are ignored by refresh().
async function mark($: Engine, patch: Partial<Omit<Live, 'sinceMs'>>, keepTime = false): Promise<void> {
  try {
    const cwd = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd, timeoutMs: 1500 })
    const path = top.exitCode === 0 ? top.stdout.trim() : cwd
    const had = live.get(path)
    const prev = had ?? { isWorking: false, askPending: false, lastTurnFailed: false, sinceMs: 0 }
    const now = await $.clock.now()
    currentTree = path
    const next = { ...prev, ...patch }
    // The clock is the time in a light: it restarts only when the light changes, so a second turn or a cleared ask
    // inside one run keeps counting (the number stayed 0 while subagents had run 14 minutes).
    const sameLight = deriveLight(prev) === deriveLight(next)
    live.set(path, { ...next, sinceMs: had && (keepTime || sameLight) ? prev.sinceMs : now })
    // A session is in one worktree at a time: a worktree it has left is no longer running, asking or failed
    // (an ask left there unanswered stayed red for a day, WALK-148).
    for (const [other, sig] of live) if (other !== path && (sig.isWorking || sig.askPending || sig.lastTurnFailed)) live.set(other, { isWorking: false, askPending: false, lastTurnFailed: false, sinceMs: now })
    note(`mark ${JSON.stringify(patch)} path=${path} cwd=${cwd}`)
    cache.at = -Infinity // a signal changed: reread on the next draw
    $.ui.invalidate('ui.render')
  } catch (err) {
    // A signal is a courtesy; it must never affect the turn or the tool.
    note(`mark failed ${JSON.stringify(patch)}: ${String(err).slice(0, 100)}`)
  }
}

async function versionText($: Engine): Promise<string> {
  let claude = 'unknown'
  try {
    const run = await $.process.run(['claude', '--version'], { timeoutMs: 3000 })
    if (run.exitCode === 0) claude = run.stdout.trim().split(/\s+/)[0] ?? 'unknown'
  } catch {
    // not on PATH: leave unknown
  }
  return ['symphony-walkman ' + VERSION, `Jira lookup runs symphony-workflow ${SW_REF} through uvx`, 'Claude Code ' + claude].join('\n')
}

async function doctorText($: Engine): Promise<string> {
  await refresh($)
  const { project, dir, envFile } = await jiraSettings($)
  let names: Record<string, boolean> | undefined
  let ansi = false
  try {
    const text = (await $.fs.exists(envFile)) ? await $.fs.read(envFile) : undefined
    names = text === undefined ? undefined : envNames(text)
    ansi = text !== undefined && hasAnsi(text)
  } catch {
    names = undefined
  }
  let uvx = false
  try {
    uvx = (await $.process.run(['uvx', '--version'], { timeoutMs: 3000 })).exitCode === 0
  } catch {
    uvx = false
  }
  const { creds, set } = await jiraCreds($)
  return ['Walkman doctor', ...doctorLines({ project, cloneDir: dir, envFile, envNames: names, envHasAnsi: ansi, uvx, settingsCreds: creds ? 'complete' : set.length > 0 ? 'partial:' + set.join('+') : 'none', cardCount: cache.rows.length, jiraError: jira.error, jiraCount: jira.at === -Infinity ? undefined : jira.issues.length, setupCommand: SETUP_COMMAND })].join('\n')
}

// The open arguments of the one pane; its title says how many cards need you ("Walkman · 2"), as a tab shows it.
function titleFor(rows: readonly CardRow[]): string {
  const n = rows.filter((r) => r.light === 'waiting' || r.light === 'failed').length
  return n > 0 ? `Walkman · ${n}` : 'Walkman'
}
function paneArgs(focus: boolean): { id: string; title: string; closeOnEscape: true; focus?: true; columns?: number; rows?: number } {
  paneTitle = titleFor(cache.rows)
  return { id: PANE_ID, title: paneTitle, closeOnEscape: true, ...(focus ? { focus: true as const } : {}), ...(paneView === 'board' ? { columns: 120, rows: 30 } : {}) }
}
// Opening an open id only delivers its new title (never a second pane); done only while the person keeps it open.
async function keepTitle($: Engine, rows: readonly CardRow[]): Promise<void> {
  if (!paneOpen || titleFor(rows) === paneTitle) return
  try {
    await $.ui.open(paneArgs(false))
  } catch {
    // a title is a courtesy
  }
}

export function register(on: On, options?: PluginOptions) {
  pluginOptions = (options ?? {}) as Record<string, unknown>

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'walkman', description: 'Card board: pane (default), board, demo, doctor, version, help', argumentHint: SUBCOMMANDS.join('|'), immediate: true })
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
    note(`turn.complete reason=${JSON.stringify(reason)} keys=${Object.keys(e as object).join(',')} failed=${failed}`)
    await mark($, { isWorking: false, askPending: false, lastTurnFailed: failed })
    return next(e)
  })

  // A permission ask is the red man: the engine's verdict is 'ask' until the person answers.
  on('tool.check', async ($, e, next) => {
    await noteTouch($, e)
    const verdict = await next(e)
    note(`tool.check verdict=${JSON.stringify((verdict as { decision?: unknown }).decision)}`)
    // the reason names the tool only (its input can hold a secret): "Bash is waiting for your approval".
    // tool.check runs before the permission mode settles the ask (auto mode often approves it at once), so the card
    // waits ASK_GRACE_MS before it says it needs you; the tool finishing first means nobody was asked.
    if ((verdict as { decision?: unknown }).decision === 'ask') {
      const why = `${toolName(e)} is waiting for your approval`
      askTimer?.cancel()
      try {
        askTimer = $.clock.after(ASK_GRACE_MS, () => {
          askTimer = undefined
          void mark($, { askPending: true, why })
        })
      } catch {
        await mark($, { askPending: true, why }) // no timer here: say it at once
      }
    }
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    await noteTouch($, e)
    const name = toolName(e)
    if (name === 'TodoWrite') {
      const todos = (e as { todos?: unknown }).todos
      if (Array.isArray(todos)) await mark($, { todo: { done: todos.filter((t) => (t as { status?: unknown })?.status === 'completed').length, total: todos.length } }, true)
    }
    // a question to the person waits like a permission ask, until it is answered
    const question = name === 'AskUserQuestion'
    if (question) await mark($, { askPending: true, why: 'a question is waiting for your answer' })
    try {
      return await next(e)
    } finally {
      // The permission prompt and the tool both run inside next(e): only when it returns is an ask answered. Clearing
      // on the way in (as before 0.15.0) ran before the ask existed, so a card said "needs you" until the turn ended.
      askTimer?.cancel()
      askTimer = undefined
      // with no ask pending there is nothing to clear, and marking would spawn git for every tool call
      if (question || [...live.values()].some((v) => v.askPending)) await mark($, { askPending: false, why: undefined })
    }
  })

  on('command.run', { command: 'walkman' }, async ($, e) => {
    const [sub, arg] = String(e.args ?? '').trim().split(/\s+/)
    const openPane = async (v: 'cards' | 'board') => {
      paneView = v
      try {
        const opened = await $.ui.open(paneArgs(true))
        paneOpen = true
        syncTicker($)
        return opened.isPlaced
      } catch {
        return false
      }
    }
    if (sub === 'debug') {
      await refresh($)
      return { text: ['Walkman debug', `rows: ${cache.rows.map((r) => r.key + ':' + r.light + '@' + r.worktree).join(', ') || '(none)'}`, `live: ${[...live.entries()].map(([k, v]) => k + '=' + JSON.stringify(v)).join('; ') || '(none)'}`, `read: ${cache.why ?? '(none)'}`, `band renders: ${renders}`, `other sessions: ${othersNote}`, `jira: ${jira.issues.length} issues, last read ${jira.at === -Infinity ? 'never' : 'ok'}${jira.error ? ', error ' + jira.error : ''}`, `board: ${boardState.board ? `${boardState.project} ${boardState.board.columns.length} columns, ${boardState.board.open} open, ${boardState.board.done.count} done` : 'none'}${boardState.error ? ', error ' + boardState.error : ''}`,...trace].join('\n') }
    }
    if (sub === 'version') return { text: await versionText($) }
    if (sub === 'doctor') return { text: await doctorText($) }
    if (sub === 'help') return { text: ['Walkman', HELP, 'Set up Jira linking: ' + SETUP_COMMAND, plain(LEGEND)].join('\n') }
    if (sub === 'board' && arg !== 'print') {
      const linked = (await jiraSettings($).catch(() => ({ project: '' }))).project !== ''
      if (linked) {
        void ensureBoard($, await $.clock.now())
        if (await openPane('board')) return { text: 'Jira board opened. b switches to the cards, h / l move the columns, arrows scroll, Esc closes. /walkman board print prints it instead.' }
        // no pane here: print the board below
      }
    }
    if (sub === 'demo') {
      demo = 1
      demoBegan = -1
      // On Desktop ui.open can fail with no-surface while the pane is already showing: keep the demo on either way
      if (await openPane('cards')) return { text: `Demo: ${SCENES.length} scenes of made-up cards. d shows the next one; after the last, d returns to your cards.` }
      paneOpen = true
      syncTicker($)
      return { text: `Demo is on in the Walkman pane: press D there for the next of ${SCENES.length} scenes. Not showing? Open it with /walkman.` }
    }
    if (sub && sub !== 'board' && sub !== 'pane') return { text: ['Walkman: unknown option "' + sub + '"', HELP].join('\n') }
    if (sub === 'pane' && arg === 'close') {
      try {
        await $.ui.close({ id: PANE_ID })
        paneOpen = false
        demo = 0
        syncTicker($) // the signal stops walking with the pane gone
        return { text: 'Pane closed.' }
      } catch {
        return { text: 'Could not close the pane here.' }
      }
    }
    if (sub === 'pane' || sub === undefined || sub === '') {
      if (await openPane('cards')) return { text: 'Walkman pane opened. b switches to the Jira board, /walkman pane close (or Esc) closes it.' }
      if (sub === 'pane') return { text: 'Walkman pane is waiting: widen the terminal to see it.' }
      // /walkman with no room for a pane: fall through to the printed board.
    }
    await refresh($)
    if (jira.at === -Infinity) {
      // first board: wait for the lookup so titles show, but never more than a few seconds (a cold uvx download is slow)
      const first = ensureJira($, await $.clock.now(), cache.rows.map((r) => r.key))
      if (first) await Promise.race([first, new Promise<void>((resolve) => $.clock.after(8000, () => resolve()))])
    }
    if (!boardState.board) {
      // the same few seconds for the first board (three queries); after that it refreshes in the background
      const first = ensureBoard($, await $.clock.now()) ?? boardState.inflight
      if (first) await Promise.race([first, new Promise<void>((resolve) => $.clock.after(8000, () => resolve()))])
    }
    const boardLines = boardState.board ? ['', ...boardText(boardState.project, boardState.board)] : boardState.error ? ['', '(jira board: ' + boardState.error + ')'] : boardState.inflight ? ['', '(jira board still loading; run /walkman board again in a moment)'] : []
    // The host puts "<plugin>:" in front of the first line, so a header line keeps the rows aligned.
    const v = view()
    const lines = renderBoard(v.rows, cache.disk, await $.clock.now(), v.others)
    const linked = (await jiraSettings($).catch(() => ({ project: '', dir: '' }))).project !== ''
    return { text: ['Walkman board', ...lines, ...(cache.rows.length === 0 && cache.why && !/ git=0\b/.test(cache.why) ? ['(could not read git: ' + cache.why + ')'] : []), ...(jira.error ? ['(jira lookup: ' + jira.error + ')'] : jira.inflight ? ['(jira lookup still running; run /walkman again in a moment)'] : []), ...boardLines, ...(linked ? [] : ['', 'Not linked to Jira. Set WALKMAN_JIRA_PROJECT, or run: ' + SETUP_COMMAND]), '', plain(LEGEND)].join('\n') }
  })

  // The pane: the cards view (htop style: meters on top, then what needs you) or the board view (the Jira columns side
  // by side, the card Claude works on lit). b, or the button in the header, switches; h / l move the board's columns.
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const elements = $.ui.resolve(e) as Record<string, unknown>
    const { Box, Text, Button } = elements as never as { Box: never; Text: never; Button: never }
    await refresh($)
    const now = await $.clock.now()
    void ensureBoard($, now)
    const linked = isProject((await jiraSettings($).catch(() => ({ project: '' }))).project)
    const width = (e.props as { bodyColumns?: number }).bodyColumns ?? 44 // the pane's own width (viewport is the terminal's)
    const redraw = (change: () => void) => () => {
      change()
      try {
        $.ui.invalidate('ui.render')
      } catch {
        // a redraw is a courtesy
      }
    }
    const toggle = linked && Button ? h(Button, { key: 'view', label: paneView === 'board' ? '◂ cards' : 'board ▸', hotkey: 'b', plain: true, dimColor: true, onPress: redraw(() => {
      paneView = paneView === 'board' ? 'cards' : 'board'
      syncTicker($)
    }) }) : undefined

    if (paneView === 'board' && linked) {
      if (!boardState.board) {
        const why = boardState.error ? 'jira board: ' + boardState.error : 'reading the Jira board…'
        return h(Box, { flexDirection: 'column', paddingX: 1 }, styled(Box, Text, [{ text: why, tone: boardState.error ? 'error' : 'subtle' }]), ...(toggle ? [toggle] : [])) as RenderElement
      }
      const lights = new Map<string, CardLight>(cache.rows.map((r) => [r.key, { light: r.light, sinceMs: r.sinceMs }]))
      const grid = boardGrid(boardState.board, lights, { width: width - 2, offset: boardOffset, now, project: boardState.project, ageMs: now - boardState.at })
      boardOffset = grid.from // an offset past the end, after the board shrank, snaps back
      const buttons: unknown[] = [...(toggle ? [toggle] : [])]
      if (grid.from > 0) buttons.push(h(Button, { key: 'left', label: '◀', hotkey: 'h', plain: true, onPress: redraw(() => (boardOffset = Math.max(0, grid.from - 1))) }))
      if (grid.to < grid.total) buttons.push(h(Button, { key: 'right', label: '▶', hotkey: 'l', plain: true, onPress: redraw(() => (boardOffset = grid.from + 1)) }))
      // the title has the whole row; the buttons sit on their own row under it (a narrow pane cut the title and wrapped ▶)
      const head = h(Box, { flexDirection: 'column' }, styled(Box, Text, grid.title), h(Box, { flexDirection: 'row' }, ...buttons.flatMap((b, i) => (i === 0 ? [b] : [h(Text, null, '   '), b])), ...(grid.position ? [h(Text, null, '   '), styled(Box, Text, grid.position)] : [])))
      // Desktop ellipsizes a rule, so the column rule is left out there (WALK-212)
      const columns = grid.columns.map((c, i) =>
        h(Box, { flexDirection: 'column', width: CARD_CELLS, ...(i < grid.columns.length - 1 ? { marginRight: 2 } : {}) }, styled(Box, Text, c.header), ...(e.surface === 'desktop' ? [] : [styled(Box, Text, [{ text: '─'.repeat(CARD_CELLS), tone: 'subtle' }])]), ...c.cards.map((card) => cardBox(Box, Text, card)), ...c.body.map((l) => styled(Box, Text, l))),
      )
      return h(Box, { flexDirection: 'column', paddingX: 1, gap: 1 }, head, ...(grid.empty ? [styled(Box, Text, grid.empty)] : []), h(Box, { flexDirection: 'row' }, ...columns), styled(Box, Text, grid.keys)) as RenderElement
    }

    // in a demo scene the made-up cards stand in for the real ones; the Jira line and lane are left out
    if (demo > 0 && demoBegan < 0) demoBegan = now
    const v = demo > 0 ? { rows: demoRows(demo, demoBegan, now), others: [] as JiraIssue[] } : view()
    const top = boardState.board && demo === 0 ? [boardOverview(boardState.board, now - boardState.at, width - 2)] : []
    const demoButton = Button
      ? h(Button, { key: 'demo', label: demo === 0 ? 'demo ▸' : demo < SCENES.length ? 'next ▸' : 'exit ▸', hotkey: 'd', plain: true, dimColor: true, onPress: redraw(() => {
        demo = demo >= SCENES.length ? 0 : demo + 1
        demoBegan = -1
        syncTicker($)
      }) })
      : undefined
    const demoRow = demo > 0 ? h(Box, { flexDirection: 'row' }, styled(Box, Text, [{ text: ` DEMO ${demo}/${SCENES.length} · ${SCENES[demo - 1]?.name ?? ''} `, tone: 'inverse', bg: 'card1', bold: true }]), ...(demoButton ? [h(Text, null, '  '), demoButton] : [])) : undefined
    const keyRow = demo === 0 && demoButton ? demoButton : undefined
    // the pedestrian signal sits under the title (WALK-179); the cards below get the rows it leaves
    const lead = leadOf(v.rows)
    const signal = signalLines(lead, now, width)
    // On Desktop the half blocks break apart (its rows have gaps), so the box draws the animated SVG walker of
    // core/svg.ts beside the card's words instead (WALK-202); the terminal keeps the half-block figure.
    const Svg = e.surface === 'desktop' ? (elements['Svg'] as ((props: object) => unknown) | undefined) : undefined
    // its countdown is signalNumber, the same number the text and the terminal digits show (WALK-207)
    const signalBox = Svg
      ? h(
          Box,
          { flexDirection: 'row', borderStyle: 'round', borderColor: THEME[signal[0]?.box?.tone ?? 'subtle'], gap: 2, paddingX: 1 },
          Svg({ source: signalSvg(lead?.light ?? 'idle', lead ? signalNumber(lead, now) : 0), alt: lead ? `${lead.key} is ${lead.light}` : 'nothing is crossing', width: 120, height: 64, isInteractive: true }),
          h(Box, { flexDirection: 'column' }, ...signal.map((l) => l.left.slice(2)).filter((segs) => segs.length > 0 && !segs.some((x) => /[▀▄█]/.test(x.text))).map((segs) => styled(Box, Text, segs))),
        )
      : undefined
    // the pane's own rows (viewport is the terminal's: using it drew the playground past the pane's bottom edge)
    // Desktop gives neither: assume a tall pane there, so the playground draws (WALK-207)
    const paneRows = (e.props as { scroll?: { bodyRows?: number } }).scroll?.bodyRows ?? e.viewport?.rows ?? (e.surface === 'desktop' ? 40 : undefined)
    // while cards run, the terminal keeps rows for the playground and the card list gives way with "+N more"
    // (Rush hour left the playground no room at all; WALK-222). Desktop's SVG track sits below whatever is left.
    const racing = e.surface !== 'desktop' && v.rows.some((r) => r.light === 'walking' || r.light === 'waiting' || r.light === 'failed')
    // The cards come first: the playground's rows are kept only when the list still has LIST_MIN_ROWS after them.
    const listRoom = paneRows === undefined ? 0 : paneRows - SIGNAL_ROWS - 2 - 1 // the demo or key row
    const keep = racing && listRoom - (TRACK_ROWS + 1) >= LIST_MIN_ROWS ? TRACK_ROWS + 1 : 0
    const rowsLeft = paneRows === undefined ? undefined : Math.max(4, listRoom - keep)
    const [header, ...all] = stylePane(v.rows, cache.disk, now, v.others, { rows: rowsLeft, columns: width }, top)
    // Desktop's cells are wider and it ellipsizes a cut Text anyway: leave the rule out there (WALK-207)
    const rest = e.surface === 'desktop' ? all.filter((l) => !(l.left.length === 1 && /^─+$/.test(l.left[0]?.text ?? ''))) : all
    // the header row: title and counts, then the view switch
    const headRow = h(Box, { flexDirection: 'row', justifyContent: 'space-between' }, styled(Box, Text, (header as PaneLine).left), h(Box, { flexDirection: 'row' }, styled(Box, Text, (header as PaneLine).right ?? []), ...(toggle ? [h(Text, null, '  '), toggle] : [])))
    // the playground (WALK-188) takes the rows left under the cards: a bordered group costs two extra rows
    const boxes = new Set(rest.map((l) => (l as PaneLine).box?.id).filter((id) => id !== undefined)).size
    const used = 1 + 1 + SIGNAL_ROWS + 2 + rest.length + 2 * boxes // title, the demo or key row, the signal box
    const free = paneRows === undefined ? 0 : paneRows - used - 1
    const track = Svg ? [] : playground(v.rows, now, width - 2, Math.min(TRACK_ROWS + 2, free))
    // On Desktop the text track falls apart: the SVG stadium instead, its runners lapping on their own (WALK-212)
    const trackSvg = Svg ? playgroundSvg(v.rows, now) : undefined
    return h(Box, { flexDirection: 'column', paddingX: 1 }, headRow, ...(demoRow ? [demoRow] : []), ...(signalBox ? [signalBox] : paneBody(Box, Text, signal)), ...paneBody(Box, Text, rest), ...(track.length > 0 ? [h(Text, null, ' '), ...paneBody(Box, Text, track)] : []), ...(trackSvg && Svg ? [h(Text, null, ' '), Svg({ source: trackSvg, alt: 'the running cards lapping a track', width: 320, height: 150, isInteractive: true })] : []), ...(keyRow ? [keyRow] : [])) as RenderElement
  })

  // The person closed the pane (its x, Esc, /walkman pane close): stop keeping its title current.
  on('ui.close', async ($, e, next) => {
    if ((e as { id?: unknown }).id === PANE_ID) {
      paneOpen = false
      demo = 0
      syncTicker($)
    }
    return next(e)
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
    if (e.surface === 'desktop') desktopSeen = true
    if (e.surface === 'desktop' && lead && elements['Svg']) {
      const { Box, Svg, Text } = elements as never as { Box: never; Svg: never; Text: never }
      return h(
        Box,
        { flexDirection: 'row', paddingX: 1 },
        // Svg is a leaf: call the constructor directly, since h() would hand it an empty `children`.
        (Svg as (props: object) => unknown)({ source: signalSvg(lead.light, signalNumber(lead, now)), alt: `${lead.key} is ${lead.light}`, width: 120, height: 64 }),
        h(Box, { flexDirection: 'row', paddingX: 1 }, styled(Box as never, Text as never, styleBand(cache.rows, now))),
      ) as RenderElement
    }
    const { Box, Text } = $.ui.resolve(e)
    return h(Box, { paddingX: 1 }, styled(Box as never, Text as never, styleBand(cache.rows, now))) as RenderElement
  })
}
