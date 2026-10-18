// Which card worktree a tool call works in (WALK-197). A session started at the repo root edits files inside a card
// worktree without ever having that worktree as its cwd; the paths in its tool calls say where it really works.
// Pure: only the call's input and the known worktree paths.

const PATH_FIELDS = ['file_path', 'notebook_path', 'path'] as const

// The worktree that `input` names: a file path inside it, or the worktree path in a command followed by a path end
// (`/`, a quote, a space, `&`, `;`, `)` or the end). A path that only starts the same (WALK-19 vs WALK-197) is no
// match; of nested worktrees the longest wins.
export function touchedWorktree(input: Record<string, unknown>, worktrees: readonly string[]): string | undefined {
  const texts: string[] = []
  for (const f of PATH_FIELDS) if (typeof input[f] === 'string') texts.push(input[f] as string)
  if (typeof input.command === 'string') texts.push(input.command)
  let best: string | undefined
  for (const tree of worktrees) {
    if (tree === '' || (best !== undefined && tree.length <= best.length)) continue
    for (const text of texts) {
      let at = text.indexOf(tree)
      let hit = false
      while (at >= 0 && !hit) {
        const after = text[at + tree.length]
        hit = after === undefined || /[/"'\s&;)|]/.test(after)
        at = text.indexOf(tree, at + 1)
      }
      if (hit) {
        best = tree
        break
      }
    }
  }
  return best
}
