// Public surface of the connection layer (W3). src/index.mjs re-exports this once the owner wires it.
export { CONNECTION_KINDS, ERROR_CODES, MODEL_SLOTS, OUTPUT_FORMATS, PROBE_PROMPT, scrub, failure } from './types.mjs';
export { createConnector, checkConnection } from './connector.mjs';
export { createClaudeCodeConnector, claudeArgv, parseClaudeOutput, CLAUDE_FIXED_ARGS, CLAUDE_LOGIN_ARGS } from './claude-code.mjs';
export { createCodexConnector, codexArgv, parseCodexEvents, codexCandidates, chooseCodex, desktopAppCodex, compareVersions, CODEX_FIXED_ARGS, CODEX_SOURCES, CODEX_LOGIN_ARGS } from './codex.mjs';
export { launchDetached, launchPlan, LAUNCH_STDIO } from './process.mjs';
// v2 package M: the plan's quota and the API balance (docs/core-api.md 5.17)
export { claudeEnvelopeOf, withQuota } from './claude-code.mjs';
export { quotaFromClaudeStream, quotaFromCodexRateLimits, checkQuota, hasBalanceEndpoint, BALANCE_ENDPOINTS, BALANCE_VENDORS, QUOTA_SOURCES, CLAUDE_WINDOWS, CODEX_WINDOWS } from './quota.mjs';
export { readCodexQuota, CODEX_QUOTA_ARGS, CODEX_QUOTA_METHODS } from './codex-quota.mjs';
export { readApiBalance, BALANCE_TIMEOUT_MS } from './balance.mjs';
export { runDialogue, DIALOGUE_TIMEOUT_MS } from './process.mjs';
export { createApiConnector, buildRequest, codeFromHttp, parseSuccess, ANTHROPIC_VERSION } from './api.mjs';
export { CLAUDE_CODE_MODELS, CODEX_MODELS, VENDORS, VENDOR_IDS, modelsFor, recommendedModel, defaultModelFor, resolveModel } from './models.mjs';
export { extractJson } from './json-output.mjs';
export { completeJson, RETRY_SUFFIX } from './complete-json.mjs';
export { fakeConnector, FAKE_MODES } from './fakes.mjs';
// 1.1 W7b: the scripted stand-in that answers checks only (v1.0's, which also scored, is core/legacy's)
export { scriptedConnector } from './scripted.mjs';
export { createUsageCounter, createUsageRecorder, readUsage, readUsageFile, usageTotal, usagePath, USAGE_FILE } from './usage.mjs';
export { findExecutable } from './which.mjs';
export { createWorkdir, removeWorkdir, withWorkdir, DEFAULT_TMP_ROOT } from './workdir.mjs';
// v2 package C: the main agent's session mode (docs/core-api.md 5.15)
export { createSessionConnector, claudeSessionArgv, codexSessionArgv, codexResumeArgv, threadIdOf, emptyFolder, CLAUDE_SESSION_ARGS, CODEX_SESSION_ARGS, CODEX_RESUME_ARGS, CODEX_READ_ONLY_CONFIG, CONNECTION_CODES, AGENT_TIMEOUT_MS,
  WEB_TIMEOUT_MS, WEB_TOOLS, CLAUDE_WEB_ARGS, CODEX_SEARCH_FLAG, claudeWebOf, codexWebOf } from './session.mjs';
