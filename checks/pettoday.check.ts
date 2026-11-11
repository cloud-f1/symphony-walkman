import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PET_TODAY_FRESH_MS, localDay, parsePetToday, petTodayLine, petTodayPath } from '../core/pettoday.ts'

const NOW = 1_794_408_786_000
// the file walkman-pet writes (src-tauri/src/today.rs); the same text is tested there
const FILE = '{"breaks":6,"day":"2026-11-11","deskMs":685245,"schema":1,"writtenAt":1794408777910}\n'

test('the file lives at ~/.walkman/pet/today.json and an unreal home gets no path', () => {
  assert.equal(petTodayPath('/Users/a'), '/Users/a/.walkman/pet/today.json')
  assert.equal(petTodayPath('C:\\Users\\a\\'), 'C:/Users/a/.walkman/pet/today.json')
  assert.equal(petTodayPath('relative'), undefined)
  assert.equal(petTodayPath(''), undefined)
})

test('reads the pet\'s file for today while it is fresh', () => {
  assert.deepEqual(parsePetToday(FILE, NOW, '2026-11-11'), { deskMs: 685245, breaks: 6 })
})

test('another day, a quiet pet (an old file) or a file from the future is nothing', () => {
  assert.equal(parsePetToday(FILE, NOW, '2026-11-12'), undefined)
  assert.equal(parsePetToday(FILE, 1794408777910 + PET_TODAY_FRESH_MS + 1, '2026-11-11'), undefined)
  assert.equal(parsePetToday(FILE, 1794408777910 - 120_000, '2026-11-11'), undefined)
})

test('anything that is not the file is nothing', () => {
  for (const raw of ['', 'nope', '[]', 'null', '{"schema":2,"day":"2026-11-11","deskMs":1,"breaks":1,"writtenAt":1794408777910}', '{"schema":1,"day":"2026-11-11","deskMs":-1,"breaks":1,"writtenAt":1794408777910}', '{"schema":1,"day":"2026-11-11","deskMs":1,"breaks":1.5,"writtenAt":1794408777910}', '{"schema":1,"day":"2026-11-11","deskMs":"1","breaks":1,"writtenAt":1794408777910}', '{"schema":1,"day":"2026-11-11","deskMs":999999999,"breaks":1,"writtenAt":1794408777910}'])
    assert.equal(parsePetToday(raw, NOW, '2026-11-11'), undefined, raw)
})

test('one quiet line: the time at the desk and the breaks', () => {
  assert.deepEqual(petTodayLine({ deskMs: 200 * 60_000, breaks: 2 }), { left: [{ text: 'today at the desk ', tone: 'subtle' }, { text: '3 h 20 min', tone: 'text' }, { text: ' · 2 breaks', tone: 'subtle' }] })
  assert.deepEqual(petTodayLine({ deskMs: 25 * 60_000, breaks: 1 }).left.map((s) => s.text).join(''), 'today at the desk 25 min · 1 break')
  assert.deepEqual(petTodayLine({ deskMs: 60 * 60_000, breaks: 0 }).left.map((s) => s.text).join(''), 'today at the desk 1 h · 0 breaks')
})

test('the local day is YYYY-MM-DD', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})
