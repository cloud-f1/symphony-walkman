// Kept equal to .claude-plugin/plugin.json by checks/release.check.ts, so /walkman version cannot lie.
export const VERSION = '0.20.0'
// The symphony-workflow release the Jira lookup runs (the setup CLI pins the same one).
export const SW_REF = 'v0.12.0'
export const SW_GIT = `git+https://github.com/cloud-f1/symphony-workflow@${SW_REF}`
// Setup installs that release once as a uv tool (it lives outside uv's cache, so `uv cache clean` keeps it).
export const SW_INSTALL = `uv tool install --force --from ${SW_GIT} symphony-workflow`
// Lookups run `uvx --offline --from SW_PIN`: uvx then uses the installed tool and never downloads. A git+ source
// would be resolved and rebuilt in uv's cache on every cold run (minutes), and a lookup killed by its timeout
// leaves a ~200 MB .tmp env behind each time, so the cache never warms and keeps growing.
export const SW_PIN = `symphony-workflow==${SW_REF.replace(/^v/, '')}`
// What `uvx --offline` prints when the pinned release is not installed (it refuses to download it).
export const swNotInstalled = (stderr: string): boolean => /network was disabled|not found in the cache|Git operation failed/i.test(stderr)
