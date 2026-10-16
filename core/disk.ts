import type { Disk } from './contracts.ts'

// Parses `df -Pk <path>` (POSIX format, 1K blocks): last line, columns Available and Capacity.
export function parseDf(stdout: string): Disk | undefined {
  const lines = stdout.trim().split('\n')
  const cols = (lines[lines.length - 1] ?? '').trim().split(/\s+/)
  if (lines.length < 2 || cols.length < 5) return undefined
  const availableKb = Number(cols[3])
  const used = Number((cols[4] ?? '').replace('%', ''))
  if (!Number.isFinite(availableKb) || !Number.isFinite(used)) return undefined
  return { freeGb: Math.round(availableKb / 1024 / 1024), usedPct: used }
}

// Windows (WALK-30): `(Get-PSDrive C).Free; (Get-PSDrive C).Used` prints free then used bytes, one per line.
export function parsePsDrive(stdout: string): Disk | undefined {
  const [free, used] = stdout.trim().split(/\r?\n/).map((l) => Number(l.trim()))
  if (free === undefined || used === undefined || !Number.isFinite(free) || !Number.isFinite(used) || free + used <= 0) return undefined
  return { freeGb: Math.round(free / 1024 ** 3), usedPct: Math.round((used / (free + used)) * 100) }
}
