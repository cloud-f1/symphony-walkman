import type { CardRow, Light } from './contracts.ts'
import { clipCells, cells } from './style.ts'
import type { PaneLine, Seg, Tone } from './style.ts'

// The playground (WALK-188): one small runner per running card laps an oval track in the pane's free rows, in the
// card's own colour. Pure: places come from the clock value the adapter hands in, never from state kept here.
//
//  ╭────────────────────────────────╮     row 0: the outer rim
// ╱ ⠠⠷  →   ⢠⠷                      ╲    row 1: the top straight (runners go left: counterclockwise from above)
// │  ╭────────────────────────────╮  │    rows 2..H-3: the bends, two cells wide, inside an infield
// │  │ WALK-12  WALK-15 ⚠        │  │    the infield: name tags in each card's colour
// │  ╰────────────────────────────╯  │
// ╲   ⢠⠷                            ╱    row H-2: the bottom straight (runners go right)
//  ╰────────────────────────────────╯

export const TRACK_MIN_ROWS = 7 // rim, straight, infield top, one infield row, infield bottom, straight, rim
export const TRACK_MIN_COLUMNS = 20
export const MAX_RUNNERS = 8
const BASE_SPEED = 4 // cells a second
const FRAME_MS = 250

// Colours a card can own: theme keys that carry no status meaning (green, amber and red stay for status).
export const CARD_TONES = ['card0', 'card1', 'card2', 'card3', 'card4', 'card5'] as const
export type CardTone = (typeof CARD_TONES)[number]

// FNV-1a: a stable number per key, so a card keeps its colour, figure, speed and start line across redraws.
function hash(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0
  // FNV's low bits barely differ between WALK-12 and WALK-188: mix them (murmur3's finaliser) before taking a modulo
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
export const keyHash = (key: string): number => hash(key) // the SVG playground spreads pace the same way
export const cardTone = (key: string): CardTone => CARD_TONES[hash(key) % CARD_TONES.length] as CardTone

// Colours for the runners on one track: each card its own colour, the next free one when two cards hash alike
// (a stable set of cards keeps a stable set of colours). With more runners than colours, colours repeat.
export function trackTones(keys: readonly string[]): Map<string, CardTone> {
  const out = new Map<string, CardTone>()
  const taken = new Set<CardTone>()
  for (const key of [...keys].sort()) {
    let i = CARD_TONES.indexOf(cardTone(key))
    for (let n = 0; n < CARD_TONES.length && taken.has(CARD_TONES[i] as CardTone); n++) i = (i + 1) % CARD_TONES.length
    out.set(key, CARD_TONES[i] as CardTone)
    taken.add(CARD_TONES[i] as CardTone)
    if (taken.size === CARD_TONES.length) taken.clear() // every colour used once: start a second round
  }
  return out
}

// A 4 x 4 pixel figure as two braille cells (each cell is 2 x 4 dots).
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] as const
export function braille(bitmap: readonly string[]): string {
  let out = ''
  for (let c = 0; c < 2; c++) {
    let bits = 0
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) if ((bitmap[y] ?? '')[c * 2 + x] === '#') bits |= (DOT[y] as readonly number[])[x] as number
    out += String.fromCharCode(0x2800 + bits)
  }
  return out
}
const mirror = (b: readonly string[]) => b.map((r) => [...r].reverse().join(''))
// Facing right; a woman wears a skirt (the third row is full).
const FIG = {
  manA: ['..#.', '.###', '..#.', '.#.#'], manB: ['..#.', '.##.', '..#.', '..##'],
  womanA: ['..#.', '.###', '.###', '.#.#'], womanB: ['..#.', '.##.', '.###', '..#.'],
  manStand: ['.#..', '###.', '.#..', '.#..'], womanStand: ['.#..', '###.', '###.', '.#..'],
  fallen: ['....', '....', '#...', '####'],
}

export type Runner = { key: string; light: Light; tone: CardTone; woman: boolean; speed: number; pos: number; x: number; y: number; glyph: string }

export const lapLength = (width: number, height: number): number => 2 * (width - 3) + 2 * (height - 4)

// Where a lap position sits: x of the runner's first cell, the row, and which way it faces.
function placeOf(pos: number, width: number, height: number): { x: number; y: number; right: boolean } {
  const straight = width - 3
  const bend = height - 4
  if (pos < straight) return { x: width - 3 - pos, y: 1, right: false } // top straight, going left
  if (pos < straight + bend) return { x: 1, y: 2 + (pos - straight), right: false } // left bend, going down
  if (pos < 2 * straight + bend) return { x: 1 + (pos - straight - bend), y: height - 2, right: true } // bottom, going right
  return { x: width - 3, y: height - 3 - (pos - 2 * straight - bend), right: true } // right bend, going up
}

export function runnerOf(r: CardRow, now: number, width: number, height: number): Runner {
  const h = hash(r.key)
  const lap = lapLength(width, height)
  const near = r.light === 'walking' && r.todo !== undefined && r.todo.total > 0 && r.todo.done / r.todo.total >= 0.75
  const speed = (Math.round(BASE_SPEED * (80 + ((h >>> 8) % 41))) / 100) * (near ? 1.5 : 1) // 3.2 to 4.8 cells a second
  const at = r.light === 'walking' ? now : r.sinceMs // a stopped runner stays where it stopped
  const pos = Math.floor((Math.max(0, at) / 1000) * speed + (h % lap)) % lap
  const woman = ((h >>> 4) & 1) === 1
  const place = placeOf(pos, width, height)
  const step = Math.floor(Math.max(0, now) / FRAME_MS) % 2 === 0
  const bitmap =
    r.light === 'failed' ? FIG.fallen : r.light === 'waiting' ? (woman ? FIG.womanStand : FIG.manStand) : woman ? (step ? FIG.womanA : FIG.womanB) : step ? FIG.manA : FIG.manB
  return { key: r.key, light: r.light, tone: cardTone(r.key), woman, speed, pos, x: place.x, y: place.y, glyph: braille(place.right ? bitmap : mirror(bitmap)) }
}

const MARK: Partial<Record<Light, Seg>> = { waiting: { text: '⚠', tone: 'warning', bold: true }, failed: { text: '✕', tone: 'error', bold: true } }

// The playground for the cards that run, need you or failed, sized to `width` x `height`; nothing when none runs or
// the room is too small.
export function playground(rows: readonly CardRow[], now: number, width: number, height: number): PaneLine[] {
  const racing = rows.filter((r) => r.light === 'walking' || r.light === 'waiting' || r.light === 'failed').sort((a, b) => a.key.localeCompare(b.key))
  if (racing.length === 0 || height < TRACK_MIN_ROWS || width < TRACK_MIN_COLUMNS) return []
  const W = width
  const H = height
  type Cell = { ch: string; tone: Tone; bold?: boolean }
  const rim: Tone = 'subtle'
  const grid: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, (): Cell => ({ ch: ' ', tone: rim })))
  const put = (x: number, y: number, ch: string, tone: Tone = rim, bold = false) => {
    if (y >= 0 && y < H && x >= 0 && x < W) (grid[y] as Cell[])[x] = { ch, tone, bold }
  }
  // the outer rim, rounded at the ends
  put(1, 0, '╭'); put(W - 2, 0, '╮'); put(1, H - 1, '╰'); put(W - 2, H - 1, '╯')
  for (let x = 2; x < W - 2; x++) { put(x, 0, '─'); put(x, H - 1, '─') }
  put(0, 1, '╱'); put(W - 1, 1, '╲'); put(0, H - 2, '╲'); put(W - 1, H - 2, '╱')
  for (let y = 2; y < H - 2; y++) { put(0, y, '│'); put(W - 1, y, '│') }
  // the infield
  put(3, 2, '╭'); put(W - 4, 2, '╮'); put(3, H - 3, '╰'); put(W - 4, H - 3, '╯')
  for (let x = 4; x < W - 4; x++) { put(x, 2, '─'); put(x, H - 3, '─') }
  for (let y = 3; y < H - 3; y++) { put(3, y, '│'); put(W - 4, y, '│') }

  // name tags in the infield, in each card's colour, wrapped over its rows
  const shown = racing.slice(0, MAX_RUNNERS)
  const tones = trackTones(shown.map((r) => r.key))
  const inner = W - 10 // the infield's inside, less a cell of space each side
  const tags: Seg[][] = [[]]
  let used = 0
  const words: Seg[][] = shown.map((r) => [{ text: r.key, tone: tones.get(r.key) as CardTone, bold: true }, ...(MARK[r.light] ? [{ text: ' ' }, MARK[r.light] as Seg] : [])])
  if (racing.length > MAX_RUNNERS) words.push([{ text: `+${racing.length - MAX_RUNNERS}`, tone: 'subtle' }])
  for (const w of words) {
    const len = w.reduce((n, s) => n + cells(s.text), 0)
    if (used > 0 && used + 2 + len > inner) { tags.push([]); used = 0 }
    if (used > 0) (tags[tags.length - 1] as Seg[]).push({ text: '  ' })
    ;(tags[tags.length - 1] as Seg[]).push(...w)
    used += (used > 0 ? 2 : 0) + len
  }
  tags.slice(0, H - 6).forEach((line, i) => {
    let x = 5
    for (const s of line) for (const ch of clipCells(s.text, Math.max(0, W - 5 - x))) put(x++, 3 + i, ch, s.tone ?? 'text', s.bold === true)
  })

  // the runners, then a stopped runner's mark just ahead of it on a straight
  for (const r of shown) {
    const run = runnerOf(r, now, W, H)
    const [a, b] = [...run.glyph]
    const tone = tones.get(r.key) as CardTone
    put(run.x, run.y, a as string, tone, true)
    put(run.x + 1, run.y, b as string, tone, true)
    const mark = MARK[r.light]
    if (mark && (run.y === 1 || run.y === H - 2) && run.x + 2 <= W - 2) put(run.x + 2, run.y, mark.text, mark.tone, true)
  }

  // rows of cells into styled segments, one per run of the same tone
  return grid.map((cellsRow): PaneLine => {
    const segs: Seg[] = []
    for (const c of cellsRow) {
      const last = segs[segs.length - 1]
      if (last && last.tone === c.tone && (last.bold === true) === (c.bold === true)) last.text += c.ch
      else segs.push({ text: c.ch, tone: c.tone, ...(c.bold ? { bold: true } : {}) })
    }
    return { left: segs }
  })
}
