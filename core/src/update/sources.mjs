// The sources of a library with a card, as 来源与要求 shows them (1.1 W6a, acceptance A5), and a source added or removed by the
// user — through the definition's add_source / remove_source, held until 确认 (B3).
//
// sourceRows(libraryDir) -> [{ name, url, query, status, state, reason, original }]
//   one row per source of the card, then one per source the card lists as unreadable
//   state     'ok' · 'failed' · 'blocked' · 'login' · 'check' · 'dead' · 'never' (not read by an update yet) · 'search'
//   original  what Streams could do with the pages of the source:
//             'read' (it read some: 读得到) · 'pdf' (only PDFs, their text taken out) · 'link' (only links: no page read,
//             or the source itself cannot be read) · 'search' (a search word: the update agent searches it) · 'unknown'
// sourceHandlers({ dirOfLibrary, language }) -> { add_source, remove_source } for createActionRunner
//   add_source({ library, source: { name, url } | { name, query } }): the card gets the source (status 「你加的」), its new version
//     kept in _card/history; remove_source({ library, source: url | query | name }): the card loses it.
import { StreamsError } from '../errors.mjs';
import { readCard, writeCard } from '../build/store.mjs';
import { sameUrl } from '../build/card.mjs';
import { readState } from './state.mjs';

const ADDED = { 'zh-CN': '你加的', en: 'added by you' };

function originalOf(entry, isQuery) {
  if (isQuery) return 'search';
  if (!entry) return 'unknown';
  const p = entry.pages ?? {};
  if ((p.read ?? 0) > 0) return 'read';
  if ((p.pdf ?? 0) > 0) return 'pdf';
  if ((p.missing ?? 0) > 0 || entry.ok === false) return 'link';
  return 'unknown';
}

export function sourceRows(libraryDir) {
  const card = readCard(libraryDir);
  if (!card) return [];
  const state = readState(libraryDir);
  const rows = (card.sources ?? []).map((s) => {
    const isQuery = !s.url && Boolean(s.query);
    const e = s.url ? state.sources[s.url] : null;
    return {
      name: s.name, url: s.url ?? null, query: isQuery ? s.query : null, status: s.status ?? '',
      state: isQuery ? 'search' : e ? (e.ok ? 'ok' : e.reason ?? 'failed') : 'never',
      reason: e && !e.ok ? e.reason ?? null : null,
      original: originalOf(e, isQuery),
    };
  });
  for (const u of card.unreadable ?? []) rows.push({ name: u.name, url: u.url ?? null, query: null, status: u.reason ?? '', state: 'blocked', reason: u.reason ?? null, original: 'link', unreadable: true });
  return rows;
}

export function sourceHandlers({ dirOfLibrary, language = 'zh-CN' } = {}) {
  if (typeof dirOfLibrary !== 'function') throw new StreamsError('bad-argument', 'sourceHandlers needs dirOfLibrary(library)');
  const cardOf = (library) => {
    const dir = dirOfLibrary(library);
    const card = readCard(dir);
    if (!card) throw new StreamsError('no-card', 'this library has no card');
    return { dir, card };
  };
  return {
    async add_source(params, { now }) {
      const { dir, card } = cardOf(params.library);
      const s = params.source;
      const url = typeof s.url === 'string' && s.url.trim() !== '' ? s.url.trim() : null;
      const query = !url && typeof s.query === 'string' && s.query.trim() !== '' ? s.query.trim() : null;
      if (!url && !query) throw new StreamsError('bad-argument', 'a source is a web address or a search word');
      if (url && !/^https?:\/\//i.test(url)) throw new StreamsError('bad-argument', 'a source address is http(s)');
      const exists = (card.sources ?? []).some((x) => (url ? sameUrl(x.url ?? '', url) : x.query === query));
      if (exists) throw new StreamsError('exists', 'the card has this source already');
      const entry = { name: s.name.trim(), ...(url ? { url } : { query }), status: ADDED[language] ?? ADDED['zh-CN'] };
      const after = { ...card, sources: [...(card.sources ?? []), entry] };
      writeCard(dir, after, { now, language });
      return { object: { type: 'source', id: url ?? query }, before: null, after: entry };
    },
    async remove_source(params, { now }) {
      const { dir, card } = cardOf(params.library);
      const key = params.source;
      const i = (card.sources ?? []).findIndex((x) => (x.url && sameUrl(x.url, key)) || x.query === key || x.name === key);
      if (i < 0) throw new StreamsError('not-found', 'the card has no such source');
      const before = card.sources[i];
      const after = { ...card, sources: card.sources.filter((_, k) => k !== i) };
      writeCard(dir, after, { now, language });
      return { object: { type: 'source', id: before.url ?? before.query ?? before.name }, before, after: null };
    },
  };
}
