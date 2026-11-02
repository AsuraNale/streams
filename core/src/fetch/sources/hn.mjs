// fetchHn(source, ctx): Hacker News stories via the public Algolia search API.
//
// Points are filtered CLIENT-SIDE (fetch, then drop hits below min_points). The server-side
// numericFilters=points>=N form is fragile: one encoding slip makes the endpoint answer 400 and the
// whole source silently returns nothing (toolkit lesson). We never send numericFilters.
import { toIsoDate } from '../dates.mjs';
import { fetchDocument, finish, maxResults, result, shapeItems } from './shared.mjs';
import { HN_BASE } from '../context.mjs';

export const DEFAULT_MIN_POINTS = 50;

export function minPoints(source) {
  const n = Number(source.min_points);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_POINTS;
}

export async function fetchHn(source, ctx) {
  const query = typeof source.query === 'string' ? source.query.trim() : '';
  if (query === '') return result('gap', 'hn source has no "query"');
  const want = maxResults(source, ctx);
  const u = new URL(ctx.hnBase ?? HN_BASE);
  u.searchParams.set('query', query);
  u.searchParams.set('tags', 'story');
  u.searchParams.set('hitsPerPage', String(Math.max(want * 4, 20)));
  const doc = await fetchDocument(u.href, ctx);
  if (!doc.ok) return doc.result;
  let data;
  try {
    data = JSON.parse(doc.text);
  } catch {
    return result('gap', 'HN Algolia returned non-JSON', { http: doc.http });
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.hits)) {
    return result('gap', 'HN Algolia JSON has no "hits" array', { http: doc.http });
  }
  const threshold = minPoints(source);
  const raw = [];
  for (const h of data.hits) {
    if (!h || typeof h !== 'object') continue;
    const points = Number(h.points ?? 0) || 0;
    if (points < threshold) continue;
    const title = String(h.title ?? '').trim();
    if (title === '') continue;
    const url = typeof h.url === 'string' && h.url.trim() !== '' ? h.url.trim() : `https://news.ycombinator.com/item?id=${h.objectID ?? ''}`;
    raw.push({ title, url, summary: `HN story, ${points} points`, date: toIsoDate(h.created_at ?? '') });
    if (raw.length >= want) break;
  }
  const items = shapeItems(raw, source, 'hn', ctx);
  return finish(items, doc.http, data.hits.length);
}
