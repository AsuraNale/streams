// The main agent (v2 package C, contract C1–C2; src/agent/): the transcript (append only, bad lines skipped), the session
// cache (lost or unreadable → a new session rebuilt from the transcript: summary + recent turns, N5; a failing resume the
// same), the situation (every item of C1, its limit and the order it is cut in), the turn (one ask at most, lookups at most
// three rounds then refused, a bad answer retried once and then neither a card nor a lookup nor a note, a bad card dropped
// and said, a good one made by package B's draftProposal with by: agent), the compression at its threshold, the usage.
// All on the scripted stand-in connection (no model call); every folder under os.tmpdir() (caseDir: mkdirSync).
// Each rule first gets the input made to break it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  agentTurn, appendTranscript, readTranscript, readSessions, writeSession, scriptedAgentConnector, situation, compressIfNeeded, charsSinceSummary,
  runLookup, checkAnswer, topLevelKeys, historyBlock, agentPaths, readAgentNotes, appendAgentNote,
  COMPRESS_THRESHOLD, AGENT_SUMMARY_MAX, NOT_UNDERSTOOD, TRUNCATED_MARK, SITUATION_MAX, MAX_LOOKUP_ROUNDS, NOTE_MAX,
} from '../src/agent/index.mjs';
import { createLibrary } from '../src/library/create.mjs';
import { addSource, addTopic } from '../src/library/sources.mjs';
import { saveBrief } from '../src/library/brief.mjs';
import { appendFetchLog } from '../src/fetch/log.mjs';
import { appendRoundRecord } from '../src/pipeline/rounds-log.mjs';
import { draftProposal } from '../src/proposals/proposals.mjs';
import { appendProposal, readProposals } from '../src/proposals/store.mjs';
import { recordSuggestions } from '../src/suggest/records.mjs';
import { suggestFor } from '../src/suggest/rules.mjs';
import { readUsageFile, usageTotal, createUsageCounter } from '../src/connect/usage.mjs';
import { caseDir } from './support/tmp.mjs';

const CLOCK = new Date('2026-11-05T16:00:00.000Z');
const now = () => CLOCK;

/** sha256 of every file under dir. */
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else out[relative(dir, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out;
}

/** A world: an agent folder, a proposals file, libraries made with createLibrary; createProposal = package B's draftProposal. */
function world(name, libs = [{ id: 'aaaaaaaa', name: 'AI 工具' }]) {
  const root = caseDir(`agent-${name}`);
  const agentDir = join(root, 'appData', 'agent');
  const proposalsFile = join(root, 'appData', 'proposals.jsonl');
  const registry = { libraries: [] };
  for (const [i, l] of libs.entries()) {
    const dir = join(root, `lib-${i}`);
    createLibrary(dir, { name: l.name });
    addTopic(dir, { name: 'agent 框架', keywords: ['agent framework', 'MCP'] });
    addSource(dir, { name: 'feed-a', kind: 'rss', url: 'https://example.com/a.xml', topic: 'agent 框架' });
    registry.libraries.push({ id: l.id, path: dir, name: l.name, addedAt: l.addedAt ?? `2026-11-0${i + 1}T10:00:00.000Z` });
  }
  const made = [];
  async function createProposal(kind, params, why, { by } = {}) {
    const entry = registry.libraries.find((l) => l.id === params?.libraryId);
    const card = await draftProposal({ kind, params, why, by }, { libraryDir: entry?.path ?? null, libraryRoot: join(root, 'new'), now, ctx: { fetchImpl: async () => { throw new Error('no network in tests'); } } });
    appendProposal(proposalsFile, card);
    made.push({ kind, params, why, by, id: card.id });
    return card;
  }
  const turn = (connector, text, extra = {}) => agentTurn({ text, ...extra }, { agentDir, connector, registry, proposals: () => readProposals(proposalsFile).cards, createProposal, now });
  return { root, agentDir, proposalsFile, registry, made, createProposal, turn, dir: (i = 0) => registry.libraries[i].path };
}

const editBrief = (brief = '只要一手资料') => ({ kind: 'edit_brief', params: { libraryId: 'aaaaaaaa', brief }, why: '你说要一手资料' });

// ---------------------------------------------------------------- the transcript and the session cache

test('transcript: append only (earlier bytes never change), every row of a turn carries its number, bad lines skipped and counted', async () => {
  const w = world('transcript');
  const c = scriptedAgentConnector({ answers: [{ reply: '一' }, { reply: '二' }] });
  const r1 = await w.turn(c, '第一句');
  const bytes1 = readFileSync(agentPaths(w.agentDir).transcript);
  const r2 = await w.turn(c, '第二句');
  const bytes2 = readFileSync(agentPaths(w.agentDir).transcript);
  assert.deepEqual([r1.turn, r2.turn], [1, 2]);
  assert.ok(bytes2.subarray(0, bytes1.length).equals(bytes1), 'the first turn\'s bytes are the start of the file, unchanged');
  const { rows, skipped } = readTranscript(w.agentDir);
  assert.deepEqual(rows.map((r) => [r.turn, r.role, r.text]), [[1, 'you', '第一句'], [1, 'agent', '一'], [2, 'you', '第二句'], [2, 'agent', '二']]);
  assert.equal(skipped, 0);
  // a bad line in the middle, a row of the wrong shape, a torn last line: skipped, the rest read; the next turn still appends
  appendFileSync(agentPaths(w.agentDir).transcript, 'not json\n{"at":"x","turn":"2","role":"you","text":"t"}\n{"at":"2026-11-05T00:00:00Z","turn":3,"role":"wizard","text":"t"}\n{"at":"2026');
  const again = readTranscript(w.agentDir);
  assert.equal(again.rows.length, 4);
  assert.equal(again.skipped, 4);
  const r3 = await w.turn(c, '第三句');
  assert.equal(r3.turn, 3);
  const last = readTranscript(w.agentDir);
  assert.deepEqual(last.rows.slice(-2).map((r) => r.text), ['第三句', '(the script has no more answers)']);
  assert.equal(last.skipped, 4, 'the torn line was closed off, not glued to the new row');
  assert.throws(() => appendTranscript(w.agentDir, { turn: 1, role: 'wizard', text: 'x' }), /role/);
});

test('session cache: missing or unreadable is {}; a CLI turn resumes the cached session and sends no history; a new one sends it', async () => {
  const w = world('session');
  assert.deepEqual(readSessions(w.agentDir), {}, 'no file: no error');
  writeFileSync(join(w.root, 'x'), '');
  const c = scriptedAgentConnector({ answers: [{ reply: '好的' }, { reply: '记得' }] });
  await w.turn(c, '记住暗号 heron-42');
  const s = readSessions(w.agentDir);
  assert.equal(s.fake.sessionId, 'fake-session-1');
  assert.equal(s.fake.turns, 1);
  await w.turn(c, '暗号是什么？');
  const [first, second] = c.sends();
  assert.equal(first.sessionId, null, 'the first turn opens a session');
  assert.equal(second.sessionId, 'fake-session-1', 'the second resumes it');
  assert.doesNotMatch(second.prompt, /## 最近的对话/, 'a resumed session is not sent the history again');
  assert.match(second.prompt, /# 局面/, 'the situation is in every turn');
  assert.equal(readSessions(w.agentDir).fake.turns, 2);
  // unreadable → {} (and the next turn opens a new session)
  writeFileSync(agentPaths(w.agentDir).session, '{ torn');
  assert.deepEqual(readSessions(w.agentDir), {});
  writeSession(w.agentDir, 'fake', { sessionId: 'x-1', startedAt: null, turns: 0, summarizedThrough: 0 });
  assert.equal(readSessions(w.agentDir).fake.sessionId, 'x-1');
});

test('N5: session.json deleted after a summary → the next turn opens a new session whose prompt has the summary and the recent turns', async () => {
  const w = world('n5');
  const c = scriptedAgentConnector({ answers: [{ reply: '好的，记下了' }, { reply: '是 heron-42' }, { reply: '接着聊' }], summary: '用户要追踪 agent 记忆；暗号 heron-42。' });
  await w.turn(c, '记住暗号 heron-42');
  await w.turn(c, '暗号是什么？');
  const comp = await compressIfNeeded({ agentDir: w.agentDir, connector: c, now, threshold: 10 });
  assert.equal(comp.compressed, true);
  rmSync(agentPaths(w.agentDir).session);
  const r = await w.turn(c, '我们之前在聊什么？');
  assert.equal(r.reply, '接着聊');
  const call = c.sends().at(-1);
  assert.equal(call.sessionId, null, 'no cached session: a new one');
  assert.match(call.prompt, /## 之前对话的摘要（到第 2 轮）\n用户要追踪 agent 记忆；暗号 heron-42。/);
  assert.match(call.prompt, /## 最近的对话\n用户：记住暗号 heron-42\n你（主 Agent）：好的，记下了\n用户：暗号是什么？\n你（主 Agent）：是 heron-42/);
  assert.match(call.prompt, /## 这一轮\n用户：我们之前在聊什么？/);
  assert.equal(readSessions(w.agentDir).fake.sessionId, 'fake-session-2', 'the new session is cached');
  assert.equal(readSessions(w.agentDir).fake.summarizedThrough, 2);
});

test('N5: a resume that fails (sessionLost) → a note, then a new session with the context rebuilt; the turn answers as usual', async () => {
  const w = world('lost');
  const answers = [{ reply: '一' }, { $lost: true }, { reply: '二（新会话）' }];
  const c = scriptedAgentConnector({ answers });
  await w.turn(c, '第一句');
  const r = await w.turn(c, '第二句');
  assert.equal(r.reply, '二（新会话）');
  assert.deepEqual(r.notice, [{ code: 'session-rebuilt' }]);
  const sends = c.sends();
  assert.equal(sends.length, 3);
  assert.equal(sends[1].sessionId, 'fake-session-1', 'tried to resume');
  assert.equal(sends[2].sessionId, null, 'then a new one');
  assert.match(sends[2].prompt, /## 最近的对话\n用户：第一句\n你（主 Agent）：一/, 'rebuilt from the transcript');
  assert.doesNotMatch(sends[1].prompt, /## 最近的对话/);
  const rows = readTranscript(w.agentDir).rows;
  assert.ok(rows.some((x) => x.role === 'note' && x.turn === 2 && x.data?.session === 'lost'));
  assert.equal(readSessions(w.agentDir).fake.sessionId, 'fake-session-2');
});

test('API (no session): every call carries the history; the transcript is replayed', async () => {
  const w = world('api');
  const c = scriptedAgentConnector({ sessionful: false, answers: [{ reply: '一' }, { reply: '', lookups: [{ what: 'library', libraryId: 'aaaaaaaa' }] }, { reply: '二' }] });
  await w.turn(c, '第一句');
  await w.turn(c, '第二句');
  const sends = c.sends();
  assert.doesNotMatch(sends[0].prompt, /## 最近的对话/, 'nothing to replay yet');
  for (const s of sends.slice(1)) {
    assert.equal(s.sessionId, null);
    assert.match(s.prompt, /## 最近的对话\n用户：第一句\n你（主 Agent）：一/);
    assert.match(s.prompt, /## 这一轮\n用户：第二句/);
  }
  assert.match(sends[2].prompt, /查到的结果/, 'the follow-up after a lookup is replayed whole too');
  assert.deepEqual(readSessions(w.agentDir), {}, 'an API connection caches no session');
});

// ---------------------------------------------------------------- the situation

test('situation: every item of C1 for each library, the month\'s use with the agent\'s own, the newest notes', () => {
  const w = world('situation', [{ id: 'aaaaaaaa', name: 'AI 工具' }, { id: 'bbbbbbbb', name: '读书' }]);
  const dir = w.dir(0);
  saveBrief(dir, '追踪 AI 编程工具'.padEnd(250, '。'));
  addSource(dir, { name: 'hn', kind: 'hn', query: 'agent' });
  addSource(dir, { name: 'paused-one', kind: 'hn', query: 'x', paused: true });
  for (const [i, d] of ['02', '03', '04'].entries()) {
    appendFetchLog(dir, { ts: `2026-11-${d}T08:30:00.000Z`, round: `r${i}`, source: 'feed-a', kind: 'rss', status: 'blocked', http: 403, count: 0, new: 0 });
    appendFetchLog(dir, { ts: `2026-11-${d}T08:30:01.000Z`, round: `r${i}`, source: 'hn', kind: 'hn', status: 'ok', count: 5, new: 1 });
    appendRoundRecord(dir, { id: `r${i}`, startedAt: `2026-11-${d}T08:30:00.000Z`, counts: { inbox: 0 } });
  }
  recordSuggestions(dir, suggestFor(dir, { now }), { now });
  createUsageCounter(dir).record({ ts: '2026-11-04T10:00:00.000Z', kind: 'claude-code', purpose: 'score', calls: 4 });
  appendFileSync(join(w.root, 'agent-usage.jsonl'), `${JSON.stringify({ ts: '2026-11-05T10:00:00.000Z', kind: 'claude-code', model: 'm', calls: 2, purpose: 'agent' })}\n`);
  const cards = [{ id: 'p-1', kind: 'edit_cap', libraryId: 'aaaaaaaa', status: 'pending' }, { id: 'p-2', kind: 'edit_cap', libraryId: 'aaaaaaaa', status: 'declined' }, { id: 'p-3', kind: 'create_library', libraryId: null, status: 'pending', params: { name: '新库' } }];
  const s = situation(w.registry, { now, proposals: cards, notes: [{ at: 'x', text: '用户只看中文' }], agentUsageFile: join(w.root, 'agent-usage.jsonl') });
  assert.equal(s.truncated, false);
  assert.ok(!s.text.includes(TRUNCATED_MARK));
  const t = s.text;
  assert.match(t, /## 库「AI 工具」（id aaaaaaaa）/);
  assert.match(t, /要求：追踪 AI 编程工具。+…/, 'the brief, cut');
  assert.equal(/要求：(.*)/.exec(t)[1].length, 201, 'its first 200 characters and the ellipsis');
  assert.match(t, /主题：agent 框架（2 个关键词）/);
  assert.match(t, /来源：3 个（ok 1 · empty 0 · gap 0 · failed 0 · blocked 1 · 暂停 1 · 还没抓过 0）/);
  assert.match(t, /待看：0 条/);
  assert.match(t, /上一轮：2026-11-04T08:30:00.000Z，进待看 0 条/);
  assert.match(t, /问题：来源出问题、连续 3 轮以上没有产出/);
  assert.match(t, /未处理的建议卡：source-failing:feed-a；no-output:library/);
  assert.match(t, /待定的提议卡：p-1（edit_cap）\n/, 'only the pending card');
  assert.match(t, /## 库「读书」（id bbbbbbbb）[\s\S]*来源：1 个（ok 0 · empty 0 · gap 0 · failed 0 · blocked 0 · 暂停 0 · 还没抓过 1）/);
  assert.match(t, /待定的建库提议卡：p-3（新库）/);
  assert.match(t, /全部库本月用量合计：6 次调用（其中主 Agent 2 次）/);
  assert.match(t, /你的笔记（最近 1 条）：\n- 用户只看中文/);
  // a library whose folder is gone: said, not thrown
  rmSync(w.dir(1), { recursive: true, force: true });
  assert.match(situation(w.registry, { now }).text, /## 库「读书」（id bbbbbbbb）\n问题：文件夹不在或读不出/);
});

test('situation: over the limit → first the details of the oldest libraries go, then the oldest libraries; 「已截短」 at the end; never over', () => {
  const w = world('situation-limit', [{ id: 'aaaaaaaa', name: '老库', addedAt: '2026-10-01T00:00:00.000Z' }, { id: 'bbbbbbbb', name: '大库', addedAt: '2026-11-01T00:00:00.000Z' }, { id: 'cccccccc', name: '新库', addedAt: '2026-11-04T00:00:00.000Z' }]);
  // the big one: many topics (each listed) and many sources
  for (let i = 0; i < 40; i++) addTopic(w.dir(1), { name: `主题${i}-${'长'.repeat(30)}`, keywords: ['k'] });
  for (let i = 0; i < 120; i++) addSource(w.dir(1), { name: `s-${i}`, kind: 'hn', query: `q${i}` });
  const full = situation(w.registry, { now, maxChars: 100_000 });
  assert.equal(full.truncated, false);
  const order = (s) => s.libraries.map((l) => l.shown);
  // a limit that only the oldest's details must make room for
  const one = situation(w.registry, { now, maxChars: full.chars - 50 });
  assert.equal(one.truncated, true);
  assert.deepEqual(order(one), ['short', 'detail', 'detail'], 'the oldest library loses its details first');
  assert.ok(one.text.endsWith(TRUNCATED_MARK));
  assert.ok(one.chars <= full.chars - 50);
  assert.match(one.text, /- 库「老库」（id aaaaaaaa）；待看 0 条/);
  // the default limit with three libraries: within it
  const def = situation(w.registry, { now });
  assert.ok(def.chars <= SITUATION_MAX, `${def.chars} > ${SITUATION_MAX}`);
  // so small that libraries go too: the oldest first, said
  const allShort = situation(w.registry, { now, maxChars: 200 });
  assert.deepEqual(order(allShort), ['short', 'short', 'short'], 'every library in its one line before any is dropped');
  const tiny = situation(w.registry, { now, maxChars: 150 });
  assert.ok(tiny.chars <= 150, String(tiny.chars));
  assert.ok(tiny.text.endsWith(TRUNCATED_MARK));
  assert.deepEqual(order(tiny), ['gone', 'short', 'short'], 'the oldest goes first');
  assert.match(tiny.text, /另有 1 个较早登记的库没有列出/);
  assert.deepEqual(order(situation(w.registry, { now, maxChars: 120 })), ['gone', 'gone', 'short']);
});

// ---------------------------------------------------------------- the answer and the turn

test('checkAnswer: one ask at most (a list or the key twice fails), 2–4 options, no other keys, reply required unless looking up', () => {
  const ok = (json, text) => checkAnswer({ ok: true, json, text: text ?? JSON.stringify(json) });
  assert.equal(ok({ reply: '好', ask: { question: '要吗？', options: ['要', '不要'] } }).ok, true);
  const two = ok({ reply: '好', ask: [{ question: 'a', options: ['1', '2'] }, { question: 'b', options: ['1', '2'] }] });
  assert.equal(two.ok, false);
  assert.match(two.errors.join(), /one object, not a list/);
  const dupText = '{"reply":"好","ask":{"question":"a？","options":["1","2"]},"ask":{"question":"b？","options":["1","2"]}}';
  assert.deepEqual(topLevelKeys(dupText), ['reply', 'ask', 'ask']);
  const dup = checkAnswer({ ok: true, json: JSON.parse(dupText), text: dupText });
  assert.equal(dup.ok, false, 'JSON.parse keeps the last ask; the text says there were two');
  assert.match(dup.errors.join(), /"ask" appears twice/);
  assert.equal(ok({ reply: '好', ask: { question: 'a', options: ['1'] } }).ok, false, 'one option');
  assert.equal(ok({ reply: '好', ask: { question: 'a', options: ['1', '2', '3', '4', '5'] } }).ok, false, 'five options');
  assert.equal(ok({ reply: '好', asks: [] }).ok, false, 'an unknown key');
  assert.equal(ok({ ask: { question: 'a', options: ['1', '2'] } }).ok, false, 'no reply');
  assert.equal(ok({ lookups: [{ what: 'library', libraryId: 'x' }] }).ok, true, 'no reply beside lookups is fine');
  assert.equal(checkAnswer({ ok: true, json: { lookups: [{ what: 'library' }] } }, { lookupsAllowed: false }).ok, false);
  assert.equal(checkAnswer({ ok: false, code: 'bad-format', text: 'Sure! here you go' }).ok, false);
  assert.equal(checkAnswer({ ok: false, code: 'bad-format', text: '{"reply": "能读出来的话", "ask": [1' }).replyText, '能读出来的话');
});

test('turn: two asks → retried once (told why); still two → only the reply shown, no card, no note', async () => {
  const w = world('two-asks');
  const twoAsks = { $text: `{"reply":"我先问两件事","ask":{"question":"a？","options":["1","2"]},"ask":{"question":"b？","options":["1","2"]},"proposals":[${JSON.stringify(editBrief())}],"note":"记一笔"}` };
  const c = scriptedAgentConnector({ answers: [twoAsks, twoAsks] });
  const before = tree(w.dir());
  const r = await w.turn(c, '帮我改要求');
  assert.equal(r.reply, '我先问两件事');
  assert.equal(r.ask, null);
  assert.deepEqual(r.proposalIds, []);
  assert.deepEqual(r.notice, [{ code: 'not-understood' }]);
  assert.equal(c.sends().length, 2, 'one retry');
  assert.match(c.sends()[1].prompt, /"ask" appears twice/, 'the retry says what was wrong');
  assert.deepEqual(w.made, [], 'no card');
  assert.deepEqual(readAgentNotes(w.agentDir), [], 'no note kept');
  assert.deepEqual(tree(w.dir()), before);
  // control: the retry answers well → the card is made
  const c2 = scriptedAgentConnector({ answers: [twoAsks, { reply: '好，只问一件', ask: { question: 'a？', options: ['1', '2'] }, proposals: [editBrief()] }] });
  const r2 = await w.turn(c2, '再来');
  assert.equal(r2.ask.question, 'a？');
  assert.equal(r2.proposalIds.length, 1);
});

test('turn: bad JSON twice → the fixed sentence (in the user\'s language), no card, no lookup, no note — even when the second one holds a good card', async () => {
  const w = world('bad-json');
  const brokenWithCard = { $text: `{"reply": "改好了", "proposals": [${JSON.stringify(editBrief())}], "lookups": [{"what":"library","libraryId":"aaaaaaaa"}], "note": "x", "ask": [1, 2]}` };
  const c = scriptedAgentConnector({ answers: [{ $text: 'Sure! I will change the brief for you.' }, brokenWithCard] });
  const r = await w.turn(c, 'change the brief');
  assert.equal(r.reply, '改好了', 'the reply that can be read out of it');
  assert.deepEqual(r.proposalIds, []);
  assert.deepEqual(w.made, [], 'createProposal never called');
  assert.equal(readTranscript(w.agentDir).rows.filter((x) => x.role === 'lookup').length, 0, 'no lookup run');
  assert.deepEqual(readAgentNotes(w.agentDir), []);
  assert.equal(r.lookupRounds, 0);
  const c2 = scriptedAgentConnector({ answers: [{ $text: 'not json at all' }, { $text: 'still prose' }] });
  assert.equal((await w.turn(c2, '改一下要求')).reply, NOT_UNDERSTOOD.zh);
  const c3 = scriptedAgentConnector({ answers: [{ $text: 'nope' }, { $text: 'nope' }] });
  assert.equal((await w.turn(c3, 'change it')).reply, NOT_UNDERSTOOD.en);
  // control: a bad answer then a good one → retried once and used
  const c4 = scriptedAgentConnector({ answers: [{ $text: 'prose' }, { reply: '好', proposals: [editBrief()] }] });
  const r4 = await w.turn(c4, '改要求');
  assert.equal(r4.proposalIds.length, 1);
  assert.equal(c4.sends().length, 2);
});

test('turn: lookups run read only, at most 3 rounds; the 4th request is refused (told so) and its lookups are not run', async () => {
  const w = world('lookups');
  const ask = { reply: '', lookups: [{ what: 'library', libraryId: 'aaaaaaaa' }] };
  const c = scriptedAgentConnector({ answers: [ask, ask, ask, ask, { reply: '照现有信息答：一切正常' }] });
  const before = tree(w.dir());
  const r = await w.turn(c, '这个库怎么样？');
  assert.equal(r.reply, '照现有信息答：一切正常');
  assert.equal(r.lookupRounds, MAX_LOOKUP_ROUNDS);
  const rows = readTranscript(w.agentDir).rows;
  const lookupRows = rows.filter((x) => x.role === 'lookup');
  assert.deepEqual(lookupRows.map((x) => x.data.round), [1, 2, 3], 'three rounds, no fourth');
  const sends = c.sends();
  assert.equal(sends.length, 5, '3 lookups, the refused 4th, its retry');
  assert.doesNotMatch(sends[2].prompt, /已经查了 3 次/);
  assert.match(sends[3].prompt, /已经查了 3 次/, 'the call after the third round says so');
  assert.match(sends[4].prompt, /no more lookups/, 'the retry says why');
  assert.deepEqual(tree(w.dir()), before, 'the lookups wrote nothing');
  // the refused one stays refused: lookups again on the retry → the reply that can be read, nothing run
  const c2 = scriptedAgentConnector({ answers: [ask, ask, ask, { reply: '还想查', ...ask }, { reply: '还想查', ...ask }] });
  const r2 = await w.turn(c2, '再查');
  assert.equal(r2.lookupRounds, 3);
  assert.deepEqual(r2.notice, [{ code: 'not-understood' }]);
  assert.equal(readTranscript(w.agentDir).rows.filter((x) => x.role === 'lookup' && x.turn === r2.turn).length, 3);
});

test('turn: a card that is not { kind, params, why } or that package B refuses is not made — said in the transcript and after the reply', async () => {
  const w = world('cards');
  const c = scriptedAgentConnector({ answers: [{
    reply: '我拟了三张卡',
    proposals: [
      editBrief('只要一手资料与官方文档'),
      { kind: 'edit_cap', params: { libraryId: 'aaaaaaaa', cap: -3 }, why: '少花点' },
      { kind: 'edit_brief', params: { libraryId: 'aaaaaaaa', brief: 'x' } },
      { kind: 'pause_source', params: { libraryId: 'zzzzzzzz', name: 'feed-a', paused: true }, why: '老失败' },
    ],
  }] });
  const r = await w.turn(c, '帮我调一下这个库');
  assert.equal(r.proposalIds.length, 1);
  assert.deepEqual(w.made.map((m) => [m.kind, m.by]), [['edit_brief', 'agent']], 'package B made the good one, by: agent');
  assert.equal(readProposals(w.proposalsFile).cards[0].by, 'agent');
  assert.equal(readProposals(w.proposalsFile).cards[0].status, 'pending');
  assert.ok(r.reply.endsWith('有 3 张提议没出（格式不对）'), r.reply);
  assert.deepEqual(r.notice, [{ code: 'proposals-dropped', count: 3 }]);
  const note = readTranscript(w.agentDir).rows.find((x) => x.role === 'note');
  assert.equal(note.data.dropped.length, 3);
  assert.match(note.text, /bad-proposal/);
  assert.match(note.text, /shape/);
  // from a library's dialog: a library card without libraryId takes it
  const c2 = scriptedAgentConnector({ answers: [{ reply: '好', proposals: [{ kind: 'edit_cap', params: { cap: 30 }, why: '你说的' }] }] });
  const r2 = await w.turn(c2, '每轮最多 30 次', { libraryId: 'aaaaaaaa' });
  assert.equal(r2.proposalIds.length, 1);
  assert.equal(w.made.at(-1).params.libraryId, 'aaaaaaaa');
  assert.match(c2.sends()[0].prompt, /从库「AI 工具」（id aaaaaaaa）的对话框转来的/);
});

test('turn: the note action is kept (cut to its limit) and shown in the next situation; a note turn is a note row', async () => {
  const w = world('notes');
  const c = scriptedAgentConnector({ answers: [{ reply: '记下了', note: '用户只看中文。'.repeat(300) }, { reply: '收到' }] });
  await w.turn(c, '以后只给我中文的');
  const notes = readAgentNotes(w.agentDir);
  assert.equal(notes.length, 1);
  assert.equal([...notes[0].text].length, NOTE_MAX);
  await w.turn(c, '建议卡 source-failing:feed-a', { as: 'note' });
  assert.match(c.sends()[1].prompt, /你的笔记（最近 1 条）：\n- 用户只看中文。/);
  assert.match(c.sends()[1].prompt, /流息转来一件事（不是用户打的字/);
  assert.equal(readTranscript(w.agentDir).rows.find((x) => x.turn === 2).role, 'note');
  assert.equal(appendAgentNote(w.agentDir, '   '), null);
});

test('turn: the connection failing → a note row, reply null, notice connection; no session cached', async () => {
  const w = world('conn');
  const c = scriptedAgentConnector({ answers: [{ $fail: 'login-expired' }] });
  const r = await w.turn(c, '你好');
  assert.equal(r.reply, null);
  assert.deepEqual(r.notice, [{ code: 'connection', connection: 'login-expired' }]);
  assert.equal(c.sends().length, 1, 'no retry for a connection problem');
  assert.deepEqual(readSessions(w.agentDir), {});
  assert.deepEqual(readTranscript(w.agentDir).rows.map((x) => x.role), ['you', 'note']);
  await assert.rejects(() => w.turn(c, ''), /1–4000/);
});

// ---------------------------------------------------------------- lookups

test('runLookup: each kind read only; notes_search gives only titles and dates of kept items, at most 10; errors say what is wrong', () => {
  const w = world('lookup-kinds');
  const dir = w.dir();
  const lines = [];
  for (let i = 0; i < 14; i++) lines.push(JSON.stringify({ id: `n${i}`, title: `Agent memory ${i}`, date: '2026-11-01', status: 'kept', summary: 'SECRET BODY TEXT' }));
  lines.push(JSON.stringify({ id: 'c1', title: 'Agent memory caught', date: '2026-11-01', status: 'caught' }));
  writeFileSync(join(dir, 'index.jsonl'), lines.join('\n') + '\n');
  appendFetchLog(dir, { ts: '2026-11-04T08:30:00.000Z', round: 'r1', source: 'feed-a', kind: 'rss', status: 'failed', http: 503, count: 0, new: 0, message: 'HTTP 503' });
  const before = tree(w.root);
  const ctx = { registry: w.registry, proposals: [{ id: 'p-1', kind: 'edit_cap', libraryId: 'aaaaaaaa', status: 'pending', why: 'w', createdAt: 'c' }], now };
  const lib = runLookup({ what: 'library', libraryId: 'aaaaaaaa' }, ctx);
  assert.equal(lib.ok, true);
  assert.deepEqual(lib.result.sources.map((s) => [s.name, s.last?.status]), [['feed-a', 'failed']]);
  assert.deepEqual(lib.result.topics, [{ name: 'agent 框架', keywords: ['agent framework', 'MCP'] }]);
  assert.deepEqual(lib.result.pendingProposals, [{ id: 'p-1', kind: 'edit_cap' }]);
  const log = runLookup({ what: 'source_log', libraryId: 'aaaaaaaa', name: 'feed-a' }, ctx);
  assert.deepEqual(log.result.lines.map((l) => [l.status, l.http]), [['failed', 503]]);
  assert.equal(runLookup({ what: 'proposals' }, ctx).result.cards.length, 1);
  assert.deepEqual(runLookup({ what: 'suggestions', libraryId: 'aaaaaaaa' }, ctx).result.suggestions, []);
  const found = runLookup({ what: 'notes_search', libraryId: 'aaaaaaaa', query: 'agent MEMORY' }, ctx);
  assert.equal(found.result.items.length, 10);
  assert.equal(found.result.more, 4);
  assert.deepEqual(Object.keys(found.result.items[0]), ['title', 'date']);
  assert.ok(!JSON.stringify(found).includes('SECRET BODY TEXT'), 'never the text');
  assert.ok(!JSON.stringify(found).includes('caught'), 'only kept items');
  assert.equal(runLookup({ what: 'shell', libraryId: 'aaaaaaaa' }, ctx).error, 'unknown-what');
  assert.equal(runLookup({ what: 'library' }, ctx).error, 'missing-field');
  assert.equal(runLookup({ what: 'library', libraryId: 'nope' }, ctx).error, 'unknown-library');
  assert.equal(runLookup({ what: 'source_log', libraryId: 'aaaaaaaa', name: 'ghost' }, ctx).error, 'unknown-source');
  assert.deepEqual(tree(w.root), before, 'nothing written anywhere');
});

// ---------------------------------------------------------------- compression and usage

test('compression: exactly the threshold does nothing; one character more → a summary row (≤ 2000), summarizedThrough moves on, the session is let go', async () => {
  const w = world('compress');
  const row = (turn, role, n) => appendTranscript(w.agentDir, { turn, role, text: '字'.repeat(n) }, { now });
  row(1, 'you', 20_000);
  row(1, 'agent', 19_999);
  row(2, 'you', 1);
  writeSession(w.agentDir, 'fake', { sessionId: 'fake-session-9', startedAt: 'x', turns: 2, summarizedThrough: 0 });
  assert.equal(charsSinceSummary(readTranscript(w.agentDir).rows), COMPRESS_THRESHOLD);
  const long = '摘'.repeat(AGENT_SUMMARY_MAX + 500);
  const c = scriptedAgentConnector({ summary: long });
  const none = await compressIfNeeded({ agentDir: w.agentDir, connector: c, now, turn: 2 });
  assert.equal(none.compressed, false);
  assert.equal(c.calls.length, 0, 'no call at the threshold');
  row(2, 'agent', 1);
  const yes = await compressIfNeeded({ agentDir: w.agentDir, connector: c, now, turn: 2 });
  assert.equal(yes.compressed, true);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].mode, 'complete', 'a one-shot call, not the session');
  const rows = readTranscript(w.agentDir).rows;
  const s = rows.at(-1);
  assert.equal(s.role, 'summary');
  assert.equal([...s.text].length, AGENT_SUMMARY_MAX);
  assert.deepEqual(s.data, { from: 1, through: 2, chars: COMPRESS_THRESHOLD + 1 });
  assert.equal(rows.length, 5, 'the old rows stay in the transcript');
  assert.deepEqual(readSessions(w.agentDir).fake, { sessionId: null, startedAt: null, turns: 0, summarizedThrough: 2 });
  assert.equal(charsSinceSummary(readTranscript(w.agentDir).rows), 0, 'counted from the summary on');
  assert.match(historyBlock(rows), /## 之前对话的摘要（到第 2 轮）/);
  // a turn that goes over the threshold compresses at its end
  const w2 = world('compress-turn');
  const c2 = scriptedAgentConnector({ answers: Array.from({ length: 6 }, () => ({ reply: '长'.repeat(7000) })), summary: '短摘要' });
  for (let i = 0; i < 5; i++) assert.equal((await w2.turn(c2, '说点长的')).compressed, undefined, `turn ${i + 1}: ${(i + 1) * 7004} characters`);
  const r = await w2.turn(c2, '说点长的');
  assert.equal(r.compressed, true, '6 × 7004 > 40000');
  assert.equal(readTranscript(w2.agentDir).rows.at(-1).text, '短摘要');
});

test('usage: every call of the agent is a line of agent/usage.jsonl; usageTotal counts it apart (主 Agent) and in the total', async () => {
  const w = world('usage');
  const c = scriptedAgentConnector({ answers: [{ reply: '', lookups: [{ what: 'library', libraryId: 'aaaaaaaa' }] }, { $text: 'prose' }, { reply: '好' }] });
  const r = await w.turn(c, '这个库怎么样');
  assert.equal(r.calls, 3);
  const u = readUsageFile(agentPaths(w.agentDir).usage, { month: '2026-11' });
  assert.equal(u.calls, 3);
  assert.deepEqual(u.byPurpose, { agent: 3 });
  assert.deepEqual(u.byKind, { fake: 3 });
  createUsageCounter(w.dir()).record({ ts: '2026-11-03T00:00:00.000Z', kind: 'api', purpose: 'score', calls: 5 });
  const t = usageTotal([w.dir()], { month: '2026-11', agentFile: agentPaths(w.agentDir).usage });
  assert.equal(t.calls, 8);
  assert.equal(t.agent.calls, 3);
  assert.deepEqual(t.byKind, { api: 5, fake: 3 });
  assert.deepEqual(t.libraries, [{ dir: w.dir(), calls: 5 }], 'the agent is not a library');
  const noAgent = usageTotal([w.dir()], { month: '2026-11' });
  assert.equal(noAgent.calls, 5);
  assert.equal(noAgent.agent, undefined, 'v1.0 / package A callers see the shape they had');
});

test('the agent working folder: under the system temporary folder, not in the agent folder of the app data', async () => {
  const { tmpdir } = await import('node:os');
  const { AGENT_CWD, agentCwd } = await import('../src/agent/index.mjs');
  assert.equal(AGENT_CWD, join(tmpdir(), 'streams-agent-cwd'));
  assert.equal(agentCwd('X:/t'), join('X:/t', 'streams-agent-cwd'));
  assert.equal('cwd' in agentPaths(join('C:/app', 'agent')), false, 'agentPaths names no working folder inside the app data');
});
