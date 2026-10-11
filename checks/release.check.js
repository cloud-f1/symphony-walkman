"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var node_test_1 = require("node:test");
var strict_1 = require("node:assert/strict");
var node_fs_1 = require("node:fs");
var json = function (path) { return JSON.parse((0, node_fs_1.readFileSync)(new URL('../' + path, import.meta.url), 'utf8')); };
// Claude Code only offers an update when the version string changes, so the manifest
// version must move on every release and must match package.json.
(0, node_test_1.test)('release: plugin.json and package.json carry the same semver version', function () {
    var plugin = json('.claude-plugin/plugin.json').version;
    var pkg = json('package.json').version;
    strict_1.default.match(plugin, /^\d+\.\d+\.\d+$/);
    strict_1.default.equal(plugin, pkg);
});
(0, node_test_1.test)('release: a version pinned in marketplace.json must match plugin.json', function () {
    var plugin = json('.claude-plugin/plugin.json').version;
    for (var _i = 0, _a = json('.claude-plugin/marketplace.json').plugins; _i < _a.length; _i++) {
        var entry = _a[_i];
        if (entry.version !== undefined)
            strict_1.default.equal(entry.version, plugin);
    }
});
