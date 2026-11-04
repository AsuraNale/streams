// The library pages (core-api 5.1, mockup S6). Read only: nothing here writes anything.
//
// libraryCounts(libraryDir) -> { kept, authored, caught, pending }
//   kept / authored  index entries with that status
//   caught           ledger states whose stage is not kept / dismissed (not past a gate + not decided yet)
//   pending          listPending().length
// listLibrary(libraryDir, { view, topics?, days?, now? }) -> { view, items, total }
//   kept      index rows with status kept, newest `kept` first (then date, then id)
//   authored  index rows with status authored, newest date first (then id)
//   caught    { url, title, source, date, firstSeen, stage, scores, unscored, topic, stoppedAt } newest first seen first;
//             stoppedAt: '<gate id>' (below that gate's threshold) | 'unscored' | 'queued' | 'inbox'
//             topic = the topic its source is filed under in streams.json (null when none)
//   pending   listPending() rows; this view also has skippedDirs (scanLibrary's: the sub folders not read, core-api 5.9)
//   topics: any one matches. days: date >= today - days (caught: firstSeen within days * 24 h).
//   total = items.length after the filters.
// readNote(libraryDir, id) -> { entry, body, backlinks:[{id,title}], sameSource:[{id,title,date}], file }
// notePath(libraryDir, id) -> absolute path (id must be in the index)
// noteBodyOf(libraryDir, id) -> the text after the front matter, or null when the file cannot be read
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { readIndex } from './index.mjs';
import { replayLedger, TERMINAL_STAGES } from './ledger.mjs';
import { listPending, pendingView } from './pending.mjs';
import { readConfig } from './config.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { notesDir } from './scan.mjs';
import { isNoteId } from './write-note.mjs';
import { localIsoDate } from '../fetch/dates.mjs';
import { pipelineFrom } from '../pipeline/config.mjs';
import { nextStep } from '../pipeline/queue.mjs';

export const LIBRARY_VIEWS = ['kept', 'authored', 'caught', 'pending'];
export const SAME_SOURCE_MAX = 5;
const DAY_MS = 86_400_000;

export function cmp(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
}

function loadConfig(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  return r.config;
}

function clockOf(now) {
  const v = typeof now === 'function' ? now() : new Date();
  return v instanceof Date ? v : new Date(v);
}

// { topics, days, now } -> predicate over index entries. days null / undefined = no date filter.
export function entryFilter({ topics, days, now } = {}) {
  const want = Array.isArray(topics) ? topics.filter((t) => typeof t === 'string' && t !== '') : [];
  const cutoff = dateCutoff(days, now);
  return (e) => {
    if (want.length && !(Array.isArray(e.topics) && e.topics.some((t) => want.includes(t)))) return false;
    if (cutoff !== null && !(typeof e.date === 'string' && e.date >= cutoff)) return false;
    return true;
  };
}

// The first calendar day (YYYY-MM-DD, local) inside the last `days` days, or null for no filter.
export function dateCutoff(days, now) {
  if (days === undefined || days === null) return null;
  if (!Number.isFinite(days) || days < 0) throw new StreamsError('bad-argument', `days must be a non-negative number, got ${JSON.stringify(days)}`);
  return localIsoDate(new Date(clockOf(now).getTime() - Math.floor(days) * DAY_MS));
}

export function libraryCounts(libraryDir) {
  const index = readIndex(libraryDir);
  const { states } = replayLedger(libraryDir);
  let caught = 0;
  for (const s of states.values()) if (!TERMINAL_STAGES.includes(s.stage)) caught += 1;
  return {
    kept: index.filter((e) => e.status === 'kept').length,
    authored: index.filter((e) => e.status === 'authored').length,
    caught,
    pending: listPending(libraryDir).length,
  };
}

export function listLibrary(libraryDir, { view, topics, days, now } = {}) {
  if (!LIBRARY_VIEWS.includes(view)) throw new StreamsError('bad-view', `view must be one of ${LIBRARY_VIEWS.join(' | ')}, got ${JSON.stringify(view)}`);
  let items;
  if (view === 'pending') {
    const p = pendingView(libraryDir);
    return { view, items: p.items, total: p.items.length, skippedDirs: p.skippedDirs };
  } else if (view === 'caught') {
    items = caughtItems(libraryDir, { topics, days, now });
  } else {
    const keep = entryFilter({ topics, days, now });
    items = readIndex(libraryDir).filter((e) => e.status === view && keep(e));
    if (view === 'kept') items.sort((a, b) => cmp(b.kept, a.kept) || cmp(b.date, a.date) || cmp(a.id, b.id));
    else items.sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id));
  }
  return { view, items, total: items.length };
}

function stoppedAtOf(state, cfg) {
  const step = nextStep(state, cfg);
  if (step.kind === 'gate' || step.kind === 'summary') return 'queued';
  if (step.why === 'inbox') return 'inbox';
  if (step.why.startsWith('below:')) return step.why.slice('below:'.length);
  if (step.why.startsWith('stuck:')) return 'unscored';
  return 'queued';
}

function caughtItems(libraryDir, { topics, days, now }) {
  const config = loadConfig(libraryDir);
  const cfg = pipelineFrom(config);
  const topicOfSource = new Map();
  for (const s of Array.isArray(config.sources) ? config.sources : []) {
    if (s && typeof s.name === 'string' && typeof s.topic === 'string' && s.topic.trim() !== '') topicOfSource.set(s.name, s.topic.trim());
  }
  const want = Array.isArray(topics) ? topics.filter((t) => typeof t === 'string' && t !== '') : [];
  let sinceMs = null;
  if (days !== undefined && days !== null) {
    if (!Number.isFinite(days) || days < 0) throw new StreamsError('bad-argument', `days must be a non-negative number, got ${JSON.stringify(days)}`);
    sinceMs = clockOf(now).getTime() - days * DAY_MS;
  }
  const { states } = replayLedger(libraryDir);
  const rows = [];
  let order = 0;
  for (const s of states.values()) {
    order += 1;
    if (TERMINAL_STAGES.includes(s.stage)) continue;
    const topic = topicOfSource.get(s.source) ?? null;
    if (want.length && !want.includes(topic)) continue;
    if (sinceMs !== null) {
      const t = Date.parse(s.firstSeen ?? '');
      if (Number.isNaN(t) || t < sinceMs) continue;
    }
    rows.push({
      order,
      item: {
        url: s.url,
        title: s.title ?? '',
        source: s.source ?? '',
        date: s.date ?? '',
        firstSeen: s.firstSeen ?? null,
        stage: s.stage,
        scores: structuredClone(s.scores ?? {}),
        unscored: { ...(s.unscored ?? {}) },
        topic,
        stoppedAt: stoppedAtOf(s, cfg),
      },
    });
  }
  rows.sort((a, b) => cmp(b.item.firstSeen, a.item.firstSeen) || b.order - a.order);
  return rows.map((r) => r.item);
}

function noteFile(libraryDir, id) {
  return join(notesDir(libraryDir), `${id}.md`);
}

export function noteBodyOf(libraryDir, id) {
  if (!isNoteId(id)) return null;
  const path = noteFile(libraryDir, id);
  if (!existsSync(path)) return null;
  try {
    return parseFrontmatter(readFileSync(path, 'utf8')).body;
  } catch {
    return null;
  }
}

function indexEntry(libraryDir, id) {
  if (typeof id !== 'string' || id === '') throw new StreamsError('not-found', 'id is required');
  const index = readIndex(libraryDir);
  const entry = index.find((e) => e.id === id);
  if (!entry) throw new StreamsError('not-found', `"${id}" is not in the index`);
  return { entry, index };
}

export function readNote(libraryDir, id) {
  const { entry, index } = indexEntry(libraryDir, id);
  const body = noteBodyOf(libraryDir, id);
  if (body === null) throw new StreamsError('not-found', `${id}.md cannot be read from the note folder`);
  const backlinks = index
    .filter((e) => e.id !== id && Array.isArray(e.links) && e.links.includes(id))
    .sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id))
    .map((e) => ({ id: e.id, title: e.title }));
  const sameSource = typeof entry.source_name === 'string' && entry.source_name !== ''
    ? index
      .filter((e) => e.id !== id && e.source_name === entry.source_name)
      .sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id))
      .slice(0, SAME_SOURCE_MAX)
      .map((e) => ({ id: e.id, title: e.title, date: e.date }))
    : [];
  // the index flattens scores to numbers; the right panel also shows each score's reason, which only the header has
  const scores = noteScoresOf(libraryDir, id);
  return { entry, body, scores, backlinks, sameSource, file: `${id}.md` };
}

/** The header's scores with their reasons: { node: { score, reason } | { value, reason } }; {} when there are none. */
export function noteScoresOf(libraryDir, id) {
  if (!isNoteId(id)) return {};
  const path = noteFile(libraryDir, id);
  if (!existsSync(path)) return {};
  try {
    const meta = parseFrontmatter(readFileSync(path, 'utf8')).meta;
    const raw = meta && typeof meta.scores === 'object' && meta.scores !== null ? meta.scores : {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object') {
        const reason = typeof v.reason === 'string' ? v.reason : '';
        if (typeof v.score === 'number') out[k] = { score: v.score, reason };
        else if (v.value !== undefined) out[k] = { value: v.value, reason };
      } else if (typeof v === 'number') out[k] = { score: v, reason: '' };
      else if (typeof v === 'string') out[k] = { value: v, reason: '' };
    }
    return out;
  } catch {
    return {};
  }
}

export function notePath(libraryDir, id) {
  indexEntry(libraryDir, id);
  return noteFile(libraryDir, id);
}
