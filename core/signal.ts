import type { CardRow, Light } from './contracts.ts'
import { clipCells, formatMinutes, plainText } from './style.ts'
import type { PaneBox, PaneLine, Seg, Tone } from './style.ts'

// The terminal pedestrian signal (WALK-179): the Taiwan crossing light's green man, drawn from half blocks so every
// terminal shows it (herdr passes no pictures). Pure: the frame comes from the clock value the adapter hands in.

// Each figure is a 6 x 8 pixel bitmap; two pixel rows share one text row (▀ top, ▄ bottom, █ both).
const WALK_A = ['..##..', '..##..', '.####.', '#.##.#', '..##..', '.#..#.', '.#..#.', '#....#'] // legs apart
const WALK_B = ['..##..', '..##..', '.####.', '.###..', '..##..', '..##..', '..#.#.', '..#..#'] // legs passing
const STAND = ['..##..', '..##..', '.####.', '#.##.#', '#.##.#', '..##..', '.#..#.', '.#..#.']

export const SIGNAL_ROWS = 4
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

const STATE: Record<Light, string> = { walking: 'walking', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'quiet' }
const BOX: PaneBox = { id: -1, style: 'round', tone: 'subtle' }

// The signal box under the pane's title: the figure, then the card, its state and the countdown.
// `width` is the pane's own width (one cell of padding each side, then the box border).
export function signalLines(lead: CardRow | undefined, now: number, width: number): PaneLine[] {
  const light: Light = lead?.light ?? 'idle'
  const pace = signalPace(lead)
  const frame = signalFrame(light, now, pace)
  const box: PaneBox = { ...BOX, tone: SIGNAL_TONE[light] }
  const room = Math.max(6, width - 4 - 6 - 2) // padding and border, the figure, the gap
  let text: Seg[][]
  if (!lead) {
    text = [[{ text: 'quiet', tone: 'subtle', bold: true }], [{ text: 'nothing is crossing', tone: 'subtle' }], [], []]
  } else {
    const steps = lead.todo && lead.todo.total > 0 ? lead.todo.total - lead.todo.done : undefined
    const count = lead.light === 'walking' && steps !== undefined ? `${steps} ${steps === 1 ? 'step' : 'steps'} left` : formatMinutes(now - lead.sinceMs)
    const hurry = pace === 'fast' ? ' · hurry' : ''
    text = [
      [{ text: clipCells(lead.key, room), bold: true }],
      [{ text: clipCells(plainText(lead.title ?? (lead.slug === '' ? lead.branch : lead.slug)), room), tone: 'subtle' }],
      [{ text: STATE[light], tone: SIGNAL_TONE[light], bold: true }],
      [{ text: clipCells(count + hurry, room), tone: SIGNAL_TONE[light] }],
    ]
  }
  return frame.figure.map((f, i) => ({ left: [{ text: f, tone: frame.tone, bold: true }, { text: '  ' }, ...(text[i] ?? [])], box }))
}
