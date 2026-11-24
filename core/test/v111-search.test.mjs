// 1.1.1 P5 (A3; the maintainer 11-24 evening: DeepSeek's search API first): the search service of an API connection and which key it
// uses. A stand-in for the search API (a fetch that answers as the vendor's documentation shows). Each check holds first the
// state that would make it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createDeepSeekSearch, searchFor } from '../src/connect/search.mjs';
import { createApiToolSession } from '../src/connect/api-tools.mjs';
import { caseDir } from './support/tmp.mjs';

const MODEL_KEY = 'sk-model-key-5555aaaa';
const SEARCH_KEY = 'sk-search-key-7777bbbb';
const ANSWER = { results: [{ rerank_score: 2.4, title: '安省补助目录', url: 'https://grants.example.test/list', snippet: '设备补助与工资补贴', summary: '长一些的摘要', content: '', site_name: null, site_icon: null, date: null, authority: 3 }, { title: '没有网址的', url: 'javascript:alert(1)', snippet: 'x' }] };

function api(status = 200, json = ANSWER) {
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) }; };
  return { requests, fetchImpl };
}

test('search: POST /v1/tools/search with the key as Bearer and the query; the results as title, url, snippet (no address, left out)', async () => {
  const a = api();
  const r = await createDeepSeekSearch({ getKey: async () => SEARCH_KEY, fetchImpl: a.fetchImpl }).search('安省 设备补助');
  assert.deepEqual(r, { ok: true, results: [{ title: '安省补助目录', url: 'https://grants.example.test/list', snippet: '设备补助与工资补贴' }] });
  assert.equal(a.requests.length, 1);
  assert.equal(a.requests[0].url, 'https://api.deepseek.com/v1/tools/search');
  assert.equal(a.requests[0].headers.authorization, `Bearer ${SEARCH_KEY}`);
  assert.equal(a.requests[0].body.query, '安省 设备补助');
});

test('search: failures are codes, never a throw, and never carry the key', async () => {
  for (const [status, code] of [[401, 'bad-key'], [402, 'no-balance'], [429, 'rate-limited'], [500, 'network'], [400, 'bad-request']]) {
    const a = api(status, { error: { message: `wrong key ${SEARCH_KEY} here`, type: 'invalid_request_error' } });
    const r = await createDeepSeekSearch({ getKey: async () => SEARCH_KEY, fetchImpl: a.fetchImpl }).search('x');
    assert.deepEqual([r.ok, r.code], [false, code], String(status));
    assert.equal(r.detail.includes(SEARCH_KEY), false, 'the key is scrubbed');
  }
  const thrown = await createDeepSeekSearch({ getKey: async () => SEARCH_KEY, fetchImpl: async () => { throw new Error(`socket closed for ${SEARCH_KEY}`); } }).search('x');
  assert.deepEqual([thrown.ok, thrown.code, thrown.detail.includes(SEARCH_KEY)], [false, 'network', false]);
  const a = api();
  const empty = await createDeepSeekSearch({ getKey: async () => SEARCH_KEY, fetchImpl: a.fetchImpl }).search('   ');
  assert.deepEqual([empty.ok, empty.code, a.requests.length], [false, 'bad-request', 0], 'an empty query is not sent');
  const nokey = await createDeepSeekSearch({ getKey: async () => '', fetchImpl: a.fetchImpl }).search('x');
  assert.deepEqual([nokey.ok, nokey.code, a.requests.length], [false, 'bad-key', 0]);
});

const conn = (vendor) => ({ kind: 'api', model: 'm', api: { vendor, keyRef: 'k' } });

test('which key: a DeepSeek model\'s own; another vendor\'s, the search key from 设置; neither: no search at all', async () => {
  const a = api();
  const ds = await searchFor(conn('deepseek'), { getKey: async () => MODEL_KEY, getSearchKey: async () => SEARCH_KEY, fetchImpl: a.fetchImpl });
  assert.equal(ds.from, 'model');
  await ds.search('q');
  assert.equal(a.requests.at(-1).headers.authorization, `Bearer ${MODEL_KEY}`, 'DeepSeek: its own key, nothing more to fill in');
  const other = await searchFor(conn('anthropic'), { getKey: async () => MODEL_KEY, getSearchKey: async () => SEARCH_KEY, fetchImpl: a.fetchImpl });
  assert.equal(other.from, 'search-key');
  await other.search('q');
  assert.equal(a.requests.at(-1).headers.authorization, `Bearer ${SEARCH_KEY}`, 'another vendor: the search key');
  assert.equal(await searchFor(conn('anthropic'), { getKey: async () => MODEL_KEY, getSearchKey: async () => '' }), null, 'no search key: no search');
  assert.equal(await searchFor(conn('deepseek'), { getKey: async () => '', getSearchKey: async () => undefined }), null);
  assert.equal(await searchFor({ kind: 'claude-code' }, {}), null, 'a command-line connection has its own');
});

test('no search: the model is given read_page only; with search, both — and the search tool calls the service with the query', async () => {
  const a = api();
  const vendor = (step) => {
    const requests = [];
    return { requests, fetchImpl: async (url, init) => { const body = JSON.parse(init.body); requests.push(body); return { ok: true, status: 200, text: async () => JSON.stringify(step(body, requests.length - 1)) }; } };
  };
  const reply = (body, i) => (i === 0 ? { content: [{ type: 'tool_use', id: 't1', name: 'search', input: { query: '安省 补助' } }], stop_reason: 'tool_use' } : { content: [{ type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn' });
  const readPage = async () => ({ ok: false, reason: 'dead' });
  // without a search service: no search tool; a search asked for anyway is off the list
  const v0 = vendor(reply);
  const s0 = createApiToolSession({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: 'https://api.example.test', keyRef: 'k' } }, { getKey: async () => MODEL_KEY, fetchImpl: v0.fetchImpl }, { sessionDir: join(caseDir('p5-none'), 's'), readPage });
  const r0 = await s0.send({ prompt: 'x', format: 'json' });
  assert.deepEqual(v0.requests[0].tools.map((t) => t.name), ['read_page']);
  assert.deepEqual(r0.otherTools, ['search']);
  // with it
  const found = await searchFor(conn('deepseek'), { getKey: async () => MODEL_KEY, fetchImpl: a.fetchImpl });
  const v1 = vendor(reply);
  const s1 = createApiToolSession({ kind: 'api', model: 'm', api: { vendor: 'anthropic', baseUrl: 'https://api.example.test', keyRef: 'k' } }, { getKey: async () => MODEL_KEY, fetchImpl: v1.fetchImpl }, { sessionDir: join(caseDir('p5-with'), 's'), readPage, search: found.search, budget: { reads: 5, searches: 2 } });
  const r1 = await s1.send({ prompt: 'x', format: 'json' });
  assert.deepEqual(v1.requests[0].tools.map((t) => t.name), ['read_page', 'search']);
  assert.deepEqual([r1.ok, r1.searches, r1.otherTools], [true, ['安省 补助'], []]);
  assert.equal(a.requests.at(-1).body.query, '安省 补助');
  const result = v1.requests[1].messages[2].content[0].content;
  assert.ok(result.includes('https://grants.example.test/list') && result.includes('安省补助目录'), result);
});
