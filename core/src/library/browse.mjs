// The library pages (core-api 5.1, mockup S6). Read only: nothing here writes anything.
//
// libraryCounts(libraryDir) -> { kept, authored, pending, all }
//   kept / authored  index entries with that status
//   all              every index entry (redesign R3: 资料库's 「全部」 — only what is a file of the library)
//   pending          listPending().length
// listLibrary(libraryDir, { view, topics?, days?, now? }) -> { view, items, total }
//   kept      index rows with status kept, newest `kept` first (then date, then id)
//   authored  index rows with status authored, newest date first (then id)
//   pending   listPending() rows; this view also has skippedDirs (scanLibrary's: the sub folders not read, core-api 5.9)
//   all       redesign R3 (资料库 「全部」): every index row — kept, authored, archived; never a ledger item without a file —
//             newest date first (then id)
//   topics: any one matches. days: date >= today - days.
//   (1.1 W7b: v1.0's 「抓到的」 view and count — the ledger items its scoring steps had seen — left with the scoring pipeline;
//   every view is of the library's files.)
//   total = items.length after the filters.
// readNote(libraryDir, id) -> { entry, body, backlinks:[{id,title}], sameSource:[{id,title,date}], file }
// notePath(libraryDir, id) -> absolute path (id must be in the index)
// noteBodyOf(libraryDir, id) -> the text after the front matter, or null when the file cannot be read
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { readIndex } from './index.mjs';
import { listPending, pendingView } from './pending.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { notesDir } from './scan.mjs';
import { isNoteId } from './write-note.mjs';
import { localIsoDate } from '../fetch/dates.mjs';

export const LIBRARY_VIEWS = ['kept', 'authored', 'pending', 'all'];
export const SAME_SOURCE_MAX = 5;
const DAY_MS = 86_400_000;

export function cmp(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
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
  return {
    kept: index.filter((e) => e.status === 'kept').length,
    authored: index.filter((e) => e.status === 'authored').length,
    pending: listPending(libraryDir).length,
    all: index.length,
  };
}

export function listLibrary(libraryDir, { view, topics, days, now } = {}) {
  if (!LIBRARY_VIEWS.includes(view)) throw new StreamsError('bad-view', `view must be one of ${LIBRARY_VIEWS.join(' | ')}, got ${JSON.stringify(view)}`);
  let items;
  if (view === 'pending') {
    const p = pendingView(libraryDir);
    return { view, items: p.items, total: p.items.length, skippedDirs: p.skippedDirs };
  } else {
    const keep = entryFilter({ topics, days, now });
    items = readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e));
    if (view === 'kept') items.sort((a, b) => cmp(b.kept, a.kept) || cmp(b.date, a.date) || cmp(a.id, b.id));
    else items.sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id));
  }
  return { view, items, total: items.length };
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
