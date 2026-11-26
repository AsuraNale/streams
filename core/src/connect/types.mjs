// Shared vocabulary of the connection layer (product spec 4.6).
//
// The three connection kinds are one interface to the rest of the core:
//   complete({ system?, prompt, format: 'json', model? }) -> { ok, json, text, usage, model } | { ok: false, code, detail, usage }
// Error codes are internal identifiers; the desktop layer translates them. No user-facing
// sentences live here.
import { StreamsError } from '../errors.mjs';

export const CONNECTION_KINDS = ['claude-code', 'codex', 'api'];

export const ERROR_CODES = [
  'not-installed',
  'not-logged-in',
  'login-expired',
  'bad-key',
  'bad-model',
  'rate-limited',
  'network',
  'timeout',
  'bad-format',
  'refused',
  'unknown',
  'not-applicable', // the operation has no meaning for this kind (an API connection has no login to open)
  'stopped', // 1.1.3 (停止处理): the user stopped the call (a session call with a signal)
];

export const MODEL_SLOTS = ['main', 'verify'];

export const OUTPUT_FORMATS = ['json'];

// The one prompt probe() sends. Fixed so a probe never carries library content.
export const PROBE_PROMPT = 'Reply with exactly this JSON and nothing else: {"ok":true}';

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DETECT_TIMEOUT_MS = 15_000;
export const DETAIL_MAX_CHARS = 600;

export function assertCode(code) {
  if (!ERROR_CODES.includes(code)) throw new StreamsError('bad-error-code', `unknown error code "${code}"`);
  return code;
}

// Every failure result has the same shape. usage.calls is 1 when a model call was actually made,
// 0 when the failure happened before any request left (no executable, no key, no model) — V10 counts calls.
export function failure(code, detail, extra = {}) {
  assertCode(code);
  const { calls = 1, ...rest } = extra;
  return { ok: false, code, detail: clip(detail), usage: { calls }, ...rest };
}

export function clip(text, max = DETAIL_MAX_CHARS) {
  if (text === undefined || text === null) return '';
  const s = String(text);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Replace every occurrence of a secret inside free text. Used on every detail / text that
// could echo a request back (an API that quotes the key in its error body, a stack trace).
// Short secrets (< 4 chars) are not scrubbed: they would match everything.
export function scrub(text, secrets) {
  if (text === undefined || text === null) return '';
  let s = String(text);
  const list = Array.isArray(secrets) ? secrets : [secrets];
  for (const secret of list) {
    if (typeof secret !== 'string' || secret.length < 4) continue;
    s = s.split(secret).join('<key>');
  }
  return s;
}

export function checkRequest(req) {
  if (!req || typeof req !== 'object') throw new StreamsError('bad-request', 'request must be an object');
  if (typeof req.prompt !== 'string' || req.prompt === '') throw new StreamsError('bad-request', 'request is missing "prompt"');
  if (req.format !== undefined && !OUTPUT_FORMATS.includes(req.format)) {
    throw new StreamsError('bad-request', `unsupported output format "${req.format}"`);
  }
  if (req.system !== undefined && typeof req.system !== 'string') throw new StreamsError('bad-request', '"system" must be a string');
  if (req.model !== undefined && (typeof req.model !== 'string' || req.model === '')) {
    throw new StreamsError('bad-request', '"model" must be a non-empty string');
  }
}
