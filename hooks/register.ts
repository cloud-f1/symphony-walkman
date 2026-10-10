// Symphony Walkman: native Claude Code Mod. Thin adapter: every mods API call lives in this file,
// every decision lives in ../core (pure, testable without a session). Read only: it never writes
// to Jira, to symphony-workflow's run files, or to any repo.
import type { EngineInterface as Engine, On, PluginOptions, RenderElement } from 'claude-code' // types only; erased at run time
import { cardFromBranch, parseWorktrees } from '../core/card.ts'
import { deriveLight, parseRunState } from '../core/lights.ts'
import { parseDf } from '../core/disk.ts'
import { renderBand, renderBoard } from '../core/board.ts'
import { signalSvg } from '../core/svg.ts'
import type { CardRow, Disk, RunState } from '../core/contracts.ts'

const PANE_ID = 'walkman-pane'
const REFRESH_MS = 3000 // draws can repeat often; reread git / files at most this often

// Session-local state. Resets on reload.
let pluginOptions: Record<string, unknown> = {}
const live = new Map<string, { isWorking: boolean; askPending: boolean; lastTurnFailed: boolean; sinceMs: number }>()
const cache: { at: number; rows: CardRow[]; disk?: Disk } = { at: -Infinity, rows: [] }

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

async function refresh($: Engine): Promise<void> {
  const now = await $.clock.now()
  if (now - cache.at >= 0 && now - cache.at < REFRESH_MS) return
  cache.at = now
  const rows: CardRow[] = []
  try {
    const cwd = await $.session.cwd()
    const run = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd, timeoutMs: 2000 })
    if (run.exitCode === 0) {
      for (const wt of parseWorktrees(run.stdout)) {
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
    }
  } catch {
    // Not a git repo, or git missing: an empty board with the hint, never an error.
  }
  cache.rows = rows
  cache.disk = await readDisk($)
}

// Mark the session's current worktree. Unknown (non-card) worktrees are ignored by refresh().
async function mark($: Engine, patch: Partial<{ isWorking: boolean; askPending: boolean; lastTurnFailed: boolean }>): Promise<void> {
  try {
    const cwd = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd, timeoutMs: 1500 })
    const path = top.exitCode === 0 ? top.stdout.trim() : cwd
    const prev = live.get(path) ?? { isWorking: false, askPending: false, lastTurnFailed: false, sinceMs: 0 }
    live.set(path, { ...prev, ...patch, sinceMs: await $.clock.now() })
    cache.at = -Infinity // a signal changed: reread on the next draw
    $.ui.invalidate('ui.render')
  } catch {
    // A signal is a courtesy; it must never affect the turn or the tool.
  }
}

export function register(on: On, options?: PluginOptions) {
  pluginOptions = (options ?? {}) as Record<string, unknown>

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'walkman', description: 'Symphony Walkman: board | pane | pane close', argumentHint: 'board|pane|pane close' })
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
    if (sub === 'pane') {
      try {
        if (arg === 'close') {
          await $.ui.close({ id: PANE_ID })
          return { text: 'Pane closed.' }
        }
        const opened = await $.ui.open({ id: PANE_ID, title: 'Walkman', closeOnEscape: true })
        return { text: opened.isPlaced ? 'Walkman pane opened. /walkman pane close (or Esc) closes it.' : 'Walkman pane is waiting: widen the terminal to see it.' }
      } catch {
        return { text: 'Could not open the pane here.' }
      }
    }
    await refresh($)
    return { text: renderBoard(cache.rows, cache.disk, await $.clock.now()).join('\n') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await refresh($)
    const lines = renderBoard(cache.rows, cache.disk, await $.clock.now())
    return h(Box, { flexDirection: 'column', paddingX: 1 }, ...lines.map((line) => h(Text, null, line))) as RenderElement
  })

  // The always-on strip above the prompt: one text line on the terminal, the signal drawing on Desktop.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await refresh($)
    if (cache.rows.length === 0) return next(e) // not in a card worktree: draw nothing of our own
    const now = await $.clock.now()
    const lead = cache.rows.find((r) => r.light === 'failed' || r.light === 'waiting') ?? cache.rows.find((r) => r.light === 'walking') ?? cache.rows[0]
    const elements = $.ui.resolve(e) as Record<string, unknown>
    if (e.surface === 'desktop' && lead && elements['Svg']) {
      const { Box, Svg, Text } = elements as never as { Box: never; Svg: never; Text: never }
      return h(
        Box,
        { flexDirection: 'row', paddingX: 1 },
        // Svg is a leaf: call the constructor directly, since h() would hand it an empty `children`.
        (Svg as (props: object) => unknown)({ source: signalSvg(lead.light, Math.floor((now - lead.sinceMs) / 1000)), alt: `${lead.key} is ${lead.light}`, width: 120, height: 64 }),
        h(Text, null, ' ' + renderBand(cache.rows, now)),
      ) as RenderElement
    }
    const { Box, Text } = $.ui.resolve(e)
    return h(Box, { paddingX: 1 }, h(Text, null, renderBand(cache.rows, now))) as RenderElement
  })
}
