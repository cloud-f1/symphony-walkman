"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardFromBranch = cardFromBranch;
exports.parseWorktrees = parseWorktrees;
// Branch convention (CAS rules/task-workflow.md): CF1-{n}-{slug}. Any Jira-style KEY-n prefix works.
var BRANCH = /^([A-Z][A-Z0-9]{1,9}-\d{1,6})(?:-(.*))?$/;
function cardFromBranch(branch, worktree) {
    var _a;
    if (worktree === void 0) { worktree = ''; }
    var m = BRANCH.exec(branch.trim());
    if (!m)
        return undefined;
    return { key: m[1], slug: (_a = m[2]) !== null && _a !== void 0 ? _a : '', branch: branch.trim(), worktree: worktree };
}
// Parses `git worktree list --porcelain` into [path, branch] pairs; detached or bare entries are skipped.
function parseWorktrees(porcelain) {
    var out = [];
    for (var _i = 0, _a = porcelain.split(/\n\s*\n/); _i < _a.length; _i++) {
        var block = _a[_i];
        var path = '';
        var branch = '';
        for (var _b = 0, _c = block.split('\n'); _b < _c.length; _b++) {
            var line = _c[_b];
            if (line.startsWith('worktree '))
                path = line.slice(9).trim();
            else if (line.startsWith('branch '))
                branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
        }
        if (path !== '' && branch !== '')
            out.push({ path: path, branch: branch });
    }
    return out;
}
