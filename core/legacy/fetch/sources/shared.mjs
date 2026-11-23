// What the three fetchers share: one classified GET, and item shaping.
//
// fetchDocument(url, ctx) -> { ok: true, text, http, headers }
//                         -> { ok: false, result: { status, http?, message, retryAfterSeconds?, items: [] } }
// result(status, message, extra)      a fetcher result without items
// shapeItems(rawItems, source, kind, ctx) -> items with { url, title, date, summary, source, kind, topic? }
// finish(items, source, kind, http)   -> ok when >= 1 item, else empty
import { getText } from '../../../src/fetch/http.mjs';
import { classifyError, classifyHttp } from '../../../src/fetch/states.mjs';
import { localIsoDate } from '../../../src/fetch/dates.mjs';
import { truncateText } from '../../../src/fetch/html.mjs';

export function result(status, message, extra = {}) {
  return { status, message, ...extra, items: [] };
}

export async function fetchDocument(url, ctx) {
  const r = await getText(url, { fetchImpl: ctx.fetchImpl, timeoutMs: ctx.timeoutMs, userAgent: ctx.userAgent });
  if (!r.ok) {
    const c = classifyError(r.error);
    return { ok: false, result: result(c.state, c.message) };
  }
  const c = classifyHttp(r.status, r.headers, { now: ctx.now });
  if (c.state !== 'ok') {
    const extra = { http: r.status };
    if (c.retryAfterSeconds !== undefined) extra.retryAfterSeconds = c.retryAfterSeconds;
    return { ok: false, result: result(c.state, c.message, extra) };
  }
  return { ok: true, text: r.text, http: r.status, headers: r.headers };
}

export function fetchDay(ctx) {
  return localIsoDate(ctx.now());
}

export function shapeItems(rawItems, source, kind, ctx) {
  const today = fetchDay(ctx);
  const topic = typeof source.topic === 'string' && source.topic.trim() !== '' ? source.topic.trim() : undefined;
  return rawItems.map((it) => {
    const item = {
      url: String(it.url ?? '').trim(),
      title: String(it.title ?? '').trim(),
      date: it.date && it.date !== '' ? it.date : today,
      summary: truncateText(String(it.summary ?? '')),
      source: source.name,
      kind,
    };
    if (topic !== undefined) item.topic = topic;
    return item;
  });
}

export function maxResults(source, ctx) {
  const n = Number(source.max_results);
  if (Number.isInteger(n) && n > 0) return n;
  return ctx.maxResults;
}

// A feed whose root was recognised and that had item / entry blocks, none of which yielded a title
// and a link, is not "no new content": the address serves something we cannot read. That is a gap.
// A feed with zero blocks is a genuinely empty feed (returns null: carry on to finish -> empty).
export function unusableFeed(parsed, http) {
  if (parsed.items.length === 0 && parsed.blocks > 0) {
    return result('gap', `parsed ${parsed.blocks}, 0 usable (no block had both a title and a link)`, { http });
  }
  return null;
}

export function finish(items, http, parsedCount = items.length) {
  if (items.length > 0) return { status: 'ok', http, message: `${items.length} item(s)`, items };
  return { status: 'empty', http, message: parsedCount === 0 ? 'parsed fine, 0 items' : `parsed ${parsedCount}, 0 after filtering`, items: [] };
}
