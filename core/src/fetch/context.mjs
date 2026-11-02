// The fetch context: everything a fetcher touches that is not pure (network, clock, sleep) plus the
// base addresses, so tests can point everything at a local fake server and a fake clock.
//
// makeContext(overrides) -> ctx
//   fetchImpl       globalThis.fetch
//   timeoutMs       20000
//   userAgent       'Streams/1.0 (+https://github.com/AsuraNale/streams)'
//   now             () => Date
//   sleep           (ms) => Promise
//   lastArxivAt     ms epoch of the last arXiv request, or null (mutated by fetchArxiv)
//   arxivMinGapMs   3000   arXiv asks for >= 3 s between requests
//   arxivBase       'https://export.arxiv.org/api/query'
//   hnBase          'https://hn.algolia.com/api/v1/search'
//   maxResults      10     default per-source cap (source.max_results overrides)
import { DEFAULT_TIMEOUT_MS, USER_AGENT } from './http.mjs';

export const ARXIV_BASE = 'https://export.arxiv.org/api/query';
export const HN_BASE = 'https://hn.algolia.com/api/v1/search';
export const ARXIV_MIN_GAP_MS = 3000;
export const DEFAULT_MAX_RESULTS = 10;

const CONTEXT_MARK = Symbol.for('streams.fetch.context');

export function makeContext(overrides = {}) {
  if (overrides && overrides[CONTEXT_MARK]) return overrides;
  const ctx = {
    fetchImpl: globalThis.fetch,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    userAgent: USER_AGENT,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    lastArxivAt: null,
    arxivMinGapMs: ARXIV_MIN_GAP_MS,
    arxivBase: ARXIV_BASE,
    hnBase: HN_BASE,
    maxResults: DEFAULT_MAX_RESULTS,
    ...(overrides ?? {}),
  };
  Object.defineProperty(ctx, CONTEXT_MARK, { value: true, enumerable: false });
  return ctx;
}

export function isContext(ctx) {
  return Boolean(ctx && ctx[CONTEXT_MARK]);
}
