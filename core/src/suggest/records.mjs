// _pipeline/suggestions.jsonl: the suggestion cards of one library and what you did with them (v2 package D2).
// Append-only; nothing here touches streams.json, notes/ or any other file.
//
//   { at, ev: 'suggested', key, kind, subject, libraryId?, evidence, createdAt }
//   { at, ev: 'dismissed', key, reason }             你点了「不要」
//   { at, ev: 'accepted',  key, proposalId? }        你点了「要」(the main agent may turn it into a proposal card)
//
// A key is open from its `suggested` line until a `dismissed` / `accepted` line for it. A handled key can be suggested
// again later (a new `suggested` line opens it again), but only when its rule fires on evidence newer than the
// handling (rules.mjs), so a dismissal is not undone by the next round.
//
// replaySuggestions(libraryDir)                      -> Map<key, { status: 'open'|'dismissed'|'accepted', suggestion, handledAt, handled }>
// openSuggestions(libraryDir)                        -> [suggestion, ...]   oldest first
// recordSuggestions(libraryDir, list, { now? })      -> { written: [line, ...] }   only keys that are not open now
// dismissSuggestion(libraryDir, key, { reason?, now? }) -> line      throws not-open
// acceptSuggestion(libraryDir, key, { proposalId?, now? }) -> line   throws not-open
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';

export const SUGGESTIONS_FILE = '_pipeline/suggestions.jsonl';
export const SUGGESTION_KINDS = ['source-failing', 'no-output', 'ai-instruction', 'topic-overlap'];
export const SUGGESTION_EVENTS = ['suggested', 'dismissed', 'accepted'];

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
    if (!cur || cur.status !== 'open') continue; // a stray dismiss / accept for a key that is not open
    byKey.set(line.key, { status: line.ev, suggestion: cur.suggestion, handledAt: line.at ?? null, handled: line, handledSuggestion: cur.suggestion });
  }
  return byKey;
}

export function openSuggestions(libraryDir) {
  const out = [];
  for (const s of replaySuggestions(libraryDir).values()) if (s.status === 'open') out.push(s.suggestion);
  out.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  return out;
}

export function recordSuggestions(libraryDir, list, { now } = {}) {
  const at = clockOf(now).toISOString();
  const state = replaySuggestions(libraryDir);
  const seen = new Set();
  const lines = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!isPlainObject(s) || typeof s.key !== 'string' || s.key === '') continue;
    if (!SUGGESTION_KINDS.includes(s.kind) || typeof s.subject !== 'string') continue;
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    if (state.get(s.key)?.status === 'open') continue; // same key, not handled yet: never written twice
    lines.push({
      at,
      ev: 'suggested',
      key: s.key,
      kind: s.kind,
      subject: s.subject,
      ...(typeof s.libraryId === 'string' ? { libraryId: s.libraryId } : {}),
      evidence: isPlainObject(s.evidence) ? s.evidence : {},
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

export function acceptSuggestion(libraryDir, key, { proposalId, now } = {}) {
  return handle(libraryDir, key, 'accepted', typeof proposalId === 'string' && proposalId !== '' ? { proposalId } : {}, now);
}
