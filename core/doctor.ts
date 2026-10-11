// In-session checks for /walkman doctor. Pure: the adapter gathers the facts, this words them.
// It only ever sees variable NAMES from a credentials file, never their values.
export const REQUIRED_ENV = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'] as const

export function envNames(text: string): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (m) out[m[1] as string] = (m[2] as string).trim().replace(/^['"]|['"]$/g, '') !== ''
  }
  return out
}

export type DoctorFacts = {
  project: string
  cloneDir: string // '' when the released CLI is used through uvx
  envFile: string
  envNames: Record<string, boolean> | undefined // undefined: the file does not exist
  uvx: boolean
  settingsCreds: string // 'complete', 'none' or 'partial:URL+email'
  cardCount: number
  jiraError: string | undefined
  jiraCount: number | undefined // undefined: no lookup has finished yet
  setupCommand: string
}

export function doctorLines(f: DoctorFacts): string[] {
  const out: string[] = []
  out.push(f.cardCount > 0 ? `✓ ${f.cardCount} card worktree${f.cardCount === 1 ? '' : 's'} (a branch like KEY-n-slug)` : '! no card worktrees: a green light needs a worktree named KEY-n-slug (npx … card KEY-n)')
  out.push(f.project ? `✓ WALKMAN_JIRA_PROJECT=${f.project}` : `! WALKMAN_JIRA_PROJECT is not set: run ${f.setupCommand}`)
  if (f.project) {
    if (f.cloneDir) out.push(`✓ using the symphony-workflow clone at ${f.cloneDir}`)
    else {
      out.push(f.uvx ? '✓ uvx is available' : '✗ uvx not found: install uv (https://docs.astral.sh/uv/)')
      if (f.settingsCreds === 'complete') {
        out.push('✓ Jira credentials come from the plugin settings (URL, email and token are set; values not shown)')
        out.push(f.envNames === undefined ? `! the ticket skills and the CLI read ${f.envFile}, which does not exist yet: run ${f.setupCommand} if you want them to work too` : `✓ credentials file ${f.envFile} exists too, for the ticket skills and the CLI`)
      } else if (f.settingsCreds.startsWith('partial:')) out.push(`✗ the plugin's Jira settings are incomplete (set: ${f.settingsCreds.slice(8).split('+').join(', ')}; need URL, email and token)`)
      else if (f.envNames === undefined) out.push(`✗ no credentials file at ${f.envFile}: run ${f.setupCommand}`)
      else {
        const missing = REQUIRED_ENV.filter((n) => !f.envNames?.[n])
        out.push(missing.length === 0 ? `✓ credentials file ${f.envFile} has ${REQUIRED_ENV.join(', ')} (values not shown)` : `✗ credentials file ${f.envFile} is missing ${missing.join(', ')}`)
      }
    }
    if (f.jiraError) out.push(`✗ last Jira lookup failed: ${f.jiraError}`)
    else if (f.jiraCount !== undefined) out.push(`✓ last Jira lookup worked (${f.jiraCount} cards)`)
    else out.push('! no Jira lookup has finished yet (run /walkman board)')
  }
  return out
}
