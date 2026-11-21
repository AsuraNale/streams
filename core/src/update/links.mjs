// The links on a source's page (1.1 W5, handoff 改动五: 「以新出现的链接为准」; pretest 4). The code reads the sources on the
// card and keeps the links it saw; a link it has not seen before is new. Whether a new page is worth anything is the
// update agent's call, not this file's.
//
// linksOf(text, baseUrl) -> [absolute http(s) address]   from an HTML page (<a href>) or a feed (RSS <link>, Atom
//   <link href>), in the order they appear, each once; the page itself, anchors (#…), mailto:, javascript: and files that
//   are not pages (images, styles, scripts, fonts, archives) left out
// createLinkReader({ fetchImpl, render, userAgent, timeoutMs, minGapMs, now, sleep }) -> { read(url) }
//   read(url) -> { ok, url, finalUrl, http, links, method: 'direct' | 'render', reason? }
//   direct first; rendered when the direct page gave fewer than FEW_LINKS links (a page a script writes) or was refused
//   (401 / 403 / 407 / 451) — the same rules as reading a page (read/read-page.mjs): Streams' own identity, the same site at
//   most once every minGapMs, a sign-in page or a human check stops at once and is never touched.
import { USER_AGENT, DEFAULT_TIMEOUT_MS } from '../fetch/http.mjs';
import { humanCheck, signInPage } from '../read/detect.mjs';
import { MIN_GAP_MS } from '../read/read-page.mjs';

export const FEW_LINKS = 5;
const NOT_A_PAGE = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|woff2?|ttf|otf|eot|zip|gz|tar|7z|rar|mp3|mp4|webm|mov|avi)(\?|#|$)/i;
const REFUSED = [401, 403, 407, 451];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export function linksOf(text, baseUrl) {
  const src = String(text ?? '');
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const found = [];
  const add = (raw) => {
    const v = decode(raw);
    if (!v || v.startsWith('#') || /^(mailto|javascript|tel|data):/i.test(v)) return;
    let u;
    try { u = new URL(v, base); } catch { return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    u.hash = '';
    const href = u.href;
    if (NOT_A_PAGE.test(u.pathname)) return;
    if (href === base.href || href.replace(/\/$/, '') === base.href.replace(/#.*$/, '').replace(/\/$/, '')) return;
    found.push(href);
  };
  for (const m of src.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of src.matchAll(/<link\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    if (/\brel\s*=\s*["']?(stylesheet|icon|preload|preconnect|dns-prefetch|manifest|apple-touch-icon|canonical|alternate)/i.test(m[0]) && !/\brel\s*=\s*["']?alternate["']?[^>]*type\s*=\s*["']?text\/html/i.test(m[0])) continue;
    add(m[1] ?? m[2] ?? '');
  }
  for (const m of src.matchAll(/<link>\s*(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?\s*<\/link>/gi)) add(m[1]);
  return [...new Set(found)];
}

export function createLinkReader({ fetchImpl = globalThis.fetch, render = null, userAgent = USER_AGENT, timeoutMs = DEFAULT_TIMEOUT_MS, minGapMs = MIN_GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const lastAt = new Map();
  async function polite(host) {
    const last = lastAt.get(host);
    if (last !== undefined) { const wait = last + minGapMs - now(); if (wait > 0) await sleep(wait); }
    lastAt.set(host, now());
  }
  async function read(url) {
    let host;
    try { host = new URL(url).host; } catch { return { ok: false, url, finalUrl: url, http: null, links: [], method: null, reason: 'bad-url' }; }
    await polite(host);
    let direct = null;
    try {
      const res = await fetchImpl(url, { method: 'GET', headers: { 'user-agent': userAgent, accept: 'text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      direct = { status: res.status, finalUrl: res.url || url, text: await res.text() };
    } catch {
      return { ok: false, url, finalUrl: url, http: null, links: [], method: 'direct', reason: 'failed' };
    }
    if (humanCheck(direct.text)) return { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: 'check' };
    if (direct.status === 401 || signInPage(direct.text, direct.finalUrl)) return { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: 'login' };
    if (direct.status === 404 || direct.status === 410) return { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: 'dead' };
    const links = direct.status >= 200 && direct.status < 300 ? linksOf(direct.text, direct.finalUrl) : [];
    const refused = REFUSED.includes(direct.status);
    if ((links.length >= FEW_LINKS || !render) && !refused) {
      return direct.status >= 200 && direct.status < 300 ? { ok: true, url, finalUrl: direct.finalUrl, http: direct.status, links, method: 'direct' } : { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: 'failed' };
    }
    if (!render) return { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: 'blocked' };
    try {
      await polite(host);
      const r = await render(url, { userAgent, timeoutMs });
      if (humanCheck(r.html)) return { ok: false, url, finalUrl: r.finalUrl ?? url, http: r.status ?? null, links: [], method: 'render', reason: 'check' };
      if (signInPage(r.html, r.finalUrl ?? url)) return { ok: false, url, finalUrl: r.finalUrl ?? url, http: r.status ?? null, links: [], method: 'render', reason: 'login' };
      const rl = linksOf(r.html, r.finalUrl ?? url);
      const best = rl.length >= links.length ? rl : links;
      return { ok: best.length > 0 || !refused, url, finalUrl: r.finalUrl ?? url, http: r.status ?? direct.status, links: best, method: rl.length >= links.length ? 'render' : 'direct', ...(best.length === 0 && refused ? { reason: 'blocked' } : {}) };
    } catch {
      return links.length ? { ok: true, url, finalUrl: direct.finalUrl, http: direct.status, links, method: 'direct' } : { ok: false, url, finalUrl: direct.finalUrl, http: direct.status, links: [], method: 'direct', reason: refused ? 'blocked' : 'failed' };
    }
  }
  return { read };
}
