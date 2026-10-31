import type { CardRow, Disk, Light } from './contracts.ts'
import { OTHERS_MAX, clip, formatElapsed, summary } from './board.ts'
import type { JiraIssue } from './jira.ts'

// A styled run of text. Tones follow the status line: green = going, red = needs you or failed,
// yellow = a number worth a glance, subtle = quiet. The adapter maps a tone to a theme color.
// `subtle` is drawn dim (secondary text); `inverse` is text on a coloured `bg` (a chip).
// card0..card7: a card's own colour on the playground (WALK-188), from theme keys with no status meaning.
export type Tone = 'success' | 'error' | 'warning' | 'subtle' | 'text' | 'inverse' | 'card0' | 'card1' | 'card2' | 'card3' | 'card4' | 'card5'
export type Seg = { text: string; tone?: Tone; bold?: boolean; bg?: Tone }
export type Line = Seg[]

const GLYPH: Record<Light, string> = { walking: '🟢', waiting: '🔴', failed: '🔴', done: '✓', idle: '○' }
const LABEL: Record<Light, string> = { walking: 'running', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'idle' }
const TONE: Record<Light, Tone> = { walking: 'success', waiting: 'error', failed: 'error', done: 'success', idle: 'subtle' }
const ORDER: Light[] = ['failed', 'waiting', 'walking', 'done', 'idle']

// What the symbols mean, drawn under every board so nobody needs a manual.
export const LEGEND: Line = [
  { text: '🟢', tone: 'success' }, { text: ' working  ', tone: 'subtle' },
  { text: '🔴', tone: 'error' }, { text: ' needs you / failed  ', tone: 'subtle' },
  { text: '✓', tone: 'success' }, { text: ' done  ', tone: 'subtle' },
  { text: '○', tone: 'subtle' }, { text: ' idle', tone: 'subtle' },
]
// Every /walkman argument, for the hint the prompt shows; a check keeps it and HELP in step (0.14.0 added demo to
// HELP but not to the hint).
export const SUBCOMMANDS = ['board', 'board print', 'demo', 'pane', 'pane close', 'doctor', 'version', 'help', 'debug'] as const
export const HELP = [
  '/walkman              colored side pane (board if there is no room)',
  '/walkman board        Jira board pane: columns side by side, h / l move them',
  '/walkman board print  print the cards and the Jira board',
  '/walkman demo         seven scenes of made-up cards to watch every animation (d: next)',
  '/walkman pane close   close the pane',
  '/walkman doctor       check the Jira link, credentials file, uvx and worktrees',
  '/walkman version      plugin, symphony-workflow and Claude Code versions',
  '/walkman help         these commands and the legend',
].join('\n')

export const plain = (line: Line): string => line.map((s) => s.text).join('')

const stateText = (r: CardRow): string => r.runState ?? LABEL[r.light]
// An idle card has no running clock; showing 0:00 there reads as a bug.
const elapsed = (r: CardRow, now: number): string => (r.light === 'idle' ? '' : ' ' + formatElapsed(now - r.sinceMs))
// The strip above the prompt shows whole minutes like the pane, so it needs a redraw only every 30 seconds.
const bandElapsed = (r: CardRow, now: number): string => (r.light === 'idle' ? '' : ' ' + formatMinutes(now - r.sinceMs))
const glyph = (r: CardRow): Seg => ({ text: GLYPH[r.light], tone: TONE[r.light], bold: true })

// Run progress for symphony-workflow's states, drawn like the status line bars: filled blocks then dots.
const STEPS = ['created', 'planning', 'plan_ready', 'implementing', 'completed'] as const
export function progressBar(state: CardRow['runState']): string {
  const at = state === 'failed' || state === undefined ? -1 : STEPS.indexOf(state)
  if (at < 0) return ''
  return '━'.repeat(at + 1) + '─'.repeat(STEPS.length - at - 1)
}

// A meter like the status line's: █ for the filled part and ░ for the track, both in the meter's tone, so the track reads
// as a darker band of the same colour in every theme. (0.11.0 tried thin ━─ lines; users found the status-line blocks
// easier to read, owner feedback 2026-10-17. A dimColor track draws grey, so an empty meter looked full.)
export function meterSegs(fraction: number, cellCount: number, tone: Tone): Seg[] {
  const f = Math.max(0, Math.min(1, fraction))
  const n = f === 0 ? 0 : Math.max(1, Math.min(cellCount, Math.round(f * cellCount)))
  return [{ text: '█'.repeat(n), tone }, { text: '░'.repeat(cellCount - n), tone }].filter((s) => s.text !== '')
}

// The strip above the prompt: the most urgent card, then how many more.
export function styleBand(rows: readonly CardRow[], now: number): Line {
  const lead = [...rows].sort((a, b) => ORDER.indexOf(a.light) - ORDER.indexOf(b.light))[0]
  if (!lead) return []
  const line: Line = [
    glyph(lead),
    { text: ' ' + lead.key, bold: true },
    { text: ' ' + LABEL[lead.light], tone: TONE[lead.light], bold: lead.light === 'waiting' || lead.light === 'failed' },
    { text: bandElapsed(lead, now), tone: 'subtle' },
  ]
  if (rows.length > 1) line.push({ text: `  (+${rows.length - 1})`, tone: 'subtle' })
  return line
}

const footer = (rows: readonly CardRow[], disk: Disk | undefined): Line[] => {
  const n = (l: Light) => rows.filter((r) => r.light === l).length
  const out: Line[] = []
  if (disk) {
    const tone: Tone = disk.usedPct >= 90 ? 'error' : disk.usedPct >= 80 ? 'warning' : 'success'
    out.push([{ text: 'disk ', tone: 'subtle' }, { text: `${disk.freeGb} GB free`, tone }, { text: ` · ${disk.usedPct}% used`, tone: 'subtle' }])
  }
  out.push([
    { text: `${n('walking')} running`, tone: n('walking') > 0 ? 'success' : 'subtle' },
    { text: ' · ', tone: 'subtle' },
    { text: `${n('done')} done`, tone: 'subtle' },
    ...(n('waiting') > 0 ? [{ text: ' · ', tone: 'subtle' as const }, { text: `${n('waiting')} needs you`, tone: 'error' as const, bold: true }] : []),
    ...(n('failed') > 0 ? [{ text: ' · ', tone: 'subtle' as const }, { text: `${n('failed')} failed`, tone: 'error' as const, bold: true }] : []),
  ])
  return out
}

const othersLines = (others: readonly JiraIssue[], narrow: boolean): Line[] => {
  if (others.length === 0) return []
  const out: Line[] = [[], [{ text: 'In progress in Jira', tone: 'subtle', bold: true }]]
  for (const i of others.slice(0, OTHERS_MAX)) {
    if (narrow) out.push([{ text: '  ' + i.key, bold: true }, { text: ' ' + i.status, tone: 'subtle' }], [{ text: '   ' + clip(i.summary, 34), tone: 'subtle' }])
    else out.push([{ text: '  ' + i.key.padEnd(9), bold: true }, { text: ' ' + clip(i.summary, 40).padEnd(40), tone: 'subtle' }, { text: ' ' + i.status, tone: 'subtle' }])
  }
  if (others.length > OTHERS_MAX) out.push([{ text: `  +${others.length - OTHERS_MAX} more`, tone: 'subtle' }])
  return out
}

// ---------- the side pane: information density follows how much a card needs you ----------
//
// Quiet: a title, "all quiet" and the disk. A running card is one line. Only a card that needs you or has failed
// expands into a card of its own, in different colors, so the one thing to act on is the loudest thing on screen.

// One drawn line: `left` as it is, `right` (a time) flush to the right edge when the surface can.
// `box`: consecutive lines with the same box id are drawn inside one bordered box (bold for a card that needs you or
// failed, round for the running cards), so urgency shows in the border's weight and colour.
export type PaneBox = { id: number; style: 'bold' | 'round'; tone: Tone }
export type PaneLine = { left: Line; right?: Line; box?: PaneBox }
export type PaneSize = { columns?: number; rows?: number }

// A whole minute and nothing finer: the pane is for a glance, so it need not redraw every second.
export function formatMinutes(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function diskBar(usedPct: number, cellCount = 8): string {
  return meterSegs(usedPct / 100, cellCount, 'text').map((s) => s.text).join('')
}

// Terminal cells, not characters: Chinese and other full-width characters take two.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/
// Text from outside (a Jira title, a branch name) is drawn as plain characters: nothing in it may steer the terminal.
// A Jira status in its own colour, by name. Green, amber and red already mean walking, needs you and failed, so
// In Progress and In Review take two card colours (blue, purple); Done is the one green; any other name stays grey.
const STATUS_TONE: Record<string, Tone> = { done: 'success', 'in review': 'card3', 'in progress': 'card1' }
export const statusTone = (status: string): Tone => STATUS_TONE[plainText(status).toLowerCase()] ?? 'subtle'

export const plainText = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
export const cells = (text: string): number => [...text].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0)
export function clipCells(text: string, max: number): string {
  if (cells(text) <= max) return text
  let out = ''
  for (const c of text) {
    if (cells(out + c) > max - 1) break
    out += c
  }
  return out + '…'
}

const AGENTS_MAX = 5
const SYMBOL: Record<Light, string> = { waiting: '⚠', failed: '✕', walking: '●', done: '✓', idle: '○' }
// Amber for "needs you", red for "failed": two different calls for attention.
const PANE_TONE: Record<Light, Tone> = { waiting: 'warning', failed: 'error', walking: 'success', done: 'success', idle: 'subtle' }

// Why a card needs you, only from what is known: a waiting light comes from a permission ask or from a symphony run
// in plan_ready, nothing else. The question itself is not available, so it is not made up.
const reasonOf = (r: CardRow): string => r.why ?? (r.runState === 'plan_ready' ? 'plan is ready for your review' : 'a permission question is waiting')

// `top`: overview lines drawn right under the title (the Jira meter, jiraboard.ts), htop style; they always stay.
export function stylePane(rows: readonly CardRow[], disk: Disk | undefined, now: number, others: readonly JiraIssue[] = [], size: PaneSize = {}, top: readonly PaneLine[] = []): PaneLine[] {
  const width = Math.max(24, (size.columns ?? 44) - 2) // the pane has one cell of padding on each side
  const inner = width - 2 // inside a bordered box
  const count = (l: Light) => rows.filter((r) => r.light === l).length
  const longestFirst = (l: Light) => rows.filter((r) => r.light === l).sort((a, b) => a.sinceMs - b.sinceMs)
  const needs = longestFirst('waiting')
  const failed = longestFirst('failed')
  const running = longestFirst('walking')
  const quiet = needs.length + failed.length + running.length === 0

  const counter = (light: Light, tone: Tone): Seg => ({ text: `${SYMBOL[light]} ${count(light)}`, tone: count(light) > 0 ? tone : 'subtle', bold: count(light) > 0 && (light === 'waiting' || light === 'failed') })
  const gap: Seg = { text: '  ' }
  const header: PaneLine = { left: [{ text: 'WALKMAN', bold: true }], right: [counter('waiting', 'warning'), gap, counter('failed', 'error'), gap, counter('walking', 'success'), gap, counter('done', 'success')] }

  const overview: PaneLine[] = [] // htop style: the meters sit under the title
  if (disk) {
    const tone: Tone = disk.usedPct >= 90 ? 'error' : disk.usedPct >= 80 ? 'warning' : 'success'
    const free = `${disk.freeGb} GB free`
    const freeTone: Tone = disk.usedPct >= 80 ? tone : 'subtle'
    // the full line, or a shorter one when the pane is narrow: meter and numbers, then the numbers alone
    const forms: Line[] = [
      [{ text: 'disk ', tone: 'subtle' }, ...meterSegs(disk.usedPct / 100, 8, tone), { text: `  ${disk.usedPct}%  `, tone: 'subtle' }, { text: free, tone: freeTone }],
      [{ text: 'disk ', tone: 'subtle' }, { text: `${disk.usedPct}%`, tone }, { text: '  ', tone: 'subtle' }, { text: free, tone: freeTone }],
      [{ text: `${disk.usedPct}%  `, tone }, { text: free, tone: freeTone }],
    ]
    overview.push({ left: forms.find((f) => cells(plain(f)) <= width) ?? (forms[2] as Line) })
  }
  overview.push(...top)

  // The body, as items that stay whole: a lane chip belongs to its first item; `boxRows` is the border a new box adds.
  type Item = { lane?: PaneLine; lines: PaneLine[]; counted?: boolean; boxRows?: number } // `counted`: what "+N more" counts
  const items: Item[] = []
  let boxId = 0
  const title = (r: CardRow) => plainText(r.title ?? (r.slug === '' ? r.branch : r.slug))
  // a chip: the lane's name on its colour, drawn alike in every terminal
  const chip = (label: string, tone: Tone): PaneLine => ({ left: [{ text: ` ${label} `, tone: 'inverse', bg: tone, bold: true }] })
  const firstOf = (l: Light, n: number) => (n === 0 ? chip(l === 'waiting' ? 'NEEDS YOU' : l === 'failed' ? 'FAILED' : 'RUNNING', PANE_TONE[l]) : undefined)
  const head = (r: CardRow, mark: Seg, right: string, extra: string, w: number): PaneLine => {
    const room = Math.max(6, w - cells(mark.text) - 1 - r.key.length - 2 - cells(right) - 1 - cells(extra))
    return { left: [mark, { text: ' ' + r.key, bold: true }, { text: '  ' + clipCells(title(r), room), tone: 'text' }], right: [{ text: right, tone: 'subtle' }] }
  }
  // a card that needs you or failed: its own box, bold and in its colour
  const card = (r: CardRow, light: Light): PaneLine[] => {
    const box: PaneBox = { id: ++boxId, style: 'bold', tone: PANE_TONE[light] }
    const line = { ...head(r, { text: SYMBOL[light], tone: PANE_TONE[light], bold: true }, formatMinutes(now - r.sinceMs), '', inner), box }
    return light === 'waiting' ? [line, { left: [{ text: '  ' + clipCells(reasonOf(r), inner - 2), tone: PANE_TONE[light] }], box }] : [line]
  }
  needs.forEach((r, i) => items.push({ lane: firstOf('waiting', i), lines: card(r, 'waiting'), counted: true, boxRows: 2 }))
  failed.forEach((r, i) => items.push({ lane: firstOf('failed', i), lines: card(r, 'failed'), counted: true, boxRows: 2 }))
  // the running cards share one round box
  const runBox: PaneBox = { id: ++boxId, style: 'round', tone: 'success' }
  running.forEach((r, i) => {
    const steps = progressBar(r.runState)
    const todo = r.todo && r.todo.total > 0 ? `${r.todo.done}/${r.todo.total}` : ''
    const extra = [todo, steps].filter((x) => x !== '').join(' ')
    const line: PaneLine = { ...head(r, { text: SYMBOL.walking, tone: 'success', bold: true }, formatMinutes(now - r.sinceMs), extra === '' ? '' : extra + ' ', inner), box: runBox }
    if (extra !== '') line.right = [...(todo ? [{ text: todo + ' ', tone: 'subtle' as const }] : []), ...(steps ? [{ text: steps + ' ', tone: 'success' as const }] : []), ...(line.right ?? [])]
    // its subagents, one row each, under it (WALK-28)
    const agents = r.agents ?? []
    const shown = agents.slice(0, AGENTS_MAX).map((a): PaneLine => {
      const mark = SYMBOL[a.light]
      const room = Math.max(6, inner - 4 - cells(a.type) - 2 - 5)
      return { left: [{ text: '  └ ', tone: 'subtle' }, { text: mark, tone: PANE_TONE[a.light], bold: true }, { text: ' ' + plainText(a.type), tone: 'text' }, { text: '  ' + clipCells(plainText(a.task), room), tone: 'subtle' }], right: [{ text: formatMinutes(now - a.sinceMs), tone: 'subtle' }], box: runBox }
    })
    if (agents.length > AGENTS_MAX) shown.push({ left: [{ text: `    +${agents.length - AGENTS_MAX} more agents`, tone: 'subtle' }], box: runBox })
    items.push({ lane: firstOf('walking', i), lines: [line, ...shown], counted: true, boxRows: i === 0 ? 2 : 0 })
  })
  if (quiet) {
    items.push({ lines: [{ left: rows.length === 0 ? [{ text: 'no card branch · work in a KEY-n-slug branch', tone: 'subtle' }] : [{ text: '✓ ', tone: 'success' }, { text: 'all quiet', tone: 'subtle' }] }] })
  } else if (count('done') > 0) {
    items.push({ lines: [{ left: [{ text: `✓ ${count('done')} done`, tone: 'subtle' }] }] })
  }
  // idle cards, one line each: the Jira status first, in a column as wide as the longest one so the keys and titles
  // line up. A card In Progress with nobody in it must not vanish (WALK-197).
  const idle = rows.filter((x) => x.light === 'idle').sort((x, y) => x.key.localeCompare(y.key))
  // no Jira status (not read yet, no credentials, or the key is not found): say the row is here because of its worktree
  const statusOf = (r: CardRow) => (r.jiraStatus ? plainText(r.jiraStatus) : 'worktree')
  const statusW = Math.max(0, ...idle.map((r) => cells(statusOf(r))))
  const keyW = Math.max(0, ...idle.map((r) => r.key.length))
  for (const r of idle) {
    const status = statusOf(r)
    const room = Math.max(6, width - 2 - (statusW > 0 ? statusW + 1 : 0) - keyW - 2)
    items.push({ lines: [{ left: [{ text: SYMBOL.idle + ' ', tone: 'subtle' }, ...(statusW > 0 ? [{ text: status + ' '.repeat(statusW - cells(status) + 1), tone: statusTone(status) }] : []), { text: r.key.padEnd(keyW), tone: 'subtle', bold: true }, { text: '  ' + clipCells(title(r), room), tone: 'subtle' }] }], counted: true })
  }
  others.slice(0, OTHERS_MAX).forEach((i, n) => {
    const line: PaneLine = { left: [{ text: '  ' + i.key, bold: true }, { text: '  ' + clipCells(plainText(i.summary), Math.max(6, width - 2 - i.key.length - 2)), tone: 'subtle' }] }
    items.push({ lane: n === 0 ? { left: [{ text: '◌ IN JIRA', tone: 'subtle', bold: true }] } : undefined, lines: [line], counted: true })
  })
  const extraOthers = others.length - OTHERS_MAX

  // Fit the rows the surface has: whole items only, then "+N more"; the title and the meters always stay.
  const budget = size.rows === undefined ? Infinity : Math.max(2 + overview.length, size.rows - 1)
  const out: PaneLine[] = [header, ...overview]
  if (overview.length > 0) out.push({ left: [{ text: '─'.repeat(width), tone: 'subtle' }] })
  let used = out.length
  let hidden = 0
  let overflow = false
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item
    const need = it.lines.length + (it.lane ? 1 : 0) + (it.boxRows ?? 0)
    const last = i === items.length - 1 && extraOthers <= 0
    if (!overflow && used + need + (last ? 0 : 1) <= budget) {
      if (it.lane) out.push(it.lane)
      out.push(...it.lines)
      used += need
    } else {
      overflow = true
      if (it.counted) hidden += 1
    }
  }
  if (hidden > 0) out.push({ left: [{ text: `  +${hidden + Math.max(0, extraOthers)} more`, tone: 'subtle' }] })
  else if (extraOthers > 0) out.push({ left: [{ text: `  +${extraOthers} more`, tone: 'subtle' }] })
  return out
}

// The printed board (plain text is the contract; tones are used where the surface can draw them).
export function styleBoard(rows: readonly CardRow[], disk: Disk | undefined, now: number, others: readonly JiraIssue[] = []): Line[] {
  const lines: Line[] = rows.map((r) => [
    glyph(r),
    { text: ' ' + r.key.padEnd(9), bold: true },
    { text: ' ' + clip(r.title ?? r.slug, 28).padEnd(28), tone: 'subtle' as const },
    { text: ' ' + stateText(r).padEnd(13), tone: TONE[r.light] },
    { text: elapsed(r, now), tone: 'subtle' as const },
  ])
  if (rows.length === 0) lines.push([{ text: 'No card branch found. Work in a KEY-n-slug branch to light a card.', tone: 'subtle' }])
  lines.push(...othersLines(others, false), [], ...footer(rows, disk))
  return lines
}

export { summary }
