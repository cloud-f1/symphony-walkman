"use strict";
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var CWD = '/r/.claude/worktrees/a';
var PORCELAIN = 'worktree /r\nHEAD abc\nbranch refs/heads/main\n\n' +
    'worktree /r/.claude/worktrees/a\nHEAD def\nbranch refs/heads/CF1-195-devopsday-visuals\n';
var DF = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/d 488245288 400000000 77594624 84% /\n';
function stubs(on, setup) {
    var _a;
    if (setup === void 0) { setup = {}; }
    var files = (_a = setup.files) !== null && _a !== void 0 ? _a : {};
    var registered = [];
    var panes = [];
    testing_1.mock.clock(on);
    on('env.get', function (_, e) { return ({ value: e.name === 'HOME' ? '/home/u' : undefined }); });
    on('session.cwd', function () { return ({ value: CWD }); });
    on('fs.exists', function (_, e) { return ({ value: e.path in files }); });
    on('fs.read', function (_, e) {
        if (!(e.path in files))
            throw new Error('ENOENT');
        return { value: files[e.path] };
    });
    on('process.run', function (_, e) {
        var _a;
        var _b = e.argv, cmd = _b[0], a = _b[1], b = _b[2];
        if (cmd === 'git' && a === 'worktree')
            return { value: { exitCode: 0, stdout: (_a = setup.porcelain) !== null && _a !== void 0 ? _a : PORCELAIN, stderr: '' } };
        if (cmd === 'git' && a === 'rev-parse' && b === '--show-toplevel')
            return { value: { exitCode: 0, stdout: CWD + '\n', stderr: '' } };
        if (cmd === 'df')
            return { value: { exitCode: 0, stdout: DF, stderr: '' } };
        return { value: { exitCode: 127, stdout: '', stderr: '' } };
    });
    on('ui.open', function (_, e) { panes.push('open:' + e.id); return { value: { isPlaced: true } }; });
    on('ui.close', function (_, e) { panes.push('close:' + e.id); return { value: undefined }; });
    on('ui.resolve', function () { return ({
        Box: function (_a) {
            var children = _a.children, props = __rest(_a, ["children"]);
            return ({ type: 'Box', props: props, children: children });
        },
        Text: function (_a) {
            var children = _a.children, props = __rest(_a, ["children"]);
            return ({ type: 'Text', props: props, children: children });
        },
        Svg: function (props) { return ({ type: 'Svg', props: props }); }, // a leaf: never takes children
    }); });
    on('command.register', function (_, e) { registered.push(e.name); return { value: undefined }; });
    on('session.start', function () { return ({ cwd: CWD }); });
    on('turn.start', function (_, e) { return ({ turnId: e.turnId }); });
    on('turn.complete', function (_, e) { var _a; return ({ text: (_a = e.answer) !== null && _a !== void 0 ? _a : '' }); });
    return { registered: registered, panes: panes };
}
var walkman = function ($, args) { return $.command.run({ command: 'walkman', args: args }); };
var flat = function (tree) { return JSON.stringify(tree); };
(0, testing_1.test)('session.start registers /walkman', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var s;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                s = stubs(on);
                return [4 /*yield*/, $.session.start({ surface: 'terminal', isInteractive: true, cwd: CWD })];
            case 1:
                _a.sent();
                (0, testing_1.expect)(s.registered).toContain('walkman');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('board lists the card from the worktree branch and the disk', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var out;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                stubs(on);
                return [4 /*yield*/, walkman($, 'board')];
            case 1:
                out = _a.sent();
                (0, testing_1.expect)(out.text).toContain('CF1-195');
                (0, testing_1.expect)(out.text).toContain('devopsday-visuals');
                (0, testing_1.expect)(out.text).toContain('disk · 74 GB free');
                (0, testing_1.expect)(out.text).not.toContain('main');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a running turn lights the card green, completion clears it', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                stubs(on);
                return [4 /*yield*/, $.turn.start({ text: 'go', turnId: 't1' })];
            case 1:
                _c.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, walkman($, 'board')];
            case 2:
                _a.apply(void 0, [(_c.sent()).text]).toContain('running');
                return [4 /*yield*/, $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'end_turn' })];
            case 3:
                _c.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, walkman($, 'board')];
            case 4:
                _b.apply(void 0, [(_c.sent()).text]).not.toContain('running  ');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a run file is ignored until runs_dir is set (plan_ready path is NOT covered here)', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var out;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                stubs(on, { files: { '/runs/CF1-195/run.json': '{"state":"plan_ready"}' } });
                return [4 /*yield*/, walkman($, 'board')
                    // runs_dir is a plugin option; with none set the file is ignored and the card is simply idle.
                ];
            case 1:
                out = _a.sent();
                // runs_dir is a plugin option; with none set the file is ignored and the card is simply idle.
                (0, testing_1.expect)(out.text).toContain('idle');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('no card branch gives the hint, not an error', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                stubs(on, { porcelain: 'worktree /r\nHEAD abc\nbranch refs/heads/main\n' });
                _a = testing_1.expect;
                return [4 /*yield*/, walkman($, 'board')];
            case 1:
                _a.apply(void 0, [(_b.sent()).text]).toContain('No card branch found');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('pane opens and closes', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var s;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                s = stubs(on);
                return [4 /*yield*/, walkman($, 'pane')];
            case 1:
                _a.sent();
                return [4 /*yield*/, walkman($, 'pane close')];
            case 2:
                _a.sent();
                (0, testing_1.expect)(s.panes).toEqual(['open:walkman-pane', 'close:walkman-pane']);
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('the AbovePrompt band draws the card line on terminal and the signal on desktop', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var term, desk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                stubs(on);
                return [4 /*yield*/, $.turn.start({ text: 'go', turnId: 't1' })];
            case 1:
                _a.sent();
                return [4 /*yield*/, $.ui.render({ surface: 'terminal', component: 'AbovePrompt', props: {} })];
            case 2:
                term = _a.sent();
                (0, testing_1.expect)(flat(term)).toContain('CF1-195');
                return [4 /*yield*/, $.ui.render({ surface: 'desktop', component: 'AbovePrompt', props: {} })];
            case 3:
                desk = _a.sent();
                (0, testing_1.expect)(flat(desk)).toContain('Svg');
                (0, testing_1.expect)(flat(desk)).toContain('CF1-195');
                return [2 /*return*/];
        }
    });
}); });
(0, testing_1.test)('a permission ask lights the red man until a tool runs', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                stubs(on);
                on('tool.check', function () { return ({ decision: 'ask' }); });
                on('tool.call', function () { return ({ result: {}, text: 'ok' }); });
                return [4 /*yield*/, $.tool.check({ tool: 'Bash', command: 'ls' })];
            case 1:
                _c.sent();
                _a = testing_1.expect;
                return [4 /*yield*/, walkman($, 'board')];
            case 2:
                _a.apply(void 0, [(_c.sent()).text]).toContain('needs you');
                return [4 /*yield*/, $.tool.call({ tool: 'Bash', command: 'ls' })];
            case 3:
                _c.sent();
                _b = testing_1.expect;
                return [4 /*yield*/, walkman($, 'board')];
            case 4:
                _b.apply(void 0, [(_c.sent()).text]).not.toContain('needs you  ');
                return [2 /*return*/];
        }
    });
}); });
