// Sources and topics (core-api 5.6, mockup S5). Writes streams.json only: read -> change `sources` /
// `topics` -> write a temporary file -> rename; every other key keeps its value and order
// (2-space JSON + final newline, the same format createLibrary writes).
//
// sourcesView(libraryDir)  -> { sources:[{ ...config, paused, status, hint, http, message, consecutive, lastOkAt, count, new }],
//                               topics:[{ name, keywords, kept, sources }], counts:{ sources, topics } }
//                              status / hint / … are null (count / new / consecutive 0) for a source with no fetch on record
// guessSource(input)       -> { kind:'rss', url, name } | { kind:'arxiv', query, name } | { kind:'hn', query, name }
//                              (name is a suggestion; the caller may change it and the kind)
// addSource / updateSource / removeSource / setSourcePaused
// addTopic / updateTopic / removeTopic
//   Removing a topic clears it from the sources that used it; kept entries are not touched (their
//   topic then shows up as an unknown-topic warning). Renaming a topic renames it in those sources too.
// Errors: bad-input · bad-source · duplicate-source · bad-topic · duplicate-topic · not-found · config:<code>
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamsError } from '../errors.mjs';
import { CONFIG_FILE, readConfig } from './config.mjs';
import { isPlainObject } from './frontmatter.mjs';
import { readIndex } from './index.mjs';
import { readFetchLog } from '../fetch/log.mjs';
import { hintOf } from '../fetch/states.mjs';

export const SOURCE_NAME_RE = /^[a-z0-9-]{1,40}$/;
// The kinds of a streams.json source (1.1 W7b: written out here — the fetchers that read them left core/src for core/legacy/,
// whose fetch/source.mjs has the same list)
export const SOURCE_KINDS = Object.freeze(['rss', 'arxiv', 'hn']);
export const SOURCE_PATCH_KEYS = ['url', 'query', 'topic', 'min_points', 'name'];
export const TOPIC_PATCH_KEYS = ['keywords', 'name'];

// ---------------------------------------------------------------- streams.json in, streams.json out

function loadWhole(libraryDir) {
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  let raw = readFileSync(join(libraryDir, CONFIG_FILE), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

function saveWhole(libraryDir, whole) {
  const path = join(libraryDir, CONFIG_FILE);
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, JSON.stringify(whole, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

function sourcesOf(whole) {
  return Array.isArray(whole.sources) ? whole.sources : [];
}

function topicsOf(whole) {
  return Array.isArray(whole.topics) ? whole.topics : [];
}

function sameName(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// ---------------------------------------------------------------- view

// source name -> { last fetch_log line, consecutive same-status lines, lastOkAt } (the S5 and S11 rows read it)
export function latestFetchLines(libraryDir) {
  const { entries } = readFetchLog(libraryDir);
  const bySource = new Map();
  for (const e of entries) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source).push(e);
  }
  const out = new Map();
  for (const [name, rows] of bySource) {
    const last = rows[rows.length - 1];
    let consecutive = 0;
    for (let i = rows.length - 1; i >= 0 && rows[i].status === last.status; i -= 1) consecutive += 1;
    let lastOkAt = null;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].status === 'ok' || rows[i].status === 'empty') { lastOkAt = rows[i].ts ?? null; break; }
    }
    out.set(name, { last, consecutive, lastOkAt });
  }
  return out;
}

// The latest fetch_log state of one configured source, flat (the S5 row and the S11 row read it).
export function sourceRow(source, lines) {
  const name = typeof source?.name === 'string' ? source.name : '';
  const l = lines.get(name);
  const row = {
    paused: source?.paused === true,
    status: null, hint: null, http: null, message: '', consecutive: 0, lastOkAt: null, count: 0, new: 0,
  };
  if (l) {
    row.status = l.last.status;
    row.hint = typeof l.last.hint === 'string' ? l.last.hint : hintOf(l.last.status);
    row.http = l.last.http ?? null;
    row.message = l.last.message ?? '';
    row.consecutive = l.consecutive;
    row.lastOkAt = l.lastOkAt;
    row.count = Number.isInteger(l.last.count) ? l.last.count : 0;
    row.new = Number.isInteger(l.last.new) ? l.last.new : 0;
  }
  return row;
}

export function sourcesView(libraryDir) {
  const whole = loadWhole(libraryDir);
  const lines = latestFetchLines(libraryDir);
  const sources = sourcesOf(whole).filter(isPlainObject).map((s) => ({ ...structuredClone(s), ...sourceRow(s, lines) }));
  const index = readIndex(libraryDir);
  const topics = topicsOf(whole).filter(isPlainObject).map((t) => ({
    name: t.name,
    keywords: Array.isArray(t.keywords) ? [...t.keywords] : [],
    kept: index.filter((e) => e.status === 'kept' && Array.isArray(e.topics) && e.topics.includes(t.name)).length,
    sources: sourcesOf(whole).filter((s) => isPlainObject(s) && s.topic === t.name).length,
  }));
  return { sources, topics, counts: { sources: sources.length, topics: topics.length } };
}

// ---------------------------------------------------------------- guess

function slug(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function suggestName(prefix, text) {
  const s = slug(text);
  const name = (prefix ? (s ? `${prefix}-${s}` : prefix) : s).slice(0, 40).replace(/-+$/g, '');
  return name || prefix || 'source';
}

export function guessSource(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new StreamsError('bad-input', 'paste an address or a search phrase');
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    let host = s;
    try { host = new URL(s).hostname.replace(/^www\./, ''); } catch { /* not a parseable URL: name from the raw text */ }
    return { kind: 'rss', url: s, name: suggestName('', host) };
  }
  const arxiv = /^arxiv:\s*(.*)$/i.exec(s);
  if (arxiv) {
    if (arxiv[1].trim() === '') throw new StreamsError('bad-input', 'arxiv: needs a search phrase after it');
    return { kind: 'arxiv', query: arxiv[1].trim(), name: suggestName('arxiv', arxiv[1]) };
  }
  if (/["“”]/.test(s) || /(^|\s)OR(\s|$)/.test(s)) return { kind: 'arxiv', query: s, name: suggestName('arxiv', s) };
  return { kind: 'hn', query: s, name: suggestName('hn', s) };
}

// ---------------------------------------------------------------- sources

function badSource(message) {
  return new StreamsError('bad-source', message);
}

function isHttpUrl(u) {
  if (typeof u !== 'string' || u.trim() === '') return false;
  try {
    const p = new URL(u.trim());
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

// -> the normalized source to store. `others` = the other sources (name uniqueness), `topics` = topic names.
export function checkSource(source, { others = [], topics = [] } = {}) {
  if (!isPlainObject(source)) throw badSource('a source must be an object');
  const out = structuredClone(source);
  for (const k of ['name', 'kind', 'url', 'query', 'topic']) if (typeof out[k] === 'string') out[k] = out[k].trim();
  if (typeof out.kind === 'string') out.kind = out.kind.toLowerCase();
  if (!SOURCE_KINDS.includes(out.kind)) throw badSource(`kind must be one of ${SOURCE_KINDS.join(' | ')}, got ${JSON.stringify(source.kind)}`);
  if (typeof out.name !== 'string' || !SOURCE_NAME_RE.test(out.name)) throw badSource(`name must match [a-z0-9-]{1,40}, got ${JSON.stringify(source.name)}`);
  if (others.some((o) => isPlainObject(o) && o.name === out.name)) throw new StreamsError('duplicate-source', `a source named "${out.name}" already exists`);
  if (out.kind === 'rss') {
    if (!isHttpUrl(out.url)) throw badSource('an rss source needs an http(s) url');
  } else if (typeof out.query !== 'string' || out.query === '') {
    throw badSource(`an ${out.kind} source needs a query`);
  }
  if (out.topic === null || out.topic === '') delete out.topic;
  if (out.topic !== undefined && (typeof out.topic !== 'string' || !topics.includes(out.topic))) throw badSource(`topic ${JSON.stringify(out.topic)} is not one of the library's topics`);
  if (out.min_points === null) delete out.min_points;
  if (out.min_points !== undefined && !(Number.isInteger(out.min_points) && out.min_points >= 0)) throw badSource('min_points must be a whole number >= 0');
  if (out.paused !== undefined && typeof out.paused !== 'boolean') throw badSource('paused must be true or false');
  return out;
}

function topicNamesOf(whole) {
  return topicsOf(whole).filter(isPlainObject).map((t) => t.name);
}

function findSource(whole, name) {
  const list = sourcesOf(whole);
  const i = list.findIndex((s) => isPlainObject(s) && s.name === name);
  if (i < 0) throw new StreamsError('not-found', `no source named ${JSON.stringify(name)}`);
  return i;
}

export function addSource(libraryDir, source) {
  const whole = loadWhole(libraryDir);
  const stored = checkSource(source, { others: sourcesOf(whole), topics: topicNamesOf(whole) });
  whole.sources = [...sourcesOf(whole), stored];
  saveWhole(libraryDir, whole);
  return { source: structuredClone(stored) };
}

export function updateSource(libraryDir, name, patch) {
  if (!isPlainObject(patch)) throw badSource('patch must be an object');
  const extra = Object.keys(patch).filter((k) => !SOURCE_PATCH_KEYS.includes(k));
  if (extra.length) throw badSource(`only ${SOURCE_PATCH_KEYS.join(' / ')} can be changed, got ${extra.join(', ')}`);
  const whole = loadWhole(libraryDir);
  const i = findSource(whole, name);
  const list = sourcesOf(whole);
  const merged = { ...list[i], ...patch };
  const stored = checkSource(merged, { others: list.filter((_, j) => j !== i), topics: topicNamesOf(whole) });
  whole.sources = list.map((s, j) => (j === i ? stored : s));
  saveWhole(libraryDir, whole);
  return { source: structuredClone(stored) };
}

export function removeSource(libraryDir, name) {
  const whole = loadWhole(libraryDir);
  const i = findSource(whole, name);
  whole.sources = sourcesOf(whole).filter((_, j) => j !== i);
  saveWhole(libraryDir, whole);
  return { name };
}

export function setSourcePaused(libraryDir, name, paused) {
  if (typeof paused !== 'boolean') throw badSource('paused must be true or false');
  const whole = loadWhole(libraryDir);
  const i = findSource(whole, name);
  const s = { ...sourcesOf(whole)[i] };
  if (paused) s.paused = true;
  else delete s.paused;
  whole.sources = sourcesOf(whole).map((x, j) => (j === i ? s : x));
  saveWhole(libraryDir, whole);
  return { name, paused };
}

// ---------------------------------------------------------------- topics

function badTopic(message) {
  return new StreamsError('bad-topic', message);
}

function cleanKeywords(keywords) {
  if (keywords === undefined) return [];
  if (!Array.isArray(keywords) || !keywords.every((k) => typeof k === 'string')) throw badTopic('keywords must be a list of words');
  return [...new Set(keywords.map((k) => k.trim()).filter((k) => k !== ''))];
}

function cleanTopicName(name) {
  if (typeof name !== 'string' || name.trim() === '') throw badTopic('a topic needs a name');
  return name.trim();
}

function findTopic(whole, name) {
  const i = topicsOf(whole).findIndex((t) => isPlainObject(t) && t.name === name);
  if (i < 0) throw new StreamsError('not-found', `no topic named ${JSON.stringify(name)}`);
  return i;
}

export function addTopic(libraryDir, { name, keywords } = {}) {
  const n = cleanTopicName(name);
  const kw = cleanKeywords(keywords);
  const whole = loadWhole(libraryDir);
  if (topicsOf(whole).some((t) => isPlainObject(t) && sameName(t.name, n))) throw new StreamsError('duplicate-topic', `a topic named "${n}" already exists`);
  const topic = { name: n, keywords: kw };
  whole.topics = [...topicsOf(whole), topic];
  saveWhole(libraryDir, whole);
  return { topic: structuredClone(topic) };
}

export function updateTopic(libraryDir, name, patch = {}) {
  if (!isPlainObject(patch)) throw badTopic('patch must be an object');
  const extra = Object.keys(patch).filter((k) => !TOPIC_PATCH_KEYS.includes(k));
  if (extra.length) throw badTopic(`only ${TOPIC_PATCH_KEYS.join(' / ')} can be changed, got ${extra.join(', ')}`);
  const whole = loadWhole(libraryDir);
  const i = findTopic(whole, name);
  const list = topicsOf(whole);
  const topic = { ...list[i] };
  if (patch.keywords !== undefined) topic.keywords = cleanKeywords(patch.keywords);
  if (patch.name !== undefined) {
    const n = cleanTopicName(patch.name);
    if (list.some((t, j) => j !== i && isPlainObject(t) && sameName(t.name, n))) throw new StreamsError('duplicate-topic', `a topic named "${n}" already exists`);
    topic.name = n;
  }
  whole.topics = list.map((t, j) => (j === i ? topic : t));
  if (topic.name !== name && Array.isArray(whole.sources)) {
    whole.sources = whole.sources.map((s) => (isPlainObject(s) && s.topic === name ? { ...s, topic: topic.name } : s));
  }
  saveWhole(libraryDir, whole);
  return { topic: structuredClone(topic) };
}

export function removeTopic(libraryDir, name) {
  const whole = loadWhole(libraryDir);
  const i = findTopic(whole, name);
  const topic = topicsOf(whole)[i];
  whole.topics = topicsOf(whole).filter((_, j) => j !== i);
  const cleared = [];
  if (Array.isArray(whole.sources)) {
    whole.sources = whole.sources.map((s) => {
      if (!isPlainObject(s) || s.topic !== name) return s;
      cleared.push(s.name);
      const copy = { ...s };
      delete copy.topic;
      return copy;
    });
  }
  saveWhole(libraryDir, whole);
  return { topic: structuredClone(topic), sourcesCleared: cleared };
}
