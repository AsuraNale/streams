// Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1, R4b-2, 「测」): the core under 来源与要求 and 高级设置.
//   - 库名称 (N08): saveLibraryName writes streams.json `name` (trimmed), every other key byte for byte as it was; an empty or a too
//     long name is refused and nothing is written.
//   - the change history has the field `name` (the library's name); a change of it is one line. (1.1 W7b: R4b's other field,
//     `prompts` — v1.0's model steps — and `thresholds` / `cap` left with the scoring pipeline: the history knows brief, sources,
//     topics, schedule and name, and a line v1.0 wrote about one of the others is read as not a change.)
//   - changeLog: every line of changes.jsonl (by you / agent-confirmed, before and after) and 首次设置's record (as 'setup'), newest
//     first; nothing made up: a library with no record has no row, a bad line is skipped and counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary } from '../src/library/create.mjs';
import { saveLibraryName, NAME_MAX, saveBrief } from '../src/library/brief.mjs';
import { recordSetupStep } from '../src/library/setup.mjs';
import { CHANGE_FIELDS, changeLog, fieldValue, recordChange, recordChanges, snapshot } from '../src/library/changes.mjs';
import * as core from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const T0 = new Date('2026-11-12T10:00:00Z');
const at = (min) => () => new Date(T0.getTime() + min * 60_000);
const config = (dir) => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
const text = (dir) => readFileSync(join(dir, 'streams.json'), 'utf8');
const lib = (name) => { const dir = caseDir(`r4b-${name}`); createLibrary(dir, { name: 'AI Agent 记忆' }); return dir; };
const refused = (code) => (err) => err?.code === code;

test('R4b exports: saveLibraryName and changeLog are the core\'s', () => {
  for (const n of ['saveLibraryName', 'changeLog']) assert.equal(typeof core[n], 'function', n);
  assert.deepEqual([...CHANGE_FIELDS], ['brief', 'sources', 'topics', 'schedule', 'name']);
});

test('R4b-1 库名称: streams.json name written, trimmed; every other key as it was; empty / too long refused, nothing written', () => {
  const dir = lib('name');
  const before = config(dir);
  assert.equal(before.name, 'AI Agent 记忆', 'control: the name it was made with');
  assert.deepEqual(saveLibraryName(dir, '  AI Agent 长期记忆 '), { name: 'AI Agent 长期记忆' });
  const after = config(dir);
  assert.equal(after.name, 'AI Agent 长期记忆');
  assert.deepEqual({ ...after, name: before.name }, before, 'nothing else changed');
  assert.deepEqual(Object.keys(after), Object.keys(before), 'the keys keep their order');
  const kept = text(dir);
  for (const bad of ['', '   ', 'x'.repeat(NAME_MAX + 1), 3, null]) assert.throws(() => saveLibraryName(dir, bad), refused('bad-argument'), String(bad));
  assert.equal(text(dir), kept, 'a refused name writes nothing');
  assert.doesNotThrow(() => saveLibraryName(dir, 'x'.repeat(NAME_MAX)), 'control: 100 characters are taken');
});

test('R4b-2 the name is a field of the history: its value, one line per change; v1.0\'s scoring fields are not fields any more', () => {
  const dir = lib('fields');
  assert.equal(fieldValue(dir, 'name'), 'AI Agent 记忆');
  // the name changed: one line
  const before = snapshot(dir, ['name', 'brief']);
  saveLibraryName(dir, '新名字');
  const lines = recordChanges(dir, before, snapshot(dir, ['name', 'brief']), { by: 'you', now: at(1) });
  assert.deepEqual(lines.map((l) => [l.field, l.before, l.after]), [['name', 'AI Agent 记忆', '新名字']]);
  // 1.1 W7b: the gates' marks, the round's cap and the model steps' prompts are no field to read or to record
  for (const field of ['thresholds', 'cap', 'prompts']) {
    assert.throws(() => fieldValue(dir, field), refused('bad-change'), field);
    assert.throws(() => recordChange(dir, { field, by: 'you', before: null, after: 1 }, { now: at(2) }), refused('bad-change'), field);
  }
  assert.deepEqual(changeLog(dir).rows.map((r) => r.field), ['name'], 'the refused ones wrote nothing');
});

test('R4b-2 变更记录: every line and the setup record, newest first; by you / agent-confirmed / setup; nothing made up', () => {
  const dir = lib('log');
  assert.deepEqual(changeLog(dir), { rows: [], skipped: 0 }, 'a library with no record has no row (nothing made up)');
  recordSetupStep(dir, 'library', { by: 'chose', detail: 'empty' }, { now: at(0) });
  recordSetupStep(dir, 'schedule', { by: 'default' }, { now: at(0) });
  recordChange(dir, { field: 'brief', by: 'agent-confirmed', proposalId: 'p-1', before: null, after: '只要评测' }, { now: at(5) });
  recordChange(dir, { field: 'schedule', by: 'you', before: { enabled: true, time: '08:00' }, after: { enabled: true, time: '09:00' } }, { now: at(9) });
  recordChange(dir, { field: 'name', by: 'you', before: 'AI Agent 记忆', after: 'AI Agent 长期记忆' }, { now: at(9) });
  // 1.1 W7b: a line v1.0 wrote about its scoring steps is read as not a change: counted, not shown
  const v1 = JSON.stringify({ at: at(7)().toISOString(), field: 'thresholds', by: 'you', before: { a: 0.7 }, after: { a: 0.8 } });
  writeFileSync(join(dir, '_pipeline', 'changes.jsonl'), `${readFileSync(join(dir, '_pipeline', 'changes.jsonl'), 'utf8')}not json\n{"field":"name","by":"robot","at":"x"}\n${v1}\n`);
  const { rows, skipped } = changeLog(dir);
  assert.equal(skipped, 3, 'the bad lines are counted, not shown');
  assert.deepEqual(rows.map((r) => r.kind), ['change', 'change', 'change', 'setup', 'setup'])
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.field, r.by, r.before, r.after, r.proposalId]), [
    ['name', 'you', 'AI Agent 记忆', 'AI Agent 长期记忆', null], // the same minute as the schedule: the later line first
    ['schedule', 'you', { enabled: true, time: '08:00' }, { enabled: true, time: '09:00' }, null],
    ['brief', 'agent-confirmed', null, '只要评测', 'p-1'],
  ]);
  assert.deepEqual(rows.slice(3).map((r) => [r.kind, r.step, r.by, r.setupBy]).sort(), [['setup', 'library', 'setup', 'chose'], ['setup', 'schedule', 'setup', 'default']]);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].at >= r.at), 'newest first');
  // the control: a change that is not recorded is not in the log (the page shows what the file says)
  saveBrief(dir, '直接写进去的要求');
  assert.equal(changeLog(dir).rows.length, 5, 'saveBrief alone writes no line: the caller records (desktop byYou)');
});
