import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRecordName, otherSessionLights, parsePs, parseRecord, worktreeOf } from '../core/sessions.ts'
import type { SessionRecord } from '../core/sessions.ts'

const rec = (over: Partial<SessionRecord>): SessionRecord => ({ pid: 100, sessionId: 's-1', cwd: '/r/.claude/worktrees/a', status: 'busy', since: 1_000, ...over })

test('only <pid>.json records are read, never the .key files beside them', () => {
  assert.equal(isRecordName('2841.json'), true)
  assert.equal(isRecordName('2841.6ac3f437c1b78391.key'), false)
  assert.equal(isRecordName('../2841.json'), false)
  assert.equal(isRecordName('x.json'), false)
})

test('a record parses to pid, session, folder, status and when the status changed; anything else is skipped', () => {
  const text = JSON.stringify({ pid: 2841, sessionId: 'abc', cwd: '/r/w', status: 'waiting', statusUpdatedAt: 1760600000000, name: 'x', messagingSocketPath: '/tmp/s' })
  assert.deepEqual(parseRecord(text), { pid: 2841, sessionId: 'abc', cwd: '/r/w', status: 'waiting', since: 1760600000000 })
  assert.equal(parseRecord('not json'), undefined)
  assert.equal(parseRecord(JSON.stringify({ pid: 'x', cwd: '/r' })), undefined)
  assert.equal(parseRecord(JSON.stringify({ pid: 1, cwd: 'relative' })), undefined)
  assert.equal(parseRecord(JSON.stringify({ pid: 1, cwd: '/r' }))?.status, 'unknown')
})

test('ps output gives the live pids', () => {
  assert.deepEqual([...parsePs('  2841\n 75432\n\nbad\n')].sort(), [2841, 75432])
})

test('a folder belongs to the deepest worktree that holds it', () => {
  const trees = ['/r', '/r/.claude/worktrees/a', '/r/.claude/worktrees/ab']
  assert.equal(worktreeOf('/r/.claude/worktrees/a/src', trees), '/r/.claude/worktrees/a')
  assert.equal(worktreeOf('/r/.claude/worktrees/ab', trees), '/r/.claude/worktrees/ab')
  assert.equal(worktreeOf('/r/docs', trees), '/r')
  assert.equal(worktreeOf('/other', trees), undefined)
})

test('live sessions light their worktree: busy runs, waiting needs you; dead, idle and own sessions do not', () => {
  const trees = ['/r', '/r/.claude/worktrees/a', '/r/.claude/worktrees/b', '/r/.claude/worktrees/c']
  const lights = otherSessionLights(
    [
      rec({ pid: 1, sessionId: 'one', cwd: '/r/.claude/worktrees/a', status: 'busy', since: 10 }),
      rec({ pid: 2, sessionId: 'two', cwd: '/r/.claude/worktrees/b/src', status: 'waiting', since: 20 }),
      rec({ pid: 3, sessionId: 'dead', cwd: '/r/.claude/worktrees/c', status: 'busy' }),
      rec({ pid: 4, sessionId: 'quiet', cwd: '/r/.claude/worktrees/c', status: 'idle' }),
      rec({ pid: 5, sessionId: 'me', cwd: '/r/.claude/worktrees/c', status: 'busy' }),
    ],
    new Set([1, 2, 4, 5]),
    trees,
    'me',
  )
  assert.deepEqual(lights.get('/r/.claude/worktrees/a'), { light: 'walking', sinceMs: 10 })
  assert.deepEqual(lights.get('/r/.claude/worktrees/b'), { light: 'waiting', sinceMs: 20 })
  assert.equal(lights.has('/r/.claude/worktrees/c'), false)
})

test('two sessions in one worktree: needs-you wins over running', () => {
  const lights = otherSessionLights([rec({ pid: 1, sessionId: 'x', status: 'busy' }), rec({ pid: 2, sessionId: 'y', status: 'waiting', since: 5 })], new Set([1, 2]), ['/r/.claude/worktrees/a'], undefined)
  assert.equal(lights.get('/r/.claude/worktrees/a')?.light, 'waiting')
})
