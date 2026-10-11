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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
var card_ts_1 = require("../core/card.ts");
var lights_ts_1 = require("../core/lights.ts");
var disk_ts_1 = require("../core/disk.ts");
var board_ts_1 = require("../core/board.ts");
var style_ts_1 = require("../core/style.ts");
var svg_ts_1 = require("../core/svg.ts");
var PANE_ID = 'walkman-pane';
var REFRESH_MS = 3000; // draws can repeat often; reread git / files at most this often
// Session-local state. Resets on reload.
var pluginOptions = {};
var live = new Map();
var cache = { at: -Infinity, rows: [] };
function option(name, fallback) {
    var v = pluginOptions[name];
    return typeof v === 'string' && v !== '' ? v : fallback;
}
// Same rule as jev-agent-kit: only "~" and "~/..." expand, and a result that is not absolute is ignored.
function expandHome($, p) {
    return __awaiter(this, void 0, void 0, function () {
        var home, _a, out;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, $.env.get('HOME')];
                case 1:
                    _a = (_b.sent());
                    if (_a) return [3 /*break*/, 3];
                    return [4 /*yield*/, $.env.get('USERPROFILE')];
                case 2:
                    _a = (_b.sent());
                    _b.label = 3;
                case 3:
                    home = _a || '';
                    out = p === '~' || p.startsWith('~/') ? home + p.slice(1) : p;
                    return [2 /*return*/, /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(out) ? out : ''];
            }
        });
    });
}
// Tones follow the person's theme (the same keys the status line colors map to).
var THEME = { success: 'success', error: 'error', warning: 'warning', subtle: 'inactive', text: 'text' };
// One styled line as a row of Text pieces. Wrapping is off so a narrow pane never splits a card.
function styled(Box, Text, line) {
    if (line.length === 0)
        return h(Text, null, ' ');
    return h.apply(void 0, __spreadArray([Box, { flexDirection: 'row' }], line.map(function (seg) { var _a; return h(Text, { color: THEME[(_a = seg.tone) !== null && _a !== void 0 ? _a : 'text'], bold: seg.bold === true, wrap: 'truncate-end' }, seg.text); }), false));
}
function readRunState($, key) {
    return __awaiter(this, void 0, void 0, function () {
        var dir, path, _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, expandHome($, option('runs_dir', ''))];
                case 1:
                    dir = _d.sent();
                    if (dir === '')
                        return [2 /*return*/, undefined];
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 7, , 8]);
                    path = dir + '/' + key + '/run.json';
                    return [4 /*yield*/, $.fs.exists(path)];
                case 3:
                    if (!(_d.sent())) return [3 /*break*/, 5];
                    _b = lights_ts_1.parseRunState;
                    return [4 /*yield*/, $.fs.read(path)];
                case 4:
                    _a = _b.apply(void 0, [_d.sent()]);
                    return [3 /*break*/, 6];
                case 5:
                    _a = undefined;
                    _d.label = 6;
                case 6: return [2 /*return*/, _a];
                case 7:
                    _c = _d.sent();
                    return [2 /*return*/, undefined]; // unreadable run file: no symphony signal, never a crash
                case 8: return [2 /*return*/];
            }
        });
    });
}
function readDisk($) {
    return __awaiter(this, void 0, void 0, function () {
        var path, run, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, $.env.get('OS')];
                case 1:
                    if ((_b.sent()) === 'Windows_NT')
                        return [2 /*return*/, undefined]; // df is POSIX; no Windows branch yet
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, expandHome($, option('disk_path', '/'))];
                case 3:
                    path = (_b.sent()) || '/';
                    return [4 /*yield*/, $.process.run(['df', '-Pk', path], { timeoutMs: 1500 })];
                case 4:
                    run = _b.sent();
                    return [2 /*return*/, run.exitCode === 0 ? (0, disk_ts_1.parseDf)(run.stdout) : undefined];
                case 5:
                    _a = _b.sent();
                    return [2 /*return*/, undefined];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function refresh($) {
    return __awaiter(this, void 0, void 0, function () {
        var now, rows, cwd, run, _i, _a, wt, card, sig, runState, _b, _c;
        var _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, $.clock.now()];
                case 1:
                    now = _h.sent();
                    if (now - cache.at >= 0 && now - cache.at < REFRESH_MS)
                        return [2 /*return*/];
                    cache.at = now;
                    rows = [];
                    _h.label = 2;
                case 2:
                    _h.trys.push([2, 9, , 10]);
                    return [4 /*yield*/, $.session.cwd()];
                case 3:
                    cwd = _h.sent();
                    return [4 /*yield*/, $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: cwd, timeoutMs: 2000 })];
                case 4:
                    run = _h.sent();
                    if (!(run.exitCode === 0)) return [3 /*break*/, 8];
                    _i = 0, _a = (0, card_ts_1.parseWorktrees)(run.stdout);
                    _h.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    wt = _a[_i];
                    card = (0, card_ts_1.cardFromBranch)(wt.branch, wt.path);
                    if (!card)
                        return [3 /*break*/, 7];
                    sig = live.get(wt.path);
                    return [4 /*yield*/, readRunState($, card.key)];
                case 6:
                    runState = _h.sent();
                    rows.push(__assign(__assign({}, card), { runState: runState, light: (0, lights_ts_1.deriveLight)({ isWorking: (_d = sig === null || sig === void 0 ? void 0 : sig.isWorking) !== null && _d !== void 0 ? _d : false, askPending: (_e = sig === null || sig === void 0 ? void 0 : sig.askPending) !== null && _e !== void 0 ? _e : false, lastTurnFailed: (_f = sig === null || sig === void 0 ? void 0 : sig.lastTurnFailed) !== null && _f !== void 0 ? _f : false, runState: runState }), sinceMs: (_g = sig === null || sig === void 0 ? void 0 : sig.sinceMs) !== null && _g !== void 0 ? _g : now }));
                    _h.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [3 /*break*/, 10];
                case 9:
                    _b = _h.sent();
                    return [3 /*break*/, 10];
                case 10:
                    cache.rows = rows;
                    _c = cache;
                    return [4 /*yield*/, readDisk($)];
                case 11:
                    _c.disk = _h.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Mark the session's current worktree. Unknown (non-card) worktrees are ignored by refresh().
function mark($, patch) {
    return __awaiter(this, void 0, void 0, function () {
        var cwd, top_1, path, prev, _a, _b, _c, _d, _e;
        var _f;
        var _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    _h.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, $.session.cwd()];
                case 1:
                    cwd = _h.sent();
                    return [4 /*yield*/, $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: cwd, timeoutMs: 1500 })];
                case 2:
                    top_1 = _h.sent();
                    path = top_1.exitCode === 0 ? top_1.stdout.trim() : cwd;
                    prev = (_g = live.get(path)) !== null && _g !== void 0 ? _g : { isWorking: false, askPending: false, lastTurnFailed: false, sinceMs: 0 };
                    _b = (_a = live).set;
                    _c = [path];
                    _d = [__assign(__assign({}, prev), patch)];
                    _f = {};
                    return [4 /*yield*/, $.clock.now()];
                case 3:
                    _b.apply(_a, _c.concat([__assign.apply(void 0, _d.concat([(_f.sinceMs = _h.sent(), _f)]))]));
                    cache.at = -Infinity; // a signal changed: reread on the next draw
                    $.ui.invalidate('ui.render');
                    return [3 /*break*/, 5];
                case 4:
                    _e = _h.sent();
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function register(on, options) {
    var _this = this;
    pluginOptions = (options !== null && options !== void 0 ? options : {});
    on('session.start', function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, $.command.register({ name: 'walkman', description: 'Card board: colored side pane (default), board (print), pane close', argumentHint: 'board|pane|pane close' })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('turn.start', function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, mark($, { isWorking: true, askPending: false, lastTurnFailed: false })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('turn.complete', function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        var reason, failed;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    reason = String((_a = e.reason) !== null && _a !== void 0 ? _a : '');
                    failed = reason === 'refusal' || reason.includes('error');
                    return [4 /*yield*/, mark($, { isWorking: false, askPending: false, lastTurnFailed: failed })];
                case 1:
                    _b.sent();
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    // A permission ask is the red man: the engine's verdict is 'ask' until the person answers.
    on('tool.check', function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        var verdict;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    verdict = _a.sent();
                    if (!(verdict.decision === 'ask')) return [3 /*break*/, 3];
                    return [4 /*yield*/, mark($, { askPending: true })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/, verdict];
            }
        });
    }); });
    on('tool.call', function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, mark($, { askPending: false })]; // a call running means the ask was answered
                case 1:
                    _a.sent(); // a call running means the ask was answered
                    return [2 /*return*/, next(e)];
            }
        });
    }); });
    on('command.run', { command: 'walkman' }, function ($, e) { return __awaiter(_this, void 0, void 0, function () {
        var _a, sub, arg, openPane, _b, lines, _c, _d;
        var _this = this;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = String((_e = e.args) !== null && _e !== void 0 ? _e : '').trim().split(/\s+/), sub = _a[0], arg = _a[1];
                    openPane = function () { return __awaiter(_this, void 0, void 0, function () {
                        var opened, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, $.ui.open({ id: PANE_ID, title: 'Walkman', closeOnEscape: true })];
                                case 1:
                                    opened = _b.sent();
                                    return [2 /*return*/, opened.isPlaced];
                                case 2:
                                    _a = _b.sent();
                                    return [2 /*return*/, false];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); };
                    if (!(sub === 'pane' && arg === 'close')) return [3 /*break*/, 4];
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, $.ui.close({ id: PANE_ID })];
                case 2:
                    _f.sent();
                    return [2 /*return*/, { text: 'Pane closed.' }];
                case 3:
                    _b = _f.sent();
                    return [2 /*return*/, { text: 'Could not close the pane here.' }];
                case 4:
                    if (!(sub === 'pane' || sub === undefined || sub === '')) return [3 /*break*/, 6];
                    return [4 /*yield*/, openPane()];
                case 5:
                    if (_f.sent())
                        return [2 /*return*/, { text: 'Walkman pane opened. /walkman pane close (or Esc) closes it.' }];
                    if (sub === 'pane')
                        return [2 /*return*/, { text: 'Walkman pane is waiting: widen the terminal to see it.' }
                            // /walkman with no room for a pane: fall through to the printed board.
                        ];
                    _f.label = 6;
                case 6: return [4 /*yield*/, refresh($)
                    // The host puts "<plugin>:" in front of the first line, so a header line keeps the rows aligned.
                ];
                case 7:
                    _f.sent();
                    _c = board_ts_1.renderBoard;
                    _d = [cache.rows, cache.disk];
                    return [4 /*yield*/, $.clock.now()];
                case 8:
                    lines = _c.apply(void 0, _d.concat([_f.sent()]));
                    return [2 /*return*/, { text: __spreadArray(['Walkman board'], lines, true).join('\n') }];
            }
        });
    }); });
    on('ui.render', { component: 'Pane', requestId: PANE_ID }, function ($, e) { return __awaiter(_this, void 0, void 0, function () {
        var _a, Box, Text, lines, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = $.ui.resolve(e), Box = _a.Box, Text = _a.Text;
                    return [4 /*yield*/, refresh($)];
                case 1:
                    _d.sent();
                    _b = style_ts_1.stylePane;
                    _c = [cache.rows, cache.disk];
                    return [4 /*yield*/, $.clock.now()];
                case 2:
                    lines = _b.apply(void 0, _c.concat([_d.sent()]));
                    return [2 /*return*/, h.apply(void 0, __spreadArray([Box, { flexDirection: 'column', paddingX: 1 }], lines.map(function (line) { return styled(Box, Text, line); }), false))];
            }
        });
    }); });
    // The always-on strip above the prompt: one text line on the terminal, the signal drawing on Desktop.
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(_this, void 0, void 0, function () {
        var now, lead, elements, _a, Box_1, Svg, Text_1, _b, Box, Text;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, refresh($)];
                case 1:
                    _e.sent();
                    if (cache.rows.length === 0)
                        return [2 /*return*/, next(e)]; // not in a card worktree: draw nothing of our own
                    return [4 /*yield*/, $.clock.now()];
                case 2:
                    now = _e.sent();
                    lead = (_d = (_c = cache.rows.find(function (r) { return r.light === 'failed' || r.light === 'waiting'; })) !== null && _c !== void 0 ? _c : cache.rows.find(function (r) { return r.light === 'walking'; })) !== null && _d !== void 0 ? _d : cache.rows[0];
                    elements = $.ui.resolve(e);
                    if (e.surface === 'desktop' && lead && elements['Svg']) {
                        _a = elements, Box_1 = _a.Box, Svg = _a.Svg, Text_1 = _a.Text;
                        return [2 /*return*/, h(Box_1, { flexDirection: 'row', paddingX: 1 }, 
                            // Svg is a leaf: call the constructor directly, since h() would hand it an empty `children`.
                            Svg({ source: (0, svg_ts_1.signalSvg)(lead.light, Math.floor((now - lead.sinceMs) / 1000)), alt: "".concat(lead.key, " is ").concat(lead.light), width: 120, height: 64 }), h(Box_1, { flexDirection: 'row', paddingX: 1 }, styled(Box_1, Text_1, (0, style_ts_1.styleBand)(cache.rows, now))))];
                    }
                    _b = $.ui.resolve(e), Box = _b.Box, Text = _b.Text;
                    return [2 /*return*/, h(Box, { paddingX: 1 }, styled(Box, Text, (0, style_ts_1.styleBand)(cache.rows, now)))];
            }
        });
    }); });
}
