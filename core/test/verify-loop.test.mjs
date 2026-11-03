import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { RETRY_SUFFIX } from '../src/connect/complete-json.mjs';
import { verifyOnce, verifyLoop } from '../src/verify/verify.mjs';
import { judgeItems, buildJudgePrompt, JUDGE_PROMPT } from '../src/verify/judge.mjs';
import { summaryBaseline, lockChecklist } from '../src/verify/checklist.mjs';

const SOURCE = '报告称试点覆盖 500 名用户，目标是 2026 年底扩到 5000。';
const TASK = '写摘要';
const GOOD = { what: '一个记忆层的试点。', points: ['覆盖 500 名用户', '目标年底 5000', '仍在试点'], quote: '试点覆盖 500 名用户' };

const CHECKLIST = lockChecklist([
  { id: 'user-judge', desc: '摘要没有夸大试点的规模' },
], { baseline: summaryBaseline() }).items;

const JUDGE_IDS = CHECKLIST.filter((it) => it.kind === 'judge').map((it) => it.id);
const RULE_IDS = CHECKLIST.filter((it) => it.kind === 'rule').map((it) => it.id);

function allPass() {
  return { items: JUDGE_IDS.map((id) => ({ id, passed: true, evidence: '对得上' })) };
}

test('judge prompt: fixed template, every judge id, output and source each between dashes', () => {
  assert.match(JUDGE_PROMPT, /^你是核对员，不做任务。任务：\{task\}/);
  assert.match(JUDGE_PROMPT, /不信输出里的自我声明/);
  assert.match(JUDGE_PROMPT, /"items":\[\{"id"/);
  assert.equal(JUDGE_PROMPT.includes('{"passed": true|false'), false, 'the batched shape, not the per-item one');
  const items = CHECKLIST.filter((it) => it.kind === 'judge');
  const p = buildJudgePrompt({ task: TASK, items, output: GOOD, source: SOURCE });
  assert.ok(p.includes(`任务：${TASK}`));
  for (const it of items) assert.ok(p.includes(`[${it.id}] ${it.desc}`), it.id);
  assert.ok(p.includes('---\n' + JSON.stringify(GOOD, null, 2) + '\n---'), 'output between dashes');
  assert.ok(p.includes('---\n' + SOURCE + '\n---'), 'source between dashes');
  assert.equal(p.includes('{task}'), false);
  assert.equal(p.includes('{items}'), false);
  assert.equal(p.includes('{output}'), false);
  assert.equal(p.includes('{source}'), false);
  const asString = buildJudgePrompt({ task: TASK, items, output: 'plain text', source: SOURCE });
  assert.ok(asString.includes('---\nplain text\n---'), 'a string output is not JSON-quoted');
});

test('verifyOnce: a failed rule means zero judge calls and judged:false; only rule verdicts are listed', async () => {
  const c = fakeConnector({ mode: 'fixed', json: allPass() });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: { ...GOOD, points: ['只有一行'] }, claimed: ['points-count'], source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.equal(r.judged, false);
  assert.equal(r.calls, 0);
  assert.equal(c.calls.length, 0, 'the connector was not touched');
  assert.deepEqual(r.items.map((it) => it.id), RULE_IDS);
  const failed = r.items.filter((it) => !it.passed).map((it) => it.id);
  assert.deepEqual(failed, ['points-count']);
  assert.deepEqual(r.claimsNotFound, ['points-count']);
  assert.deepEqual(r.forgot, []);
  assert.equal(r.code, undefined);
});

test('verifyOnce: all rules pass -> exactly one judge call with model verify, no system, all ids in the prompt', async () => {
  const c = fakeConnector({ mode: 'counting', json: allPass() });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, claimed: [...RULE_IDS, ...JUDGE_IDS], source: SOURCE, connector: c });
  assert.equal(r.passed, true);
  assert.equal(r.judged, true);
  assert.equal(r.calls, 1);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].model, 'verify');
  assert.equal(c.calls[0].format, 'json');
  assert.equal(c.calls[0].system, undefined, 'no system slot');
  const prompt = c.calls[0].prompt;
  for (const id of JUDGE_IDS) assert.ok(prompt.includes(`[${id}]`), id);
  assert.ok(prompt.includes('---\n' + JSON.stringify(GOOD, null, 2) + '\n---'));
  assert.ok(prompt.includes('---\n' + SOURCE + '\n---'));
  assert.deepEqual(r.items.map((it) => it.id), [...RULE_IDS, ...JUDGE_IDS], 'rule verdicts first, then judge verdicts');
  assert.notDeepEqual(r.items.map((it) => it.id), CHECKLIST.map((it) => it.id), 'sentinel: the user judge item sits first in the checklist but last in verdicts');
  assert.ok(r.items.every((it) => it.passed && it.claimed));
  assert.deepEqual(r.claimsNotFound, []);
  assert.deepEqual(r.forgot, []);
  assert.equal(JUDGE_IDS.length, 2, 'this checklist has two judge items and they share the one call');
});

test('verifyOnce: no judge items -> passes on rules alone with zero calls', async () => {
  const c = fakeConnector({ mode: 'fixed', json: allPass() });
  const rulesOnly = CHECKLIST.filter((it) => it.kind === 'rule');
  const r = await verifyOnce({ task: TASK, checklist: rulesOnly, output: GOOD, source: SOURCE, connector: c });
  assert.equal(r.passed, true);
  assert.equal(r.judged, false);
  assert.equal(r.calls, 0);
  assert.equal(c.calls.length, 0);
});

test('verifyOnce: a judge verdict missing an id -> that id fails with no-verdict; extra ids ignored', async () => {
  const c = fakeConnector({ mode: 'fixed', json: { items: [{ id: 'numbers-in-source', passed: true, evidence: 'ok' }, { id: 'ghost', passed: true, evidence: '?' }] } });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, claimed: ['user-judge'], source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.equal(r.judged, true);
  assert.equal(r.calls, 1);
  const uj = r.items.find((it) => it.id === 'user-judge');
  assert.deepEqual(uj, { id: 'user-judge', kind: 'judge', passed: false, evidence: 'no-verdict', claimed: true });
  assert.equal(r.items.find((it) => it.id === 'numbers-in-source').passed, true);
  assert.equal(r.items.some((it) => it.id === 'ghost'), false);
  assert.deepEqual(r.claimsNotFound, ['user-judge']);
  assert.deepEqual(r.forgot, []);
});

test('verifyOnce: bad format twice -> every judge item judge-unreadable, calls 2, code bad-format', async () => {
  const c = fakeConnector({ mode: 'bad-format-always' });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.equal(r.judged, true);
  assert.equal(r.calls, 2);
  assert.equal(c.calls.length, 2);
  assert.ok(c.calls[1].prompt.endsWith(RETRY_SUFFIX), 'the second attempt carries the format reminder');
  assert.equal(r.code, 'bad-format');
  const judges = r.items.filter((it) => it.kind === 'judge');
  assert.equal(judges.length, JUDGE_IDS.length);
  assert.ok(judges.every((it) => !it.passed && it.evidence === 'judge-unreadable'));
  assert.ok(r.items.filter((it) => it.kind === 'rule').every((it) => it.passed), 'rule verdicts are unaffected');
});

test('verifyOnce: bad format once -> the retry answer is used, calls 2, passed', async () => {
  const c = fakeConnector({ mode: 'bad-format-once', json: allPass() });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, source: SOURCE, connector: c });
  assert.equal(r.passed, true);
  assert.equal(r.calls, 2);
  assert.equal(r.code, undefined);
});

test('verifyOnce: parseable JSON of the wrong shape counts as judge-unreadable', async () => {
  const c = fakeConnector({ mode: 'fixed', json: { passed: true, evidence: 'the per-item shape' } });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.ok(r.items.filter((it) => it.kind === 'judge').every((it) => it.evidence === 'judge-unreadable'));
  assert.equal(r.code, 'bad-format');
  assert.equal(r.calls, 1, 'completeJson does not retry a well-formed answer');
});

test('verifyOnce: connection failure in the judge -> judge-failed:<code>, code passed through, calls 1', async () => {
  const c = fakeConnector({ mode: 'login-expired' });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.equal(r.code, 'login-expired');
  assert.equal(r.calls, 1);
  assert.ok(r.items.filter((it) => it.kind === 'judge').every((it) => it.evidence === 'judge-failed:login-expired'));
});

test('verifyOnce: claimsNotFound vs forgot, with a passed-but-unclaimed item in neither', async () => {
  const c = fakeConnector({
    mode: 'fixed',
    json: { items: [{ id: 'numbers-in-source', passed: false, evidence: '5000 是目标不是已完成' }, { id: 'user-judge', passed: false, evidence: '夸大了' }] },
  });
  const r = await verifyOnce({ task: TASK, checklist: CHECKLIST, output: GOOD, claimed: ['numbers-in-source', 'what-nonempty'], source: SOURCE, connector: c });
  assert.equal(r.passed, false);
  assert.deepEqual(r.claimsNotFound, ['numbers-in-source'], 'claimed and failed');
  assert.deepEqual(r.forgot, ['user-judge'], 'not claimed and failed');
  assert.equal(r.items.find((it) => it.id === 'what-nonempty').claimed, true);
  assert.equal(r.items.find((it) => it.id === 'points-count').claimed, false);
  assert.equal(r.items.find((it) => it.id === 'numbers-in-source').evidence, '5000 是目标不是已完成');
  assert.equal(r.claimsNotFound.includes('user-judge'), false);
  assert.equal(r.forgot.includes('numbers-in-source'), false);
});

test('judgeItems with no items makes no call', async () => {
  const c = fakeConnector({ mode: 'fixed', json: allPass() });
  assert.deepEqual(await judgeItems({ connector: c, task: TASK, items: [], output: GOOD, source: SOURCE }), { items: [], calls: 0, ok: true });
  assert.equal(c.calls.length, 0);
});

test('verifyLoop: round 1 fails on rules, feedback to round 2 lists only the failed items, round 2 passes with rounds 2', async () => {
  const c = fakeConnector({ mode: 'counting', json: allPass() });
  const seen = [];
  const produce = async (feedback, prior) => {
    seen.push({ feedback, prior });
    if (feedback === null) return { output: { ...GOOD, points: ['一行'], quote: '' }, claimed: ['what-nonempty', 'points-count'], calls: 1 };
    return { output: GOOD, claimed: feedback.failed.map((f) => f.id), calls: 1 };
  };
  const r = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 2 });
  assert.equal(r.passed, true);
  assert.equal(r.rounds, 2);
  assert.deepEqual(r.output, GOOD);
  assert.deepEqual(r.claimed, ['points-count', 'quote-in-source']);
  assert.equal(r.history.length, 2);
  assert.equal(r.last, r.history[1]);
  assert.equal(r.calls, 1 + 0 + 1 + 1, 'produce + no judge, produce + one judge call');
  assert.equal(c.calls.length, 1, 'the judge ran once, in round 2 only');
  assert.equal(seen[0].feedback, null);
  assert.equal(seen[0].prior, null);
  assert.deepEqual(seen[1].feedback.failed.map((f) => f.id), ['points-count', 'quote-in-source']);
  assert.ok(seen[1].feedback.failed.every((f) => typeof f.desc === 'string' && f.desc.length >= 6 && typeof f.evidence === 'string' && f.evidence !== ''));
  assert.equal(seen[1].feedback.failed.some((f) => f.id === 'what-nonempty'), false, 'passed items are not in the feedback');
  assert.deepEqual(seen[1].prior, { ...GOOD, points: ['一行'], quote: '' });
  assert.equal(r.history[0].passed, false);
  assert.deepEqual(r.history[0].claimsNotFound, ['points-count']);
  assert.deepEqual(r.history[0].forgot, ['quote-in-source']);
});

test('verifyLoop: still failing at maxRounds -> passed false, rounds == maxRounds, last holds the failures', async () => {
  const c = fakeConnector({ mode: 'fixed', json: { items: [{ id: 'numbers-in-source', passed: false, evidence: '升级了状态词' }, { id: 'user-judge', passed: true, evidence: 'ok' }] } });
  let n = 0;
  const produce = async () => { n++; return { output: GOOD, claimed: [], calls: 1 }; };
  const r = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 2 });
  assert.equal(r.passed, false);
  assert.equal(r.rounds, 2);
  assert.equal(n, 2);
  assert.equal(c.calls.length, 2, 'judge once per round');
  assert.equal(r.calls, 4);
  assert.deepEqual(r.last.forgot, ['numbers-in-source']);
  assert.equal(r.history.length, 2);
  const r3 = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 3 });
  assert.equal(r3.rounds, 3, 'maxRounds is honoured, not a hard-coded 2');
  assert.equal(r3.passed, false);
});

test('verifyLoop: passes in round 1 -> one produce, no feedback ever built; maxRounds < 1 still runs one round', async () => {
  const c = fakeConnector({ mode: 'fixed', json: allPass() });
  const feedbacks = [];
  const produce = async (fb) => { feedbacks.push(fb); return { output: GOOD, claimed: [], calls: 1 }; };
  const r = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 2 });
  assert.equal(r.rounds, 1);
  assert.equal(r.passed, true);
  assert.deepEqual(feedbacks, [null]);
  assert.equal(r.calls, 2);
  const r0 = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 0 });
  assert.equal(r0.rounds, 1);
  await assert.rejects(verifyLoop({ checklist: CHECKLIST, connector: c }), TypeError, 'produce is required');
});

test('verifyLoop stops after a connection failure instead of spending the remaining rounds', async () => {
  const c = fakeConnector({ mode: 'login-expired' });
  let n = 0;
  const produce = async () => { n++; return { output: GOOD, claimed: [], calls: 1 }; };
  const r = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 3 });
  assert.equal(r.passed, false);
  assert.equal(r.rounds, 1);
  assert.equal(n, 1);
  assert.equal(r.last.code, 'login-expired');
  assert.equal(r.calls, 2);
});

test('verifyLoop keeps going after a bad-format judge round (the model may answer properly next time)', async () => {
  let k = 0;
  const c = fakeConnector({
    mode: 'fixed',
    json: () => { k++; return k === 1 ? { wrong: 'shape' } : allPass(); },
  });
  const produce = async () => ({ output: GOOD, claimed: [], calls: 1 });
  const r = await verifyLoop({ task: TASK, checklist: CHECKLIST, source: SOURCE, connector: c, produce, maxRounds: 2 });
  assert.equal(r.history[0].code, 'bad-format');
  assert.equal(r.passed, true);
  assert.equal(r.rounds, 2);
});
