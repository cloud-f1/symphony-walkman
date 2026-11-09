import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PET_STALE_MS, buildPetState, isSafeSessionId, petStateKey, petStatePath, petStateText, readPetState } from '../core/petstate.ts'
import type { CardRow } from '../core/contracts.ts'

const row = (over: Partial<CardRow>): CardRow => ({ key: 'CAN-1', slug: 's', branch: 'CAN-1-s', worktree: '/r/w', light: 'walking', sinceMs: 1000, ...over })

test('the file lives under ~/.walkman/state, one per session, and an unsafe id or home gets no path', () => {
  assert.equal(petStatePath('/Users/a', 'abc-123_X'), '/Users/a/.walkman/state/abc-123_X.json')
  assert.equal(petStatePath('C:\\Users\\a\\', 'abc'), 'C:/Users/a/.walkman/state/abc.json')
  assert.equal(petStatePath('/Users/a', '../evil'), undefined)
  assert.equal(petStatePath('/Users/a', 'a/b'), undefined)
  assert.equal(petStatePath('/Users/a', ''), undefined)
  assert.equal(petStatePath('relative/home', 'abc'), undefined)
  assert.equal(petStatePath('', 'abc'), undefined)
  assert.equal(isSafeSessionId('x'.repeat(65)), false)
})

test('only walking, waiting and failed cards go in; idle and done draw nothing', () => {
  const s = buildPetState('s1', 5000, [row({ key: 'A-1', light: 'walking' }), row({ key: 'A-2', light: 'idle' }), row({ key: 'A-3', light: 'done' }), row({ key: 'A-4', light: 'waiting', why: 'Bash is waiting for your approval' }), row({ key: 'A-5', light: 'failed' })])
  assert.deepEqual(s.cards.map((c) => c.key), ['A-1', 'A-4', 'A-5'])
  assert.equal(s.schema, 1)
  assert.equal(s.writtenAt, 5000)
  assert.equal(s.session, 's1')
})

test('a card carries its reason, steps, title, Jira status and the count of subagents at work, trimmed and without control characters', () => {
  const agents = [{ type: 'g', task: 't', light: 'walking' as const, sinceMs: 1 }, { type: 'g', task: 't', light: 'idle' as const, sinceMs: 1 }]
  const [c] = buildPetState('s', 1, [row({ light: 'waiting', why: 'Bash is\nwaiting', title: '  Fix it  ', jiraStatus: 'In Progress', todo: { done: 2, total: 5 }, agents })]).cards
  assert.deepEqual(c, { key: 'CAN-1', light: 'waiting', sinceMs: 1000, agents: 1, why: 'Bash is waiting', title: 'Fix it', status: 'In Progress', steps: { done: 2, total: 5 } })
  const [d] = buildPetState('s', 1, [row({ title: ' ', todo: { done: 0, total: 0 } })]).cards
  assert.equal('title' in d, false)
  assert.equal('steps' in d, false)
})

test('own marks the cards of this session\'s worktrees and nothing else; the path itself never leaves the Mod', () => {
  const rows = [row({ key: 'A-1', worktree: '/r/mine' }), row({ key: 'A-2', worktree: '/r/other' }), row({ key: 'A-3', worktree: '/r/also-mine' })]
  const s = buildPetState('s', 1, rows, ['/r/mine', '/r/also-mine'])
  assert.deepEqual(s.cards.map((c) => [c.key, c.own === true]), [['A-1', true], ['A-2', false], ['A-3', true]])
  assert.equal('own' in s.cards[1], false)
  assert.equal(buildPetState('s', 1, rows).cards.some((c) => 'own' in c), false) // no trees given: no mark
  assert.equal(petStateText(s).includes('/r/'), false)
})

test('a write is skipped while only the written-at time changed', () => {
  const a = buildPetState('s', 1, [row({})])
  const b = buildPetState('s', 99, [row({})])
  const c = buildPetState('s', 99, [row({ light: 'waiting' })])
  assert.equal(petStateKey(a), petStateKey(b))
  assert.notEqual(petStateKey(a), petStateKey(c))
})

test('what the pet reads: a live file yes; a stale, foreign-schema, broken or half-written one no', () => {
  const live = petStateText(buildPetState('s', 10_000, [row({})]))
  assert.equal(readPetState(live, 10_000 + PET_STALE_MS)?.cards.length, 1)
  assert.equal(readPetState(live, 10_000 + PET_STALE_MS + 1), undefined)
  assert.equal(readPetState(live.replace('"schema":1', '"schema":2'), 10_000), undefined)
  assert.equal(readPetState('{"schema":1,"writtenAt":', 10_000), undefined)
  assert.equal(readPetState('null', 10_000), undefined)
  assert.equal(readPetState('{"schema":1,"writtenAt":1,"session":"s"}', 1), undefined)
})

test('the file text holds no tool input, path or secret: only the fields the pane already shows', () => {
  const text = petStateText(buildPetState('s', 1, [row({ worktree: '/Users/a/secret-repo', branch: 'CAN-1-secret', light: 'waiting', why: 'Bash is waiting for your approval' })]))
  assert.equal(text.includes('secret'), false)
  assert.equal(text.includes('/Users'), false)
})

// docs/petstate.example.json is the one example of the format, shared with the pet (cloud-f1/walkman-pet keeps a copy at
// src/domain/petstate.example.json). Both repos pin the same hash: a change to the format means editing the file and the
// hash here AND there, so the other side's test fails until it follows.
const EXAMPLE_SHA256 = '5c4dac53c91c9d8269c3bf7e343b6cdbd7db9da932ee87bb7618eec956006f89'

test('the shared example is exactly what buildPetState writes, and the pet-side copy must carry the same hash', async () => {
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const raw = readFileSync(new URL('../docs/petstate.example.json', import.meta.url), 'utf8')
  assert.equal(createHash('sha256').update(raw).digest('hex'), EXAMPLE_SHA256)
  const rows = [
    row({ key: 'CAN-812', light: 'waiting', sinceMs: 999000, why: 'Bash is waiting for your approval', title: 'Gate: e2e video', jiraStatus: 'In Progress' }),
    row({ key: 'CAN-7', light: 'walking', sinceMs: 990000, worktree: '/r/mine', todo: { done: 2, total: 5 }, agents: [{ type: 'g', task: 't', light: 'walking', sinceMs: 1 }, { type: 'g', task: 't', light: 'walking', sinceMs: 1 }] }),
    row({ key: 'CAN-9', light: 'failed', sinceMs: 980000 }),
    row({ key: 'CAN-1', light: 'idle' }),
  ]
  assert.equal(petStateText(buildPetState('abc-1', 1000000, rows, ['/r/mine'])), raw)
  assert.equal(readPetState(raw, 1000001)?.cards.length, 3)
})
