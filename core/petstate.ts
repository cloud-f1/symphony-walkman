// The state file the desktop pet reads (docs/PET-PLAN.md, decision 4). Pure: the hook does the writing.
// One file per Claude Code session, ~/.walkman/state/<session>.json, because a Mod instance knows only its own session.
// The Mod cannot delete a file, so a file that stops being rewritten is dead: the pet ignores one older than
// PET_STALE_MS and removes it. It holds no secret: card key, light, the reason the pane already shows, steps, the Jira
// title the pane already shows, counts. Never a tool input, a path of a file, or a token.
import type { CardRow, Light } from './contracts.ts'

export const PET_STATE_SCHEMA = 1
export const PET_BEAT_MS = 30_000 // an active card rewrites its file at least this often
export const PET_STALE_MS = 3 * PET_BEAT_MS // the pet treats an older file as a session that is gone

export type PetCard = {
  key: string
  light: Exclude<Light, 'idle' | 'done'>
  sinceMs: number
  why?: string
  steps?: { done: number; total: number }
  title?: string
  status?: string
  agents: number
}
export type PetState = { schema: typeof PET_STATE_SCHEMA; writtenAt: number; session: string; cards: PetCard[] }

// A session id from the engine becomes a file name: letters, digits, - and _ only, so it can never leave the folder.
export const isSafeSessionId = (id: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(id)

// Where the one file lives. Nothing is returned for an unsafe id or a home that is not an absolute path.
export function petStatePath(home: string, session: string): string | undefined {
  const h = home.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!/^(?:\/|[A-Za-z]:\/)/.test(h) || !isSafeSessionId(session)) return undefined
  return `${h}/.walkman/state/${session}.json`
}

const text = (s: string | undefined, max: number): string | undefined => {
  const t = (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
  return t === '' ? undefined : t
}

// Only a card that walks, waits or failed is the pet's business: an idle or done card draws nothing.
export function buildPetState(session: string, now: number, rows: readonly CardRow[]): PetState {
  const cards: PetCard[] = []
  for (const r of rows) {
    if (r.light !== 'walking' && r.light !== 'waiting' && r.light !== 'failed') continue
    const card: PetCard = { key: r.key, light: r.light, sinceMs: r.sinceMs, agents: r.agents?.filter((a) => a.light === 'walking').length ?? 0 }
    const why = text(r.why, 120)
    const title = text(r.title, 120)
    const status = text(r.jiraStatus, 40)
    if (why) card.why = why
    if (title) card.title = title
    if (status) card.status = status
    if (r.todo && r.todo.total > 0) card.steps = { done: r.todo.done, total: r.todo.total }
    cards.push(card)
  }
  return { schema: PET_STATE_SCHEMA, writtenAt: now, session, cards }
}

// The same cards, ignoring when it was written: a write is skipped while this has not changed (the heartbeat aside).
export const petStateKey = (s: PetState): string => JSON.stringify([s.session, s.cards])

export const petStateText = (s: PetState): string => JSON.stringify(s) + '\n'

// What the pet does with a file it reads: the cards of a live file, nothing for a bad, foreign-schema or stale one.
export function readPetState(raw: string, now: number): PetState | undefined {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return undefined
  }
  const o = v as Partial<PetState> | null
  if (!o || o.schema !== PET_STATE_SCHEMA || typeof o.writtenAt !== 'number' || typeof o.session !== 'string' || !Array.isArray(o.cards)) return undefined
  if (now - o.writtenAt > PET_STALE_MS) return undefined
  return o as PetState
}
