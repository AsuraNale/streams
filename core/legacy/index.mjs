// core/legacy: v1.0's scoring pipeline, moved out of core/src in 1.1 W7b (the maintainer 11-20: 1.1 keeps only the new kind of library;
// acceptance C1: no relevance / substance judgments in the code the installer ships, which is core/src only). It is kept for
// tests and fixtures that need a library "as 1.0 made it" — the libraries existing users have — and is never shipped.
// The rule runs one way: core/legacy imports core/src for what the two share; nothing in core/src imports core/legacy
// (core/test/c1-scan.test.mjs). What 1.1 still has of the pipeline (the inbox, keep / dismiss / later, the run records, the
// schedule, the home numbers, the change log) is core/src's and is exported by core/src/index.mjs, not here.

// the round, its scoring steps and its summary step
export { DEFAULT_PIPELINE, DEFAULTS, pipelineConfig, pipelineFrom, savePipelineConfig, checkPipeline, cfgOf, gateNodes, summaryNode, lockedChecklist, resolveNodes, NODE_KINDS, MATERIALS, MAX_GATES, FIXED_NODE_IDS, BRIEF_GATE, briefOf } from './pipeline/config.mjs';
export { PREAMBLE, PREAMBLE_EN, RETRY_NOTE, RETRY_NOTE_EN, DEFAULT_REQUIREMENTS, LANGUAGES, languageOf, gatePrompt, summaryPrompt, retryPrompt, materialBlock, materialText, relatedBlock, outputFormat, preambleFor, retryNoteFor } from './pipeline/prompts.mjs';
export { fetchBody, readCachedBody, cleanCache, cachePath, CACHE_DIR } from './pipeline/cache.mjs';
export { buildQueue, nextStep, gateResult, verdictThreshold, oldVerdictPassed, laterSteps } from './pipeline/queue.mjs';
export { rescoreInfo, rescoreRejected, standardChange, standardChangedAt, STANDARD_FIELDS } from './pipeline/rescore.mjs';
export { allowedActions, assertAllowed, DECISIONS } from './pipeline/invariants.mjs';
export { runGate, countingConnector, gapConnector, GATE_ATTEMPTS } from './pipeline/score.mjs';
export { runSummary, verificationOf } from './pipeline/summarize.mjs';
export { selfCheck, runRound, previewNode } from './pipeline/round.mjs';
export { moveToInbox, listRejected, listManualWaiting } from './pipeline/decide.mjs';
export { runFunnel, failedStart, callsAddUp } from './pipeline/funnel.mjs';
export { estimateRound, estimateFirstRound, recentNewCounts, RECENT_ROUNDS, CALLS_PER_ITEM, SELF_CHECK_CALLS } from './pipeline/estimate.mjs';
export { STRICTNESS, STRICTNESS_LEVELS, DEFAULT_STRICTNESS, strictnessOf, withThresholds, readStrictness, saveStrictness } from './pipeline/strictness.mjs';
export { constantScoreWarning, MIN_CONSTANT_RUN } from './pipeline/numbers.mjs';
export { relatedEntries, titleTokens } from './pipeline/related.mjs';
// v1.0's scripted connector: it answers the scoring steps, the summary step and the checks (core/src's answers checks only)
export { scriptedConnector, promptKind, scoreKeyOf, judgeIdsOf, titleOf } from './pipeline/fake.mjs';
export { statusView } from './pipeline/status.mjs';
// v1.0's checklists of the scoring steps
export { lockChecklist, gateBaseline, summaryBaseline, baselineDescription, describeChecklist, BASELINE_LANGUAGES, CHECK_KINDS, MAX_CHECKLIST_ITEMS, MIN_DESC_CHARS } from './verify/checklist.mjs';
// v1.0's change log with its scoring fields (the gates' marks, the cap, the prompts): what 严格程度 and 重新评分 read
export { thresholdsOf } from './proposals/changes.mjs';

// the feed fetchers and the fetch round
export { parseFeed } from './fetch/feed.mjs';
export { makeContext, isContext, ARXIV_BASE, HN_BASE, ARXIV_MIN_GAP_MS } from './fetch/context.mjs';
export { fetchSource, SOURCE_KINDS } from './fetch/source.mjs';
export { fetchRound } from './fetch/round.mjs';
export { addManual, MANUAL_SOURCE } from './fetch/manual.mjs';
export { DEFAULT_MIN_POINTS } from './fetch/sources/hn.mjs';

// v1.0's new library: the default scoring steps in streams.json, the starter packs, the 新建库 form's settings
export { createLibraryV1 } from './library/create-v1.mjs';
export { STARTER_PACKS, STARTER_PACK_IDS, BLANK_PACK_ID, starterPack, packView, listStarterPacks, applyStarterPack, applyStarterPackToLibrary } from './library/starter-packs.mjs';
export { newLibrarySettings, fillNewLibrary, checkNewLibrary } from './library/new-library.mjs';
