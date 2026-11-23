// index.jsonl / index.meta.json: generated from the note files, never the other way round.
//
// rebuildIndex(libraryDir) -> { entries, pending, meta }   writes both files; never touches the note folder
// readIndex(libraryDir)    -> entries                       ([] when index.jsonl is absent)
// formatIndexLine(entry)   -> string                        (fixed key order, no spaces, "\n" terminated)
//
// Rebuilding twice over an unchanged note folder yields byte-identical index.jsonl, and an
// index.meta.json that differs only in rebuilt_at.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { scanLibrary } from './scan.mjs';
import { extractWikiLinks, resolveLinks } from './links.mjs';

export const INDEX_FILE = 'index.jsonl';
export const INDEX_META_FILE = 'index.meta.json';
export const INDEX_KEYS = ['id', 'title', 'source', 'source_name', 'date', 'collected', 'kept', 'status', 'topics', 'scores', 'links', 'links_unresolved', 'summary', 'words', 'mtime', 'warnings'];
export const SUMMARY_LIMIT = 240;

export function formatIndexLine(entry) {
  if (!entry || typeof entry.id !== 'string') throw new TypeError('formatIndexLine: entry.id is required');
  const ordered = {};
  for (const k of INDEX_KEYS) if (entry[k] !== undefined) ordered[k] = entry[k];
  return JSON.stringify(ordered) + '\n';
}

export function flattenScores(scores) {
  const out = {};
  if (!scores) return out;
  for (const [k, v] of Object.entries(scores)) out[k] = typeof v.score === 'number' ? v.score : v.value;
  return out;
}

export function isoSeconds(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// 1.1 W8: the label a kept note's first line opens with (pipeline/decide.mjs WHAT_LABEL) is the note's layout, not what it
// says: left in the summary, its 「什么」 matched every question with 什么 in it, so 问库 never found that the library had
// nothing on a question. The summary starts after it.
export const SUMMARY_LABELS = Object.freeze(['这是什么：', 'What it is:']);

// First body paragraph as plain text, markdown markers stripped, the opening label (SUMMARY_LABELS) left out, cut at
// SUMMARY_LIMIT code points.
export function summaryOf(body) {
  const lines = body.split(/\r?\n/);
  const buf = [];
  for (const raw of lines) {
    const s = raw.trim();
    if (s === '') { if (buf.length) break; continue; }
    if (/^#{1,6}\s/.test(s) || /^#{1,6}$/.test(s)) continue;
    const t = plainText(s);
    if (t) buf.push(t);
    if (buf.join(' ').length > SUMMARY_LIMIT) break;
  }
  let text = buf.join(' ');
  const label = SUMMARY_LABELS.find((l) => text.startsWith(l));
  if (label) text = text.slice(label.length).trimStart();
  return Array.from(text).slice(0, SUMMARY_LIMIT).join('');
}

export function plainText(s) {
  return s
    .replace(/^>+\s*/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, target, display) => (display ?? target).trim())
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

// Chinese characters + Latin words.
export function countWords(body) {
  const cjk = body.match(/[㐀-䶿一-鿿豈-﫿]/g) ?? [];
  const latin = body.match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g) ?? [];
  return cjk.length + latin.length;
}

export function buildEntry(note, { byId, byTitle }) {
  const { meta, body, stat, warnings } = note;
  const { links, unresolved } = resolveLinks(extractWikiLinks(body), { byId, byTitle });
  const entry = { id: meta.id, title: meta.title, source: meta.source };
  if (meta.source_name !== undefined && meta.source_name !== null) entry.source_name = meta.source_name;
  entry.date = meta.date;
  if (meta.collected !== undefined && meta.collected !== null) entry.collected = meta.collected;
  if (meta.kept !== undefined && meta.kept !== null) entry.kept = meta.kept;
  entry.status = meta.status;
  entry.topics = [...meta.topics];
  entry.scores = flattenScores(meta.scores);
  entry.links = links;
  entry.links_unresolved = unresolved;
  entry.summary = summaryOf(body);
  entry.words = countWords(body);
  entry.mtime = isoSeconds(stat.mtimeMs);
  entry.warnings = warnings.map((w) => w.code);
  return entry;
}

export function rebuildIndex(libraryDir) {
  const { valid, pending } = scanLibrary(libraryDir);
  const byId = new Map();
  const byTitle = new Map();
  const sorted = [...valid].sort((a, b) => (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0));
  for (const v of sorted) {
    byId.set(v.meta.id, v.meta.id);
    if (!byTitle.has(v.meta.title)) byTitle.set(v.meta.title, v.meta.id);
  }
  const entries = sorted.map((v) => buildEntry(v, { byId, byTitle }));
  const pendingOut = pending.map((p) => ({ file: p.file, codes: p.codes, messages: p.messages }));
  const meta = {
    rebuilt_at: new Date().toISOString(),
    count: entries.length,
    pending_count: pendingOut.length,
    warnings_count: entries.reduce((n, e) => n + e.warnings.length, 0),
    problems: pendingOut.map((p) => ({ file: p.file, codes: p.codes })),
  };
  writeFileSync(join(libraryDir, INDEX_FILE), entries.map(formatIndexLine).join(''), 'utf8');
  writeFileSync(join(libraryDir, INDEX_META_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return { entries, pending: pendingOut, meta };
}

export function readIndex(libraryDir) {
  const path = join(libraryDir, INDEX_FILE);
  if (!existsSync(path)) return [];
  const entries = [];
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      entries.push(JSON.parse(line));
    } catch (e) {
      throw new StreamsError('bad-index-line', `${path} line ${i + 1}: ${e.message}`, { line: i + 1 });
    }
  });
  return entries;
}
