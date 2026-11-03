import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ask, askCandidates, applyFallback, checkView, askChecklist, MAX_CANDIDATES, BODY_CHARS, TOTAL_CHARS } from '../src/ask/ask.mjs';
import { ASK_PREAMBLE, ASK_PREAMBLE_EN } from '../src/ask/prompts.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { checkRule } from '../src/verify/rules.mjs';
import { rebuildIndex } from '../src/library/index.mjs';
import { makeLibrary, keepNote, TEST_CONFIG } from './support/fixtures.mjs';
import { jsonl, verdictLines, hashTree } from './support/pipeline.mjs';

const NOW = () => new Date('2026-11-03T16:00:00.000Z');
const Q = 'agent memory 有什么进展？';

function library(name, config = TEST_CONFIG) {
  const dir = makeLibrary(name, config);
  keepNote(dir, 'letta', { title: 'Letta memory blocks', date: '2026-10-31', topics: ['agent 记忆'] }, 'Letta 发布了 memory blocks 接口。\n');
  keepNote(dir, 'memgpt', { title: 'MemGPT paper on memory', date: '2023-10-12', topics: ['agent 记忆'] }, 'MemGPT 提出分层记忆。\n');
  keepNote(dir, 'mine', { title: 'My memory notes', date: '2026-10-20', status: 'authored', kept: undefined, topics: ['agent 记忆'] }, '我的选型笔记。\n');
  keepNote(dir, 'old', { title: 'Archived memory thing', date: '2026-01-01', status: 'archived', topics: ['agent 记忆'] }, 'archived.\n');
  keepNote(dir, 'mcp', { title: 'MCP registry', date: '2026-10-28', topics: ['MCP'] }, 'unrelated.\n');
  rebuildIndex(dir);
  return dir;
}

function demandLines(dir) {
  return jsonl(join(dir, '_pipeline', 'demand.jsonl'));
}

// main slot -> answer(n, req); verify slot -> every judge item passes unless judge says otherwise
function connector({ answer, judge } = {}) {
  return fakeConnector({
    mode: 'counting',
    json: (req, n) => {
      if (req.model === 'verify') {
        const ids = [...req.prompt.matchAll(/^\[([a-z-]+)\] /gm)].map((m) => m[1]);
        return judge ? judge(ids, req, n) : { items: ids.map((id) => ({ id, passed: true, evidence: 'ok' })) };
      }
      return answer(n, req);
    },
  });
}

test('candidates: kept and authored only, scored on title / topics / summary, at most 9, bodies cut at 1500 and 9000 in all', () => {
  const dir = library('ask-cands');
  const c = askCandidates(dir, 'memory');
  assert.deepEqual(c.map((x) => x.id), ['letta', 'mine', 'memgpt'], 'archived and non-matching entries are left out');
  assert.deepEqual(c.map((x) => x.n), [1, 2, 3]);
  assert.equal(c[0].body, 'Letta 发布了 memory blocks 接口。\n');

  const big = makeLibrary('ask-cands-big');
  for (let i = 1; i <= 12; i++) keepNote(big, `m${String(i).padStart(2, '0')}`, { title: `memory ${i}`, date: `2026-10-${String(i).padStart(2, '0')}` }, `${'长'.repeat(2000)}\n`);
  rebuildIndex(big);
  const many = askCandidates(big, 'memory');
  assert.equal(many.length, MAX_CANDIDATES);
  assert.deepEqual(many.map((x) => x.id), ['m12', 'm11', 'm10', 'm09', 'm08', 'm07', 'm06', 'm05', 'm04'], 'equal scores: newest date first');
  const lens = many.map((x) => Array.from(x.body).length);
  assert.deepEqual(lens, [1500, 1500, 1500, 1500, 1500, 1500, 0, 0, 0]);
  assert.equal(lens.reduce((a, b) => a + b, 0), TOTAL_CHARS);
  assert.ok(lens.every((l) => l <= BODY_CHARS));
});

test('0 candidates: no model call, notInLibrary, one demand line with topic null', async () => {
  const dir = library('ask-none');
  const conn = connector({ answer: () => assert.fail('the model must not be called') });
  const r = await ask(dir, '量子计算 blockchain', { connector: conn, now: NOW });
  assert.equal(conn.calls.length, 0);
  assert.equal(r.ok, true);
  assert.equal(r.notInLibrary, true);
  assert.deepEqual(r.answer, []);
  assert.equal(r.calls, 0);
  assert.deepEqual(demandLines(dir), [{ ts: NOW().toISOString(), question: '量子计算 blockchain', topic: null, notInLibrary: true, used: [] }]);
  assert.equal(existsSync(join(dir, '_pipeline', 'verdicts.jsonl')), false);
});

test('a good answer: one main call + one packed judge call, only cited sources listed, verdicts and demand recorded', async () => {
  const dir = library('ask-good');
  const conn = connector({ answer: () => ({ answer: [{ text: 'Letta 10-31 发布了记忆块接口。', cites: [1] }, { text: '和 MemGPT 的分层记忆是同一条线。', cites: [1, 3] }], notInLibrary: false, missing: '', claimed: ['cites-in-set'] }) });
  const r = await ask(dir, Q, { connector: conn, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(conn.calls.length, 2);
  assert.deepEqual(conn.calls.map((c) => c.model), ['main', 'verify']);
  assert.equal(r.calls, 2);
  assert.deepEqual(r.answer, [{ text: 'Letta 10-31 发布了记忆块接口。', cites: [1] }, { text: '和 MemGPT 的分层记忆是同一条线。', cites: [1, 3] }]);
  assert.deepEqual(r.sources, [{ n: 1, id: 'letta', title: 'Letta memory blocks', date: '2026-10-31' }, { n: 3, id: 'memgpt', title: 'MemGPT paper on memory', date: '2023-10-12' }]);
  assert.deepEqual(r.used, ['letta', 'memgpt']);
  assert.equal(r.candidates.length, 3);
  assert.equal(r.notInLibrary, false);
  assert.deepEqual(r.verification, { passed: true, rounds: 1, failed: [], claimsNotFound: [], forgot: [] });
  assert.deepEqual(r.removedCites, []);
  assert.equal(r.removedSentences, 0);

  // the prompt: fixed preamble, the question, numbered material between --- lines, the output format; no tools anywhere
  const p = conn.calls[0].prompt;
  assert.ok(p.startsWith(ASK_PREAMBLE));
  assert.ok(p.includes(`问题：${Q}`));
  assert.match(p, /---\n\[1\] Letta memory blocks（2026-10-31）\nLetta 发布了 memory blocks 接口。/);
  assert.ok(p.includes('[3] MemGPT paper on memory（2023-10-12）'));
  assert.ok(p.includes('"notInLibrary": true|false'));
  // the judge got the one judge item and the same material
  const j = conn.calls[1].prompt;
  assert.match(j, /^\[claims-supported\] /m);
  assert.doesNotMatch(j, /^\[cites-in-set\] /m, 'rule items are never sent to the judge');
  assert.ok(j.includes('MemGPT 提出分层记忆。'));

  const key = `ask:${createHash('sha1').update(Q).digest('hex').slice(0, 12)}`;
  const v = verdictLines(dir);
  assert.deepEqual(v.map((l) => [l.node, l.url, l.round, l.item, l.passed]), [
    ['ask', key, 1, 'json-keys', true],
    ['ask', key, 1, 'cites-in-set', true],
    ['ask', key, 1, 'cited-sentences', true],
    ['ask', key, 1, 'claims-supported', true],
  ]);
  assert.deepEqual(demandLines(dir), [{ ts: NOW().toISOString(), question: Q.trim(), topic: null, notInLibrary: false, used: ['letta', 'memgpt'] }]);
});

test('cites outside the candidate set: sent back with only the failed items, then removed after two rounds (V9)', async () => {
  const dir = library('ask-badcite');
  const conn = connector({ answer: () => ({ answer: [{ text: '有一篇横向比较。', cites: [2, 12] }, { text: '还有一条编出来的。', cites: [7] }, { text: '没出处的一句。', cites: [] }], notInLibrary: false, missing: '第三方横向比较' }) });
  const r = await ask(dir, Q, { connector: conn, now: NOW });
  // rules failed both rounds, so the judge was never called: 2 main calls only
  assert.deepEqual(conn.calls.map((c) => c.model), ['main', 'main']);
  assert.equal(r.calls, 2);
  const retry = conn.calls[1].prompt;
  assert.match(retry, /- \[cites-in-set\] /);
  assert.match(retry, /- \[cited-sentences\] /);
  assert.doesNotMatch(retry, /- \[json-keys\] /, 'a passed item is not sent back');
  assert.ok(retry.includes('"cites":[2,12]'), 'the prior output is shown');
  assert.ok(!retry.includes('cites_all'), 'derived check fields are not shown to the model');
  assert.deepEqual(r.answer, [{ text: '有一篇横向比较。', cites: [2] }]);
  assert.deepEqual(r.removedCites, [12, 7]);
  assert.equal(r.removedSentences, 2);
  assert.deepEqual(r.sources.map((s) => s.id), ['mine']);
  assert.equal(r.verification.passed, false);
  assert.equal(r.verification.rounds, 2);
  assert.deepEqual(r.verification.failed.map((f) => f.id), ['cites-in-set', 'cited-sentences']);
  assert.equal(r.missing, '第三方横向比较');
  assert.equal(demandLines(dir)[0].topic, '第三方横向比较');
  assert.deepEqual([...new Set(verdictLines(dir).map((l) => l.round))], [1, 2]);
});

test('the second round can fix it: round 1 out of set, round 2 clean -> passed on round 2, nothing removed', async () => {
  const dir = library('ask-fixed');
  const conn = connector({ answer: (n) => (n === 1
    ? { answer: [{ text: '一句。', cites: [9] }], notInLibrary: false, missing: '' }
    : { answer: [{ text: '一句。', cites: [2] }], notInLibrary: false, missing: '' }) });
  const r = await ask(dir, Q, { connector: conn, now: NOW });
  assert.deepEqual(conn.calls.map((c) => c.model), ['main', 'main', 'verify']);
  assert.equal(r.verification.passed, true);
  assert.equal(r.verification.rounds, 2);
  assert.deepEqual(r.removedCites, []);
  assert.deepEqual(r.answer, [{ text: '一句。', cites: [2] }]);
});

test('notInLibrary from the model is the answer; uncited sentences still go; missing becomes the demand topic', async () => {
  const dir = library('ask-notin');
  const conn = connector({ answer: () => ({ answer: [{ text: '库里没有独立第三方的横向比较。', cites: [] }], notInLibrary: true, missing: 'agent 记忆评测' }) });
  const r = await ask(dir, Q, { connector: conn, now: NOW });
  assert.equal(r.verification.passed, true, 'notInLibrary true allows an answer without cites');
  assert.equal(r.notInLibrary, true);
  assert.deepEqual(r.answer, []);
  assert.equal(r.removedSentences, 1);
  assert.deepEqual(demandLines(dir)[0], { ts: NOW().toISOString(), question: Q.trim(), topic: 'agent 记忆评测', notInLibrary: true, used: [] });
});

test('the judge failing an item is reported in verification.failed; the answer is still returned', async () => {
  const dir = library('ask-judge-no');
  const conn = connector({
    answer: () => ({ answer: [{ text: 'Letta 发布了评测数据。', cites: [1] }], notInLibrary: false, missing: '', claimed: ['claims-supported'] }),
    judge: (ids) => ({ items: ids.map((id) => ({ id, passed: false, evidence: '材料里没有评测数据' })) }),
  });
  const r = await ask(dir, Q, { connector: conn, now: NOW });
  assert.deepEqual(conn.calls.map((c) => c.model), ['main', 'verify', 'main', 'verify']);
  assert.equal(r.verification.passed, false);
  assert.deepEqual(r.verification.failed, [{ id: 'claims-supported', kind: 'judge', evidence: '材料里没有评测数据' }]);
  assert.deepEqual(r.verification.claimsNotFound, ['claims-supported']);
  assert.deepEqual(r.answer, [{ text: 'Letta 发布了评测数据。', cites: [1] }]);
});

test('connection failure -> { ok:false, code }, nothing written (answer call or judge call)', async () => {
  const dir = library('ask-conn');
  const before = hashTree(dir, { skip: /^index/ });
  const r = await ask(dir, Q, { connector: fakeConnector({ mode: 'login-expired' }), now: NOW });
  assert.deepEqual(r, { ok: false, code: 'login-expired', calls: 1 });
  const judgeDown = {
    ...fakeConnector(),
    async complete(req) {
      if (req.model === 'verify') return { ok: false, code: 'network', detail: 'down', usage: { calls: 1 } };
      return { ok: true, json: { answer: [{ text: '一句。', cites: [1] }], notInLibrary: false, missing: '' }, text: '', usage: { calls: 1 }, model: 'm' };
    },
  };
  const r2 = await ask(dir, Q, { connector: judgeDown, now: NOW });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'network');
  assert.deepEqual(hashTree(dir, { skip: /^index/ }), before, 'no demand line, no verdicts');
});

test('bad format twice -> { ok:false, code:"bad-format" }', async () => {
  const dir = library('ask-badformat');
  const r = await ask(dir, Q, { connector: fakeConnector({ mode: 'bad-format-always' }), now: NOW });
  assert.deepEqual(r, { ok: false, code: 'bad-format', calls: 2 });
});

test('language en: the English preamble; maxRounds 1 stops after one round', async () => {
  const dir = library('ask-en', { ...TEST_CONFIG, pipeline: { ...TEST_CONFIG.pipeline, language: 'en' } });
  const conn = connector({ answer: () => ({ answer: [{ text: 'x', cites: [99] }], notInLibrary: false, missing: '' }) });
  const r = await ask(dir, Q, { connector: conn, now: NOW, maxRounds: 1 });
  assert.ok(conn.calls[0].prompt.startsWith(ASK_PREAMBLE_EN));
  assert.ok(conn.calls[0].prompt.includes('Question: '));
  assert.equal(conn.calls.length, 1);
  assert.equal(r.verification.rounds, 1);
  assert.deepEqual(r.removedCites, [99]);
  assert.equal(r.notInLibrary, true, 'nothing cited is left: the answer is "not in the library"');
});

test('bad input: empty question -> bad-question; no connector with candidates -> bad-argument', async () => {
  const dir = library('ask-bad');
  await assert.rejects(() => ask(dir, '   ', { connector: fakeConnector() }), (e) => e.code === 'bad-question');
  await assert.rejects(() => ask(dir, 'memory', {}), (e) => e.code === 'bad-argument');
});

test('the rule items read the check view: each one fails on the input it is meant to catch', () => {
  const rules = Object.fromEntries(askChecklist().filter((i) => i.kind === 'rule').map((i) => [i.id, i.rule]));
  const ids = [1, 2, 3];
  const ok = checkView({ answer: [{ text: 'a', cites: [1, 2] }], notInLibrary: false });
  for (const r of Object.values(rules)) assert.equal(checkRule(r, ok, { candidateIds: ids }).passed, true, r);
  assert.equal(checkRule(rules['cites-in-set'], checkView({ answer: [{ text: 'a', cites: [4] }], notInLibrary: false }), { candidateIds: ids }).passed, false);
  assert.equal(checkRule(rules['cites-in-set'], checkView({ answer: [{ text: 'a', cites: ['2'] }], notInLibrary: false }), { candidateIds: ids }).passed, true, '"2" names candidate 2');
  assert.equal(checkRule(rules['json-keys'], checkView({ answer: [] }), { candidateIds: ids }).passed, false);
  assert.equal(checkRule(rules['cited-sentences'], checkView({ answer: [], notInLibrary: false }), {}).passed, false, 'false with an empty answer');
  assert.equal(checkRule(rules['cited-sentences'], checkView({ answer: [{ text: 'a', cites: [] }], notInLibrary: false }), {}).passed, false, 'a sentence without a cite');
  assert.equal(checkRule(rules['cited-sentences'], checkView({ answer: [], notInLibrary: true }), {}).passed, true, 'true may be empty');
});

test('applyFallback: out-of-range, non-numeric and repeated cites; empty sentences', () => {
  const r = applyFallback({ answer: [{ text: ' a ', cites: [1, 1, '2', 0, 10, 'x'] }, { text: '', cites: [1] }, { text: 'b', cites: 3 }, 'not an object'] }, 3);
  assert.deepEqual(r.answer, [{ text: 'a', cites: [1, 2] }, { text: 'b', cites: [3] }]);
  assert.deepEqual(r.removedCites, [0, 10, 'x']);
  assert.equal(r.removedSentences, 2);
});
