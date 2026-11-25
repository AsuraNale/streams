// Public surface of the fetch layer (W2). src/index.mjs re-exports this.
// 1.1 W7b: what 1.1 reads pages with — the states, the HTTP get, the HTML helpers, the dates, the fetch log of v1.0's rounds
// (read for the home numbers and the sources rows). v1.0's feed fetchers (rss / arXiv / Hacker News), its fetch round and the
// link added by hand left core/src with the scoring pipeline (core/legacy/fetch/).
export { FETCH_STATES, LOG_STATES, PAUSED_STATE, HINTS, hintOf, classifyHttp, classifyError, parseRetryAfter } from './states.mjs';
export { getText, checkUrl, USER_AGENT, DEFAULT_TIMEOUT_MS } from './http.mjs';
export { SITE_AUTH, siteOf, isContact, userAgentFor, fetchAs, MAX_HOPS } from './site-auth.mjs';
export { stripHtml, decodeEntities, truncateText, normalizeTitle, SUMMARY_MAX } from './html.mjs';
export { toIsoDate, localIsoDate, isRealDate, ageCutoff } from './dates.mjs';
export { appendFetchLog, readFetchLog, lastRoundStatus, fetchLogPath, FETCH_LOG_FILE } from './log.mjs';
export { sourceHealth } from './health.mjs';
