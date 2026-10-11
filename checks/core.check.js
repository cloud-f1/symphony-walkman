"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var node_test_1 = require("node:test");
var strict_1 = require("node:assert/strict");
var card_ts_1 = require("../core/card.ts");
var lights_ts_1 = require("../core/lights.ts");
var disk_ts_1 = require("../core/disk.ts");
var board_ts_1 = require("../core/board.ts");
var svg_ts_1 = require("../core/svg.ts");
var row = function (over) { return (__assign({ key: 'CF1-1', slug: 's', branch: 'CF1-1-s', worktree: '/w', light: 'walking', sinceMs: 0 }, over)); };
(0, node_test_1.test)('card from branch: key, slug, and non-card branches', function () {
    var _a;
    strict_1.default.deepEqual((0, card_ts_1.cardFromBranch)('CF1-195-devopsday-visuals', '/w'), { key: 'CF1-195', slug: 'devopsday-visuals', branch: 'CF1-195-devopsday-visuals', worktree: '/w' });
    strict_1.default.equal((_a = (0, card_ts_1.cardFromBranch)('CF1-7')) === null || _a === void 0 ? void 0 : _a.slug, '');
    strict_1.default.equal((0, card_ts_1.cardFromBranch)('main'), undefined);
    strict_1.default.equal((0, card_ts_1.cardFromBranch)('chore-tidy-rules'), undefined);
    strict_1.default.equal((0, card_ts_1.cardFromBranch)('feature/CF1-1-x'), undefined);
});
(0, node_test_1.test)('parseWorktrees skips detached and bare entries', function () {
    var porcelain = 'worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-2-a\n\nworktree /x\nHEAD 1\ndetached\n\nworktree /bare\nbare\n';
    strict_1.default.deepEqual((0, card_ts_1.parseWorktrees)(porcelain), [{ path: '/r', branch: 'main' }, { path: '/r/.claude/worktrees/a', branch: 'CF1-2-a' }]);
});
(0, node_test_1.test)('light priority: failed > waiting > walking > done > idle', function () {
    var base = { isWorking: false, askPending: false, lastTurnFailed: false };
    strict_1.default.equal((0, lights_ts_1.deriveLight)(base), 'idle');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { isWorking: true })), 'walking');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { isWorking: true, askPending: true })), 'waiting');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { runState: 'plan_ready' })), 'waiting');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { runState: 'implementing' })), 'walking');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { runState: 'completed' })), 'done');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { askPending: true, lastTurnFailed: true })), 'failed');
    strict_1.default.equal((0, lights_ts_1.deriveLight)(__assign(__assign({}, base), { runState: 'failed', isWorking: true })), 'failed');
});
(0, node_test_1.test)('parseRunState accepts only known states and survives bad json', function () {
    strict_1.default.equal((0, lights_ts_1.parseRunState)('{"state":"plan_ready","id":"x"}'), 'plan_ready');
    strict_1.default.equal((0, lights_ts_1.parseRunState)('{"state":"bogus"}'), undefined);
    strict_1.default.equal((0, lights_ts_1.parseRunState)('not json'), undefined);
    strict_1.default.equal((0, lights_ts_1.parseRunState)('{}'), undefined);
});
(0, node_test_1.test)('parseDf reads POSIX df output and rejects junk', function () {
    var out = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 488245288 400000000 77594624 84% /\n';
    strict_1.default.deepEqual((0, disk_ts_1.parseDf)(out), { freeGb: 74, usedPct: 84 });
    strict_1.default.equal((0, disk_ts_1.parseDf)(''), undefined);
    strict_1.default.equal((0, disk_ts_1.parseDf)('only one line'), undefined);
    strict_1.default.equal((0, disk_ts_1.parseDf)('h\na b c d e'), undefined);
});
(0, node_test_1.test)('elapsed and summary', function () {
    strict_1.default.equal((0, board_ts_1.formatElapsed)(24000), '0:24');
    strict_1.default.equal((0, board_ts_1.formatElapsed)(125000), '2:05');
    strict_1.default.equal((0, board_ts_1.formatElapsed)(-5), '0:00');
    strict_1.default.equal((0, board_ts_1.summary)([row({}), row({ light: 'walking' }), row({ light: 'done' }), row({ light: 'waiting' })]), '2 running · 1 done · 1 needs you');
});
(0, node_test_1.test)('band leads with the most urgent card', function () {
    var rows = [row({ key: 'CF1-1', light: 'walking' }), row({ key: 'CF1-2', light: 'waiting' })];
    strict_1.default.match((0, board_ts_1.renderBand)(rows, 65000), /^🔴 CF1-2 needs you 1:05 {2}\(\+1\)$/);
    strict_1.default.equal((0, board_ts_1.renderBand)([], 0), '');
});
(0, node_test_1.test)('board shows disk and an empty-state hint', function () {
    var _a, _b;
    var lines = (0, board_ts_1.renderBoard)([row({})], { freeGb: 74, usedPct: 84 }, 24000);
    strict_1.default.ok(lines.some(function (l) { return l.includes('disk · 74 GB free'); }));
    strict_1.default.ok((_a = lines[0]) === null || _a === void 0 ? void 0 : _a.includes('CF1-1'));
    strict_1.default.ok((_b = (0, board_ts_1.renderBoard)([], undefined, 0)[0]) === null || _b === void 0 ? void 0 : _b.includes('No card branch found'));
});
(0, node_test_1.test)('svg: color per light, clamped countdown, nothing else injectable', function () {
    strict_1.default.match((0, svg_ts_1.signalSvg)('walking', 7), />07</);
    strict_1.default.match((0, svg_ts_1.signalSvg)('walking', 7), /#22c55e/);
    strict_1.default.match((0, svg_ts_1.signalSvg)('waiting', 7), /#ef4444/);
    strict_1.default.match((0, svg_ts_1.signalSvg)('failed', 7), /<animate attributeName="opacity"/);
    strict_1.default.match((0, svg_ts_1.signalSvg)('walking', 5000), />99</);
    strict_1.default.match((0, svg_ts_1.signalSvg)('walking', NaN), />00</);
    strict_1.default.ok(!(0, svg_ts_1.signalSvg)('walking', 3).includes('<script'));
});
