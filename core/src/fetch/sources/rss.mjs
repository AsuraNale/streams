// fetchRss(source, ctx): one RSS 2.0 / RSS 1.0 / Atom feed at source.url.
import { parseFeed } from '../feed.mjs';
import { fetchDocument, finish, maxResults, result, shapeItems, unusableFeed } from './shared.mjs';

export async function fetchRss(source, ctx) {
  const url = typeof source.url === 'string' ? source.url.trim() : '';
  if (url === '') return result('gap', 'rss source has no "url"');
  const doc = await fetchDocument(url, ctx);
  if (!doc.ok) return doc.result;
  const parsed = parseFeed(doc.text);
  if (!parsed.ok) return result('gap', `not a feed (${parsed.reason}): ${parsed.message}`, { http: doc.http });
  const unusable = unusableFeed(parsed, doc.http);
  if (unusable) return unusable;
  const items = shapeItems(parsed.items.slice(0, maxResults(source, ctx)), source, 'rss', ctx);
  return finish(items, doc.http, parsed.items.length);
}
