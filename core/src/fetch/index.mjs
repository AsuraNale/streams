// Public surface of the fetch layer (W2). src/index.mjs re-exports this.
export { FETCH_STATES, LOG_STATES, PAUSED_STATE, HINTS, hintOf, classifyHttp, classifyError, parseRetryAfter } from './states.mjs';
export { getText, checkUrl, USER_AGENT, DEFAULT_TIMEOUT_MS } from './http.mjs';
export { parseFeed } from './feed.mjs';
export { stripHtml, decodeEntities, truncateText, normalizeTitle, SUMMARY_MAX } from './html.mjs';
export { toIsoDate, localIsoDate, isRealDate } from './dates.mjs';
export { makeContext, isContext, ARXIV_BASE, HN_BASE, ARXIV_MIN_GAP_MS } from './context.mjs';
export { fetchSource, SOURCE_KINDS } from './source.mjs';
export { fetchRound } from './round.mjs';
export { addManual, MANUAL_SOURCE } from './manual.mjs';
export { appendFetchLog, readFetchLog, lastRoundStatus, fetchLogPath, FETCH_LOG_FILE } from './log.mjs';
export { sourceHealth } from './health.mjs';
export { DEFAULT_MIN_POINTS } from './sources/hn.mjs';
