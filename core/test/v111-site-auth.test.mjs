// 1.1.1 P9 「来源授权」 (docs/checks/2026-11-24-1.1.1/p9/scorecard.json; acceptance B24), on two real servers of this machine:
//   甲 on 127.0.0.1 — of the list in these tests (sites: hosts ['127.0.0.1']): 403 to a request without the contact, the
//      page to one with it
//   乙 on localhost — not of the list: whatever it is asked, the contact must never be in the headers it receives, also
//      when 甲 sends the reader there (a redirect)
// and the list that comes with the app (sec.gov only): www.sec.gov gets the contact, a look-alike host does not.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPageReader } from '../src/read/read-page.mjs';
import { createLinkReader } from '../src/update/links.mjs';
import { SITE_AUTH, siteOf, isContact, userAgentFor } from '../src/fetch/site-auth.mjs';
import { USER_AGENT } from '../src/fetch/http.mjs';

const CONTACT = 'reader@example.com';
const para = (n) => `这是第 ${n} 段：一份公告的正文，写了公司名称、提交日期、文件编号和要点，足够长，读得出是一篇文章而不是导航页。`;
const ARTICLE = `<html><head><title>公告</title></head><body><article><h1>公告</h1>${[1, 2, 3, 4, 5, 6].map((n) => `<p>${para(n)}</p>`).join('')}</article></body></html>`;

function serve(host, handler) {
  const seen = [];
  const server = createServer((req, res) => { seen.push({ path: req.url, ua: req.headers['user-agent'] ?? '', all: JSON.stringify(req.headers) }); handler(req, res); });
  return new Promise((resolve) => server.listen(0, host, () => resolve({ server, seen, port: server.address().port })));
}

const B = await serve('::', (req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(ARTICLE); });
const bBase = `http://localhost:${B.port}`;
const A = await serve('127.0.0.1', (req, res) => {
  if (!String(req.headers['user-agent'] ?? '').includes(CONTACT)) { res.writeHead(403, { 'content-type': 'text/html' }); res.end('<html><body><p>Undeclared automated tool. Please declare your traffic by updating your user agent to include company specific information.</p></body></html>'); return; }
  if (req.url === '/away') { res.writeHead(302, { location: `${bBase}/landed` }); res.end(); return; }
  if (req.url === '/list') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><body>${[1, 2, 3, 4, 5, 6].map((n) => `<a href="/filing/${n}">filing ${n}</a>`).join(' ')}</body></html>`); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(ARTICLE);
});
const aBase = `http://127.0.0.1:${A.port}`;
after(() => { A.server.close(); B.server.close(); });

const SITES = [{ id: 'test', hosts: ['127.0.0.1'], needs: 'contact', name: { zh: '甲', en: 'A' }, why: { zh: '', en: '' } }];
const reader = (contact) => createPageReader({ userAgent: userAgentFor({ contact, sites: SITES }), minGapMs: 0 });
const contactIn = (seen) => seen.some((r) => r.all.includes(CONTACT));

test('the list: sec.gov and its subdomains, nothing else; a contact is an e-mail address', () => {
  assert.deepEqual(SITE_AUTH.map((s) => [s.id, s.hosts]), [['sec', ['sec.gov']]]);
  assert.equal(siteOf('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent')?.id, 'sec');
  assert.equal(siteOf('https://sec.gov/')?.id, 'sec');
  assert.equal(siteOf('https://efts.sec.gov/LATEST/search-index')?.id, 'sec');
  for (const other of ['https://notsec.gov/', 'https://sec.gov.example.com/', 'https://example.org/?u=sec.gov', 'not a url']) assert.equal(siteOf(other), null, other);
  assert.equal(isContact(CONTACT), true);
  for (const bad of ['', 'reader', 'reader@', 'a b@example.com', 'reader@example', null]) assert.equal(isContact(bad), false, String(bad));
  const ua = userAgentFor({ contact: CONTACT });
  assert.equal(ua('https://www.sec.gov/Archives/edgar/data/1/x.htm'), `${USER_AGENT} ${CONTACT}`);
  assert.equal(ua('https://example.org/'), USER_AGENT);
  assert.equal(userAgentFor({ contact: '' })('https://www.sec.gov/'), USER_AGENT, 'nothing filled in: nothing sent');
  assert.equal(userAgentFor({ contact: 'not an address' })('https://www.sec.gov/'), USER_AGENT);
});

test('甲 of the list: no contact → refused (403, 「读不到」); the contact filled in → read', async () => {
  const before = A.seen.length;
  const no = await reader(null).read(`${aBase}/filing/1`);
  assert.equal(no.ok, false);
  assert.equal(no.http, 403);
  assert.equal(no.reason, 'blocked');
  assert.equal(contactIn(A.seen.slice(before)), false);
  const yes = await reader(CONTACT).read(`${aBase}/filing/1`);
  assert.equal(yes.ok, true, yes.message);
  assert.equal(yes.method, 'direct');
  assert.match(yes.text, /第 1 段/);
  assert.equal(A.seen.at(-1).ua, `${USER_AGENT} ${CONTACT}`);
  // its page of links too
  const links = await createLinkReader({ userAgent: userAgentFor({ contact: CONTACT, sites: SITES }), minGapMs: 0 }).read(`${aBase}/list`);
  assert.equal(links.ok, true);
  assert.equal(links.links.length, 6);
});

test('乙 not of the list never receives the contact — read directly, through its links, or sent there by 甲', async () => {
  const before = B.seen.length;
  const r = await reader(CONTACT).read(`${bBase}/page`);
  assert.equal(r.ok, true, r.message);
  await createLinkReader({ userAgent: userAgentFor({ contact: CONTACT, sites: SITES }), minGapMs: 0 }).read(`${bBase}/list`);
  // 甲 (with the contact) answers with a redirect to 乙: the hop to 乙 goes without it
  const aBefore = A.seen.length;
  const moved = await reader(CONTACT).read(`${aBase}/away`);
  assert.equal(moved.ok, true, moved.message);
  assert.equal(moved.finalUrl, `${bBase}/landed`);
  assert.equal(A.seen[aBefore].ua, `${USER_AGENT} ${CONTACT}`, '甲 got it');
  const got = B.seen.slice(before);
  assert.deepEqual(got.map((x) => x.path), ['/page', '/list', '/landed']);
  assert.equal(contactIn(got), false, JSON.stringify(got));
  assert.ok(got.every((x) => x.ua === USER_AGENT));
});
