// 对话分流 routeMessage (v2 package E, contract E1; core/src/ask/route.mjs; docs/core-api.md 5.16). Every rule first gets an
// input made to break it: one sentence per change signal (taking the word out of the table turns that sentence into
// 「no signal」 → unsure without a connection, so this test goes red), one per question signal, both, neither, the UC3
// sentences; the model fallback on fake connectors (change / question / low confidence / bad format twice / a connection
// failure / no connection) and its call (the same request shape as asking the library: no tools, no session, no system);
// _pipeline/routes.jsonl append only, the text cut at 200 characters. No real model is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  routeMessage, routeByRules, routeSignals, routePrompt, readRouteAnswer, appendRouteLine, readRoutes,
  CHANGE_SIGNALS, QUESTION_SIGNALS, ROUTES_FILE, RULE_CONFIDENCE, MODEL_MIN_CONFIDENCE, ROUTE_PROMPT_HEAD,
} from '../src/ask/route.mjs';
import * as coreIndex from '../src/index.mjs';
import { ask } from '../src/ask/ask.mjs';
import { RETRY_SUFFIX } from '../src/connect/complete-json.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { makeLibrary, keepNote } from './support/fixtures.mjs';

// a name of this file's own under the shared test root: two suites running at once never share a folder
const unique = (name) => `wp-e-route-${name}-${process.pid}-${randomBytes(3).toString('hex')}`;

// one sentence per change signal, each with that signal and no other signal of either kind
const CHANGE_SENTENCES = [
  ['以后', '以后多收一点港股的新闻。'],
  ['今后', '今后只要港股的公告。'],
  ['往后', '往后少收一点融资新闻。'],
  ['从现在起', '从现在起只收中文的。'],
  ['也追踪', '也追踪港股服装公司的公告。'],
  ['跟踪', '跟踪一下港交所的披露。'],
  ['关注', '关注一下李宁的公告。'],
  ['加上', '把港交所加上。'],
  ['加一个', '加一个港交所的来源。'],
  ['添加', '添加港交所披露易。'],
  ['删掉', '把融资新闻删掉。'],
  ['去掉', '去掉 arXiv 那个来源。'],
  ['别再', '别再收融资新闻了。'],
  ['不要再', '不要再收融资新闻了。'],
  ['不再', '融资新闻不再收了。'],
  ['改成', '主题改成服装零售。'],
  ['换成', '来源换成港交所。'],
  ['暂停', '暂停 feed-a。'],
  ['停掉', '把 feed-a 停掉。'],
  ['每天几点', '每天8点跑一轮。'],
  ['上限', '一轮的上限定为 50 条。'],
  ['过关线', '相关度的过关线调到 0.7。'],
  ['from now on', 'From now on keep only filings.'],
  ['also track', 'Also track HKEX filings.'],
  ['start tracking', 'Start tracking HKEX filings.'],
  ['add', 'Add the HKEX feed.'],
  ['remove', 'Remove the arXiv feed.'],
  ['stop', 'Stop the arXiv feed.'],
  ['pause', 'Pause feed-a for a week.'],
  ['change … to', 'Change the daily cap to 50.'],
  ['instead of', 'Use HKEX instead of the blog.'],
  ["don't … anymore", "Don't send me funding news anymore."],
];

// one sentence per question signal (the ones a longer one contains — 为什么 holds 什么 — still get their own line)
const QUESTION_SENTENCES = [
  ['?', 'HKEX filings in October?'],
  ['？', '十月的港股公告？'],
  ['谁', '安踏和李宁谁的流水更好。'],
  ['什么', '库里讲了什么。'],
  ['哪', '哪一篇讲了李宁。'],
  ['怎么', '李宁三季度怎么样。'],
  ['为什么', '为什么李宁的流水下降了。'],
  ['多少', '安踏的流水是多少。'],
  ['是否', '李宁是否公布了三季度数据。'],
  ['有没有', '库里有没有李宁的财报。'],
  ['吗（句末）', '库里有李宁的财报吗'],
  ['呢（句末）', '安踏的流水呢。'],
  ['比较', '比较一下安踏和李宁。'],
  ['对比', '对比安踏和李宁的三季度。'],
  ['what（句首）', 'What did Anta report in Q3.'],
  ['which（句首）', 'Which entry covers Li Ning.'],
  ['who（句首）', 'Who grew faster in Q3.'],
  ['how（句首）', 'How did Anta do in Q3.'],
  ['why（句首）', 'Why did Li Ning fall.'],
  ['when（句首）', 'When did Anta publish its Q3 numbers.'],
  ['does（句首）', 'Does the library cover Li Ning.'],
  ['do（句首）', 'Do we have Q3 numbers for Anta.'],
  ['is（句首）', 'Is there a filing from HKEX.'],
  ['are（句首）', 'Are there entries on Li Ning.'],
  ['can（句首）', 'Can I read the Anta entry.'],
];

// the four combinations, Chinese and English
const BOTH = ['以后会怎样？', '以后还要不要关注李宁？', 'Can you stop the arXiv feed?', 'Why did you add that source?'];
const NEITHER = ['你好', '谢谢，辛苦了。', 'Hello there.', 'Thanks, that was useful.'];

test('the tables: exactly the signal words of contract E1, Chinese and English', () => {
  assert.deepEqual(CHANGE_SIGNALS.map((s) => s.word), [
    '以后', '今后', '往后', '从现在起', '也追踪', '跟踪', '关注', '加上', '加一个', '添加', '删掉', '去掉', '别再', '不要再', '不再', '改成', '换成', '暂停', '停掉', '每天几点', '上限', '过关线',
    'from now on', 'also track', 'start tracking', 'add', 'remove', 'stop', 'pause', 'change … to', 'instead of', "don't … anymore",
  ]);
  assert.deepEqual(QUESTION_SIGNALS.map((s) => s.word), [
    '?', '？', '谁', '什么', '哪', '怎么', '为什么', '多少', '是否', '有没有', '吗（句末）', '呢（句末）', '比较', '对比',
    'what（句首）', 'which（句首）', 'who（句首）', 'how（句首）', 'why（句首）', 'when（句首）', 'does（句首）', 'do（句首）', 'is（句首）', 'are（句首）', 'can（句首）',
  ]);
  // every table word has its own sentence here (a word added to a table without a sentence fails)
  assert.deepEqual(CHANGE_SENTENCES.map(([w]) => w), CHANGE_SIGNALS.map((s) => s.word));
  assert.deepEqual(QUESTION_SENTENCES.map(([w]) => w), QUESTION_SIGNALS.map((s) => s.word));
  assert.equal(coreIndex.routeMessage, routeMessage, 'exported from the core');
});

test('change signals only → change at 0.8 by rule: one sentence per signal word (no connection needed)', async () => {
  for (const [word, sentence] of CHANGE_SENTENCES) {
    assert.deepEqual(routeSignals(sentence), { change: [word], question: [] }, `${sentence}: exactly the one signal ${word}`);
    const r = await routeMessage(sentence);
    assert.deepEqual([r.route, r.confidence, r.by], ['change', RULE_CONFIDENCE, 'rule'], `${word}: ${sentence}`);
    assert.match(r.reason, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('question signals only → question at 0.8 by rule: one sentence per signal word', async () => {
  for (const [word, sentence] of QUESTION_SENTENCES) {
    const s = routeSignals(sentence);
    assert.deepEqual(s.change, [], `${sentence}: no change signal`);
    assert.ok(s.question.includes(word), `${sentence}: the signal ${word} found (${s.question.join(', ')})`);
    const r = await routeMessage(sentence);
    assert.deepEqual([r.route, r.confidence, r.by], ['question', RULE_CONFIDENCE, 'rule'], `${word}: ${sentence}`);
  }
});

test('UC3: 「以后也追踪港股服装公司的公告。」→ change; 「安踏和李宁三季度谁的流水更好？」→ question', async () => {
  assert.deepEqual(await routeMessage('以后也追踪港股服装公司的公告。'), { route: 'change', confidence: 0.8, by: 'rule', reason: 'change signals: 以后, 也追踪' });
  assert.deepEqual(await routeMessage('安踏和李宁三季度谁的流水更好？'), { route: 'question', confidence: 0.8, by: 'rule', reason: 'question signals: ？, 谁' });
});

test('both kinds or neither → the rules give nothing; without a connection → unsure by none at 0, no call', async () => {
  for (const t of [...BOTH, ...NEITHER]) {
    assert.equal(routeByRules(t), null, t);
    const r = await routeMessage(t);
    assert.deepEqual([r.route, r.confidence, r.by], ['unsure', 0, 'none'], t);
    assert.match(r.reason, /no connection/);
  }
  const s = routeSignals('以后会怎样？');
  assert.deepEqual(s, { change: ['以后'], question: ['？'] });
  // a connector without complete() is no connection
  assert.equal((await routeMessage('你好', { connector: {} })).by, 'none');
});

test('where a signal does not count: 吗 / 呢 only at a sentence end, English question words only at a sentence start, whole words only', () => {
  assert.deepEqual(routeSignals('呢子大衣的新闻多收一点'), { change: [], question: [] }, '呢 in the middle');
  assert.deepEqual(routeSignals('吗啡类的新闻也追踪'), { change: ['也追踪'], question: [] }, '吗 in the middle');
  assert.deepEqual(routeSignals('The library is fine.'), { change: [], question: [] }, '"is" not at a start');
  assert.deepEqual(routeSignals('Thanks. Is there more.').question, ['is（句首）'], '"Is" at the start of the second sentence');
  assert.deepEqual(routeSignals('The address of the feed changed.'), { change: [], question: [] }, '"add" inside "address", "change" without "to"');
  assert.deepEqual(routeSignals('Doing fine, unstoppable.'), { change: [], question: [] }, '"do" inside "doing", "stop" inside "unstoppable"');
  assert.deepEqual(routeSignals('每天都很好').change, [], '每天 without an hour');
  assert.deepEqual(routeSignals('每天十点跑').change, ['每天几点']);
  assert.deepEqual(routeSignals('每天几点跑').change, ['每天几点']);
  assert.deepEqual(routeSignals('安踏的流水呢？').question, ['？', '呢（句末）']);
});

/** A fake whose complete() answers from `answers` in order (an object = the JSON; 'bad' = not JSON; { $fail } = a connection failure). */
function scripted(answers) {
  const calls = [];
  const c = {
    kind: 'fake',
    calls,
    async complete(req) {
      calls.push(req);
      const a = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (a === 'bad') return { ok: false, code: 'bad-format', text: 'Sure! not json', usage: { calls: 1 } };
      if (a && a.$fail) return { ok: false, code: a.$fail, usage: { calls: 1 } };
      return { ok: true, json: structuredClone(a), text: JSON.stringify(a), usage: { calls: 1 }, model: 'fake' };
    },
    // the session way of package C: a route call must never take it
    async send() { throw new Error('send() must not be used for routing'); },
  };
  return c;
}

test('the model fallback: change / question at ≥ 0.6 kept; < 0.6, unsure, bad format twice, a connection failure → unsure', async () => {
  const amb = '以后会怎样？';
  let c = scripted([{ route: 'change', confidence: 0.9 }]);
  assert.deepEqual(await routeMessage(amb, { connector: c }), { route: 'change', confidence: 0.9, by: 'model', reason: 'both kinds of signals (以后, ？); the model said change' });
  assert.equal(c.calls.length, 1);

  c = scripted([{ route: 'question', confidence: 0.6 }]);
  const q = await routeMessage('你好', { connector: c });
  assert.deepEqual([q.route, q.confidence, q.by], ['question', 0.6, 'model'], 'exactly 0.6 is kept');

  c = scripted([{ route: 'change', confidence: 0.59 }]);
  const low = await routeMessage(amb, { connector: c });
  assert.deepEqual([low.route, low.confidence, low.by], ['unsure', 0.59, 'model'], 'below 0.6 → unsure');
  assert.equal(c.calls.length, 1, 'a low confidence is not retried');

  c = scripted([{ route: 'unsure', confidence: 0.9 }]);
  assert.equal((await routeMessage(amb, { connector: c })).route, 'unsure');

  c = scripted(['bad', 'bad']);
  const bad = await routeMessage(amb, { connector: c });
  assert.deepEqual([bad.route, bad.confidence, bad.by], ['unsure', 0, 'model']);
  assert.match(bad.reason, /bad-format twice/);
  assert.equal(c.calls.length, 2, 'one retry, no more');
  assert.equal(c.calls[1].prompt, c.calls[0].prompt + RETRY_SUFFIX, 'the retry carries the fixed reminder');

  c = scripted(['bad', { route: 'question', confidence: 0.8 }]);
  const again = await routeMessage(amb, { connector: c });
  assert.deepEqual([again.route, again.by, c.calls.length], ['question', 'model', 2], 'a good second answer is taken');

  // JSON of the wrong shape is a bad answer too: retried, then unsure
  for (const wrong of [{ route: 'maybe', confidence: 0.9 }, { route: 'change' }, { route: 'change', confidence: 1.5 }, { route: 'change', confidence: '0.9' }, [1, 2]]) {
    c = scripted([wrong, wrong]);
    const r = await routeMessage(amb, { connector: c });
    assert.deepEqual([r.route, c.calls.length], ['unsure', 2], JSON.stringify(wrong));
  }

  c = scripted([{ $fail: 'login-expired' }]);
  const fail = await routeMessage(amb, { connector: c });
  assert.deepEqual([fail.route, fail.confidence, fail.by, c.calls.length], ['unsure', 0, 'model', 1], 'a connection failure is not retried');
  assert.match(fail.reason, /connection login-expired/);

  // the core's own fake connector, bad format every time
  const f = fakeConnector({ mode: 'bad-format-always' });
  assert.equal((await routeMessage(amb, { connector: f })).route, 'unsure');
  assert.equal(f.calls.length, 2);

  // a rule hit never calls the model, connection or not
  c = scripted([{ route: 'question', confidence: 1 }]);
  assert.equal((await routeMessage('以后也追踪港股服装公司的公告。', { connector: c })).route, 'change');
  assert.equal(c.calls.length, 0);
});

test('the model call 「不能动手」: one complete() with the request shape asking the library uses (prompt, format json, model main), no system, no session', async () => {
  const c = scripted([{ route: 'change', confidence: 0.9 }]);
  await routeMessage('  以后会怎样？ ', { connector: c });
  const req = c.calls[0];
  assert.deepEqual(Object.keys(req).sort(), ['format', 'model', 'prompt']);
  assert.deepEqual([req.format, req.model, req.system], ['json', 'main', undefined]);
  assert.equal(req.prompt, routePrompt('以后会怎样？'), 'the trimmed text');
  assert.ok(req.prompt.startsWith(ROUTE_PROMPT_HEAD));
  assert.ok(req.prompt.endsWith('\n---\n以后会怎样？\n---'), 'the message between --- lines, as material');

  // asking the library on the same kind of fake: the same keys, the same slot and format
  const dir = makeLibrary(unique('ask-shape'));
  keepNote(dir, 'anta', { title: 'Anta Q3 sales', date: '2026-10-20', topics: ['财报'] }, '安踏三季度流水增长。\n');
  rebuildIndex(dir);
  const seen = [];
  const askConn = fakeConnector({ mode: 'counting', json: (r) => (r.model === 'verify' ? { items: [] } : { answer: [{ text: '安踏增长。', cites: [1] }], notInLibrary: false, missing: '' }) });
  const spy = { ...askConn, complete: async (r) => { seen.push(r); return askConn.complete(r); } };
  await ask(dir, 'Anta Q3', { connector: spy });
  const askReq = seen.find((r) => r.model === 'main');
  assert.deepEqual(Object.keys(askReq).sort(), Object.keys(req).sort(), 'the same request keys as asking the library');
  assert.deepEqual([askReq.format, askReq.system], [req.format, req.system]);
});

test('routeMessage changes nothing: no file anywhere in a library folder it is run beside', async () => {
  const dir = makeLibrary(unique('pure'));
  const before = readdirSync(dir, { recursive: true }).sort();
  const c = scripted([{ route: 'change', confidence: 0.9 }]);
  const prev = process.cwd();
  process.chdir(dir);
  try {
    for (const t of ['以后会怎样？', '你好', '以后也追踪港股服装公司的公告。', '安踏和李宁三季度谁的流水更好？']) await routeMessage(t, { connector: c });
  } finally { process.chdir(prev); }
  assert.deepEqual(readdirSync(dir, { recursive: true }).sort(), before);
  assert.equal(existsSync(join(dir, ROUTES_FILE)), false);
});

test('a message is required', async () => {
  for (const bad of ['', '   ', null, 42]) await assert.rejects(() => routeMessage(bad), (e) => e.code === 'bad-question', String(bad));
});

test('readRouteAnswer: only { route: question|change|unsure, confidence: 0..1 }', () => {
  assert.deepEqual(readRouteAnswer({ route: 'change', confidence: 0, extra: 1 }), { route: 'change', confidence: 0 });
  for (const v of [null, 'change', [], {}, { route: 'change', confidence: -0.1 }, { route: 'change', confidence: Number.NaN }, { route: 'CHANGE', confidence: 0.9 }]) assert.equal(readRouteAnswer(v), null, JSON.stringify(v));
  assert.equal(MODEL_MIN_CONFIDENCE, 0.6);
});

test('_pipeline/routes.jsonl: append only, the text cut at 200 characters, resolvedBy only when given, a broken last line not glued onto', () => {
  const dir = makeLibrary(unique('routes'));
  const at = () => new Date('2026-11-09T15:00:00.000Z');
  const long = '港'.repeat(150) + '😀'.repeat(100);
  appendRouteLine(dir, { text: long, route: 'change', by: 'rule', confidence: 0.8 }, { now: at });
  const file = join(dir, ROUTES_FILE);
  const first = readFileSync(file, 'utf8');
  appendRouteLine(dir, { text: '以后会怎样？', route: 'question', by: 'you', confidence: 1, resolvedBy: 'you' }, { now: at });
  assert.ok(readFileSync(file, 'utf8').startsWith(first), 'the first line is left as it was');
  appendFileSync(file, '{"broken":');
  appendRouteLine(dir, { text: '你好', route: 'unsure', by: 'none', confidence: 0 }, { now: at });
  const rows = readRoutes(dir);
  assert.equal(rows.length, 3, 'the broken line is skipped, the next one is whole');
  assert.equal(Array.from(rows[0].text).length, 200);
  assert.equal(rows[0].text, '港'.repeat(150) + '😀'.repeat(50));
  assert.deepEqual(rows[0], { at: '2026-11-09T15:00:00.000Z', text: rows[0].text, route: 'change', by: 'rule', confidence: 0.8 });
  assert.equal('resolvedBy' in rows[0], false);
  assert.equal(rows[1].resolvedBy, 'you');
  assert.deepEqual([rows[2].route, rows[2].by], ['unsure', 'none']);
  assert.throws(() => appendRouteLine(dir, { text: 'x', route: 'maybe', by: 'rule', confidence: 1 }), (e) => e.code === 'bad-argument');
});
