// Public surface of the connection layer (W3). src/index.mjs re-exports this once the owner wires it.
export { CONNECTION_KINDS, ERROR_CODES, MODEL_SLOTS, OUTPUT_FORMATS, PROBE_PROMPT, scrub, failure } from './types.mjs';
export { createConnector, checkConnection } from './connector.mjs';
export { createClaudeCodeConnector, claudeArgv, parseClaudeOutput, CLAUDE_FIXED_ARGS, CLAUDE_LOGIN_ARGS } from './claude-code.mjs';
export { createCodexConnector, codexArgv, parseCodexEvents, codexCandidates, chooseCodex, desktopAppCodex, compareVersions, CODEX_FIXED_ARGS, CODEX_SOURCES, CODEX_LOGIN_ARGS } from './codex.mjs';
export { launchDetached, launchPlan, LAUNCH_STDIO } from './process.mjs';
export { createApiConnector, buildRequest, codeFromHttp, parseSuccess, ANTHROPIC_VERSION } from './api.mjs';
export { CLAUDE_CODE_MODELS, CODEX_MODELS, VENDORS, VENDOR_IDS, modelsFor, recommendedModel, defaultModelFor, resolveModel } from './models.mjs';
export { extractJson } from './json-output.mjs';
export { completeJson, RETRY_SUFFIX } from './complete-json.mjs';
export { fakeConnector, FAKE_MODES } from './fakes.mjs';
export { createUsageCounter, readUsage, usagePath, USAGE_FILE } from './usage.mjs';
export { findExecutable } from './which.mjs';
export { createWorkdir, removeWorkdir, withWorkdir, DEFAULT_TMP_ROOT } from './workdir.mjs';
