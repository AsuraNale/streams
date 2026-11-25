// The user's decision on an inbox item (product spec 4.5 step 8; core-api 4.2).
//
// keep(libraryDir, url, { topics?, now? })   -> { id, file }
//   the ONLY caller of writeNoteFile(…, { by: 'keep' }); then the ledger `kept`, the inbox file removed,
//   the index rebuilt. Throws not-in-inbox / id-conflict (an existing note is never overwritten) / invalid-note.
//   1.1 W8 (B1): the note's last line is 「**原文：**」 with a Markdown link to the saved original, by a path relative to the
//   note (../_originals/<originalId(url)>.md — the originals stay outside the note folder; Obsidian opens the link), or the words
//   「原文没存下来」 when the library has no original of it. A Markdown link, not a [[link]]: the graph does not count it.
// dismiss(libraryDir, url, reason?, { quick?, now? }) -> { url }   throws not-in-inbox / bad-argument
//   redesign R2 (N03): the reason is optional — none given (undefined / null / '' / blanks) → the `dismissed` event has no
//   reason field (no placeholder is made up); `quick` (DISMISS_QUICK: the 快选 the page offers) is stored beside the words
//   as `quick`. The event stays terminal: kept / dismissed never change again (ledger.mjs).
// later(libraryDir, url, { now? })           -> { url, stage, at? }   redesign R2 (F27): an item at stage inbox is marked
//   稍后处理 in _pipeline/later.json (later.mjs; never the note folder, never the ledger); any other stage: nothing written
// recentDismissReasons(libraryDir, n = 10)   -> [{ ts, reason, quick?, title, url }] newest first; a dismissal without a
//   reason is skipped (redesign R2)
// (1.1 W7b: v1.0's moveToInbox / listRejected / listManualWaiting, about items its scoring steps had not passed, left core/src
// with them: core/legacy/pipeline/decide.mjs.)
// roundOutcome(libraryDir, roundId)          -> { inbox, kept, dismissed, later, waiting }   what became of the items that
//   run put into the inbox (处理情况 of 上次运行); null roundId → all zero
// The precondition is always read from the ledger (replayLedger), never from the caller's memory: keep and dismiss take an
// item at stage inbox only (not-in-inbox), whatever else the ledger says of it.
import { createHash } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { appendEvent, replayLedger, ledgerPath } from '../library/ledger.mjs';
import { writeNoteFile } from '../library/write-note.mjs';
import { rebuildIndex } from '../library/index.mjs';
import { readConfig, FALLBACK_TOPIC } from '../library/config.mjs';
import { localIsoDate } from '../fetch/dates.mjs';
import { languageOfConfig } from '../library/language.mjs';
import { readInboxItem, removeInboxItem } from './inbox.mjs';
import { parseDue } from './due.mjs';
import { markLater, readLater } from './later.mjs';
import { readOriginal, originalId, ORIGINALS_DIR } from '../read/original.mjs';
import { existsSync, readFileSync } from 'node:fs';

export const SLUG_MAX = 60;
export { FALLBACK_TOPIC }; // redesign R6d-4: the constant itself is in library/config.mjs (validateNote reads it too)
const WHAT_LABEL = { 'zh-CN': '**这是什么：**', en: '**What it is:** ' };
const ORIGINAL_LINE = Object.freeze({
  'zh-CN': { label: '**原文：**', link: '存下的原文', missing: '原文没存下来' },
  en: { label: '**Original:** ', link: 'the saved original', missing: 'the original was not saved' },
});

export function slugOf(title, url) {
  const s = String(title ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const cut = Array.from(s).slice(0, SLUG_MAX).join('').replace(/-+$/g, '');
  return cut !== '' ? cut : createHash('sha1').update(String(url)).digest('hex').slice(0, 8);
}

function stateOf(libraryDir, url) {
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-argument', 'url is required');
  return replayLedger(libraryDir).states.get(url) ?? null;
}

function requireInbox(libraryDir, url) {
  const s = stateOf(libraryDir, url);
  if (!s || s.stage !== 'inbox') throw new StreamsError('not-in-inbox', `${url} is not in the inbox (stage: ${s?.stage ?? 'unknown'})`);
  return s;
}

function loadConfig(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  return r.config;
}

function topicsFor(config, item, state, given) {
  if (Array.isArray(given) && given.length > 0) return given.map(String);
  const name = item?.source ?? state.source;
  const src = (config.sources ?? []).find((s) => s && s.name === name);
  if (src && typeof src.topic === 'string' && src.topic.trim() !== '') return [src.topic.trim()];
  if (typeof item?.topic === 'string' && item.topic !== '') return [item.topic];
  return [FALLBACK_TOPIC[languageOfConfig(config)] ?? FALLBACK_TOPIC['zh-CN']];
}

function scoresFor(state) {
  const out = {};
  for (const [k, v] of Object.entries(state.scores ?? {})) {
    out[k] = typeof v.score === 'number' ? { score: v.score, reason: v.reason ?? '' } : { value: v.value, reason: v.reason ?? '' };
  }
  return out;
}

// 1.1 W8: the note's line to its original (see the head of this file)
export function originalLine(libraryDir, url, language) {
  const L = ORIGINAL_LINE[language] ?? ORIGINAL_LINE['zh-CN'];
  const id = originalId(url);
  return readOriginal(libraryDir, id) ? `${L.label}[${L.link}](../${ORIGINALS_DIR}/${id}.md)` : `${L.label}${L.missing}`;
}

function bodyFor(item, language, original) {
  const summary = item?.summary ?? {};
  // an item kept from a round without a connection has no model sentence: the feed's own excerpt stands in
  const what = summary.what || (item?.scoreless || item?.moved === 'rejected' ? item.excerpt ?? '' : '');
  const lines = [`${WHAT_LABEL[language] ?? WHAT_LABEL['zh-CN']}${what}`];
  for (const p of Array.isArray(summary.points) ? summary.points : []) lines.push(`- ${p}`);
  lines.push('', original);
  return lines.join('\n') + '\n';
}

// redesign R6d-4: the day the item was first seen, as a LOCAL calendar day like `kept` and the `date` fallback (the
// ledger's ts is a UTC instant: cutting its first ten characters gave the next day for an evening west of Greenwich,
// so a note collected and kept in one evening said collected 11-15, kept 11-14).
function collectedDay(firstSeen, now) {
  const t = typeof firstSeen === 'string' ? Date.parse(firstSeen) : NaN;
  return localIsoDate(Number.isNaN(t) ? now() : new Date(t));
}

function dueFor(item) {
  if (typeof item?.due !== 'string' || item.due.trim() === '') return {};
  return { due: parseDue(item.due) ?? item.due.trim() };
}

export function keep(libraryDir, url, { topics, now = () => new Date() } = {}) {
  const config = loadConfig(libraryDir);
  const language = languageOfConfig(config);
  const state = requireInbox(libraryDir, url);
  const item = readInboxItem(libraryDir, url);
  const title = item?.title ?? state.title ?? '';
  const date = item?.date ?? state.date ?? localIsoDate(now());
  const id = `${date}-${slugOf(title, url)}`;
  const header = {
    title,
    source: url,
    source_name: item?.source ?? state.source ?? '',
    date,
    collected: collectedDay(state.firstSeen, now),
    kept: localIsoDate(now()),
    status: 'kept',
    topics: topicsFor(config, item, state, topics),
    scores: scoresFor(state),
    // 1.1.1 P8 (B23): the deadline the item carries goes into the note (「快到期」 reads it there: due.mjs)
    ...dueFor(item),
  };
  const written = writeNoteFile(libraryDir, { id, header, body: bodyFor(item, language, originalLine(libraryDir, url, language)) }, { by: 'keep' });
  appendEvent(libraryDir, { ts: now().toISOString(), ev: 'kept', url, id });
  removeInboxItem(libraryDir, url);
  rebuildIndex(libraryDir);
  return { id, file: written.file };
}

export const DISMISS_QUICK = Object.freeze(['marketing', 'irrelevant', 'shallow', 'duplicate']);

export function dismiss(libraryDir, url, reason, { quick, now = () => new Date() } = {}) {
  if (reason !== undefined && reason !== null && typeof reason !== 'string') throw new StreamsError('bad-argument', 'a reason must be a string');
  if (quick !== undefined && quick !== null && !DISMISS_QUICK.includes(quick)) throw new StreamsError('bad-argument', `quick must be one of ${DISMISS_QUICK.join(' | ')}`);
  loadConfig(libraryDir);
  requireInbox(libraryDir, url);
  const words = typeof reason === 'string' ? reason.trim() : '';
  const ev = { ts: now().toISOString(), ev: 'dismissed', url };
  if (words !== '') ev.reason = words;
  if (typeof quick === 'string') ev.quick = quick;
  appendEvent(libraryDir, ev);
  removeInboxItem(libraryDir, url);
  return { url };
}

export function later(libraryDir, url, { now = () => new Date() } = {}) {
  const s = stateOf(libraryDir, url);
  if (!s || s.stage !== 'inbox') return { url, stage: s?.stage ?? null };
  const r = markLater(libraryDir, url, { now });
  return { url, stage: s.stage, at: r.at };
}

export function recentDismissReasons(libraryDir, n = 10) {
  const limit = Number.isInteger(n) && n >= 0 ? n : 10;
  const path = ledgerPath(libraryDir);
  if (!existsSync(path)) return [];
  const { states } = replayLedger(libraryDir);
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!ev || ev.ev !== 'dismissed' || typeof ev.url !== 'string') continue;
    // redesign R2: a dismissal without a reason says nothing about the requirement
    if (typeof ev.reason !== 'string' || ev.reason.trim() === '') continue;
    out.push({ ts: ev.ts ?? null, reason: ev.reason, ...(typeof ev.quick === 'string' ? { quick: ev.quick } : {}), title: states.get(ev.url)?.title ?? '', url: ev.url });
  }
  return out.reverse().slice(0, limit);
}

// ---- redesign R2: 处理情况 (N10) ---------------------------------------------------------------------------------------

export function roundOutcome(libraryDir, roundId) {
  const out = { inbox: 0, kept: 0, dismissed: 0, later: 0, waiting: 0 };
  if (typeof roundId !== 'string' || roundId === '') return out;
  const later = readLater(libraryDir);
  for (const s of replayLedger(libraryDir).states.values()) {
    if (s.inboxRound !== roundId) continue;
    out.inbox += 1;
    if (s.stage === 'kept') out.kept += 1;
    else if (s.stage === 'dismissed') out.dismissed += 1;
    else if (later.has(s.url)) out.later += 1;
    else out.waiting += 1;
  }
  return out;
}
