// fetchSource(source, ctx) -> { source, kind, status, hint, http?, message, retryAfterSeconds?, items }
//
// Pure in the sense that matters: it touches the network and nothing on disk, so the desktop can
// use it for "try this source" before saving the configuration. Never throws: an unknown kind is a
// `gap` (a configuration problem), a bug inside a fetcher is a `failed` (so one source can never
// sink the round).
import { isPlainObject } from '../library/frontmatter.mjs';
import { makeContext } from './context.mjs';
import { hintOf } from './states.mjs';
import { fetchRss } from './sources/rss.mjs';
import { fetchArxiv } from './sources/arxiv.mjs';
import { fetchHn } from './sources/hn.mjs';

const DISPATCH = { rss: fetchRss, arxiv: fetchArxiv, hn: fetchHn };
export const SOURCE_KINDS = Object.keys(DISPATCH);

export function sourceName(source) {
  if (!isPlainObject(source)) return '?';
  for (const k of ['name', 'url', 'query']) {
    if (typeof source[k] === 'string' && source[k].trim() !== '') return source[k].trim();
  }
  return '?';
}

function shape(name, kind, r) {
  const out = { source: name, kind, status: r.status, hint: hintOf(r.status) };
  if (r.http !== undefined) out.http = r.http;
  out.message = r.message ?? '';
  if (r.retryAfterSeconds !== undefined) out.retryAfterSeconds = r.retryAfterSeconds;
  out.items = Array.isArray(r.items) ? r.items : [];
  return out;
}

export async function fetchSource(source, ctx) {
  const name = sourceName(source);
  if (!isPlainObject(source)) return shape(name, '', { status: 'gap', message: 'source is not an object', items: [] });
  const kind = typeof source.kind === 'string' ? source.kind.trim().toLowerCase() : '';
  if (!Object.hasOwn(DISPATCH, kind)) {
    return shape(name, kind, { status: 'gap', message: `unknown kind "${kind}" (valid: ${SOURCE_KINDS.join(' / ')})`, items: [] });
  }
  const c = makeContext(ctx);
  try {
    const r = await DISPATCH[kind]({ ...source, name }, c);
    return shape(name, kind, r);
  } catch (e) {
    return shape(name, kind, { status: 'failed', message: `unexpected ${e?.name ?? 'Error'}: ${String(e?.message ?? e).slice(0, 160)}`, items: [] });
  }
}
