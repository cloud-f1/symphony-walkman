// Today's tally from the desktop pet (cloud-f1/walkman-pet, src-tauri/src/today.rs): ~/.walkman/pet/today.json holds the
// local day, the time at the desk and the breaks taken. The pane shows it as one quiet line. Pure: the hook reads the file
// and passes the clock. The file is untrusted input: every field is checked, and a file that is not today's or has not
// been rewritten lately (the pet writes at least once a minute while it runs) is nothing, so a pet that quit drops out.
import type { PaneLine } from './style.ts'

export const PET_TODAY_SCHEMA = 1
export const PET_TODAY_FRESH_MS = 3 * 60_000
const FUTURE_MS = 60_000 // a little clock skew between the two is fine; more is a file not to trust
const MAX_DESK_MS = 24 * 60 * 60_000

export type PetToday = { deskMs: number; breaks: number }

export function petTodayPath(home: string): string | undefined {
  const h = home.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^(?:\/|[A-Za-z]:\/)/.test(h) ? `${h}/.walkman/pet/today.json` : undefined
}

export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function parsePetToday(raw: string, now: number, today: string): PetToday | undefined {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const int = (x: unknown, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max
  if (o.schema !== PET_TODAY_SCHEMA || o.day !== today) return undefined
  if (!int(o.deskMs, MAX_DESK_MS) || !int(o.breaks, 10_000) || !int(o.writtenAt, Number.MAX_SAFE_INTEGER)) return undefined
  if (now - o.writtenAt > PET_TODAY_FRESH_MS || o.writtenAt - now > FUTURE_MS) return undefined
  return { deskMs: o.deskMs, breaks: o.breaks }
}

function hoursAndMinutes(ms: number): string {
  const min = Math.floor(ms / 60_000)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function petTodayLine(t: PetToday): PaneLine {
  return {
    left: [
      { text: 'today at the desk ', tone: 'subtle' },
      { text: hoursAndMinutes(t.deskMs), tone: 'text' },
      { text: ` · ${t.breaks} ${t.breaks === 1 ? 'break' : 'breaks'}`, tone: 'subtle' },
    ],
  }
}
