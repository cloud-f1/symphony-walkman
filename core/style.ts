import type { CardRow, Disk, Light } from './contracts.ts'
import { formatElapsed, summary } from './board.ts'

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
export const HELP = '/walkman: colored side pane · /walkman board: print it · /walkman pane close: close the pane'

export const plain = (line: Line): string => line.map((s) => s.text).join('')

const stateText = (r: CardRow): string => r.runState ?? LABEL[r.light]
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
    { text: ' ' + formatElapsed(now - lead.sinceMs), tone: 'subtle' },
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

// The side pane: narrow, so each card is two short lines and nothing needs to wrap.
export function stylePane(rows: readonly CardRow[], disk: Disk | undefined, now: number): Line[] {
  const lines: Line[] = []
  if (rows.length === 0) {
    lines.push([{ text: 'No card branch found.', tone: 'subtle' }], [{ text: 'Work in a KEY-<n>-<slug> branch.', tone: 'subtle' }])
  }
  for (const r of rows) {
    const bar = progressBar(r.runState)
    lines.push([
      glyph(r),
      { text: ' ' + r.key, bold: true },
      { text: ' ' + stateText(r), tone: TONE[r.light], bold: r.light === 'waiting' || r.light === 'failed' },
      { text: ' ' + formatElapsed(now - r.sinceMs), tone: 'subtle' },
    ])
    const detail: Line = [{ text: '   ' + (r.slug === '' ? r.branch : r.slug), tone: 'subtle' }]
    if (bar !== '') detail.push({ text: ' ' + bar, tone: TONE[r.light] })
    lines.push(detail)
  }
  lines.push([], ...footer(rows, disk), [], LEGEND)
  return lines
}

// The printed board (plain text is the contract; tones are used where the surface can draw them).
export function styleBoard(rows: readonly CardRow[], disk: Disk | undefined, now: number): Line[] {
  const lines: Line[] = rows.map((r) => [
    glyph(r),
    { text: ' ' + r.key.padEnd(9), bold: true },
    { text: ' ' + (r.slug === '' ? '' : r.slug.slice(0, 28)).padEnd(28), tone: 'subtle' as const },
    { text: ' ' + stateText(r).padEnd(13), tone: TONE[r.light] },
    { text: ' ' + formatElapsed(now - r.sinceMs), tone: 'subtle' as const },
  ])
  if (rows.length === 0) lines.push([{ text: 'No card branch found. Work in a KEY-<n>-<slug> branch to light a card.', tone: 'subtle' }])
  lines.push([], ...footer(rows, disk))
  return lines
}

export { summary }
