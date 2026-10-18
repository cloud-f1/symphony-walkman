import { test } from 'node:test'
import assert from 'node:assert/strict'
import { touchedWorktree } from '../core/touch.ts'

const TREES = ['/repo/.worktrees/WALK-197-lights', '/repo/.worktrees/WALK-19-old', '/repo/.claude/worktrees/walk-20-x']

test('a file path inside a card worktree names that card', () => {
  assert.equal(touchedWorktree({ file_path: '/repo/.worktrees/WALK-197-lights/core/touch.ts' }, TREES), '/repo/.worktrees/WALK-197-lights')
  assert.equal(touchedWorktree({ notebook_path: '/repo/.claude/worktrees/walk-20-x/a.ipynb' }, TREES), '/repo/.claude/worktrees/walk-20-x')
  assert.equal(touchedWorktree({ path: '/repo/.worktrees/WALK-19-old' }, TREES), '/repo/.worktrees/WALK-19-old')
})

test('a command that works in a card worktree names it (cd, a path argument)', () => {
  assert.equal(touchedWorktree({ command: 'cd /repo/.worktrees/WALK-197-lights && npm test' }, TREES), '/repo/.worktrees/WALK-197-lights')
  assert.equal(touchedWorktree({ command: 'git -C "/repo/.worktrees/WALK-19-old" status' }, TREES), '/repo/.worktrees/WALK-19-old')
})

test('a prefix is not a match: WALK-19 is not WALK-197', () => {
  assert.equal(touchedWorktree({ file_path: '/repo/.worktrees/WALK-197-lights/x' }, ['/repo/.worktrees/WALK-19']), undefined)
  assert.equal(touchedWorktree({ command: 'ls /repo/.worktrees/WALK-19-older' }, TREES), undefined)
})

test('nothing in a card: no match; the repo root itself is not a card', () => {
  assert.equal(touchedWorktree({ file_path: '/repo/README.md' }, TREES), undefined)
  assert.equal(touchedWorktree({ command: 'npm test' }, TREES), undefined)
  assert.equal(touchedWorktree({}, TREES), undefined)
  assert.equal(touchedWorktree({ file_path: 42, command: null }, TREES), undefined)
  assert.equal(touchedWorktree({ file_path: '/repo/.worktrees/WALK-197-lights/x' }, []), undefined)
})

test('a nested worktree wins over the one around it (the longest match)', () => {
  const nested = ['/repo/.worktrees/A-1-x', '/repo/.worktrees/A-1-x/inner/B-2-y']
  assert.equal(touchedWorktree({ file_path: '/repo/.worktrees/A-1-x/inner/B-2-y/f.ts' }, nested), '/repo/.worktrees/A-1-x/inner/B-2-y')
})
