// _pipeline/suggestions.jsonl: the suggestion cards of one library and what you did with them (v2 package D2).
// Append-only; nothing here touches streams.json, notes/ or any other file.
//
//   { at, ev: 'suggested', key, kind, subject, libraryId?, evidence, basis?, createdAt }
//   { at, ev: 'dismissed', key, reason }             你点了「忽略」 (was 「不要」)
//   { at, ev: 'accepted',  key, action?, proposalId? }  已转交主 Agent: 「交由主 Agent 分析」 (action 'forward'), 「生成修改提议」
//                                                    ('draft-proposal'); a line of before R5a has no action (「要」)
//   { at, ev: 'acted',     key, action, level? }      redesign R5a: 已执行 — Streams' own code did the action of the card
//                                                    (action 'pause-source' · 'set-strictness' with the level it set)
//   { at, ev: 'expired',   key, reason }              redesign R5a: 已失效 — the card no longer fits the library (act.mjs
//                                                    staleReason: source-removed · source-paused · source-changed ·
//                                                    strictness-changed · library-removed · overlap-gone · brief-changed ·
//                                                    state-changed: rule ① found the other case, precheck fix 7)
//
// `basis` (redesign R5a, written by recordSuggestions from the library as it is when the card is made): what the card was
// made against — { source: { url, query } } (source-failing, ai-instruction), { thresholds } (no-output), { brief }
// (dismiss-reason) — so act.mjs can tell when it no longer fits.
//
// A key is open from its `suggested` line until a dismissed / accepted / acted / expired line for it. A handled key can be
// suggested again later (a new `suggested` line opens it again), but only when its rule fires on evidence newer than the
// handling (rules.mjs), so a dismissal is not undone by the next run.
//
// replaySuggestions(libraryDir)                      -> Map<key, { status: 'open'|'dismissed'|'accepted'|'acted'|'expired', suggestion, handledAt, handled }>
// openSuggestions(libraryDir)                        -> [suggestion, ...]   oldest first
// handledSuggestions(libraryDir)                     -> [{ key, status, suggestion, handled }]   redesign R5a: each key's last handling
// recordSuggestions(libraryDir, list, { now? })      -> { written: [line, ...] }   only keys that are not open now
// dismissSuggestion(libraryDir, key, { reason?, now? }) -> line      throws not-open
// acceptSuggestion(libraryDir, key, { action?, proposalId?, now? }) -> line   throws not-open
// actedSuggestion(libraryDir, key, { action, level?, now? }) -> line  throws not-open (redesign R5a)
// expireSuggestion(libraryDir, key, { reason, now? }) -> line      throws not-open (redesign R5a)
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { pipelineFrom } from '../pipeline/config.mjs';
import { thresholdsOf } from '../proposals/changes.mjs';

export const SUGGESTIONS_FILE = '_pipeline/suggestions.jsonl';
export const SUGGESTION_KINDS = ['source-failing', 'no-output', 'ai-instruction', 'topic-overlap', 'dismiss-reason'];
export const SUGGESTION_EVENTS = ['suggested', 'dismissed', 'accepted', 'acted', 'expired'];
// redesign R5a: what a card that is not open any more came to (the status of each)
export const SUGGESTION_STATUSES = ['open', 'dismissed', 'accepted', 'acted', 'expired'];
// precheck fix 7: an expiry that is no handling of the user's — the card gave way to the one that fits now; the rule counts on
// from the handling before it (handledAt stays)
export const REPLACED_REASONS = Object.freeze(['state-changed']);

export function suggestionsPath(libraryDir) {
  return join(libraryDir, SUGGESTIONS_FILE);
}

export function suggestionKey(kind, subject) {
  return `${kind}:${subject}`;
}

export function clockOf(now) {
  if (typeof now === 'function') return now();
  if (now instanceof Date) return now;
  return new Date();
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function endsWithoutNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const fd = openSync(path, 'r');
  try {
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

function appendLines(libraryDir, lines) {
  if (lines.length === 0) return;
  mkdirSync(join(libraryDir, '_pipeline'), { recursive: true });
  const path = suggestionsPath(libraryDir);
  const prefix = endsWithoutNewline(path) ? '\n' : '';
  appendFileSync(path, prefix + lines.map((l) => JSON.stringify(l) + '\n').join(''), { encoding: 'utf8', flag: 'a' });
}

export function readSuggestionLines(libraryDir) {
  const path = suggestionsPath(libraryDir);
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let v;
    try {
      v = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isPlainObject(v) || typeof v.key !== 'string' || v.key === '' || !SUGGESTION_EVENTS.includes(v.ev)) continue;
    out.push(v);
  }
  return out;
}

function cardOf(line) {
  const out = { key: line.key, kind: line.kind, subject: line.subject };
  if (typeof line.libraryId === 'string') out.libraryId = line.libraryId;
  out.evidence = line.evidence ?? {};
  if (isPlainObject(line.basis)) out.basis = line.basis;
  out.createdAt = line.createdAt ?? line.at;
  return out;
}

export function replaySuggestions(libraryDir) {
  const byKey = new Map();
  for (const line of readSuggestionLines(libraryDir)) {
    const cur = byKey.get(line.key);
    if (line.ev === 'suggested') {
      if (cur && cur.status === 'open') continue; // already open: a second line changes nothing
      byKey.set(line.key, { status: 'open', suggestion: cardOf(line), handledAt: cur?.handledAt ?? null, handled: cur?.handled ?? null, handledSuggestion: cur?.handledSuggestion ?? null });
      continue;
    }
    if (!cur || cur.status !== 'open') continue; // a stray handling for a key that is not open
    const replaced = line.ev === 'expired' && REPLACED_REASONS.includes(line.reason);
    byKey.set(line.key, { status: line.ev, suggestion: cur.suggestion, handledAt: replaced ? cur.handledAt ?? null : line.at ?? null, handled: line, handledSuggestion: replaced ? cur.handledSuggestion ?? null : cur.suggestion });
  }
  return byKey;
}

export function openSuggestions(libraryDir) {
  const out = [];
  for (const s of replaySuggestions(libraryDir).values()) if (s.status === 'open') out.push(s.suggestion);
  out.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  return out;
}

export function handledSuggestions(libraryDir) {
  const out = [];
  for (const [key, s] of replaySuggestions(libraryDir)) if (s.status !== 'open') out.push({ key, status: s.status, suggestion: s.suggestion, handled: s.handled });
  out.sort((a, b) => String(b.handled?.at ?? '').localeCompare(String(a.handled?.at ?? '')));
  return out;
}

// redesign R5a: what a card is made against, read from the library now (its basis)
function basisOf(config, s) {
  if (!config) return undefined;
  if (s.kind === 'source-failing' || s.kind === 'ai-instruction') {
    const src = (Array.isArray(config.sources) ? config.sources : []).find((x) => isPlainObject(x) && x.name === s.subject);
    return src ? { source: { url: src.url ?? null, query: src.query ?? null } } : undefined;
  }
  if (s.kind === 'no-output') return { thresholds: thresholdsOf(pipelineFrom(config)) };
  if (s.kind === 'dismiss-reason') return { brief: typeof config.brief === 'string' && config.brief.trim() !== '' ? config.brief.trim() : null };
  return undefined;
}

export function recordSuggestions(libraryDir, list, { now } = {}) {
  const at = clockOf(now).toISOString();
  const state = replaySuggestions(libraryDir);
  const seen = new Set();
  const lines = [];
  let config = null;
  try { const r = readConfig(libraryDir); config = r.ok ? r.config : null; } catch { config = null; }
  for (const s of Array.isArray(list) ? list : []) {
    if (!isPlainObject(s) || typeof s.key !== 'string' || s.key === '') continue;
    if (!SUGGESTION_KINDS.includes(s.kind) || typeof s.subject !== 'string') continue;
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    if (state.get(s.key)?.status === 'open') continue; // same key, not handled yet: never written twice
    const basis = basisOf(config, s);
    lines.push({
      at,
      ev: 'suggested',
      key: s.key,
      kind: s.kind,
      subject: s.subject,
      ...(typeof s.libraryId === 'string' ? { libraryId: s.libraryId } : {}),
      evidence: isPlainObject(s.evidence) ? s.evidence : {},
      ...(basis ? { basis } : {}),
      createdAt: typeof s.createdAt === 'string' && s.createdAt !== '' ? s.createdAt : at,
    });
  }
  appendLines(libraryDir, lines);
  return { written: lines };
}

function handle(libraryDir, key, ev, extra, now) {
  if (typeof key !== 'string' || key === '') throw new StreamsError('bad-argument', 'a suggestion key is required');
  if (replaySuggestions(libraryDir).get(key)?.status !== 'open') throw new StreamsError('not-open', `suggestion "${key}" is not open`);
  const line = { at: clockOf(now).toISOString(), ev, key, ...extra };
  appendLines(libraryDir, [line]);
  return line;
}

export function dismissSuggestion(libraryDir, key, { reason, now } = {}) {
  return handle(libraryDir, key, 'dismissed', { reason: typeof reason === 'string' ? reason.trim() : '' }, now);
}

export function acceptSuggestion(libraryDir, key, { action, proposalId, now } = {}) {
  return handle(libraryDir, key, 'accepted', {
    ...(typeof action === 'string' && action !== '' ? { action } : {}),
    ...(typeof proposalId === 'string' && proposalId !== '' ? { proposalId } : {}),
  }, now);
}

export function actedSuggestion(libraryDir, key, { action, level, now } = {}) {
  if (typeof action !== 'string' || action === '') throw new StreamsError('bad-argument', 'an action is required');
  return handle(libraryDir, key, 'acted', { action, ...(typeof level === 'string' ? { level } : {}) }, now);
}

export function expireSuggestion(libraryDir, key, { reason, now } = {}) {
  return handle(libraryDir, key, 'expired', { reason: typeof reason === 'string' && reason !== '' ? reason : 'changed' }, now);
}
