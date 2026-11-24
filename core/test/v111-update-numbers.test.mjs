// 1.1.1 P2 + P7 (docs/checks/2026-11-24-1.1.1/handoff/2026-11-24-v1.1.1-acceptance.md B20, B21, B22):
//   B20  numbers are checked by value — 161M is 1.61 亿, December 31 is 12 月 31 日; a wrong conversion, a wrong month, a number
//        the original does not have still fail
//   B21  the update agent is told the last update in local date and time (an evening update was already the next day in
//        UTC); a link that came later that same day is handed to it; what the library has (the card's samples too) does not
//        come back into 待看
//   B22  tracking parameters do not make a link new; one address is fetched once in an update
// The sources are pages of a server on 127.0.0.1 written here; the agent is a stand-in that answers from what it was given.
// Each check was run against the input that should fail it first (the old code, or a mutant: desktop/scripts has none for
// core — core/scripts/mutation-check.mjs v111-*).
process.env.TZ = 'America/Toronto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  runUpdate, createPageReader, createLinkReader, createLibrary, writeCard, listInbox, appendEvent, readUpdateState, writeUpdateState,
  missingNumbers, checkRule, cleanLink, localStamp, updateStateText as stateText, FIRST_LOOKBACK_DAYS,
} from '../src/index.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { caseDir } from './support/tmp.mjs';

// ---------- B20 ----------
test('B20: numbers by value — written differently, same value: found; converted wrongly, another month, not in the original: missing', () => {
  // positives (the acceptance's three, and the two of 11-24's Codex run)
  assert.deepEqual(missingNumbers('营收 1.61 亿美元', 'Revenue was $161M in the year.'), []);
  assert.deepEqual(missingNumbers('约 8570 万个 token', 'about 85.7M tokens'), []);
  assert.deepEqual(missingNumbers('12 月 31 日截止', 'Applications close December 31, 2026.'), []);
  assert.deepEqual(missingNumbers('1.61 亿人', 'served 161,000,000 people'), []);
  assert.deepEqual(missingNumbers('10K 次', 'about 10,000 calls'), []);
  assert.deepEqual(missingNumbers('快 3 倍', '3x faster than before'), []);
  // negatives: each must stay missing
  assert.deepEqual(missingNumbers('营收 16.1 亿美元', 'Revenue was $161M in the year.'), ['16.1亿']);
  assert.deepEqual(missingNumbers('5 月开放', 'Applications open in March.'), ['5']);
  assert.deepEqual(missingNumbers('增长 30%', 'grew 3% and then 13%'), ['30%']);
  // a percentage is never a scaled amount (30% is not 0.3, not 30)
  assert.deepEqual(missingNumbers('增长 30%', 'the 30 largest firms'), ['30%']);
  // through the rule the check uses (W3's numbers_in_original), on a summary's what and points
  const summary = { what: '一家公司去年营收 1.61 亿美元。', points: [{ text: '12 月 31 日截止', quote: 'x' }] };
  const original = { text: 'Revenue was $161M last year. Applications close December 31.', title: '' };
  assert.equal(checkRule('numbers_in_original:what,points', summary, { original }).passed, true);
  assert.equal(checkRule('numbers_in_original:what,points', { ...summary, what: '去年营收 16.1 亿美元。' }, { original }).passed, false);
});

// ---------- the pages ----------
const sentence = (topic, n) => `${topic} 第 ${n} 段：这一段写的是 ${topic} 的具体内容，有足够多的字让它成为一段真的正文，截止日期写在官方页上。`;
const article = (title, topic) => `<html><head><title>${title}</title></head><body><article><h1>${title}</h1>${[1, 2, 3, 4].map((n) => `<p>${sentence(topic, n)}</p>`).join('')}</article></body></html>`;
const listPage = (links) => `<html><head><title>列表</title></head><body><ul>${links.map((l) => `<li><a href="${l}">${l}</a></li>`).join('')}</ul></body></html>`;
let server;
let base;
const hits = [];
const site = { list: ['/p/a1', '/p/a2'], other: ['/q/z1'], pages: {} };
before(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname + u.search);
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    if (u.pathname === '/list') return send(200, listPage(site.list));
    if (u.pathname === '/other') return send(200, listPage(site.other));
    if (site.pages[u.pathname]) return send(200, site.pages[u.pathname]);
    return send(404, 'no');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const p of ['/p/a1', '/p/a2', '/q/z1', '/p/late', '/p/x', '/p/dup']) site.pages[p] = article(`页 ${p}`, `主题 ${p}`);
});
after(() => server.close());

const CARD = (sources) => ({
  name: '测试库',
  definition: { summary: '一座测试用的库。', purpose: '测试', scope: '对象：测试；行业：测试；地域：本机；规模：小', exclude: '无', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
  decide: [], collect: ['新项目'], skip: ['旧闻'], sources: sources.map((s, i) => ({ name: `来源 ${i + 1}`, url: `${base}${s}`, status: 'ok' })), unreadable: [],
  pick: ['新的先收'], write: ['写清要点'], samples: [{ title: '卡上的样例', url: `${base}/p/sample`, date: '2026-11-20' }],
});
function library(name, sources = ['/list']) {
  const dir = join(caseDir(name), 'lib');
  createLibrary(dir, { name: '测试库', language: 'zh-CN' });
  writeCard(dir, CARD(sources));
  return dir;
}
function agent(answer) {
  const prompts = [];
  return {
    prompts,
    async detect() { return { installed: true, loggedIn: true }; },
    async send(req) { prompts.push(req.prompt); const a = answer(req.prompt, prompts.length - 1) ?? { items: [] }; return { ok: true, json: a, text: JSON.stringify(a), sessionId: 's', reads: [], searches: [] }; },
  };
}
const itemFor = (path) => ({ url: `${base}${path}`, title: `新的 ${path}`, date: '2026-11-23', due: '', what: `主题 ${path} 的新项目。`, points: [1, 2, 3].map((n) => ({ text: `主题 ${path} 第 ${n} 段`, quote: sentence(`主题 ${path}`, n) })), why: '在卡的范围里' });
const judgeAllPass = () => fakeConnector({ mode: 'counting', json: (req) => ({ items: [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map((m) => ({ id: m[1], passed: true, evidence: 'ok' })) }) });
const urlsInNew = (prompt) => [...prompt.slice(prompt.indexOf('## 新取回的原文'), prompt.indexOf('## 你能做的动作')).matchAll(/网址：(\S+)/g)].map((m) => m[1]);
const stateOf = (prompt) => prompt.slice(prompt.indexOf('## 这座库现在的情况'), prompt.indexOf('## 新取回的原文'));
const run = (dir, a, iso) => runUpdate(dir, { connector: a, judge: judgeAllPass(), readPage: createPageReader({ minGapMs: 0 }).read, readLinks: createLinkReader({ minGapMs: 0 }).read, now: () => new Date(iso), pendingDir: join(dir, '..', 'pending') });

// ---------- B21 ----------
test('B21: the last update in local date and time; a link that came later the same day goes to the agent; had items do not come back', async () => {
  const dir = library('b21');
  site.list = ['/p/a1', '/p/a2'];
  // the first update: 21:00 on 11-23 in Toronto, which is 02:00 on 11-24 in UTC
  const first = agent(() => ({ items: [] }));
  await run(dir, first, '2026-11-24T02:00:00.000Z');
  assert.match(stateOf(first.prompts[0]), new RegExp(`最近 ${FIRST_LOOKBACK_DAYS} 天`), 'the first update says how far back to look');
  // one item in the library already (kept), and later that evening a new link on the source
  appendEvent(dir, { ev: 'seen', url: `${base}/p/a2`, source: 'card', title: '页 /p/a2' });
  appendEvent(dir, { ev: 'kept', url: `${base}/p/a2`, id: 'kept-a2' });
  site.list = ['/p/a1', '/p/a2', '/p/late'];
  // the agent hands in the new page, the kept one again and the card's sample
  const second = agent(() => ({ items: [itemFor('/p/late'), itemFor('/p/a2'), { ...itemFor('/p/a1'), url: `${base}/p/sample` }] }));
  const r = await run(dir, second, '2026-11-24T13:30:00.000Z');
  const state = stateOf(second.prompts[0]);
  // the failing input first: the UTC date is 11-24; the agent must be told 11-23 21:00
  assert.equal(localStamp('2026-11-24T02:00:00.000Z'), '2026-11-23 21:00');
  assert.ok(state.includes('上次更新：2026-11-23 21:00（本地时间）'), state.slice(0, 300));
  assert.ok(!state.includes('上次更新：2026-11-24'), 'not the UTC date');
  assert.ok(state.includes('不要按日期排除'), 'the same day counts');
  assert.ok(state.includes('（建库卡上的样例）') && state.includes(`${base}/p/sample`), 'the agent is told the card\'s sample is had');
  assert.deepEqual(urlsInNew(second.prompts[0]), [`${base}/p/late`], 'the later link is handed to the agent');
  const inbox = listInbox(dir).map((c) => c.url);
  assert.deepEqual(inbox, [`${base}/p/late`], 'only the new one is in 待看');
  assert.deepEqual((r.record.dropped ?? []).map((d) => [d.url, d.why]).sort(), [[`${base}/p/a2`, 'already'], [`${base}/p/sample`, 'already']].sort());
});

// ---------- B22 ----------
test('B22: a tracking parameter does not make a link new — nor one kept with it by an earlier version; one address is fetched once', async () => {
  assert.equal(cleanLink('https://finviz.com/elite.ashx?utm_campaign=modal-0&utm_source=web&a=1#top'), 'https://finviz.com/elite.ashx?a=1');
  assert.equal(cleanLink('https://x.test/p?id=12&fbclid=abc'), 'https://x.test/p?id=12');
  assert.equal(cleanLink('https://x.test/p?ref=home'), 'https://x.test/p?ref=home', 'a parameter that may mean something stays');
  const dir = library('b22', ['/list', '/other']);
  site.list = ['/p/x?utm_campaign=modal-0'];
  site.other = ['/q/z1'];
  await run(dir, agent(() => ({ items: [] })), '2026-11-24T14:00:00.000Z');
  // an earlier version kept the link with its parameter (the state as 1.1.0 wrote it)
  const st = readUpdateState(dir);
  st.sources[`${base}/list`].seen = [`${base}/p/x?utm_campaign=modal-0`];
  writeUpdateState(dir, st);
  // the same page with another campaign; and one new page linked from both sources
  site.list = ['/p/x?utm_campaign=modal-1', '/p/dup'];
  site.other = ['/q/z1', '/p/dup?utm_source=feed'];
  hits.length = 0;
  const a = agent(() => ({ items: [] }));
  await run(dir, a, '2026-11-25T14:00:00.000Z');
  const handed = urlsInNew(a.prompts[0]);
  assert.deepEqual(handed, [`${base}/p/dup`], `one new link, once: ${handed.join(', ')}`);
  assert.equal(hits.filter((h) => h.startsWith('/p/dup')).length, 1, 'fetched once');
  assert.equal(hits.filter((h) => h.startsWith('/p/x')).length, 0, 'the same page with another campaign is not fetched');
});

test('stateText: no last update → the first-update line; a last update → local time, never the ISO date', () => {
  const s0 = stateText({ lastAgentAt: null, known: [], unfinished: [], sources: {}, sweep: 1 });
  assert.match(s0, /第一次更新：找最近 30 天/);
  const s1 = stateText({ lastAgentAt: '2026-11-24T02:00:00.000Z', known: [], unfinished: [], sources: {}, sweep: 0 });
  assert.match(s1, /上次更新：2026-11-23 21:00（本地时间）/);
});
