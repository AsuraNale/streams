import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { demands, addDemand, answerFeedback, appendDemandLine, DEMAND_FILE, FEEDBACK_FILE } from '../src/ask/demand.mjs';
import { caseDir } from './support/tmp.mjs';

const at = (d) => () => new Date(`2026-11-0${d}T10:00:00.000Z`);

test('demands: grouped by topic with case and spaces folded, most asked first, suggest at the threshold', () => {
  const dir = caseDir('demand-group');
  appendDemandLine(dir, { question: 'q1', topic: 'agent 记忆评测', notInLibrary: true, used: [] }, { now: at(1) });
  appendDemandLine(dir, { question: 'q2', topic: 'Agent  记忆评测 ', notInLibrary: true, used: [] }, { now: at(2) });
  appendDemandLine(dir, { question: 'q3', topic: 'MCP 鉴权', notInLibrary: true, used: [] }, { now: at(3) });
  appendDemandLine(dir, { question: 'q4', topic: null, notInLibrary: false, used: ['x'] }, { now: at(4) });
  appendDemandLine(dir, { question: 'q5', topic: '', notInLibrary: false, used: [] }, { now: at(5) });
  addDemand(dir, 'AGENT 记忆评测', { question: 'q6', now: at(6) });
  const d = demands(dir);
  assert.deepEqual(d, [
    { topic: 'AGENT 记忆评测', count: 3, last: '2026-11-06T10:00:00.000Z', suggest: true },
    { topic: 'MCP 鉴权', count: 1, last: '2026-11-03T10:00:00.000Z', suggest: false },
  ]);
  assert.equal(demands(dir, { threshold: 4 })[0].suggest, false);
  assert.equal(demands(dir, { threshold: 1 })[1].suggest, true);
});

test('demands: equal counts -> the more recent first; an empty file -> []', () => {
  const dir = caseDir('demand-ties');
  assert.deepEqual(demands(dir), []);
  appendDemandLine(dir, { topic: 'older' }, { now: at(1) });
  appendDemandLine(dir, { topic: 'newer' }, { now: at(2) });
  assert.deepEqual(demands(dir).map((x) => x.topic), ['newer', 'older']);
});

test('addDemand appends a by:user line and returns the folded count; empty topic -> bad-topic, nothing written', () => {
  const dir = caseDir('demand-add');
  assert.deepEqual(addDemand(dir, ' MCP 鉴权 ', { question: '怎么鉴权？', now: at(1) }), { topic: 'MCP 鉴权', count: 1 });
  assert.deepEqual(addDemand(dir, 'mcp 鉴权', { now: at(2) }), { topic: 'mcp 鉴权', count: 2 });
  const lines = readFileSync(join(dir, DEMAND_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { ts: '2026-11-01T10:00:00.000Z', topic: 'MCP 鉴权', question: '怎么鉴权？', by: 'user' });
  assert.equal(lines[1].question, null);
  for (const bad of ['', '   ', null, 3]) assert.throws(() => addDemand(dir, bad), (e) => e.code === 'bad-topic');
  assert.equal(readFileSync(join(dir, DEMAND_FILE), 'utf8').trim().split('\n').length, 2);
});

test('answerFeedback appends to feedback.jsonl; empty note -> bad-feedback', () => {
  const dir = caseDir('demand-feedback');
  assert.deepEqual(answerFeedback(dir, { question: 'q', note: ' 出处 2 不对 ' }, { now: at(1) }), { ok: true });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, FEEDBACK_FILE), 'utf8')), { ts: '2026-11-01T10:00:00.000Z', question: 'q', note: '出处 2 不对' });
  for (const note of ['', '  ', undefined]) assert.throws(() => answerFeedback(dir, { question: 'q', note }), (e) => e.code === 'bad-feedback');
});

test('a jsonl whose last line lost its newline gets a fresh line, not a glued one', () => {
  const dir = caseDir('demand-newline');
  mkdirSync(join(dir, '_pipeline'), { recursive: true });
  const first = JSON.stringify({ ts: '2026-11-01T00:00:00.000Z', topic: 'first' });
  writeFileSync(join(dir, DEMAND_FILE), first, 'utf8');
  addDemand(dir, 'second', { now: at(2) });
  const text = readFileSync(join(dir, DEMAND_FILE), 'utf8');
  assert.ok(text.startsWith(first + '\n{'));
  assert.deepEqual(demands(dir).map((d) => d.topic).sort(), ['first', 'second']);
  // the naive append would have made one unreadable line
  assert.throws(() => JSON.parse(first + JSON.stringify({ topic: 'second' })));
});
