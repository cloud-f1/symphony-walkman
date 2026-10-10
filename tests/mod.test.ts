import { expect, mock, test } from 'claude-code/testing'

const CWD = '/r/.claude/worktrees/a'
const PORCELAIN =
  'worktree /r\nHEAD abc\nbranch refs/heads/main\n\n' +
  'worktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-195-devopsday-visuals\n'
const DF = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/d 488245288 400000000 77594624 84% /\n'

interface Setup { porcelain?: string; files?: Record<string, string>; askVerdict?: boolean }

function stubs(on: any, setup: Setup = {}) {
  const files = setup.files ?? {}
  const registered: string[] = []
  const panes: string[] = []
  mock.clock(on)
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_: any, e: any) => ({ value: e.path in files }))
  on('fs.read', (_: any, e: any) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: files[e.path] }
  })
  on('process.run', (_: any, e: any) => {
    const [cmd, a, b] = e.argv
    if (cmd === 'git' && a === 'worktree') return { value: { exitCode: 0, stdout: setup.porcelain ?? PORCELAIN, stderr: '' } }
    if (cmd === 'git' && a === 'rev-parse' && b === '--show-toplevel') return { value: { exitCode: 0, stdout: CWD + '\n', stderr: '' } }
    if (cmd === 'df') return { value: { exitCode: 0, stdout: DF, stderr: '' } }
    return { value: { exitCode: 127, stdout: '', stderr: '' } }
  })
  on('ui.open', (_: any, e: any) => { panes.push('open:' + e.id); return { value: { isPlaced: true } } })
  on('ui.close', (_: any, e: any) => { panes.push('close:' + e.id); return { value: undefined } })
  on('ui.resolve', () => ({
    Box: ({ children, ...props }: any) => ({ type: 'Box', props, children }),
    Text: ({ children, ...props }: any) => ({ type: 'Text', props, children }),
    Svg: (props: any) => ({ type: 'Svg', props }), // a leaf: never takes children
  }))
  on('command.register', (_: any, e: any) => { registered.push(e.name); return { value: undefined } })
  on('session.start', () => ({ cwd: CWD }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer ?? '' }))
  return { registered, panes }
}

const walkman = ($: any, args: string): Promise<{ text: string }> => $.command.run({ command: 'walkman', args })
const flat = (tree: unknown): string => JSON.stringify(tree)

test('session.start registers /walkman', async ($, on) => {
  const s = stubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD })
  expect(s.registered).toContain('walkman')
})

test('board lists the card from the worktree branch and the disk', async ($, on) => {
  stubs(on)
  const out = await walkman($, 'board')
  expect(out.text).toContain('CF1-195')
  expect(out.text).toContain('devopsday-visuals')
  expect(out.text).toContain('disk · 74 GB free')
  expect(out.text).not.toContain('main')
})

test('a running turn lights the card green, completion clears it', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect((await walkman($, 'board')).text).toContain('running')
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'end_turn' })
  expect((await walkman($, 'board')).text).not.toContain('running  ')
})

test('a run file is ignored until runs_dir is set (plan_ready path is NOT covered here)', async ($, on) => {
  stubs(on, { files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  const out = await walkman($, 'board')
  // runs_dir is a plugin option; with none set the file is ignored and the card is simply idle.
  expect(out.text).toContain('idle')
})

test('no card branch gives the hint, not an error', async ($, on) => {
  stubs(on, { porcelain: 'worktree /r\nHEAD abc\nbranch refs/heads/main\n' })
  expect((await walkman($, 'board')).text).toContain('No card branch found')
})

test('pane opens and closes', async ($, on) => {
  const s = stubs(on)
  await walkman($, 'pane')
  await walkman($, 'pane close')
  expect(s.panes).toEqual(['open:walkman-pane', 'close:walkman-pane'])
})

test('the AbovePrompt band draws the card line on terminal and the signal on desktop', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const term: any = await ($ as any).ui.render({ surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(flat(term)).toContain('CF1-195')
  const desk: any = await ($ as any).ui.render({ surface: 'desktop', component: 'AbovePrompt', props: {} })
  expect(flat(desk)).toContain('Svg')
  expect(flat(desk)).toContain('CF1-195')
})

test('a permission ask lights the red man until a tool runs', async ($, on) => {
  stubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await ($ as any).tool.check({ tool: 'Bash', command: 'ls' })
  expect((await walkman($, 'board')).text).toContain('needs you')
  await ($ as any).tool.call({ tool: 'Bash', command: 'ls' })
  expect((await walkman($, 'board')).text).not.toContain('needs you  ')
})
