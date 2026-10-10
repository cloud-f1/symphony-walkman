import type { CardRow, Disk, Light } from './contracts.ts'

const GLYPH: Record<Light, string> = { walking: '🟢', waiting: '🔴', failed: '🔴', done: '✓ ', idle: '· ' }
const LABEL: Record<Light, string> = { walking: 'running', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'idle' }

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function summary(rows: readonly CardRow[]): string {
  const n = (l: Light) => rows.filter((r) => r.light === l).length
  const parts = [`${n('walking')} running`, `${n('done')} done`]
  if (n('waiting') > 0) parts.push(`${n('waiting')} needs you`)
  if (n('failed') > 0) parts.push(`${n('failed')} failed`)
  return parts.join(' · ')
}

// One line for the band above the prompt: the most urgent card first.
export function renderBand(rows: readonly CardRow[], now: number): string {
  if (rows.length === 0) return ''
  const order: Light[] = ['failed', 'waiting', 'walking', 'done', 'idle']
  const lead = [...rows].sort((a, b) => order.indexOf(a.light) - order.indexOf(b.light))[0] as CardRow
  const more = rows.length > 1 ? `  (+${rows.length - 1})` : ''
  return `${GLYPH[lead.light]} ${lead.key} ${LABEL[lead.light]} ${formatElapsed(now - lead.sinceMs)}${more}`
}

export function renderBoard(rows: readonly CardRow[], disk: Disk | undefined, now: number): string[] {
  const lines = rows.map((r) => {
    const slug = r.slug === '' ? '' : r.slug.slice(0, 28)
    const state = r.runState ?? LABEL[r.light]
    return `${GLYPH[r.light]} ${r.key.padEnd(9)} ${slug.padEnd(28)} ${state.padEnd(13)} ${formatElapsed(now - r.sinceMs)}`
  })
  if (rows.length === 0) lines.push('No card branch found. Work in a CF1-<n>-<slug> branch to light a card.')
  if (disk) lines.push('', `disk · ${disk.freeGb} GB free · ${disk.usedPct}% used`)
  lines.push('', summary(rows))
  return lines
}
