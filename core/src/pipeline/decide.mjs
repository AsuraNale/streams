// The user's decision on an inbox item (product spec 4.5 step 8; core-api 4.2).
//
// keep(libraryDir, url, { topics?, now? })   -> { id, file }
//   the ONLY caller of writeNoteFile(…, { by: 'keep' }); then the ledger `kept`, the inbox file removed,
//   the index rebuilt. Throws not-in-inbox / id-conflict (an existing note is never overwritten) / invalid-note.
// dismiss(libraryDir, url, reason)           -> { url }   throws reason-required / not-in-inbox
// later(libraryDir, url)                     -> { url, stage }   zero disk changes
// recentDismissReasons(libraryDir, n = 10)   -> [{ ts, reason, title, url }] newest first
// The precondition is always read from the ledger (replayLedger), never from the caller's memory.
import { createHash } from 'node:crypto';
import { StreamsError } from '../errors.mjs';
import { appendEvent, replayLedger, ledgerPath } from '../library/ledger.mjs';
import { writeNoteFile } from '../library/write-note.mjs';
import { rebuildIndex } from '../library/index.mjs';
import { readConfig } from '../library/config.mjs';
import { localIsoDate } from '../fetch/dates.mjs';
import { readInboxItem, removeInboxItem } from './inbox.mjs';
import { assertAllowed } from './invariants.mjs';
import { pipelineFrom } from './config.mjs';
import { existsSync, readFileSync } from 'node:fs';

export const SLUG_MAX = 60;
const FALLBACK_TOPIC = { 'zh-CN': '未分类', en: 'uncategorized' };
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
  const what = summary.what || (item?.scoreless ? item.excerpt ?? '' : '');
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

export function dismiss(libraryDir, url, reason, { now = () => new Date() } = {}) {
  if (typeof reason !== 'string' || reason.trim() === '') throw new StreamsError('reason-required', 'dismiss needs a reason');
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const state = requireInbox(libraryDir, url, cfg);
  assertAllowed(state, 'dismiss', cfg);
  appendEvent(libraryDir, { ts: now().toISOString(), ev: 'dismissed', url, reason: reason.trim() });
  removeInboxItem(libraryDir, url);
  return { url };
}

export function later(libraryDir, url) {
  const s = stateOf(libraryDir, url);
  return { url, stage: s?.stage ?? null };
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
    out.push({ ts: ev.ts ?? null, reason: typeof ev.reason === 'string' ? ev.reason : '', title: states.get(ev.url)?.title ?? '', url: ev.url });
  }
  return out.reverse().slice(0, limit);
}
