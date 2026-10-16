import type { Light } from './contracts.ts'

// Other Claude Code sessions on this machine. Claude Code keeps one record per running session in
// ~/.claude/sessions/<pid>.json (internal and undocumented; switchboard reads it the same way). The folder also
// holds <pid>.<hash>.key files, which must never be read: only names matching isRecordName are opened.

export type SessionRecord = { pid: number; sessionId: string; cwd: string; status: string; since: number }

export const isRecordName = (name: string): boolean => /^\d{1,10}\.json$/.test(name)

// Only the fields the board needs; a record that does not have them is skipped, never an error.
export function parseRecord(text: string): SessionRecord | undefined {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(text) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (!d || typeof d !== 'object') return undefined
  const pid = d.pid
  const cwd = d.cwd
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined
  if (typeof cwd !== 'string' || !/^(?:\/|[A-Za-z]:[\\/])/.test(cwd)) return undefined // POSIX, or a Windows drive
  return {
    pid,
    sessionId: typeof d.sessionId === 'string' ? d.sessionId : '',
    cwd,
    status: typeof d.status === 'string' ? d.status : 'unknown',
    since: typeof d.statusUpdatedAt === 'number' ? d.statusUpdatedAt : 0,
  }
}

// `ps -o pid= -p a,b,c` prints one live pid per line.
export function parsePs(out: string): Set<number> {
  const live = new Set<number>()
  for (const line of out.split('\n')) {
    const n = Number(line.trim())
    if (line.trim() !== '' && Number.isInteger(n) && n > 0) live.add(n)
  }
  return live
}

// One spelling for a path, so git's `C:/x` and a session's `C:\\x` meet: slashes, lower-case drive letter.
export const normalizePath = (p: string): string => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d: string) => d.toLowerCase() + ':')

// The deepest worktree that holds the folder (a session can sit in a subfolder of its card). Returns the worktree as given.
export function worktreeOf(cwd: string, worktrees: readonly string[]): string | undefined {
  const c = normalizePath(cwd)
  let best: string | undefined
  for (const w of worktrees) {
    const n = normalizePath(w)
    if ((c === n || c.startsWith(n + '/')) && (!best || n.length > normalizePath(best).length)) best = w
  }
  return best
}

// Windows liveness (WALK-30): `tasklist /FO CSV /NH` prints one quoted CSV row per process, the pid second.
export function parseTasklist(out: string): Set<number> {
  const live = new Set<number>()
  for (const line of out.split(/\r?\n/)) {
    const m = /^"[^"]*","(\d+)"/.exec(line.trim())
    if (m) live.add(Number(m[1]))
  }
  return live
}

const STATUS_LIGHT: Record<string, Light> = { busy: 'walking', waiting: 'waiting' }

// The lights other live sessions give their worktrees: busy is running, waiting needs you; idle gives none.
// This session's own record is left out (its own signals are finer), and needs-you wins in a shared worktree.
export function otherSessionLights(records: readonly SessionRecord[], alive: ReadonlySet<number>, worktrees: readonly string[], ownSessionId: string | undefined): Map<string, { light: Light; sinceMs: number }> {
  const out = new Map<string, { light: Light; sinceMs: number }>()
  for (const r of records) {
    if (!alive.has(r.pid) || (ownSessionId && r.sessionId === ownSessionId)) continue
    const light = STATUS_LIGHT[r.status]
    const tree = light ? worktreeOf(r.cwd, worktrees) : undefined
    if (!light || !tree) continue
    const had = out.get(tree)
    if (!had || (had.light !== 'waiting' && light === 'waiting')) out.set(tree, { light, sinceMs: r.since })
  }
  return out
}
