// Release gate. `npm run release:check` runs every gate and the audit and prints a report; nothing is written.
// `npm run release` runs the same check and, only when every line passed, tags v<version>, pushes the tag and
// publishes a GitHub Release whose notes are the report. A gate that cannot run counts as failed, never skipped.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditNoNetwork, auditPackage, auditReadOnly, auditRecordGuard, auditSecrets, auditVerified } from './audit.mjs'
import { isRecordName } from '../core/sessions.ts'
import { SW_REF, VERSION } from '../core/version.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts })
const tryRun = (cmd, args, opts) => {
  try {
    return { ok: true, out: run(cmd, args, opts) }
  } catch (err) {
    return { ok: false, out: String(err.stdout ?? '') + String(err.stderr ?? '') || String(err.message) }
  }
}

const results = [] // { gate, ok, detail }
const gate = (name, fn) => {
  try {
    const problems = fn()
    results.push({ gate: name, ok: problems.length === 0, detail: problems.length === 0 ? 'ok' : problems.join('; ') })
  } catch (err) {
    results.push({ gate: name, ok: false, detail: 'could not check: ' + String(err.message ?? err).split('\n')[0] })
  }
}

const version = json('.claude-plugin/plugin.json').version
const tag = 'v' + version

gate('git: on main, nothing uncommitted, equal to origin/main', () => {
  const p = []
  run('git', ['fetch', '-q', 'origin'])
  if (run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim() !== 'main') p.push('not on main')
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no']).trim()
  if (dirty) p.push('uncommitted changes: ' + dirty.split('\n').join(', '))
  if (run('git', ['rev-parse', 'HEAD']).trim() !== run('git', ['rev-parse', 'origin/main']).trim()) p.push('HEAD is not origin/main')
  return p
})

gate(`version: ${tag} is new and every place agrees`, () => {
  const p = []
  if (!/^\d+\.\d+\.\d+$/.test(version)) p.push(`plugin.json version "${version}" is not semver`)
  if (json('package.json').version !== version) p.push('package.json differs from plugin.json')
  if (VERSION !== version) p.push('core/version.ts VERSION differs from plugin.json')
  for (const e of json('.claude-plugin/marketplace.json').plugins) if (e.version !== undefined && e.version !== version) p.push(`marketplace.json pins ${e.name} at ${e.version}`)
  if (run('git', ['tag', '-l', tag]).trim()) p.push(`${tag} is already tagged here`)
  if (run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim()) p.push(`${tag} is already on origin`)
  return p
})

gate(`pin: symphony-workflow ${SW_REF} is a published tag, and the CLI pins the same`, () => {
  const p = []
  if (!read('cli/walkman.mjs').includes(`symphony-workflow@${SW_REF}'`)) p.push('cli/walkman.mjs pins another release')
  if (!run('git', ['ls-remote', '--tags', 'https://github.com/cloud-f1/symphony-workflow.git', `refs/tags/${SW_REF}`]).trim()) p.push(`${SW_REF} is not a tag of cloud-f1/symphony-workflow`)
  return p
})

gate('tests: core checks and Mod tests (npm test)', () => {
  const r = tryRun('npm', ['test'])
  return r.ok ? [] : ['npm test failed: ' + (r.out.match(/(\d+ fail|# fail \d+|not ok .*)/)?.[0] ?? r.out.trim().split('\n').slice(-3).join(' | '))]
})

gate('plugin: claude plugin validate --strict', () => {
  const r = tryRun('claude', ['plugin', 'validate', '--strict', '.'])
  return r.ok ? [] : ['validate failed: ' + r.out.trim().split('\n').slice(-3).join(' | ')]
})

gate('types: tsc finds no error in core/ and hooks/ (the code that ships)', () => {
  const tsc = join(root, 'node_modules/.bin/tsc')
  if (!existsSync(tsc)) return ['TypeScript is not installed here: run npm ci']
  if (!existsSync(join(root, '.claude-plugin/types/claude-code/index.d.ts'))) return ['the Mod API types are missing (.claude-plugin/types): open this repo in Claude Code once so it writes them']
  const r = tryRun(tsc, ['-p', 'tsconfig.plugin.json'])
  const shipped = r.out.split('\n').filter((l) => /^(core|hooks)\//.test(l))
  return shipped.length === 0 ? [] : shipped.slice(0, 5)
})

const register = read('hooks/register.ts')
const coreSources = readdirSync(join(root, 'core')).filter((f) => f.endsWith('.ts')).map((f) => read('core/' + f))
gate('audit: the Mod only searches Jira (read only)', () => auditReadOnly(register))
gate('audit: no network call of its own', () => auditNoNetwork([register, ...coreSources].join('\n')))
gate('audit: no secret-looking string in a tracked file', () => {
  const files = run('git', ['ls-files']).split('\n').filter(Boolean)
  return auditSecrets(files.filter((f) => existsSync(join(root, f))).map((f) => ({ path: f, text: readFileSync(join(root, f), 'latin1') })))
})
gate('audit: session records only through isRecordName, never a .key file', () => auditRecordGuard(register, isRecordName))
gate(`audit: the README says what was verified for ${version}`, () => auditVerified(read('README.md'), version))
gate('audit: the package is complete (manifest, marketplace, hooks, skills)', () => {
  const files = run('git', ['ls-files']).split('\n').filter(Boolean)
  const skills = readdirSync(join(root, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  return auditPackage({ plugin: json('.claude-plugin/plugin.json'), marketplace: json('.claude-plugin/marketplace.json'), files, skills })
})

const passed = results.every((r) => r.ok)
const verifiedRow = read('README.md').split('\n').find((l) => new RegExp(`^\\|[^|]*[ ,]${version.replace(/\./g, '\\.')} \\(`).test(l)) ?? ''
const report = [
  `## symphony-walkman ${tag} release check`,
  '',
  '| Gate | Result |',
  '|---|---|',
  ...results.map((r) => `| ${r.gate} | ${r.ok ? '✓' : '✗ ' + r.detail.replace(/\|/g, '/')} |`),
  '',
  passed ? `All ${results.length} gates passed.` : `${results.filter((r) => !r.ok).length} of ${results.length} gates failed: not releasable.`,
  ...(verifiedRow ? ['', '### Verified for this version', '', '| What | Result |', '|---|---|', verifiedRow] : []),
].join('\n')
console.log(report)

const mode = process.argv[2] ?? 'check'
if (!passed) process.exit(1)
if (mode === 'ship') {
  run('git', ['tag', '-a', tag, '-m', `${tag}: release (gate passed)`])
  run('git', ['push', 'origin', tag])
  const notes = join(mkdtempSync(join(tmpdir(), 'walkman-release-')), 'notes.md')
  writeFileSync(notes, report + '\n')
  run('gh', ['release', 'create', tag, '--title', tag, '--notes-file', notes])
  console.log(`\nReleased ${tag}: tag pushed, GitHub Release created.`)
}
