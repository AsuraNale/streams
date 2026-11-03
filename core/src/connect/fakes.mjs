// fakeConnector({ mode, json, delayMs, model }) — the same interface as a real connector, no process, no network.
//
//   'fixed'              every complete() returns `json`
//   'bad-format-once'    first complete() is bad-format (text 'not json'), later ones return `json`
//   'bad-format-always'  every complete() is bad-format
//   'login-expired'      probe() and complete() both fail with 'login-expired'; detect() says loggedIn:false
//   'counting'           like 'fixed', and the pipeline reads `connector.calls` ([{ prompt, system, model, format, at }])
//   'slow'               like 'fixed' after `delayMs`
// Every mode records calls; 'counting' is the mode whose contract is that record (V10 per-round caps).
import { checkRequest, PROBE_PROMPT } from './types.mjs';
import { resolveModel } from './models.mjs';
import { StreamsError } from '../errors.mjs';

export const FAKE_MODES = ['fixed', 'bad-format-once', 'bad-format-always', 'login-expired', 'counting', 'slow'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fakeConnector({ mode = 'fixed', json = { ok: true }, delayMs = 0, model = 'fake-model', kind = 'fake', badText = 'Sure! Here is my answer: not json at all', usage = {} } = {}) {
  if (!FAKE_MODES.includes(mode)) throw new StreamsError('bad-fake-mode', `unknown fake mode "${mode}"`);
  const calls = [];
  const connection = { kind: 'api', model, api: { vendor: 'custom', baseUrl: 'http://fake', keyRef: 'fake' } };

  function record(req) {
    calls.push({ prompt: req.prompt, system: req.system, model: req.model ?? 'main', format: req.format ?? 'json', at: new Date().toISOString() });
  }

  async function complete(req) {
    checkRequest(req);
    record(req);
    const n = calls.length;
    const resolved = typeof req.model === 'string' && req.model !== 'main' && req.model !== 'verify' ? req.model : model;
    if (mode === 'slow' && delayMs > 0) await sleep(delayMs);
    if (mode === 'login-expired') return { ok: false, code: 'login-expired', detail: 'fake: session expired', usage: { calls: 1 }, model: resolved };
    const bad = mode === 'bad-format-always' || (mode === 'bad-format-once' && n === 1);
    if (bad) return { ok: false, code: 'bad-format', detail: 'output is not JSON (no-json)', text: badText, usage: { calls: 1, ...usage }, model: resolved };
    const value = typeof json === 'function' ? json(req, n) : json;
    return { ok: true, json: structuredClone(value), text: JSON.stringify(value), usage: { calls: 1, ...usage }, model: resolved };
  }

  async function probe() {
    const t0 = Date.now();
    const r = await complete({ prompt: PROBE_PROMPT, format: 'json' });
    const latencyMs = Date.now() - t0;
    return r.ok ? { ok: true, latencyMs, model: r.model, usage: r.usage } : { ok: false, latencyMs, code: r.code, detail: r.detail, usage: r.usage };
  }

  async function detect() {
    if (mode === 'login-expired') return { installed: true, loggedIn: false, code: 'login-expired', version: 'fake' };
    return { installed: true, loggedIn: true, version: 'fake' };
  }

  return {
    kind,
    mode,
    calls,
    connection,
    detect,
    probe,
    complete,
    openLogin: async () => ({ ok: true, pid: 0, command: ['fake', 'login'] }),
    models: () => [{ id: model, label: model, recommended: true }],
    resolveModel: (slot) => resolveModel(connection, slot),
    reset: () => { calls.length = 0; },
  };
}
