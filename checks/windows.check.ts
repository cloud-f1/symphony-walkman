import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePsDrive } from '../core/disk.ts'
import { normalizePath, parseRecord, parseTasklist, worktreeOf } from '../core/sessions.ts'

test('Windows disk: PowerShell prints free and used bytes of the drive, one per line (WALK-30)', () => {
  assert.deepEqual(parsePsDrive('107374182400\r\n429496729600\r\n'), { freeGb: 100, usedPct: 80 })
  assert.equal(parsePsDrive(''), undefined)
  assert.equal(parsePsDrive('x\ny\n'), undefined)
  assert.equal(parsePsDrive('0\n0\n'), undefined)
})

test('Windows paths: backslashes become slashes and the drive letter is lower case, so git and session paths meet', () => {
  assert.equal(normalizePath('C:\\Users\\me\\repo\\.claude\\worktrees\\a'), 'c:/Users/me/repo/.claude/worktrees/a')
  assert.equal(normalizePath('C:/Users/me/repo'), 'c:/Users/me/repo')
  assert.equal(normalizePath('/r/a'), '/r/a')
  assert.equal(worktreeOf('C:\\Users\\me\\repo\\.claude\\worktrees\\a\\src', ['C:/Users/me/repo', 'C:/Users/me/repo/.claude/worktrees/a']), 'C:/Users/me/repo/.claude/worktrees/a')
})

test('Windows session records: a drive-letter folder is a valid record folder', () => {
  assert.equal(parseRecord(JSON.stringify({ pid: 12, cwd: 'C:\\Users\\me\\repo', status: 'busy' }))?.cwd, 'C:\\Users\\me\\repo')
  assert.equal(parseRecord(JSON.stringify({ pid: 12, cwd: 'repo', status: 'busy' })), undefined)
})

test('Windows liveness: tasklist CSV gives the live pids', () => {
  const out = '"claude.exe","4120","Console","1","210,000 K"\r\n"node.exe","77","Console","1","50,000 K"\r\nINFO: No tasks are running which match the specified criteria.\r\n'
  assert.deepEqual([...parseTasklist(out)].sort((a, b) => a - b), [77, 4120])
})
