// Read-only Docker status for /walkman docker. Only `version`, `ps` and `system df` are ever run (the adapter
// builds those argv; a test asserts nothing else is). These functions only parse and render.
export type Container = { name: string; image: string; status: string }
export type Usage = { type: string; count: string; size: string; reclaimable: string }

export type DockerState =
  | { kind: 'ok'; version: string; containers: Container[]; usage: Usage[] }
  | { kind: 'missing' }
  | { kind: 'down'; detail: string }

export const DOCKER_VERSION_ARGV = ['docker', 'version', '--format', '{{.Server.Version}}']
export const DOCKER_PS_ARGV = ['docker', 'ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}']
export const DOCKER_DF_ARGV = ['docker', 'system', 'df', '--format', '{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}']

const rows = (out: string): string[][] =>
  out.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '').map((l) => l.split('\t'))

export const parsePs = (out: string): Container[] =>
  rows(out).filter((c) => c.length >= 3).map((c) => ({ name: c[0] as string, image: c[1] as string, status: c.slice(2).join(' ') }))

export const parseDf = (out: string): Usage[] =>
  rows(out).filter((c) => c.length >= 4).map((c) => ({ type: c[0] as string, count: c[1] as string, size: c[2] as string, reclaimable: c[3] as string }))

// A failed docker call is either "no docker here" or "the daemon is not running".
export function classifyFailure(exitCode: number | undefined, stderr: string, thrown?: string): 'missing' | 'down' {
  const text = `${stderr} ${thrown ?? ''}`
  if (exitCode === 127 || /ENOENT|not found|no such file/i.test(text)) return 'missing'
  return 'down'
}

const clip = (s: string, n: number): string => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…')
export const MAX_CONTAINERS = 12

export function renderDocker(state: DockerState): string[] {
  if (state.kind === 'missing') return ['Docker: not found on this machine (install Docker, or ignore this command).']
  if (state.kind === 'down') return ['Docker: installed, but the daemon is not answering.', `  ${clip(state.detail || 'is Docker Desktop running?', 100)}`, '  Start Docker Desktop (or the docker service) and run /walkman docker again.']
  const lines = [`Docker ${state.version} · ${state.containers.length} running`]
  for (const c of state.containers.slice(0, MAX_CONTAINERS)) {
    const bad = /unhealthy|restarting|exited|dead/i.test(c.status)
    lines.push(`  ${bad ? '!' : '●'} ${clip(c.name, 28).padEnd(28)} ${clip(c.image, 26).padEnd(26)} ${c.status}`)
  }
  if (state.containers.length > MAX_CONTAINERS) lines.push(`  +${state.containers.length - MAX_CONTAINERS} more`)
  if (state.containers.length === 0) lines.push('  nothing running')
  if (state.usage.length > 0) {
    lines.push('', 'Disk use')
    for (const u of state.usage) lines.push(`  ${u.type.padEnd(14)} ${u.count.padStart(4)}  ${u.size.padStart(9)}  reclaimable ${u.reclaimable}`)
  }
  return lines
}
