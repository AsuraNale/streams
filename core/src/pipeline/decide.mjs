// The user's decision on an inbox item (product spec 4.5 step 8; core-api 4.2).
//
// keep(libraryDir, url, { topics?, now? })   -> { id, file }
//   the ONLY caller of writeNoteFile(…, { by: 'keep' }); then the ledger `kept`, the inbox file removed,
//   the index rebuilt. Throws not-in-inbox / id-conflict (an existing note is never overwritten) / invalid-note.
// dismiss(libraryDir, url, reason?, { quick?, now? }) -> { url }   throws not-in-inbox / bad-argument
//   redesign R2 (N03): the reason is optional — none given (undefined / null / '' / blanks) → the `dismissed` event has no
//   reason field (no placeholder is made up); `quick` (DISMISS_QUICK: the 快选 the page offers) is stored beside the words
//   as `quick`. The event stays terminal: kept / dismissed never change again (ledger.mjs).
// later(libraryDir, url, { now? })           -> { url, stage, at? }   redesign R2 (F27): an item at stage inbox is marked
//   稍后处理 in _pipeline/later.json (later.mjs; never the note folder, never the ledger); any other stage: nothing written
// recentDismissReasons(libraryDir, n = 10)   -> [{ ts, reason, quick?, title, url }] newest first; a dismissal without a
//   reason is skipped (redesign R2)
// moveToInbox(libraryDir, url, { now? })     -> { url }   redesign R2 (N02): an item that did not pass a gate (stage seen,
//   below a gate's threshold under the current configuration — read from the ledger) goes into the inbox as it is: an inbox
//   file without a summary or a check (moved:'rejected') and an `inbox` event with moved:'rejected'. Never the note folder. Throws
//   not-rejected for anything else (an item still waiting, unscored, in the inbox, kept, dismissed, unknown).
// listRejected(libraryDir, { limit = 50 })   -> { total, items:[{ url, title, source, date, gate, score, threshold, reason,
//   at, firstSeen }] }   the items below a gate (未通过筛选), the newest verdict first, at most `limit`
// listManualWaiting(libraryDir)              -> [{ url, title, date, firstSeen, maybeDuplicateOf? }]   links added by hand
//   (source 'manual') not scored yet: 「待评分」 rows (N09), first added first
// roundOutcome(libraryDir, roundId)          -> { inbox, kept, dismissed, later, waiting }   what became of the items that
//   run put into the inbox (处理情况 of 上次运行); null roundId → all zero
// The precondition is always read from the ledger (replayLedger), never from the caller's memory.
import { createHash } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { appendEvent, replayLedger, ledgerPath } from '../library/ledger.mjs';
import { writeNoteFile } from '../library/write-note.mjs';
import { rebuildIndex } from '../library/index.mjs';
import { readConfig } from '../library/config.mjs';
import { localIsoDate } from '../fetch/dates.mjs';
import { readInboxItem, removeInboxItem, writeInboxItem } from './inbox.mjs';
import { assertAllowed } from './invariants.mjs';
import { gateNodes, pipelineFrom } from './config.mjs';
import { nextStep } from './queue.mjs';
import { markLater, readLater } from './later.mjs';
import { MANUAL_SOURCE } from '../fetch/manual.mjs';
import { existsSync, readFileSync } from 'node:fs';

export const SLUG_MAX = 60;
export const FALLBACK_TOPIC = { 'zh-CN': '未分类', en: 'uncategorized' };
const WHAT_LABEL = { 'zh-CN': '**这是什么：**', en: '**What it is:** ' };

export function slugOf(title, url) {
  const s = String(title ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const cut = Array.from(s).slice(0, SLUG_MAX).join('').replace(/-+$/g, '');
  return cut !== '' ? cut : createHash('sha1').update(String(url)).digest('hex').slice(0, 8);
}

function stateOf(libraryDir, url) {
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-argument', 'url is required');
  return replayLedger(libraryDir).states.get(url) ?? null;
}

function requireInbox(libraryDir, url, cfg) {
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
  return [FALLBACK_TOPIC[pipelineFrom(config).language] ?? FALLBACK_TOPIC['zh-CN']];
}

function scoresFor(state) {
  const out = {};
  for (const [k, v] of Object.entries(state.scores ?? {})) {
    out[k] = typeof v.score === 'number' ? { score: v.score, reason: v.reason ?? '' } : { value: v.value, reason: v.reason ?? '' };
  }
  return out;
}

function bodyFor(item, language) {
  const summary = item?.summary ?? {};
  // an item kept from a round without a connection has no model sentence: the feed's own excerpt stands in
  const what = summary.what || (item?.scoreless || item?.moved === 'rejected' ? item.excerpt ?? '' : '');
  const lines = [`${WHAT_LABEL[language] ?? WHAT_LABEL['zh-CN']}${what}`];
  for (const p of Array.isArray(summary.points) ? summary.points : []) lines.push(`- ${p}`);
  return lines.join('\n') + '\n';
}

export function keep(libraryDir, url, { topics, now = () => new Date() } = {}) {
  const config = loadConfig(libraryDir);
  const cfg = pipelineFrom(config);
  const state = requireInbox(libraryDir, url, cfg);
  assertAllowed(state, 'keep', cfg);
  const item = readInboxItem(libraryDir, url);
  const title = item?.title ?? state.title ?? '';
  const date = item?.date ?? state.date ?? localIsoDate(now());
  const id = `${date}-${slugOf(title, url)}`;
  const header = {
    title,
    source: url,
    source_name: item?.source ?? state.source ?? '',
    date,
    collected: typeof state.firstSeen === 'string' ? state.firstSeen.slice(0, 10) : localIsoDate(now()),
    kept: localIsoDate(now()),
    status: 'kept',
    topics: topicsFor(config, item, state, topics),
    scores: scoresFor(state),
  };
  const written = writeNoteFile(libraryDir, { id, header, body: bodyFor(item, cfg.language) }, { by: 'keep' });
  appendEvent(libraryDir, { ts: now().toISOString(), ev: 'kept', url, id });
  removeInboxItem(libraryDir, url);
  rebuildIndex(libraryDir);
  return { id, file: written.file };
}

export const DISMISS_QUICK = Object.freeze(['marketing', 'irrelevant', 'shallow', 'duplicate']);

export function dismiss(libraryDir, url, reason, { quick, now = () => new Date() } = {}) {
  if (reason !== undefined && reason !== null && typeof reason !== 'string') throw new StreamsError('bad-argument', 'a reason must be a string');
  if (quick !== undefined && quick !== null && !DISMISS_QUICK.includes(quick)) throw new StreamsError('bad-argument', `quick must be one of ${DISMISS_QUICK.join(' | ')}`);
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const state = requireInbox(libraryDir, url, cfg);
  assertAllowed(state, 'dismiss', cfg);
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

// ---- redesign R2: 未通过筛选 (N02), 待评分 (N09), 处理情况 (N10) ---------------------------------------------------------

/** The gate an item is below under the current configuration, with its score and threshold; null when it is not below one. */
function belowGate(state, cfg) {
  const step = nextStep(state, cfg);
  if (step.kind !== 'done' || !step.why.startsWith('below:')) return null;
  const id = step.why.slice('below:'.length);
  const node = gateNodes(cfg).find((n) => n.id === id);
  const sc = state.scores?.[id];
  return { gate: id, score: typeof sc?.score === 'number' ? sc.score : null, threshold: node?.threshold ?? null, reason: typeof sc?.reason === 'string' ? sc.reason : '' };
}

export function moveToInbox(libraryDir, url, { now = () => new Date() } = {}) {
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const state = stateOf(libraryDir, url);
  const below = state && state.stage === 'seen' ? belowGate(state, cfg) : null;
  if (!below) throw new StreamsError('not-rejected', `${url} did not fail a gate (stage: ${state?.stage ?? 'unknown'})`);
  const ts = now().toISOString();
  const card = {
    url, title: state.title ?? '', source: state.source ?? '', date: state.date ?? '',
    scores: scoresFor(state),
    // no model ran a summary: the feed's own lines stand in, as for an item without a connection
    summary: { what: '', points: [], quote: '' }, excerpt: typeof state.summary === 'string' ? state.summary : '',
    verification: { passed: false, rounds: 0, failed: [] },
    moved: 'rejected', movedFrom: below.gate, inboxAt: ts,
  };
  if (state.maybeDuplicateOf) card.maybeDuplicateOf = state.maybeDuplicateOf;
  writeInboxItem(libraryDir, card);
  appendEvent(libraryDir, { ts, ev: 'inbox', url, moved: 'rejected', from: below.gate });
  return { url };
}

export function listRejected(libraryDir, { limit = 50 } = {}) {
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const max = Number.isInteger(limit) && limit >= 0 ? limit : 50;
  const rows = [];
  let order = 0;
  for (const s of replayLedger(libraryDir).states.values()) {
    order += 1;
    if (s.stage !== 'seen') continue;
    const below = belowGate(s, cfg);
    if (!below) continue;
    rows.push({ order, item: { url: s.url, title: s.title ?? '', source: s.source ?? '', date: s.date ?? '', ...below, at: s.lastTs ?? null, firstSeen: s.firstSeen ?? null } });
  }
  rows.sort((a, b) => String(b.item.at ?? '').localeCompare(String(a.item.at ?? '')) || b.order - a.order);
  return { total: rows.length, items: rows.slice(0, max).map((r) => r.item) };
}

export function listManualWaiting(libraryDir) {
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const out = [];
  for (const s of replayLedger(libraryDir).states.values()) {
    if (s.stage !== 'seen' || s.source !== MANUAL_SOURCE) continue;
    if (nextStep(s, cfg).kind !== 'gate') continue;
    out.push({ url: s.url, title: s.title ?? '', date: s.date ?? '', firstSeen: s.firstSeen ?? null, ...(s.maybeDuplicateOf ? { maybeDuplicateOf: s.maybeDuplicateOf } : {}) });
  }
  return out;
}

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
