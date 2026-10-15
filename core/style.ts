import type { CardRow, Disk, Light } from './contracts.ts'
import { OTHERS_MAX, clip, formatElapsed, summary } from './board.ts'
import type { JiraIssue } from './jira.ts'

// A styled run of text. Tones follow the status line: green = going, red = needs you or failed,
// yellow = a number worth a glance, subtle = quiet. The adapter maps a tone to a theme color.
export type Tone = 'success' | 'error' | 'warning' | 'subtle' | 'text'
export type Seg = { text: string; tone?: Tone; bold?: boolean }
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
export const HELP = [
  '/walkman            colored side pane (board if there is no room)',
  '/walkman board      print the board',
  '/walkman pane close close the pane',
  '/walkman doctor     check the Jira link, credentials file, uvx and worktrees',
  '/walkman version    plugin, symphony-workflow and Claude Code versions',
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
  return '█'.repeat(at + 1) + '░'.repeat(STEPS.length - at - 1)
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
export type PaneLine = { left: Line; right?: Line }
export type PaneSize = { columns?: number; rows?: number }

// A whole minute and nothing finer: the pane is for a glance, so it need not redraw every second.
export function formatMinutes(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function diskBar(usedPct: number, cellCount = 8): string {
  const n = Math.max(0, Math.min(cellCount, Math.round((usedPct / 100) * cellCount)))
  return '▕' + '█'.repeat(n) + '░'.repeat(cellCount - n) + '▏'
}

// Terminal cells, not characters: Chinese and other full-width characters take two.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/
// Text from outside (a Jira title, a branch name) is drawn as plain characters: nothing in it may steer the terminal.
const plainText = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim()
const cells = (text: string): number => [...text].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0)
function clipCells(text: string, max: number): string {
  if (cells(text) <= max) return text
  let out = ''
  for (const c of text) {
    if (cells(out + c) > max - 1) break
    out += c
  }
  return out + '…'
}

const SYMBOL: Record<Light, string> = { waiting: '⚠', failed: '✕', walking: '●', done: '✓', idle: '○' }
// Amber for "needs you", red for "failed": two different calls for attention.
const PANE_TONE: Record<Light, Tone> = { waiting: 'warning', failed: 'error', walking: 'success', done: 'success', idle: 'subtle' }

// Why a card needs you, only from what is known: a waiting light comes from a permission ask or from a symphony run
// in plan_ready, nothing else. The question itself is not available, so it is not made up.
const reasonOf = (r: CardRow): string => (r.runState === 'plan_ready' ? 'plan is ready for your review' : 'a permission question is waiting')

export function stylePane(rows: readonly CardRow[], disk: Disk | undefined, now: number, others: readonly JiraIssue[] = [], size: PaneSize = {}): PaneLine[] {
  const width = Math.max(24, (size.columns ?? 44) - 2) // the pane has one cell of padding on each side
  const count = (l: Light) => rows.filter((r) => r.light === l).length
  const longestFirst = (l: Light) => rows.filter((r) => r.light === l).sort((a, b) => a.sinceMs - b.sinceMs)
  const needs = longestFirst('waiting')
  const failed = longestFirst('failed')
  const running = longestFirst('walking')
  const quiet = needs.length + failed.length + running.length === 0

  const counter = (light: Light, tone: Tone): Seg => ({ text: `${SYMBOL[light]} ${count(light)}`, tone: count(light) > 0 ? tone : 'subtle', bold: count(light) > 0 && (light === 'waiting' || light === 'failed') })
  const gap: Seg = { text: '  ' }
  const header: PaneLine = { left: [{ text: 'WALKMAN', bold: true }], right: [counter('waiting', 'warning'), gap, counter('failed', 'error'), gap, counter('walking', 'success'), gap, counter('done', 'success')] }

  const footer: PaneLine[] = []
  if (disk) {
    const tone: Tone = disk.usedPct >= 90 ? 'error' : disk.usedPct >= 80 ? 'warning' : 'success'
    const free = `${disk.freeGb} GB free`
    const freeTone: Tone = disk.usedPct >= 80 ? tone : 'subtle'
    // the full line, or a shorter one when the pane is narrow: bar and numbers, then the numbers alone
    const forms: Line[] = [
      [{ text: 'disk ', tone: 'subtle' }, { text: diskBar(disk.usedPct), tone }, { text: ` ${disk.usedPct}% · `, tone: 'subtle' }, { text: free, tone: freeTone }],
      [{ text: 'disk ', tone: 'subtle' }, { text: `${disk.usedPct}%`, tone }, { text: ' · ', tone: 'subtle' }, { text: free, tone: freeTone }],
      [{ text: `${disk.usedPct}% · `, tone }, { text: free, tone: freeTone }],
    ]
    footer.push({ left: forms.find((f) => cells(plain(f)) <= width) ?? (forms[2] as Line) })
  }

  // The body, as items that stay whole: a lane title belongs to its first item, a card is one or two lines.
  type Item = { lane?: PaneLine; lines: PaneLine[]; counted?: boolean } // `counted`: a card or a Jira row, what "+N more" counts
  const items: Item[] = []
  const title = (r: CardRow) => plainText(r.title ?? (r.slug === '' ? r.branch : r.slug))
  const lane = (symbol: string, label: string, tone: Tone): PaneLine => ({ left: [{ text: `${symbol} ${label}`, tone, bold: true }] })
  const firstOf = (l: Light, n: number) => (n === 0 ? lane(SYMBOL[l], l === 'waiting' ? 'NEEDS YOU' : l === 'failed' ? 'FAILED' : 'RUNNING', PANE_TONE[l]) : undefined)
  const head = (r: CardRow, mark: Seg, right: string, extra: string): PaneLine => {
    const room = Math.max(6, width - cells(mark.text) - 1 - r.key.length - 2 - cells(right) - 1 - cells(extra))
    return { left: [mark, { text: ' ' + r.key, bold: true }, { text: '  ' + clipCells(title(r), room), tone: 'text' }], right: [{ text: right, tone: 'subtle' }] }
  }
  const card = (r: CardRow, light: Light): PaneLine[] => {
    const bar: Seg = { text: '┃', tone: PANE_TONE[light], bold: true }
    const line = head(r, bar, formatMinutes(now - r.sinceMs), '')
    return light === 'waiting' ? [line, { left: [bar, { text: '  ' + clipCells(reasonOf(r), width - 4), tone: PANE_TONE[light] }] }] : [line]
  }
  needs.forEach((r, i) => items.push({ lane: firstOf('waiting', i), lines: card(r, 'waiting'), counted: true }))
  failed.forEach((r, i) => items.push({ lane: firstOf('failed', i), lines: card(r, 'failed'), counted: true }))
  running.forEach((r, i) => {
    const steps = progressBar(r.runState)
    const line = head(r, { text: SYMBOL.walking, tone: 'success', bold: true }, formatMinutes(now - r.sinceMs), steps === '' ? '' : steps + ' ')
    if (steps !== '') line.right = [{ text: steps + ' ', tone: 'success' }, ...(line.right ?? [])]
    items.push({ lane: firstOf('walking', i), lines: [line], counted: true })
  })
  if (quiet) {
    items.push({ lines: [{ left: rows.length === 0 ? [{ text: 'no card branch · work in a KEY-<n>-<slug> branch', tone: 'subtle' }] : [{ text: '✓ ', tone: 'success' }, { text: 'all quiet', tone: 'subtle' }] }] })
  } else if (count('done') + count('idle') > 0) {
    const parts: Seg[] = []
    if (count('done') > 0) parts.push({ text: `✓ ${count('done')} done`, tone: 'subtle' })
    if (count('done') > 0 && count('idle') > 0) parts.push({ text: ' · ', tone: 'subtle' })
    if (count('idle') > 0) parts.push({ text: `○ ${count('idle')} idle`, tone: 'subtle' })
    items.push({ lines: [{ left: parts }] })
  }
  others.slice(0, OTHERS_MAX).forEach((i, n) => {
    const line: PaneLine = { left: [{ text: '  ' + i.key, bold: true }, { text: '  ' + clipCells(plainText(i.summary), Math.max(6, width - 2 - i.key.length - 2)), tone: 'subtle' }] }
    items.push({ lane: n === 0 ? lane('◌', 'IN JIRA', 'subtle') : undefined, lines: [line], counted: true })
  })
  const extraOthers = others.length - OTHERS_MAX

  // Fit the rows the surface has: whole items only, then "+N more"; the title and the disk line always stay.
  const budget = size.rows === undefined ? Infinity : Math.max(2 + footer.length, size.rows - 1)
  const out: PaneLine[] = [header]
  let used = 1 + footer.length
  let hidden = 0
  let overflow = false
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as Item
    const need = it.lines.length + (it.lane ? 1 : 0)
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
  return [...out, ...footer]
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
  if (rows.length === 0) lines.push([{ text: 'No card branch found. Work in a KEY-<n>-<slug> branch to light a card.', tone: 'subtle' }])
  lines.push(...othersLines(others, false), [], ...footer(rows, disk))
  return lines
}

export { summary }
