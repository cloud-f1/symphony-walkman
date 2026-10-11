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
exports.formatElapsed = formatElapsed;
exports.summary = summary;
exports.renderBand = renderBand;
exports.renderBoard = renderBoard;
var GLYPH = { walking: '🟢', waiting: '🔴', failed: '🔴', done: '✓ ', idle: '· ' };
var LABEL = { walking: 'running', waiting: 'needs you', failed: 'failed', done: 'done', idle: 'idle' };
function formatElapsed(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return "".concat(m, ":").concat(String(s).padStart(2, '0'));
}
function summary(rows) {
    var n = function (l) { return rows.filter(function (r) { return r.light === l; }).length; };
    var parts = ["".concat(n('walking'), " running"), "".concat(n('done'), " done")];
    if (n('waiting') > 0)
        parts.push("".concat(n('waiting'), " needs you"));
    if (n('failed') > 0)
        parts.push("".concat(n('failed'), " failed"));
    return parts.join(' · ');
}
// One line for the band above the prompt: the most urgent card first.
function renderBand(rows, now) {
    if (rows.length === 0)
        return '';
    var order = ['failed', 'waiting', 'walking', 'done', 'idle'];
    var lead = __spreadArray([], rows, true).sort(function (a, b) { return order.indexOf(a.light) - order.indexOf(b.light); })[0];
    var more = rows.length > 1 ? "  (+".concat(rows.length - 1, ")") : '';
    return "".concat(GLYPH[lead.light], " ").concat(lead.key, " ").concat(LABEL[lead.light], " ").concat(formatElapsed(now - lead.sinceMs)).concat(more);
}
function renderBoard(rows, disk, now) {
    var lines = rows.map(function (r) {
        var _a;
        var slug = r.slug === '' ? '' : r.slug.slice(0, 28);
        var state = (_a = r.runState) !== null && _a !== void 0 ? _a : LABEL[r.light];
        return "".concat(GLYPH[r.light], " ").concat(r.key.padEnd(9), " ").concat(slug.padEnd(28), " ").concat(state.padEnd(13), " ").concat(formatElapsed(now - r.sinceMs));
    });
    if (rows.length === 0)
        lines.push('No card branch found. Work in a CF1-<n>-<slug> branch to light a card.');
    if (disk)
        lines.push('', "disk \u00B7 ".concat(disk.freeGb, " GB free \u00B7 ").concat(disk.usedPct, "% used"));
    lines.push('', summary(rows));
    return lines;
}
