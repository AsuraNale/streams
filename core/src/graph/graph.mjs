// The graph page (core-api 5.4, product spec 4.7, mockup S9). Reads index.jsonl and streams.json only.
//
// graph(libraryDir, { days?, status?: 'kept'|'all', topics?, links = true, now? })
//   -> { nodes:[{ id, kind, label, count, row, col, unknown? }], edges:[{ from, to, kind }], filters }
//
//   items   index entries after the filters (status 'kept' = only kept entries; 'all' = every entry;
//           topics = any one matches; days = date within the last n days)
//   topics  row 0: streams.json topics, plus topics used by the items that the config does not have
//           (unknown:true). count = items carrying the topic
//   sources row 1: streams.json source names, plus source_name values of the items. count = items
//   items   row 2: count 1 each
//   edges   topic -> item (kind 'topic'), source -> item (kind 'source'), item -> item from `links`
//           (kind 'link', only when both ends are drawn; none when links=false)
//   layout  fixed: rows 0 / 1 / 2; topics and sources by count high to low, then label; items by the
//           column of their first topic, then date newest first, then id. col = 0..n-1 in each row.
// Every comparison is by code point (never locale), so the same input gives byte-identical JSON.
import { StreamsError } from '../errors.mjs';
import { readConfig } from '../library/config.mjs';
import { readIndex } from '../library/index.mjs';
import { isPlainObject } from '../library/frontmatter.mjs';
import { cmp, entryFilter } from '../library/browse.mjs';

export const GRAPH_STATUSES = ['kept', 'all'];
export const ROWS = Object.freeze({ topic: 0, source: 1, item: 2 });

function byCountThenLabel(a, b) {
  return b.count - a.count || cmp(a.label, b.label);
}

export function graph(libraryDir, { days = null, status = 'all', topics = [], links = true, now } = {}) {
  if (!GRAPH_STATUSES.includes(status)) throw new StreamsError('bad-argument', `status must be one of ${GRAPH_STATUSES.join(' | ')}, got ${JSON.stringify(status)}`);
  const r = readConfig(libraryDir);
  if (!r.ok) throw new StreamsError(`config:${r.error.code}`, r.error.message);
  const config = r.config;
  const wantTopics = Array.isArray(topics) ? topics.filter((t) => typeof t === 'string' && t !== '') : [];
  const keep = entryFilter({ topics: wantTopics, days, now });
  const items = readIndex(libraryDir).filter((e) => (status === 'all' || e.status === 'kept') && keep(e));

  // topic nodes
  const topicNodes = new Map();
  for (const t of Array.isArray(config.topics) ? config.topics : []) {
    if (isPlainObject(t) && typeof t.name === 'string' && !topicNodes.has(t.name)) topicNodes.set(t.name, { id: `topic:${t.name}`, kind: 'topic', label: t.name, count: 0 });
  }
  for (const e of items) {
    for (const t of Array.isArray(e.topics) ? e.topics : []) {
      if (!topicNodes.has(t)) topicNodes.set(t, { id: `topic:${t}`, kind: 'topic', label: t, count: 0, unknown: true });
      topicNodes.get(t).count += 1;
    }
  }
  // source nodes
  const sourceNodes = new Map();
  for (const s of Array.isArray(config.sources) ? config.sources : []) {
    if (isPlainObject(s) && typeof s.name === 'string' && s.name !== '' && !sourceNodes.has(s.name)) sourceNodes.set(s.name, { id: `source:${s.name}`, kind: 'source', label: s.name, count: 0 });
  }
  for (const e of items) {
    if (typeof e.source_name !== 'string' || e.source_name === '') continue;
    if (!sourceNodes.has(e.source_name)) sourceNodes.set(e.source_name, { id: `source:${e.source_name}`, kind: 'source', label: e.source_name, count: 0 });
    sourceNodes.get(e.source_name).count += 1;
  }

  const topicRow = [...topicNodes.values()].sort(byCountThenLabel);
  topicRow.forEach((n, i) => { n.row = ROWS.topic; n.col = i; });
  const sourceRow = [...sourceNodes.values()].sort(byCountThenLabel);
  sourceRow.forEach((n, i) => { n.row = ROWS.source; n.col = i; });

  const firstTopicCol = (e) => {
    const t = Array.isArray(e.topics) && e.topics.length ? topicNodes.get(e.topics[0]) : undefined;
    return t ? t.col : topicRow.length;
  };
  const itemRow = [...items].sort((a, b) => firstTopicCol(a) - firstTopicCol(b) || cmp(b.date, a.date) || cmp(a.id, b.id));
  const itemNodes = itemRow.map((e, i) => ({ id: `item:${e.id}`, kind: 'item', label: e.title, count: 1, row: ROWS.item, col: i }));
  const drawn = new Set(itemRow.map((e) => e.id));

  const edges = [];
  for (const e of itemRow) {
    for (const t of Array.isArray(e.topics) ? [...new Set(e.topics)] : []) edges.push({ from: `topic:${t}`, to: `item:${e.id}`, kind: 'topic' });
    if (typeof e.source_name === 'string' && e.source_name !== '') edges.push({ from: `source:${e.source_name}`, to: `item:${e.id}`, kind: 'source' });
  }
  if (links) {
    for (const e of itemRow) {
      for (const target of Array.isArray(e.links) ? [...e.links].sort(cmp) : []) {
        if (target !== e.id && drawn.has(target)) edges.push({ from: `item:${e.id}`, to: `item:${target}`, kind: 'link' });
      }
    }
  }

  const nodes = [...topicRow, ...sourceRow, ...itemNodes].map(shapeNode);
  return { nodes, edges, filters: { days: days ?? null, status, topics: wantTopics, links: links !== false } };
}

// fixed key order so JSON.stringify is stable whatever order the fields were set in
function shapeNode(n) {
  const out = { id: n.id, kind: n.kind, label: n.label, count: n.count, row: n.row, col: n.col };
  if (n.unknown) out.unknown = true;
  return out;
}
