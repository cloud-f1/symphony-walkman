import type { CardRow, Light } from './contracts.ts'
import { MAX_RUNNERS, keyHash } from './track.ts'

// The playground for Claude Desktop (WALK-212): the text track falls apart there (its rows have gaps and it cuts
// rows with an ellipsis), so Desktop gets an SVG stadium where each running card's figure laps with SMIL
// animateMotion. Pure, and the markup holds no clock: while the cards keep their states a redraw gives the same SVG,
// so the animation runs on instead of restarting.

// One colour per card tone (card0..card5), dark enough for Desktop's light theme and its dark one.
// Eight colours, one per runner the track can hold, dark enough for Desktop's light theme and its dark one; none of
// them the status green, amber or red (WALK-217: six repeated, DEMO-13 and DEMO-16 were both pink).
export const CARD_HEX = ['#d77757', '#3b6fd8', '#2f8f86', '#8a5cf5', '#e0479e', '#8b5a2b', '#1aa3c8', '#7f8c1d'] as const

// Each card on the track its own colour: the one its key picks, or the next free one (stable for a set of cards).
function svgColours(keys: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<number>()
  for (const key of [...keys].sort()) {
    let i = keyHash(key) % CARD_HEX.length
    for (let n = 0; n < CARD_HEX.length && taken.has(i); n++) i = (i + 1) % CARD_HEX.length
    out.set(key, CARD_HEX[i] as string)
    taken.add(i)
    if (taken.size === CARD_HEX.length) taken.clear()
  }
  return out
}
const AMBER = '#d99a06'
const RED = '#e5484d'
const RIM = '#9ca3af'

const W = 320
const H = 150
const LAP_S = 14 // seconds a lap takes at the base pace
// The lane's centre line, counterclockwise from the top middle (top straight going left, left bend, bottom going right).
const LANE = 'M 160 23 H 78 A 52 52 0 0 0 78 127 H 242 A 52 52 0 0 0 242 23 Z'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function figure(color: string, woman: boolean, moving: boolean): string {
  const swing = (from: number, to: number) =>
    moving ? `<animateTransform attributeName="transform" type="rotate" values="${from} 0 0;${to} 0 0;${from} 0 0" dur="0.5s" repeatCount="indefinite"/>` : ''
  const legs = moving
    ? `<g transform="translate(0 1)"><line x1="0" y1="0" x2="0" y2="7">${swing(-30, 30)}</line></g><g transform="translate(0 1)"><line x1="0" y1="0" x2="0" y2="7">${swing(30, -30)}</line></g>`
    : '<line x1="0" y1="1" x2="-2" y2="8"/><line x1="0" y1="1" x2="2" y2="8"/>'
  const arms = moving
    ? `<g transform="translate(0 -4)"><line x1="0" y1="0" x2="0" y2="5">${swing(35, -35)}</line></g><g transform="translate(0 -4)"><line x1="0" y1="0" x2="0" y2="5">${swing(-35, 35)}</line></g>`
    : '<line x1="0" y1="-4" x2="-3" y2="0"/><line x1="0" y1="-4" x2="3" y2="0"/>'
  const skirt = woman ? '<polygon points="-4,2 4,2 0,-4" stroke="none"/>' : ''
  return `<g transform="scale(1.4)" stroke="${color}" fill="${color}" stroke-width="1.8" stroke-linecap="round"><circle cx="0" cy="-8" r="2.6" stroke="none"/><line x1="0" y1="-5" x2="0" y2="1"/>${skirt}${arms}${legs}</g>`
}

// Where a stopped figure stands: a point on the lane chosen by its key (the markup holds no clock).
function stopPoint(h: number): { x: number; y: number } {
  const lap = 2 * 164 + 2 * Math.PI * 52
  let d = (h % 1000) / 1000 * lap
  if (d < 82) return { x: 160 - d, y: 23 }
  d -= 82
  if (d < Math.PI * 52) { const a = Math.PI / 2 + d / 52; return { x: 78 + 52 * Math.cos(a), y: 75 - 52 * Math.sin(a) } }
  d -= Math.PI * 52
  if (d < 164) return { x: 78 + d, y: 127 }
  d -= 164
  if (d < Math.PI * 52) { const a = -Math.PI / 2 + d / 52; return { x: 242 + 52 * Math.cos(a), y: 75 - 52 * Math.sin(a) } }
  d -= Math.PI * 52
  return { x: 242 - d, y: 23 }
}

const MARK: Partial<Record<Light, { text: string; color: string }>> = { waiting: { text: '⚠', color: AMBER }, failed: { text: '✕', color: RED } }

export function playgroundSvg(rows: readonly CardRow[], _now: number): string | undefined {
  const racing = rows.filter((r) => r.light === 'walking' || r.light === 'waiting' || r.light === 'failed').sort((a, b) => a.key.localeCompare(b.key))
  if (racing.length === 0) return undefined
  const shown = racing.slice(0, MAX_RUNNERS)
  const colours = svgColours(shown.map((r) => r.key))
  const colorOf = (key: string) => colours.get(key) ?? CARD_HEX[0]
  const parts: string[] = []
  for (const r of shown) {
    const h = keyHash(r.key)
    const color = colorOf(r.key)
    const woman = ((h >>> 4) & 1) === 1
    if (r.light === 'walking') {
      const near = r.todo !== undefined && r.todo.total > 0 && r.todo.done / r.todo.total >= 0.75
      const spread = 0.8 + ((h >>> 8) % 41) / 100
      const dur = Math.round((LAP_S / spread / (near ? 1.5 : 1)) * 100) / 100
      const begin = -Math.round(((h % 1000) / 1000) * dur * 100) / 100
      parts.push(`<g>${figure(color, woman, true)}<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${LANE}"/></g>`)
    } else {
      const p = stopPoint(h)
      const mark = MARK[r.light] as { text: string; color: string }
      const body = r.light === 'failed' ? `<g transform="rotate(90)">${figure(color, woman, false)}</g>` : figure(color, woman, false)
      parts.push(`<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${body}<text x="7" y="-6" font-size="11" fill="${mark.color}" font-weight="700">${mark.text}</text></g>`)
    }
  }
  // name tags in the infield, four to a line
  const tags = shown.map((r) => `<tspan fill="${colorOf(r.key)}">${esc(r.key)}</tspan>${MARK[r.light] ? `<tspan fill="${(MARK[r.light] as { color: string }).color}"> ${(MARK[r.light] as { text: string }).text}</tspan>` : ''}`)
  if (racing.length > MAX_RUNNERS) tags.push(`<tspan fill="${RIM}">+${racing.length - MAX_RUNNERS}</tspan>`)
  const lines: string[] = []
  for (let i = 0; i < tags.length; i += 4) lines.push(tags.slice(i, i + 4).join('<tspan>  </tspan>'))
  const top = 75 - (lines.length - 1) * 7 + 4
  const text = lines.map((l, i) => `<text x="160" y="${top + i * 14}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700">${l}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect x="4" y="4" width="312" height="142" rx="71" fill="none" stroke="${RIM}" stroke-width="1.5"/>
<rect x="48" y="42" width="224" height="66" rx="33" fill="${RIM}" fill-opacity="0.12" stroke="${RIM}" stroke-width="1.5"/>
<path d="${LANE}" fill="none" stroke="${RIM}" stroke-opacity="0.35" stroke-dasharray="3 5"/>
${text}
${parts.join('\n')}
</svg>`
}
