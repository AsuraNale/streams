// The search service of an API connection (1.1.1 P5; 维护者 11-24 evening: 「甲」, DeepSeek's search API first). The model API
// has no search of its own here: its `search` tool (connect/api-tools.mjs) calls this.
//
// createDeepSeekSearch({ getKey, fetchImpl, baseUrl, timeoutMs, count }) -> { search(query) }
//   POST {baseUrl}/v1/tools/search   Authorization: Bearer <key>   body { query, count }
//   (api-docs.deepseek.com/api/search, read 2026-11-24: query 1–128 characters; count 1–50, default 10; the answer
//   { results: [{ title, url, snippet, summary, … }] }; $0.75 per 1000 successful requests)
//   search(query) -> { ok: true, results: [{ title, url, snippet }] } | { ok: false, code, detail }
//     code: 'bad-key' (no key, 401) · 'no-balance' (402) · 'rate-limited' (429) · 'network' (5xx, no answer) · 'timeout' ·
//           'bad-request' (other 4xx, a query that is empty or too long — not sent) · 'bad-format'
//   The key comes from getKey() at call time, lives only in the request header, and is scrubbed out of every detail.
//   It never throws.
import { scrub, clip } from './types.mjs';

export const DEEPSEEK_SEARCH_BASE = 'https://api.deepseek.com';
export const SEARCH_COUNT = 8;
export const QUERY_MAX = 128;

export function createDeepSeekSearch({ getKey, fetchImpl = globalThis.fetch, baseUrl = DEEPSEEK_SEARCH_BASE, timeoutMs = 30_000, count = SEARCH_COUNT } = {}) {
  async function search(query) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (q === '' || [...q].length > QUERY_MAX) return { ok: false, code: 'bad-request', detail: `a search query is 1 to ${QUERY_MAX} characters` };
    let key;
    try { key = typeof getKey === 'function' ? await getKey() : undefined; } catch { key = undefined; }
    if (typeof key !== 'string' || key.trim() === '') return { ok: false, code: 'bad-key', detail: 'no search key' };
    const safe = (s) => clip(scrub(s, [key]), 300);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    let raw;
    try {
      res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/tools/search`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, count }),
        signal: ctl.signal,
      });
      raw = await res.text();
    } catch (e) {
      clearTimeout(timer);
      if (e && (e.name === 'AbortError' || ctl.signal.aborted)) return { ok: false, code: 'timeout', detail: `no answer within ${timeoutMs} ms` };
      return { ok: false, code: 'network', detail: safe(e?.message ?? String(e)) };
    }
    clearTimeout(timer);
    let json = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    if (!res.ok) {
      const s = res.status;
      const code = s === 401 || s === 403 ? 'bad-key' : s === 402 ? 'no-balance' : s === 429 ? 'rate-limited' : s >= 500 || s === 408 ? 'network' : 'bad-request';
      const message = json && json.error && typeof json.error.message === 'string' ? json.error.message : raw;
      return { ok: false, code, detail: safe(`HTTP ${s}: ${message}`) };
    }
    if (!json || !Array.isArray(json.results)) return { ok: false, code: 'bad-format', detail: safe(`no results in the answer: ${raw}`) };
    const results = json.results
      .filter((r) => r && typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
      .map((r) => ({ title: typeof r.title === 'string' ? r.title : '', url: r.url, snippet: typeof r.snippet === 'string' && r.snippet ? r.snippet : typeof r.summary === 'string' ? clip(r.summary, 300) : '' }));
    return { ok: true, results };
  }
  return { search };
}

// Which key searches for an API connection (1.1.1 P5): a DeepSeek model's own key (nothing more to fill in); for another
// vendor, the search key filled in on 设置 (stored apart from the model's); neither: no search — null, and the model is given
// no search tool (api-tools.mjs) and told of none (build/format.mjs, update/format.mjs).
// searchFor(connection, { getKey, getSearchKey, fetchImpl, baseUrl }) -> Promise<{ search, from: 'model' | 'search-key' } | null>
//   getKey(keyRef)   the model's key (as createApiConnector reads it); getSearchKey()   the search key, or nothing
export async function searchFor(connection, { getKey, getSearchKey, fetchImpl, baseUrl } = {}) {
  if (connection?.kind !== 'api') return null;
  const has = (k) => typeof k === 'string' && k.trim() !== '';
  if (connection.api?.vendor === 'deepseek' && typeof getKey === 'function') {
    const k = await getKey(connection.api.keyRef);
    if (has(k)) return { from: 'model', ...createDeepSeekSearch({ getKey: () => getKey(connection.api.keyRef), fetchImpl, baseUrl }) };
  }
  if (typeof getSearchKey === 'function') {
    const k = await getSearchKey();
    if (has(k)) return { from: 'search-key', ...createDeepSeekSearch({ getKey: getSearchKey, fetchImpl, baseUrl }) };
  }
  return null;
}
