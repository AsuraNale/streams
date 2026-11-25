// 1.1.1 P4 (acceptance A3, C6): the model API with Streams' own tools (connect/api-tools.mjs). A stand-in for the vendor's
// API (a fetch that answers by script, in the Anthropic and the OpenAI-compatible way) asks for tools; Streams runs them and
// sends the results back; the conversation is kept on disk and replayed. The guards: a hard budget, public addresses only, no
// tool off the list. Then one build and one update walked through with it — what comes in goes through the same checks as
// for any other connection. Each check holds first the state that would make it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApiToolSession, publicAddress, OUT_OF_BUDGET, ANSWER_NOW } from '../src/connect/api-tools.mjs';
import { API_TOOLS, budgetText, BUILD_BUDGET } from '../src/build/format.mjs';
import {
  createBuild, cardHandlers, createActionRunner, loadDefinition, createLibrary, writeCard, runUpdate, listInbox,
  readOriginal, originalId, saveOriginal, UPDATE_BUDGET,
} from '../src/index.mjs';
import { updateBudgetText } from '../src/update/format.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { caseDir } from './support/tmp.mjs';

const KEY = 'sk-test-0123456789abcdef';
const DEF = loadDefinition();
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }];
const conn = (vendor = 'anthropic') => ({ kind: 'api', model: 'm-1', api: { vendor, baseUrl: vendor === 'anthropic' ? 'https://api.example.test' : 'https://api.example.test/v1', keyRef: 'k' } });

// the vendor's API, by script: step(body, i) -> the answer's JSON; every request kept
function vendor(step) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, headers: init.headers, body });
    const json = step(body, requests.length - 1);
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
  return { requests, fetchImpl };
}
const A = {
  tools: (...calls) => ({ content: calls.map(([name, input], i) => ({ type: 'tool_use', id: `tu_${i}_${name}`, name, input })), stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } }),
  text: (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }),
};
const O = {
  tools: (...calls) => ({ choices: [{ message: { role: 'assistant', content: null, reasoning_content: '想一想', tool_calls: calls.map(([name, input], i) => ({ id: `call_${i}`, type: 'function', function: { name, arguments: JSON.stringify(input) } })) }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
  text: (t) => ({ choices: [{ message: { role: 'assistant', content: t }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
};
// Streams' page reader by table; every call kept
function pages(table) {
  const calls = [];
  return { calls, read: async (url) => { calls.push(url); const t = table[url]; return t ? { url, ok: true, method: t.method ?? 'direct', title: t.title ?? '页', text: t.text } : { url, ok: false, reason: 'dead' }; } };
}
const session = (v, p, extra = {}) => createApiToolSession(conn(extra.vendor), { getKey: async () => KEY, fetchImpl: v.fetchImpl }, { sessionDir: join(caseDir(extra.dir ?? 'p4-s'), 'sessions'), readPage: p.read, lookup: PUBLIC, ...extra.opts });
const P1 = 'https://news.example.test/a';
const P2 = 'https://news.example.test/b';

test('the loop, Anthropic style: two tools asked at once, run by Streams, the results sent back; then the answer', async () => {
  const p = pages({ [P1]: { text: '正文甲：补助截止 12 月 3 日。' }, [P2]: { text: '正文乙：额度 50 万。' } });
  const v = vendor((body, i) => (i === 0 ? A.tools(['read_page', { url: P1 }], ['read_page', { url: P2 }]) : A.text('{"ok":true}')));
  const r = await session(v, p, { dir: 'p4-a' }).send({ prompt: '读这两页', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.json, { ok: true });
  assert.deepEqual(p.calls, [P1, P2], 'Streams read both');
  assert.deepEqual(r.reads, [{ url: P1, ok: true }, { url: P2, ok: true }]);
  assert.equal(v.requests.length, 2);
  assert.deepEqual(v.requests[0].body.tools.map((t) => t.name), ['read_page'], 'no search service: no search tool');
  const second = v.requests[1].body.messages;
  assert.equal(second[1].role, 'assistant');
  assert.deepEqual(second[1].content.map((b) => b.type), ['tool_use', 'tool_use']);
  const results = second[2].content;
  assert.deepEqual(results.map((b) => [b.type, b.tool_use_id]), [['tool_result', 'tu_0_read_page'], ['tool_result', 'tu_1_read_page']]);
  assert.ok(results[0].content.includes('正文甲') && results[1].content.includes('正文乙'));
  assert.equal(v.requests[0].headers['x-api-key'], KEY);
});

test('the loop, OpenAI-compatible style: tool_calls, role tool with tool_call_id, the assistant message sent back as it came', async () => {
  const p = pages({ [P1]: { text: '正文甲：补助截止 12 月 3 日。' } });
  const v = vendor((body, i) => (i === 0 ? O.tools(['read_page', { url: P1 }]) : O.text('{"ok":true}')));
  const r = await session(v, p, { dir: 'p4-o', vendor: 'deepseek' }).send({ prompt: '读一页', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(v.requests[0].url, /\/chat\/completions$/);
  assert.deepEqual(v.requests[0].body.tools.map((t) => [t.type, t.function.name]), [['function', 'read_page']]);
  const m = v.requests[1].body.messages;
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'tool']);
  assert.equal(m[1].tool_calls[0].id, 'call_0');
  assert.equal(m[1].reasoning_content, '想一想', 'DeepSeek\'s reasoning goes back with its message');
  assert.equal(m[2].tool_call_id, 'call_0');
  assert.ok(m[2].content.includes('正文甲'));
  assert.equal(v.requests[0].headers.authorization, `Bearer ${KEY}`);
});

test('the conversation is Streams\': the second turn replays the first; a new connection object picks it up; an unknown id is a lost session', async () => {
  const p = pages({ [P1]: { text: '正文甲。' } });
  const v = vendor((body) => (body.messages.at(-1).role === 'user' && typeof body.messages.at(-1).content === 'string' && body.messages.length === 1 ? A.tools(['read_page', { url: P1 }]) : A.text(`{"turn":${body.messages.filter((x) => x.role === 'user' && typeof x.content === 'string').length}}`)));
  const kept = join(caseDir('p4-replay'), 'sessions');
  const s1 = session(v, p, { opts: { sessionDir: kept } });
  const first = await s1.send({ prompt: '第一轮', format: 'json' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.resumed, false);
  const again = session(v, p, { opts: { sessionDir: kept } }); // the app restarted: a new object, the same folder
  const second = await again.send({ prompt: '第二轮', format: 'json' }, { sessionId: first.sessionId });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.deepEqual(second.json, { turn: 2 });
  assert.equal(second.resumed, true);
  const replayed = v.requests.at(-1).body.messages;
  assert.equal(replayed[0].content, '第一轮');
  assert.ok(replayed.some((x) => x.role === 'user' && Array.isArray(x.content) && x.content[0].type === 'tool_result'), 'the first turn\'s tool round trip replayed');
  assert.equal(replayed.at(-1).content, '第二轮');
  const lost = await again.send({ prompt: '第三轮', format: 'json' }, { sessionId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(lost.ok, false);
  assert.equal(lost.sessionLost, true);
});

test('read_page is Streams\' own reader: onPage gets the text the model gets; a page it cannot read is reads ok:false', async () => {
  const kept = [];
  const p = pages({ [P1]: { text: '正文甲：补助截止 12 月 3 日。' } });
  const v = vendor((body, i) => (i === 0 ? A.tools(['read_page', { url: P1 }], ['read_page', { url: P2 }]) : A.text('{"ok":true}')));
  const r = await session(v, p, { dir: 'p4-own', opts: { onPage: (url, page) => kept.push([url, page.text]) } }).send({ prompt: '读', format: 'json' });
  assert.deepEqual(kept, [[P1, '正文甲：补助截止 12 月 3 日。']]);
  const given = v.requests[1].body.messages[2].content;
  assert.ok(given[0].content.includes(kept[0][1]), 'the model got the same text');
  assert.equal(given[1].is_error, true);
  assert.deepEqual(r.reads, [{ url: P1, ok: true }, { url: P2, ok: false }]);
});

test('the budget is hard: 21 reads asked with room for 20 — the 21st is 「额度用完了」 and the reader is called 20 times', async () => {
  const table = {};
  const urls = Array.from({ length: 21 }, (_, i) => `https://news.example.test/p${i}`);
  for (const u of urls) table[u] = { text: `正文 ${u}` };
  const p = pages(table);
  const v = vendor((body, i) => (i === 0 ? A.tools(...urls.map((url) => ['read_page', { url }])) : A.text('{"ok":true}')));
  const r = await session(v, p, { dir: 'p4-budget', opts: { budget: { reads: 20, searches: 0 } } }).send({ prompt: '读', format: 'json' });
  assert.equal(r.ok, true);
  assert.equal(p.calls.length, 20, 'the reader stopped at the number');
  const results = v.requests[1].body.messages[2].content;
  assert.equal(results.length, 21);
  assert.equal(results[20].content, OUT_OF_BUDGET);
  assert.equal(results[19].content.includes('正文'), true);
  // the number the agent is told is the number it gets (an API connection: no 「约」)
  assert.ok(budgetText({ ...BUILD_BUDGET, reads: 20 }, { search: false, hard: true }).includes('最多 20 次读网页'));
});

test('public pages only: this machine, a private network, file:, a name that resolves inside — none is read', async () => {
  const bad = ['http://127.0.0.1/x', 'http://localhost:8080/x', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'http://172.20.0.1/x', 'http://169.254.169.254/latest', 'http://[::1]/x', 'file:///C:/Windows/win.ini', 'http://router.home.arpa/', 'https://inside.example.test/x'];
  const lookup = async (host) => (host === 'inside.example.test' ? [{ address: '10.0.0.9', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
  // what would fail it: the same addresses through an open guard are read (the control: a public one is)
  assert.deepEqual(await publicAddress(P1, { lookup }), { ok: true });
  for (const u of bad) assert.equal((await publicAddress(u, { lookup })).ok, false, u);
  const p = pages(Object.fromEntries(bad.map((u) => [u, { text: '机密' }])));
  const v = vendor((body, i) => (i === 0 ? A.tools(...bad.map((url) => ['read_page', { url }])) : A.text('{"ok":true}')));
  const r = await session(v, p, { dir: 'p4-guard', opts: { lookup } }).send({ prompt: '读', format: 'json' });
  assert.equal(r.ok, true);
  assert.deepEqual(p.calls, [], 'the reader was never called');
  const results = v.requests[1].body.messages[2].content;
  assert.ok(results.every((x) => x.is_error === true && !x.content.includes('机密')), JSON.stringify(results.map((x) => x.content)));
});

// ---- a build and an update, walked through ----
const SRC = 'https://grants.example.test/list';
const SAMPLE = 'https://grants.example.test/p/1';
const LOCKED = 'https://board.example.test/members';
const CARD = () => ({
  name: '补助',
  definition: { summary: '一座找补助的库。', purpose: '找补助', scope: '对象：小企业；地域：安省', exclude: '贷款', trust: '官方', rhythm: '每周一次', language: '中文', hard: '不用还' },
  collect: ['设备补助'], skip: ['贷款'], sources: [{ name: '补助目录', url: SRC, status: '读得到' }],
  unreadable: [{ name: '委员会', url: LOCKED, reason: '要登录' }], pick: ['新的先收'], write: ['写清截止日期'],
  samples: [{ title: '样例', url: SAMPLE, date: '2026-11-20' }],
});
function buildWorld(name) {
  const root = caseDir(name);
  const libDir = join(root, 'library');
  const runner = createActionRunner({ definition: DEF, handlers: cardHandlers({ libraryDirFor: () => libDir, dirOfLibrary: () => libDir }), pendingDir: join(root, 'pending'), logFile: (a, params, result) => join(result.object.id, '_actions.jsonl') });
  return { root, libDir, runner };
}

test('a tool not on the list (write_file): not run, the build stops as with another tool; nothing made', async () => {
  const w = buildWorld('p4-unknown');
  const p = pages({});
  const v = vendor((body, i) => (i === 0 ? A.tools(['write_file', { path: 'C:/x.txt', text: 'hi' }]) : A.text(JSON.stringify({ say: '写好了', card: CARD() }))));
  const s = session(v, p, { dir: 'p4-unknown' });
  const out = await createBuild({ connector: s, definition: DEF, runner: w.runner, kind: 'api', search: false, today: '2026-11-24' }).start('帮我找补助');
  assert.deepEqual([out.kind, out.notice], ['stopped', 'other-tool']);
  const results = v.requests[1].body.messages[2].content;
  assert.match(results[0].content, /没有「write_file」这个工具/);
  assert.equal(existsSync(join(w.libDir)), false, 'nothing made');
  assert.equal(existsSync('C:/x.txt'), false);
});

test('a build walked through: the model reads with read_page, hands in the card, it can be confirmed, the library is made; it was told only of reading pages, with the hard number', async () => {
  const w = buildWorld('p4-build');
  const table = { [SRC]: { text: '补助目录：设备补助、工资补贴。' }, [SAMPLE]: { text: '设备补助：截止 12 月 3 日，额度 50 万。' } };
  const p = pages(table);
  const v = vendor((body, i) => (i === 0 ? A.tools(['read_page', { url: SRC }], ['read_page', { url: SAMPLE }], ['read_page', { url: LOCKED }]) : A.text(JSON.stringify({ say: '请看卡', card: CARD() }))));
  const s = session(v, p, { dir: 'p4-build', opts: { budget: { reads: BUILD_BUDGET.reads + BUILD_BUDGET.changeReads, searches: 0 } } });
  const b = createBuild({ connector: s, definition: DEF, runner: w.runner, kind: 'api', search: false, today: '2026-11-24', readPage: p.read });
  const out = await b.start('帮我找补助');
  assert.equal(out.kind, 'card');
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  const told = v.requests[0].body.messages[0].content;
  assert.ok(told.includes(API_TOOLS.noSearch), 'the tools as they are');
  assert.ok(told.includes(budgetText(BUILD_BUDGET, { search: false, hard: true })), 'the budget: reads only, no 「约」');
  const tools = told.slice(told.indexOf(API_TOOLS.noSearch), told.indexOf(API_TOOLS.noSearch) + API_TOOLS.noSearch.length);
  assert.equal(/搜索/.test(tools) || /搜索/.test(budgetText(BUILD_BUDGET, { search: false, hard: true })), false, 'the tools and the budget speak of no search');
  assert.deepEqual(v.requests[0].body.tools.map((t) => t.name), ['read_page']);
  const done = await b.confirm();
  assert.equal(done.status, 'done');
  assert.ok(existsSync(join(w.libDir, '_card', 'card.json')));
});

test('an update walked through: a page the model read with read_page is kept as its original; its item passes the same checks as any connection\'s', async () => {
  const dir = join(caseDir('p4-update'), 'lib');
  createLibrary(dir, { name: '补助', language: 'zh-CN' });
  writeCard(dir, CARD());
  const NEW = 'https://grants.example.test/p/2';
  const sentence = (n) => `新补助第 ${n} 段：设备补助的第 ${n} 条规定，额度 ${n * 10} 万元，截止日期写在官方页上，申请要交三份材料。`;
  const table = { [SRC]: { text: '目录' }, [SAMPLE]: { text: '样例正文' }, [NEW]: { title: '新补助', text: [1, 2, 3, 4].map(sentence).join('\n\n') } };
  const p = pages(table);
  const readLinks = async (url) => (url === SRC ? { ok: true, url, links: [SAMPLE], method: 'direct' } : { ok: false, url, links: [], reason: 'dead' });
  const item = { url: NEW, title: '新补助', date: '2026-11-24', due: '', what: '一项新的设备补助。', points: [1, 2, 3].map((n) => ({ text: `第 ${n} 条`, quote: sentence(n) })), why: '在卡的范围里' };
  const v = vendor((body, i) => (i === 0 ? A.tools(['read_page', { url: NEW }]) : A.text(JSON.stringify({ items: [item], gaps: [] }))));
  const s = session(v, p, { dir: 'p4-update-sessions', opts: { budget: { reads: UPDATE_BUDGET.reads, searches: 0 }, onPage: (url, page) => saveOriginal(dir, { url, title: page.title, text: page.text, method: page.method, fetchedAt: new Date('2026-11-24T15:00:00Z') }) } });
  const judge = fakeConnector({ mode: 'counting', json: (req) => ({ items: [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map((m) => ({ id: m[1], passed: true, evidence: 'ok' })) }) });
  const r = await runUpdate(dir, { connector: s, judge, kind: 'api', search: false, readPage: p.read, readLinks, now: () => new Date('2026-11-24T15:00:00Z') });
  assert.equal(r.status, 'done', JSON.stringify(r.problems ?? r.record));
  const told = v.requests[0].body.messages[0].content;
  assert.ok(told.includes(API_TOOLS.noSearch) && told.includes(updateBudgetText(UPDATE_BUDGET, { search: false, hard: true })));
  assert.equal(told.includes('次搜索'), false, 'B26: no search count in what the update agent is told');
  const stored = readOriginal(dir, originalId(NEW));
  assert.ok(stored && stored.text.includes(sentence(1)), 'the page the model read is the kept original');
  const inbox = listInbox(dir);
  assert.deepEqual(inbox.map((c) => c.url), [NEW]);
  assert.equal(inbox[0].verification?.passed, true, JSON.stringify(inbox[0].verification));
  assert.equal(p.calls.filter((u) => u === NEW).length, 1, 'read once: the item\'s original is the page the model read');
  // the key is nowhere in what was kept
  for (const f of ['_pipeline/rounds.jsonl']) assert.equal(readFileSync(join(dir, f), 'utf8').includes(KEY), false);
});

// ---- round 2 of P4's check (Richard): the search budget, the key in failures, no 「次搜索」 without search (B26) ----
test('the search budget is hard too: 2 searches asked with room for 1 — the 2nd is 「额度用完了」 and the service is called once', async () => {
  const asked = [];
  const search = async (q) => { asked.push(q); return { ok: true, results: [{ title: 't', url: 'https://r.example.test/1', snippet: 's' }] }; };
  const v = vendor((body, i) => (i === 0 ? A.tools(['search', { query: '甲' }], ['search', { query: '乙' }]) : A.text('{"ok":true}')));
  const r = await session(v, pages({}), { dir: 'p4-search-budget', opts: { search, budget: { reads: 5, searches: 1 } } }).send({ prompt: '搜', format: 'json' });
  assert.equal(r.ok, true);
  assert.deepEqual(asked, ['甲'], 'the service was called once');
  assert.deepEqual(r.searches, ['甲']);
  const results = v.requests[1].body.messages[2].content;
  assert.match(results[1].content, /额度用完了/);
});

test('a failure from the vendor never carries the key back (an error page that echoes it)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: `invalid x-api-key ${KEY}`, type: 'authentication_error' } }) });
  const s = createApiToolSession(conn(), { getKey: async () => KEY, fetchImpl }, { sessionDir: join(caseDir('p4-key-fail'), 's'), readPage: pages({}).read, lookup: PUBLIC });
  const r = await s.send({ prompt: 'x', format: 'json' });
  assert.deepEqual([r.ok, r.code], [false, 'bad-key']);
  assert.equal(JSON.stringify(r).includes(KEY), false, JSON.stringify(r));
  const thrown = createApiToolSession(conn(), { getKey: async () => KEY, fetchImpl: async () => { throw new Error(`socket closed for ${KEY}`); } }, { sessionDir: join(caseDir('p4-key-throw'), 's'), readPage: pages({}).read, lookup: PUBLIC });
  const t = await thrown.send({ prompt: 'x', format: 'json' });
  assert.equal(t.code, 'network');
  assert.equal(JSON.stringify(t).includes(KEY), false);
});

test('B26: with no search, what the build agent is told has no 「次搜索」 anywhere — its first step reads pages; with search it is as before', async () => {
  const { buildBuildPrompt } = await import('../src/index.mjs');
  const without = buildBuildPrompt({ definition: DEF, kind: 'api', today: '2026-11-24', opener: '帮我找补助', search: false });
  assert.equal(without.includes('次搜索'), false, 'no search count anywhere');
  assert.ok(without.includes('这一次没有搜索工具'), 'the first step says so');
  const withSearch = buildBuildPrompt({ definition: DEF, kind: 'api', today: '2026-11-24', opener: '帮我找补助', search: true });
  assert.ok(withSearch.includes('先用最多 3 次搜索'), 'what would fail it: with search the count is there');
});

// 1.1.1 P13 (E6 on DeepSeek, 11-25): the model used the whole read budget in its first turn and went on asking for pages,
// turned away each time, until 60 steps — the build failed. Now after two steps turned away it is made to answer.
for (const style of ['anthropic', 'openai']) {
  test(`P13 (${style}): a model that goes on asking past its budget is made to answer — tool_choice none and 「现在交回答」, then its answer`, async () => {
    const p = pages({ [P1]: { text: '正文甲。' }, [P2]: { text: '正文乙。' } });
    const W = style === 'anthropic' ? A : O;
    // it asks for a page every time, unless it may not use a tool
    const v = vendor((body, i) => (body.tool_choice === 'none' || body.tool_choice?.type === 'none' ? W.text('{"done":true}') : W.tools(['read_page', { url: i % 2 ? P2 : P1 }])));
    const s = session(v, p, { dir: `p13-closing-${style}`, vendor: style === 'anthropic' ? 'anthropic' : 'deepseek', opts: { budget: { reads: 2, searches: 0 }, maxSteps: 12 } });
    const r = await s.send({ prompt: '一直读', format: 'json' });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.deepEqual(r.json, { done: true });
    assert.equal(p.calls.length, 2, 'the reader was called within the budget only');
    // two pages read, two steps turned away, then the request that allows no tool
    assert.equal(v.requests.length, 5, `${v.requests.length} requests`);
    const last = v.requests.at(-1).body;
    assert.ok(last.tool_choice === 'none' || last.tool_choice?.type === 'none', JSON.stringify(last.tool_choice));
    assert.ok(JSON.stringify(last.messages).includes(ANSWER_NOW), 'told to answer now');
    assert.ok(v.requests.slice(0, 4).every((q) => q.body.tool_choice === undefined), 'tools allowed until then');
  });
}

test('P13: the last step allowed asks for the answer even with budget left — no turn runs into the step limit', async () => {
  const p = pages({ [P1]: { text: '正文甲。' } });
  const v = vendor((body) => (body.tool_choice?.type === 'none' ? A.text('{"done":true}') : A.tools(['read_page', { url: P1 }])));
  const r = await session(v, p, { dir: 'p13-closing-last', opts: { budget: { reads: 50, searches: 0 }, maxSteps: 4 } }).send({ prompt: '一直读', format: 'json' });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(v.requests.length, 4);
  assert.equal(v.requests.at(-1).body.tool_choice?.type, 'none');
});

// 1.1.1 P13 (E6 on DeepSeek, 11-25): the update agent "called" submit_items — the action its SOP names — as a tool, with the
// items as its input; the update stopped as for a tool off the list. Its input is the answer it hands in: read as that.
for (const style of ['anthropic', 'openai']) {
  test(`P13 (${style}): a "call" of submit_items is the answer — its input is the JSON handed in; nothing is run; the next turn goes on`, async () => {
    const p = pages({ [P1]: { text: '正文甲。' } });
    const W = style === 'anthropic' ? A : O;
    const handed = { items: [{ url: P1, title: '甲' }], sources: [], gaps: [] };
    const v = vendor((body, i) => (i === 0 ? W.tools(['read_page', { url: P1 }]) : i === 1 ? W.tools(['submit_items', handed]) : W.text('{"items":[]}')));
    const s = session(v, p, { dir: `p13-answeras-${style}`, vendor: style === 'anthropic' ? 'anthropic' : 'deepseek', opts: { answerActions: ['submit_items'] } });
    const r = await s.send({ prompt: '交条目', format: 'json' });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.deepEqual(r.json, handed)
    assert.deepEqual(r.otherTools, [], 'not a tool off the list')
    // the kept conversation carries the answer as text (no call left without its result): a second turn is accepted
    const r2 = await s.send({ prompt: '再来', format: 'json' }, { sessionId: r.sessionId });
    assert.equal(r2.ok, true, JSON.stringify(r2).slice(0, 300));
    const second = v.requests.at(-1).body.messages;
    const said = second.filter((m) => m.role === 'assistant').map((m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((b) => b.text ?? '').join(''))).join(' ')
    assert.ok(said.includes(JSON.stringify(handed)), 'the answer is in the conversation, as text');
  });
}
test('P13: without answerActions a submit_items call is still a tool off the list (control)', async () => {
  const v = vendor((body, i) => (i === 0 ? A.tools(['submit_items', { items: [] }]) : A.text('{"items":[]}')));
  const r = await session(v, pages({}), { dir: 'p13-answeras-control' }).send({ prompt: '交', format: 'json' });
  assert.deepEqual(r.otherTools, ['submit_items']);
});
