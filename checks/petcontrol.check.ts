import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PET_APP, PET_ARGV, PET_PROCESS, PET_USAGE, parsePetAction, petReply } from '../core/petcontrol.ts'

test('no word asks if it runs, on and off are the commands, anything else is not', () => {
  assert.equal(parsePetAction(undefined), 'status')
  assert.equal(parsePetAction(''), 'status')
  assert.equal(parsePetAction('on'), 'on')
  assert.equal(parsePetAction('off'), 'off')
  for (const bad of ['ON', 'start', 'status', 'kill', 'on;rm', '--help']) assert.equal(parsePetAction(bad), undefined, bad)
})

test('the commands are fixed arguments: open the app, stop its process by exact name, ask for it by exact name', () => {
  assert.deepEqual(PET_ARGV.on, ['open', '-a', 'Walkman Pet'])
  assert.deepEqual(PET_ARGV.off, ['pkill', '-x', 'walkman-pet'])
  assert.deepEqual(PET_ARGV.status, ['pgrep', '-x', 'walkman-pet'])
  assert.equal(PET_APP, 'Walkman Pet')
  assert.equal(PET_PROCESS, 'walkman-pet')
  // nothing built from the person's text: every word is a constant
  for (const argv of Object.values(PET_ARGV)) for (const w of argv) assert.match(w, /^[A-Za-z -]+$/)
})

test('on: opened, or the app is missing and the answer says how to build it', () => {
  assert.match(petReply('on', { exitCode: 0 }, true), /pet is on/)
  const missing = petReply('on', { exitCode: 1 }, true)
  assert.match(missing, /not installed/)
  assert.match(missing, /npm run build:mac/)
})

test('off: stopped, was not running, or could not be stopped', () => {
  assert.match(petReply('off', { exitCode: 0 }, true), /pet is off/)
  assert.match(petReply('off', { exitCode: 1 }, true), /was not running/)
  assert.match(petReply('off', { exitCode: 2 }, true), /Could not stop the desktop pet \(exit 2\)/)
})

test('status: running, or not and how to start it', () => {
  assert.match(petReply('status', { exitCode: 0 }, true), /is running/)
  assert.match(petReply('status', { exitCode: 1 }, true), /not running.*pet on/)
})

test('off macOS, or when the command cannot run, it says so instead of guessing', () => {
  for (const a of ['on', 'off', 'status'] as const) {
    assert.match(petReply(a, { exitCode: 0 }, false), /macOS only/)
    assert.match(petReply(a, undefined, true), /Could not run that here/)
  }
  assert.match(PET_USAGE, /pet on/)
})
