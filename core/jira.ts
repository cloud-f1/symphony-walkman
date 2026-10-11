import type { CardRow } from './contracts.ts'

// A Jira issue as `symphony-workflow search` prints it: KEY<TAB>Status<TAB>Summary.
export type JiraIssue = { key: string; status: string; summary: string }

const PROJECT = /^[A-Z][A-Z0-9]{1,9}$/
const KEY = /^[A-Z][A-Z0-9]{1,9}-\d+$/

export const isProject = (s: string): boolean => PROJECT.test(s)

export function parseSearch(out: string): JiraIssue[] {
  const issues: JiraIssue[] = []
  for (const line of out.split('\n')) {
    const m = /^([A-Z][A-Z0-9]{1,9}-\d+)\t([^\t]*)\t(.*)$/.exec(line)
    if (m) issues.push({ key: m[1] as string, status: (m[2] as string).trim(), summary: (m[3] as string).trim() })
  }
  return issues
}

// Read-only query: the project's in-progress cards (Story level, so no Epics or Sub-tasks) plus the cards
// that have a worktree. Only validated pieces go into it, so a setting can never inject JQL.
export function buildJql(project: string, cardKeys: readonly string[]): string | undefined {
  if (!PROJECT.test(project)) return undefined
  const keys = [...new Set(cardKeys.filter((k) => KEY.test(k) && k.startsWith(project + '-')))]
  const own = keys.length > 0 ? ` OR key in (${keys.join(', ')})` : ''
  return `project = ${project} AND hierarchyLevel = 0 AND (statusCategory = "In Progress"${own}) ORDER BY updated DESC`
}

// Cards with a worktree get their title and Jira status; the rest are Jira-only rows.
export function mergeJira(rows: readonly CardRow[], issues: readonly JiraIssue[]): { rows: CardRow[]; others: JiraIssue[] } {
  const byKey = new Map(issues.map((i) => [i.key, i]))
  const have = new Set(rows.map((r) => r.key))
  return {
    rows: rows.map((r) => {
      const issue = byKey.get(r.key)
      return issue ? { ...r, title: issue.summary, jiraStatus: issue.status } : r
    }),
    others: issues.filter((i) => !have.has(i.key)),
  }
}
