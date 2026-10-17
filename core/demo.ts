import type { CardRow, Light } from './contracts.ts'

// Demo mode (WALK-193): seven scenes of made-up cards, so the signal, the cards and the playground can be watched in
// every state without real work. Pure: a scene is a function of how long it has been showing.

type Extra = Partial<Pick<CardRow, 'todo' | 'why' | 'runState'>>
const card = (n: number, slug: string, title: string, light: Light, sinceMs: number, extra: Extra = {}): CardRow => ({
  key: `DEMO-${n}`,
  slug,
  branch: `DEMO-${n}-${slug}`,
  worktree: `/demo/DEMO-${n}`,
  light,
  sinceMs,
  title,
  ...extra,
})

// The day in the life, one loop: three start, one stops for you, one falls, one finishes, then all is quiet.
export const DAY_MS = 32_000

const RUSH = [
  'Fix the login redirect', 'Pitch deck numbers', 'Invoice PDF export', 'Search the case names', 'Dark mode toggle',
  'Retry the webhook', 'Rename the env file', 'Cache the board', 'Sort the dates', 'Translate the README', 'Bump the pin',
]

export const SCENES: readonly { name: string; rows: (began: number, now: number) => CardRow[] }[] = [
  { name: 'Dawn', rows: (b) => [card(0, 'coffee', 'Coffee first', 'idle', b)] }, // one idle card: the pane says all quiet
  { name: 'Solo run', rows: (b) => [card(1, 'login', 'Fix the login redirect', 'walking', b, { todo: { done: 1, total: 5 } })] },
  { name: 'Final sprint', rows: (b) => [card(2, 'release', 'Ship the release notes', 'walking', b, { todo: { done: 4, total: 5 } })] },
  {
    name: 'Red light',
    rows: (b) => [
      card(3, 'migrate', 'Migrate the orders table', 'waiting', b, { why: 'Bash is waiting for your approval' }),
      card(4, 'docs', 'Write the API docs', 'walking', b, { todo: { done: 2, total: 6 } }),
    ],
  },
  {
    name: 'A fall',
    rows: (b) => [
      card(5, 'deploy', 'Deploy to staging', 'failed', b),
      card(6, 'tests', 'Flaky test hunt', 'walking', b, { todo: { done: 3, total: 7 } }),
      card(7, 'icons', 'Swap the icons', 'walking', b),
    ],
  },
  { name: 'Rush hour', rows: (b) => RUSH.map((t, i) => card(10 + i, `task${i + 1}`, t, 'walking', b - i * 7_000, { todo: { done: i % 5, total: 5 } })) },
  {
    name: 'A day in the life',
    rows: (b, now) => {
      const t = (now - b) % DAY_MS
      const start = now - t // when this loop began
      const at = (ms: number) => start + ms
      const steps = (ms: number, total: number) => ({ done: Math.min(total, Math.floor(Math.max(0, t - ms) / 4_000)), total })
      const a: CardRow =
        t < 8_000 ? card(21, 'search', 'Search by case name', 'walking', at(0), { todo: steps(0, 4) })
        : t < 12_000 ? card(21, 'search', 'Search by case name', 'waiting', at(8_000), { why: 'a question is waiting for your answer' })
        : t < 28_000 ? card(21, 'search', 'Search by case name', 'walking', at(12_000), { todo: steps(12_000, 4) })
        : card(21, 'search', 'Search by case name', 'done', at(28_000))
      const b2: CardRow =
        t < 14_000 ? card(22, 'export', 'CSV export', 'walking', at(0), { todo: steps(0, 6) })
        : t < 24_000 ? card(22, 'export', 'CSV export', 'failed', at(14_000))
        : card(22, 'export', 'CSV export', 'idle', at(24_000))
      const c: CardRow = t < 20_000 ? card(23, 'theme', 'Theme colours', 'walking', at(0), { todo: steps(0, 5) }) : card(23, 'theme', 'Theme colours', 'done', at(20_000))
      return [a, b2, c]
    },
  },
]

// The cards of scene n (1..7) that began at `began`; none outside 1..7.
export function demoRows(scene: number, began: number, now: number): CardRow[] {
  const s = SCENES[scene - 1]
  return s ? s.rows(began, now) : []
}
