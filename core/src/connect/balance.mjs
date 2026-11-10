// v2 package M (contract M3; docs/core-api.md 5.17): the API balance of an API connection, for the vendors whose official docs
// give a balance endpoint (quota.mjs BALANCE_ENDPOINTS: deepseek, moonshot). One GET, no model call, nothing spent.
//
// readApiBalance(connection, deps) -> { ok: true, quota } | { ok: false, code, detail }
//   code 'not-applicable'   the vendor has no balance endpoint (anthropic, openai, zhipu, gemini, custom): the corner shows nothing
//        'bad-key'          no key stored, or the vendor said 401 / 403
//        'network' | 'timeout' | 'bad-format' | 'rate-limited' | 'unknown'
//   deps = { getKey(keyRef), fetchImpl?, timeoutMs?, now? } — the key as the API connector takes it (the desktop's safeStorage),
//   only in the request's header, scrubbed out of every detail; never logged here.
import { vendorOf } from './api.mjs';
import { BALANCE_ENDPOINTS, hasBalanceEndpoint } from './quota.mjs';
import { scrub, clip } from './types.mjs';

export const BALANCE_TIMEOUT_MS = 10_000;

export async function readApiBalance(connection, deps = {}) {
  const vendor = connection?.api?.vendor;
  if (connection?.kind !== 'api' || !hasBalanceEndpoint(vendor)) return { ok: false, code: 'not-applicable', detail: `no balance endpoint for ${String(vendor)}` };
  const v = vendorOf(connection);
  const ep = BALANCE_ENDPOINTS[vendor];
  const url = ep.url(v.baseUrl);
  if (!url) return { ok: false, code: 'bad-format', detail: 'no address for the balance endpoint' };
  const k = typeof deps.getKey === 'function' ? await deps.getKey(connection.api.keyRef) : undefined;
  const key = typeof k === 'string' && k.trim() !== '' ? k : null;
  if (!key) return { ok: false, code: 'bad-key', detail: 'no key stored for this connection' };
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? BALANCE_TIMEOUT_MS;
  const safe = (s) => clip(scrub(s, [key]), 200);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  let raw;
  try {
    res = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: ctl.signal });
    raw = await res.text();
  } catch (e) {
    if (e && (e.name === 'AbortError' || ctl.signal.aborted)) return { ok: false, code: 'timeout', detail: `no answer within ${timeoutMs} ms` };
    return { ok: false, code: 'network', detail: safe(`${e?.code ? `${e.code}: ` : ''}${e?.message ?? String(e)}`) };
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'bad-key', detail: `HTTP ${res.status}` };
  if (res.status === 429) return { ok: false, code: 'rate-limited', detail: 'HTTP 429' };
  if (!res.ok) return { ok: false, code: res.status >= 500 ? 'network' : 'unknown', detail: `HTTP ${res.status}: ${safe(raw)}` };
  let json = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  const parsed = ep.parse(json);
  if (!parsed) return { ok: false, code: 'bad-format', detail: `not the documented answer: ${safe(raw)}` };
  return { ok: true, quota: { source: 'api', at: (deps.now ? deps.now() : new Date()).toISOString(), vendor, ...parsed } };
}
