import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-ignore the release scripts are plain ESM JavaScript
import { auditNoNetwork, auditPackage, auditReadOnly, auditRecordGuard, auditSecrets, auditVerified } from '../scripts/audit.mjs'

test('read-only: every symphony-workflow call the Mod makes is a search', () => {
  const good = "runSw($, settings, ['search', jql])\nrunSw($, settings, ['call', 'search_issues', JSON.stringify(x)])"
  assert.deepEqual(auditReadOnly(good), [])
  assert.match(auditReadOnly("runSw($, s, ['transition', key, 'Done'])")[0], /transition/)
  assert.match(auditReadOnly("runSw($, s, ['call', 'update_issue', '{}'])")[0], /update_issue/)
  assert.match(auditReadOnly("$.process.run(['uvx', '--from', SW_GIT, 'symphony-workflow', 'rollup', k])")[0], /rollup/)
  assert.match(auditReadOnly('no symphony-workflow call at all')[0], /no symphony-workflow call found/)
})

test('no network of its own: no fetch, no http client in the Mod', () => {
  assert.deepEqual(auditNoNetwork('const x = 1'), [])
  assert.equal(auditNoNetwork('await fetch(url)').length, 1)
  assert.equal(auditNoNetwork('$.http.get(u)').length, 1)
})

test('secrets: a token-looking string in a tracked file fails, a placeholder does not', () => {
  assert.deepEqual(auditSecrets([{ path: 'a.md', text: 'JIRA_API_TOKEN=<your token>' }]), [])
  // built at run time, so this file holds nothing that looks like a secret to the release audit itself
  const fake = (head: string) => head + 'a1B2c3D4e5'.repeat(4)
  assert.equal(auditSecrets([{ path: 'a.ts', text: `const t = "${fake('ATA' + 'TT')}"` }]).length, 1)
  assert.equal(auditSecrets([{ path: 'b.env', text: `x ${fake('gh' + 'p_')} y` }]).length, 1)
  assert.equal(auditSecrets([{ path: 'c', text: '-----BEGIN OPENSSH ' + 'PRIVATE KEY-----' }]).length, 1)
  assert.equal(auditSecrets([{ path: 'd', text: fake('sk-' + 'ant-api03-') }]).length, 1)
})

test('session records are opened only through isRecordName, which never matches a .key file', () => {
  const src = "for (const entry of await $.fs.list(dir)) {\n  if (entry.kind !== 'file' || !isRecordName(entry.name)) continue\n  parseRecord(await $.fs.read(dir + '/' + entry.name))"
  const isRecordName = (n: string) => /^\d{1,10}\.json$/.test(n)
  assert.deepEqual(auditRecordGuard(src, isRecordName), [])
  assert.ok(auditRecordGuard(src, () => true).length > 0, 'a guard that lets .key through')
  assert.equal(auditRecordGuard("await $.fs.read(dir + '/' + entry.name)", isRecordName).length, 1, 'a read without the guard')
})

test('the README has a verified row for the version being released', () => {
  const readme = '| Board pane, 0.8.0 (real session, 2026-10-16) | Passed |\n| Thing, 0.10.0 (real session) | Passed |'
  assert.deepEqual(auditVerified(readme, '0.10.0'), [])
  assert.equal(auditVerified(readme, '0.11.0').length, 1)
  assert.equal(auditVerified(readme, '0.1.0').length, 1, '0.1.0 must not match 0.10.0')
})

test('package: the manifest, the marketplace entry, the hooks and every skill are there', () => {
  const ok = { plugin: { name: 'p', version: '1.0.0' }, marketplace: { plugins: [{ name: 'p', source: './' }] }, files: ['hooks/hooks.json', 'hooks/register.ts', 'skills/a/SKILL.md'], skills: ['a'] }
  assert.deepEqual(auditPackage(ok), [])
  assert.equal(auditPackage({ ...ok, marketplace: { plugins: [{ name: 'q', source: './' }] } }).length, 1)
  assert.equal(auditPackage({ ...ok, files: ['hooks/register.ts', 'skills/a/SKILL.md'] }).length, 1)
  assert.equal(auditPackage({ ...ok, skills: ['a', 'b'] }).length, 1)
})
