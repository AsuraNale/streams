// 1.1 W7b: v1.0's feed fetchers left core/src for core/legacy/ (not shipped); still tested, since the fixtures of libraries
// 'as 1.0 made them' run them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, atomLink, detectRoot, elementText } from '../legacy/fetch/feed.mjs';
import { decodeEntities, stripHtml, normalizeTitle, truncateText } from '../src/fetch/html.mjs';
import { toIsoDate, localIsoDate, isRealDate } from '../src/fetch/dates.mjs';
import { RSS2, ATOM, ARXIV_ATOM, EMPTY_RSS } from './support/feeds.mjs';

// 对照 test_pipeline.py::test_feed_parsing（RSS2 部分）
test('RSS2: title whitespace collapsed, html stripped from summary, RFC822 date -> ISO', () => {
  const r = parseFeed(RSS2);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'rss');
  assert.equal(r.items.length, 2);
  const [a, b] = r.items;
  assert.deepEqual(a, { title: 'Hello World', url: 'https://x.com/1', date: '2026-07-02', summary: 'Some html text' });
  assert.equal(a.summary.includes('<'), false);
  // CDATA title and description, guid as permalink, no date -> ''
  assert.deepEqual(b, { title: 'Second & last', url: 'https://x.com/2', date: '', summary: 'CDATA body & stuff' });
});

test('RSS2: guid is only a link when isPermaLink is not "false"; items without title or link are dropped', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>No link, guid not permalink</title><guid isPermaLink="false">tag:x,1</guid></item>
    <item><title></title><link>https://x/empty-title</link></item>
    <item><link>https://x/no-title</link></item>
    <item><title>Kept</title><guid>https://x/kept</guid><pubDate>Fri, 03 Jul 2026 00:00:00 +0000</pubDate></item>
    <item><title>Encoded</title><link>https://x/enc</link><content:encoded><![CDATA[<b>bold</b> body]]></content:encoded></item>
  </channel></rss>`;
  const r = parseFeed(xml);
  assert.deepEqual(r.items.map((i) => i.url), ['https://x/kept', 'https://x/enc']);
  assert.equal(r.items[0].date, '2026-07-03');
  assert.equal(r.items[1].summary, 'bold body', 'content:encoded is the fallback summary');
});

test('RSS 1.0 (rdf:RDF root) is read as rss', () => {
  const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
    <channel><title>c</title></channel>
    <item><title>One</title><link>https://r/1</link><dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">2026-07-04T00:00:00Z</dc:date></item></rdf:RDF>`;
  const r = parseFeed(xml);
  assert.equal(r.kind, 'rss');
  assert.deepEqual(r.items, [{ title: 'One', url: 'https://r/1', date: '2026-07-04', summary: '' }]);
});

// 对照 test_pipeline.py::test_feed_parsing（Atom 部分）
test('Atom: alternate link + ISO date', () => {
  const r = parseFeed(ATOM);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'atom');
  assert.deepEqual(r.items, [{ title: 'Atom Entry', url: 'https://x.com/2', date: '2026-07-01', summary: 'sum' }]);
});

test('Atom (arXiv shape): rel=alternate wins over a related pdf link in either order, titles collapse, summary keeps text', () => {
  const r = parseFeed(ARXIV_ATOM);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map((i) => i.url), ['http://arxiv.org/abs/2611.00001v1', 'http://arxiv.org/abs/2611.00002v1']);
  assert.equal(r.items.some((i) => i.url.includes('/pdf/')), false, 'never the pdf link');
  assert.equal(r.items[0].title, 'Memory Blocks for Long-Horizon Agents');
  assert.equal(r.items[0].summary, 'We propose memory blocks & a benchmark. Second line of the abstract.');
  assert.deepEqual(r.items.map((i) => i.date), ['2026-10-31', '2026-10-30']);
  // the feed-level <title>/<link>/<updated> outside entries never leak into items
  assert.equal(r.items.some((i) => i.title.startsWith('ArXiv Query')), false);
});

test('atomLink: no rel counts as alternate; only self/related -> first href; no link at all -> <id>; updated is the date fallback', () => {
  assert.equal(atomLink('<link href="https://a/1"/>'), 'https://a/1');
  assert.equal(atomLink('<link rel="self" href="https://a/self"/><link rel="alternate" href="https://a/alt"/>'), 'https://a/alt');
  assert.equal(atomLink('<link rel="self" href="https://a/self"/><link rel="related" href="https://a/rel"/>'), 'https://a/self');
  assert.equal(atomLink('<id>urn:x:1</id>'), 'urn:x:1');
  assert.equal(atomLink('<link rel="alternate" href="https://a/&amp;x"></link>'), 'https://a/&x', 'href is entity-decoded');
  const r = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><id>https://a/id</id><updated>2026-07-05T00:00:00Z</updated><content type="html">&lt;p&gt;c&lt;/p&gt;</content></entry></feed>');
  assert.deepEqual(r.items, [{ title: 'T', url: 'https://a/id', date: '2026-07-05', summary: 'c' }]);
});

// 对照 test_pipeline.py::test_feed_parsing（garbage -> FetchGap）
test('garbage is refused with a reason, never thrown: html, json, text, empty, unknown root', () => {
  const cases = [
    ['<html><body>not a feed</body></html>', 'not-a-feed'],
    ['<!DOCTYPE html><html><head></head></html>', 'not-a-feed'],
    ['{"hits":[]}', 'not-xml'],
    ['just some text', 'not-xml'],
    ['', 'empty-body'],
    ['   \n ', 'empty-body'],
    ['<?xml version="1.0"?><!-- only a comment -->', 'empty-body'],
    ['<?xml version="1.0"?><opml version="2.0"><body/></opml>', 'not-a-feed'],
    ['<', 'not-xml'],
  ];
  for (const [text, reason] of cases) {
    const r = parseFeed(text);
    assert.equal(r.ok, false, JSON.stringify(text));
    assert.equal(r.reason, reason, JSON.stringify(text));
    assert.equal(typeof r.message, 'string');
  }
  // BOM + prolog + comment before the root are fine
  assert.equal(parseFeed('﻿<?xml version="1.0"?>\n<!-- c -->\n' + EMPTY_RSS).ok, true);
  assert.deepEqual(parseFeed(EMPTY_RSS), { ok: true, kind: 'rss', blocks: 0, items: [] }, 'a feed with no items is ok + 0 items, not a parse failure');
  assert.deepEqual(detectRoot('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"/>'), { kind: 'atom', root: 'feed', prefix: 'atom:' });
  assert.deepEqual(detectRoot('<rss version="2.0">'), { kind: 'rss', root: 'rss', prefix: '' });
});

test('elementText: CDATA verbatim, entities decoded outside CDATA, namespaced names, missing -> null', () => {
  assert.equal(elementText('<title>a &amp; b</title>', 'title'), 'a & b');
  assert.equal(elementText('<title><![CDATA[a &amp; <b>]]></title>', 'title'), 'a &amp; <b>');
  assert.equal(elementText('<t>x<![CDATA[&lt;]]>&lt;</t>', 't'), 'x&lt;<');
  assert.equal(elementText('<dc:date>2026</dc:date>', 'dc:date'), '2026');
  assert.equal(elementText('<title type="html">t</title>', 'title'), 't');
  assert.equal(elementText('<other>t</other>', 'title'), null);
  assert.equal(elementText('<atom:link href="x"/><link>https://l</link>', 'link'), 'https://l', 'a prefixed tag does not match the bare name');
});

test('decodeEntities / stripHtml', () => {
  assert.equal(decodeEntities('&lt;a&gt; &amp; &quot;q&quot; &apos;s&apos; &#65;&#x42; &nbsp;&mdash;'), '<a> & "q" \'s\' AB  —'.replace(' ', ' '));
  assert.equal(decodeEntities('&bogus; &#xZZ; &'), '&bogus; &#xZZ; &', 'unknown entities are left alone');
  assert.equal(stripHtml('<p>Some <b>html</b>&nbsp;text</p><script>evil()</script><style>p{}</style><!-- c -->  end '), 'Some html text end');
  assert.equal(stripHtml('<![CDATA[<i>x</i>]]>'), 'x');
  assert.equal(stripHtml(null), '');
  assert.equal(stripHtml('a\n\n  b\t c'), 'a b c');
});

test('normalizeTitle: second-layer key ignores case, punctuation, spacing and full-width forms', () => {
  const same = ['Alpha story', 'Alpha  STORY', 'alpha-story!', '  Alpha: Story?  ', 'ＡＬＰＨＡ ｓｔｏｒｙ', 'Alpha story'];
  for (const t of same) assert.equal(normalizeTitle(t), 'alphastory', JSON.stringify(t));
  assert.equal(normalizeTitle('Letta 发布 Memory Blocks API'), 'letta发布memoryblocksapi');
  assert.equal(normalizeTitle('２０２６年'), '2026年');
  // negative: different titles stay different; punctuation-only collapses to '' (which callers treat as "no key")
  assert.notEqual(normalizeTitle('Alpha story'), normalizeTitle('Alpha story 2'));
  assert.notEqual(normalizeTitle('Beta story'), normalizeTitle('Alpha story'));
  assert.equal(normalizeTitle('!!! ...'), '');
  assert.equal(normalizeTitle(undefined), '');
});

test('truncateText counts code points, not UTF-16 units', () => {
  const emoji = '😀'.repeat(600);
  assert.equal(Array.from(truncateText(emoji, 500)).length, 500);
  assert.equal(truncateText(emoji, 500).endsWith('😀'), true, 'no split surrogate');
  assert.equal(truncateText('short'), 'short');
  assert.equal(Array.from(truncateText('x'.repeat(501))).length, 500);
});

test('toIsoDate: the calendar date as written, impossible / unparseable -> fallback', () => {
  const cases = [
    ['2026-07-03T12:00:00Z', '2026-07-03'],
    ['2026-07-03', '2026-07-03'],
    ['2026-07-01T23:30:00-05:00', '2026-07-01'],
    ['Thu, 02 Jul 2026 08:00:00 GMT', '2026-07-02'],
    ['Thu, 02 Jul 2026 23:30:00 -0500', '2026-07-02'],
    ['2 Jul 2026 00:00:00 +0000', '2026-07-02'],
    ['Fri, 03 July 2026 10:00:00 GMT', '2026-07-03'],
    ['  2026-07-03  ', '2026-07-03'],
    ['2026/07/04', '2026-07-04'],
  ];
  for (const [raw, want] of cases) assert.equal(toIsoDate(raw), want, raw);
  for (const bad of ['2026-02-30', '2026-13-01', '30 Feb 2026 00:00:00 GMT', 'yesterday', '', '   ', null, undefined, '-5', 'Thu']) {
    assert.equal(toIsoDate(bad, { fallback: 'FALLBACK' }), 'FALLBACK', String(bad));
    assert.equal(toIsoDate(bad), '', String(bad));
  }
  assert.equal(isRealDate(2024, 2, 29), true);
  assert.equal(isRealDate(2026, 2, 29), false);
  assert.equal(localIsoDate(new Date(2026, 10, 2, 23, 59)), '2026-11-02');
  assert.equal(localIsoDate(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

// 验方退回 2：三种「根认得、块数 > 0、可用 0 条」的输入曾静默成 empty。parseFeed 要报块数；前缀 Atom 要能读；guid 是 URL 就用。
test('namespace-prefixed Atom (<atom:feed><atom:entry>) is read like plain Atom', () => {
  const xml = `<?xml version="1.0"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:title>f</atom:title>
    <atom:entry><atom:title>Prefixed Entry</atom:title><atom:link rel="alternate" href="https://p/1"/>
      <atom:summary>s</atom:summary><atom:updated>2026-07-05T00:00:00Z</atom:updated></atom:entry>
    <atom:entry><atom:title>Second</atom:title><atom:link href="https://p/2"/></atom:entry></atom:feed>`;
  const r = parseFeed(xml);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'atom');
  assert.equal(r.blocks, 2);
  assert.deepEqual(r.items, [
    { title: 'Prefixed Entry', url: 'https://p/1', date: '2026-07-05', summary: 's' },
    { title: 'Second', url: 'https://p/2', date: '', summary: '' },
  ]);
});

test('RSS2: a guid that is a URL is used as the link even with isPermaLink="false"; a non-URL guid is not', () => {
  const r = parseFeed(`<rss version="2.0"><channel>
    <item><title>Url guid</title><guid isPermaLink="false">https://g/1</guid></item>
    <item><title>Tag guid</title><guid isPermaLink="false">tag:x,2026:1</guid></item>
  </channel></rss>`);
  assert.equal(r.blocks, 2);
  assert.deepEqual(r.items.map((i) => [i.title, i.url]), [['Url guid', 'https://g/1']]);
});

test('parseFeed reports the number of item/entry blocks it saw, including a truncated one, so 0 usable of N is visible', () => {
  assert.equal(parseFeed(EMPTY_RSS).blocks, 0);
  assert.equal(parseFeed(RSS2).blocks, 2);
  assert.equal(parseFeed(ARXIV_ATOM).blocks, 2);
  const truncated = parseFeed('<?xml version="1.0"?><rss version="2.0"><channel><title>c</title><item><title>cut off here</title><link>https://x/');
  assert.equal(truncated.ok, true);
  assert.equal(truncated.blocks, 1, 'an opened but never closed item still counts as a block');
  assert.deepEqual(truncated.items, []);
  const unusable = parseFeed('<rss><channel><item><title>no link</title></item><item><link>https://x/no-title</link></item></channel></rss>');
  assert.equal(unusable.blocks, 2);
  assert.deepEqual(unusable.items, []);
});

// 验方退回 3：entry 内嵌 <source> 时取到 origin 的 link / title；聚合源全部条目 url 相同，被第一层去重折成一条。
test('Atom: an embedded <source> never supplies the entry url, title or date, wherever it sits', () => {
  const src = '<source><id>https://origin/</id><title>Origin Blog</title><link rel="alternate" href="https://origin/"/><updated>2026-01-01T00:00:00Z</updated></source>';
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>${src}<title>First own</title><link rel="alternate" href="https://origin/post-1"/><published>2026-07-06T00:00:00Z</published></entry>
    <entry><title>Second own</title>${src}<link rel="alternate" href="https://origin/post-2"/><published>2026-07-07T00:00:00Z</published></entry>
    <entry><title>Third own</title><link rel="alternate" href="https://origin/post-3"/><published>2026-07-08T00:00:00Z</published>${src}</entry>
  </feed>`;
  const r = parseFeed(xml);
  assert.deepEqual(r.items, [
    { title: 'First own', url: 'https://origin/post-1', date: '2026-07-06', summary: '' },
    { title: 'Second own', url: 'https://origin/post-2', date: '2026-07-07', summary: '' },
    { title: 'Third own', url: 'https://origin/post-3', date: '2026-07-08', summary: '' },
  ]);
  assert.equal(new Set(r.items.map((i) => i.url)).size, 3, 'three distinct urls, nothing folds into one');
});

test('attribute values may contain ">" (quoted): href and the element are still found', () => {
  assert.equal(atomLink('<link rel="alternate" title="a>b" href="https://a/x?q=a>b"/>'), 'https://a/x?q=a>b');
  assert.equal(atomLink("<link rel='alternate' title='a>b' href='https://a/y'/>"), 'https://a/y');
  assert.equal(elementText('<title type="x>y">T</title>', 'title'), 'T');
  const r = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link href="https://a/1?x=1>0" rel="alternate"/><summary>s</summary></entry></feed>');
  assert.deepEqual(r.items.map((i) => i.url), ['https://a/1?x=1>0']);
  const rss = parseFeed('<rss><channel><item><title>T</title><guid isPermaLink="true" extra="a>b">https://g/1</guid></item></channel></rss>');
  assert.deepEqual(rss.items.map((i) => i.url), ['https://g/1']);
});

test('sentinel: an HTML page is never a feed, and a feed with a broken item set still yields zero items rather than garbage', () => {
  const html = parseFeed('<html><head><title>Blog</title></head><body><a href="https://x/1">post</a></body></html>');
  assert.equal(html.ok, false);
  assert.equal(html.reason, 'not-a-feed');
  const broken = parseFeed('<rss><channel><item><title>no link</title></item><item><link>https://x/no-title</link></item></channel></rss>');
  assert.equal(broken.ok, true);
  assert.deepEqual(broken.items, []);
});
