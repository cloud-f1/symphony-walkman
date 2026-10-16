// Shared types. core/* is pure: no I/O, no clock reads, no mods API.

export type Light = 'walking' | 'waiting' | 'failed' | 'done' | 'idle'

// symphony-workflow's Run states (src/symphony_workflow/runs.py), read from <KEY>/run.json.
export type RunState = 'created' | 'planning' | 'plan_ready' | 'implementing' | 'completed' | 'failed'

export type Card = {
  key: string // e.g. CF1-195
  slug: string // rest of the branch name, may be ''
  branch: string
  worktree: string // path the card was seen in
}

export type CardRow = Card & {
  light: Light
  runState?: RunState
  sinceMs: number // when the light last changed (epoch ms)
  title?: string // from the optional Jira lookup
  jiraStatus?: string
  why?: string // why it needs you, only from a known event (the tool waiting for approval, a question)
  todo?: { done: number; total: number } // the session's TodoWrite list, while the card runs
  agents?: AgentRow[] // the session's subagents (WALK-28), most recent first
}

export type AgentRow = { type: string; task: string; light: Light; sinceMs: number }

export type Disk = { freeGb: number; usedPct: number }

export const RUN_STATES: readonly RunState[] = ['created', 'planning', 'plan_ready', 'implementing', 'completed', 'failed']
