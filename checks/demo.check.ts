import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY_MS, SCENES, demoRows } from '../core/demo.ts'
import type { Light } from '../core/contracts.ts'

const NOW = 1_000_000
const lights = (scene: number, t: number) => demoRows(scene, NOW - t, NOW).map((r) => r.light)
const count = (ls: Light[], l: Light) => ls.filter((x) => x === l).length

test('seven scenes, each with a name, numbered from 1', () => {
  assert.equal(SCENES.length, 7)
  for (const s of SCENES) assert.ok(s.name.length > 0)
  assert.deepEqual(demoRows(0, NOW, NOW), [])
  assert.deepEqual(demoRows(8, NOW, NOW), [])
})

test('every made-up card says it is a demo: DEMO-n keys, a branch and a title', () => {
  for (let n = 1; n <= 7; n++) {
    for (const r of demoRows(n, NOW - 5_000, NOW)) {
      assert.match(r.key, /^DEMO-\d+$/)
      assert.ok(r.branch.startsWith(r.key + '-'))
      assert.ok((r.title ?? '').length > 0)
      assert.ok(r.sinceMs <= NOW)
    }
  }
})

test('the scenes cover every state', () => {
  assert.deepEqual(lights(1, 0), ['idle']) // dawn: nothing is running
  assert.deepEqual(lights(2, 0), ['walking'])
  const sprint = demoRows(3, NOW, NOW)[0]
  assert.equal(sprint?.light, 'walking')
  assert.ok((sprint?.todo?.done ?? 0) / (sprint?.todo?.total ?? 1) >= 0.75) // fast enough to hurry
  assert.equal(count(lights(4, 0), 'waiting'), 1)
  assert.equal(count(lights(4, 0), 'walking'), 1)
  assert.equal(count(lights(5, 0), 'failed'), 1)
  assert.equal(count(lights(5, 0), 'walking'), 2)
  assert.equal(count(lights(6, 0), 'walking'), 11) // rush hour: more than the playground holds
})

test('a needs-you card says why, from the same words a real one uses', () => {
  const waiting = demoRows(4, NOW, NOW).find((r) => r.light === 'waiting')
  assert.ok((waiting?.why ?? '').length > 0)
})

test('a day in the life: start, one stops for you, one falls, one finishes, quiet, and again', () => {
  const at = (t: number) => lights(7, t)
  assert.equal(count(at(1_000), 'walking'), 3)
  assert.equal(count(at(9_000), 'waiting'), 1)
  assert.equal(count(at(15_000), 'failed'), 1)
  assert.ok(count(at(21_000), 'done') >= 1)
  assert.deepEqual(at(DAY_MS - 1_000).filter((l) => l !== 'done' && l !== 'idle'), []) // the quiet end
  assert.deepEqual(at(DAY_MS + 1_000), at(1_000)) // the day starts over
})
