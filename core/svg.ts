import type { Light } from './contracts.ts'

// The pedestrian signal for the Desktop surface. Pure string output; the only dynamic value is
// the countdown, which is clamped to 0-99 digits, so nothing user-controlled reaches the markup.
const GREEN = '#22c55e'
const RED = '#ef4444'

function walker(color: string): string {
  // Two legs and two arms swing against each other with SMIL (works in the sandboxed frame; no script).
  const swing = (from: number, to: number) =>
    `<animateTransform attributeName="transform" type="rotate" values="${from} 0 0;${to} 0 0;${from} 0 0" dur="0.8s" repeatCount="indefinite"/>`
  return `<g stroke="${color}" stroke-width="5" stroke-linecap="round" fill="${color}" transform="translate(30 24)">
<circle cx="0" cy="-12" r="6" stroke="none"/>
<line x1="0" y1="-4" x2="0" y2="14"/>
<g transform="translate(0 14)"><line x1="0" y1="0" x2="0" y2="16">${swing(-28, 28)}</line></g>
<g transform="translate(0 14)"><line x1="0" y1="0" x2="0" y2="16">${swing(28, -28)}</line></g>
<g transform="translate(0 -2)"><line x1="0" y1="0" x2="0" y2="12">${swing(26, -26)}</line></g>
<g transform="translate(0 -2)"><line x1="0" y1="0" x2="0" y2="12">${swing(-26, 26)}</line></g>
</g>`
}

function standing(color: string, blink: boolean): string {
  const anim = blink ? '<animate attributeName="opacity" values="1;0.15;1" dur="0.9s" repeatCount="indefinite"/>' : ''
  return `<g stroke="${color}" stroke-width="5" stroke-linecap="round" fill="${color}" transform="translate(30 24)">${anim}
<circle cx="0" cy="-12" r="6" stroke="none"/>
<line x1="0" y1="-4" x2="0" y2="14"/>
<line x1="0" y1="14" x2="-7" y2="30"/><line x1="0" y1="14" x2="7" y2="30"/>
<line x1="0" y1="2" x2="-10" y2="12"/><line x1="0" y1="2" x2="10" y2="12"/>
</g>`
}

export function signalSvg(light: Light, seconds: number): string {
  const digits = String(Math.min(99, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)))).padStart(2, '0')
  const color = light === 'walking' ? GREEN : light === 'done' ? GREEN : light === 'idle' ? '#9ca3af' : RED
  const figure = light === 'walking' ? walker(color) : standing(color, light === 'failed')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64" viewBox="0 0 120 64">
<rect width="120" height="64" rx="10" fill="#0b0f0b"/>
${figure}
<text x="108" y="42" text-anchor="end" font-family="monospace" font-size="26" font-weight="700" fill="${color}">${digits}</text>
</svg>`
}
