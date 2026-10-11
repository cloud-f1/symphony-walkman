"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalSvg = signalSvg;
// The pedestrian signal for the Desktop surface. Pure string output; the only dynamic value is
// the countdown, which is clamped to 0-99 digits, so nothing user-controlled reaches the markup.
var GREEN = '#22c55e';
var RED = '#ef4444';
function walker(color) {
    // Two legs and two arms swing against each other with SMIL (works in the sandboxed frame; no script).
    var swing = function (from, to) {
        return "<animateTransform attributeName=\"transform\" type=\"rotate\" values=\"".concat(from, " 0 0;").concat(to, " 0 0;").concat(from, " 0 0\" dur=\"0.8s\" repeatCount=\"indefinite\"/>");
    };
    return "<g stroke=\"".concat(color, "\" stroke-width=\"5\" stroke-linecap=\"round\" fill=\"").concat(color, "\" transform=\"translate(30 24)\">\n<circle cx=\"0\" cy=\"-12\" r=\"6\" stroke=\"none\"/>\n<line x1=\"0\" y1=\"-4\" x2=\"0\" y2=\"14\"/>\n<g transform=\"translate(0 14)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"16\">").concat(swing(-28, 28), "</line></g>\n<g transform=\"translate(0 14)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"16\">").concat(swing(28, -28), "</line></g>\n<g transform=\"translate(0 -2)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"12\">").concat(swing(26, -26), "</line></g>\n<g transform=\"translate(0 -2)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"12\">").concat(swing(-26, 26), "</line></g>\n</g>");
}
function standing(color, blink) {
    var anim = blink ? '<animate attributeName="opacity" values="1;0.15;1" dur="0.9s" repeatCount="indefinite"/>' : '';
    return "<g stroke=\"".concat(color, "\" stroke-width=\"5\" stroke-linecap=\"round\" fill=\"").concat(color, "\" transform=\"translate(30 24)\">").concat(anim, "\n<circle cx=\"0\" cy=\"-12\" r=\"6\" stroke=\"none\"/>\n<line x1=\"0\" y1=\"-4\" x2=\"0\" y2=\"14\"/>\n<line x1=\"0\" y1=\"14\" x2=\"-7\" y2=\"30\"/><line x1=\"0\" y1=\"14\" x2=\"7\" y2=\"30\"/>\n<line x1=\"0\" y1=\"2\" x2=\"-10\" y2=\"12\"/><line x1=\"0\" y1=\"2\" x2=\"10\" y2=\"12\"/>\n</g>");
}
function signalSvg(light, seconds) {
    var digits = String(Math.min(99, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)))).padStart(2, '0');
    var color = light === 'walking' ? GREEN : light === 'done' ? GREEN : light === 'idle' ? '#9ca3af' : RED;
    var figure = light === 'walking' ? walker(color) : standing(color, light === 'failed');
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"64\" viewBox=\"0 0 120 64\">\n<rect width=\"120\" height=\"64\" rx=\"10\" fill=\"#0b0f0b\"/>\n".concat(figure, "\n<text x=\"108\" y=\"42\" text-anchor=\"end\" font-family=\"monospace\" font-size=\"26\" font-weight=\"700\" fill=\"").concat(color, "\">").concat(digits, "</text>\n</svg>");
}
