import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CARD_HEX, playgroundSvg } from '../core/tracksvg.ts'
import type { CardRow } from '../core/contracts.ts'

const row = (key: string, over: Partial<CardRow> = {}): CardRow => ({ key, slug: 'x', branch: key + '-x', worktree: '/w/' + key, light: 'walking', sinceMs: 0, ...over })

test('nothing running: no playground', () => {
  assert.equal(playgroundSvg([], 0), undefined)
  assert.equal(playgroundSvg([row('A-1', { light: 'idle' }), row('A-2', { light: 'done' })], 0), undefined)
})

test('an SVG stadium track with one figure per card; a running one laps along the track with animateMotion', () => {
  const svg = playgroundSvg([row('WALK-12'), row('WALK-15')], 0) as string
  assert.ok(svg.startsWith('<svg'))
  assert.equal((svg.match(/<animateMotion/g) ?? []).length, 2)
  assert.ok(svg.includes('repeatCount="indefinite"'))
  assert.ok(svg.includes('WALK-12') && svg.includes('WALK-15')) // name tags
})

test('the markup holds no clock: redraws give the same SVG while the cards keep running, so the animation is not restarted', () => {
  const rows = [row('WALK-12', { todo: { done: 1, total: 4 } }), row('WALK-15')]
  assert.equal(playgroundSvg(rows, 1_000), playgroundSvg(rows, 61_000))
})

test('each card runs at its own pace, faster near the end of its steps', () => {
  const dur = (r: CardRow) => Number(/<animateMotion[^>]*dur="([\d.]+)s"/.exec(playgroundSvg([r], 0) as string)?.[1])
  assert.notEqual(dur(row('A-1')), dur(row('A-2')))
  assert.ok(dur(row('A-1', { todo: { done: 3, total: 4 } })) < dur(row('A-1', { todo: { done: 1, total: 4 } })))
})

test('a card that needs you stands still with a warning mark, a failed one lies down with a cross', () => {
  const waiting = playgroundSvg([row('A-1', { light: 'waiting', sinceMs: 5_000 })], 9_000) as string
  assert.ok(!waiting.includes('<animateMotion'))
  assert.ok(waiting.includes('⚠'))
  const failed = playgroundSvg([row('A-1', { light: 'failed' })], 0) as string
  assert.ok(!failed.includes('<animateMotion'))
  assert.ok(failed.includes('✕'))
  assert.ok(failed.includes('rotate(90'))
})

test('cards on one track get different colours; at most eight figures, the rest as +N', () => {
  const svg = playgroundSvg(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'].map((k) => row(k)), 0) as string
  const used = new Set(CARD_HEX.filter((c) => svg.includes(c)))
  assert.equal(used.size, 6) // six cards, six colours
  const many = playgroundSvg(Array.from({ length: 11 }, (_, i) => row(`A-${i + 1}`)), 0) as string
  assert.equal((many.match(/<animateMotion/g) ?? []).length, 8)
  assert.ok(many.includes('+3'))
})

test('text in the markup is escaped', () => {
  const svg = playgroundSvg([row('A-1<x>')], 0) as string
  assert.ok(!svg.includes('A-1<x>'))
})

test('eight runners, eight different colours, none of them a status colour', () => {
  const svg = playgroundSvg(Array.from({ length: 8 }, (_, i) => row(`B-${i + 1}`)), 0) as string
  assert.equal(CARD_HEX.length, 8)
  assert.equal(new Set(CARD_HEX).size, 8)
  assert.equal(CARD_HEX.filter((c) => svg.includes(c)).length, 8)
  for (const c of CARD_HEX) assert.ok(!['#22c55e', '#f59e0b', '#ef4444', '#e5484d', '#d99a06'].includes(c))
})
