import type { CardRow, Light } from './contracts.ts'
import { clipCells, cells } from './style.ts'
import { sprite } from './signal.ts'
import type { PaneLine, Seg, Tone } from './style.ts'

// The playground (WALK-188, redrawn in WALK-222): one runner per running card laps an oval track in the pane's
// free rows, in the card's own colour. Runners are 3 x 2 half-block figures (braille dots were near invisible in
// Ghostty). Pure: places come from the clock value the adapter hands in, never from state kept here.
//
//   ╭──────────────────────────────────╮      row 0: the rim
//  ╱  ▄█▄       ▄█▄  ←                  ╲     rows 1-2: the top straight (runners go left: counterclockwise)
// │   ▀▄▀       ▄▀▄                      │
// │▄█▄ ╭────────────────────────────╮    │    rows 3..H-4: the bends, three cells wide, around the infield
// │▀▄▀ │ WALK-12  WALK-15 ⚠        │    │    the infield: name tags in each card's colour
// │    ╰────────────────────────────╯    │
//  ╲        ▄█▄          →             ╱     rows H-3..H-2: the bottom straight (runners go right)
//   ╰──────────────────────────────────╯      row H-1: the rim

export const TRACK_MIN_ROWS = 10 // rim, two straight rows, infield top, two infield rows, infield bottom, two straight rows, rim
export const TRACK_MIN_COLUMNS = 24
export const TRACK_ROWS = 12 // what the pane keeps for the playground while cards run
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

// A runner: a 3 x 4 pixel figure, two pixel rows to a half-block row, so 3 cells by 2 rows. Facing right; a woman
// wears a skirt (the third pixel row is full).
const FIG = {
  manA: ['.#.', '###', '.#.', '#.#'], manB: ['.#.', '###', '.#.', '.##'], // stride, then passing (front foot under, back foot behind)
  womanA: ['.#.', '###', '###', '#.#'], womanB: ['.#.', '###', '###', '.##'],
  manStand: ['.#.', '###', '.#.', '#.#'], womanStand: ['.#.', '###', '###', '#.#'],
  fallen: ['...', '...', '..#', '###'],
}
const mirror = (b: readonly string[]) => b.map((r) => [...r].reverse().join(''))

export type Runner = { key: string; light: Light; tone: CardTone; woman: boolean; speed: number; pos: number; x: number; y: number; right: boolean; glyph: string[] }

// The lap: every top-left cell a runner (3 x 2 cells) takes, counterclockwise from the top right (top straight going
// left, down the left bend, bottom straight going right, up the right bend), and which way it faces there. It keeps
// clear of the rim: the straights stop short of the slanted corners (columns 1 and W-2) and the bends run only
// between the straights, next to the side walls (columns 0 and W-1).
function lapOf(width: number, height: number): { x: number; y: number; right: boolean }[] {
  const first = 2 // first straight column clear of the left slant
  const last = width - 5 // last straight column whose 3 cells end before the right slant
  const top = 1
  const bottom = height - 3
  const out: { x: number; y: number; right: boolean }[] = []
  for (let x = last; x >= first; x--) out.push({ x, y: top, right: false })
  for (let y = top + 1; y < bottom; y++) out.push({ x: 1, y, right: false })
  for (let x = first; x <= last; x++) out.push({ x, y: bottom, right: true })
  for (let y = bottom - 1; y > top; y--) out.push({ x: width - 4, y, right: true })
  return out
}
export const lapLength = (width: number, height: number): number => lapOf(width, height).length

export function runnerOf(r: CardRow, now: number, width: number, height: number): Runner {
  const h = hash(r.key)
  const lap = lapOf(width, height)
  const near = r.light === 'walking' && r.todo !== undefined && r.todo.total > 0 && r.todo.done / r.todo.total >= 0.75
  const speed = (Math.round(BASE_SPEED * (80 + ((h >>> 8) % 41))) / 100) * (near ? 1.5 : 1) // 3.2 to 4.8 cells a second
  const at = r.light === 'walking' ? now : r.sinceMs // a stopped runner stays where it stopped
  const pos = Math.floor((Math.max(0, at) / 1000) * speed + (h % lap.length)) % lap.length
  const woman = ((h >>> 4) & 1) === 1
  const place = lap[pos] as { x: number; y: number; right: boolean }
  const step = Math.floor(Math.max(0, now) / FRAME_MS) % 2 === 0
  const bitmap =
    r.light === 'failed' ? FIG.fallen : r.light === 'waiting' ? (woman ? FIG.womanStand : FIG.manStand) : woman ? (step ? FIG.womanA : FIG.womanB) : step ? FIG.manA : FIG.manB
  return { key: r.key, light: r.light, tone: cardTone(r.key), woman, speed, pos, x: place.x, y: place.y, right: place.right, glyph: sprite(place.right ? bitmap : mirror(bitmap)) }
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
  // the rim: rounded at the top and bottom, slanted at the corners, so it reads as an oval
  put(2, 0, '╭'); put(W - 3, 0, '╮'); put(2, H - 1, '╰'); put(W - 3, H - 1, '╯')
  for (let x = 3; x < W - 3; x++) { put(x, 0, '─'); put(x, H - 1, '─') }
  put(1, 1, '╱'); put(W - 2, 1, '╲'); put(1, H - 2, '╲'); put(W - 2, H - 2, '╱')
  for (let y = 2; y < H - 2; y++) { put(0, y, '│'); put(W - 1, y, '│') }
  // the infield, inside the bends (three cells each side)
  const il = 5
  const ir = W - 6
  put(il, 3, '╭'); put(ir, 3, '╮'); put(il, H - 4, '╰'); put(ir, H - 4, '╯')
  for (let x = il + 1; x < ir; x++) { put(x, 3, '─'); put(x, H - 4, '─') }
  for (let y = 4; y < H - 4; y++) { put(il, y, '│'); put(ir, y, '│') }

  // name tags in the infield, in each card's colour, wrapped over its rows
  const shown = racing.slice(0, MAX_RUNNERS)
  const tones = trackTones(shown.map((r) => r.key))
  const inner = ir - il - 3 // inside the infield, less a cell of space each side
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
  // centred in the infield, both ways
  const shownTags = tags.slice(0, H - 8)
  const top0 = 4 + Math.floor((H - 8 - shownTags.length) / 2)
  shownTags.forEach((line, i) => {
    const len = line.reduce((n, s) => n + cells(s.text), 0)
    let x = il + 2 + Math.max(0, Math.floor((inner - len) / 2))
    for (const s of line) for (const ch of clipCells(s.text, Math.max(0, ir - 1 - x))) put(x++, top0 + i, ch, s.tone ?? 'text', s.bold === true)
  })

  // the runners (3 x 2 cells), then a stopped runner's mark just ahead of it
  for (const r of shown) {
    const run = runnerOf(r, now, W, H)
    const tone = tones.get(r.key) as CardTone
    run.glyph.forEach((line, dy) => [...line].forEach((ch, dx) => { if (ch !== ' ') put(run.x + dx, run.y + dy, ch, tone, true) }))
    const mark = MARK[r.light]
    // ahead of it, or behind it when ahead is the rim (the slants are on columns 1 and W-2)
    const ahead = run.right ? run.x + 3 : run.x - 1
    const markX = ahead > 1 && ahead < W - 2 ? ahead : run.right ? run.x - 1 : run.x + 3
    if (mark) put(markX, r.light === 'failed' ? run.y + 1 : run.y, mark.text, mark.tone, true) // a fallen runner lies on its lower row
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
