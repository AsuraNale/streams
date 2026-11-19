// 11-18 pipeline fixes (docs/feedback/2026-11-18-rewrite-ab-test.md, 维护者 「先修流水线再测」):
//   P1  the body is the article's own words (fetch/html.mjs extractArticle), not the whole page with its menus
//   D2  an aggregator's link (news.google.com) is not fetched: the item is judged on its title, the card says so
//   M4  an item dated before the library's age limit (pipeline.maxAgeDays, default 7) is not taken in
// Every case below was run against the code before the fix and failed there (docs/checks/2026-11-18-pipeline-fix/evidence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractArticle, stripHtml, titleOnlyHost, ARTICLE_MIN } from '../src/fetch/html.mjs';
import { makeContext } from '../src/fetch/context.mjs';
import { fetchRound, ageCutoff } from '../src/fetch/round.mjs';
import { fetchBody } from '../src/pipeline/cache.mjs';
import { materialBlock, gatePrompt, summaryPrompt } from '../src/pipeline/prompts.mjs';
import { pipelineFrom, DEFAULTS } from '../src/pipeline/config.mjs';
import { runRound } from '../src/pipeline/round.mjs';
import { listInbox } from '../src/pipeline/inbox.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';
import { rssWith } from './support/feeds.mjs';
import { startFakeServer } from './support/fake-server.mjs';

const MENU = 'Home Markets Politics Opinion Sign in Subscribe Newsletters Podcasts Video Sections Search Menu Close';
const P1 = 'The Bank of Canada held its policy rate at 2.25 per cent on Wednesday, citing slower growth in the third quarter.';
const P2 = 'Governor Tiff Macklem said the bank would watch rent inflation in Ontario closely before the next decision in December.';
const P3 = 'Economists had expected the hold; two of fifteen surveyed forecast a cut, and none expected an increase this year.';

// ---------- P1: extractArticle ----------

test('P1 extractArticle: a page whose menu comes first gives the article paragraphs, not the menu', () => {
  const html = `<html><head><title>t</title><script>var x = 1</script></head><body>
    <header><nav><ul>${MENU.split(' ').map((w) => `<li><a href="/${w}">${w}</a></li>`).join('')}</ul></nav></header>
    <article><h1>Rate held</h1><p>${P1}</p><p>${P2}</p><p>${P3}</p></article>
    <footer><p>Copyright 2026 Example News Corporation. All rights reserved. Terms of use and privacy policy.</p></footer></body></html>`;
  const text = extractArticle(html);
  assert.ok(text.startsWith(P1), text.slice(0, 120));
  assert.ok(text.includes(P3));
  assert.ok(!text.includes('Subscribe'), 'the menu is not in the body');
  assert.ok(!text.includes('Copyright'), 'the footer is not in the body');
  // what 1.0.1 gave for the same page: the menu first (the failing case of 11-18)
  assert.ok(stripHtml(html).indexOf('Subscribe') < stripHtml(html).indexOf(P1.slice(0, 20)));
});

test('P1 extractArticle: no <article>: the page paragraphs outside nav / header / footer / aside / form', () => {
  const html = `<body><div class="top"><nav><p>${MENU} ${MENU}</p></nav></div>
    <div class="story"><p>${P1}</p><p>short</p><p>${P2}</p><p>${P3}</p></div>
    <aside><p>Most read: ten things you need to know about the housing market this week and more</p></aside>
    <form><p>Sign up for our newsletter to get the latest headlines delivered every morning</p></form></body>`;
  const text = extractArticle(html);
  assert.equal(text, [P1, P2, P3].join(' '));
});

test('P1 extractArticle: JSON-LD articleBody wins when it is long enough', () => {
  const body = `${P1} ${P2} ${P3}`;
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'NewsArticle', articleBody: body }] })}</script></head>
    <body><nav>${MENU}</nav><p>A teaser paragraph that is long enough to count as a paragraph on its own here.</p></body></html>`;
  assert.equal(extractArticle(html), body);
});

test('P1 extractArticle: nothing long enough → the whole page through stripHtml, as before; never throws', () => {
  const html = '<html><body><nav>Home</nav><p>Just a line.</p></body></html>';
  assert.equal(extractArticle(html), stripHtml(html));
  assert.equal(extractArticle(''), '');
  assert.equal(extractArticle(undefined), '');
  const broken = '<script type="application/ld+json">{not json</script><p>' + 'x'.repeat(ARTICLE_MIN) + '</p>';
  assert.equal(extractArticle(broken), 'x'.repeat(ARTICLE_MIN));
});

test('P1 fetchBody: the body it caches is the article, not the menu', async () => {
  const dir = makeLibrary('fix1118-body');
  const page = `<body><nav>${MENU}</nav><article><p>${P1}</p><p>${P2}</p></article></body>`;
  const ctx = makeContext({ fetchImpl: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }) });
  const b = await fetchBody('https://example.com/story', ctx, { libraryDir: dir });
  assert.equal(b.ok, true);
  assert.equal(b.text, `${P1} ${P2}`);
});

// ---------- D2: news.google.com is title-only ----------

test('D2 titleOnlyHost: news.google.com (and its subdomains) only', () => {
  assert.equal(titleOnlyHost('https://news.google.com/rss/articles/CBMiabc?oc=5'), 'news.google.com');
  assert.equal(titleOnlyHost('https://NEWS.GOOGLE.COM/x'), 'news.google.com');
  assert.equal(titleOnlyHost('https://www.google.com/search?q=x'), null);
  assert.equal(titleOnlyHost('https://notnews.google.com.example.org/x'), null);
  assert.equal(titleOnlyHost('not a url'), null);
});

test('D2 fetchBody: a news.google.com link makes no request and says title-only', async () => {
  const seen = [];
  const ctx = makeContext({ fetchImpl: async (u) => { seen.push(u); return new Response('<p>Google News</p>', { status: 200 }); } });
  const b = await fetchBody('https://news.google.com/rss/articles/CBMiabc?oc=5', ctx, {});
  assert.deepEqual(b, { ok: false, reason: 'title-only' });
  assert.equal(seen.length, 0);
});

test('D2 prompts: the material block says title only (zh and en); other materials unchanged', () => {
  const item = { title: 'Canadian dollar falls below 70 cents U.S.', source: 'gnews', date: '2026-11-17', summary: 'Canadian dollar falls below 70 cents U.S. Financial Post' };
  const zh = materialBlock({ item, body: null, language: 'zh-CN', materials: 'title-only' });
  assert.match(zh, /只有标题（/);
  assert.ok(zh.includes(item.summary));
  assert.doesNotMatch(zh, /正文取不到，只看了摘要/);
  assert.match(materialBlock({ item, body: null, language: 'en', materials: 'title-only' }), /Title only \(/);
  assert.match(materialBlock({ item, body: null, language: 'zh-CN' }), /正文取不到，只看了摘要/);
  const node = { requirement: 'r', output: { substance: 'score', reason: 'text', quote: 'text' } };
  assert.match(gatePrompt({ node, item, body: null, materials: 'title-only', language: 'zh-CN' }), /只有标题（/);
  assert.match(summaryPrompt({ node: { requirement: 'r', output: { what: 'text', points: 'list:3', quote: 'text' } }, item, body: null, materials: 'title-only', language: 'en' }), /Title only \(/);
});

// ---------- M4: age limit ----------

test('M4 ageCutoff: 7 days back from the local day; 0 or nonsense = no limit', () => {
  assert.equal(ageCutoff(new Date(2026, 10, 18, 9, 0), 7), '2026-11-11');
  assert.equal(ageCutoff(new Date(2026, 10, 18, 23, 59), 7), '2026-11-11');
  assert.equal(ageCutoff(new Date(2026, 2, 3, 12, 0), 7), '2026-02-24');
  assert.equal(ageCutoff(new Date(2026, 10, 18), 0), null);
  assert.equal(ageCutoff(new Date(2026, 10, 18), -1), null);
  assert.equal(ageCutoff(new Date(2026, 10, 18), '7'), null);
});

test('M4 pipeline config: maxAgeDays defaults to 7, a library may set 0', () => {
  assert.equal(DEFAULTS.maxAgeDays, 7);
  assert.equal(pipelineFrom({}).maxAgeDays, 7);
  assert.equal(pipelineFrom({ pipeline: { maxAgeDays: 0 } }).maxAgeDays, 0);
  assert.equal(pipelineFrom({ pipeline: { maxAgeDays: 30 } }).maxAgeDays, 30);
  assert.equal(pipelineFrom({ pipeline: { maxAgeDays: -3 } }).maxAgeDays, 7);
});

const NOW = new Date(2026, 10, 18, 12, 0, 0);
const AGED = [
  { title: 'Seven days back', url: 'https://example.com/a', date: 'Wed, 11 Nov 2026 08:00:00 GMT' },
  { title: 'Eight days back', url: 'https://example.com/b', date: 'Tue, 10 Nov 2026 08:00:00 GMT' },
  { title: 'No date at all', url: 'https://example.com/c' },
  { title: 'From February', url: 'https://example.com/d', date: '2026-02-03T10:00:00Z' },
];
const feedCtx = () => makeContext({ now: () => NOW, fetchImpl: async () => new Response(rssWith(AGED), { status: 200, headers: { 'content-type': 'application/rss+xml' } }) });
const CFG = { ...TEST_CONFIG, sources: [{ name: 'feed-a', kind: 'rss', url: 'https://example.com/feed', topic: 'agent 记忆', max_results: 100 }] };

test('M4 fetchRound: 7 days back is in, 8 is out, undated is in; the old ones are not registered and are counted', async () => {
  const dir = makeLibrary('fix1118-age', CFG);
  const r = await fetchRound(dir, { config: CFG, ctx: feedCtx(), maxAgeDays: 7 });
  assert.deepEqual(r.newItems.map((i) => i.url), ['https://example.com/a', 'https://example.com/c']);
  assert.equal(r.perSource[0].oldCount, 2);
  const log = readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.at(-1).old, 2);
  assert.equal(log.at(-1).new, 2);
  const ledger = readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8');
  assert.ok(!ledger.includes('https://example.com/b') && !ledger.includes('https://example.com/d'));
  // the next round: the old ones are still not taken in, and the source is 「no new content」 with the reason
  const again = await fetchRound(dir, { config: CFG, ctx: feedCtx(), maxAgeDays: 7 });
  assert.equal(again.newItems.length, 0);
  assert.equal(again.perSource[0].status, 'empty');
  assert.match(again.perSource[0].message, /2 dated before 2026-11-11/);
});

test('M4 fetchRound: no limit (0 or not given) takes every item in, as before', async () => {
  for (const [name, opts] of [['fix1118-age-0', { maxAgeDays: 0 }], ['fix1118-age-none', {}]]) {
    const dir = makeLibrary(name, CFG);
    const r = await fetchRound(dir, { config: CFG, ctx: feedCtx(), ...opts });
    assert.equal(r.newItems.length, 4, name);
    assert.equal(r.perSource[0].oldCount, 0);
    const log = JSON.parse(readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(Object.hasOwn(log, 'old'), false, 'old is written only when > 0');
  }
});

test('M4 + D2 runRound: a library on the default limit skips the old item; a news.google.com item is scored on its title and its card says title-only', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  srv.route('/story', { body: `<body><nav>${MENU}</nav><article><p>${P1}</p><p>${P2}</p></article></body>`, contentType: 'text/html' });
  const items = [
    { title: 'Bank of Canada holds at 2.25 per cent - Financial Post', url: 'https://news.google.com/rss/articles/CBMiabc?oc=5', date: 'Tue, 17 Nov 2026 21:26:53 GMT', summary: 'Bank of Canada holds at 2.25 per cent Financial Post' },
    { title: 'Rate held, Macklem watches rent', url: `${srv.base}/story`, date: 'Wed, 18 Nov 2026 08:00:00 GMT' },
    { title: 'An old piece from February', url: `${srv.base}/old`, date: 'Tue, 03 Feb 2026 08:00:00 GMT' },
  ];
  srv.route('/feed', { body: rssWith(items) });
  const cfg = { ...TEST_CONFIG, pipeline: { nodes: [{ id: 'relevance' }, { id: 'substance' }, { id: 'freshness' }] }, sources: [{ name: 'feed-a', kind: 'rss', url: `${srv.base}/feed`, topic: 'agent 记忆', max_results: 100 }] };
  const dir = makeLibrary('fix1118-round', cfg);
  const base = scriptedConnector({ score: 0.9 });
  const prompts = [];
  const connector = { ...base, complete: async (req) => { prompts.push(req.prompt); return base.complete(req); } };
  const round = await runRound(dir, { connector, ctx: makeContext({ now: () => NOW, timeoutMs: 1500, sleep: async () => {} }) });
  assert.equal(round.counts.old, 1);
  assert.equal(srv.hits('/old'), 0);
  const inbox = listInbox(dir, { now: () => NOW });
  const cards = new Map((inbox.items ?? inbox).map((c) => [c.url, c]));
  assert.equal(cards.get(items[0].url)?.materials, 'title-only');
  assert.equal(cards.get(items[1].url)?.materials, 'body');
  const gnewsPrompts = prompts.filter((p) => p.includes('Bank of Canada holds at 2.25'));
  assert.ok(gnewsPrompts.some((p) => p.includes('只有标题（')), 'the substance step and the summary are told it is the title only');
  const storyPrompts = prompts.filter((p) => p.includes('Rate held, Macklem'));
  assert.ok(storyPrompts.some((p) => p.includes(P1) && !p.includes('Subscribe')), 'the story is read as its article, not its menu');
  // the round log (rounds-log.mjs: one md per local day) carries the count
  const logs = join(dir, '_pipeline', 'logs');
  assert.ok(existsSync(logs));
  const md = readdirSync(logs).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(logs, f), 'utf8')).join('\n');
  assert.match(md, /· old 1/);
});
