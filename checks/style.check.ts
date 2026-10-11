import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEGEND, plain, progressBar, styleBand, stylePane, styleBoard } from '../core/style.ts'
import { renderBoard } from '../core/board.ts'
import type { CardRow } from '../core/contracts.ts'
import { buildJql, mergeJira, parseSearch } from '../core/jira.ts'

const row = (over: Partial<CardRow>): CardRow => ({ key: 'CF1-195', slug: 'devopsday-visuals', branch: 'CF1-195-devopsday-visuals', worktree: '/w', light: 'walking', sinceMs: 0, ...over })

test('tones follow the status line: green going, red needs you, quiet idle', () => {
  const tone = (light: CardRow['light']) => styleBand([row({ light })], 5_000)[0]?.tone
  assert.equal(tone('walking'), 'success')
  assert.equal(tone('waiting'), 'error')
  assert.equal(tone('failed'), 'error')
  assert.equal(tone('idle'), 'subtle')
})

test('the printed board text is the same text the styled board draws', () => {
  const rows = [row({}), row({ key: 'CF1-201', slug: 'pitch', light: 'waiting', runState: 'plan_ready' })]
  const disk = { freeGb: 74, usedPct: 84 }
  const wide = styleBoard(rows, disk, 24_000).map(plain)
  assert.ok(wide[0]?.includes('CF1-195'))
  assert.ok(wide.some((l) => l.includes('disk 74 GB free')))
  assert.ok(wide.some((l) => l.includes('1 needs you')))
  assert.ok(renderBoard(rows, disk, 24_000).some((l) => l.includes('1 needs you')))
})

test('pane lines are short enough not to wrap in a narrow pane', () => {
  const rows = [row({}), row({ key: 'CF1-201', slug: 'pitch-copy-with-a-long-name', light: 'waiting', runState: 'plan_ready', sinceMs: 0 })]
  const lines = stylePane(rows, { freeGb: 49, usedPct: 20 }, 61_000).map(plain)
  const cardLines = lines.slice(0, 4)
  for (const l of cardLines) assert.ok([...l].length <= 44, `too wide: ${l}`)
  assert.ok(lines.some((l) => l.includes('🟢 working')), 'legend present')
})

test('disk tone warns at 80% and errors at 90%', () => {
  const tone = (usedPct: number) => styleBoard([], { freeGb: 5, usedPct }, 0).flat().find((s) => s.text.includes('GB free'))?.tone
  assert.equal(tone(20), 'success')
  assert.equal(tone(84), 'warning')
  assert.equal(tone(95), 'error')
})

test('progress bar for symphony run states', () => {
  assert.equal(progressBar('plan_ready'), '███░░')
  assert.equal(progressBar('completed'), '█████')
  assert.equal(progressBar('failed'), '')
  assert.equal(progressBar(undefined), '')
})

test('legend explains every symbol', () => {
  const text = plain(LEGEND)
  for (const word of ['working', 'needs you', 'done', 'idle']) assert.ok(text.includes(word))
})

test('jira: parse the CLI output, build a safe JQL, merge titles and Jira-only rows', () => {
  const out = 'JEV-48\tIn Progress\tMasking\nJEV-35\tIn Progress\tQuiet lines\n\n2 total\n'
  const issues = parseSearch(out)
  assert.deepEqual(issues.map((i) => i.key), ['JEV-48', 'JEV-35'])
  assert.equal(issues[0]?.summary, 'Masking')
  assert.deepEqual(parseSearch('Jira API error 400: nope\n0 total'), [])
  assert.equal(buildJql('JEV', ['JEV-48', 'CF1-1', 'JEV-48']), 'project = JEV AND hierarchyLevel = 0 AND (statusCategory = "In Progress" OR key in (JEV-48)) ORDER BY updated DESC')
  assert.equal(buildJql('JEV', []), 'project = JEV AND hierarchyLevel = 0 AND (statusCategory = "In Progress") ORDER BY updated DESC')
  assert.equal(buildJql('jev; DROP', []), undefined)
  assert.equal(buildJql('JEV', ['JEV-1) OR (1=1']).includes('1=1'), false)
  const merged = mergeJira([row({ key: 'JEV-48', slug: 'masking' })], issues)
  assert.equal(merged.rows[0]?.title, 'Masking')
  assert.deepEqual(merged.others.map((i) => i.key), ['JEV-35'])
})

test('board and pane list the Jira-only cards, capped, with a title in place of the slug', () => {
  const rows = [row({ key: 'JEV-48', slug: 'masking', title: 'Optional masking of personal data' })]
  const others = Array.from({ length: 8 }, (_, i) => ({ key: `JEV-${i + 10}`, status: 'In Progress', summary: `Card ${i}` }))
  const wide = styleBoard(rows, undefined, 0, others).map(plain)
  assert.ok(wide[0]?.includes('Optional masking'))
  assert.ok(wide.some((l) => l.includes('In progress in Jira')))
  assert.ok(wide.some((l) => l.includes('+2 more')))
  const pane = stylePane(rows, undefined, 0, others).map(plain)
  for (const l of pane.slice(0, 2)) assert.ok([...l].length <= 44, `too wide: ${l}`)
})
