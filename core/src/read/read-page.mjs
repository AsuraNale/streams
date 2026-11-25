// Reading a page (1.1 W2, acceptance B5): three ways, in order, until one gives the article —
//   1. direct   one GET with Streams' own User-Agent (fetch/http.mjs). A PDF goes to 3; an HTML page that reads as an
//               article is done.
//   2. render   the page opened in a hidden browser window (the desktop's render service, given as `render`), for a page
//               whose text a script writes (direct gave no article) or one that refused the direct GET (401 / 403 / 407 /
//               451, or a refusal below HTTP).
//   3. pdf      the text of a PDF (the desktop's PDF reader, given as `pdfText`).
// Only when every way that applies fails is the page unreadable. Two answers stop at once, with no other way tried:
//   a human check (CAPTCHA) or a sign-in page -> reason 'check' / 'login': Streams marks it and touches nothing.
//   a dead address (404 / 410, or an error page once rendered) -> reason 'dead' (「地址失效」, not 「读不到」).
// A server saying "later" (408 / 429 / 5xx, a timeout, a network error) -> reason 'failed': tried again another time, not
// rendered now (rendering would only ask the same server again).
// Politeness: Streams' own identity on both ways; the same site is read at most once every minGapMs (default 2 s).
// No CAPTCHA is ever solved and no form is filled; the render service only loads the address and reads the page.
//
// createPageReader({ fetchImpl, render, pdfText, userAgent, timeoutMs, minGapMs, now, sleep }) -> { read(url) }
//   render(url, { userAgent, timeoutMs }) -> { status, finalUrl, title, html }      (throws when the page cannot be opened)
//   userAgent  a string, or (url) => string (1.1.1 P9, fetch/site-auth.mjs userAgentFor: a site of the list gets the user's
//              contact; redirects are then followed one hop at a time, each with its own address's User-Agent)
//   pdfText(bytes: Uint8Array) -> string                                            (throws when it is not a PDF it can read)
// read(url) -> { url, finalUrl, ok, method: 'direct'|'render'|'pdf'|null, title, text, paragraphs, http, reason, tried, message }
//   reason (when not ok): 'dead' | 'blocked' | 'login' | 'check' | 'failed' | 'no-article'
import { USER_AGENT, DEFAULT_TIMEOUT_MS, checkUrl } from '../fetch/http.mjs';
import { fetchAs } from '../fetch/site-auth.mjs';
import { classifyError } from '../fetch/states.mjs';
import { extractOriginal, ARTICLE_MIN } from './extract.mjs';
import { errorPage, humanCheck, signInPage } from './detect.mjs';

export const READ_REASONS = Object.freeze(['dead', 'blocked', 'login', 'check', 'failed', 'no-article']);
export const MIN_GAP_MS = 2000;
export const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT_PAGE = 'text/html, application/xhtml+xml, application/pdf;q=0.9, */*;q=0.5';
const DEAD_HTTP = [404, 410];
const REFUSED_HTTP = [401, 403, 407, 451];

const isPdf = (type, bytes) => /application\/(x-)?pdf/i.test(type ?? '')
  || (bytes && bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d);

export function createPageReader({
  fetchImpl = globalThis.fetch, render = null, pdfText = null, userAgent = USER_AGENT, timeoutMs = DEFAULT_TIMEOUT_MS,
  minGapMs = MIN_GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const lastAt = new Map();
  async function polite(host) {
    const last = lastAt.get(host);
    if (last !== undefined) {
      const wait = last + minGapMs - now();
      if (wait > 0) await sleep(wait);
    }
    lastAt.set(host, now());
  }

  async function direct(href) {
    try {
      const { res, finalUrl } = await fetchAs(fetchImpl, href, { userAgent, accept: ACCEPT_PAGE, timeoutMs });
      const type = res.headers.get('content-type') ?? '';
      const buf = new Uint8Array(await res.arrayBuffer());
      const bytes = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
      return { ok: true, status: res.status, finalUrl, type, bytes };
    } catch (error) {
      return { ok: false, error };
    }
  }

  // an HTML page, from either way: stop at a check or a sign-in page, a dead address for an error page, else the article
  function judgeHtml(html, finalUrl, method) {
    if (humanCheck(html)) return { stop: 'check', message: 'the page asks to prove a person is there (a human check); not touched' };
    if (signInPage(html, finalUrl)) return { stop: 'login', message: 'the page asks to sign in; not touched' };
    const o = extractOriginal(html);
    if (errorPage({ title: o.title, text: o.text || stripText(html) })) return { stop: 'dead', message: 'the page says it does not exist' };
    if (o.way !== 'none' && Array.from(o.text).length >= ARTICLE_MIN) return { read: { method, title: o.title, text: o.text, paragraphs: o.paragraphs } };
    return { none: true, title: o.title };
  }

  async function read(url) {
    const out = { url, finalUrl: url, ok: false, method: null, title: '', text: '', paragraphs: [], http: null, reason: null, tried: [], message: '' };
    const fail = (reason, message) => Object.assign(out, { ok: false, reason, message });
    let parsed;
    try { parsed = checkUrl(url); } catch (e) { return fail('dead', e.message); }
    const host = parsed.host.toLowerCase();

    await polite(host);
    out.tried.push('direct');
    const d = await direct(parsed.href);
    let refused = false;
    if (!d.ok) {
      const c = classifyError(d.error);
      if (c.state === 'gap') return fail('dead', c.message);
      if (c.state !== 'blocked') return fail('failed', c.message);
      refused = true;
      out.message = c.message;
    } else {
      out.http = d.status;
      out.finalUrl = d.finalUrl;
      if (DEAD_HTTP.includes(d.status)) return fail('dead', `HTTP ${d.status}`);
      if (d.status === 401) return fail('login', 'HTTP 401: the site asks to sign in; not touched');
      if (REFUSED_HTTP.includes(d.status)) {
        refused = true;
        // a refusal that is a human check (a challenge page sent with 403) or a sign-in page: stop here, not rendered
        const body = new TextDecoder('utf-8').decode(d.bytes);
        if (humanCheck(body)) return fail('check', `HTTP ${d.status}: the page asks to prove a person is there (a human check); not touched`);
        if (signInPage(body, d.finalUrl)) return fail('login', `HTTP ${d.status}: the page asks to sign in; not touched`);
      } else if (d.status < 200 || d.status >= 300) return fail('failed', `HTTP ${d.status}`);
      else if (isPdf(d.type, d.bytes)) {
        out.tried.push('pdf');
        if (typeof pdfText !== 'function') return fail('no-article', 'a PDF, and no PDF reader here');
        let text = '';
        try { text = String(await pdfText(d.bytes) ?? '').replace(/[ \t]+\n/g, '\n').trim(); } catch (e) { return fail('no-article', `the PDF gave no text: ${e?.message ?? e}`); }
        if (Array.from(text).length < ARTICLE_MIN) return fail('no-article', 'the PDF has (almost) no text in it, perhaps scanned pages');
        const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
        return Object.assign(out, { ok: true, method: 'pdf', text: paragraphs.join('\n\n'), paragraphs, title: '', reason: null, message: '' });
      } else {
        const j = judgeHtml(new TextDecoder('utf-8').decode(d.bytes), d.finalUrl, 'direct');
        if (j.read) return Object.assign(out, { ok: true, ...j.read, reason: null, message: '' });
        if (j.stop) return fail(j.stop, j.message);
        out.title = j.title;
        out.message = 'no article in the page as it was sent';
      }
      if (refused) out.message = `HTTP ${d.status}: refused`;
    }
    // 401 is a sign-in (above); a refusal or a page with no article is tried once more, rendered

    if (typeof render !== 'function') return fail(refused ? 'blocked' : 'no-article', out.message);
    await polite(host);
    out.tried.push('render');
    let r;
    try { r = await render(parsed.href, { userAgent: typeof userAgent === 'function' ? userAgent(parsed.href) : userAgent, timeoutMs }); } catch (e) {
      return fail(refused ? 'blocked' : 'no-article', `${out.message}; rendering failed: ${e?.message ?? e}`);
    }
    if (r?.finalUrl) out.finalUrl = r.finalUrl;
    if (DEAD_HTTP.includes(r?.status)) return fail('dead', `HTTP ${r.status} (rendered)`);
    const j = judgeHtml(String(r?.html ?? ''), out.finalUrl, 'render');
    if (j.read) return Object.assign(out, { ok: true, ...j.read, title: j.read.title || r?.title || '', reason: null, message: '' });
    if (j.stop) return fail(j.stop, `${j.message} (rendered)`);
    return fail(refused ? 'blocked' : 'no-article', `${out.message}; no article once rendered either`);
  }

  return { read };
}

function stripText(html) {
  return String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
