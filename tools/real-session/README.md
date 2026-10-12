# Real-session checks

Unit tests and `claude plugin test` run on a stubbed host. Everything in the README's "What is verified" table that says
"real session" was checked with `drive.py`: it starts the real `claude` in a pseudo-terminal, types into it, and reads the
screen back with a terminal emulator ([pyte](https://pypi.org/project/pyte/)), including each cell's color.

```bash
# a scratch repo with two card worktrees (nothing else is touched)
d=$(mktemp -d) && cd $d && git init -q -b main && git -c user.email=a@b.c -c user.name=t commit -q --allow-empty -m init
git worktree add -q ../card-1 -b WALK-1-one && git worktree add -q ../card-2 -b WALK-2-two

# first run in a new folder: answer the trust prompt (Down, Enter), wait for the UI, then use the plugin
uv run --with pyte python tools/real-session/drive.py ../card-1 \
  '[{"wait":10},{"send":"\x1b[B"},{"wait":1},{"send":"\r"},{"wait":14},{"send":"/walkman board\r"},{"wait":5,"dump":"board"}]' \
  --plugin-dir /path/to/symphony-walkman
```

Notes learned the hard way:

- Answering the trust prompt writes that folder into your Claude Code trust list. Use a scratch folder.
- Send a long prompt, wait about 2 seconds, then send `\r` separately; sent together the Enter can be swallowed.
- `/walkman debug` prints what the plugin last read and signalled; use it after a turn to see the real event values.
- A permission dialog hides the band above the prompt; open the pane first (`/walkman`) to see the red man then.
- To test a failing turn, set `ANTHROPIC_BASE_URL=http://127.0.0.1:9`; Claude Code retries for about 4 minutes before it fails.
- Install tests that must not touch your own setup: `CLAUDE_CONFIG_DIR=<empty dir> claude plugin ...`.
- Costs a few cents when a prompt is sent; slash commands cost nothing.
