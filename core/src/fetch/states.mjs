// The five fetch states and the two classifiers that produce them.
//
//   ok       parsed fine, >= 1 item                     hint: none
//   empty    HTTP 200, parsed fine, 0 (new) items        hint: none
//   gap      the address is the problem: 404 / 410 / other 4xx / 3xx not followed /
//            not XML / not a feed / HN 400 / unknown kind / bad URL
//                                                        hint: fix-address-or-remove
//   failed   transient: 429 / 408 / 5xx / timeout / DNS / connection errors
//                                                        hint: retry-next-round
//   blocked  refused: 403 / 451 / 407, or a proxy refusing the connection
//                                                        hint: blocked-remove-source
//
// "No new content" (empty) and "did not fetch" (gap / failed / blocked) are never merged.
// classifyHttp(status, headers, { now }) -> { state, http, message, retryAfterSeconds? }
// classifyError(err)                     -> { state, message }
// hintOf(state)                          -> hint code (throws on an unknown state)
import { StreamsError } from '../errors.mjs';

export const FETCH_STATES = ['ok', 'empty', 'gap', 'failed', 'blocked'];
// A paused source is logged too, with this sixth value; it is not one of the five fetch states.
export const PAUSED_STATE = 'paused';
export const LOG_STATES = [...FETCH_STATES, PAUSED_STATE];

export const HINTS = {
  ok: 'none',
  empty: 'none',
  gap: 'fix-address-or-remove',
  failed: 'retry-next-round',
  blocked: 'blocked-remove-source',
  paused: 'none',
};

export function hintOf(state) {
  if (!Object.hasOwn(HINTS, state)) throw new StreamsError('bad-state', `unknown fetch state "${state}"`);
  return HINTS[state];
}

export const BLOCKED_HTTP = [403, 407, 451];
export const FAILED_HTTP_4XX = [408, 429];

export function classifyHttp(status, headers = {}, { now } = {}) {
  const s = Number(status);
  if (!Number.isInteger(s) || s < 100 || s > 599) throw new StreamsError('bad-status', `not an HTTP status: ${String(status)}`);
  const h = lowerHeaders(headers);
  const retryAfterSeconds = parseRetryAfter(h['retry-after'], now);
  const out = (state, message) => (retryAfterSeconds === undefined
    ? { state, http: s, message }
    : { state, http: s, message: `${message} (Retry-After: ${retryAfterSeconds}s)`, retryAfterSeconds });
  if (s >= 200 && s < 300) return out('ok', `HTTP ${s}`);
  if (BLOCKED_HTTP.includes(s)) return out('blocked', `HTTP ${s}: refused`);
  if (FAILED_HTTP_4XX.includes(s)) return out('failed', `HTTP ${s}: slow down, retry next round`);
  if (s >= 500) return out('failed', `HTTP ${s}: server-side, retry next round`);
  if (s >= 400) return out('gap', `HTTP ${s}: check the address`);
  if (s >= 300) return out('gap', `HTTP ${s}: redirect not followed`);
  return out('failed', `HTTP ${s}: unexpected informational response`);
}

function lowerHeaders(headers) {
  const out = {};
  if (headers && typeof headers.forEach === 'function' && !Array.isArray(headers)) {
    headers.forEach((v, k) => { out[String(k).toLowerCase()] = v; });
    return out;
  }
  for (const [k, v] of Object.entries(headers ?? {})) out[k.toLowerCase()] = v;
  return out;
}

// Retry-After is either delta-seconds or an HTTP-date. Unparseable -> undefined (not 0).
export function parseRetryAfter(value, now) {
  if (value === undefined || value === null) return undefined;
  const v = String(Array.isArray(value) ? value[0] : value).trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (!/[A-Za-z]/.test(v)) return undefined; // an HTTP-date always carries a month name; "-5" is neither form
  const at = Date.parse(v);
  if (!Number.isFinite(at)) return undefined;
  const nowMs = typeof now === 'function' ? toMs(now()) : Date.now();
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

function toMs(v) {
  return v instanceof Date ? v.getTime() : Number(v);
}

// Policy refusals that surface below HTTP (a proxy refusing the CONNECT, a firewall forbidding the
// socket). Same list as the toolkit's fetch_rss.py plus the Node spellings.
export const BLOCK_SIGNATURES = [
  'tunnel connection failed',
  'host_not_allowed',
  'proxy authentication',
  'forbidden by proxy',
  'blocked by policy',
  'winerror 10013',
  'forbidden by its access permissions',
];

const GAP_CODES = ['bad-url', 'ERR_INVALID_URL', 'ERR_UNSUPPORTED_PROTOCOL'];

export function classifyError(err) {
  const chain = unwrap(err);
  const codes = chain.map((e) => String(e?.code ?? '')).filter(Boolean);
  const messages = chain.map((e) => String(e?.message ?? e ?? '')).filter(Boolean);
  const names = chain.map((e) => String(e?.name ?? '')).filter(Boolean);
  const text = [...messages, ...codes].join(' | ').toLowerCase();
  const summary = describe(chain);
  if (BLOCK_SIGNATURES.some((sig) => text.includes(sig))) return { state: 'blocked', message: `refused below HTTP: ${summary}` };
  // WHATWG fetch turns a 407 Proxy Authentication Required into a bare network error: TypeError
  // "fetch failed" whose cause is an Error with no message and no code. Nothing else undici throws
  // looks like that (connection errors all carry a code), so this shape is read as a refusal.
  if (chain.length >= 2 && messages[0] === 'fetch failed' && chain[1] instanceof Error && !chain[1].message && !chain[1].code) {
    return { state: 'blocked', message: 'refused below HTTP: fetch reported a bare network error (how a 407 Proxy Authentication Required surfaces)' };
  }
  // libuv reports WSAEACCES (a firewall forbidding the socket) as EACCES on connect. A plain
  // "permission denied" with no socket in sight is NOT a block (no over-matching).
  if (codes.includes('EACCES') && /connect/i.test(text)) return { state: 'blocked', message: `refused below HTTP: ${summary}` };
  if (codes.some((c) => GAP_CODES.includes(c)) || /invalid url|unsupported protocol|failed to parse url/.test(text)) {
    return { state: 'gap', message: `bad address: ${summary}` };
  }
  if (names.includes('TimeoutError') || names.includes('AbortError') || codes.some((c) => /TIMEOUT|TIMEDOUT/i.test(c))) {
    return { state: 'failed', message: `timeout: ${summary}` };
  }
  return { state: 'failed', message: `network: ${summary}` };
}

function unwrap(err) {
  const out = [];
  let cur = err;
  for (let i = 0; i < 8 && cur !== undefined && cur !== null; i += 1) {
    out.push(cur);
    cur = typeof cur === 'object' ? cur.cause : undefined;
  }
  return out;
}

function describe(chain) {
  const parts = chain.map((e) => {
    if (e && typeof e === 'object') {
      const code = e.code ? ` [${e.code}]` : '';
      return `${e.name ?? 'Error'}${code}: ${e.message ?? ''}`;
    }
    return String(e);
  });
  return parts.join(' <- ').slice(0, 200);
}
