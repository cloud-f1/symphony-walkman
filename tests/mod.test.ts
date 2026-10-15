import { expect, mock, test } from 'claude-code/testing'
import { VERSION } from '../core/version.ts'

const CWD = '/r/.claude/worktrees/a'
const PORCELAIN =
  'worktree /r\nHEAD abc\nbranch refs/heads/main\n\n' +
  'worktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-195-devopsday-visuals\n'
const DF = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/d 488245288 400000000 77594624 84% /\n'

type Issue = { key: string; status: string; summary: string; assignee: string | null }
interface Setup { porcelain?: string; files?: Record<string, string>; askVerdict?: boolean; worktreeOkCalls?: number; env?: Record<string, string>; jiraOut?: string; jiraExit?: number; board?: { todo?: Issue[]; inProgress?: Issue[]; done?: Issue[] }; image?: boolean; cwd?: { v: string } }

function stubs(on: any, setup: Setup = {}) {
  const files = setup.files ?? {}
  const registered: string[] = []
  const panes: string[] = []
  let worktreeCalls = 0
  const jiraCalls: string[] = []
  const jiraEnvs: Record<string, string>[] = []
  const counts = { revParse: 0, df: 0 }
  const toasts: string[] = []
  const invalidated = { n: 0 }
  const clock: any = mock.clock(on)
  on('ui.invalidate', () => { invalidated.n++; return { value: undefined } })
  on('ui.toast', (_: any, e: any) => { toasts.push(e.text); return { value: undefined } })
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HOME' ? '/home/u' : setup.env?.[e.name] }))
  on('session.cwd', () => ({ value: setup.cwd?.v ?? CWD }))
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
    if (cmd === 'git' && a === 'rev-parse' && b === '--show-toplevel') return { value: { exitCode: 0, stdout: (setup.cwd?.v ?? CWD) + '\n', stderr: '' } }
    if ((cmd === 'uv' || cmd === 'uvx') && e.argv.includes('call')) {
      jiraCalls.push(e.argv.join(' '))
      const q = String(e.argv[e.argv.length - 1])
      const cat = q.includes('Done') ? 'done' : q.includes('In Progress') ? 'inProgress' : 'todo'
      return { value: { exitCode: setup.jiraExit ?? 0, stdout: JSON.stringify({ issues: setup.board?.[cat] ?? [] }), stderr: setup.jiraExit ? 'Jira API error 401' : '' } }
    }
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
    Button: ({ children, ...props }: any) => ({ type: 'Button', props, children }),
    ...(setup.image ? { Image: (props: any) => ({ type: 'Image', props }) } : {}),
  }))
  on('command.register', (_: any, e: any) => { registered.push(e.name); return { value: undefined } })
  on('session.start', () => ({ cwd: CWD }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer ?? '' }))
  return { registered, panes, jiraCalls, jiraEnvs, counts, toasts, clock, invalidated }
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
  const out = await walkman($, 'board print')
  expect(out.text).toContain('CF1-195')
  expect(out.text).toContain('devopsday-visuals')
  expect(out.text).toContain('disk · 74 GB free')
  expect(out.text).not.toContain('main')
})

test('a running turn lights the card green, completion clears it', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect((await walkman($, 'board print')).text).toContain('running')
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'end_turn' })
  expect((await walkman($, 'board print')).text).not.toContain('running  ')
})

test('a run file is ignored until runs_dir is set (plan_ready path is NOT covered here)', async ($, on) => {
  stubs(on, { files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  const out = await walkman($, 'board print')
  // runs_dir is a plugin option; with none set the file is ignored and the card is simply idle.
  expect(out.text).toContain('idle')
})

test('no card branch gives the hint, not an error', async ($, on) => {
  stubs(on, { porcelain: 'worktree /r\nHEAD abc\nbranch refs/heads/main\n' })
  expect((await walkman($, 'board print')).text).toContain('No card branch found')
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
  const out = await walkman($, 'board print')
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
  expect((await walkman($, 'board print')).text).toContain('CF1-195')
  await $.turn.start({ text: 'go', turnId: 't1' }) // a signal forces a reread, which now fails
  const again = (await walkman($, 'board print')).text
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
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('DevOpsDays visuals') // CF1-195 has a worktree: its title replaces the slug
  expect(out).toContain('In progress in Jira')
  expect(out).toContain('CF1-200') // in progress in Jira, no worktree
  expect(s.jiraCalls[0]).toContain('symphony-workflow search')
  expect(s.jiraCalls[0]).toContain('project = CF1')
  expect(s.jiraCalls[0]).toContain('key in (CF1-195)')
})

test('a failing Jira lookup never breaks the board', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraExit: 1 })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('CF1-195') // the worktree card still shows
  expect(out).toContain('jira lookup: exit 1')
})

test('an unlinked repo is told how to link it, a linked one is not', async ($, on) => {
  stubs(on)
  const unlinked = (await walkman($, 'board print')).text
  expect(unlinked).toContain('WALKMAN_JIRA_PROJECT')
  expect(unlinked).toContain('symphony-walkman setup')
})

test('a linked repo gets no setup nag', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT })
  expect((await walkman($, 'board print')).text).not.toContain('Not linked to Jira')
})

test('without a Jira project the plugin never runs symphony-workflow', async ($, on) => {
  const s = stubs(on)
  await walkman($, 'board print')
  expect(s.jiraCalls).toEqual([])
})

test('the Jira lookup only ever searches: no write verb is in what it runs', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT })
  await walkman($, 'board print')
  expect(s.jiraCalls.some((c) => c.includes('call search_issues'))).toBe(true) // the board's queries ran too
  for (const call of s.jiraCalls) {
    expect(call).not.toMatch(/transition|comment|create|rollup|add-subtasks|update_issue|add_comment/)
    if (/ call /.test(call)) expect(call).toMatch(/ call search_issues \{/) // the only tool call allowed is a search
  }
})

test('a run in plan_ready lights the red man when WALKMAN_RUNS_DIR points at the runs folder', async ($, on) => {
  stubs(on, { env: { WALKMAN_RUNS_DIR: '/runs' }, files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('plan_ready')
  expect(out).toContain('1 needs you')
})

test('a waiting card keeps its first-seen time instead of resetting to 0:00 on every read', async ($, on) => {
  stubs(on, { env: { WALKMAN_RUNS_DIR: '/runs' }, files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } })
  await walkman($, 'board print')
  const dbg = (await walkman($, 'debug')).text
  expect(dbg).toContain('CF1-195:waiting')
})

test('without a clone, the lookup runs the released CLI through uvx with the credentials file', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_ENV_FILE: '/creds/.env' }, files: { '/creds/.env': '' }, jiraOut: JIRA_OUT })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('DevOpsDays visuals')
  expect(s.jiraCalls[0]).toContain('uvx --env-file /creds/.env --from git+https://github.com/cloud-f1/symphony-workflow@v')
  expect(s.jiraCalls[0]).toContain('symphony-workflow search')
  expect(s.jiraCalls[0]).not.toMatch(/transition|comment|create|rollup|add-subtasks|call /)
})

test('a missing credentials file says where it looked and never runs anything', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1' } })
  const out = (await walkman($, 'board print')).text
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
  await walkman($, 'board print')
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
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('DevOpsDays visuals')
  expect(s.jiraEnvs[0]).toEqual({ JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'me@x.com', JIRA_API_TOKEN: 'tok-secret-123' })
  expect(s.jiraCalls[0]).not.toContain('tok-secret-123')
  expect(s.jiraCalls[0]).not.toContain('--env-file') // no file needed when the settings are complete
  expect(out).not.toContain('tok-secret-123')
})

test('an incomplete set of Jira settings is reported and nothing is run', async ($, on) => {
  const s = stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1', WALKMAN_JIRA_EMAIL: 'me@x.com' } })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('Jira settings are incomplete (have email; need URL, email and token)')
  expect(s.jiraCalls).toEqual([])
})

test('a non-https Jira URL is refused before anything runs', async ($, on) => {
  const s = stubs(on, { env: { ...CRED_ENV, WALKMAN_JIRA_BASE_URL: 'http://x.atlassian.net' } })
  expect((await walkman($, 'board print')).text).toContain('must start with https://')
  expect(s.jiraCalls).toEqual([])
})

test('the token never shows in doctor, debug or board', async ($, on) => {
  stubs(on, { env: CRED_ENV, jiraOut: JIRA_OUT })
  await walkman($, 'board print')
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
  expect((await walkman($, 'board print')).text).toContain('needs you')
  await ($ as any).tool.call({ tool: 'Bash', command: 'ls' })
  expect((await walkman($, 'board print')).text).not.toContain('needs you  ')
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
  await walkman($, 'board print')
  for (let i = 0; i < 3; i++) {
    await $.turn.start({ text: 'go', turnId: 't' + i })
    await walkman($, 'board print')
  }
  expect(s.counts.df).toBe(1)
})

test('with no Jira project set the lookup is recorded as done, so it is not restarted on every reread', async ($, on) => {
  stubs(on)
  await walkman($, 'board print')
  expect((await walkman($, 'debug')).text).not.toContain('last read never')
})

test('/walkman doctor says so when the credentials file holds color codes', async ($, on) => {
  stubs(on, { env: { WALKMAN_JIRA_PROJECT: 'CF1' }, files: { '/home/u/.config/symphony-workflow/.env': '\u001b[01;31m\u001b[KJIRA_BASE_URL\u001b[m\u001b[K=https://x.atlassian.net\n' } })
  const out = (await walkman($, 'doctor')).text
  expect(out).toContain('color codes')
})

const paneOf = ($: any, viewport = { columns: 44, rows: 30 }): Promise<any> => ($ as any).ui.render({ surface: 'terminal', component: 'Pane', requestId: 'walkman-pane', props: {}, viewport })

test('pane, quiet: title, all quiet and the disk line only, and no timer runs', async ($, on) => {
  const s = stubs(on)
  const j = flat(await paneOf($))
  expect(j).toContain('WALKMAN')
  expect(j).toContain('all quiet')
  expect(j).toContain('GB free')
  expect(j).not.toContain('NEEDS YOU')
  expect(j).not.toContain('RUNNING')
  expect(j).not.toContain('working') // the legend is gone
  await s.clock.advance(5 * 60_000)
  const before = s.invalidated.n
  await s.clock.advance(5 * 60_000)
  expect(s.invalidated.n).toBe(before) // nothing runs or waits: no timer redraws the pane
})

test('pane, a permission ask: an amber needs-you card with its reason, a toast once, and a timer while it waits', async ($, on) => {
  const s = stubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await walkman($, 'board print') // the first read: nothing waits yet
  await ($ as any).tool.check({ tool: 'Bash', command: 'ls' })
  const j = flat(await paneOf($))
  expect(j).toContain('NEEDS YOU')
  expect(j).toContain('"color":"warning"')
  expect(j).toContain('permission question')
  expect(j).not.toContain('"color":"error"')
  await paneOf($)
  expect(s.toasts).toEqual(['CF1-195 needs you'])
  const waiting = s.invalidated.n
  await s.clock.advance(60_000)
  expect(s.invalidated.n).toBeGreaterThan(waiting) // a card waits: the clock keeps moving
  await ($ as any).tool.call({ tool: 'Bash', command: 'ls' }) // answered
  await paneOf($)
  await ($ as any).tool.check({ tool: 'Bash', command: 'ls' }) // asks again
  await paneOf($)
  expect(s.toasts).toEqual(['CF1-195 needs you', 'CF1-195 needs you'])
})

test('pane, a failed turn: a red failed card, not amber', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'error' })
  const j = flat(await paneOf($))
  expect(j).toContain('FAILED')
  expect(j).toContain('"color":"error"')
  expect(j).not.toContain('NEEDS YOU')
})

test('pane, a running card is one line with its time in minutes', async ($, on) => {
  stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const j = flat(await paneOf($))
  expect(j).toContain('RUNNING')
  expect(j).toContain('CF1-195')
  expect(j).toMatch(/<1m|\d+m/)
  expect(j).not.toMatch(/\d:\d\d/)
})

test('on the terminal a running card redraws about every 30 seconds, not every second', async ($, on) => {
  const s = stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await paneOf($) // the first read starts the timer
  const before = s.invalidated.n
  await s.clock.advance(5_000)
  expect(s.invalidated.n).toBe(before)
  await s.clock.advance(30_000)
  expect(s.invalidated.n).toBeGreaterThan(before)
})

test('once a Desktop signal has been drawn the redraw is every second again, for its countdown', async ($, on) => {
  const s = stubs(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await ($ as any).ui.render({ surface: 'desktop', component: 'AbovePrompt', props: {} })
  await s.clock.advance(4_000) // past the read cache, so the next draw looks at the timer again
  await ($ as any).ui.render({ surface: 'desktop', component: 'AbovePrompt', props: {} })
  const before = s.invalidated.n
  await s.clock.advance(3_000)
  expect(s.invalidated.n).toBeGreaterThan(before + 1)
})

// ---------- the Jira board (WALK-143) ----------
const BOARD = {
  todo: [{ key: 'CF1-20', status: 'Backlog', summary: 'Desktop check', assignee: null }, { key: 'CF1-21', status: 'To Do', summary: 'Windows', assignee: 'alex hsieh' }],
  inProgress: [{ key: 'CF1-200', status: 'In Progress', summary: 'Pitch copy refresh', assignee: 'alex hsieh' }],
  done: [{ key: 'CF1-9', status: 'Done', summary: 'old', assignee: null }],
}

test('/walkman board prints the project board: columns in board order, assignees, done as a count', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('CF1 board · 3 open · 1 done in 14 days')
  expect(out).toMatch(/BACKLOG \(1\)\n {2}CF1-20 +Desktop check +unassigned/)
  expect(out.indexOf('BACKLOG')).toBeLessThan(out.indexOf('IN PROGRESS (1)'))
  expect(out).not.toContain('CF1-9 ') // a done issue is only counted
})

test('the board queries are read only, one per status category, through the same runner', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  await walkman($, 'board print')
  const calls = s.jiraCalls.filter((c) => c.includes('call search_issues'))
  expect(calls.length).toBe(3)
  expect(calls.some((c) => c.includes('statusCategory = \\"To Do\\"'))).toBe(true)
  expect(calls.some((c) => c.includes('statusCategoryChangedDate >= -14d'))).toBe(true)
})

test('pane: a BOARD lane with a picture meter where the surface has Image', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD, image: true })
  await walkman($, 'board print') // loads the board
  const pane = flat(await paneOf($))
  expect(pane).toContain('▤ BOARD')
  expect(pane).toContain('"type":"Image"')
  expect(pane).toContain('"rgba"')
  expect(pane).toContain('"alt":"▰▰▰▱▱▱▱▱"') // 1 of 3 open, the same meter as text for anyone without pictures
})

test('pane: the same meter as text where the surface has no Image (Claude Desktop)', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  await walkman($, 'board print')
  const pane = flat(await ($ as any).ui.render({ surface: 'desktop', component: 'Pane', requestId: 'walkman-pane', props: {}, viewport: { columns: 44, rows: 30 } }))
  expect(pane).toContain('▤ BOARD')
  expect(pane).not.toContain('"rgba"')
  expect(pane).toContain('▰▰▰▱▱▱▱▱') // each column 1 of 3 open
})

test('the board rereads every five minutes, not on every draw', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  await walkman($, 'board print')
  const n = () => s.jiraCalls.filter((c) => c.includes('call search_issues')).length
  expect(n()).toBe(3)
  await s.clock.advance(60_000)
  await walkman($, 'board print')
  expect(n()).toBe(3)
  await s.clock.advance(300_000)
  await walkman($, 'board print')
  await s.clock.advance(1)
  expect(n()).toBe(6)
})

test('without a Jira project there is no board and no board query', async ($, on) => {
  const s = stubs(on, { board: BOARD })
  const out = (await walkman($, 'board print')).text
  expect(out).not.toContain('board ·')
  expect(flat(await paneOf($))).not.toContain('▤ BOARD')
  expect(s.jiraCalls).toEqual([])
})

test('a failing board read says so and keeps the card board', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraExit: 1 })
  const out = (await walkman($, 'board print')).text
  expect(out).toContain('CF1-195')
  expect(out).toContain('jira board: exit 1')
})

// ---------- the board pane (WALK-151) ----------
const boardPane = ($: any, bodyColumns = 120): Promise<any> => ($ as any).ui.render({ surface: 'terminal', component: 'Pane', requestId: 'walkman-board', props: { bodyColumns }, viewport: { columns: 200, rows: 40 } })

test('/walkman board in a linked repo opens the board pane, wide and focused', async ($, on) => {
  const s = stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  const out = (await walkman($, 'board')).text
  expect(s.panes).toContain('open:walkman-board')
  expect(out).toContain('h / l')
})

test('/walkman board in an unlinked repo still prints the card board', async ($, on) => {
  const s = stubs(on)
  const out = (await walkman($, 'board')).text
  expect(s.panes).not.toContain('open:walkman-board')
  expect(out).toContain('CF1-195')
})

test('board pane: columns side by side, the card Claude works on lit', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: { ...BOARD, inProgress: [{ key: 'CF1-195', status: 'In Progress', summary: 'DevOpsDays visuals', assignee: 'alex hsieh' }] } })
  await walkman($, 'board print') // loads the board
  await $.turn.start({ text: 'go', turnId: 't1' }) // CF1-195 has the worktree: it runs
  const pane = flat(await boardPane($))
  expect(pane).toContain('BACKLOG')
  expect(pane).toContain('IN PROGRESS')
  expect(pane).toContain('● CF1-195')
  expect(pane).toContain('┌')
  expect(pane).not.toContain('"hotkey"') // everything fits: no buttons
})

test('board pane: more columns than fit get h / l buttons that move the window', async ($, on) => {
  stubs(on, { env: JIRA_ENV, jiraOut: JIRA_OUT, board: BOARD })
  await walkman($, 'board print')
  const first: any = await boardPane($, 40) // one column fits
  const text = flat(first)
  expect(text).toContain('BACKLOG')
  expect(text).not.toContain('"hotkey":"h"')
  expect(text).toContain('"hotkey":"l"')
  await ($ as any).ui.press({ plugin: 'symphony-walkman', key: 'right', requestId: 'walkman-board', surface: 'terminal' })
  const moved = flat(await boardPane($, 40))
  expect(moved).not.toContain('BACKLOG')
  expect(moved).toContain('"hotkey":"h"')
})

test('board pane before the board is read says so instead of drawing nothing', async ($, on) => {
  stubs(on)
  expect(flat(await boardPane($))).toContain('Not linked to Jira')
})

test('a worktree the session has left keeps no needs-you: a signal in one worktree clears the others (WALK-148)', async ($, on) => {
  const porcelain = PORCELAIN + '\nworktree /r/.claude/worktrees/b\nHEAD fed\nbranch refs/heads/CF1-196-other-card\n'
  const cwd = { v: CWD }
  stubs(on, { porcelain, cwd })
  on('tool.check', () => ({ decision: 'ask' }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await ($ as any).tool.check({ tool: 'Bash', command: 'ls' }) // CF1-195 waits for an answer
  expect((await walkman($, 'debug')).text).toContain('CF1-195:waiting')
  cwd.v = '/r/.claude/worktrees/b' // the session moves on, the ask in a was never answered
  await $.turn.start({ text: 'next', turnId: 't2' })
  const dbg = (await walkman($, 'debug')).text
  expect(dbg).toContain('CF1-196:walking')
  expect(dbg).not.toContain('CF1-195:waiting')
  expect(dbg).toContain('CF1-195:idle')
})
