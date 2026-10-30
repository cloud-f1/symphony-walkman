import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardFromBranch, onePerCard, parseWorktrees } from '../core/card.ts'
import { deriveLight, parseRunState } from '../core/lights.ts'
import { parseDf } from '../core/disk.ts'
import { formatElapsed, renderBand, renderBoard, summary } from '../core/board.ts'
import { signalSvg } from '../core/svg.ts'
import type { CardRow } from '../core/contracts.ts'

const row = (over: Partial<CardRow>): CardRow => ({ key: 'CF1-1', slug: 's', branch: 'CF1-1-s', worktree: '/w', light: 'walking', sinceMs: 0, ...over })

test('a card with two worktrees is one row: the most active light wins, then the session home, then the first', () => {
  const a = row({ key: 'CAN-292', worktree: '/w/a', light: 'idle' })
  const b = row({ key: 'CAN-292', worktree: '/w/b', light: 'walking' })
  const c = row({ key: 'CAN-297', worktree: '/w/c', light: 'idle' })
  const d = row({ key: 'CAN-297', worktree: '/w/d', light: 'idle' })
  assert.deepEqual(onePerCard([a, b, c, d], []), [b, c]) // running beats idle; a tie keeps the first
  assert.deepEqual(onePerCard([a, b, c, d], ['/w/d']), [b, d]) // a tie goes to the worktree the session stands in
  assert.deepEqual(onePerCard([row({ key: 'X-1', light: 'walking' }), row({ key: 'X-1', worktree: '/w/2', light: 'waiting' })], ['/w']).map((r) => r.light), ['waiting']) // needs you beats the home worktree
  assert.equal(onePerCard([], []).length, 0)
})

test('card from branch: key, slug, and non-card branches', () => {
  assert.deepEqual(cardFromBranch('CF1-195-devopsday-visuals', '/w'), { key: 'CF1-195', slug: 'devopsday-visuals', branch: 'CF1-195-devopsday-visuals', worktree: '/w' })
  assert.equal(cardFromBranch('CF1-7')?.slug, '')
  assert.equal(cardFromBranch('main'), undefined)
  assert.equal(cardFromBranch('chore-tidy-rules'), undefined)
  assert.equal(cardFromBranch('feature/CF1-1-x'), undefined)
})

test('parseWorktrees skips detached and bare entries', () => {
  const porcelain = 'worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-2-a\n\nworktree /x\nHEAD 1\ndetached\n\nworktree /bare\nbare\n'
  assert.deepEqual(parseWorktrees(porcelain), [{ path: '/r', branch: 'main' }, { path: '/r/.claude/worktrees/a', branch: 'CF1-2-a' }])
})

test('light priority: failed > waiting > walking > done > idle', () => {
  const base = { isWorking: false, askPending: false, lastTurnFailed: false }
  assert.equal(deriveLight(base), 'idle')
  assert.equal(deriveLight({ ...base, isWorking: true }), 'walking')
  assert.equal(deriveLight({ ...base, isWorking: true, askPending: true }), 'waiting')
  assert.equal(deriveLight({ ...base, runState: 'plan_ready' }), 'waiting')
  assert.equal(deriveLight({ ...base, runState: 'implementing' }), 'walking')
  assert.equal(deriveLight({ ...base, runState: 'completed' }), 'done')
  assert.equal(deriveLight({ ...base, askPending: true, lastTurnFailed: true }), 'failed')
  assert.equal(deriveLight({ ...base, runState: 'failed', isWorking: true }), 'failed')
})

test('parseRunState accepts only known states and survives bad json', () => {
  assert.equal(parseRunState('{"state":"plan_ready","id":"x"}'), 'plan_ready')
  assert.equal(parseRunState('{"state":"bogus"}'), undefined)
  assert.equal(parseRunState('not json'), undefined)
  assert.equal(parseRunState('{}'), undefined)
})

test('parseDf reads POSIX df output and rejects junk', () => {
  const out = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 488245288 400000000 77594624 84% /\n'
  assert.deepEqual(parseDf(out), { freeGb: 74, usedPct: 84 })
  assert.equal(parseDf(''), undefined)
  assert.equal(parseDf('only one line'), undefined)
  assert.equal(parseDf('h\na b c d e'), undefined)
})

test('elapsed and summary', () => {
  assert.equal(formatElapsed(24_000), '0:24')
  assert.equal(formatElapsed(125_000), '2:05')
  assert.equal(formatElapsed(-5), '0:00')
  assert.equal(summary([row({}), row({ light: 'walking' }), row({ light: 'done' }), row({ light: 'waiting' })]), '2 running · 1 done · 1 needs you')
})

test('band leads with the most urgent card', () => {
  const rows = [row({ key: 'CF1-1', light: 'walking' }), row({ key: 'CF1-2', light: 'waiting' })]
  assert.match(renderBand(rows, 65_000), /^🔴 CF1-2 needs you 1:05 {2}\(\+1\)$/)
  assert.equal(renderBand([], 0), '')
})

test('board shows disk and an empty-state hint', () => {
  const lines = renderBoard([row({})], { freeGb: 74, usedPct: 84 }, 24_000)
  assert.ok(lines.some((l) => l.includes('disk · 74 GB free')))
  assert.ok(lines[0]?.includes('CF1-1'))
  assert.ok(renderBoard([], undefined, 0)[0]?.includes('No card branch found'))
})

test('svg: color per light, clamped countdown, nothing else injectable', () => {
  assert.match(signalSvg('walking', 7), />07</)
  assert.match(signalSvg('walking', 7), /#22c55e/)
  assert.match(signalSvg('waiting', 7), /#f59e0b/) // amber like the terminal: needs you and failed never share a colour
  assert.match(signalSvg('failed', 7), /#ef4444/)
  assert.match(signalSvg('failed', 7), /<animate attributeName="opacity"/)
  assert.match(signalSvg('walking', 5000), />99</)
  assert.match(signalSvg('walking', NaN), />00</)
  assert.ok(!signalSvg('walking', 3).includes('<script'))
})

test('svg: the Taiwan man in side view, like the terminal: head forward, a leaning body, swinging limbs; standing upright', () => {
  const walk = signalSvg('walking', 3)
  assert.match(walk, /data-figure="side-walk"/)
  assert.ok((walk.match(/<animateTransform/g) ?? []).length >= 4, 'two legs and two arms swing')
  const head = /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/.exec(walk)
  const hip = /data-hip="(-?[\d.]+)"/.exec(walk)
  assert.ok(Number(head?.[1]) > Number(hip?.[1]), 'the head is ahead of the hips: a forward lean')
  const stand = signalSvg('idle', 0)
  assert.match(stand, /data-figure="side-stand"/)
  assert.ok(!stand.includes('animateTransform'))
})
