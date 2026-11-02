// fetchArxiv(source, ctx): the arXiv API (Atom) for source.query, newest submissions first.
//
// Politeness: arXiv asks for at least 3 seconds between requests. ctx.lastArxivAt (ms epoch) is
// shared across the round; before each request we wait out whatever is left of the gap through
// ctx.sleep / ctx.now, so tests can inject a fake clock and never really wait.
//
// Query: a bare phrase becomes all:"phrase" (an unquoted multi-word all: query explodes into OR and
// drowns the user in off-topic papers — toolkit lesson). A query that already carries a field
// prefix (ti:, abs:, cat:, au:, all:) or boolean operators is passed through untouched.
import { parseFeed } from '../feed.mjs';
import { fetchDocument, finish, maxResults, result, shapeItems, unusableFeed } from './shared.mjs';
import { ARXIV_BASE, ARXIV_MIN_GAP_MS } from '../context.mjs';

export function arxivSearchQuery(query) {
  const q = query.trim();
  if (/\b(all|ti|abs|au|cat|co|jr|rn|id):/i.test(q) || /\b(AND|OR|ANDNOT)\b/.test(q)) return q;
  if (q.startsWith('"') && q.endsWith('"')) return `all:${q}`;
  return `all:"${q}"`;
}

export async function waitForArxivSlot(ctx) {
  const gap = ctx.arxivMinGapMs ?? ARXIV_MIN_GAP_MS;
  const last = ctx.lastArxivAt;
  if (typeof last !== 'number') return 0;
  const wait = gap - (ctx.now().getTime() - last);
  if (wait > 0) {
    await ctx.sleep(wait);
    return wait;
  }
  return 0;
}

export async function fetchArxiv(source, ctx) {
  const query = typeof source.query === 'string' ? source.query.trim() : '';
  if (query === '') return result('gap', 'arxiv source has no "query"');
  const u = new URL(ctx.arxivBase ?? ARXIV_BASE);
  u.searchParams.set('search_query', arxivSearchQuery(query));
  u.searchParams.set('sortBy', 'submittedDate');
  u.searchParams.set('sortOrder', 'descending');
  u.searchParams.set('max_results', String(maxResults(source, ctx)));
  await waitForArxivSlot(ctx);
  const doc = await fetchDocument(u.href, ctx);
  ctx.lastArxivAt = ctx.now().getTime();
  if (!doc.ok) return doc.result;
  const parsed = parseFeed(doc.text);
  if (!parsed.ok) return result('gap', `arXiv did not return a feed (${parsed.reason}): ${parsed.message}`, { http: doc.http });
  const unusable = unusableFeed(parsed, doc.http);
  if (unusable) return unusable;
  const items = shapeItems(parsed.items, source, 'arxiv', ctx);
  return finish(items, doc.http, parsed.items.length);
}
