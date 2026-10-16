// The release audit as pure functions: each takes text or data and returns a list of problems (empty = passed).
// scripts/release.mjs feeds them the real files; checks/audit.check.ts tests them.

const READ_VERBS = new Set(['search', 'call search_issues'])

// The Mod may only search Jira. Every symphony-workflow call it makes goes through runSw($, settings, [...]) or a
// process.run(['…', 'symphony-workflow', …]); the first argument (and the tool name after `call`) must be a search.
export function auditReadOnly(source) {
  const problems = []
  const calls = []
  for (const m of source.matchAll(/runSw\(\$,\s*\w+,\s*\[\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)) calls.push(m[1] === 'call' ? `call ${m[2] ?? '?'}` : m[1])
  for (const m of source.matchAll(/'symphony-workflow',\s*(?:\.\.\.\w+|'([^']+)'(?:\s*,\s*'([^']+)')?)/g)) {
    if (m[1] === undefined) continue // `...args`: the runner, checked through its callers above
    calls.push(m[1] === 'call' ? `call ${m[2] ?? '?'}` : m[1])
  }
  if (calls.length === 0) problems.push('read-only: no symphony-workflow call found (cannot check = failed)')
  for (const c of calls) if (!READ_VERBS.has(c)) problems.push(`read-only: the Mod runs symphony-workflow "${c}", which is not a search`)
  return problems
}

// The Mod reaches Jira only through the symphony-workflow CLI; it makes no network call of its own.
export function auditNoNetwork(source) {
  const problems = []
  if (/\bfetch\s*\(/.test(source)) problems.push('network: the Mod calls fetch()')
  if (/\$\.http\b/.test(source)) problems.push('network: the Mod uses $.http')
  return problems
}

const SECRET_PATTERNS = [
  [/ATATT[A-Za-z0-9_\-=]{20,}/, 'an Atlassian API token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/sk-ant-[A-Za-z0-9_\-]{20,}/, 'an Anthropic API key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
]
export function auditSecrets(files) {
  const problems = []
  for (const { path, text } of files) {
    for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) problems.push(`secrets: ${path} holds what looks like ${what}`)
  }
  return problems
}

// Claude Code's session folder also holds <pid>.<hash>.key files. The Mod may open an entry of it only after
// isRecordName(entry.name), and that guard must refuse .key names.
export function auditRecordGuard(source, isRecordName) {
  const problems = []
  if (!/isRecordName\(entry\.name\)\)\s*continue/.test(source)) problems.push('session records: no isRecordName(entry.name) guard before a read')
  for (const name of ['2841.6ac3f437c1b78391.key', '2841.key', '../2841.json', '2841.json.key']) {
    if (isRecordName(name)) problems.push(`session records: the guard lets "${name}" through`)
  }
  if (!isRecordName('2841.json')) problems.push('session records: the guard refuses a real record name')
  return problems
}

// Every release says what was checked and how, in the README's "What is verified" table.
export function auditVerified(readme, version) {
  const escaped = version.replace(/\./g, '\\.')
  return new RegExp(`^\\|[^|\\n]*[ ,]${escaped} \\(`, 'm').test(readme) ? [] : [`verified: the README has no "What is verified" row for ${version} ("| <what>, ${version} (<how, date>) | <result> |")`]
}

// What a plugin install needs: the manifest names a semver version, the marketplace lists it at the repo root,
// the hooks manifest and module exist, and every skills/<name> folder has a SKILL.md.
export function auditPackage({ plugin, marketplace, files, skills }) {
  const problems = []
  if (!/^\d+\.\d+\.\d+$/.test(plugin?.version ?? '')) problems.push('package: plugin.json has no semver version')
  const entry = (marketplace?.plugins ?? []).find((p) => p.name === plugin?.name)
  if (!entry) problems.push(`package: marketplace.json does not list "${plugin?.name}"`)
  else if (entry.source !== './') problems.push('package: the marketplace entry does not point at the repo root')
  for (const f of ['hooks/hooks.json', 'hooks/register.ts']) if (!files.includes(f)) problems.push(`package: ${f} is missing`)
  for (const s of skills) if (!files.includes(`skills/${s}/SKILL.md`)) problems.push(`package: skills/${s} has no SKILL.md`)
  return problems
}
