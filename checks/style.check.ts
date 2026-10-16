import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEGEND, diskBar, formatMinutes, plain, progressBar, styleBand, stylePane, styleBoard } from '../core/style.ts'
import type { PaneLine } from '../core/style.ts'
import { renderBoard } from '../core/board.ts'
import type { CardRow } from '../core/contracts.ts'
import { buildJql, mergeJira, parseSearch } from '../core/jira.ts'
import { doctorLines, envNames, hasAnsi } from '../core/doctor.ts'

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
  const pane = paneText(stylePane(rows, undefined, 0, others))
  assert.ok(pane.some((l) => l.includes('JEV-48') && l.includes('Optional masking')))
  assert.ok(pane.some((l) => l.includes('IN JIRA')))
  assert.equal(pane.filter((l) => /^\s*JEV-1\d/.test(l)).length, 6)
  assert.ok(pane.some((l) => l.includes('+2 more')))
})

test('doctor lines: say what is wrong and never show a credential value', () => {
  const base = { project: 'JEV', cloneDir: '', envFile: '/c/.env', envNames: { JIRA_BASE_URL: true, JIRA_EMAIL: true, JIRA_API_TOKEN: true }, uvx: true, settingsCreds: 'none', cardCount: 1, jiraError: undefined, jiraCount: 4, setupCommand: 'npx x setup' }
  const ok = doctorLines(base)
  assert.ok(ok.every((l) => l.startsWith('✓')), ok.join('\n'))
  const bad = doctorLines({ ...base, envNames: { JIRA_BASE_URL: true, JIRA_EMAIL: false }, uvx: false, jiraError: 'exit 1: nope', cardCount: 0 })
  assert.ok(bad.some((l) => l.startsWith('✗ uvx')))
  assert.ok(bad.some((l) => l.includes('missing JIRA_EMAIL, JIRA_API_TOKEN')))
  assert.ok(bad.some((l) => l.includes('last Jira lookup failed: exit 1')))
  assert.ok(doctorLines({ ...base, project: '' }).some((l) => l.includes('WALKMAN_JIRA_PROJECT is not set')))
  assert.ok(doctorLines({ ...base, envNames: undefined }).some((l) => l.includes('no credentials file')))
  const names = envNames('JIRA_API_TOKEN=supersecret\nJIRA_EMAIL=\n')
  assert.ok(!JSON.stringify(doctorLines({ ...base, envNames: names })).includes('supersecret'))
})

test('doctor lines: credentials from plugin settings, partial settings, and what the skills still need', () => {
  const base = { project: 'JEV', cloneDir: '', envFile: '/c/.env', envNames: undefined, uvx: true, settingsCreds: 'complete', cardCount: 1, jiraError: undefined, jiraCount: 4, setupCommand: 'npx x setup' }
  const complete = doctorLines(base).join('\n')
  assert.ok(complete.includes('come from the plugin settings'))
  assert.ok(complete.includes('the ticket skills and the CLI read /c/.env'))
  assert.ok(!complete.includes('✗'), complete)
  const partial = doctorLines({ ...base, settingsCreds: 'partial:URL+email' }).join('\n')
  assert.ok(partial.includes('incomplete (set: URL, email; need URL, email and token)'))
  assert.ok(doctorLines({ ...base, settingsCreds: 'none' }).join('\n').includes('no credentials file'))
})

test('doctor says so when the credentials file holds terminal color codes', () => {
  const colored = '\u001b[01;31m\u001b[KJIRA_BASE_URL\u001b[m\u001b[K=https://x.atlassian.net\n'
  assert.ok(hasAnsi(colored) && !hasAnsi('JIRA_BASE_URL=https://x\n'))
  const base = { project: 'JEV', cloneDir: '', envFile: '/c/.env', envNames: envNames(colored), envHasAnsi: true, uvx: true, settingsCreds: 'none', cardCount: 1, jiraError: undefined, jiraCount: undefined, setupCommand: 'npx x setup' }
  const text = doctorLines(base).join('\n')
  assert.match(text, /color codes/)
  assert.ok(!text.includes('is missing JIRA_BASE_URL'))
})

// ---------- the redesigned pane: information density follows how much a card needs you ----------

const MIN = 60_000
const NOW = 100 * MIN
const paneText = (lines: readonly PaneLine[]): string[] => lines.map((l) => plain(l.left) + (l.right ? ' ' + plain(l.right) : ''))
const cells = (t: string): number => [...t].reduce((n, c) => n + ((c.codePointAt(0) as number) >= 0x1100 && /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(c) ? 2 : 1), 0)
const at = (min: number) => NOW - min * MIN // sinceMs for a card that has been in its state for `min` minutes

test('minutes only: <1m, 45m, 1h05m', () => {
  assert.equal(formatMinutes(0), '<1m')
  assert.equal(formatMinutes(59_999), '<1m')
  assert.equal(formatMinutes(3 * MIN + 59_000), '3m')
  assert.equal(formatMinutes(45 * MIN), '45m')
  assert.equal(formatMinutes(65 * MIN), '1h05m')
})

test('the disk bar fills with usage and its tone follows 80% and 90%', () => {
  assert.equal(diskBar(23), '▕██░░░░░░▏')
  assert.equal(diskBar(100), '▕████████▏')
  const tone = (usedPct: number) => stylePane([row({ light: 'idle' })], { freeGb: 4, usedPct }, NOW)[1]?.left.find((x) => x.text.includes('▕'))?.tone
  assert.equal(tone(23), 'success')
  assert.equal(tone(84), 'warning')
  assert.equal(tone(95), 'error')
})

test('pane, all idle: the title, the disk meter on top (htop style), a rule, "all quiet", no lane at all', () => {
  const t = paneText(stylePane([row({ light: 'idle' }), row({ key: 'CF1-2', light: 'idle' })], { freeGb: 40, usedPct: 23 }, NOW))
  assert.equal(t.length, 4, t.join('\n'))
  assert.ok(t[0]?.startsWith('WALKMAN'))
  assert.ok(t[1]?.includes('23%') && t[1]?.includes('40 GB free'))
  assert.ok(/^─+$/.test(t[2] ?? ''))
  assert.ok(t[3]?.includes('✓ all quiet'))
  assert.ok(!t.join('\n').match(/NEEDS YOU|FAILED|RUNNING/))
})

test('pane, mixed: needs you first, then failed, then running (longest first), done folded into one line', () => {
  const rows = [
    row({ key: 'W-1', title: 'run short', light: 'walking', sinceMs: at(2) }),
    row({ key: 'W-2', title: 'run long', light: 'walking', sinceMs: at(30) }),
    row({ key: 'W-3', title: 'asks', light: 'waiting', sinceMs: at(7) }),
    row({ key: 'W-4', title: 'broke', light: 'failed', sinceMs: at(4) }),
    row({ key: 'W-5', light: 'done' }), row({ key: 'W-6', light: 'done' }), row({ key: 'W-7', light: 'done' }),
  ]
  const lines = stylePane(rows, undefined, NOW)
  const t = paneText(lines)
  assert.equal(t[0], 'WALKMAN ⚠ 1  ✕ 1  ● 2  ✓ 3')
  const idx = (needle: string) => t.findIndex((l) => l.includes(needle))
  assert.ok(idx('NEEDS YOU') < idx('W-3') && idx('W-3') < idx('FAILED') && idx('FAILED') < idx('W-4') && idx('W-4') < idx('RUNNING'))
  assert.ok(idx('W-2') < idx('W-1'), 'running: the one that has run longest is on top')
  assert.ok(t.some((l) => l.trim() === '✓ 3 done'))
  assert.ok(!t.some((l) => l.includes('W-5')), 'done cards are not listed')
  assert.ok(t.find((l) => l.includes('W-2'))?.includes('30m'))
  assert.ok(t.find((l) => l.includes('W-3'))?.includes('7m'))
  assert.ok(!t.join('\n').match(/\d:\d\d/), 'no seconds')
})

test('pane: needs you and failed use different colors, and each has its own symbol', () => {
  const lines = stylePane([row({ light: 'waiting', sinceMs: at(1) }), row({ key: 'CF1-2', light: 'failed', sinceMs: at(1) })], undefined, NOW)
  const needs = lines.find((l) => plain(l.left).includes('CF1-195'))
  const failed = lines.find((l) => plain(l.left).includes('CF1-2'))
  const accent = (l: PaneLine | undefined) => l?.left.find((x) => x.text.includes('┃'))?.tone
  assert.equal(accent(needs), 'warning')
  assert.equal(accent(failed), 'error')
  assert.notEqual(accent(needs), accent(failed))
  const t = paneText(lines).join('\n')
  assert.ok(t.includes('⚠ NEEDS YOU') && t.includes('✕ FAILED'))
})

test('pane: a long title, Chinese included, is cut to the pane and never wraps', () => {
  const long = '公文 CSV 匯入：表頭寫「案名」不被辨識，整批變成未歸案且沒有任何提示 and a very long english tail that goes on'
  for (const columns of [30, 44, 80]) {
    const lines = stylePane([row({ title: long, light: 'walking', sinceMs: at(12) }), row({ key: 'CF1-2', title: long, light: 'waiting', sinceMs: at(3) })], { freeGb: 9, usedPct: 50 }, NOW, [], { columns })
    for (const l of paneText(lines)) assert.ok(cells(l) <= columns - 2, `${columns} cols, too wide (${cells(l)}): ${l}`)
  }
})

test('pane: more cards than the viewport has rows ends with "+N more" and stays inside the rows', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row({ key: `R-${i}`, title: `card ${i}`, light: 'walking', sinceMs: at(i + 1) }))
  const lines = stylePane(rows, { freeGb: 9, usedPct: 50 }, NOW, [], { columns: 44, rows: 10 })
  const t = paneText(lines)
  assert.ok(lines.length <= 10, `${lines.length} lines`)
  assert.ok(t.some((l) => /\+\d+ more/.test(l)))
  assert.ok(t[0]?.startsWith('WALKMAN') && t[1]?.includes('50%'), 'title and disk stay on top')
  const shown = t.filter((l) => /R-\d/.test(l)).length
  const more = Number(/\+(\d+) more/.exec(t.join('\n'))?.[1])
  assert.equal(shown + more, 12)
})

test('pane: needs-you says why only from what is known, failed adds no invented line, no empty lines', () => {
  const lines = stylePane([row({ key: 'A-1', title: 'plan', light: 'waiting', runState: 'plan_ready', sinceMs: at(5) }), row({ key: 'A-2', title: 'ask', light: 'waiting', sinceMs: at(2) }), row({ key: 'A-3', title: 'bad', light: 'failed', sinceMs: at(1) })], undefined, NOW)
  const t = paneText(lines)
  assert.ok(t.some((l) => l.includes('plan is ready for your review')))
  assert.ok(t.some((l) => l.includes('permission question')))
  const i = t.findIndex((l) => l.includes('A-3'))
  assert.ok(i === t.length - 1 || /FAILED|RUNNING|✓|IN JIRA|disk/.test(t[i + 1] as string), 'a failed card has one line')
  assert.ok(t.every((l) => l.trim() !== ''), 'no empty lines')
})

test('pane with no card branch says so instead of "all quiet"', () => {
  const t = paneText(stylePane([], undefined, NOW))
  assert.ok(t.some((l) => l.includes('KEY-<n>-<slug>')))
  assert.ok(!t.some((l) => l.includes('all quiet')))
})

test('pane: "+N more" counts cards, not the done/idle summary line', () => {
  const rows = [...Array.from({ length: 6 }, (_, i) => row({ key: `R-${i}`, title: `card ${i}`, light: 'walking', sinceMs: at(i + 1) })), row({ key: 'D-1', light: 'done' }), row({ key: 'D-2', light: 'idle' })]
  const t = paneText(stylePane(rows, { freeGb: 9, usedPct: 50 }, NOW, [], { rows: 7 }))
  const shown = t.filter((l) => /R-\d/.test(l)).length
  const more = Number(/\+(\d+) more/.exec(t.join('\n'))?.[1] ?? 0)
  assert.equal(shown + more, 6, t.join('\n'))
})

test('pane: a running card of a symphony run shows its five-step bar, still inside the pane', () => {
  const lines = stylePane([row({ key: 'W-1', title: 'a long title that has to give way to the bar and the time', light: 'walking', runState: 'implementing', sinceMs: at(12) })], undefined, NOW)
  const line = lines.find((l) => plain(l.left).includes('W-1')) as PaneLine
  const all = plain(line.left) + ' ' + plain(line.right ?? [])
  assert.ok(all.includes('████░') && all.includes('12m'), all)
  assert.ok(cells(all) <= 42, `too wide: ${all}`)
})

test('pane: control characters in a title never reach the screen', () => {
  const t = paneText(stylePane([row({ key: 'W-1', title: 'evil\u001b[31m\u0007title\nsecond line', light: 'walking', sinceMs: at(1) })], undefined, NOW, [{ key: 'J-1', status: 'In Progress', summary: 'jira\u001b]0;x\u0007 title' }])).join('\n')
  assert.ok(!/[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/.test(t.replace(/\n/g, '')), 'a control character is drawn')
  assert.ok(t.includes('evil') && t.includes('title'))
})

test('the strip above the prompt shows whole minutes, never seconds', () => {
  const text = (light: CardRow['light'], ms: number) => plain(styleBand([row({ light, sinceMs: 0 })], ms))
  assert.match(text('walking', 5_000), /<1m/)
  assert.match(text('waiting', 61_000), / 1m/)
  assert.match(text('walking', 65 * 60_000), /1h05m/)
  assert.ok(!/\d:\d\d/.test(text('walking', 125_000)), 'no m:ss clock')
  assert.equal(plain(styleBand([row({ light: 'idle' })], 90_000)).includes('m'), false, 'an idle card shows no time')
})
