import type { Light } from './contracts.ts'

// The pedestrian signal for the Desktop surface. Pure string output; the only dynamic value is
// the countdown, which is clamped to 0-99 digits, so nothing user-controlled reaches the markup.
const GREEN = '#22c55e'
const RED = '#ef4444'
const AMBER = '#f59e0b' // needs you: amber, like the terminal (needs you and failed never share a colour)

// The Taiwan crossing man in side view, facing right, like the terminal's figure (WALK-217): head forward of the
// hips, a leaning body, legs and arms swinging against each other with SMIL (no script in the sandboxed frame).
const HIP_X = -2
function walker(color: string): string {
  const swing = (from: number, to: number, dur = '0.8s') =>
    `<animateTransform attributeName="transform" type="rotate" values="${from} 0 0;${to} 0 0;${from} 0 0" dur="${dur}" repeatCount="indefinite"/>`
  return `<g data-figure="side-walk" data-hip="${HIP_X}" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="${color}" transform="translate(30 30)">
<circle cx="6" cy="-17" r="6" stroke="none"/>
<line x1="4" y1="-9" x2="${HIP_X}" y2="6"/>
<g transform="translate(${HIP_X} 6)"><line x1="0" y1="0" x2="0" y2="17">${swing(-32, 32)}</line></g>
<g transform="translate(${HIP_X} 6)"><line x1="0" y1="0" x2="0" y2="17">${swing(32, -32)}</line></g>
<g transform="translate(3 -6)"><line x1="0" y1="0" x2="0" y2="12">${swing(38, -38)}</line></g>
<g transform="translate(3 -6)"><line x1="0" y1="0" x2="0" y2="12">${swing(-38, 38)}</line></g>
</g>`
}

// The standing man, side view: upright, arms down, feet together.
function standing(color: string, blink: boolean): string {
  const anim = blink ? '<animate attributeName="opacity" values="1;0.15;1" dur="0.9s" repeatCount="indefinite"/>' : ''
  return `<g data-figure="side-stand" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="${color}" transform="translate(30 30)">${anim}
<circle cx="1" cy="-17" r="6" stroke="none"/>
<line x1="0" y1="-9" x2="0" y2="7"/>
<line x1="0" y1="-6" x2="2" y2="6"/>
<line x1="-1" y1="7" x2="-2" y2="23"/><line x1="1" y1="7" x2="3" y2="23"/>
</g>`
}

export function signalSvg(light: Light, seconds: number): string {
  const digits = String(Math.min(99, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)))).padStart(2, '0')
  const color = light === 'walking' || light === 'done' ? GREEN : light === 'idle' ? '#9ca3af' : light === 'waiting' ? AMBER : RED
  const figure = light === 'walking' ? walker(color) : standing(color, light === 'failed')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64" viewBox="0 0 120 64">
<rect width="120" height="64" rx="10" fill="#0b0f0b"/>
${figure}
<text x="108" y="42" text-anchor="end" font-family="monospace" font-size="26" font-weight="700" fill="${color}">${digits}</text>
</svg>`
}
