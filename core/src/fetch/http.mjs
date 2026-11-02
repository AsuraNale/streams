// One polite GET. Never throws: the caller classifies the outcome.
//
// getText(url, { fetchImpl, timeoutMs, userAgent })
//   -> { ok: true, status, headers: { lower-case name: value }, text }   a response arrived (any status)
//   -> { ok: false, error }                                              no response (bad URL, timeout, network)
//
// Politeness: our own User-Agent on every request; no retries here; one request per call.
import { StreamsError } from '../errors.mjs';

export const USER_AGENT = 'Streams/1.0 (+https://github.com/AsuraNale/streams)';
export const DEFAULT_TIMEOUT_MS = 20_000;
export const ACCEPT = 'application/atom+xml, application/rss+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.5';

// http(s) only. Anything else is a configuration problem, not a network one.
export function checkUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') throw new StreamsError('bad-url', 'url is empty');
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new StreamsError('bad-url', `not a URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new StreamsError('bad-url', `only http(s) is fetched, got ${parsed.protocol}`);
  }
  return parsed;
}

export async function getText(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, userAgent = USER_AGENT } = {}) {
  let parsed;
  try {
    parsed = checkUrl(url);
  } catch (error) {
    return { ok: false, error };
  }
  try {
    const res = await fetchImpl(parsed.href, {
      method: 'GET',
      headers: { 'user-agent': userAgent, accept: ACCEPT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const text = await res.text();
    return { ok: true, status: res.status, headers, text };
  } catch (error) {
    return { ok: false, error };
  }
}
