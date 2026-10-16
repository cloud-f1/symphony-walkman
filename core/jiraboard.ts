import { clip } from './board.ts'
import { isProject } from './jira.ts'
import { cells, formatMinutes, plainText } from './style.ts'
import type { PaneLine, Seg, Tone } from './style.ts'

// The project's Jira board, read only: open Story-level issues by status column, Done only as a count.
// symphony-workflow's `call search_issues` returns key, summary, status and assignee, not the status category,
// so each category is its own query and a column knows its category from the query that found it.
// epic / epicName / subDone / subTotal come from symphony-workflow 0.12 (parent, parent_summary, subtasks_*); older: absent / 0.
export type BoardIssue = { key: string; status: string; summary: string; assignee: string | null; epic?: string; epicName?: string; subDone?: number; subTotal?: number }
export type Category = 'To Do' | 'In Progress' | 'Done'
export type Column = { status: string; category: Category; issues: BoardIssue[] }
export type Board = { columns: Column[]; open: number; done: { count: number; capped: boolean } }

// Done is a count of the last two weeks, as a board shows it; every Done issue ever would only grow.
export const DONE_DAYS = 14
export const BOARD_CAP = 100

export function boardJql(project: string, category: Category): string | undefined {
  if (!isProject(project)) return undefined
  const where = category === 'Done' ? `statusCategory = Done AND statusCategoryChangedDate >= -${DONE_DAYS}d` : `statusCategory = "${category}"`
  return `project = ${project} AND hierarchyLevel = 0 AND ${where} ORDER BY updated DESC`
}

const KEY = /^[A-Z][A-Z0-9]{1,9}-\d+$/
export function parseIssuesJson(out: string): BoardIssue[] {
  let data: unknown
  try {
    data = JSON.parse(out)
  } catch {
    return []
  }
  const list = (data as { issues?: unknown })?.issues
  if (!Array.isArray(list)) return []
  const issues: BoardIssue[] = []
  for (const i of list as Record<string, unknown>[]) {
    if (typeof i?.key !== 'string' || !KEY.test(i.key) || typeof i.status !== 'string') continue
    const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
    const epic = typeof i.parent === 'string' && KEY.test(i.parent) ? i.parent : undefined
    issues.push({
      key: i.key,
      status: i.status,
      summary: typeof i.summary === 'string' ? i.summary : '',
      assignee: typeof i.assignee === 'string' ? i.assignee : null,
      ...(epic ? { epic, ...(typeof i.parent_summary === 'string' ? { epicName: i.parent_summary } : {}) } : {}),
      ...(count(i.subtasks_total) > 0 ? { subDone: count(i.subtasks_done), subTotal: count(i.subtasks_total) } : {}),
    })
  }
  return issues
}

// Column order within a category: the names boards usually use, in board order; any other name after them, A to Z.
const KNOWN = ['backlog', 'to do', 'todo', 'open', 'selected for development', 'ready', 'blocked', 'in progress', 'in review', 'review', 'code review', 'qa', 'testing']
const CATEGORY_ORDER: Category[] = ['To Do', 'In Progress']
const rank = (status: string): number => {
  const i = KNOWN.indexOf(status.toLowerCase())
  return i < 0 ? KNOWN.length : i
}

export function buildBoard(input: { todo: BoardIssue[]; inProgress: BoardIssue[]; done: BoardIssue[]; cap: number }): Board {
  const columns: Column[] = []
  const add = (category: Category, issues: BoardIssue[]) => {
    for (const issue of issues) {
      let col = columns.find((c) => c.category === category && c.status === issue.status)
      if (!col) columns.push((col = { status: issue.status, category, issues: [] }))
      col.issues.push(issue)
    }
  }
  add('To Do', input.todo)
  add('In Progress', input.inProgress)
  columns.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || rank(a.status) - rank(b.status) || a.status.localeCompare(b.status))
  return { columns, open: input.todo.length + input.inProgress.length, done: { count: input.done.length, capped: input.done.length >= input.cap } }
}

const doneText = (board: Board): string => `${board.done.count}${board.done.capped ? '+' : ''} done`

// The printed board (/walkman board): a section per column, each issue on one line, lines at most 100 characters.
export function boardText(project: string, board: Board): string[] {
  const lines = [`${project} board · ${board.open} open · ${doneText(board)} in ${DONE_DAYS} days`]
  if (board.columns.length === 0) lines.push('', '  no open Story-level issues')
  for (const col of board.columns) {
    lines.push('', `${plainText(col.status).toUpperCase()} (${col.issues.length})`)
    for (const i of col.issues) {
      const subs = i.subTotal ? ` ${i.subDone ?? 0}/${i.subTotal}` : ''
      lines.push(`  ${i.key.padEnd(10)} ${clip(plainText(i.summary), 54).padEnd(54)} ${subs.padStart(6)} ${clip(plainText(i.assignee ?? 'unassigned'), 24)}`.trimEnd())
      if (i.epicName) lines.push(`             ◆ ${clip(plainText(i.epicName), 60)}`)
    }
  }
  return lines
}

export const METER_CELLS = 8

// A meter as text: filled cells then empty ones; a column with any issue shows at least one filled cell.
export function meterText(fraction: number, cells = METER_CELLS): string {
  const f = Math.max(0, Math.min(1, fraction))
  const n = f === 0 ? 0 : Math.max(1, Math.min(cells, Math.round(f * cells)))
  return '▰'.repeat(n) + '▱'.repeat(cells - n)
}

const CATEGORY_TONE: Record<Category, Tone> = { 'To Do': 'subtle', 'In Progress': 'success', Done: 'success' }

// The BOARD lane of the side pane: one line per column (name, meter, count), then the done count.
export function boardPaneLines(board: Board | undefined, width: number): PaneLine[] {
  if (!board) return []
  const lines: PaneLine[] = [{ left: [{ text: '▤ BOARD', tone: 'subtle', bold: true }] }]
  const room = Math.max(6, width - METER_CELLS - 6)
  for (const col of board.columns) {
    lines.push({
      left: [{ text: '  ' + clip(plainText(col.status), room), tone: CATEGORY_TONE[col.category] }],
      right: [{ text: ' ' + String(col.issues.length).padStart(3), tone: 'text', bold: true }],
      meter: { fraction: board.open === 0 ? 0 : col.issues.length / board.open, category: col.category, cells: METER_CELLS },
    })
  }
  lines.push({ left: [{ text: `  ✓ ${doneText(board)} · ${DONE_DAYS}d`, tone: 'subtle' }] })
  return lines
}

// The same meter as a picture, for terminals that draw images (kitty, Ghostty): RGBA pixels, base64.
const COLOR: Record<Category, [number, number, number]> = { 'To Do': [137, 147, 164], 'In Progress': [76, 154, 255], Done: [54, 179, 126] }
const REST: [number, number, number, number] = [128, 128, 128, 90]

export function meterRgba(fraction: number, category: Category, width = 64, height = 8): { rgba: string; width: number; height: number } {
  const f = Math.max(0, Math.min(1, fraction))
  const filled = f === 0 ? 0 : Math.max(1, Math.round(f * width))
  const [r, g, b] = COLOR[category]
  const bytes = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x < filled ? [r, g, b, 255] : REST
      bytes.set(px, (y * width + x) * 4)
    }
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { rgba: btoa(bin), width, height }
}

// The Jira overview line for the top of a pane (htop style): one stacked meter (to do grey, in progress green,
// done as plain text), the three counts, and how long ago the board was read.
export function boardOverview(board: Board, ageMs: number, width: number, cellCount = 8): PaneLine {
  // The meter is the open work only (to do grey, in progress green): with most Stories done, a meter that
  // counted done would be nearly all done, the least urgent part drawn loudest (owner screenshot 2026-10-16).
  const todo = board.columns.filter((c) => c.category === 'To Do').reduce((n, c) => n + c.issues.length, 0)
  const doing = board.open - todo
  const done = board.done.count
  const open = todo + doing
  let b = open === 0 || doing === 0 ? 0 : Math.max(1, Math.round((doing / open) * cellCount))
  let a = open === 0 ? 0 : cellCount - b
  if (todo > 0 && a === 0) [a, b] = [1, cellCount - 1]
  const right: Seg[] = [{ text: formatMinutes(ageMs).replace('<1m', 'now') + (ageMs < 60_000 ? '' : ' ago'), tone: 'subtle' }]
  const counts = `○ ${todo}  ● ${doing}  ✓ ${done}${board.done.capped ? '+' : ''}` // to do, in progress, done in 14 days
  const parts: Seg[] = [{ text: '█'.repeat(a), tone: 'subtle' }, { text: '█'.repeat(b), tone: 'success' }, { text: '░'.repeat(open === 0 ? cellCount : 0), tone: 'subtle' }]
  const meter = parts.filter((s) => s.text !== '')
  const room = width - cells(plain0(right)) - 1
  const full: Seg[] = [{ text: 'jira ', tone: 'subtle' }, { text: '▕', tone: 'subtle' }, ...meter, { text: '▏ ', tone: 'subtle' }, { text: counts, tone: 'subtle' }]
  if (cells(plain0(full)) <= room) return { left: full, right }
  return { left: [{ text: 'jira ', tone: 'subtle' }, { text: clipToCells(counts, room - 5), tone: 'subtle' }], right }
}

const plain0 = (line: Seg[]): string => line.map((s) => s.text).join('')
const clipToCells = (text: string, max: number): string => (cells(text) <= max ? text : clip(text, Math.max(4, max)))
