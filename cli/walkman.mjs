#!/usr/bin/env node
// symphony-walkman setup CLI: `doctor` checks, `setup` configures one repo, `configure` configures every repo in a folder, `card` opens a card worktree.
// Plain ESM with no dependencies, so `npx` can run it on any Node >= 18 (the Mod itself is TypeScript).
// It never prints a credential: .env files are read for variable NAMES only.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const SW_GIT = 'git+https://github.com/cloud-f1/symphony-workflow@v0.9.3' // bump with symphony-workflow releases
export const WALKMAN_MARKETPLACE = 'cloud-f1/symphony-walkman'
export const WALKMAN_PLUGIN = 'symphony-walkman@symphony-walkman' // its marketplace also lists symphony-workflow-ops, so one install pulls both
export const SW_PLUGIN = 'symphony-workflow-ops@symphony-walkman'
export const DEFAULT_ENV_FILE = join(homedir(), '.config', 'symphony-workflow', '.env')
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

// Terminal color codes in an env file (a `grep` run with --color=always writes them): uv fails to parse such a file.
export const hasAnsi = (text) => /\x1b\[[0-9;]*[A-Za-z]/.test(String(text))

// Only the three Jira variables from an env text, lines kept as written; nothing else in the file is carried over.
export function pickJiraEnv(text) {
  const keep = new RegExp(`^\\s*(?:export\\s+)?(${REQUIRED_ENV.join('|')})\\s*=`)
  return String(text).split('\n').filter((line) => keep.test(line)).map((line) => line + '\n').join('')
}

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
  if (s.claude && !s.walkmanInstalled) {
    steps.push({ id: 'plugin', title: 'Install the symphony-walkman plugin (its marketplace also installs the symphony-workflow-ops skills)', run: [['claude', ['plugin', 'marketplace', 'add', WALKMAN_MARKETPLACE]], ['claude', ['plugin', 'install', WALKMAN_PLUGIN]]] })
  } else if (s.claude && !s.swPluginInstalled) {
    steps.push({ id: 'plugin', title: 'Install the symphony-workflow-ops skills plugin', run: [['claude', ['plugin', 'marketplace', 'update', 'symphony-walkman']], ['claude', ['plugin', 'install', SW_PLUGIN]]] })
  }
  if (!s.envFilled) {
    if (s.migrateFrom) steps.push({ id: 'migrate', title: `Copy only ${REQUIRED_ENV.join(', ')} from ${s.migrateFrom}/.env to ${s.envFile} (mode 600; values are not shown)` })
    else steps.push({ id: 'env', title: `Create ${s.envFile} (mode 600) for the Jira credentials (you fill in the values)`, manual: true })
  }
  if (s.uv && !s.uvxWarm) steps.push({ id: 'warm', title: 'Download the symphony-workflow CLI once (about 95 MB) so lookups are fast', run: [['uvx', ['--from', SW_GIT, 'symphony-workflow', '--help']]] })
  if (s.project && s.projectSetting !== s.project) steps.push({ id: 'project', title: `Set WALKMAN_JIRA_PROJECT=${s.project} in ${s.repo}/.claude/settings.json`, write: { file: join(s.repo, '.claude', 'settings.json'), name: 'WALKMAN_JIRA_PROJECT', value: s.project } })
  return steps
}

// ---------- configure: every repo in a folder (pure parts, tested) ----------

const MARKETPLACE = 'symphony-walkman'
const PLUGIN_KEY = 'symphony-walkman@symphony-walkman'

// Both edits return a new object and keep every other key of the Claude user settings.
export function withAutoUpdate(json) {
  const markets = json?.extraKnownMarketplaces ?? {}
  return { ...json, extraKnownMarketplaces: { ...markets, [MARKETPLACE]: { ...(markets[MARKETPLACE] ?? {}), autoUpdate: true } } }
}

export function withoutGlobalProject(json) {
  const cfg = json?.pluginConfigs?.[PLUGIN_KEY]
  if (!cfg?.options || !('jira_project' in cfg.options)) return json
  const { jira_project: _dropped, ...options } = cfg.options
  return { ...json, pluginConfigs: { ...json.pluginConfigs, [PLUGIN_KEY]: { ...cfg, options } } }
}

// Git repos directly under a folder (a worktree's `.git` file counts too).
export function listRepos(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && existsSync(join(root, e.name, '.git')))
      .map((e) => join(root, e.name))
      .sort()
  } catch {
    return []
  }
}

// What `configure` would do. A project that is already set is left alone unless --set names another one;
// a global jira_project is reported, and removed only with --drop-global-project.
export function planConfigure(f) {
  const steps = []
  const notes = []
  const keep = []
  const none = []
  for (const r of f.repos) {
    const project = r.override || r.current || (r.inferredOk ? r.inferred : '')
    if (r.current && (!r.override || r.override === r.current)) {
      keep.push(r.name)
      continue
    }
    if (!project) {
      // a KEY-n in git history is only a guess: BUG-12 or P2-3 are not Jira projects, so it is never applied unchecked
      if (r.inferred) notes.push(`${r.name}: ${r.inferred} appears in git history but no Jira project ${r.inferred} with issues was found; if it is one, pass --set ${r.name}=${r.inferred}`)
      else none.push(r.name)
      continue
    }
    const why = r.override ? (r.current ? `given; was ${r.current}` : 'given') : 'from git history, found in Jira'
    steps.push({ id: `repo:${r.name}`, title: `${r.name}: set WALKMAN_JIRA_PROJECT=${project} in .claude/${f.target} (${why})`, write: { file: join(r.path, '.claude', f.target), name: 'WALKMAN_JIRA_PROJECT', value: project } })
  }
  const g = f.global
  if (g.marketplace === 'missing') notes.push(`the ${MARKETPLACE} marketplace is not in the Claude user settings; run: npx --yes github:cloud-f1/symphony-walkman setup`)
  else if (g.autoUpdate !== true) steps.push({ id: 'autoupdate', title: `Turn on auto-update for the ${MARKETPLACE} marketplace (Claude user settings)`, global: 'autoUpdate' })
  if (g.jiraProject) {
    if (f.dropGlobalProject) steps.push({ id: 'drop-global-project', title: `Remove the global plugin option jira_project=${g.jiraProject} (every repo without its own setting would look up that project)`, global: 'dropProject' })
    else notes.push(`global plugin option jira_project=${g.jiraProject} gives every repo without its own setting that project; add --drop-global-project to remove it`)
  }
  if (!g.credsOk) notes.push('no complete Jira credentials file yet; run: npx --yes github:cloud-f1/symphony-walkman setup')
  return { steps, notes, keep, none }
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

// trustRepo is false when the repo is only being scanned: a repo you did not choose must not decide which clone gets
// run or which credentials file is read, so only your own environment counts then.
const settingOf = (repo, name, trustRepo = true) => {
  if (trustRepo) {
    for (const f of ['settings.local.json', 'settings.json']) {
      const v = readJson(join(repo, '.claude', f))?.env?.[name]
      if (typeof v === 'string' && v !== '') return v
    }
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

// Where the Jira credentials are and whether they are complete. Reads one env file; never returns a value.
export function credsInfo(repo, flags, trustRepo = true) {
  const configured = settingOf(repo, 'WALKMAN_SYMPHONY_WORKFLOW_DIR', trustRepo)
  const legacyDir = flags['sw-dir'] ? resolve(flags['sw-dir']) : configured ? resolve(configured) : ''
  const envFile = resolve(flags.creds || settingOf(repo, 'WALKMAN_JIRA_ENV_FILE', trustRepo) || DEFAULT_ENV_FILE)
  const file = legacyDir ? join(legacyDir, '.env') : envFile
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const names = parseEnvNames(raw)
  const credsPresent = Object.keys(names).length > 0
  return { legacyDir, envFile, names, credsPresent, envHasAnsi: hasAnsi(raw), envFilled: credsPresent && missingEnv(names).length === 0 }
}

function gather(repo, flags) {
  const git = run('git', ['rev-parse', '--show-toplevel'], { cwd: repo })
  const root = git.ok ? git.out.trim() : ''
  const claude = run('claude', ['--version'])
  const list = claude.ok ? run('claude', ['plugin', 'list']).out : ''
  const { legacyDir, envFile, names, credsPresent, envHasAnsi } = credsInfo(repo, flags)
  const textOf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const clone = legacyDir || findSwClone(repo, '')
  const cloneFilled = clone && missingEnv(parseEnvNames(textOf(join(clone, '.env')))).length === 0
  const texts = []
  if (root) {
    texts.push(...run('git', ['log', '-n', '200', '--format=%s'], { cwd: root }).out.split('\n'))
    texts.push(...run('git', ['branch', '-a', '--format=%(refname:short)'], { cwd: root }).out.split('\n'))
  }
  const worktrees = root ? run('git', ['worktree', 'list', '--porcelain'], { cwd: root }).out : ''
  const uv = !run('uv', ['--version']).missing
  return {
    repo, root, isRepo: git.ok,
    node: process.versions.node,
    claude: claude.ok, claudeVersion: claude.ok ? claude.out.trim().split(/\s+/)[0] : '',
    walkmanInstalled: pluginInstalled(list, 'symphony-walkman'),
    swPluginInstalled: pluginInstalled(list, 'symphony-workflow-ops'),
    uv, // cached runs answer in about 2s; a cold download is much slower, so a short timeout tells them apart
    uvxWarm: uv && run('uvx', ['--from', SW_GIT, 'symphony-workflow', '--help'], { timeout: 12000 }).ok,
    legacyDir, envFile, credsPresent, envHasAnsi,
    envMissing: credsPresent ? missingEnv(names) : REQUIRED_ENV, envFilled: credsPresent && missingEnv(names).length === 0,
    migrateFrom: !legacyDir && !existsSync(envFile) && cloneFilled ? clone : '',
    projectSetting: settingOf(repo, 'WALKMAN_JIRA_PROJECT'),
    inferred: inferProject(texts),
    project: flags.project || settingOf(repo, 'WALKMAN_JIRA_PROJECT') || inferProject(texts)?.project || '',
    cardBranches: [...worktrees.matchAll(/^branch refs\/heads\/([A-Z][A-Z0-9]+-\d+\S*)$/gm)].map((m) => m[1]),
  }
}

// The read-only search, either from a clone you configured (the older way) or the released CLI through uvx.
export function searchCommand(s, jql) {
  if (s.legacyDir) return ['uv', ['run', '--env-file', '.env', 'symphony-workflow', 'search', jql], s.legacyDir]
  return ['uvx', ['--env-file', s.envFile, '--from', SW_GIT, 'symphony-workflow', 'search', jql]]
}

function lookup(s, project) {
  const jql = lookupJql(project)
  if (!jql || !s.envFilled) return { ok: false, text: 'not configured' }
  const [cmd, args, cwd] = searchCommand(s, jql)
  const r = run(cmd, args, { cwd, timeout: 120000 })
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
  if (s.envHasAnsi) add('bad', `Jira credentials file ${s.legacyDir ? join(s.legacyDir, '.env') : s.envFile} has terminal color codes, so uv cannot read it`, `strip them: perl -pi -e 's/\\e[[][0-9;]*[mK]//g' ${s.legacyDir ? join(s.legacyDir, '.env') : s.envFile}`)
  else add(s.envFilled ? 'ok' : 'warn', s.envFilled ? `Jira credentials file: ${s.legacyDir ? join(s.legacyDir, '.env') : s.envFile} (values not shown)` : s.credsPresent ? `Jira credentials file ${s.envFile} is missing: ${s.envMissing.join(', ')}` : `no Jira credentials file at ${s.envFile}${s.migrateFrom ? ` (setup can copy them from ${s.migrateFrom}/.env)` : ''}`, `run: npx --yes github:cloud-f1/symphony-walkman setup (an Atlassian API token: https://id.atlassian.com/manage-profile/security/api-tokens)`)
  if (!s.legacyDir) add(s.uvxWarm ? 'ok' : 'warn', s.uvxWarm ? 'symphony-workflow CLI is cached for uvx' : 'symphony-workflow CLI not downloaded yet (the first lookup will be slow)', 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  add(s.projectSetting ? 'ok' : 'warn', s.projectSetting ? `WALKMAN_JIRA_PROJECT=${s.projectSetting}` : `WALKMAN_JIRA_PROJECT is not set${s.inferred ? ` (git history suggests ${s.inferred.project}, ${s.inferred.count} mentions)` : ''}`, 'run: npx --yes github:cloud-f1/symphony-walkman setup')
  if (withLookup && s.envFilled && s.project) {
    const l = lookup(s, s.project)
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
    if (st.id === 'migrate') {
      mkdirSync(dirname(s.envFile), { recursive: true })
      const picked = pickJiraEnv(readFileSync(join(s.migrateFrom, '.env'), 'utf8'))
      if (missingEnv(parseEnvNames(picked)).length > 0) {
        console.error(`  ${s.migrateFrom}/.env does not hold all of ${REQUIRED_ENV.join(', ')}; nothing was copied`)
        return 1
      }
      writeFileSync(s.envFile, picked, { mode: 0o600 })
      chmodSync(s.envFile, 0o600)
      console.log(`  ✓ copied ${REQUIRED_ENV.join(', ')} to ${s.envFile} (mode 600)`)
    }
    if (st.id === 'env') {
      mkdirSync(dirname(s.envFile), { recursive: true })
      if (!existsSync(s.envFile)) {
        writeFileSync(s.envFile, 'JIRA_BASE_URL=https://your-site.atlassian.net\nJIRA_EMAIL=\nJIRA_API_TOKEN=\n', { mode: 0o600 })
        console.log(`  ✓ created ${s.envFile} (mode 600)`)
      }
      console.log(`  Fill in ${REQUIRED_ENV.join(', ')} in ${s.envFile}, then run: npx --yes github:cloud-f1/symphony-walkman doctor`)
      console.log('  I do not ask for or print the token. Create one at https://id.atlassian.com/manage-profile/security/api-tokens')
    }
  }
  s = gather(repo, flags)
  console.log('\nResult:\n')
  const code = printChecks(checks(s, true))
  console.log('\nRestart Claude Code in this repo so the new settings load (a /reload-plugins is not enough).')
  return code
}

// ---------- configure: gathering and running ----------

function projectIn(repo) {
  for (const f of ['settings.local.json', 'settings.json']) {
    const v = readJson(join(repo, '.claude', f))?.env?.WALKMAN_JIRA_PROJECT
    if (typeof v === 'string' && PROJECT.test(v)) return v // a value from a scanned repo is shown on screen: only a valid key
  }
  return ''
}

// The folder that holds the repos: the parent of the repo you are in (also from inside one of its worktrees).
function defaultRoot() {
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  return common.ok ? dirname(dirname(common.out.trim())) : process.cwd()
}

// A guessed project counts only when a read-only search finds issues in it (a missing project answers `0 total`).
function jiraProjectHasIssues(creds, key) {
  if (!creds.envFilled || !PROJECT.test(key)) return false
  const [cmd, args, cwd] = searchCommand(creds, `project = ${key} ORDER BY key DESC`)
  const r = run(cmd, args, { cwd, timeout: 120000 })
  return r.ok && parseSearch(r.out).length > 0
}

function gatherConfigure(flags) {
  const root = resolve(flags.root || defaultRoot())
  const sets = {}
  for (const kv of flags.set ?? []) {
    const m = /^([^=]+)=([A-Z][A-Z0-9]{1,9})$/.exec(kv)
    if (!m) throw new Error(`--set expects name=KEY (for example --set my-repo=ABC), got ${kv}`)
    sets[m[1]] = m[2]
  }
  const creds = credsInfo(root, flags, false) // the scanned repos do not get to pick the credentials or the clone
  const checked = new Map()
  const exists = (key) => {
    if (flags['no-verify']) return true
    if (!checked.has(key)) checked.set(key, jiraProjectHasIssues(creds, key))
    return checked.get(key)
  }
  const repos = listRepos(root).map((path) => {
    const name = basename(path)
    const current = projectIn(path)
    const texts = [...run('git', ['log', '-n', '200', '--format=%s'], { cwd: path }).out.split('\n'), ...run('git', ['branch', '-a', '--format=%(refname:short)'], { cwd: path }).out.split('\n')]
    const inferred = current || sets[name] ? '' : (inferProject(texts)?.project ?? '')
    return { name, path, current, inferred, inferredOk: inferred !== '' && exists(inferred), override: sets[name] ?? '' }
  })
  const file = join(resolve(flags['claude-home'] || join(homedir(), '.claude')), 'settings.json')
  const json = readJson(file)
  if (json === undefined) throw new Error(`${file} is not valid JSON; fix it by hand, I will not overwrite it`)
  return {
    root, file, json, repos,
    target: flags.shared ? 'settings.json' : 'settings.local.json',
    dropGlobalProject: Boolean(flags['drop-global-project']),
    global: {
      marketplace: json.extraKnownMarketplaces?.[MARKETPLACE] ? 'present' : 'missing',
      autoUpdate: json.extraKnownMarketplaces?.[MARKETPLACE]?.autoUpdate,
      jiraProject: json.pluginConfigs?.[PLUGIN_KEY]?.options?.jira_project ?? '',
      credsOk: creds.envFilled,
    },
  }
}

async function cmdConfigure(flags) {
  let facts
  try {
    facts = gatherConfigure(flags)
  } catch (err) {
    console.error(String(err?.message ?? err))
    return 1
  }
  if (facts.repos.length === 0) {
    console.error(`No git repos directly under ${facts.root}. Pass --root with the folder that holds them.`)
    return 1
  }
  const plan = planConfigure(facts)
  console.log(`${facts.repos.length} git repos under ${facts.root}`)
  const shown = facts.repos.filter((r) => flags.all || r.current || r.override || r.inferredOk)
  for (const r of shown) {
    const planned = r.override || r.current || (r.inferredOk ? r.inferred : '')
    console.log(`  ${r.name.padEnd(30)} ${r.current && !(r.override && r.override !== r.current) ? `${r.current} (already set)` : planned ? `${planned} (planned)` : '-'}`)
  }
  if (plan.none.length > 0 && !flags.all) console.log(`  … ${plan.none.length} more with no Jira project found (list them with --all, set one with --set name=KEY)`)
  if (plan.notes.length > 0) {
    console.log('\nNotes:')
    for (const n of plan.notes) console.log(`  ! ${n}`)
  }
  if (plan.steps.length === 0) {
    console.log('\nNothing to change.')
    return 0
  }
  console.log('\nConfigure plan:')
  plan.steps.forEach((st, i) => console.log(`  ${i + 1}. ${st.title}`))
  if (flags['dry-run']) return 0
  if (!(await confirm('\nApply these changes?', flags.yes))) {
    console.log(process.stdin.isTTY ? 'Nothing changed.' : 'Not a terminal: nothing changed. Re-run with --yes to apply.')
    return 2
  }
  for (const st of plan.steps) {
    if (st.write) writeSetting(st.write.file, st.write.name, st.write.value)
    if (st.global) {
      const next = st.global === 'autoUpdate' ? withAutoUpdate(facts.json) : withoutGlobalProject(facts.json)
      writeFileSync(facts.file, JSON.stringify(next, null, 2) + '\n')
      facts.json = next
    }
    console.log(`  ✓ ${st.title}`)
  }
  console.log('\nRestart Claude Code in each repo so the settings load. Check one with: npx --yes github:cloud-f1/symphony-walkman doctor --repo <path>')
  return 0
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
    const st = credsInfo(top, flags) // only the credentials file: no claude, plugin list or uvx survey for a title
    if (st.envFilled) {
      const [cmd, args, cwd] = searchCommand(st, `key = ${key}`)
      const r = run(cmd, args, { cwd, timeout: 120000 })
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
  setup [--project JEV] [--creds PATH] [--yes] [--dry-run]
                         install the plugin (it brings the symphony-workflow skills), prepare the Jira
                         credentials file, download the CLI once, write the repo settings, then verify the
                         Jira lookup. Shows the plan first.
  version                print this CLI's version, the pinned symphony-workflow release and Node
  card KEY-123 [slug]    create .claude/worktrees/<key>-<slug> on branch KEY-123-<slug> (slug from Jira if empty)
  configure [--root DIR] [--set repo=KEY]... [--shared] [--drop-global-project] [--no-verify] [--all] [--yes] [--dry-run]
                         set WALKMAN_JIRA_PROJECT in every git repo under a folder (default: the folder that holds
                         this repo; a project guessed from git history is used only if Jira has issues in it, unless
                         --no-verify), turn on marketplace auto-update, and report a global jira_project. Writes
                         .claude/settings.local.json (not committed; --shared writes settings.json). Shows the plan first.

options: --repo PATH (default: current directory)

Run without installing:  npx --yes github:cloud-f1/symphony-walkman <command>
It never prints a credential and never writes to Jira.`

export async function main(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { repo: { type: 'string' }, project: { type: 'string' }, 'sw-dir': { type: 'string' }, creds: { type: 'string' }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, root: { type: 'string' }, set: { type: 'string', multiple: true }, shared: { type: 'boolean' }, all: { type: 'boolean' }, 'no-verify': { type: 'boolean' }, 'drop-global-project': { type: 'boolean' }, 'claude-home': { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  const [cmd, ...rest] = positionals
  if (values.help || !cmd || cmd === 'help') return console.log(HELP), 0
  if (cmd === 'doctor') {
    const s = gather(resolve(values.repo || process.cwd()), values)
    const list = checks(s, true)
    if (values.json) return console.log(JSON.stringify(list, null, 2)), list.some((c) => c.level === 'bad') ? 1 : 0
    return printChecks(list)
  }
  if (cmd === 'version') {
    let v = 'unknown'
    try {
      v = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
    } catch {
      // an installed copy always has package.json; leave unknown otherwise
    }
    return console.log(`symphony-walkman ${v}\nJira lookup runs symphony-workflow ${SW_GIT.split('@')[1]} through uvx\nNode ${process.versions.node}`), 0
  }
  if (cmd === 'setup') return cmdSetup(values)
  if (cmd === 'card') return cmdCard(values, rest)
  if (cmd === 'configure') return cmdConfigure(values)
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
