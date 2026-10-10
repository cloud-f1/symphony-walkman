import type { Light, RunState } from './contracts.ts'

export type Signals = {
  isWorking: boolean // a model turn is running in this card's worktree
  askPending: boolean // a permission ask is waiting for the person
  lastTurnFailed: boolean
  runState?: RunState // from symphony-workflow, when present
}

// Priority, highest first: failed > waiting (needs you) > walking > done > idle.
// A symphony run in plan_ready is the human-review gate, so it is always "needs you".
export function deriveLight(s: Signals): Light {
  if (s.runState === 'failed' || s.lastTurnFailed) return 'failed'
  if (s.askPending || s.runState === 'plan_ready') return 'waiting'
  if (s.isWorking || s.runState === 'planning' || s.runState === 'implementing') return 'walking'
  if (s.runState === 'completed') return 'done'
  return 'idle'
}

export function parseRunState(json: string): RunState | undefined {
  try {
    const state = (JSON.parse(json) as { state?: unknown }).state
    return typeof state === 'string' && ['created', 'planning', 'plan_ready', 'implementing', 'completed', 'failed'].includes(state)
      ? (state as RunState)
      : undefined
  } catch {
    return undefined
  }
}
