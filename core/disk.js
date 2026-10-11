"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDf = parseDf;
// Parses `df -Pk <path>` (POSIX format, 1K blocks): last line, columns Available and Capacity.
function parseDf(stdout) {
    var _a, _b;
    var lines = stdout.trim().split('\n');
    var cols = ((_a = lines[lines.length - 1]) !== null && _a !== void 0 ? _a : '').trim().split(/\s+/);
    if (lines.length < 2 || cols.length < 5)
        return undefined;
    var availableKb = Number(cols[3]);
    var used = Number(((_b = cols[4]) !== null && _b !== void 0 ? _b : '').replace('%', ''));
    if (!Number.isFinite(availableKb) || !Number.isFinite(used))
        return undefined;
    return { freeGb: Math.round(availableKb / 1024 / 1024), usedPct: used };
}
