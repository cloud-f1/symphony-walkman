import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
// @ts-ignore the CLI is plain ESM JavaScript
import { SW_GIT, atLeast, branchFor, hasAnsi, inferProject, listRepos, pickJiraEnv, planConfigure, withAutoUpdate, withoutGlobalProject, lookupJql, mergeEnvSetting, missingEnv, parseEnvNames, planSetup, pluginInstalled, searchCommand, slugify, worktreeDirFor, writeSetting } from '../cli/walkman.mjs'

const CLI = new URL('../cli/walkman.mjs', import.meta.url).pathname
// The CLI reads WALKMAN_* variables; a machine that has them set must not change what these checks see.
const cleanEnv = (): Record<string, string> => Object.fromEntries(Object.entries(process.env).filter(([k, v]) => !k.startsWith('WALKMAN_') && v !== undefined)) as Record<string, string>
const sh = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const tmp = () => mkdtempSync(join(tmpdir(), 'walkman-cli-'))
function repoWith(commits: string[]) {
  const dir = tmp()
  sh(dir, 'init', '-q', '-b', 'main')
  for (const c of commits) sh(dir, '-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', c)
  return dir
}

test('infer the Jira project from branches and commit subjects, ignoring look-alikes', () => {
  assert.deepEqual(inferProject(['JEV-47 withhold', 'JEV-48 mask', 'fix UTF-8 bug', 'SHA-256 sums']), { project: 'JEV', count: 2 })
  assert.equal(inferProject(['JEV-47 once']), undefined) // one mention is not enough
  assert.equal(inferProject(['JEV-1', 'JEV-2', 'CF1-1', 'CF1-2']), undefined) // a tie is not an answer
  assert.equal(inferProject(['UTF-8', 'UTF-16', 'ISO-8601', 'ISO-8859']), undefined)
})

test('settings merge keeps every other key and survives odd input', () => {
  assert.deepEqual(mergeEnvSetting({ permissions: { allow: ['x'] }, env: { A: '1' } }, 'WALKMAN_JIRA_PROJECT', 'JEV'), { permissions: { allow: ['x'] }, env: { A: '1', WALKMAN_JIRA_PROJECT: 'JEV' } })
  assert.deepEqual(mergeEnvSetting(undefined, 'N', 'v'), { env: { N: 'v' } })
  assert.deepEqual(mergeEnvSetting({ env: 'oops' }, 'N', 'v'), { env: { N: 'v' } })
})

test('writeSetting writes a new file, merges into an existing one, and refuses broken JSON', () => {
  const dir = tmp()
  const file = join(dir, '.claude', 'settings.json')
  writeSetting(file, 'WALKMAN_JIRA_PROJECT', 'JEV')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { env: { WALKMAN_JIRA_PROJECT: 'JEV' } })
  writeSetting(file, 'OTHER', 'x')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).env, { WALKMAN_JIRA_PROJECT: 'JEV', OTHER: 'x' })
  writeFileSync(file, '{ not json')
  assert.throws(() => writeSetting(file, 'A', 'b'), /not valid JSON/)
  assert.equal(readFileSync(file, 'utf8'), '{ not json') // untouched
})

test('.env names are read without ever returning a value', () => {
  const names = parseEnvNames('JIRA_BASE_URL=https://x.atlassian.net\nJIRA_EMAIL=\n# c\nexport JIRA_API_TOKEN="secret"\n')
  assert.deepEqual(names, { JIRA_BASE_URL: true, JIRA_EMAIL: false, JIRA_API_TOKEN: true })
  assert.ok(!JSON.stringify(names).includes('secret'))
  assert.deepEqual(missingEnv(names), ['JIRA_EMAIL'])
})

test('slug, branch and worktree names', () => {
  assert.equal(slugify('Withhold secret-like blocks!'), 'withhold-secret-like-blocks')
  assert.equal(slugify('中文 only'), 'only')
  assert.ok(slugify('a'.repeat(30) + ' ' + 'b'.repeat(30)).length <= 40)
  assert.equal(branchFor('JEV-47', 'withhold'), 'JEV-47-withhold')
  assert.equal(branchFor('JEV-47', ''), 'JEV-47')
  assert.equal(worktreeDirFor('JEV-47', 'withhold'), join('.claude', 'worktrees', 'jev-47-withhold'))
})

test('version compare, plugin list match, and a JQL that rejects a bad project', () => {
  assert.ok(atLeast('2.1.296', '2.1.287'))
  assert.ok(!atLeast('2.1.100', '2.1.287'))
  assert.ok(pluginInstalled('  ❯ symphony-workflow-ops@symphony-workflow-marketplace\n    Version: 0.5.1', 'symphony-workflow-ops'))
  assert.ok(!pluginInstalled('  ❯ symphony-walkman@symphony-walkman', 'symphony-workflow-ops'))
  assert.equal(lookupJql('jev; x'), undefined)
  assert.match(lookupJql('JEV') as string, /^project = JEV AND hierarchyLevel = 0/)
})

test('the setup plan lists only what is missing, in order, and never asks for a token', () => {
  const base = { repo: '/r', claude: true, walkmanInstalled: false, swPluginInstalled: false, uv: true, uvxWarm: false, envFile: '/c/.env', envFilled: false, migrateFrom: '', project: 'JEV', projectSetting: '' }
  assert.deepEqual(planSetup(base).map((st: { id: string }) => st.id), ['plugin', 'env', 'warm', 'project'])
  assert.deepEqual(planSetup({ ...base, migrateFrom: '/old/clone' }).map((st: { id: string }) => st.id), ['plugin', 'migrate', 'warm', 'project'])
  // walkman is installed but the skills plugin is not: only the skills plugin step
  const plugin = planSetup({ ...base, walkmanInstalled: true }).find((st: { id: string }) => st.id === 'plugin')
  assert.ok(JSON.stringify(plugin.run).includes('symphony-workflow-ops@symphony-walkman'))
  const done = { ...base, walkmanInstalled: true, swPluginInstalled: true, uvxWarm: true, envFilled: true, projectSetting: 'JEV' }
  assert.deepEqual(planSetup(done), [])
  const text = JSON.stringify(planSetup(base))
  assert.ok(!/password|secret/i.test(text))
  assert.ok(!text.includes('git clone'), 'no clone step any more')
})

test('the lookup runs the released CLI through uvx, or the older clone when one is configured', () => {
  const [cmd, args] = searchCommand({ envFile: '/c/.env', legacyDir: '' }, 'project = JEV')
  assert.equal(cmd, 'uvx')
  assert.deepEqual(args.slice(0, 4), ['--env-file', '/c/.env', '--from', SW_GIT])
  assert.equal(args[args.length - 2], 'search')
  const [cmd2, args2, cwd2] = searchCommand({ envFile: '/c/.env', legacyDir: '/clone' }, 'project = JEV')
  assert.equal(cmd2, 'uv')
  assert.equal(cwd2, '/clone')
  assert.ok(args2.includes('.env'))
  for (const a of [args, args2]) assert.ok(!a.some((x: string) => /transition|comment|create|rollup|add-subtasks/.test(x)))
})

test('doctor --json on a scratch repo infers the project and flags what is missing', () => {
  const dir = repoWith(['JEV-1 start', 'JEV-2 more', 'chore'])
  const r = spawnSync('node', [CLI, 'doctor', '--json', '--repo', dir, '--creds', join(dir, 'nope.env')], { env: cleanEnv(), encoding: 'utf8' })
  const list = JSON.parse(r.stdout) as { level: string; text: string }[]
  assert.ok(list.some((c) => c.text.startsWith('git repo')))
  assert.ok(list.some((c) => c.text.includes('git history suggests JEV')))
})

test('setup --dry-run prints a plan and changes nothing', () => {
  const dir = repoWith(['JEV-1 a', 'JEV-2 b'])
  const r = spawnSync('node', [CLI, 'setup', '--dry-run', '--repo', dir, '--creds', join(dir, 'nope.env')], { env: cleanEnv(), encoding: 'utf8' })
  assert.match(r.stdout, /Setup plan:/)
  assert.match(r.stdout, /WALKMAN_JIRA_PROJECT=JEV/)
  assert.ok(!existsSync(join(dir, '.claude', 'settings.json')))
})

test('setup without a terminal and without --yes applies nothing', () => {
  const dir = repoWith(['JEV-1 a', 'JEV-2 b'])
  const r = spawnSync('node', [CLI, 'setup', '--repo', dir, '--creds', join(dir, 'nope.env')], { env: cleanEnv(), encoding: 'utf8', input: '' })
  assert.equal(r.status, 2)
  assert.match(r.stdout, /nothing changed/i)
  assert.ok(!existsSync(join(dir, '.claude')))
})

test('card creates the worktree and branch for a Jira key', () => {
  const dir = repoWith(['init'])
  mkdirSync(join(dir, '.claude'), { recursive: true })
  const r = spawnSync('node', [CLI, 'card', 'JEV-47', 'withhold secrets', '--repo', dir, '--creds', join(dir, 'nope.env')], { env: cleanEnv(), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(existsSync(join(dir, '.claude', 'worktrees', 'jev-47-withhold-secrets')))
  assert.match(sh(dir, 'branch', '--list', 'JEV-47-withhold-secrets').stdout, /JEV-47-withhold-secrets/)
  const bad = spawnSync('node', [CLI, 'card', 'nope', '--repo', dir], { env: cleanEnv(), encoding: 'utf8' })
  assert.equal(bad.status, 1)
})

test('the CLI runs when started through a symlink (how npx and npm link start it)', () => {
  const dir = tmp()
  const link = join(dir, 'symphony-walkman')
  symlinkSync(CLI, link)
  const r = spawnSync('node', [link, 'help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /symphony-walkman setup CLI/)
})

test('migrating credentials copies only the three Jira variables, never the rest of the file', () => {
  const text = 'SYMPHONY_WORKFLOW_TARGET_REPO=/some/repo\nJIRA_BASE_URL=https://x.atlassian.net\n# note\nexport JIRA_EMAIL=me@x.com\nJIRA_API_TOKEN="tok"\nOTHER_SECRET=nope\n'
  const out = pickJiraEnv(text)
  assert.equal(out, 'JIRA_BASE_URL=https://x.atlassian.net\nexport JIRA_EMAIL=me@x.com\nJIRA_API_TOKEN="tok"\n')
  assert.ok(!out.includes('OTHER_SECRET') && !out.includes('TARGET_REPO'))
  assert.equal(pickJiraEnv('FOO=1\n'), '')
})

test('terminal color codes in a credentials file are detected', () => {
  assert.ok(hasAnsi('\u001b[01;31m\u001b[KJIRA_BASE_URL\u001b[m\u001b[K=https://x'))
  assert.ok(!hasAnsi('JIRA_BASE_URL=https://x.atlassian.net\n'))
})

test('doctor names color codes in the credentials file instead of saying it is missing', () => {
  const dir = repoWith(['init'])
  const env = join(dir, 'colored.env')
  writeFileSync(env, '\u001b[01;31m\u001b[KJIRA_BASE_URL\u001b[m\u001b[K=https://x.atlassian.net\n')
  const r = spawnSync('node', [CLI, 'doctor', '--json', '--repo', dir, '--creds', env], { env: cleanEnv(), encoding: 'utf8' })
  const list = JSON.parse(r.stdout) as { level: string; text: string; fix: string }[]
  const hit = list.find((c) => c.text.includes('color codes'))
  assert.ok(hit, r.stdout)
  assert.equal(hit.level, 'bad')
  assert.match(hit.fix, /perl -pi/)
  assert.ok(!list.some((c) => c.text.startsWith('no Jira credentials file')))
})

test('card without a slug does not run the full doctor survey (claude, uvx) just to look up a title', () => {
  const dir = repoWith(['init'])
  const bin = tmp()
  const marker = join(bin, 'ran')
  for (const name of ['claude', 'uv', 'uvx']) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho ${name} >> ${marker}\nexit 1\n`)
    chmodSync(join(bin, name), 0o755)
  }
  const r = spawnSync('node', [CLI, 'card', 'JEV-47', '--repo', dir, '--creds', join(dir, 'nope.env')], { env: cleanEnv(), encoding: 'utf8', env: { ...cleanEnv(), PATH: bin + ':' + process.env.PATH } })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(!existsSync(marker), 'card must not call claude, uv or uvx when there are no credentials to use')
})

test('configure plans one setting per repo: keep what is set, infer the rest, ask for the unknown', () => {
  const facts = {
    target: 'settings.local.json',
    repos: [
      { name: 'a', path: '/r/a', current: '', inferred: 'ABC', inferredOk: true, override: '' },
      { name: 'f', path: '/r/f', current: '', inferred: 'BUG', inferredOk: false, override: '' },
      { name: 'b', path: '/r/b', current: 'XYZ', inferred: '', inferredOk: false, override: '' },
      { name: 'c', path: '/r/c', current: '', inferred: '', inferredOk: false, override: '' },
      { name: 'd', path: '/r/d', current: 'OLD', inferred: '', inferredOk: false, override: 'NEW' },
      { name: 'e', path: '/r/e', current: '', inferred: 'ABC', inferredOk: true, override: 'EEE' },
    ],
    global: { marketplace: 'present', autoUpdate: false, jiraProject: 'JEV', credsOk: true },
    dropGlobalProject: false,
  }
  const plan = planConfigure(facts)
  const writes = plan.steps.filter((st: { write?: unknown }) => st.write).map((st: { write: { file: string; value: string } }) => [st.write.file, st.write.value])
  assert.deepEqual(writes, [['/r/a/.claude/settings.local.json', 'ABC'], ['/r/d/.claude/settings.local.json', 'NEW'], ['/r/e/.claude/settings.local.json', 'EEE']])
  assert.ok(plan.steps.some((st: { id: string }) => st.id === 'autoupdate'))
  assert.ok(!plan.steps.some((st: { id: string }) => st.id === 'drop-global-project'), 'a global project is reported, not removed, unless asked')
  const notes = plan.notes.join('\n')
  assert.deepEqual(plan.none, ['c'])
  assert.match(notes, /f: BUG appears in git history but no Jira project BUG with issues was found.*--set f=BUG/)
  assert.ok(!plan.steps.some((st: { id: string }) => st.id === 'repo:f'), 'a guess Jira does not confirm is never applied')
  assert.match(notes, /jira_project=JEV.*--drop-global-project/)
  assert.deepEqual(plan.keep, ['b'])
  const dropped = planConfigure({ ...facts, dropGlobalProject: true })
  assert.ok(dropped.steps.some((st: { id: string }) => st.id === 'drop-global-project'))
  const done = planConfigure({ ...facts, repos: [facts.repos[1]], global: { marketplace: 'present', autoUpdate: true, jiraProject: '', credsOk: true } })
  assert.deepEqual(done.steps, [])
})

test('the global settings edits keep every other key', () => {
  const json = { theme: 'dark', extraKnownMarketplaces: { other: { source: 1 }, 'symphony-walkman': { source: { repo: 'x' } } }, pluginConfigs: { 'symphony-walkman@symphony-walkman': { options: { jira_project: 'JEV', jira_env_file: '/e' } }, 'o@o': { options: { a: 1 } } } }
  const on = withAutoUpdate(json)
  assert.equal(on.extraKnownMarketplaces['symphony-walkman'].autoUpdate, true)
  assert.deepEqual(on.extraKnownMarketplaces.other, { source: 1 })
  assert.equal(on.theme, 'dark')
  const off = withoutGlobalProject(json)
  assert.deepEqual(off.pluginConfigs['symphony-walkman@symphony-walkman'].options, { jira_env_file: '/e' })
  assert.deepEqual(off.pluginConfigs['o@o'], { options: { a: 1 } })
  assert.equal(json.pluginConfigs['symphony-walkman@symphony-walkman'].options.jira_project, 'JEV') // the input is not mutated
})

test('configure on a folder of repos: dry run changes nothing, --yes writes only the local files and the asked global edits', () => {
  const root = tmp()
  const mk = (name: string, commits: string[]) => {
    const dir = join(root, name)
    mkdirSync(dir)
    sh(dir, 'init', '-q', '-b', 'main')
    for (const c of commits) sh(dir, '-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', c)
    return dir
  }
  const a = mk('a', ['ABC-1 one', 'ABC-2 two'])
  const b = mk('b', ['XYZ-1 x', 'XYZ-2 y'])
  mkdirSync(join(b, '.claude'))
  writeFileSync(join(b, '.claude', 'settings.local.json'), JSON.stringify({ env: { WALKMAN_JIRA_PROJECT: 'KEEP' }, permissions: { allow: ['x'] } }))
  const c = mk('c', ['no key here'])
  mkdirSync(join(root, 'not-a-repo'))
  assert.deepEqual(listRepos(root).map((p: string) => p.split('/').pop()), ['a', 'b', 'c'])

  const home = tmp()
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ theme: 'dark', extraKnownMarketplaces: { 'symphony-walkman': { source: { source: 'github', repo: 'cloud-f1/symphony-walkman' } } }, pluginConfigs: { 'symphony-walkman@symphony-walkman': { options: { jira_project: 'JEV' } } } }))
  const run = (...extra: string[]) => spawnSync('node', [CLI, 'configure', '--root', root, '--claude-home', home, '--creds', join(home, 'nope.env'), ...extra], { env: cleanEnv(), encoding: 'utf8', input: '' })

  const dry = run('--dry-run', '--no-verify')
  assert.equal(dry.status, 0, dry.stderr + dry.stdout)
  assert.match(dry.stdout, /a: set WALKMAN_JIRA_PROJECT=ABC/)
  assert.ok(!existsSync(join(a, '.claude')))
  assert.equal(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).extraKnownMarketplaces['symphony-walkman'].autoUpdate, undefined)

  const unverified = run('--dry-run')
  assert.equal(unverified.status, 0, unverified.stderr)
  assert.match(unverified.stdout, /a: ABC appears in git history but no Jira project ABC with issues was found/)
  assert.ok(!/a: set WALKMAN_JIRA_PROJECT/.test(unverified.stdout), 'without credentials a guess is not applied')
  assert.match(unverified.stdout, /… 1 more with no Jira project found/)

  const noTty = run('--no-verify')
  assert.equal(noTty.status, 2)
  assert.ok(!existsSync(join(a, '.claude')))

  const r = run('--yes', '--drop-global-project', '--no-verify', '--set', 'c=CCC')
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.equal(JSON.parse(readFileSync(join(a, '.claude', 'settings.local.json'), 'utf8')).env.WALKMAN_JIRA_PROJECT, 'ABC')
  assert.equal(JSON.parse(readFileSync(join(c, '.claude', 'settings.local.json'), 'utf8')).env.WALKMAN_JIRA_PROJECT, 'CCC')
  const kept = JSON.parse(readFileSync(join(b, '.claude', 'settings.local.json'), 'utf8'))
  assert.equal(kept.env.WALKMAN_JIRA_PROJECT, 'KEEP') // already set: left alone
  assert.deepEqual(kept.permissions, { allow: ['x'] })
  const g = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'))
  assert.equal(g.extraKnownMarketplaces['symphony-walkman'].autoUpdate, true)
  assert.equal(g.pluginConfigs['symphony-walkman@symphony-walkman'].options.jira_project, undefined)
  assert.equal(g.theme, 'dark')
  assert.ok(!r.stdout.includes('tok'), 'no credential is printed')
})

test('configure never runs code from a directory that a scanned repo names in its own settings', () => {
  const root = tmp()
  const repo = join(root, 'a-hostile') // first in the folder: the old code took the credentials source from here
  mkdirSync(repo)
  sh(repo, 'init', '-q', '-b', 'main')
  for (const c of ['ABC-1 one', 'ABC-2 two']) sh(repo, '-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', c)
  // a "clone" with a complete .env: if configure honored the repo's setting it would verify ABC by running `uv` there
  const clone = join(root, 'evil-clone')
  mkdirSync(clone)
  writeFileSync(join(clone, 'pyproject.toml'), 'name = "symphony-workflow"\n')
  writeFileSync(join(clone, '.env'), 'JIRA_BASE_URL=https://x.atlassian.net\nJIRA_EMAIL=a@b.c\nJIRA_API_TOKEN=t\n')
  mkdirSync(join(repo, '.claude'))
  writeFileSync(join(repo, '.claude', 'settings.local.json'), JSON.stringify({ env: { WALKMAN_SYMPHONY_WORKFLOW_DIR: clone } }))
  const bad = join(root, 'b-badproject')
  mkdirSync(join(bad, '.claude'), { recursive: true })
  sh(bad, 'init', '-q', '-b', 'main')
  writeFileSync(join(bad, '.claude', 'settings.local.json'), JSON.stringify({ env: { WALKMAN_JIRA_PROJECT: 'BAD\u001b[31mX' } }))
  const bin = tmp()
  const marker = join(bin, 'ran')
  for (const name of ['uv', 'uvx']) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho ${name} >> ${marker}\nexit 1\n`)
    chmodSync(join(bin, name), 0o755)
  }
  const home = tmp()
  const r = spawnSync('node', [CLI, 'configure', '--root', root, '--claude-home', home, '--dry-run'], { encoding: 'utf8', env: { ...cleanEnv(), HOME: home, PATH: bin + ':' + process.env.PATH } })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(!existsSync(marker), 'no uv or uvx may run: the repo-supplied clone is ignored and there are no credentials of your own')
  assert.ok(!r.stdout.includes('\u001b'), 'a setting from a scanned repo is not printed unless it is a valid project key')
})
