import type { CardRow, Light } from './contracts.ts'
import { clipCells, formatMinutes, plainText } from './style.ts'
import type { PaneBox, PaneLine, Seg, Tone } from './style.ts'

// The terminal pedestrian signal (WALK-179): the Taiwan crossing light's green man, drawn from half blocks so every
// terminal shows it (herdr passes no pictures). Pure: the frame comes from the clock value the adapter hands in.

// Each figure is a 10 x 14 pixel bitmap in side view, facing right like the Taiwan crossing light: head forward, body
// leaning, arms swinging, a long stride. Two pixel rows share one text row (▀ top, ▄ bottom, █ both).
const WALK_A = [ // stride: back foot left, front foot right, front arm up
  '......##..', '.....####.', '.....####.', '......##..', '.....##...', '....####..', '...######.',
  '..#.###..#', '.#..###...', '#...###...', '....####..', '...##..##.', '..##....##', '##.......#',
]
const WALK_B = [ // passing: legs close, arms by the body
  '......##..', '.....####.', '.....####.', '......##..', '.....##...', '....####..', '....####..',
  '...#.###..', '...#.###..', '.....###..', '....####..', '....##.#..', '...##..#..', '...#...##.',
]
const STAND = [ // the standing man: upright, arms down, feet together
  '.....##...', '....####..', '....####..', '.....##...', '....####..', '...######.', '...######.',
  '..#.####.#', '..#.####.#', '....####..', '....##.##.', '....##.##.', '....##.##.', '...###.###',
]

// The countdown above the man, in a 3 x 5 pixel font (a 6th empty pixel row closes the last half block).
const FONT: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '..#', '..#', '..#'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'], ' ': ['...', '...', '...', '...', '...'],
}
// Two digits, right aligned (a single digit leaves the tens dark), at most 99: 3 text rows, 7 cells.
export function bigDigits(n: number): string[] {
  const v = Math.min(99, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)))
  const [a, b] = String(v).padStart(2, ' ')
  const rows = [0, 1, 2, 3, 4, 5].map((y) => (y < 5 ? (FONT[a as string] as string[])[y] + '.' + (FONT[b as string] as string[])[y] : '.......'))
  return sprite(rows)
}

export const SIGNAL_ROWS = 7
// Frames per step: 2 a second normally, 4 near the end (the Taiwan man hurries as the countdown runs out).
export const FRAME_MS = { slow: 500, fast: 250 } as const
export type Pace = keyof typeof FRAME_MS

export function sprite(bitmap: readonly string[]): string[] {
  const out: string[] = []
  for (let y = 0; y < bitmap.length; y += 2) {
    const top = bitmap[y] ?? ''
    const bottom = bitmap[y + 1] ?? ''
    let line = ''
    for (let x = 0; x < Math.max(top.length, bottom.length); x++) {
      const t = top[x] === '#'
      const b = bottom[x] === '#'
      line += t && b ? '█' : t ? '▀' : b ? '▄' : ' '
    }
    out.push(line)
  }
  return out
}

const FIGURES = { walkA: sprite(WALK_A), walkB: sprite(WALK_B), stand: sprite(STAND) }

const SIGNAL_TONE: Record<Light, Tone> = { walking: 'success', waiting: 'warning', failed: 'error', done: 'success', idle: 'subtle' }

// The figure for a light at a clock value. Only the walking man changes drawing; a failed man blinks by tone.
export function signalFrame(light: Light, now: number, pace: Pace): { figure: string[]; tone: Tone } {
  const tick = Math.floor(Math.max(0, now) / FRAME_MS[pace])
  if (light === 'walking') return { figure: tick % 2 === 0 ? FIGURES.walkA : FIGURES.walkB, tone: 'success' }
  if (light === 'failed') return { figure: FIGURES.stand, tone: tick % 2 === 0 ? 'error' : 'subtle' }
  return { figure: FIGURES.stand, tone: light === 'done' ? 'subtle' : SIGNAL_TONE[light] }
}

// What "near the end" means: three quarters of the card's step list (TodoWrite) are done. Without a list the pace
// stays slow; a card that is not walking never hurries.
export function signalPace(lead: CardRow | undefined): Pace {
  if (!lead || lead.light !== 'walking' || !lead.todo || lead.todo.total <= 0) return 'slow'
  return lead.todo.done / lead.todo.total >= 0.75 ? 'fast' : 'slow'
}

// The card the signal stands for: what needs you, then what failed, then the longest running.
export function leadOf(rows: readonly CardRow[]): CardRow | undefined {
  const oldest = (l: Light) => rows.filter((r) => r.light === l).sort((a, b) => a.sinceMs - b.sinceMs)[0]
  return oldest('waiting') ?? oldest('failed') ?? oldest('walking')
}

// The countdown every surface shows (the terminal's big digits, Desktop's SVG): the steps left while a card walks
// through a TodoWrite list, else the whole minutes since its light changed.
export function signalNumber(lead: CardRow, now: number): number {
  const steps = lead.light === 'walking' && lead.todo && lead.todo.total > 0 ? lead.todo.total - lead.todo.done : undefined
  return steps ?? Math.floor((now - lead.sinceMs) / 60_000)
}

const STATE: Record<Light, string> = { walking: 'walking', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'quiet' }
const BOX: PaneBox = { id: -1, style: 'round', tone: 'subtle' }

// The signal box under the pane's title: the figure, then the card, its state and the countdown.
// `width` is the pane's own width (one cell of padding each side, then the box border).
export function signalLines(lead: CardRow | undefined, now: number, width: number): PaneLine[] {
  const light: Light = lead?.light ?? 'idle'
  const pace = signalPace(lead)
  const frame = signalFrame(light, now, pace)
  const box: PaneBox = { ...BOX, tone: SIGNAL_TONE[light] }
  const room = Math.max(6, width - 4 - 10 - 2) // padding and border, the figure, the gap
  let text: Seg[][]
  if (!lead) {
    text = [[], [{ text: 'quiet', tone: 'subtle', bold: true }], [{ text: 'nothing is crossing', tone: 'subtle' }], [], [], [], []]
  } else {
    const steps = lead.todo && lead.todo.total > 0 ? lead.todo.total - lead.todo.done : undefined
    const counting = lead.light === 'walking' && steps !== undefined
    const number = signalNumber(lead, now)
    const count = counting ? `${steps} ${steps === 1 ? 'step' : 'steps'} left` : formatMinutes(now - lead.sinceMs)
    const hurry = pace === 'fast' ? ' · hurry' : ''
    text = [
      ...bigDigits(number).map((d): Seg[] => [{ text: d, tone: 'warning', bold: true }]), // amber, like the light above the man
      [{ text: clipCells(lead.key, room), bold: true }],
      [{ text: clipCells(plainText(lead.title ?? (lead.slug === '' ? lead.branch : lead.slug)), room), tone: 'subtle' }],
      [{ text: STATE[light], tone: SIGNAL_TONE[light], bold: true }, { text: hurry, tone: SIGNAL_TONE[light] }],
      [{ text: clipCells(count, room), tone: 'subtle' }],
    ]
  }
  return frame.figure.map((f, i) => ({ left: [{ text: f, tone: frame.tone, bold: true }, { text: '  ' }, ...(text[i] ?? [])], box }))
}
