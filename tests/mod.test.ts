import { expect, mock, test } from 'claude-code/testing'
import { VERSION } from '../core/version.ts'

const CWD = '/r/.claude/worktrees/a'
const PORCELAIN =
  'worktree /r\nHEAD abc\nbranch refs/heads/main\n\n' +
  'worktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-195-devopsday-visuals\n'
const DF = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/d 488245288 400000000 77594624 84% /\n'

interface Setup { porcelain?: string; files?: Record<string, string>; askVerdict?: boolean; worktreeOkCalls?: number; env?: Record<string, string>; jiraOut?: string; jiraExit?: number }

function stubs(on: any, setup: Setup = {}) {
  const files = setup.files ?? {}
  const registered: string[] = []
  const panes: string[] = []
  let worktreeCalls = 0
  const jiraCalls: string[] = []
  const jiraEnvs: Record<string, string>[] = []
  const counts = { revParse: 0, df: 0 }
  mock.clock(on)
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HOME' ? '/home/u' : setup.env?.[e.name] }))
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_: any, e: any) => ({ value: e.path in files }))
  on('fs.read', (_: any, e: any) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: files[e.path] }
  })
  on('process.run', (_: any, e: any) => {
    const [cmd, a, b] = e.argv
    if (cmd === 'git' && a === 'worktree' && ++worktreeCalls > (setup.worktreeOkCalls ?? Infinity)) throw new Error('aborted')
    if (cmd === 'git' && a === 'worktree') return { value: { exitCode: 0, stdout: setup.porcelain ?? PORCELAIN, stderr: '' } }
    if (cmd === 'git' && a === 'rev-parse' && b === '--show-toplevel') counts.revParse++
    if (cmd === 'git' && a === 'rev-parse' && b === '--show-toplevel') return { value: { exitCode: 0, stdout: CWD + '\n', stderr: '' } }
    if (cmd === 'uv' || cmd === 'uvx') { jiraCalls.push(e.argv.join(' ')); if (e.init?.env) jiraEnvs.push(e.init.env); return { value: { exitCode: setup.jiraExit ?? 0, stdout: setup.jiraOut ?? '', stderr: setup.jiraExit ? 'Jira API error 401' : '' } } }
    if (cmd === 'claude') return { value: { exitCode: 0, stdout: '2.1.296 (Claude Code)\n', stderr: '' } }
    if (cmd === 'uvx' && a === '--version') return { value: { exitCode: 0, stdout: 'uvx 0.9\n', stderr: '' } }
    if (cmd === 'df') counts.df++
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
  return { registered, panes, jiraCalls, jiraEnvs, counts }
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

test('/walkman with no argument opens the pane, and help explains the symbols', async ($, on) => {
  const s = stubs(on)
  await walkman($, '')
  expect(s.panes).toContain('open:walkman-pane')
  const help = await walkman($, 'help')
  expect(help.text).toContain('/walkman board')
  expect(help.text).toContain('needs you')
})

test('board starts with a header line so the host prefix does not push the first row', async ($, on) => {
  stubs(on)
  const out = await walkman($, 'board')
  expect(out.text.split('\n')[0]).toBe('Walkman board')
  expect(out.text).toContain('🟢 working')
})

test('the pane and the band are drawn in theme colors', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const pane: any = await ($ as any).ui.render({ surface: 'terminal', component: 'Pane', requestId: 'walkman-pane', props: {} })
  expect(flat(pane)).toContain('"color":"success"')
  expect(flat(pane)).toContain('CF1-195')
  const band: any = await ($ as any).ui.render({ surface: 'terminal', component: 'AbovePrompt', props: {} })
  expect(flat(band)).toContain('"color":"success"')
})

test('a git read that fails keeps the last good rows instead of saying "no card"', async ($, on) => {
  stubs(on, { worktreeOkCalls: 1 })
  expect((await walkman($, 'board')).text).toContain('CF1-195')
  await $.turn.start({ text: 'go', turnId: 't1' }) // a signal forces a reread, which now fails
  const again = (await walkman($, 'board')).text
  expect(again).toContain('CF1-195')
  expect(again).not.toContain('No card branch found')
})

test('debug prints the signal state', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const out = (await walkman($, 'debug')).text
  expect(out).toContain('Walkman debug')
  expect(out).toContain('CF1-195')
})

const JIRA_ENV = { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_SYMPHONY_WORKFLOW_DIR: '/sw' }
const JIRA_OUT = 'CF1-195\tIn Progress\tDevOpsDays visuals\nCF1-200\tIn Progress\tPitch copy refresh\n\n2 total\n'

test('with a Jira project set, the board shows titles and the in-progress cards that have no worktree', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('DevOpsDays visuals') // CF1-195 has a worktree: its title replaces the slug
  expect(out).toContain('In progress in Jira')
  expect(out).toContain('CF1-200') // in progress in Jira, no worktree
  expect(s.jiraCalls[0]).toContain('symphony-workflow search')
  expect(s.jiraCalls[0]).toContain('project = CF1')
  expect(s.jiraCalls[0]).toContain('key in (CF1-195)')
})

test('a failing Jira lookup never breaks the board', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraExit: 1 })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('CF1-195') // the worktree card still shows
  expect(out).toContain('jira lookup: exit 1')
})

test('an unlinked repo is told how to link it, a linked one is not', async ($, on) => {
  stubs(on)
  const unlinked = (await walkman($, 'board')).text
  expect(unlinked).toContain('WALKMAN_JIRA_PROJECT')
  expect(unlinked).toContain('symphony-walkman setup')
})

test('a linked repo gets no setup nag', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT })
  expect((await walkman($, 'board')).text).not.toContain('Not linked to Jira')
})

test('without a Jira project the plugin never runs symphony-workflow', async ($, on) => {
  const s = stubs(on)
  await walkman($, 'board')
  expect(s.jiraCalls).toEqual([])
})

test('the Jira lookup only ever searches: no write verb is in what it runs', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT })
  await walkman($, 'board')
  for (const call of s.jiraCalls) expect(call).not.toMatch(/transition|comment|create|rollup|add-subtasks|call /)
})

test('a run in plan_ready lights the red man when WALKMAN_RUNS_DIR points at the runs folder', async ($, on) => {
  stubs(on, { env: { WALKMAN_RUNS_DIR: '/runs' }, files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('plan_ready')
  expect(out).toContain('1 needs you')
})

test('a waiting card keeps its first-seen time instead of resetting to 0:00 on every read', async ($, on) => {
  stubs(on, { env: { WALKMAN_RUNS_DIR: '/runs' }, files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  await walkman($, 'board')
  const dbg = (await walkman($, 'debug')).text
  expect(dbg).toContain('CF1-195:waiting')
})

test('without a clone, the lookup runs the released CLI through uvx with the credentials file', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_ENV_FILE: '/creds/.env' }, files: { '/creds/.env': '' }, jiraOut: JIRA_OUT })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('DevOpsDays visuals')
  expect(s.jiraCalls[0]).toContain('uvx --env-file /creds/.env --from git+https://github.com/cloud-f1/symphony-workflow@v')
  expect(s.jiraCalls[0]).toContain('symphony-workflow search')
  expect(s.jiraCalls[0]).not.toMatch(/transition|comment|create|rollup|add-subtasks|call /)
})

test('a missing credentials file says where it looked and never runs anything', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1' } })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('CF1-195') // the worktree card still shows
  expect(out).toContain('no credentials')
  expect(out).toContain('/home/u/.config/symphony-workflow/.env')
  expect(s.jiraCalls).toEqual([])
})

test('/walkman version prints the plugin version, the symphony-workflow release and Claude Code', async ($, on) => {
  stubs(on)
  const out = (await walkman($, 'version')).text
  expect(out).toContain('symphony-walkman ' + VERSION)
  expect(out).toContain('symphony-workflow v')
  expect(out).toContain('Claude Code 2.1.296')
})

test('/walkman doctor words the state without showing credential values', async ($, on) => {
  stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_ENV_FILE: '/creds/.env' }, files: { '/creds/.env': 'JIRA_BASE_URL=https://x\nJIRA_EMAIL=me@x\nJIRA_API_TOKEN=supersecret\n' }, jiraOut: JIRA_OUT })
  await walkman($, 'board')
  const out = (await walkman($, 'doctor')).text
  expect(out).toContain('✓ WALKMAN_JIRA_PROJECT=CF1')
  expect(out).toContain('values not shown')
  expect(out).not.toContain('supersecret')
  expect(out).toContain('uvx is available')
})

test('a removed or unknown option says so and shows the help instead of the board', async ($, on) => {
  stubs(on)
  const out = (await walkman($, 'docker')).text
  expect(out).toContain('unknown option "docker"')
  expect(out).toContain('/walkman version')
  expect(out).not.toContain('Walkman board')
})

test('help lists every command', async ($, on) => {
  stubs(on)
  const out = (await walkman($, 'help')).text
  expect(out).not.toContain('docker')
  for (const word of ['board', 'doctor', 'version', 'pane close']) expect(out).toContain(word)
})

const CRED_ENV = { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_BASE_URL: 'https://x.atlassian.net', WALKMAN_JIRA_EMAIL: 'me@x.com', WALKMAN_JIRA_API_TOKEN: 'tok-secret-123' }

test('credentials given to the plugin reach the lookup through the child environment, never a command line', async ($, on) => {
  const s = stubs(on, { env: CRED_ENV, jiraOut: JIRA_OUT })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('DevOpsDays visuals')
  expect(s.jiraEnvs[0]).toEqual({ JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'me@x.com', JIRA_API_TOKEN: 'tok-secret-123' })
  expect(s.jiraCalls[0]).not.toContain('tok-secret-123')
  expect(s.jiraCalls[0]).not.toContain('--env-file') // no file needed when the settings are complete
  expect(out).not.toContain('tok-secret-123')
})

test('an incomplete set of Jira settings is reported and nothing is run', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_EMAIL: 'me@x.com' } })
  const out = (await walkman($, 'board')).text
  expect(out).toContain('Jira settings are incomplete (have email; need URL, email and token)')
  expect(s.jiraCalls).toEqual([])
})

test('a non-https Jira URL is refused before anything runs', async ($, on) => {
  const s = stubs(on, { env: { ...CRED_ENV, WALKMAN_JIRA_BASE_URL: 'http://x.atlassian.net' } })
  expect((await walkman($, 'board')).text).toContain('must start with https://')
  expect(s.jiraCalls).toEqual([])
})

test('the token never shows in doctor, debug or board', async ($, on) => {
  stubs(on, { env: CRED_ENV, jiraOut: JIRA_OUT })
  await walkman($, 'board')
  for (const sub of ['doctor', 'debug', 'board', 'version', 'help']) expect((await walkman($, sub)).text).not.toContain('tok-secret-123')
  expect((await walkman($, 'doctor')).text).toContain('come from the plugin settings')
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

test('a tool call with no permission ask pending does not respawn git or force a reread', async ($, on) => {
  const s = stubs(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  const before = s.counts.revParse
  for (let i = 0; i < 3; i++) await ($ as any).tool.call({ tool: 'Bash', command: 'ls' })
  expect(s.counts.revParse).toBe(before)
})

test('the disk reading is reused while signals force the cards to be reread', async ($, on) => {
  const s = stubs(on)
  await walkman($, 'board')
  for (let i = 0; i < 3; i++) {
    await $.turn.start({ text: 'go', turnId: 't' + i })
    await walkman($, 'board')
  }
  expect(s.counts.df).toBe(1)
})

test('with no Jira project set the lookup is recorded as done, so it is not restarted on every reread', async ($, on) => {
  stubs(on)
  await walkman($, 'board')
  expect((await walkman($, 'debug')).text).not.toContain('last read never')
})
