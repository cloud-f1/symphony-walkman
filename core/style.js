"use strict";
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
exports.summary = exports.plain = void 0;
exports.progressBar = progressBar;
exports.styleBand = styleBand;
exports.stylePane = stylePane;
exports.styleBoard = styleBoard;
var board_ts_1 = require("./board.ts");
Object.defineProperty(exports, "summary", { enumerable: true, get: function () { return board_ts_1.summary; } });
var GLYPH = { walking: '🟢', waiting: '🔴', failed: '🔴', done: '✓', idle: '○' };
var LABEL = { walking: 'running', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'idle' };
var TONE = { walking: 'success', waiting: 'error', failed: 'error', done: 'success', idle: 'subtle' };
var ORDER = ['failed', 'waiting', 'walking', 'done', 'idle'];
var plain = function (line) { return line.map(function (s) { return s.text; }).join(''); };
exports.plain = plain;
var stateText = function (r) { var _a; return (_a = r.runState) !== null && _a !== void 0 ? _a : LABEL[r.light]; };
var glyph = function (r) { return ({ text: GLYPH[r.light], tone: TONE[r.light], bold: true }); };
// Run progress for symphony-workflow's states, drawn like the status line bars: filled blocks then dots.
var STEPS = ['created', 'planning', 'plan_ready', 'implementing', 'completed'];
function progressBar(state) {
    var at = state === 'failed' || state === undefined ? -1 : STEPS.indexOf(state);
    if (at < 0)
        return '';
    return '█'.repeat(at + 1) + '░'.repeat(STEPS.length - at - 1);
}
// The strip above the prompt: the most urgent card, then how many more.
function styleBand(rows, now) {
    var lead = __spreadArray([], rows, true).sort(function (a, b) { return ORDER.indexOf(a.light) - ORDER.indexOf(b.light); })[0];
    if (!lead)
        return [];
    var line = [
        glyph(lead),
        { text: ' ' + lead.key, bold: true },
        { text: ' ' + LABEL[lead.light], tone: TONE[lead.light], bold: lead.light === 'waiting' || lead.light === 'failed' },
        { text: ' ' + (0, board_ts_1.formatElapsed)(now - lead.sinceMs), tone: 'subtle' },
    ];
    if (rows.length > 1)
        line.push({ text: "  (+".concat(rows.length - 1, ")"), tone: 'subtle' });
    return line;
}
var footer = function (rows, disk) {
    var n = function (l) { return rows.filter(function (r) { return r.light === l; }).length; };
    var out = [];
    if (disk) {
        var tone = disk.usedPct >= 90 ? 'error' : disk.usedPct >= 80 ? 'warning' : 'success';
        out.push([{ text: 'disk ', tone: 'subtle' }, { text: "".concat(disk.freeGb, " GB free"), tone: tone }, { text: " \u00B7 ".concat(disk.usedPct, "% used"), tone: 'subtle' }]);
    }
    out.push(__spreadArray(__spreadArray([
        { text: "".concat(n('walking'), " running"), tone: n('walking') > 0 ? 'success' : 'subtle' },
        { text: ' · ', tone: 'subtle' },
        { text: "".concat(n('done'), " done"), tone: 'subtle' }
    ], (n('waiting') > 0 ? [{ text: ' · ', tone: 'subtle' }, { text: "".concat(n('waiting'), " needs you"), tone: 'error', bold: true }] : []), true), (n('failed') > 0 ? [{ text: ' · ', tone: 'subtle' }, { text: "".concat(n('failed'), " failed"), tone: 'error', bold: true }] : []), true));
    return out;
};
// The side pane: narrow, so each card is two short lines and nothing needs to wrap.
function stylePane(rows, disk, now) {
    var lines = [];
    if (rows.length === 0) {
        lines.push([{ text: 'No card branch found.', tone: 'subtle' }], [{ text: 'Work in a KEY-<n>-<slug> branch.', tone: 'subtle' }]);
    }
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var r = rows_1[_i];
        var bar = progressBar(r.runState);
        lines.push([
            glyph(r),
            { text: ' ' + r.key, bold: true },
            { text: ' ' + stateText(r), tone: TONE[r.light], bold: r.light === 'waiting' || r.light === 'failed' },
            { text: ' ' + (0, board_ts_1.formatElapsed)(now - r.sinceMs), tone: 'subtle' },
        ]);
        var detail = [{ text: '   ' + (r.slug === '' ? r.branch : r.slug), tone: 'subtle' }];
        if (bar !== '')
            detail.push({ text: ' ' + bar, tone: TONE[r.light] });
        lines.push(detail);
    }
    lines.push.apply(lines, __spreadArray([[]], footer(rows, disk), false));
    return lines;
}
// The printed board (plain text is the contract; tones are used where the surface can draw them).
function styleBoard(rows, disk, now) {
    var lines = rows.map(function (r) { return [
        glyph(r),
        { text: ' ' + r.key.padEnd(9), bold: true },
        { text: ' ' + (r.slug === '' ? '' : r.slug.slice(0, 28)).padEnd(28), tone: 'subtle' },
        { text: ' ' + stateText(r).padEnd(13), tone: TONE[r.light] },
        { text: ' ' + (0, board_ts_1.formatElapsed)(now - r.sinceMs), tone: 'subtle' },
    ]; });
    if (rows.length === 0)
        lines.push([{ text: 'No card branch found. Work in a KEY-<n>-<slug> branch to light a card.', tone: 'subtle' }]);
    lines.push.apply(lines, __spreadArray([[]], footer(rows, disk), false));
    return lines;
}
