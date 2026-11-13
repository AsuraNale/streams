// Redesign R5b (docs/checks/2026-11-12-r5b/contract.md): what the interface needs of the core that R5a did not give.
//   R5b-4  rescoreInfo says WHICH part of the 评分标准 changed last (changedField: brief · thresholds · prompts), so 未通过筛选's
//          notice names it (P05: 「追踪要求已于 … 更新」)
//   R5b-2  the main agent's calls a message takes (the 主 Agent page's line under the box): one call for an answer, one more for
//          each round of lookups, at most MAX_LOOKUP_ROUNDS rounds — 1 to 1 + MAX_LOOKUP_ROUNDS
//          precheck fix 3: TURN_CALLS { lo 1, hi 4, max 18 } — the most with every answer retried, every session lost and the
//          summary retried (agentTurn driven to each number on the scripted connection)
// Each check first shows the input that makes it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { recordChanges, snapshot } from '../src/proposals/changes.mjs';
import { saveBrief } from '../src/library/brief.mjs';
import { saveStrictness } from '../src/pipeline/strictness.mjs';
import { rescoreInfo, standardChange } from '../src/pipeline/rescore.mjs';
import { MAX_LOOKUP_ROUNDS } from '../src/agent/protocol.mjs';
import { COMPRESS_THRESHOLD, SUMMARY_CALLS_MAX, TURN_CALLS, agentTurn } from '../src/agent/turn.mjs';
import { appendTranscript, writeSession } from '../src/agent/store.mjs';
import { scriptedAgentConnector } from '../src/agent/fake.mjs';
import { makeLibrary, TEST_CONFIG } from './support/fixtures.mjs';
import { caseDir } from './support/tmp.mjs';

const T0 = Date.parse('2026-11-13T08:00:00.000Z');
const clock = (h) => () => new Date(T0 + h * 3_600_000);

test('R5b-4 rescoreInfo.changedField: the field of the newest change of the 评分标准 (brief · thresholds), null with no record', () => {
  const dir = makeLibrary('r5b-changed', { ...TEST_CONFIG });
  assert.deepEqual(standardChange(dir), { at: null, field: null }, 'control: nothing recorded yet');
  assert.equal(rescoreInfo(dir).changedField, null);
  // 严格程度 by you at hour 1
  let before = snapshot(dir, ['thresholds']);
  saveStrictness(dir, 'strict');
  recordChanges(dir, before, snapshot(dir, ['thresholds']), { by: 'you', now: clock(1) });
  assert.deepEqual(standardChange(dir), { at: new Date(T0 + 3_600_000).toISOString(), field: 'thresholds' });
  assert.equal(rescoreInfo(dir).changedField, 'thresholds');
  // then 追踪要求 at hour 2: the newest one is named
  before = snapshot(dir, ['brief']);
  saveBrief(dir, '只追评测数据。');
  recordChanges(dir, before, snapshot(dir, ['brief']), { by: 'you', now: clock(2) });
  const info = rescoreInfo(dir);
  assert.equal(info.changedField, 'brief');
  assert.equal(info.changedAt, new Date(T0 + 2 * 3_600_000).toISOString());
  // a change that is not the standard (the cap) does not move it
  before = snapshot(dir, ['cap']);
  recordChanges(dir, before, { ...before, cap: 7 }, { by: 'you', now: clock(3) });
  assert.equal(rescoreInfo(dir).changedField, 'brief', 'the cap is not the 评分标准');
});

test('R5b-2 the main agent\'s calls a message takes: 1 for an answer, +1 for each round of lookups, at most 1 + MAX_LOOKUP_ROUNDS', async () => {
  assert.equal(MAX_LOOKUP_ROUNDS, 3, 'the page\'s line says 1–4: the core\'s rounds of lookups');
  const root = caseDir('r5b-agent');
  const run = async (answers) => {
    const agentDir = join(root, `a${Math.random().toString(16).slice(2)}`);
    mkdirSync(agentDir, { recursive: true });
    const connector = scriptedAgentConnector({ answers });
    const r = await agentTurn({ text: '各库怎么样？' }, { agentDir, connector, registry: { libraries: [] }, proposals: [], createProposal: () => { throw new Error('no'); }, now: clock(0), log: () => {} });
    return r.calls;
  };
  const look = { reply: '', lookups: [{ what: 'proposals' }] };
  assert.equal(await run([{ reply: '都好。' }]), 1, 'an answer straight away');
  assert.equal(await run([look, { reply: '查过了。' }]), 2, 'one round of lookups');
  // looking up every time: after MAX_LOOKUP_ROUNDS rounds the last call may not look up again — 1 + 3 calls
  assert.equal(await run([look, look, look, { reply: '查完了。' }]), 1 + MAX_LOOKUP_ROUNDS);
  assert.notEqual(await run([look, look, { reply: '查完了。' }]), 1 + MAX_LOOKUP_ROUNDS, 'control: fewer rounds, fewer calls');
});

// Redesign R5b precheck fix 3 (05 规则 8): the page says 「通常 1–4 次 …，最多 18 次」 — TURN_CALLS. The most the code allows: each
// of the 1 + MAX_LOOKUP_ROUNDS answers not usable and asked once more, each call on a session that will not resume and sent again
// on a new one, then the summary of the conversation with its one more try on a bad format.
test('R5b-2 precheck fix 3: TURN_CALLS — 1 straight away, 4 after every round of lookups, 18 at most (retries, sessions lost, the summary retried)', async () => {
  assert.deepEqual({ ...TURN_CALLS }, { lo: 1, hi: 1 + MAX_LOOKUP_ROUNDS, max: (1 + MAX_LOOKUP_ROUNDS) * 2 * 2 + SUMMARY_CALLS_MAX });
  assert.deepEqual({ ...TURN_CALLS }, { lo: 1, hi: 4, max: 18 });
  const root = caseDir('r5b-agent-max');
  const look = { reply: '', lookups: [{ what: 'proposals' }] };
  const bad = { $text: 'not json at all' };
  /** A turn on a sessionful connection whose cached session never resumes; `failures` of the script's answers not usable. */
  const worst = async ({ answers, compress = true, summaryBad = true }) => {
    const agentDir = join(root, `a${Math.random().toString(16).slice(2)}`);
    mkdirSync(agentDir, { recursive: true });
    writeSession(agentDir, 'fake', { sessionId: 'cached', startedAt: clock(0)().toISOString(), turns: 1, summarizedThrough: 0 });
    // the conversation so far is over COMPRESS_THRESHOLD characters: this turn ends with a summary
    if (compress) for (let i = 0; i < Math.ceil((COMPRESS_THRESHOLD + 1) / 3000); i++) appendTranscript(agentDir, { turn: 1, role: 'you', text: '长'.repeat(3000) }, { now: clock(0) });
    let next = 0;
    const base = scriptedAgentConnector({ answers: (req, n, { sessionId }) => (sessionId ? { $lost: true } : answers[next++]) });
    let summaries = 0;
    const connector = { ...base, complete: async (req) => (summaryBad && summaries++ === 0 ? { ok: false, code: 'bad-format', text: 'no json', usage: { calls: 1 } } : base.complete(req)) };
    const r = await agentTurn({ text: '各库怎么样？' }, { agentDir, connector, registry: { libraries: [] }, proposals: [], createProposal: () => { throw new Error('no'); }, now: clock(1), log: () => {} });
    return { calls: r.calls, made: base.calls.length + (summaryBad ? 1 : 0), compressed: r.compressed === true, reply: r.reply };
  };
  const most = await worst({ answers: [bad, look, bad, look, bad, look, bad, { reply: '查完了。' }] });
  assert.equal(most.reply, '查完了。', 'control: the turn ended with the answer');
  assert.equal(most.compressed, true, 'control: the summary was written');
  assert.equal(most.calls, TURN_CALLS.max, 'the turn counts 18');
  assert.equal(most.made, TURN_CALLS.max, 'and the connection was called 18 times');
  // control: one answer usable at once, one call fewer on each side of it (its retry and the retry's lost session)
  const fewer = await worst({ answers: [look, bad, look, bad, look, bad, { reply: '查完了。' }] });
  assert.equal(fewer.calls, TURN_CALLS.max - 2);
  // the usual most: every round of lookups, nothing retried, no session lost, no summary — 4
  const agentDir = join(root, 'usual');
  mkdirSync(agentDir, { recursive: true });
  const usual = await agentTurn({ text: '各库怎么样？' }, { agentDir, connector: scriptedAgentConnector({ answers: [look, look, look, { reply: '查完了。' }] }), registry: { libraries: [] }, proposals: [], createProposal: () => { throw new Error('no'); }, now: clock(1), log: () => {} });
  assert.equal(usual.calls, TURN_CALLS.hi);
});
