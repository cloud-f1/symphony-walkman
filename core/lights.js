"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveLight = deriveLight;
exports.parseRunState = parseRunState;
// Priority, highest first: failed > waiting (needs you) > walking > done > idle.
// A symphony run in plan_ready is the human-review gate, so it is always "needs you".
function deriveLight(s) {
    if (s.runState === 'failed' || s.lastTurnFailed)
        return 'failed';
    if (s.askPending || s.runState === 'plan_ready')
        return 'waiting';
    if (s.isWorking || s.runState === 'planning' || s.runState === 'implementing')
        return 'walking';
    if (s.runState === 'completed')
        return 'done';
    return 'idle';
}
function parseRunState(json) {
    try {
        var state = JSON.parse(json).state;
        return typeof state === 'string' && ['created', 'planning', 'plan_ready', 'implementing', 'completed', 'failed'].includes(state)
            ? state
            : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
