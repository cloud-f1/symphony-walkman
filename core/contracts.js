"use strict";
// Shared types. core/* is pure: no I/O, no clock reads, no mods API.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUN_STATES = void 0;
exports.RUN_STATES = ['created', 'planning', 'plan_ready', 'implementing', 'completed', 'failed'];
