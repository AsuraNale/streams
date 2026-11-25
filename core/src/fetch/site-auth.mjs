// 1.1.1 P9 (acceptance B24; plan 第五节第 4 件, 维护者 11-24 晚「标明对应网站」): sites that let a program read them only when it
// says who runs it — a contact e-mail in its User-Agent. The list comes with the app; the user fills one contact in 设置
// (「来源授权」), shared by every library; Streams sends it to the sites of the list and to no other.
//
// SITE_AUTH: [{ id, hosts, needs: 'contact', name: { zh, en }, why: { zh, en } }]   the first list: sec.gov only
// siteOf(url, sites = SITE_AUTH) -> the entry whose host is the address's host or a parent of it (www.sec.gov → sec.gov), or null
// isContact(text) -> an e-mail address (what SEC asks for: 「Sample Company Name AdminContact@<sample company domain>.com」)
// userAgentFor({ contact, sites, base }) -> (url) => string   the User-Agent of a request to `url`: Streams' own, with the
//   contact after it only for a site of the list (and only when one is filled in)
// fetchAs(fetchImpl, url, { userAgent, accept, timeoutMs }) -> { res, finalUrl }   one GET; when the User-Agent depends on the
//   address (a function), redirects are followed here one hop at a time (at most MAX_HOPS), each hop with the User-Agent of
//   its own address — a site of the list that sends the reader elsewhere does not pass the contact on
import { USER_AGENT } from './http.mjs';

export const SITE_AUTH = Object.freeze([
  Object.freeze({
    id: 'sec',
    hosts: Object.freeze(['sec.gov']),
    needs: 'contact',
    name: Object.freeze({ zh: 'SEC（美国证券交易委员会）· sec.gov', en: 'SEC (U.S. Securities and Exchange Commission) · sec.gov' }),
    why: Object.freeze({ zh: '要求自动访问的程序留联系邮箱，不留就拒绝（EDGAR 的公告、文件都在这里）', en: 'asks programs that read it to leave a contact e-mail, and turns them away without one (EDGAR filings are here)' }),
  }),
]);

export const MAX_HOPS = 5;

export function siteOf(url, sites = SITE_AUTH) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return null; }
  return sites.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

export function isContact(text) {
  return typeof text === 'string' && text.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/.test(text.trim());
}

export function userAgentFor({ contact = null, sites = SITE_AUTH, base = USER_AGENT } = {}) {
  const c = isContact(contact) ? contact.trim() : null;
  return (url) => (c && siteOf(url, sites) ? `${base} ${c}` : base);
}

const isRedirect = (s) => s === 301 || s === 302 || s === 303 || s === 307 || s === 308;

export async function fetchAs(fetchImpl, url, { userAgent = USER_AGENT, accept = '*/*', timeoutMs = 20_000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  if (typeof userAgent !== 'function') {
    const res = await fetchImpl(url, { method: 'GET', headers: { 'user-agent': userAgent, accept }, redirect: 'follow', signal });
    return { res, finalUrl: res.url || url };
  }
  let href = url;
  for (let hop = 0; ; hop += 1) {
    const res = await fetchImpl(href, { method: 'GET', headers: { 'user-agent': userAgent(href), accept }, redirect: 'manual', signal });
    const to = isRedirect(res.status) ? res.headers.get('location') : null;
    if (!to || hop >= MAX_HOPS) return { res, finalUrl: href };
    try { await res.arrayBuffer(); } catch { /* the body of a redirect is not read */ }
    href = new URL(to, href).href;
  }
}
