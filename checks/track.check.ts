import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CARD_TONES, MAX_RUNNERS, TRACK_MIN_ROWS, braille, cardTone, lapLength, playground, runnerOf, trackTones } from '../core/track.ts'
import { cells, plain } from '../core/style.ts'
import type { CardRow } from '../core/contracts.ts'

const row = (key: string, over: Partial<CardRow> = {}): CardRow => ({ key, slug: 'x', branch: key + '-x', worktree: '/w/' + key, light: 'walking', sinceMs: 0, ...over })
const text = (lines: ReturnType<typeof playground>) => lines.map((l) => plain(l.left))

test('braille: two 2 x 4 pixel cells per runner', () => {
  assert.equal(braille(['#...', '....', '....', '....']), '⠁⠀')
  assert.equal(braille(['....', '....', '....', '...#']), '⠀⢀')
  assert.equal(braille(['####', '####', '####', '####']), '⣿⣿')
})

test('nothing running: no playground at all', () => {
  assert.deepEqual(playground([], 0, 44, 10), [])
  assert.deepEqual(playground([row('A-1', { light: 'idle' }), row('A-2', { light: 'done' })], 0, 44, 10), [])
})

test('too few rows or columns: no playground', () => {
  assert.deepEqual(playground([row('A-1')], 0, 44, TRACK_MIN_ROWS - 1), [])
  assert.deepEqual(playground([row('A-1')], 0, 19, 10), [])
  assert.equal(playground([row('A-1')], 0, 44, TRACK_MIN_ROWS).length, TRACK_MIN_ROWS)
})

test('an oval track: rounded ends, every row exactly the width asked', () => {
  const t = text(playground([row('A-1')], 0, 40, 9))
  assert.equal(t.length, 9)
  for (const l of t) assert.equal(cells(l), 40, JSON.stringify(l))
  assert.ok(t[0]?.includes('╭') && t[0]?.includes('╮'))
  assert.ok(t[1]?.startsWith('╱') && t[1]?.endsWith('╲'))
  assert.ok(t[7]?.startsWith('╲') && t[7]?.endsWith('╱'))
  assert.ok(t[8]?.includes('╰') && t[8]?.includes('╯'))
})

test('a runner laps: its place moves with the clock and comes back after a lap', () => {
  const r = row('WALK-12')
  const at = (ms: number) => runnerOf(r, ms, 40, 9).pos
  assert.notEqual(at(0), at(1000))
  const lap = lapLength(40, 9)
  const speed = runnerOf(r, 0, 40, 9).speed
  const lapMs = Math.round((lap / speed) * 1000)
  assert.ok(Math.abs(at(lapMs) - at(0)) <= 1 || Math.abs(at(lapMs) - at(0)) >= lap - 1)
})

test('speed: a small fixed spread per card, faster near the end of its steps', () => {
  const speeds = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'].map((k) => runnerOf(row(k), 0, 40, 9).speed)
  assert.ok(new Set(speeds).size > 1, 'all cards run at one speed')
  for (const s of speeds) assert.ok(s >= 4 * 0.8 && s <= 4 * 1.2, String(s))
  const slow = runnerOf(row('A-1', { todo: { done: 1, total: 4 } }), 0, 40, 9).speed
  const fast = runnerOf(row('A-1', { todo: { done: 3, total: 4 } }), 0, 40, 9).speed
  assert.ok(Math.abs(fast / slow - 1.5) < 0.001)
})

test('a card keeps its colour and its figure; colours never borrow the status colours', () => {
  assert.equal(cardTone('WALK-12'), cardTone('WALK-12'))
  for (const t of CARD_TONES) assert.ok(!['success', 'warning', 'error', 'subtle'].includes(t))
  const tones = new Set(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8'].map(cardTone))
  assert.ok(tones.size >= 3, 'cards should not share one colour')
  assert.equal(runnerOf(row('A-1'), 0, 40, 9).woman, runnerOf(row('A-1'), 5000, 40, 9).woman)
  const women = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8'].map((k) => runnerOf(row(k), 0, 40, 9).woman)
  assert.ok(women.includes(true) && women.includes(false), 'both men and women run')
})

test('a card that needs you stands still where it stopped; a failed one lies down', () => {
  const waiting = row('A-1', { light: 'waiting', sinceMs: 2000 })
  assert.equal(runnerOf(waiting, 3000, 40, 9).pos, runnerOf(waiting, 9000, 40, 9).pos)
  assert.equal(runnerOf(waiting, 3000, 40, 9).glyph, runnerOf(waiting, 9000, 40, 9).glyph)
  const failed = runnerOf(row('A-1', { light: 'failed' }), 0, 40, 9).glyph
  assert.notEqual(failed, runnerOf(waiting, 3000, 40, 9).glyph)
  // a walking runner changes its legs between two frames
  const walking = row('A-1')
  assert.notEqual(runnerOf(walking, 0, 40, 9).glyph, runnerOf(walking, 250, 40, 9).glyph)
})

test('the runners are drawn on the track in their colours; the infield shows their keys as name tags', () => {
  const lines = playground([row('WALK-12'), row('WALK-15', { light: 'waiting' }), row('WALK-20', { light: 'failed' })], 0, 44, 10)
  const all = text(lines).join('\n')
  assert.ok(all.includes('WALK-12') && all.includes('WALK-15') && all.includes('WALK-20'))
  assert.ok(all.includes('⚠') && all.includes('✕'))
  const segs = lines.flatMap((l) => l.left)
  const tag = segs.find((s) => s.text.includes('WALK-12'))
  assert.equal(tag?.tone, cardTone('WALK-12'))
  // three runners on the track, each in its card's colour (braille cells)
  const runnerTones = new Set(segs.filter((s) => /[⠁-⣿]/.test(s.text)).map((s) => s.tone))
  assert.ok(runnerTones.has(cardTone('WALK-12')))
})

test('at most eight runners, the rest named as "+N more"', () => {
  const many = Array.from({ length: 11 }, (_, i) => row(`A-${i + 1}`))
  const all = text(playground(many, 0, 44, 10)).join('\n')
  assert.equal(MAX_RUNNERS, 8)
  assert.ok(all.includes('+3'), all)
})

test('no two runners on one track share a colour, and the set of cards keeps its colours', () => {
  const keys = ['WALK-12', 'WALK-15', 'WALK-20', 'WALK-31', 'A-1', 'A-2']
  const tones = trackTones(keys)
  assert.equal(new Set(tones.values()).size, keys.length) // as many colours as there are
  assert.equal(new Set(trackTones([...keys, 'A-3', 'A-4']).values()).size, CARD_TONES.length) // beyond that they repeat
  assert.deepEqual([...trackTones([...keys].reverse())].sort(), [...tones].sort())
})
