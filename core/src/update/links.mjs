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
import { fetchAs } from '../fetch/site-auth.mjs';
import { humanCheck, signInPage } from '../read/detect.mjs';
import { MIN_GAP_MS } from '../read/read-page.mjs';

export const FEW_LINKS = 5;
// 1.1.1 P7 (B22): parameters that only say where a click came from — the same page with another of them is the same page
const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|yclid|igshid|spm|share_source)$/i;

/** A link without its tracking parameters (and without #…); anything that is not an http(s) address comes back as it is. */
export function cleanLink(href) {
  let u;
  try { u = new URL(String(href)); } catch { return String(href); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return String(href);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u.href;
}
const NOT_A_PAGE = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|woff2?|ttf|otf|eot|zip|gz|tar|7z|rar|mp3|mp4|webm|mov|avi)(\?|#|$)/i;
const REFUSED = [401, 403, 407, 451];

// 1.1.2 (U1): a link on a source's page that looks like one of its articles — the same site (www. and a sub-site of it count),
// under the folder of the source's own address, a path with something in it (not the site's front page, not the source
// itself), no part of it a page every site has (about, pricing, sign-in, tags, a list's next page …), and its last part a
// name rather than a word (a hyphen, a digit, or 6 letters and more). A guess from the address alone; the update agent
// still decides what an item is.
const NAV = new Set(['about', 'about-us', 'contact', 'contact-us', 'pricing', 'plans', 'login', 'log-in', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'account', 'cart', 'checkout', 'privacy', 'privacy-policy', 'terms', 'legal', 'cookie', 'cookies', 'careers', 'jobs', 'help', 'support', 'faq', 'search', 'subscribe', 'newsletter', 'rss', 'feed', 'tag', 'tags', 'category', 'categories', 'topic', 'topics', 'author', 'authors', 'user', 'users', 'page', 'static', 'assets', 'cdn-cgi', 'wp-login.php', 'wp-admin']);
const site = (h) => h.toLowerCase().replace(/^www\./, '');
export function articleLike(href, sourceUrl) {
  let u;
  let s;
  try { u = new URL(String(href)); s = new URL(String(sourceUrl)); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const a = site(u.hostname);
  const b = site(s.hostname);
  if (a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`)) return false;
  const path = u.pathname.replace(/\/+$/, '');
  if (path === '' || path === s.pathname.replace(/\/+$/, '')) return false;
  const folder = s.pathname.endsWith('/') ? s.pathname : s.pathname.replace(/[^/]*$/, '');
  if (!`${path}/`.startsWith(folder) && !path.startsWith(s.pathname.replace(/\/+$/, '') + '/')) return false;
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p).toLowerCase(); } catch { return p.toLowerCase(); } });
  if (parts.some((p) => NAV.has(p))) return false;
  if ([...u.searchParams.keys()].some((k) => /^(page|p|sort|order|filter|lang)$/i.test(k))) return false;
  const last = parts[parts.length - 1];
  if (/\.(?!html?$|php$|aspx?$)[a-z0-9]{2,5}$/i.test(last)) return false;
  return /[-_\d]/.test(last) || last.length >= 6 || (/[^\x00-\x7f]/.test(last) && last.length >= 2);
}

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
    const href = cleanLink(u.href);
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
      // 1.1.1 P9: userAgent may be (url) => string (fetch/site-auth.mjs): the contact only to a site of the list, hop by hop
      const { res, finalUrl } = await fetchAs(fetchImpl, url, { userAgent, accept: 'text/html, application/xhtml+xml, application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5', timeoutMs });
      direct = { status: res.status, finalUrl, text: await res.text() };
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
      const r = await render(url, { userAgent: typeof userAgent === 'function' ? userAgent(url) : userAgent, timeoutMs });
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
