// _pipeline/cache/<sha1(url)>.json { url, ts, text }: the fetched body of an item (product spec 4.5 step 4).
// The body is material for gate 2 and the summary only; it is never written into a note.
//
// fetchBody(url, ctx, { libraryDir, bodyMaxChars, now })
//   -> { ok: true, text, cached }           text = extractArticle(html) cut to bodyMaxChars (a cache hit makes no request)
//   -> { ok: false, reason }                 reason: 'bad-url' | 'http:<status>' | 'network' | 'empty' | 'title-only'
//                                            (title-only: an aggregator's link, html.mjs titleOnlyHost; no request made)
// readCachedBody(libraryDir, url)  -> text | null
// cleanCache(libraryDir, { days, now }) -> { removed }   deletes cache files whose ts is older than `days`
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getText } from '../../src/fetch/http.mjs';
import { extractArticle, titleOnlyHost, truncateText } from '../../src/fetch/html.mjs';
import { makeContext } from '../fetch/context.mjs';

export const CACHE_DIR = join('_pipeline', 'cache');

export function cacheKey(url) {
  return createHash('sha1').update(String(url)).digest('hex');
}

export function cachePath(libraryDir, url) {
  return join(libraryDir, CACHE_DIR, `${cacheKey(url)}.json`);
}

export function readCachedBody(libraryDir, url) {
  const path = cachePath(libraryDir, url);
  if (!existsSync(path)) return null;
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return typeof j.text === 'string' && j.text !== '' ? j.text : null;
  } catch {
    return null;
  }
}

export async function fetchBody(url, ctx, { libraryDir, bodyMaxChars = 6000, now } = {}) {
  const c = makeContext(ctx);
  const clock = typeof now === 'function' ? now : c.now;
  if (libraryDir) {
    const hit = readCachedBody(libraryDir, url);
    if (hit !== null) return { ok: true, text: truncateText(hit, bodyMaxChars), cached: true };
  }
  // an aggregator's own page (html.mjs titleOnlyHost): no request, the item is judged on its title
  if (titleOnlyHost(url)) return { ok: false, reason: 'title-only' };
  const r = await getText(url, { fetchImpl: c.fetchImpl, timeoutMs: c.timeoutMs, userAgent: c.userAgent });
  if (!r.ok) return { ok: false, reason: r.error?.code === 'bad-url' ? 'bad-url' : 'network' };
  if (r.status < 200 || r.status >= 300) return { ok: false, reason: `http:${r.status}` };
  // 11-18 proposal P1: the article's own words (html.mjs extractArticle), not the whole page with its menus
  const text = truncateText(extractArticle(r.text), bodyMaxChars);
  if (text === '') return { ok: false, reason: 'empty' };
  if (libraryDir) {
    mkdirSync(join(libraryDir, CACHE_DIR), { recursive: true });
    writeFileSync(cachePath(libraryDir, url), JSON.stringify({ url, ts: clock().toISOString(), text }) + '\n', 'utf8');
  }
  return { ok: true, text, cached: false };
}

export function cleanCache(libraryDir, { days = 7, now = () => new Date() } = {}) {
  const dir = join(libraryDir, CACHE_DIR);
  if (!existsSync(dir)) return { removed: 0 };
  const cutoff = now().getTime() - days * 86_400_000;
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const path = join(dir, f);
    let ts = NaN;
    try {
      ts = Date.parse(JSON.parse(readFileSync(path, 'utf8')).ts);
    } catch {
      ts = NaN;
    }
    if (Number.isNaN(ts) || ts < cutoff) {
      unlinkSync(path);
      removed += 1;
    }
  }
  return { removed };
}
