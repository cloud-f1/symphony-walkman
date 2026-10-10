import type { Card } from './contracts.ts'

// Branch convention (CAS rules/task-workflow.md): CF1-{n}-{slug}. Any Jira-style KEY-n prefix works.
const BRANCH = /^([A-Z][A-Z0-9]{1,9}-\d{1,6})(?:-(.*))?$/

export function cardFromBranch(branch: string, worktree = ''): Card | undefined {
  const m = BRANCH.exec(branch.trim())
  if (!m) return undefined
  return { key: m[1] as string, slug: m[2] ?? '', branch: branch.trim(), worktree }
}

// Parses `git worktree list --porcelain` into [path, branch] pairs; detached or bare entries are skipped.
export function parseWorktrees(porcelain: string): Array<{ path: string; branch: string }> {
  const out: Array<{ path: string; branch: string }> = []
  for (const block of porcelain.split(/\n\s*\n/)) {
    let path = ''
    let branch = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice(9).trim()
      else if (line.startsWith('branch ')) branch = line.slice(7).trim().replace(/^refs\/heads\//, '')
    }
    if (path !== '' && branch !== '') out.push({ path, branch })
  }
  return out
}
