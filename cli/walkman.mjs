#!/usr/bin/env node
// symphony-walkman setup CLI: `doctor` checks, `setup` configures, `card` opens a card worktree.
// Plain ESM with no dependencies, so `npx` can run it on any Node >= 18 (the Mod itself is TypeScript).
// It never prints a credential: .env files are read for variable NAMES only.
import { spawnSync } from 'node:child_process'
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const SW_REPO = 'https://github.com/cloud-f1/symphony-workflow'
export const SW_MARKETPLACE = 'cloud-f1/symphony-workflow'
export const SW_PLUGIN = 'symphony-workflow-ops@symphony-workflow-marketplace'
export const REQUIRED_ENV = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']
const PROJECT = /^[A-Z][A-Z0-9]{1,9}$/
const KEY = /^[A-Z][A-Z0-9]{1,9}-\d+$/
// Things that look like KEY-n but are not Jira projects.
const NOT_PROJECTS = new Set(['UTF', 'SHA', 'ISO', 'RFC', 'CVE', 'HTTP', 'TLS', 'SSL', 'MD', 'ES', 'GPT', 'CHAT', 'PEP', 'NODE', 'X', 'SIGINT', 'WCAG', 'AES', 'RSA', 'EC', 'HS', 'RS'])

// ---------- pure helpers (tested) ----------

// The Jira project that appears most in branch names and commit subjects, if it clearly leads.
export function inferProject(texts) {
  const counts = new Map()
  for (const t of texts) {
    for (const m of String(t).matchAll(/\b([A-Z][A-Z0-9]{1,9})-\d+\b/g)) {
      if (NOT_PROJECTS.has(m[1]) || !PROJECT.test(m[1])) continue
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0 || ranked[0][1] < 2) return undefined
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return undefined // a tie is not an answer
  return { project: ranked[0][0], count: ranked[0][1] }
}

// Sets env[name] = value, keeping every other key the file already has.
export function mergeEnvSetting(json, name, value) {
  const base = json && typeof json === 'object' && !Array.isArray(json) ? json : {}
  const env = base.env && typeof base.env === 'object' && !Array.isArray(base.env) ? base.env : {}
  return { ...base, env: { ...env, [name]: value } }
}

export function slugify(title, max = 40) {
  const s = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.length <= max ? s : s.slice(0, max).replace(/-+[^-]*$/, '') || s.slice(0, max)
}

export const branchFor = (key, slug) => (slug ? `${key}-${slug}` : key)
export const worktreeDirFor = (key, slug) => join('.claude', 'worktrees', (slug ? `${key}-${slug}` : key).toLowerCase())

// Variable NAMES in a .env text and whether each has a value; the values are never returned.
export function parseEnvNames(text) {
  const out = {}
  for (const line of String(text).split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '') !== ''
  }
  return out
}

export const missingEnv = (names) => REQUIRED_ENV.filter((n) => !names[n])

export function atLeast(version, min) {
  const a = String(version).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const b = String(min).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return true
}

export const pluginInstalled = (listText, name) => new RegExp(`(^|\\s|❯)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(@|\\s|$)`, 'm').test(String(listText))

export function lookupJql(project) {
  if (!PROJECT.test(project)) return undefined
  return `project = ${project} AND hierarchyLevel = 0 AND statusCategory = "In Progress" ORDER BY updated DESC`
}

export function parseSearch(out) {
  const issues = []
  for (const line of String(out).split('\n')) {
    const m = /^([A-Z][A-Z0-9]{1,9}-\d+)\t([^\t]*)\t(.*)$/.exec(line)
    if (m) issues.push({ key: m[1], status: m[2].trim(), summary: m[3].trim() })
  }
  return issues
}

// What `setup` would do, in order, from what `doctor` found. Pure: the executor runs it.
export function planSetup(s) {
  const steps = []
  if (s.claude && !s.swPluginInstalled) {
    steps.push({ id: 'plugin', title: 'Install the symphony-workflow plugin (skills for ticket work)', run: [['claude', ['plugin', 'marketplace', 'add', SW_MARKETPLACE]], ['claude', ['plugin', 'install', SW_PLUGIN]]] })
  }
  if (!s.swDir) steps.push({ id: 'clone', title: `Clone symphony-workflow to ${s.swDest} and install it`, run: [['git', ['clone', SW_REPO, s.swDest]], ['uv', ['sync'], s.swDest]] })
  if ((s.swDir || s.swDest) && !s.envFilled) steps.push({ id: 'env', title: 'Prepare the .env for Jira credentials (you fill in the values)', manual: true })
  if (s.project && s.projectSetting !== s.project) steps.push({ id: 'project', title: `Set WALKMAN_JIRA_PROJECT=${s.project} in ${s.repo}/.claude/settings.json`, write: { file: join(s.repo, '.claude', 'settings.json'), name: 'WALKMAN_JIRA_PROJECT', value: s.project } })
  const dir = s.swDir || s.swDest
  if (dir && s.dirSetting !== dir) steps.push({ id: 'dir', title: `Set WALKMAN_SYMPHONY_WORKFLOW_DIR=${dir} in ${s.repo}/.claude/settings.local.json (personal, not committed)`, write: { file: join(s.repo, '.claude', 'settings.local.json'), name: 'WALKMAN_SYMPHONY_WORKFLOW_DIR', value: dir } })
  return steps
}

// ---------- io helpers ----------

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 20000, cwd: opts.cwd })
  return { ok: r.status === 0, code: r.status, out: (r.stdout ?? '').toString(), err: (r.stderr ?? '').toString(), missing: r.error?.code === 'ENOENT' }
}

const readJson = (file) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  } catch {
    return undefined // unreadable JSON: never overwrite a file we could not parse
  }
}

export function writeSetting(file, name, value) {
  const json = readJson(file)
  if (json === undefined) throw new Error(`${file} is not valid JSON; fix it by hand, I will not overwrite it`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(mergeEnvSetting(json, name, value), null, 2) + '\n')
}

const settingOf = (repo, name) => {
  for (const f of ['settings.local.json', 'settings.json']) {
    const v = readJson(join(repo, '.claude', f))?.env?.[name]
    if (typeof v === 'string' && v !== '') return v
  }
  return process.env[name] || ''
}

function isSwClone(dir) {
  try {
    return /name\s*=\s*"symphony-workflow"/.test(readFileSync(join(dir, 'pyproject.toml'), 'utf8'))
  } catch {
    return false
  }
}

export function findSwClone(repo, hint) {
  const home = homedir()
  const candidates = [hint, process.env.WALKMAN_SYMPHONY_WORKFLOW_DIR, settingOf(repo, 'WALKMAN_SYMPHONY_WORKFLOW_DIR'), join(home, 'symphony-workflow'), join(home, 'Documents', 'git_saas', 'symphony-workflow'), join(home, 'git', 'symphony-workflow'), join(home, 'code', 'symphony-workflow'), join(repo, '..', 'symphony-workflow')]
  for (const c of candidates) if (c && isSwClone(resolve(c))) return resolve(c)
  return ''
}

function gather(repo, flags) {
  const git = run('git', ['rev-parse', '--show-toplevel'], { cwd: repo })
  const root = git.ok ? git.out.trim() : ''
  const claude = run('claude', ['--version'])
  const list = claude.ok ? run('claude', ['plugin', 'list']).out : ''
  const swDir = findSwClone(repo, flags['sw-dir'])
  const envText = swDir && existsSync(join(swDir, '.env')) ? readFileSync(join(swDir, '.env'), 'utf8') : ''
  const names = parseEnvNames(envText)
  const texts = []
  if (root) {
    texts.push(...run('git', ['log', '-n', '200', '--format=%s'], { cwd: root }).out.split('\n'))
    texts.push(...run('git', ['branch', '-a', '--format=%(refname:short)'], { cwd: root }).out.split('\n'))
  }
  const worktrees = root ? run('git', ['worktree', 'list', '--porcelain'], { cwd: root }).out : ''
  return {
    repo, root, isRepo: git.ok,
    node: process.versions.node,
    claude: claude.ok, claudeVersion: claude.ok ? claude.out.trim().split(/\s+/)[0] : '',
    walkmanInstalled: pluginInstalled(list, 'symphony-walkman'),
    swPluginInstalled: pluginInstalled(list, 'symphony-workflow-ops'),
    uv: !run('uv', ['--version']).missing,
    swDir, swDest: flags['sw-dir'] ? resolve(flags['sw-dir']) : join(homedir(), 'symphony-workflow'),
    envExists: Boolean(envText), envMissing: envText ? missingEnv(names) : REQUIRED_ENV, envFilled: Boolean(envText) && missingEnv(names).length === 0,
    projectSetting: settingOf(repo, 'WALKMAN_JIRA_PROJECT'), dirSetting: settingOf(repo, 'WALKMAN_SYMPHONY_WORKFLOW_DIR'),
    inferred: inferProject(texts),
    project: flags.project || settingOf(repo, 'WALKMAN_JIRA_PROJECT') || inferProject(texts)?.project || '',
    cardBranches: [...worktrees.matchAll(/^branch refs\/heads\/([A-Z][A-Z0-9]+-\d+\S*)$/gm)].map((m) => m[1]),
  }
}

function lookup(swDir, project) {
  const jql = lookupJql(project)
  if (!jql || !swDir) return { ok: false, text: 'not configured' }
  const r = run('uv', ['run', '--env-file', '.env', 'symphony-workflow', 'search', jql], { cwd: swDir, timeout: 30000 })
  if (!r.ok) return { ok: false, text: (r.err || r.out).trim().split('\n')[0].slice(0, 160) }
  return { ok: true, issues: parseSearch(r.out) }
}

// ---------- commands ----------

const mark = { ok: '✓', bad: '✗', warn: '!' }

export function checks(s, withLookup) {
  const out = []
  const add = (level, text, fix) => out.push({ level, text, fix })
  add(s.isRepo ? 'ok' : 'bad', s.isRepo ? `git repo: ${s.root}` : `not a git repo: ${s.repo}`, s.isRepo ? '' : 'run this inside the repo you want to configure (or pass --repo)')
  add(atLeast(s.node, '18.0.0') ? 'ok' : 'bad', `Node ${s.node}`, 'Node 18 or newer is needed for this CLI')
  add(s.claude ? (atLeast(s.claudeVersion, '2.1.287') ? 'ok' : 'bad') : 'bad', s.claude ? `Claude Code ${s.claudeVersion}` : 'Claude Code (claude) not found', s.claude ? 'update Claude Code: the plugin needs 2.1.287 or later' : 'install Claude Code first')
  add(s.walkmanInstalled ? 'ok' : 'warn', s.walkmanInstalled ? 'symphony-walkman plugin installed' : 'symphony-walkman plugin not installed (fine if you load it with --plugin-dir)', 'claude plugin marketplace add cloud-f1/symphony-walkman && claude plugin install symphony-walkman@symphony-walkman')
  add(s.swPluginInstalled ? 'ok' : 'warn', s.swPluginInstalled ? 'symphony-workflow-ops plugin installed' : 'symphony-workflow-ops plugin not installed', 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  add(s.uv ? 'ok' : 'bad', s.uv ? 'uv installed' : 'uv not found', 'install uv: https://docs.astral.sh/uv/')
  add(s.swDir ? 'ok' : 'warn', s.swDir ? `symphony-workflow clone: ${s.swDir}` : 'symphony-workflow clone not found', 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  if (s.swDir) add(s.envFilled ? 'ok' : 'bad', s.envFilled ? 'symphony-workflow .env has the Jira variables (values not shown)' : `symphony-workflow .env is missing: ${s.envMissing.join(', ')}`, `fill them in ${join(s.swDir, '.env')} (an Atlassian API token: https://id.atlassian.com/manage-profile/security/api-tokens)`)
  add(s.projectSetting ? 'ok' : 'warn', s.projectSetting ? `WALKMAN_JIRA_PROJECT=${s.projectSetting}` : `WALKMAN_JIRA_PROJECT is not set${s.inferred ? ` (git history suggests ${s.inferred.project}, ${s.inferred.count} mentions)` : ''}`, 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  add(s.dirSetting ? 'ok' : 'warn', s.dirSetting ? `WALKMAN_SYMPHONY_WORKFLOW_DIR=${s.dirSetting}` : 'WALKMAN_SYMPHONY_WORKFLOW_DIR is not set (or set the plugin setting symphony_workflow_dir)', 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  if (withLookup && s.swDir && s.envFilled && s.project) {
    const l = lookup(s.swDir, s.project)
    add(l.ok ? 'ok' : 'bad', l.ok ? `Jira lookup works: ${l.issues.length} In Progress Stories in ${s.project}${l.issues[0] ? ` (e.g. ${l.issues[0].key} ${l.issues[0].summary.slice(0, 40)})` : ''}` : `Jira lookup failed: ${l.text}`, 'check the .env values and that the project key exists')
  }
  add(s.cardBranches.length > 0 ? 'ok' : 'warn', s.cardBranches.length > 0 ? `card worktrees: ${s.cardBranches.join(', ')}` : 'no card worktrees (a green light needs a worktree named KEY-n-slug)', s.project ? `walkman card ${s.project}-<n>` : 'walkman card KEY-<n>')
  return out
}

function printChecks(list) {
  for (const c of list) console.log(`${mark[c.level]} ${c.text}${c.level !== 'ok' && c.fix ? `\n    → ${c.fix}` : ''}`)
  return list.some((c) => c.level === 'bad') ? 1 : 0
}

async function confirm(question, yes) {
  if (yes) return true
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((r) => rl.question(question + ' [y/N] ', r))
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function cmdSetup(flags) {
  const repo = resolve(flags.repo || process.cwd())
  let s = gather(repo, flags)
  if (!s.isRepo) {
    console.error(`${repo} is not a git repo. Run this inside the repo to configure, or pass --repo.`)
    return 1
  }
  if (flags.project && !PROJECT.test(flags.project)) {
    console.error(`--project must look like JEV (capital letters and digits), got ${flags.project}`)
    return 1
  }
  if (!s.project) console.log('No Jira project key found in settings or git history. Pass --project JEV to set one.')
  const steps = planSetup(s)
  if (steps.length === 0) {
    console.log('Nothing to change. Checking everything:\n')
    return printChecks(checks(s, true))
  }
  console.log('Setup plan:')
  steps.forEach((st, i) => console.log(`  ${i + 1}. ${st.title}`))
  if (flags['dry-run']) return 0
  if (!(await confirm('\nApply these changes?', flags.yes))) {
    console.log(process.stdin.isTTY ? 'Nothing changed.' : 'Not a terminal: nothing changed. Re-run with --yes to apply.')
    return 2
  }
  for (const st of steps) {
    console.log(`\n→ ${st.title}`)
    if (st.run) {
      for (const [cmd, args, cwd] of st.run) {
        const r = run(cmd, args, { cwd, timeout: 600000 })
        if (!r.ok) {
          console.error(`  ${cmd} ${args.join(' ')} failed: ${(r.err || r.out).trim().split('\n').slice(-2).join(' ').slice(0, 200)}`)
          console.error('  Fix that and re-run setup; finished steps are skipped.')
          return 1
        }
        console.log(`  ✓ ${cmd} ${args.slice(0, 3).join(' ')}`)
      }
    }
    if (st.write) {
      writeSetting(st.write.file, st.write.name, st.write.value)
      console.log(`  ✓ wrote ${st.write.file}`)
    }
    if (st.id === 'env') {
      const dir = s.swDir || s.swDest
      const target = join(dir, '.env')
      if (!existsSync(target) && existsSync(join(dir, '.env.example'))) {
        copyFileSync(join(dir, '.env.example'), target)
        chmodSync(target, 0o600)
        console.log(`  ✓ created ${target} from .env.example (mode 600)`)
      }
      console.log(`  Fill in ${REQUIRED_ENV.join(', ')} in ${target}, then run: npx --yes github:cloud-f1/symphony-walkman doctor`)
      console.log('  I do not ask for or print the token. Create one at https://id.atlassian.com/manage-profile/security/api-tokens')
    }
  }
  s = gather(repo, flags)
  console.log('\nResult:\n')
  const code = printChecks(checks(s, true))
  console.log('\nRestart Claude Code in this repo so the new settings load (a /reload-plugins is not enough).')
  return code
}

async function cmdCard(flags, positionals) {
  const [key, ...rest] = positionals
  if (!key || !KEY.test(key)) {
    console.error('usage: walkman card KEY-123 [slug]   (for example: walkman card JEV-47 withhold-secrets)')
    return 1
  }
  const repo = resolve(flags.repo || process.cwd())
  const root = run('git', ['rev-parse', '--show-toplevel'], { cwd: repo })
  if (!root.ok) return console.error(`${repo} is not a git repo`), 1
  const top = root.out.trim()
  let slug = rest.length > 0 ? slugify(rest.join(' ')) : ''
  if (!slug) {
    const sw = findSwClone(top, flags['sw-dir'])
    if (sw) {
      const r = run('uv', ['run', '--env-file', '.env', 'symphony-workflow', 'search', `key = ${key}`], { cwd: sw, timeout: 30000 })
      const issue = r.ok ? parseSearch(r.out)[0] : undefined
      if (issue) slug = slugify(issue.summary)
    }
  }
  const branch = branchFor(key, slug)
  const rel = worktreeDirFor(key, slug)
  const abs = join(top, rel)
  if (existsSync(abs)) return console.log(`Already exists: ${abs}\n  cd ${abs} && claude`), 0
  run('git', ['fetch', 'origin'], { cwd: top, timeout: 60000 })
  const base = run('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: top }).ok ? 'origin/main' : 'HEAD'
  const exists = run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: top }).ok
  const args = exists ? ['worktree', 'add', rel, branch] : ['worktree', 'add', rel, '-b', branch, base]
  const r = run('git', args, { cwd: top, timeout: 120000 })
  if (!r.ok) return console.error(`git ${args.join(' ')} failed: ${(r.err || r.out).trim().split('\n').pop()}`), 1
  console.log(`✓ ${exists ? 'worktree for existing branch' : 'new branch'} ${branch} (from ${exists ? branch : base})\n  cd ${abs} && claude`)
  const ignore = existsSync(join(top, '.gitignore')) ? readFileSync(join(top, '.gitignore'), 'utf8') : ''
  if (!/\.claude\/worktrees/.test(ignore)) console.log('! add ".claude/worktrees/" to .gitignore so git add -A does not pick the worktree up')
  return 0
}

const HELP = `symphony-walkman setup CLI

  doctor [--json]        check everything and say how to fix what is missing
  setup [--project JEV] [--sw-dir PATH] [--yes] [--dry-run]
                         install the symphony-workflow plugin, clone it, prepare its .env, write the
                         repo settings, then verify the Jira lookup. Shows the plan first.
  card KEY-123 [slug]    create .claude/worktrees/<key>-<slug> on branch KEY-123-<slug> (slug from Jira if empty)

options: --repo PATH (default: current directory)

Run without installing:  npx --yes github:cloud-f1/symphony-walkman <command>
It never prints a credential and never writes to Jira.`

export async function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { repo: { type: 'string' }, project: { type: 'string' }, 'sw-dir': { type: 'string' }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  const [cmd, ...rest] = positionals
  if (values.help || !cmd || cmd === 'help') return console.log(HELP), 0
  if (cmd === 'doctor') {
    const s = gather(resolve(values.repo || process.cwd()), values)
    const list = checks(s, true)
    if (values.json) return console.log(JSON.stringify(list, null, 2)), list.some((c) => c.level === 'bad') ? 1 : 0
    return printChecks(list)
  }
  if (cmd === 'setup') return cmdSetup(values)
  if (cmd === 'card') return cmdCard(values, rest)
  console.error(`unknown command: ${cmd}\n\n${HELP}`)
  return 1
}

// npx and npm link run this through a symlink in node_modules/.bin, so compare real paths.
const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
})()

if (isMain) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(String(err?.message ?? err))
    process.exit(1)
  })
}
