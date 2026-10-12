# Drives a real interactive Claude Code session through a pseudo-terminal and prints what the screen shows,
# so a plugin can be checked as a person would see it (colors included) without anyone typing.
#
#   uv run --with pyte python tools/real-session/drive.py <project-dir> '<steps-json>' [claude args...]
#
# Steps are a JSON list: {"wait": seconds} {"send": "text"} {"dump": "label"} {"colors": "label", "needle": "text"}
# "send" understands \r (Enter), \x1b (Esc), \x1b[B (Down). Example:
#   ... /tmp/scratch '[{"wait":16},{"send":"/walkman board\r"},{"wait":5,"dump":"board"}]' --plugin-dir .
# A folder Claude Code has not seen shows a trust prompt first: send Down then Enter (see the guide).
# This script only reads the screen; it never writes outside the pseudo-terminal.
import os, pty, sys, time, select, fcntl, termios, struct, json
import pyte
COLS, ROWS = 130, 42
steps = json.loads(sys.argv[2]); cwd = sys.argv[1]; extra = sys.argv[3:] 
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.environ['TERM'] = 'xterm-256color'
    os.execvp('claude', ['claude'] + extra)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
screen = pyte.Screen(COLS, ROWS); stream = pyte.ByteStream(screen)
def pump(sec):
    end = time.time() + sec
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try: data = os.read(fd, 65536)
            except OSError: return False
            if not data: return False
            stream.feed(data)
    return True
def dump(label):
    print('=' * 20, label, '=' * 20)
    lines = [l.rstrip() for l in screen.display]
    while lines and not lines[-1]: lines.pop()
    print('\n'.join(l for l in lines))
def colors(label, needle):
    print('=' * 20, label, '=' * 20)
    for y in range(ROWS):
        line = ''.join(screen.buffer[y][x].data for x in range(COLS))
        if needle in line:
            runs = []; cur = None
            for x in range(COLS):
                c = screen.buffer[y][x]
                key = (c.fg, c.bold)
                if cur and cur[0] == key: cur[1] += c.data
                else:
                    cur = [key, c.data]; runs.append(cur)
            print(' | '.join(f"{r[1].strip()}[{r[0][0]}{',b' if r[0][1] else ''}]" for r in runs if r[1].strip()))
for st in steps:
    if 'colors' in st: colors(st['colors'], st['needle'])
    if 'wait' in st: pump(st['wait'])
    if 'send' in st: os.write(fd, st['send'].encode().decode('unicode_escape').encode())
    if 'dump' in st: dump(st['dump'])
pass
try: os.kill(pid, 9)
except Exception: pass
