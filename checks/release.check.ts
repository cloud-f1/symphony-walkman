import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const json = (path: string) => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'))

// Claude Code only offers an update when the version string changes, so the manifest
// version must move on every release and must match package.json.
test('release: plugin.json and package.json carry the same semver version', () => {
  const plugin = json('.claude-plugin/plugin.json').version
  const pkg = json('package.json').version
  assert.match(plugin, /^\d+\.\d+\.\d+$/)
  assert.equal(plugin, pkg)
})

test('release: a version pinned in marketplace.json must match plugin.json', () => {
  const plugin = json('.claude-plugin/plugin.json').version
  for (const entry of json('.claude-plugin/marketplace.json').plugins) {
    if (entry.version !== undefined) assert.equal(entry.version, plugin)
  }
})
