import type { Light } from './contracts.ts'
import { DONE_DAYS } from './jiraboard.ts'
import type { Board, Column } from './jiraboard.ts'
import { cells, clipCells, formatMinutes, plainText } from './style.ts'
import type { Line, Seg, Tone } from './style.ts'

// The board pane (/walkman board): the project's Jira columns side by side, each issue a card box, the card
// Claude works on lit. More columns than the pane holds: a window of whole columns, moved by an offset.

const CARD = 24 // a card box, borders included
const INNER = CARD - 4 // its text, between "│ " and " │"
export const COLUMN_CELLS = CARD + 2 // a column and the gap after it

export type CardLight = { light: Light; sinceMs: number }
export type GridOptions = { width: number; offset: number; now: number; project?: string }
export type Grid = { lines: Line[]; from: number; to: number; total: number }

// Word wrap by terminal cells into at most `max` lines; a word wider than a line is broken, the last line cut with "…".
export function wrapCells(text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let rest = text.trim()
  while (rest !== '' && lines.length < max - 1 && cells(rest) > width) {
    let fit = ''
    for (const c of rest) {
      if (cells(fit + c) > width) break
      fit += c
    }
    const space = fit.lastIndexOf(' ')
    const take = rest[fit.length] === ' ' ? fit : space > 0 ? fit.slice(0, space) : fit
    lines.push(take.trimEnd())
    rest = rest.slice(take.length).trimStart()
  }
  if (rest !== '') lines.push(clipCells(rest, width))
  return lines
}

const LIT: Partial<Record<Light, { symbol: string; tone: Tone }>> = {
  walking: { symbol: '●', tone: 'success' },
  waiting: { symbol: '⚠', tone: 'warning' },
  failed: { symbol: '✕', tone: 'error' },
}

function card(issue: Column['issues'][number], lit: CardLight | undefined, now: number): Line[] {
  const on = lit ? LIT[lit.light] : undefined
  const border: Tone = on?.tone ?? 'subtle'
  const edge = (text: string): Seg => ({ text, tone: border, bold: on !== undefined })
  const row = (content: Seg[], width: number): Line => [edge('│ '), ...content, { text: ' '.repeat(Math.max(0, INNER - width)) }, edge(' │')]
  const head = (on ? `${on.symbol} ` : '') + issue.key
  const time = on && lit ? formatMinutes(now - lit.sinceMs) : ''
  const gap = Math.max(1, INNER - cells(head) - cells(time))
  const title = wrapCells(plainText(issue.summary), INNER, 2)
  const who = clipCells(plainText(issue.assignee ?? 'unassigned'), INNER)
  return [
    [edge('┌' + '─'.repeat(CARD - 2) + '┐')],
    row([{ text: head, tone: on?.tone ?? 'text', bold: true }, { text: ' '.repeat(gap) }, { text: time, tone: 'subtle' }], cells(head) + gap + cells(time)),
    ...[0, 1].map((i) => row([{ text: title[i] ?? '', tone: 'text' }], cells(title[i] ?? ''))),
    row([{ text: who, tone: 'subtle' }], cells(who)),
    [edge('└' + '─'.repeat(CARD - 2) + '┘')],
  ]
}

const CATEGORY_TONE: Record<Column['category'], Tone> = { 'To Do': 'subtle', 'In Progress': 'success', Done: 'success' }

function column(col: Column, lights: ReadonlyMap<string, CardLight>, now: number): Line[] {
  const name = clipCells(plainText(col.status).toUpperCase(), CARD - 4)
  return [
    [{ text: name, tone: CATEGORY_TONE[col.category], bold: true }, { text: ' ' + col.issues.length, tone: 'subtle' }],
    [{ text: '─'.repeat(CARD), tone: 'subtle' }],
    ...col.issues.flatMap((i) => card(i, lights.get(i.key), now)),
  ]
}

function doneColumn(board: Board): Line[] {
  return [
    [{ text: 'DONE', tone: 'success', bold: true }],
    [{ text: '─'.repeat(CARD), tone: 'subtle' }],
    [{ text: `${board.done.count}${board.done.capped ? '+' : ''}`, tone: 'success', bold: true }],
    [{ text: `in ${DONE_DAYS} days`, tone: 'subtle' }],
  ]
}

const width = (line: Line): number => line.reduce((n, s) => n + cells(s.text), 0)

export function boardGrid(board: Board, lights: ReadonlyMap<string, CardLight>, opt: GridOptions): Grid {
  const all: Line[][] = [...board.columns.map((c) => column(c, lights, opt.now)), doneColumn(board)]
  const total = all.length
  const fits = Math.max(1, Math.floor((opt.width + 2) / COLUMN_CELLS))
  const from = Math.max(0, Math.min(opt.offset, total - fits))
  const to = Math.min(total, from + fits)
  const shown = all.slice(from, to)

  const doneText = `${board.done.count}${board.done.capped ? '+' : ''} done (${DONE_DAYS}d)`
  const title: Line = [{ text: `${opt.project ? opt.project + ' ' : ''}board`, bold: true }, { text: ` · ${board.open} open · ${doneText}`, tone: 'subtle' }]
  if (to - from < total) title.push({ text: `  ${from + 1}–${to}/${total}`, tone: 'warning' })
  const lines: Line[] = [title, []]
  if (board.open === 0) lines.push([{ text: 'no open Story-level issues', tone: 'subtle' }], [])

  const height = Math.max(...shown.map((c) => c.length))
  for (let y = 0; y < height; y++) {
    const row: Line = []
    shown.forEach((col, i) => {
      const cell = col[y] ?? []
      row.push(...cell)
      const last = i === shown.length - 1
      row.push({ text: ' '.repeat(Math.max(0, CARD - width(cell)) + (last ? 0 : 2)) }) // every row the same width
    })
    lines.push(row)
  }
  return { lines, from, to, total }
}

