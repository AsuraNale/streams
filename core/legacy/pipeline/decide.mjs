// v1.0's decisions about items that did not pass a gate (redesign R2: 未通过筛选 N02, 待评分 N09). They left core/src in 1.1
// W7b with the scoring pipeline; the user's decisions on an inbox item (keep / dismiss / later) are core/src/pipeline/decide.mjs.
//
// moveToInbox(libraryDir, url, { now? })     -> { url }   an item that did not pass a gate (stage seen, below a gate under the
//   current configuration — read from the ledger) goes into the inbox as it is: an inbox file without a summary or a check
//   (moved:'rejected') and an `inbox` event with moved:'rejected'. Never the note folder. Throws not-rejected for anything else.
// listRejected(libraryDir, { limit = 50, onlyOld })   -> { total, old, items:[{ url, title, source, date, gate, score, threshold,
//   reason, old, at, firstSeen }] }   the items below a gate, the newest verdict first; `old` = judged under another standard
// listManualWaiting(libraryDir)              -> [{ url, title, date, firstSeen, maybeDuplicateOf? }]   links added by hand
//   (source 'manual') not scored yet, first added first
import { StreamsError } from '../../src/errors.mjs';
import { appendEvent, replayLedger } from '../../src/library/ledger.mjs';
import { readConfig } from '../../src/library/config.mjs';
import { writeInboxItem } from '../../src/pipeline/inbox.mjs';
import { gateNodes, pipelineFrom } from './config.mjs';
import { nextStep, verdictThreshold } from './queue.mjs';
import { MANUAL_SOURCE } from '../fetch/manual.mjs';

function loadConfig(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  return r.config;
}

function stateOf(libraryDir, url) {
  if (typeof url !== 'string' || url === '') throw new StreamsError('bad-argument', 'url is required');
  return replayLedger(libraryDir).states.get(url) ?? null;
}

function scoresFor(state) {
  const out = {};
  for (const [k, v] of Object.entries(state.scores ?? {})) {
    out[k] = typeof v.score === 'number' ? { score: v.score, reason: v.reason ?? '' } : { value: v.value, reason: v.reason ?? '' };
  }
  return out;
}

/**
 * The gate an item is below under the current configuration, with its score and threshold; null when it is not below one.
 * Redesign R5a: `old` — the verdict was made under another 评分标准 (the cfg of that gate changed since); `threshold` is then
 * the one it was judged against (queue.mjs verdictThreshold).
 */
function belowGate(state, cfg) {
  const step = nextStep(state, cfg);
  if (step.kind !== 'done' || !step.why.startsWith('below:')) return null;
  const id = step.why.slice('below:'.length);
  const node = gateNodes(cfg).find((n) => n.id === id);
  const sc = state.scores?.[id];
  const old = step.old === true;
  const threshold = node ? (old ? verdictThreshold(sc, state.cfg?.[id], node) : node.threshold) : null;
  return { gate: id, score: typeof sc?.score === 'number' ? sc.score : null, threshold, reason: typeof sc?.reason === 'string' ? sc.reason : '', old };
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

export function listRejected(libraryDir, { limit = 50, onlyOld = false } = {}) {
  const cfg = pipelineFrom(loadConfig(libraryDir));
  const max = Number.isInteger(limit) && limit >= 0 ? limit : 50;
  const rows = [];
  let order = 0;
  for (const s of replayLedger(libraryDir).states.values()) {
    order += 1;
    if (s.stage !== 'seen') continue;
    const below = belowGate(s, cfg);
    if (!below || (onlyOld && !below.old)) continue;
    rows.push({ order, item: { url: s.url, title: s.title ?? '', source: s.source ?? '', date: s.date ?? '', ...below, at: s.lastTs ?? null, firstSeen: s.firstSeen ?? null } });
  }
  rows.sort((a, b) => String(b.item.at ?? '').localeCompare(String(a.item.at ?? '')) || b.order - a.order);
  return { total: rows.length, old: rows.filter((r) => r.item.old).length, items: rows.slice(0, max).map((r) => r.item) };
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
