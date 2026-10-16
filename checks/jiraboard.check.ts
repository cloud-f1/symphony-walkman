import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardJql, boardOverview, buildBoard, boardPaneLines, boardText, meterRgba, meterText, parseIssuesJson } from '../core/jiraboard.ts'
import type { BoardIssue } from '../core/jiraboard.ts'
import { cells, plain, stylePane } from '../core/style.ts'
const paneText = (lines: ReturnType<typeof stylePane>) => lines.map((l) => plain(l.left) + (l.right ? ' ' + plain(l.right) : ''))

const issue = (key: string, status: string, summary = 'a title', assignee: string | null = 'alex hsieh'): BoardIssue => ({ key, status, summary, assignee })

test('board JQL: Story level, one status category, only a valid project key', () => {
  assert.equal(boardJql('WALK', 'To Do'), 'project = WALK AND hierarchyLevel = 0 AND statusCategory = "To Do" ORDER BY updated DESC')
  assert.equal(boardJql('WALK', 'In Progress'), 'project = WALK AND hierarchyLevel = 0 AND statusCategory = "In Progress" ORDER BY updated DESC')
  assert.match(boardJql('WALK', 'Done') ?? '', /statusCategory = Done AND statusCategoryChangedDate >= -14d/)
  assert.equal(boardJql('walk; drop', 'To Do'), undefined)
  assert.equal(boardJql('', 'To Do'), undefined)
})

test('parseIssuesJson reads the call output and skips anything malformed', () => {
  const out = JSON.stringify({ issues: [{ key: 'WALK-1', status: 'Backlog', summary: 'x', assignee: null }, { key: 'bad key', status: 'x', summary: 'y' }, { nope: 1 }], total: 3 })
  assert.deepEqual(parseIssuesJson(out), [{ key: 'WALK-1', status: 'Backlog', summary: 'x', assignee: null }])
  assert.deepEqual(parseIssuesJson('not json'), [])
  assert.deepEqual(parseIssuesJson('{"issues": 5}'), [])
})

test('columns: to-do statuses first, then in-progress ones, known names in board order, done only as a count', () => {
  const board = buildBoard({
    todo: [issue('A-1', 'To Do'), issue('A-2', 'Backlog'), issue('A-3', 'To Do')],
    inProgress: [issue('A-4', 'In Review'), issue('A-5', 'In Progress'), issue('A-6', 'BLOCKED'), issue('A-7', 'Waiting on vendor')],
    done: [issue('A-8', 'Done'), issue('A-9', 'Done')],
    cap: 100,
  })
  assert.deepEqual(board.columns.map((c) => `${c.status}:${c.issues.length}`), ['Backlog:1', 'To Do:2', 'BLOCKED:1', 'In Progress:1', 'In Review:1', 'Waiting on vendor:1'])
  assert.deepEqual(board.columns.map((c) => c.category), ['To Do', 'To Do', 'In Progress', 'In Progress', 'In Progress', 'In Progress'])
  assert.deepEqual(board.done, { count: 2, capped: false })
  assert.equal(board.open, 7)
})

test('a done count at the cap says so', () => {
  const done = Array.from({ length: 100 }, (_, i) => issue(`A-${i + 1}`, 'Done'))
  assert.deepEqual(buildBoard({ todo: [], inProgress: [], done, cap: 100 }).done, { count: 100, capped: true })
})

test('the printed board: a section per column with key, title and assignee, then the done count', () => {
  const board = buildBoard({ todo: [issue('WALK-20', 'Backlog', 'Real-session check of the signal on Claude Desktop', null)], inProgress: [issue('WALK-27', 'In Progress', 'One row per subagent')], done: [issue('WALK-9', 'Done')], cap: 100 })
  const text = boardText('WALK', board).join('\n')
  assert.match(text, /WALK board · 2 open · 1 done in 14 days/)
  assert.match(text, /BACKLOG \(1\)\n {2}WALK-20 +Real-session check of the signal on Claude Desktop +unassigned/)
  assert.match(text, /IN PROGRESS \(1\)\n {2}WALK-27 +One row per subagent +alex hsieh/)
  assert.ok(text.indexOf('BACKLOG') < text.indexOf('IN PROGRESS'))
})

test('the printed board clips long titles and strips control characters from Jira text', () => {
  const long = 'x'.repeat(120)
  const board = buildBoard({ todo: [issue('A-1', 'To Do', long + '\u001b[31mred', 'm\u0007e')], inProgress: [], done: [], cap: 100 })
  const text = boardText('A', board).join('\n')
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text), 'a control character reached the output')
  assert.ok(text.split('\n').every((l) => [...l].length <= 100), 'a line is wider than 100 characters')
})

test('an empty board says so instead of drawing nothing', () => {
  assert.match(boardText('A', buildBoard({ todo: [], inProgress: [], done: [], cap: 100 })).join('\n'), /no open Story-level issues/)
})

test('pane: a BOARD lane, one line per column with a meter and the count', () => {
  const board = buildBoard({ todo: [issue('A-1', 'To Do'), issue('A-2', 'To Do')], inProgress: [issue('A-3', 'In Progress')], done: [issue('A-4', 'Done')], cap: 100 })
  const lines = boardPaneLines(board, 40)
  assert.equal(plain(lines[0]?.left ?? []), '▤ BOARD')
  const todo = lines.find((l) => plain(l.left).includes('To Do'))
  assert.ok(todo?.meter, 'a column line carries a meter')
  assert.equal(todo?.meter?.fraction, 2 / 3)
  assert.equal(todo?.meter?.category, 'To Do')
  assert.ok(plain(todo?.right ?? []).includes('2'))
  assert.ok(lines.some((l) => /✓ 1 done · 14d/.test(plain(l.left))))
})

test('pane: no lines at all when there is no board yet', () => {
  assert.deepEqual(boardPaneLines(undefined, 40), [])
})

test('pane: the board sits after the cards, the disk meter on top, and the board goes whole when rows run out', () => {
  const board = boardPaneLines(buildBoard({ todo: [issue('A-1', 'To Do')], inProgress: [issue('A-2', 'In Progress')], done: [], cap: 100 }), 40)
  const disk = { freeGb: 40, usedPct: 23 }
  const tall = stylePane([], disk, 0, [], { rows: 30 }, board).map((l) => plain(l.left))
  assert.ok(tall.findIndex((l) => l.includes('disk')) === 1 && tall.indexOf('▤ BOARD') > 2)
  const short = stylePane([], disk, 0, [], { rows: 4 }, board).map((l) => plain(l.left))
  assert.ok(!short.includes('▤ BOARD'), 'a half board was drawn')
  assert.ok(short.some((l) => l.includes('disk')), 'the disk line must stay')
})

test('meter text: filled then empty cells, never wider than asked', () => {
  assert.equal(meterText(0.5, 8), '▰▰▰▰▱▱▱▱')
  assert.equal(meterText(0, 4), '▱▱▱▱')
  assert.equal(meterText(1, 4), '▰▰▰▰')
  assert.equal(meterText(0.01, 4), '▰▱▱▱') // a column with issues never looks empty
})

test('meter picture: RGBA pixels, colored part in proportion, the rest dim', () => {
  const { rgba, width, height } = meterRgba(0.5, 'In Progress', 20, 4)
  assert.equal(width, 20)
  assert.equal(height, 4)
  const bytes = Uint8Array.from(atob(rgba), (c) => c.charCodeAt(0))
  assert.equal(bytes.length, 20 * 4 * 4)
  const px = (x: number) => [...bytes.slice(x * 4, x * 4 + 4)]
  assert.notDeepEqual(px(0), px(19), 'the filled part and the rest differ')
  assert.deepEqual(px(0), px(9))
  assert.deepEqual(px(10), px(19))
  assert.equal(px(0)[3], 255)
})

// ---------- WALK-156: Epic, subtasks, overview ----------
test('parseIssuesJson keeps the Epic and the subtask counts symphony-workflow 0.12 returns', () => {
  const out = JSON.stringify({ issues: [{ key: 'WALK-20', status: 'Backlog', summary: 's', assignee: null, issue_type: 'Story', parent: 'WALK-1', parent_summary: 'WALK-E1: Pedestrian board', status_category: 'new', subtasks_done: 5, subtasks_total: 6 }] })
  const [i] = parseIssuesJson(out)
  assert.equal(i?.epic, 'WALK-1')
  assert.equal(i?.epicName, 'WALK-E1: Pedestrian board')
  assert.deepEqual([i?.subDone, i?.subTotal], [5, 6])
  const old = parseIssuesJson(JSON.stringify({ issues: [{ key: 'A-1', status: 'x', summary: 'y', assignee: null }] }))[0]
  assert.equal(old?.epic, undefined)
  assert.deepEqual([old?.subDone, old?.subTotal], [undefined, undefined])
})

test('the printed board names the Epic and the subtask progress when known', () => {
  const b = buildBoard({ todo: [{ ...issue('WALK-20', 'Backlog', 'Real-session check'), epic: 'WALK-1', epicName: 'Pedestrian board', subDone: 5, subTotal: 6 }], inProgress: [], done: [], cap: 100 })
  const text = boardText('WALK', b).join('\n')
  assert.match(text, /WALK-20 .*5\/6/)
  assert.match(text, /◆ Pedestrian board/)
})

test('overview line: a meter of the open work (to do, in progress), the counts and the read age', () => {
  const b = buildBoard({ todo: [issue('A-1', 'To Do'), issue('A-2', 'To Do')], inProgress: [issue('A-3', 'In Progress')], done: [issue('A-4', 'Done')], cap: 100 })
  const line = boardOverview(b, 120_000, 40)
  const text = plain(line.left)
  assert.match(text, /^jira /)
  assert.match(text, /○ 2 {2}● 1 {2}✓ 1/)
  assert.match(plain(line.right ?? []), /2m ago/)
  const tones = line.left.filter((s) => /[█]/.test(s.text)).map((s) => s.tone)
  assert.deepEqual(tones, ['subtle', 'success'], 'done is a count, not part of the meter')
  // owner screenshot 2026-10-16: 32 of 33 done drew an almost white bar; done must not fill the meter
  const mostlyDone = buildBoard({ todo: [issue('A-1', 'To Do')], inProgress: [], done: Array.from({ length: 32 }, (_, i) => issue(`D-${i}`, 'Done')), cap: 100 })
  const meter = boardOverview(mostlyDone, 0, 60).left.filter((x) => /[█░]/.test(x.text))
  assert.deepEqual(meter.map((x) => [x.text.length, x.tone]), [[8, 'subtle']], 'the one open Story fills the meter, in grey')
  assert.ok(cells(text) + cells(plain(line.right ?? [])) <= 40)
})

test('the hint for a card branch has no "-<" a font could join into an arrow', () => {
  const t = paneText(stylePane([], undefined, 0)).join('\n')
  assert.ok(!t.includes('-<'), t)
  assert.match(t, /KEY-n-slug/)
})
