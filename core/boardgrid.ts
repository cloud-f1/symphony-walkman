import type { Light } from './contracts.ts'
import { DONE_DAYS, meterText } from './jiraboard.ts'
import type { Board, Column } from './jiraboard.ts'
import { cells, clipCells, formatMinutes, plainText } from './style.ts'
import type { Line, Seg, Tone } from './style.ts'

// The board pane (/walkman board): the project's Jira columns side by side, each issue a card box, the card
// Claude works on lit. More columns than the pane holds: a window of whole columns, moved by an offset.

const CARD = 24 // a card box, borders included
const INNER = CARD - 4 // its text, between "│ " and " │"
export const COLUMN_CELLS = CARD + 2 // a column and the gap after it

export type CardLight = { light: Light; sinceMs: number }
export type GridOptions = { width: number; offset: number; now: number; project?: string; ageMs?: number }
// The model the adapter draws with real Boxes (round borders, a lit card's border in its tone), and the same board as
// text in `lines` (box-drawing characters) for the checks and anywhere a Box cannot be drawn.
export type GridCard = { body: Line[]; tone: Tone; lit: boolean } // body: the lines inside the border, INNER cells wide
export type GridColumn = { header: Line; cards: GridCard[]; body: Line[] } // body: a column without cards (Done)
export type Grid = { title: Line; position?: Line; keys: Line; columns: GridColumn[]; empty?: Line; lines: Line[]; from: number; to: number; total: number }
export const CARD_CELLS = CARD
export const CARD_INNER = INNER

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

function card(issue: Column['issues'][number], lit: CardLight | undefined, now: number): GridCard {
  const on = lit ? LIT[lit.light] : undefined
  const row = (content: Seg[], width: number): Line => [...content, { text: ' '.repeat(Math.max(0, INNER - width)) }]
  const head = (on ? `${on.symbol} ` : '') + issue.key
  const time = on && lit ? formatMinutes(now - lit.sinceMs) : ''
  const gap = Math.max(1, INNER - cells(head) - cells(time))
  const title = wrapCells(plainText(issue.summary), INNER, 2)
  // subtask progress at the right of the assignee line (symphony-workflow 0.12), e.g. "▰▰▰▱ 5/6"
  const subs = issue.subTotal ? `${meterText((issue.subDone ?? 0) / issue.subTotal, 4)} ${issue.subDone ?? 0}/${issue.subTotal}` : ''
  const who = clipCells(plainText(issue.assignee ?? 'unassigned'), INNER - (subs ? cells(subs) + 1 : 0))
  const whoGap = Math.max(1, INNER - cells(who) - cells(subs))
  const epic = issue.epicName ?? issue.epic
  const subsDone = issue.subTotal !== undefined && issue.subDone === issue.subTotal
  const body: Line[] = [
    row([{ text: head, tone: on?.tone ?? 'text', bold: true }, { text: ' '.repeat(gap) }, { text: time, tone: 'subtle' }], cells(head) + gap + cells(time)),
    ...[0, 1].map((i) => row([{ text: title[i] ?? '', tone: 'text' }], cells(title[i] ?? ''))),
    ...(epic ? [row([{ text: clipCells('◆ ' + plainText(epic), INNER), tone: 'subtle' }], cells(clipCells('◆ ' + plainText(epic), INNER)))] : []),
    subs
      ? row([{ text: who, tone: 'subtle' }, { text: ' '.repeat(whoGap) }, { text: subs, tone: subsDone ? 'success' : 'subtle' }], cells(who) + whoGap + cells(subs))
      : row([{ text: who, tone: 'subtle' }], cells(who)),
  ]
  return { body, tone: on?.tone ?? 'subtle', lit: on !== undefined }
}

// A card as text: the body inside box-drawing characters, the border in the card's tone.
function cardText(c: GridCard): Line[] {
  const edge = (text: string): Seg => ({ text, tone: c.tone, bold: c.lit })
  return [[edge('╭' + '─'.repeat(CARD - 2) + '╮')], ...c.body.map((l) => [edge('│ '), ...l, edge(' │')]), [edge('╰' + '─'.repeat(CARD - 2) + '╯')]]
}

const CATEGORY_TONE: Record<Column['category'], Tone> = { 'To Do': 'subtle', 'In Progress': 'success', Done: 'success' }

function column(col: Column, lights: ReadonlyMap<string, CardLight>, now: number): GridColumn {
  const name = clipCells(plainText(col.status).toUpperCase(), CARD - 4)
  return { header: [{ text: name, tone: CATEGORY_TONE[col.category], bold: true }, { text: ' ' + col.issues.length, tone: 'subtle' }], cards: col.issues.map((i) => card(i, lights.get(i.key), now)), body: [] }
}

function doneColumn(board: Board): GridColumn {
  return {
    header: [{ text: 'DONE', tone: 'success', bold: true }],
    cards: [],
    body: [[{ text: `${board.done.count}${board.done.capped ? '+' : ''}`, tone: 'success', bold: true }], [{ text: `in ${DONE_DAYS} days`, tone: 'subtle' }]],
  }
}

// A column as text lines: its header, a rule, then its cards or its body.
const columnText = (c: GridColumn): Line[] => [c.header, [{ text: '─'.repeat(CARD), tone: 'subtle' }], ...c.cards.flatMap(cardText), ...c.body]

const width = (line: Line): number => line.reduce((n, s) => n + cells(s.text), 0)

export function boardGrid(board: Board, lights: ReadonlyMap<string, CardLight>, opt: GridOptions): Grid {
  const model: GridColumn[] = [...board.columns.map((c) => column(c, lights, opt.now)), doneColumn(board)]
  const all = model.map(columnText)
  const total = all.length
  const fits = Math.max(1, Math.floor((opt.width + 2) / COLUMN_CELLS))
  const from = Math.max(0, Math.min(opt.offset, total - fits))
  const to = Math.min(total, from + fits)
  const shown = all.slice(from, to)

  const doneText = `${board.done.count}${board.done.capped ? '+' : ''} done`
  const title: Line = [{ text: `${opt.project ? opt.project + ' ' : ''}board`, bold: true }, { text: ` · ${board.open} open · ${doneText}`, tone: 'subtle' }]
  if (opt.ageMs !== undefined) title.push({ text: ` · read ${opt.ageMs < 60_000 ? 'now' : formatMinutes(opt.ageMs) + ' ago'}`, tone: 'subtle' })
  // which columns show, when not all fit: kept off the title so a narrow pane does not cut the title
  const position: Line | undefined = to - from < total ? [{ text: `columns ${from + 1}–${to} of ${total}`, tone: 'warning' }] : undefined
  const lines: Line[] = [title, ...(position ? [position] : []), []]
  const empty: Line | undefined = board.open === 0 ? [{ text: 'no open Story-level issues', tone: 'subtle' }] : undefined
  if (empty) lines.push(empty, [])

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
  // htop's function-key bar: what the keys do, only the ones that do something now
  const keys: Seg[] = [{ text: 'b cards  ', tone: 'subtle' }]
  if (to - from < total) keys.push({ text: 'h ◀  l ▶  ', tone: 'subtle' })
  keys.push({ text: '↑↓ scroll  Esc close', tone: 'subtle' })
  lines.push([], keys)
  return { title, ...(position ? { position } : {}), keys, columns: model.slice(from, to), ...(empty ? { empty } : {}), lines, from, to, total }
}

