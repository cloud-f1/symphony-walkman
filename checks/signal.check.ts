import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FRAME_MS, SIGNAL_ROWS, bigDigits, leadOf, signalFrame, signalLines, signalNumber, signalPace, sprite } from '../core/signal.ts'
import { plain } from '../core/style.ts'
import type { CardRow } from '../core/contracts.ts'

const row = (over: Partial<CardRow>): CardRow => ({ key: 'WALK-179', slug: 'terminal-green-man', branch: 'WALK-179-terminal-green-man', worktree: '/w', light: 'walking', sinceMs: 0, ...over })

test('a bitmap pairs pixel rows into half blocks', () => {
  assert.deepEqual(sprite(['#.#.', '##..']), ['█▄▀ '])
  assert.deepEqual(sprite(['#', '.', '.', '#']), ['▀', '▄'])
})

test('every figure is the same size, so the box never jumps between frames', () => {
  const sizes = new Set<string>()
  for (const light of ['walking', 'waiting', 'failed', 'idle'] as const) {
    for (const t of [0, 250, 500, 750, 1000]) {
      const f = signalFrame(light, t, 'slow')
      sizes.add(`${f.figure.length}x${f.figure.map((l) => [...l].length).join(',')}`)
    }
  }
  assert.equal(sizes.size, 1)
  assert.equal(signalFrame('idle', 0, 'slow').figure.length, SIGNAL_ROWS)
})

test('the green man walks: frames alternate with the clock, faster near the end', () => {
  const at = (t: number, pace: 'slow' | 'fast') => signalFrame('walking', t, pace).figure.join('\n')
  assert.notEqual(at(0, 'slow'), at(FRAME_MS.slow, 'slow'))
  assert.equal(at(0, 'slow'), at(2 * FRAME_MS.slow, 'slow'))
  // fast swaps frames twice as often: half the slow interval already shows the other frame
  assert.notEqual(at(0, 'fast'), at(FRAME_MS.fast, 'fast'))
  assert.equal(at(0, 'slow'), at(FRAME_MS.fast, 'slow'))
  assert.ok(FRAME_MS.fast < FRAME_MS.slow)
})

test('standing figures do not move; a failed one blinks', () => {
  for (const light of ['waiting', 'idle'] as const) {
    assert.deepEqual(signalFrame(light, 0, 'slow'), signalFrame(light, FRAME_MS.slow, 'slow'))
  }
  assert.notEqual(signalFrame('failed', 0, 'slow').tone, signalFrame('failed', FRAME_MS.slow, 'slow').tone)
  assert.equal(signalFrame('walking', 0, 'slow').tone, 'success')
  assert.equal(signalFrame('waiting', 0, 'slow').tone, 'warning') // amber: needs you and failed never share a colour
  assert.equal(signalFrame('idle', 0, 'slow').tone, 'subtle')
  // walking and standing are different drawings
  assert.notDeepEqual(signalFrame('walking', 0, 'slow').figure, signalFrame('idle', 0, 'slow').figure)
})

test('the pace is fast once most of the steps are done, slow otherwise', () => {
  assert.equal(signalPace(row({})), 'slow')
  assert.equal(signalPace(row({ todo: { done: 1, total: 4 } })), 'slow')
  assert.equal(signalPace(row({ todo: { done: 3, total: 4 } })), 'fast')
  assert.equal(signalPace(row({ todo: { done: 0, total: 0 } })), 'slow')
  assert.equal(signalPace(row({ light: 'waiting', todo: { done: 4, total: 4 } })), 'slow')
  assert.equal(signalPace(undefined), 'slow')
})

test('the lead card: what needs you or failed first, then the longest running', () => {
  const a = row({ key: 'A-1', sinceMs: 5 })
  const b = row({ key: 'B-1', sinceMs: 1 })
  const c = row({ key: 'C-1', light: 'waiting', sinceMs: 9 })
  assert.equal(leadOf([a, b])?.key, 'B-1')
  assert.equal(leadOf([a, b, c])?.key, 'C-1')
  assert.equal(leadOf([row({ light: 'done' })]), undefined)
  assert.equal(leadOf([]), undefined)
})

test('the signal box: figure on the left, the card and a countdown of steps on the right', () => {
  const lines = signalLines(row({ title: 'Terminal pedestrian signal', todo: { done: 1, total: 4 } }), 12 * 60_000, 44)
  assert.equal(lines.length, SIGNAL_ROWS)
  const text = lines.map((l) => plain(l.left)).join('\n')
  assert.ok(text.includes('WALK-179'))
  assert.ok(text.includes('Terminal pedestrian'))
  assert.ok(text.includes('walking'))
  assert.ok(text.includes('3 steps left'))
  assert.ok(lines.every((l) => l.box?.id === lines[0]?.box?.id && l.box?.tone === 'success'))
  // without a step list the number is the minutes it has run
  assert.ok(signalLines(row({}), 12 * 60_000, 44).some((l) => plain(l.left).includes('12m')))
  // near the end it says so
  assert.ok(signalLines(row({ todo: { done: 3, total: 4 } }), 0, 44).some((l) => plain(l.left).includes('hurry')))
})

test('quiet: a grey man standing, no made-up card', () => {
  const lines = signalLines(undefined, 0, 44)
  assert.equal(lines.length, SIGNAL_ROWS)
  const text = lines.map((l) => plain(l.left)).join('\n')
  assert.ok(text.includes('quiet'))
  assert.ok(!/[A-Z]+-\d+/.test(text))
  assert.equal(lines[0]?.box?.tone, 'subtle')
})

test('a long title is cut to the pane, never wrapped', () => {
  const long = 'x'.repeat(200)
  for (const l of signalLines(row({ title: long }), 0, 40)) assert.ok([...plain(l.left)].length <= 36, plain(l.left))
})

test('the figure is the Taiwan green man: side view, 10 cells wide and 7 rows tall', () => {
  assert.equal(SIGNAL_ROWS, 7)
  const walk = signalFrame('walking', 0, 'slow').figure
  assert.equal(walk.length, 7)
  assert.ok(walk.every((l) => [...l].length === 10))
  // a stride: the bottom row has a foot at both edges (back foot left, front foot right)
  const feet = walk[6] as string
  assert.notEqual(feet[0], ' ')
  assert.notEqual(feet[9], ' ')
  // side view, not a mirror image: the walking figure is not symmetric
  assert.ok(walk.some((l) => l !== [...l].reverse().join('').replace(/▀|▄|█/g, (c) => c)))
})

test('the countdown: two big amber digits, right aligned, like the light above the man', () => {
  const d = bigDigits(20)
  assert.equal(d.length, 3)
  assert.ok(d.every((l) => [...l].length === 7))
  assert.notDeepEqual(bigDigits(20), bigDigits(21))
  assert.ok(bigDigits(7).every((l) => l.startsWith('   '))) // one digit: the tens place stays dark
  assert.deepEqual(bigDigits(150), bigDigits(99)) // two digits at most
  const lines = signalLines(row({ todo: { done: 1, total: 4 } }), 0, 44)
  const digits = lines.slice(0, 3).map((l) => l.left.find((x) => /[█▀▄]/.test(x.text) && l.left.indexOf(x) > 0))
  assert.ok(digits.every((x) => x?.tone === 'warning'))
  // quiet: no number at all
  assert.ok(signalLines(undefined, 0, 44).slice(0, 3).every((l) => l.left.slice(1).every((x) => !/[█▀▄]/.test(x.text))))
})

test('one countdown number for every surface: steps left while a step list runs, else the minutes', () => {
  assert.equal(signalNumber(row({ todo: { done: 1, total: 4 } }), 0), 3)
  assert.equal(signalNumber(row({}), 12 * 60_000 + 30_000), 12)
  assert.equal(signalNumber(row({ light: 'waiting', todo: { done: 1, total: 4 }, sinceMs: 0 }), 5 * 60_000), 5) // a stopped card counts minutes
  // the terminal's big digits show the same number
  assert.deepEqual(signalLines(row({ todo: { done: 1, total: 4 } }), 0, 44).slice(0, 3).map((l) => l.left[2]?.text), bigDigits(3))
})
