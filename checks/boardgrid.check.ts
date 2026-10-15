import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLUMN_CELLS, boardGrid, wrapCells } from '../core/boardgrid.ts'
import { buildBoard } from '../core/jiraboard.ts'
import type { BoardIssue } from '../core/jiraboard.ts'
import { cells, plain } from '../core/style.ts'

const issue = (key: string, status: string, summary = 'a title', assignee: string | null = 'alex hsieh'): BoardIssue => ({ key, status, summary, assignee })
const board = buildBoard({
  todo: [issue('WALK-20', 'Backlog', 'Real-session verification (interactive terminal and Desktop)', null), issue('WALK-27', 'Backlog', 'Later ideas')],
  inProgress: [issue('WALK-151', 'In Progress', 'Board pane: Jira columns side by side'), issue('WALK-148', 'In Review', 'Clear a left worktree')],
  done: [issue('WALK-9', 'Done')],
  cap: 100,
})
const text = (lines: ReturnType<typeof boardGrid>['lines']) => lines.map(plain)

test('wrapCells: two lines by terminal cells, the second cut with an ellipsis', () => {
  assert.deepEqual(wrapCells('Board pane: Jira columns side by side', 14, 2), ['Board pane:', 'Jira columns …'])
  assert.deepEqual(wrapCells('short', 14, 2), ['short'])
  assert.deepEqual(wrapCells('公文總表預設改為最新在前', 10, 2), ['公文總表預', '設改為最…'])
  assert.deepEqual(wrapCells('averyveryverylongwordwithoutspaces', 10, 2), ['averyveryv', 'erylongwo…'])
})

test('columns sit side by side: every status a column, Done last as a count', () => {
  const g = boardGrid(board, new Map(), { width: 200, offset: 0, now: 0 })
  const head = text(g.lines).find((l) => l.includes('BACKLOG')) ?? ''
  assert.ok(head.indexOf('BACKLOG 2') < head.indexOf('IN PROGRESS 1'))
  assert.ok(head.indexOf('IN PROGRESS 1') < head.indexOf('IN REVIEW 1'))
  assert.ok(head.indexOf('IN REVIEW 1') < head.indexOf('DONE'))
  assert.ok(text(g.lines).some((l) => l.includes('in 14 days')))
  assert.deepEqual([g.from, g.to, g.total], [0, 4, 4])
})

test('a card is a box: key, two title lines, assignee; every line of the grid is the same width', () => {
  const g = boardGrid(board, new Map(), { width: 200, offset: 0, now: 0 })
  const all = text(g.lines)
  assert.ok(all.some((l) => l.includes('┌')) && all.some((l) => l.includes('└')))
  assert.ok(all.some((l) => l.includes('WALK-20')))
  assert.ok(all.some((l) => l.includes('Real-session')))
  assert.ok(all.some((l) => l.includes('unassigned')))
  const body = all.slice(1) // the title line has its own width
  const widths = new Set(body.map((l) => cells(l.trimEnd())).filter((w) => w > 0))
  for (const w of widths) assert.ok(w <= 4 * COLUMN_CELLS, `a line is ${w} cells wide`)
  const first = all.findIndex((l) => l.includes('┌'))
  assert.equal(cells(all[first] ?? ''), cells(all[first + 1] ?? ''), 'box lines of one row differ in width')
})

test('the card Claude works on is lit: symbol, minutes and a colored border', () => {
  const lights = new Map([['WALK-151', { light: 'walking' as const, sinceMs: 0 }], ['WALK-148', { light: 'waiting' as const, sinceMs: 0 }]])
  const g = boardGrid(board, lights, { width: 200, offset: 0, now: 3 * 60_000 })
  const all = text(g.lines)
  assert.ok(all.some((l) => /● WALK-151 +3m/.test(l)), 'running card without its light')
  assert.ok(all.some((l) => /⚠ WALK-148 +3m/.test(l)), 'needs-you card without its light')
  const tones = g.lines.flat().filter((s) => s.text.includes('┌')).map((s) => s.tone)
  assert.ok(tones.includes('success') && tones.includes('warning'), 'borders do not follow the lights')
  assert.ok(tones.includes('subtle'), 'an unlit card should have a quiet border')
})

test('more columns than fit: a window of whole columns, and the offset moves it', () => {
  const narrow = boardGrid(board, new Map(), { width: 2 * COLUMN_CELLS + 3, offset: 0, now: 0 })
  assert.deepEqual([narrow.from, narrow.to, narrow.total], [0, 2, 4])
  assert.ok(text(narrow.lines).some((l) => l.includes('BACKLOG')))
  assert.ok(!text(narrow.lines).some((l) => l.includes('IN REVIEW')))
  const moved = boardGrid(board, new Map(), { width: 2 * COLUMN_CELLS + 3, offset: 2, now: 0 })
  assert.deepEqual([moved.from, moved.to], [2, 4])
  assert.ok(text(moved.lines).some((l) => l.includes('IN REVIEW')))
  const past = boardGrid(board, new Map(), { width: 2 * COLUMN_CELLS + 3, offset: 9, now: 0 })
  assert.deepEqual([past.from, past.to], [2, 4], 'an offset past the end shows the last columns')
  const tiny = boardGrid(board, new Map(), { width: 10, offset: 0, now: 0 })
  assert.equal(tiny.to - tiny.from, 1, 'at least one column always shows')
})

test('an empty board still draws its Done column and says nothing is open', () => {
  const g = boardGrid(buildBoard({ todo: [], inProgress: [], done: [], cap: 100 }), new Map(), { width: 120, offset: 0, now: 0 })
  assert.ok(text(g.lines).some((l) => l.includes('no open Story-level issues')))
})

test('Jira text cannot steer the terminal', () => {
  const b = buildBoard({ todo: [issue('A-1', 'To\u001bDo', 'x\u001b[31mred', 'm\u0007e')], inProgress: [], done: [], cap: 100 })
  const all = text(boardGrid(b, new Map(), { width: 120, offset: 0, now: 0 }).lines).join('\n')
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(all))
})
