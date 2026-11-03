// "Type an API key": one HTTPS request per call, no SDK, no tools, one turn.
//
//   vendor anthropic  POST {baseUrl}/v1/messages
//                     headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
//                     body:    { model, max_tokens, system?, messages:[{ role:'user', content: prompt }] }
//                     answer:  content[].text joined; usage.input_tokens (+cache_*), usage.output_tokens
//   other vendors     POST {baseUrl}/chat/completions          (baseUrl already ends in /v1 or the vendor's prefix)
//                     headers: authorization: Bearer <key>, content-type: application/json
//                     body:    { model, messages:[{role:'system'}?, {role:'user'}] }
//                     answer:  choices[0].message.content; usage.prompt_tokens / completion_tokens
//
// The key comes from deps.getKey(keyRef) (the desktop's safeStorage) at call time, lives only in the
// request headers, and is scrubbed out of every detail / text that goes back to the caller.
//
// HTTP -> code: 401/403 bad-key · 404 bad-model · 429 rate-limited · 5xx network · 400 mentioning the model
// bad-model · fetch throws network · abort timeout.
import { VENDORS } from './models.mjs';
import { resolveModel, modelsFor } from './models.mjs';
import { finishText, probeFrom } from './command.mjs';
import { failure, scrub, clip, checkRequest, DEFAULT_TIMEOUT_MS } from './types.mjs';
import { StreamsError } from '../errors.mjs';

export const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_MAX_TOKENS = 16000;

export function vendorOf(connection) {
  const api = connection.api || {};
  const v = VENDORS[api.vendor];
  if (!v) throw new StreamsError('bad-connection', `unknown vendor "${api.vendor}"`);
  const baseUrl = (api.baseUrl || v.baseUrl || '').replace(/\/+$/, '');
  if (baseUrl === '') throw new StreamsError('bad-connection', `vendor "${api.vendor}" needs a baseUrl`);
  return { id: api.vendor, style: v.style, baseUrl };
}

// Pure: what would be sent. Exposed for tests and the README (the key is a placeholder here).
export function buildRequest(connection, { model, system, prompt, maxTokens = DEFAULT_MAX_TOKENS }, key) {
  const v = vendorOf(connection);
  if (v.style === 'anthropic') {
    const body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
    return {
      url: `${v.baseUrl}/v1/messages`,
      headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body,
    };
  }
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return {
    url: `${v.baseUrl}/chat/completions`,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: { model, messages },
  };
}

// `raw` must already be scrubbed by the caller: clipping before scrubbing can leave a key prefix at the cut.
function errorMessageOf(json, raw) {
  if (json && typeof json === 'object') {
    const e = json.error;
    if (e && typeof e === 'object') {
      return { message: typeof e.message === 'string' ? e.message : JSON.stringify(e), type: e.type, code: e.code };
    }
    if (typeof e === 'string') return { message: e };
    if (typeof json.message === 'string') return { message: json.message };
  }
  return { message: clip(raw, 300) };
}

export function codeFromHttp(status, err) {
  const msg = `${err.message || ''} ${err.type || ''} ${err.code || ''}`;
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 404) return 'bad-model';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'network';
  if (/model/i.test(msg) && /(not found|does not exist|not exist|invalid|unknown|unsupported|not_found)/i.test(msg)) return 'bad-model';
  if (/not_found_error|model_not_found/i.test(msg)) return 'bad-model';
  if (/authentication|invalid.*key|api key/i.test(msg)) return 'bad-key';
  if (/rate_limit|rate limit/i.test(msg)) return 'rate-limited';
  return 'unknown';
}

// Parse a 2xx body. Returns { text, usage, stop } (stop = 'refusal' when the model declined).
export function parseSuccess(style, json) {
  const n = (x) => (typeof x === 'number' ? x : 0);
  if (style === 'anthropic') {
    const blocks = Array.isArray(json.content) ? json.content : [];
    const text = blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
    const u = json.usage || {};
    const usage = { inputTokens: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), outputTokens: n(u.output_tokens) };
    return { text, usage, stop: json.stop_reason, model: json.model };
  }
  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const content = choice && choice.message ? choice.message.content : undefined;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('') : '';
  const u = json.usage || {};
  const usage = { inputTokens: n(u.prompt_tokens), outputTokens: n(u.completion_tokens) };
  const stop = choice && choice.finish_reason === 'content_filter' ? 'refusal' : choice ? choice.finish_reason : undefined;
  return { text, usage, stop, model: json.model };
}

export function createApiConnector(connection, deps = {}) {
  const kind = 'api';
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function readKey() {
    const ref = connection.api && connection.api.keyRef;
    if (typeof deps.getKey !== 'function') return undefined;
    const k = await deps.getKey(ref);
    return typeof k === 'string' && k.trim() !== '' ? k : undefined;
  }

  async function detect() {
    const v = vendorOf(connection);
    const key = await readKey();
    const out = { installed: true, loggedIn: Boolean(key), vendor: v.id };
    if (!key) { out.code = 'bad-key'; out.detail = 'no key stored for this connection'; }
    return out;
  }

  async function complete(req) {
    checkRequest(req);
    const model = resolveModel(connection, req.model);
    // nothing has left the machine yet on these three: usage.calls stays 0
    if (!model) return failure('bad-model', 'no model named for this connection', { model, calls: 0 });
    const key = await readKey();
    if (!key) return failure('bad-key', 'no key stored for this connection', { model, calls: 0 });
    const v = vendorOf(connection);
    const { url, headers, body } = buildRequest(connection, { model, system: req.system, prompt: req.prompt, maxTokens: req.maxTokens }, key);
    const secrets = [key];
    const safe = (s) => scrub(s, secrets); // always scrub first, clip later (failure() clips)
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    let raw;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
      raw = await res.text();
    } catch (e) {
      clearTimeout(timer);
      if (e && (e.name === 'AbortError' || ctl.signal.aborted)) return failure('timeout', `no answer within ${timeoutMs} ms`, { model });
      return failure('network', safe(`${e && e.code ? e.code + ': ' : ''}${e && e.message ? e.message : String(e)}`), { model });
    }
    clearTimeout(timer);
    raw = safe(raw);
    let json = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    if (!res.ok) {
      const err = errorMessageOf(json, raw);
      const code = codeFromHttp(res.status, err);
      return failure(code, `HTTP ${res.status}: ${err.message}`, { model });
    }
    if (!json || typeof json !== 'object') return failure('bad-format', `non-JSON body: ${clip(raw, 200)}`, { model });
    const parsed = parseSuccess(v.style, json);
    const usage = parsed.usage;
    if (parsed.stop === 'refusal') return { ok: false, code: 'refused', detail: 'the model declined', text: safe(parsed.text), usage: { calls: 1, ...usage }, model: parsed.model ?? model };
    return finishText({ text: parsed.text, usage, model: parsed.model ?? model, secrets });
  }

  // An API connection signs in with a key (settings page, safeStorage); there is no login to open.
  async function openLogin() {
    return { ok: false, code: 'not-applicable', detail: 'an API connection uses a key, not a login' };
  }

  return { kind, detect, probe: probeFrom(complete), complete, openLogin, models: () => modelsFor(kind, connection.api && connection.api.vendor), connection };
}
