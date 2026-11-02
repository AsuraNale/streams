import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSource, SOURCE_KINDS, sourceName } from '../src/fetch/source.mjs';
import { fetchHn } from '../src/fetch/sources/hn.mjs';
import { fetchArxiv, arxivSearchQuery, waitForArxivSlot } from '../src/fetch/sources/arxiv.mjs';
import { makeContext, isContext } from '../src/fetch/context.mjs';
import { USER_AGENT, getText } from '../src/fetch/http.mjs';
import { startFakeServer, deadUrl } from './support/fake-server.mjs';
import { RSS2, EMPTY_RSS, ATOM, ARXIV_ATOM, HN_JSON } from './support/feeds.mjs';

// a fixed local clock: 2026-11-02 12:00 local, so the fetch-day fallback is 2026-11-02 in every zone
const CLOCK = new Date(2026, 10, 2, 12, 0, 0);
function ctxFor(srv, extra = {}) {
  return makeContext({ timeoutMs: 1500, now: () => CLOCK, sleep: async () => {}, ...extra });
}

// V3: every fake-server case with its expected state, http code and hint.
test('V3 table: one source per HTTP situation -> the documented state', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ctx = ctxFor(srv);
  const cases = [
    // name           route spec                                               state      http   hint                      retryAfter
    ['rss-empty',     { body: EMPTY_RSS },                                     'empty',   200,   'none'],
    ['rss-ok',        { body: RSS2 },                                          'ok',      200,   'none'],
    ['atom-ok',       { body: ATOM },                                          'ok',      200,   'none'],
    ['http-404',      { status: 404, body: 'nope', contentType: 'text/plain' }, 'gap',    404,   'fix-address-or-remove'],
    ['http-410',      { status: 410 },                                         'gap',     410,   'fix-address-or-remove'],
    ['http-503',      { status: 503, headers: { 'retry-after': '120' } },      'failed',  503,   'retry-next-round', 120],
    ['http-429',      { status: 429, headers: { 'retry-after': '30' } },       'failed',  429,   'retry-next-round', 30],
    ['http-408',      { status: 408 },                                         'failed',  408,   'retry-next-round'],
    ['http-500',      { status: 500, body: RSS2 },                             'failed',  500,   'retry-next-round'],
    ['http-403',      { status: 403, body: RSS2 },                             'blocked', 403,   'blocked-remove-source'],
    // WHATWG fetch hides a 407 behind a bare network error, so the status itself never reaches us
    ['http-407',      { status: 407 },                                         'blocked', undefined, 'blocked-remove-source'],
    ['http-451',      { status: 451 },                                         'blocked', 451,   'blocked-remove-source'],
    ['hang',          { hang: true },                                          'failed',  undefined, 'retry-next-round'],
    ['not-xml',       { body: 'just text', contentType: 'text/plain' },        'gap',     200,   'fix-address-or-remove'],
    ['html-page',     { body: '<html><body>not a feed</body></html>', contentType: 'text/html' }, 'gap', 200, 'fix-address-or-remove'],
    ['json-body',     { body: '{"a":1}', contentType: 'application/json' },    'gap',     200,   'fix-address-or-remove'],
  ];
  for (const [name, spec, state, http, hint, retryAfter] of cases) {
    const url = srv.route(`/${name}`, spec);
    const r = await fetchSource({ name, kind: 'rss', url, topic: 't' }, ctx);
    assert.equal(r.status, state, `${name}: status`);
    assert.equal(r.http, http, `${name}: http`);
    assert.equal(r.hint, hint, `${name}: hint`);
    assert.equal(r.source, name);
    assert.equal(r.kind, 'rss');
    assert.equal(r.retryAfterSeconds, retryAfter, `${name}: retryAfterSeconds`);
    assert.equal(typeof r.message, 'string');
    if (state === 'ok') assert.ok(r.items.length >= 1, `${name}: items`);
    else assert.deepEqual(r.items, [], `${name}: a non-ok fetch carries no items (a 500 with a feed body is still failed)`);
    assert.equal(srv.hits(`/${name}`), 1, `${name}: exactly one request, no retry in this call`);
  }
  // the one request carried our own User-Agent, on every case including the refused one
  for (const req of srv.requests) assert.equal(req.headers['user-agent'], USER_AGENT, req.path);
  assert.equal(USER_AGENT, 'Streams/1.0 (+https://github.com/AsuraNale/streams)');
});

test('items: shape, topic hint, fetch-day fallback for a missing date, per-source cap', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ctx = ctxFor(srv);
  const url = srv.route('/rss', { body: RSS2 });
  const r = await fetchSource({ name: 'blog', kind: 'rss', url, topic: 'agent 记忆' }, ctx);
  assert.deepEqual(r.items, [
    { url: 'https://x.com/1', title: 'Hello World', date: '2026-07-02', summary: 'Some html text', source: 'blog', kind: 'rss', topic: 'agent 记忆' },
    { url: 'https://x.com/2', title: 'Second & last', date: '2026-11-02', summary: 'CDATA body & stuff', source: 'blog', kind: 'rss', topic: 'agent 记忆' },
  ]);
  const noTopic = await fetchSource({ name: 'blog', kind: 'rss', url }, ctx);
  assert.equal('topic' in noTopic.items[0], false);
  const capped = await fetchSource({ name: 'blog', kind: 'rss', url, max_results: 1 }, ctx);
  assert.equal(capped.items.length, 1);
  assert.equal(capped.status, 'ok');
});

test('connection refused -> failed with no http code; bad address / missing url / unknown kind -> gap without touching the network', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ctx = ctxFor(srv);
  const dead = await fetchSource({ name: 'dead', kind: 'rss', url: await deadUrl() }, ctx);
  assert.equal(dead.status, 'failed');
  assert.equal(dead.http, undefined);
  assert.match(dead.message, /ECONNREFUSED/);
  const before = srv.requests.length;
  // 对照 test_pipeline.py::test_status_classification "unknown kind -> gap (config problem)"
  for (const src of [
    { name: 'bogus', kind: 'bogus', url: srv.base + '/x' },
    { name: 'nokind', url: srv.base + '/x' },
    { name: 'nourl', kind: 'rss' },
    { name: 'ftp', kind: 'rss', url: 'ftp://x/feed' },
    { name: 'notaurl', kind: 'rss', url: 'notaurl' },
    { name: 'js', kind: 'rss', url: 'javascript:alert(1)' },
    { name: 'noquery-hn', kind: 'hn' },
    { name: 'noquery-arxiv', kind: 'arxiv', query: '   ' },
  ]) {
    const r = await fetchSource(src, ctx);
    assert.equal(r.status, 'gap', src.name);
    assert.equal(r.hint, 'fix-address-or-remove', src.name);
    assert.deepEqual(r.items, []);
  }
  assert.equal(srv.requests.length, before, 'configuration problems make no request');
  assert.deepEqual(SOURCE_KINDS, ['rss', 'arxiv', 'hn']);
  assert.equal((await fetchSource('not an object', ctx)).status, 'gap');
  assert.equal((await fetchSource(null, ctx)).status, 'gap');
  assert.equal(sourceName({ url: 'https://u' }), 'https://u');
  assert.equal(sourceName({ query: 'q' }), 'q');
  assert.equal(sourceName({}), '?');
});

// 验方退回 4：原用例让 fetchImpl 抛，但 getText 自己吞了，到不了 fetchSource 的 catch。
// 现在让 source 对象本身在被读时抛（url getter）：这条路径只有 fetchSource 的 catch 能接住。
test('a source whose url getter throws is a failed source from fetchSource (its catch is the only thing in the way)', async () => {
  const ctx = makeContext({ now: () => CLOCK, timeoutMs: 500 });
  const src = { name: 's', kind: 'rss' };
  Object.defineProperty(src, 'url', { enumerable: true, get() { throw new RangeError('url getter exploded'); } });
  const r = await fetchSource(src, ctx);
  assert.equal(r.status, 'failed');
  assert.equal(r.hint, 'retry-next-round');
  assert.equal(r.source, 's');
  assert.equal(r.kind, 'rss');
  assert.match(r.message, /unexpected RangeError: url getter exploded/);
  assert.deepEqual(r.items, []);
  // a fetchImpl that throws or returns garbage never reaches that catch (getText absorbs it) but still ends failed
  const boom = makeContext({ fetchImpl: async () => { throw new RangeError('fetchImpl exploded'); }, now: () => CLOCK });
  assert.equal((await fetchSource({ name: 's', kind: 'rss', url: 'http://127.0.0.1:9/x' }, boom)).status, 'failed');
  const bogus = makeContext({ fetchImpl: async () => ({}), now: () => CLOCK });
  assert.equal((await fetchSource({ name: 's', kind: 'rss', url: 'http://127.0.0.1:9/x' }, bogus)).status, 'failed');
});

// 验方退回 2（来源层）：根认得、块数 > 0、可用 0 条 → gap "parsed N, 0 usable"；真正 0 块仍是 empty。
test('a feed whose items are all unusable is a gap ("parsed N, 0 usable"), a feed with no items at all is empty', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ctx = ctxFor(srv);
  const unusable = srv.route('/unusable', { body: '<rss version="2.0"><channel><item><title>no link</title></item><item><title>Only tag guid</title><guid isPermaLink="false">tag:x,1</guid></item></channel></rss>' });
  const r = await fetchSource({ name: 'u', kind: 'rss', url: unusable }, ctx);
  assert.equal(r.status, 'gap');
  assert.equal(r.hint, 'fix-address-or-remove');
  assert.equal(r.http, 200);
  assert.match(r.message, /parsed 2, 0 usable/);
  assert.deepEqual(r.items, []);
  const truncated = srv.route('/truncated', { body: '<?xml version="1.0"?><rss version="2.0"><channel><item><title>cut</title><link>https://x/' });
  const tr = await fetchSource({ name: 't', kind: 'rss', url: truncated }, ctx);
  assert.equal(tr.status, 'gap');
  assert.match(tr.message, /parsed 1, 0 usable/);
  const prefixed = srv.route('/prefixed', { body: '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry><atom:title>P</atom:title><atom:link href="https://p/1"/></atom:entry></atom:feed>' });
  const pr = await fetchSource({ name: 'p', kind: 'rss', url: prefixed }, ctx);
  assert.equal(pr.status, 'ok');
  assert.deepEqual(pr.items.map((i) => i.url), ['https://p/1']);
  // negative: a genuinely empty feed stays empty, and the arXiv path applies the same rule
  assert.equal((await fetchSource({ name: 'e', kind: 'rss', url: srv.route('/empty', { body: EMPTY_RSS }) }, ctx)).status, 'empty');
  const arxivBase = srv.route('/arxiv-unusable', { body: '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>no link no id</title></entry></feed>' });
  const ax = await fetchSource({ name: 'ax', kind: 'arxiv', query: 'x' }, ctxFor(srv, { arxivBase }));
  assert.equal(ax.status, 'gap');
  assert.match(ax.message, /parsed 1, 0 usable/);
});

// 对照 test_pipeline.py::test_hn_client_side_filter
test('HN: points filtered client-side (>= min_points kept, below dropped), never numericFilters in the URL', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const hnBase = srv.route('/hn', { body: HN_JSON, contentType: 'application/json' });
  const ctx = ctxFor(srv, { hnBase });
  const items = (await fetchHn({ name: 'h', kind: 'hn', query: 'x', min_points: 50 }, ctx)).items;
  assert.deepEqual(items.map((i) => i.title), ['high', 'exact fifty']);
  assert.equal(items.some((i) => i.title === 'low'), false, 'below threshold dropped');
  assert.equal(items.some((i) => i.url === 'https://h/4'), false, 'empty title dropped');
  assert.deepEqual(items[1], { url: 'https://news.ycombinator.com/item?id=3', title: 'exact fifty', date: '2026-07-12', summary: 'HN story, 50 points', source: 'h', kind: 'hn' });
  assert.equal(items[0].summary, 'HN story, 120 points');
  const req = srv.requests.at(-1);
  assert.equal(req.url.includes('numericFilters'), false, 'server-side points filter is never sent');
  assert.equal(req.query.query, 'x');
  assert.equal(req.query.tags, 'story');
  assert.equal(Number(req.query.hitsPerPage) >= 20, true);
  // default threshold is 50 when min_points is absent; a higher one empties the result honestly
  assert.equal((await fetchHn({ name: 'h', kind: 'hn', query: 'x' }, ctx)).items.length, 2);
  const strict = await fetchHn({ name: 'h', kind: 'hn', query: 'x', min_points: 1000 }, ctx);
  assert.equal(strict.status, 'empty');
  assert.match(strict.message, /after filtering/);
  // through fetchSource too
  const viaSource = await fetchSource({ name: 'h', kind: 'hn', query: 'x', topic: 'HN' }, ctx);
  assert.equal(viaSource.status, 'ok');
  assert.equal(viaSource.items[0].topic, 'HN');
});

test('HN: 400 -> gap (the whole source is lost, loudly); non-JSON / no hits -> gap; 503 -> failed', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const bad = srv.route('/hn400', { status: 400, body: '{"message":"invalid numericFilters"}', contentType: 'application/json' });
  const r = await fetchSource({ name: 'h', kind: 'hn', query: 'x' }, ctxFor(srv, { hnBase: bad }));
  assert.equal(r.status, 'gap');
  assert.equal(r.http, 400);
  const html = srv.route('/hnhtml', { body: '<html>oops</html>', contentType: 'text/html' });
  const r2 = await fetchSource({ name: 'h', kind: 'hn', query: 'x' }, ctxFor(srv, { hnBase: html }));
  assert.equal(r2.status, 'gap');
  assert.match(r2.message, /non-JSON/);
  const nohits = srv.route('/hnnohits', { body: '{"results":[]}', contentType: 'application/json' });
  assert.equal((await fetchSource({ name: 'h', kind: 'hn', query: 'x' }, ctxFor(srv, { hnBase: nohits }))).status, 'gap');
  const down = srv.route('/hn503', { status: 503 });
  assert.equal((await fetchSource({ name: 'h', kind: 'hn', query: 'x' }, ctxFor(srv, { hnBase: down }))).status, 'failed');
});

test('arXiv: Atom parsed, abs links not pdf, query quoted as a phrase under all:, sorted by submittedDate', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const arxivBase = srv.route('/arxiv', { body: ARXIV_ATOM, contentType: 'application/atom+xml' });
  const ctx = ctxFor(srv, { arxivBase });
  const r = await fetchSource({ name: 'ax', kind: 'arxiv', query: 'agent memory', topic: 'agent 记忆' }, ctx);
  assert.equal(r.status, 'ok');
  assert.equal(r.http, 200);
  assert.deepEqual(r.items.map((i) => i.url), ['http://arxiv.org/abs/2611.00001v1', 'http://arxiv.org/abs/2611.00002v1']);
  assert.deepEqual(r.items.map((i) => i.date), ['2026-10-31', '2026-10-30']);
  assert.equal(r.items[0].kind, 'arxiv');
  assert.equal(r.items[0].topic, 'agent 记忆');
  const q = srv.requests.at(-1).query;
  assert.equal(q.search_query, 'all:"agent memory"');
  assert.equal(q.sortBy, 'submittedDate');
  assert.equal(q.sortOrder, 'descending');
  assert.equal(q.max_results, '10');
  assert.equal(arxivSearchQuery('cat:cs.AI AND ti:memory'), 'cat:cs.AI AND ti:memory', 'fielded queries pass through');
  assert.equal(arxivSearchQuery('"already quoted"'), 'all:"already quoted"');
  assert.equal(arxivSearchQuery('a OR b'), 'a OR b');
  // arXiv answering with something that is not a feed is a gap, not a crash
  const notFeed = srv.route('/arxiv-html', { body: '<html>maintenance</html>', contentType: 'text/html' });
  assert.equal((await fetchArxiv({ name: 'ax', query: 'x' }, ctxFor(srv, { arxivBase: notFeed }))).status, 'gap');
});

test('arXiv politeness: >= 3 s between requests through the injected clock, no real waiting', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const arxivBase = srv.route('/arxiv', { body: ARXIV_ATOM });
  let tMs = 1_000_000;
  const sleeps = [];
  const ctx = makeContext({
    arxivBase,
    timeoutMs: 1500,
    now: () => new Date(tMs),
    sleep: async (ms) => { sleeps.push(ms); tMs += ms; },
  });
  assert.equal(ctx.lastArxivAt, null);
  await fetchArxiv({ name: 'a', query: 'x' }, ctx);
  assert.deepEqual(sleeps, [], 'first request never waits');
  assert.equal(ctx.lastArxivAt, 1_000_000);
  tMs += 1000; // one second later
  await fetchArxiv({ name: 'b', query: 'y' }, ctx);
  assert.deepEqual(sleeps, [2000], 'second request waits out the rest of the 3 s');
  assert.equal(ctx.lastArxivAt, 1_003_000);
  await fetchArxiv({ name: 'c', query: 'z' }, ctx); // immediately after
  assert.deepEqual(sleeps, [2000, 3000]);
  tMs += 10_000;
  await fetchArxiv({ name: 'd', query: 'w' }, ctx);
  assert.deepEqual(sleeps, [2000, 3000], 'after a long pause there is nothing to wait for');
  assert.equal(srv.hits('/arxiv'), 4);
  // the gap is also honoured when the previous request failed (a 429 must not trigger a faster retry)
  const slow = srv.route('/arxiv429', { status: 429, headers: { 'retry-after': '10' } });
  const ctx2 = makeContext({ arxivBase: slow, timeoutMs: 1500, now: () => new Date(tMs), sleep: async (ms) => { sleeps.push(ms); tMs += ms; } });
  const r1 = await fetchArxiv({ name: 'a', query: 'x' }, ctx2);
  assert.equal(r1.status, 'failed');
  assert.equal(r1.retryAfterSeconds, 10);
  await fetchArxiv({ name: 'a', query: 'x' }, ctx2);
  assert.equal(sleeps.at(-1), 3000);
  assert.equal(await waitForArxivSlot(makeContext({ lastArxivAt: null })), 0);
  // the shared ctx is the same object end to end (a copy would lose lastArxivAt)
  assert.equal(makeContext(ctx), ctx);
  assert.equal(isContext(ctx), true);
  assert.equal(isContext({}), false);
});

test('getText: a response of any status is ok:true, no response is ok:false with the error kept', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const url = srv.route('/t', { status: 404, body: 'x', headers: { 'X-Custom': 'v' } });
  const r = await getText(url, { timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 404);
  assert.equal(r.text, 'x');
  assert.equal(r.headers['x-custom'], 'v', 'header names are lower-cased');
  const hang = srv.route('/h', { hang: true });
  const h = await getText(hang, { timeoutMs: 200 });
  assert.equal(h.ok, false);
  assert.equal(h.error.name, 'TimeoutError');
  const bad = await getText('nope', {});
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'bad-url');
  assert.equal((await getText('', {})).error.code, 'bad-url');
  assert.equal((await getText(undefined, {})).error.code, 'bad-url');
});

test('sentinel: a refused (403) source is never reported ok and is asked exactly once with the same User-Agent', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const url = srv.route('/forbidden', { status: 403, body: RSS2 });
  const r = await fetchSource({ name: 'f', kind: 'rss', url }, ctxFor(srv));
  assert.notEqual(r.status, 'ok');
  assert.notEqual(r.status, 'empty');
  assert.equal(r.status, 'blocked');
  assert.equal(r.hint, 'blocked-remove-source');
  assert.equal(srv.hits('/forbidden'), 1, 'no second attempt');
  assert.equal(srv.requests[0].headers['user-agent'], USER_AGENT, 'no UA change');
  assert.deepEqual(r.items, [], 'a refused body is never parsed into items');
});
