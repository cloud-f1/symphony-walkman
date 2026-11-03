import type { Card, Light } from './contracts.ts'

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

// Between two turns a session that waits for its subagents or a background shell is not idle: the card keeps walking,
// so its runner, its timer and its light do not stop and restart every time the model finishes a turn.
export const lightWhileWorking = (light: Light, working: boolean): Light => (working && light === 'idle' ? 'walking' : light)

// The subagents that count as work going: running ones first seen less than `maxAgeMs` ago. The host once kept an old
// subagent listed as running for 42 hours; it stays in the list but must not keep a card walking for days.
export function agentsAtWork<T extends { light: Light; sinceMs: number }>(agents: readonly T[], now: number, maxAgeMs: number): T[] {
  return agents.filter((a) => a.light === 'walking' && now - a.sinceMs < maxAgeMs)
}

// While a session's subagents or its background shell run, the card counts from the oldest of them: a new turn (a task
// notification, a queued message) restarts the light's own clock, but not the work that was already going. A shell
// that began at 0 has no known start and is ignored.
export function sinceWithWork(sinceMs: number, work: { agentsSince: readonly number[]; shellSince?: number }): number {
  const starts = [...work.agentsSince, ...(work.shellSince !== undefined && work.shellSince > 0 ? [work.shellSince] : [])]
  return Math.min(sinceMs, ...starts)
}

// A card with two worktrees (a rework beside the first try) is one card: keep one row per key. The most active light
// wins (needs you, failed, running, done, idle), then a worktree the session itself stands in, then the first listed.
const WEIGHT: Record<Light, number> = { waiting: 4, failed: 3, walking: 2, done: 1, idle: 0 }
export function onePerCard<T extends { key: string; light: Light; worktree: string }>(rows: readonly T[], homes: readonly (string | undefined)[]): T[] {
  const best = new Map<string, T>()
  for (const r of rows) {
    const had = best.get(r.key)
    const home = (x: T) => (homes.includes(x.worktree) ? 1 : 0)
    if (!had || WEIGHT[r.light] > WEIGHT[had.light] || (WEIGHT[r.light] === WEIGHT[had.light] && home(r) > home(had))) best.set(r.key, r)
  }
  return rows.filter((r) => best.get(r.key) === r)
}
