// 1.0.1 (docs/checks/2026-11-17-1.0.1/contract.md): the core's part of the five fixes.
//   F1  a source card (add / remove / pause_source) is stale only when the ONE source it is about changed after it was made
//       (by the source's name) — three cards that add three sources of one library can be confirmed one after the other; two
//       cards about the same source: the one confirmed second is stale; the 11-09 rule (an add_source and an edit_topics card
//       of one turn do not make each other stale) is kept.
//   F3  the situation says the interface's language, and the rules say: a proposal's "why" in the interface's language unless
//       the user said plainly which one they want; "reply" / "ask" in the language of the user's message, as before.
//   F4  the rules' last sentence says the test fetch is done when the proposal is made, its result is on the proposal, and
//       nothing is tried again on 「确认」.
//   F5  the situation says the connection in use (its kind as the interface names it) and the two model slots (主模型 ·
//       核验模型); 「还没有连接」 when none is chosen; never a key, a part of one, or a path of this machine.
// Each rule first gets the input made to break it (the old code fails F1's first test, F3's and F5's situation tests).
// No network: every source is on a local fake server; every folder under os.tmpdir() (caseDir: mkdirSync).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary } from '../src/library/create.mjs';
import { addSource, setSourcePaused, updateSource } from '../src/library/sources.mjs';
import { confirmProposal, draftProposal } from '../src/proposals/index.mjs';
import { AGENT_SYSTEM } from '../src/agent/protocol.mjs';
import * as sit from '../src/agent/situation.mjs';
import { agentTurn, scriptedAgentConnector } from '../src/agent/index.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { rssWith } from './support/feeds.mjs';
import { hashTree } from './support/pipeline.mjs';
import { caseDir } from './support/tmp.mjs';

const { situation } = sit;
const CLOCK = new Date(Date.UTC(2026, 10, 17, 15, 0, 0));
const now = () => CLOCK;
const srv = await startFakeServer();
after(() => srv.close());
const FEED = srv.route('/ok', { body: rssWith([{ title: 'One', url: 'https://x.test/1' }]) });
const fetchCtx = { timeoutMs: 1500, sleep: async () => {} };

function library(name) {
  const dir = caseDir(`v101-${name}`);
  createLibrary(dir, { name });
  const path = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  cfg.topics = [{ name: '评测', keywords: ['benchmark'] }];
  cfg.sources = [{ name: 'feed-a', kind: 'rss', url: FEED, topic: '评测' }, { name: 'hn-agents', kind: 'hn', query: 'agent', topic: '评测' }];
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return dir;
}
const names = (dir) => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8')).sources.map((s) => s.name);
const draft = (kind, params, dir) => draftProposal({ kind, params: { libraryId: 'a', ...params }, why: '因为你说过想追这个', by: 'agent' }, { libraryDir: dir, ctx: fetchCtx, now });
const addCard = (name, dir, extra = {}) => draft('add_source', { source: { name, kind: 'rss', url: `${FEED}?${name}`, ...extra } }, dir);
const confirm = (c, dir) => confirmProposal(c, { libraryDir: dir, now });

// ---------------------------------------------------------------- F1

test('v101 F1: three add_source cards of one library (three sources) — each is confirmed in turn, none goes stale', async () => {
  const dir = library('three');
  const cards = [await addCard('feed-b', dir), await addCard('feed-c', dir), await addCard('feed-d', dir)];
  for (const c of cards) assert.equal(c.status, 'pending');
  for (const c of cards) {
    const r = confirm(c, dir);
    assert.deepEqual([r.status, r.reason ?? null], ['confirmed', null], `${c.params.source.name}: confirmed after the ones before it`);
  }
  assert.deepEqual(names(dir), ['feed-a', 'hn-agents', 'feed-b', 'feed-c', 'feed-d']);
  // the other order too: the last one first
  const dir2 = library('three-reversed');
  const cards2 = [await addCard('feed-b', dir2), await addCard('feed-c', dir2), await addCard('feed-d', dir2)];
  for (const c of cards2.reverse()) assert.equal(confirm(c, dir2).status, 'confirmed', c.params.source.name);
});

test('v101 F1: two cards about the SAME source (by name) — the one confirmed second is stale and changes nothing', async () => {
  // two add_source cards that add a source of the same name (two addresses)
  const dir = library('same-add');
  const first = await addCard('feed-x', dir);
  const second = await draft('add_source', { source: { name: 'feed-x', kind: 'hn', query: 'other' } }, dir);
  assert.equal(confirm(first, dir).status, 'confirmed');
  const t = hashTree(dir);
  assert.deepEqual([confirm(second, dir).status, confirm(second, dir).reason], ['stale', 'changed']);
  assert.deepEqual(hashTree(dir), t, 'the stale card wrote nothing');
  // a pause and a removal of the same source: either way round, the second is stale
  for (const order of [['pause_source', 'remove_source'], ['remove_source', 'pause_source']]) {
    const d = library(`same-${order[0]}`);
    const cards = { pause_source: await draft('pause_source', { name: 'feed-a', paused: true }, d), remove_source: await draft('remove_source', { name: 'feed-a' }, d) };
    assert.equal(confirm(cards[order[0]], d).status, 'confirmed', `${order[0]} first`);
    assert.deepEqual([confirm(cards[order[1]], d).status, confirm(cards[order[1]], d).reason], ['stale', 'changed'], `${order[1]} after ${order[0]}`);
  }
  // the source changed by hand after the card (its address): the card about it is stale, a card about another is not
  const h = library('same-by-hand');
  const pauseA = await draft('pause_source', { name: 'feed-a', paused: true }, h);
  const pauseHn = await draft('pause_source', { name: 'hn-agents', paused: true }, h);
  updateSource(h, 'feed-a', { url: `${FEED}?moved` });
  assert.equal(confirm(pauseA, h).status, 'stale', 'its own source changed by hand');
  assert.equal(confirm(pauseHn, h).status, 'confirmed', 'control: the card about the other source still goes through');
});

test('v101 F1: removing A does not make adding B stale (either order); pausing A not removing B; a source added by hand neither', async () => {
  for (const order of [['remove', 'add'], ['add', 'remove']]) {
    const dir = library(`rm-add-${order[0]}`);
    const cards = { remove: await draft('remove_source', { name: 'feed-a' }, dir), add: await addCard('feed-b', dir) };
    for (const k of order) assert.equal(confirm(cards[k], dir).status, 'confirmed', `${order.join(' then ')}: ${k}`);
    assert.deepEqual(names(dir), ['hn-agents', 'feed-b']);
  }
  const dir = library('pause-rm');
  const pause = await draft('pause_source', { name: 'feed-a', paused: true }, dir);
  const remove = await draft('remove_source', { name: 'hn-agents' }, dir);
  const add = await addCard('feed-b', dir);
  addSource(dir, { name: 'mine', kind: 'hn', query: 'rag' });
  setSourcePaused(dir, 'mine', true);
  for (const c of [remove, pause, add]) assert.equal(confirm(c, dir).status, 'confirmed', c.kind);
  assert.deepEqual(names(dir), ['feed-a', 'mine', 'feed-b']);
});

test('v101 F1: the 11-09 rule kept — an add_source and an edit_topics card of one turn, either confirmed first, both go through', async () => {
  for (const order of [['add_source', 'edit_topics'], ['edit_topics', 'add_source']]) {
    const dir = library(`uc3-${order[0]}`);
    const cards = { add_source: await addCard('feed-b', dir, { topic: '评测' }), edit_topics: await draft('edit_topics', { ops: [{ op: 'add_keywords', topic: '评测', keywords: ['公告'] }] }, dir) };
    for (const k of order) assert.equal(confirm(cards[k], dir).status, 'confirmed', `${order.join(' then ')}: ${k}`);
  }
});

// ---------------------------------------------------------------- F3 · F4

const world = (name) => {
  const dir = library(`sit-${name}`);
  return { dir, registry: { libraries: [{ id: 'aaaaaaaa', path: dir, name: '评测库', addedAt: '2026-11-01T00:00:00.000Z' }] } };
};

test('v101 F3: the situation says the interface\'s language — 中文 under a Chinese interface, 英文 under an English one', () => {
  const w = world('lang');
  const zh = situation(w.registry, { now, language: 'zh-CN' }).text;
  const en = situation(w.registry, { now, language: 'en' }).text;
  assert.match(zh, /^界面语言：中文（zh-CN）$/m);
  assert.match(en, /^界面语言：英文（en）$/m);
  assert.doesNotMatch(zh, /界面语言：英文/);
  assert.doesNotMatch(en, /界面语言：中文/);
  // none given (a caller of before 1.0.1): Chinese, as the app's own default
  assert.match(situation(w.registry, { now }).text, /^界面语言：中文（zh-CN）$/m);
  // the line is in the head: a situation cut to its smallest still says it
  assert.match(situation(w.registry, { now, language: 'en', maxChars: 200 }).text, /界面语言：英文（en）/);
});

test('v101 F3: the rules — "why" in the interface\'s language unless the user said plainly which one; "reply" and "ask" in the user\'s', () => {
  const rule5 = AGENT_SYSTEM.split('\n').find((l) => l.startsWith('5. '));
  assert.ok(rule5, 'rule 5 is there');
  assert.match(rule5, /"reply" and "ask" in the language of the user's message/);
  assert.match(rule5, /each proposal's "why" in the interface's language the situation gives \(界面语言\)/);
  assert.match(rule5, /unless the user has said plainly which language they want/);
  // control: the rule of before (the why follows the user's message) is not what it says any more
  assert.doesNotMatch(rule5, /^5\. Write "reply" and "ask" in the language of the user's message\.$/);
});

test('v101 F4: the rules\' last sentence — the test fetch is done when the proposal is made, its result is on it, not again on 「确认」', () => {
  const last = AGENT_SYSTEM.trim().split('\n').at(-1);
  assert.match(last, /when the proposal is made/);
  assert.match(last, /result is shown on the proposal/);
  assert.match(last, /nothing is tried again when the user confirms/);
  assert.match(last, /never that it will be tried on 「确认」/);
  // control: a rule that said only 「tries a new source once」 would not say when
  assert.doesNotMatch('Streams checks every proposal, tries a new source once, and works out the before and after itself.', /when the proposal is made/);
});

// ---------------------------------------------------------------- F5

const FAKE_KEY = 'sk-ant-api03-FAKEKEYv101-0123456789abcdefABCDEF';

test('v101 F5: the situation says the connection and the two model slots; 「还没有连接」 when none is chosen', () => {
  const w = world('conn');
  const none = situation(w.registry, { now, connection: null }).text;
  assert.match(none, /^当前连接：还没有连接/m);
  const cc = situation(w.registry, { now, connection: { kind: 'claude-code', model: 'claude-opus-5-5', verifyModel: 'claude-haiku-5-5' } }).text;
  assert.match(cc, /^当前连接：连接你电脑上的 Claude Code；主模型：Opus 5\.5（claude-opus-5-5）；核验模型：Haiku 5\.5（claude-haiku-5-5）$/m);
  assert.match(cc, /评分、摘要、问库与主 Agent 均使用当前连接的主模型；核验使用核验模型。/);
  const cx = situation(w.registry, { now, connection: { kind: 'codex', model: null, verifyModel: null } }).text;
  assert.match(cx, /^当前连接：连接你电脑上的 Codex；主模型：未指定（使用 Codex 自己的默认模型）；核验模型：同主模型$/m);
  const api = situation(w.registry, { now, connection: { kind: 'api', vendor: 'deepseek', model: 'deepseek-chat', verifyModel: 'deepseek-chat' } }).text;
  assert.match(api, /^当前连接：API key（DeepSeek）；主模型：DeepSeek Chat（deepseek-chat）；核验模型：同主模型$/m);
  // a model typed by hand (not in the table): its id as it is
  assert.match(situation(w.registry, { now, connection: { kind: 'api', vendor: 'custom', model: 'my-local-model', verifyModel: 'cheap-one' } }).text, /主模型：my-local-model；核验模型：cheap-one/);
  // control: a connection the core does not know is said as none, not guessed
  assert.match(situation(w.registry, { now, connection: { kind: 'telnet', model: 'x' } }).text, /^当前连接：还没有连接/m);
});

test('v101 F5 (the other way): a key given beside the connection, in any field, is nowhere in the situation; nor a path of this machine', () => {
  const w = world('key');
  const conn = {
    kind: 'api', vendor: 'anthropic', model: 'claude-opus-5-5', verifyModel: null,
    key: FAKE_KEY, apiKey: FAKE_KEY, keyHint: FAKE_KEY.slice(-4), keyRef: 'key-anthropic', baseUrl: 'http://127.0.0.1:9/v1', cwd: 'C:\\Users\\someone\\AppData\\Local\\Temp\\streams-agent-cwd',
    api: { vendor: 'anthropic', key: FAKE_KEY, keyRef: 'key-anthropic' }, connection: { api: { key: FAKE_KEY } },
  };
  const text = situation(w.registry, { now, connection: conn }).text;
  assert.match(text, /当前连接：API key（Anthropic）；主模型：Opus 5\.5（claude-opus-5-5）；核验模型：同主模型/, 'control: the connection is said');
  // no piece of the key: every 6 characters of it in a row
  for (let i = 0; i + 6 <= FAKE_KEY.length; i++) assert.ok(!text.includes(FAKE_KEY.slice(i, i + 6)), `a piece of the key: ${FAKE_KEY.slice(i, i + 6)}`);
  for (const bit of ['key-anthropic', '127.0.0.1', 'AppData', 'C:\\', 'streams-agent-cwd']) assert.ok(!text.includes(bit), bit);
  // the facts given to the situation are the four plain fields and nothing else
  assert.equal(typeof sit.connectionFacts, 'function', 'connectionFacts is exported');
  assert.deepEqual(Object.keys(sit.connectionFacts(conn)).sort(), ['kind', 'model', 'vendor', 'verifyModel']);
  // control: the check above sees a key that is there
  assert.ok(`${text}\n${FAKE_KEY}`.includes(FAKE_KEY.slice(10, 16)));
  // a model slot that is not a plain short name (a path, a key typed into the model's box) is not said either
  const odd = situation(w.registry, { now, connection: { kind: 'api', vendor: 'custom', model: 'C:\\Users\\someone\\models\\x.gguf', verifyModel: FAKE_KEY } }).text;
  assert.ok(!odd.includes('C:\\Users') && !odd.includes(FAKE_KEY.slice(0, 12)), odd.split('\n').find((l) => l.startsWith('当前连接')));
});

test('v101 F3 · F5: agentTurn hands the interface\'s language and the connection to the situation the model is given', async () => {
  const w = world('turn');
  const agentDir = caseDir('v101-turn-agent');
  for (const [language, said] of [['en', '界面语言：英文（en）'], ['zh-CN', '界面语言：中文（zh-CN）']]) {
    const c = scriptedAgentConnector({ answers: [{ reply: 'ok' }] });
    await agentTurn({ text: 'hello' }, { agentDir, connector: c, registry: w.registry, proposals: [], now, language, connection: { kind: 'claude-code', model: 'claude-sonnet-5-5', verifyModel: null, key: FAKE_KEY } });
    const prompt = c.sends()[0].prompt;
    assert.ok(prompt.includes(said), `${language}: ${said}`);
    assert.ok(prompt.includes('当前连接：连接你电脑上的 Claude Code；主模型：Sonnet 5.5（claude-sonnet-5-5）；核验模型：同主模型'));
    assert.ok(!prompt.includes(FAKE_KEY.slice(0, 12)), 'no key in what the model is sent');
  }
  // the connection given as a function (the desktop's: read at the turn)
  const c = scriptedAgentConnector({ answers: [{ reply: 'ok' }] });
  await agentTurn({ text: '你好' }, { agentDir, connector: c, registry: w.registry, proposals: [], now, connection: () => null });
  assert.ok(c.sends()[0].prompt.includes('当前连接：还没有连接'));
});
