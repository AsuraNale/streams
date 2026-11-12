// Redesign R4b (docs/checks/2026-11-12-r4b/contract.md R4b-1, R4b-2, 「测」): the core under 来源与要求 and 高级设置.
//   - 库名称 (N08): saveLibraryName writes streams.json `name` (trimmed), every other key byte for byte as it was; an empty or a too
//     long name is refused and nothing is written.
//   - the change history has two more fields: `name` (the library's name) and `prompts` (each model step's requirement, material
//     and the user's own check items — the built-in ones are never the user's, never in it); a change of either is one line.
//   - changeLog: every line of changes.jsonl (by you / agent-confirmed, before and after) and 首次设置's record (as 'setup'), newest
//     first; nothing made up: a library with no record has no row, a bad line is skipped and counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary } from '../src/library/create.mjs';
import { saveLibraryName, NAME_MAX, saveBrief } from '../src/library/brief.mjs';
import { recordSetupStep } from '../src/library/setup.mjs';
import { pipelineConfig, savePipelineConfig } from '../src/pipeline/config.mjs';
import { saveStrictness } from '../src/pipeline/strictness.mjs';
import { CHANGE_FIELDS, changeLog, fieldValue, recordChange, recordChanges, snapshot } from '../src/proposals/changes.mjs';
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
  assert.deepEqual([...CHANGE_FIELDS], ['brief', 'sources', 'topics', 'thresholds', 'schedule', 'cap', 'name', 'prompts']);
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

test('R4b-2 the name and the prompts are fields of the history: their values, one line per change, the built-in checks never in it', () => {
  const dir = lib('fields');
  assert.equal(fieldValue(dir, 'name'), 'AI Agent 记忆');
  const p0 = fieldValue(dir, 'prompts');
  assert.deepEqual(p0.map((p) => p.id), pipelineConfig(dir).nodes.filter((n) => n.kind === 'gate' || n.kind === 'summary').map((n) => n.id));
  assert.ok(p0.every((p) => Array.isArray(p.checks) && p.checks.length === 0), 'no check of the user\'s yet (the built-in ones are not counted)');
  assert.ok(pipelineConfig(dir).nodes.some((n) => (n.checklist ?? []).some((c) => c.origin === 'streams')), 'control: there are built-in checks');
  // the name changed: one line
  const before = snapshot(dir, ['name', 'prompts', 'thresholds']);
  saveLibraryName(dir, '新名字');
  const lines = recordChanges(dir, before, snapshot(dir, ['name', 'prompts', 'thresholds']), { by: 'you', now: at(1) });
  assert.deepEqual(lines.map((l) => [l.field, l.before, l.after]), [['name', 'AI Agent 记忆', '新名字']]);
  // a prompt and a check of the user's changed: one line, prompts
  const cfg = pipelineConfig(dir);
  const rel = cfg.nodes.find((n) => n.id === 'relevance');
  rel.requirement = `${rel.requirement}\n营销稿打 0.3 以下。`;
  rel.checklist = [{ id: 'user-1', desc: '理由里点出这是不是营销稿', kind: 'judge', origin: 'user' }, ...rel.checklist];
  const b2 = snapshot(dir, ['name', 'prompts', 'thresholds']);
  savePipelineConfig(dir, cfg);
  const l2 = recordChanges(dir, b2, snapshot(dir, ['name', 'prompts', 'thresholds']), { by: 'you', now: at(2) });
  assert.deepEqual(l2.map((l) => l.field), ['prompts']);
  const relAfter = l2[0].after.find((p) => p.id === 'relevance');
  assert.ok(relAfter.requirement.endsWith('营销稿打 0.3 以下。'));
  assert.deepEqual(relAfter.checks, ['理由里点出这是不是营销稿']);
  // a level saved: thresholds only
  const b3 = snapshot(dir, ['name', 'prompts', 'thresholds']);
  saveStrictness(dir, 'strict');
  assert.deepEqual(recordChanges(dir, b3, snapshot(dir, ['name', 'prompts', 'thresholds']), { by: 'you', now: at(3) }).map((l) => l.field), ['thresholds']);
});

test('R4b-2 变更记录: every line and the setup record, newest first; by you / agent-confirmed / setup; nothing made up', () => {
  const dir = lib('log');
  assert.deepEqual(changeLog(dir), { rows: [], skipped: 0 }, 'a library with no record has no row (nothing made up)');
  recordSetupStep(dir, 'library', { by: 'chose', detail: 'empty' }, { now: at(0) });
  recordSetupStep(dir, 'schedule', { by: 'default' }, { now: at(0) });
  recordChange(dir, { field: 'brief', by: 'agent-confirmed', proposalId: 'p-1', before: null, after: '只要评测' }, { now: at(5) });
  recordChange(dir, { field: 'cap', by: 'you', before: 120, after: 30 }, { now: at(9) });
  recordChange(dir, { field: 'name', by: 'you', before: 'AI Agent 记忆', after: 'AI Agent 长期记忆' }, { now: at(9) });
  writeFileSync(join(dir, '_pipeline', 'changes.jsonl'), `${readFileSync(join(dir, '_pipeline', 'changes.jsonl'), 'utf8')}not json\n{"field":"cap","by":"robot","at":"x"}\n`);
  const { rows, skipped } = changeLog(dir);
  assert.equal(skipped, 2, 'the bad lines are counted, not shown');
  assert.deepEqual(rows.map((r) => r.kind), ['change', 'change', 'change', 'setup', 'setup'])
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.field, r.by, r.before, r.after, r.proposalId]), [
    ['name', 'you', 'AI Agent 记忆', 'AI Agent 长期记忆', null], // the same minute as cap: the later line first
    ['cap', 'you', 120, 30, null],
    ['brief', 'agent-confirmed', null, '只要评测', 'p-1'],
  ]);
  assert.deepEqual(rows.slice(3).map((r) => [r.kind, r.step, r.by, r.setupBy]).sort(), [['setup', 'library', 'setup', 'chose'], ['setup', 'schedule', 'setup', 'default']]);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].at >= r.at), 'newest first');
  // the control: a change that is not recorded is not in the log (the page shows what the file says)
  saveBrief(dir, '直接写进去的要求');
  assert.equal(changeLog(dir).rows.length, 5, 'saveBrief alone writes no line: the caller records (desktop byYou)');
});

test('R4b-2 the scoring steps carry no tool: a `tools` list written into streams.json by hand is not read back, and the page has none to show', () => {
  const dir = lib('tools');
  const whole = config(dir);
  const cfg = pipelineConfig(dir);
  whole.pipeline = { ...(whole.pipeline ?? {}), nodes: cfg.nodes.map((n) => (n.kind === 'gate' || n.kind === 'summary' ? { id: n.id, kind: n.kind, tools: ['web_fetch'] } : { id: n.id, kind: n.kind })) };
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(whole, null, 2) + '\n');
  assert.ok(text(dir).includes('web_fetch'), 'control: the file says it');
  for (const n of pipelineConfig(dir).nodes) assert.equal(Object.hasOwn(n, 'tools'), false, `${n.id}: no tools`);
});
