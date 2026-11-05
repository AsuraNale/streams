// streams.json `setup` (plan A1, 4.10): recordSetupStep / readSetup. Controls first: each check fails on input made to break it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordSetupStep, readSetup, SETUP_STEPS, SETUP_BY } from '../src/library/setup.mjs';
import { readConfig } from '../src/library/config.mjs';
import { createLibrary } from '../src/library/create.mjs';
import * as core from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const T1 = new Date('2026-11-04T10:00:00.000Z');
const T2 = new Date('2026-11-04T10:05:00.000Z');

// a library in createLibrary's own format, plus a key the core never reads: every write must keep it
function library(name) {
  const dir = caseDir(name);
  createLibrary(dir, { name });
  const path = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  cfg.topics = [{ name: 'agent 记忆', keywords: ['agent memory'] }];
  cfg.x_future = { keep: ['me', 1] };
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return dir;
}
const raw = (dir) => readFileSync(join(dir, 'streams.json'), 'utf8');
const config = (dir) => JSON.parse(raw(dir));

test('the six steps and the four kinds of who decided are the contract\'s; the core exports both functions', () => {
  assert.deepEqual([...SETUP_STEPS], ['library', 'connection', 'pack', 'sources', 'trial', 'schedule']);
  assert.deepEqual([...SETUP_BY], ['chose', 'wrote', 'default', 'skipped']);
  assert.equal(core.recordSetupStep, recordSetupStep);
  assert.equal(core.readSetup, readSetup);
});

test('no record yet -> readSetup is {}; a record per step with by, at and the detail; the other keys keep value and order', () => {
  const dir = library('setup-record');
  assert.deepEqual(readSetup(dir), {}, 'a library made before (or imported) has no record');
  const before = config(dir);
  const r = recordSetupStep(dir, 'connection', { by: 'chose', detail: 'claude-code' }, { now: () => T1 });
  assert.deepEqual(r, { step: 'connection', by: 'chose', at: T1.toISOString(), detail: 'claude-code' });
  recordSetupStep(dir, 'sources', { by: 'wrote', detail: { removed: 2, added: 1 } }, { now: () => T1 });
  recordSetupStep(dir, 'schedule', { by: 'default' }, { now: () => T1 });
  assert.deepEqual(readSetup(dir), {
    connection: { by: 'chose', at: T1.toISOString(), detail: 'claude-code' },
    sources: { by: 'wrote', at: T1.toISOString(), detail: { removed: 2, added: 1 } },
    schedule: { by: 'default', at: T1.toISOString() },
  });
  const after = config(dir);
  // every key that was there is there, with its value, in its order; `setup` is added at the end
  assert.deepEqual(Object.keys(after), [...Object.keys(before), 'setup']);
  for (const k of Object.keys(before)) assert.deepEqual(after[k], before[k], k);
  assert.ok(raw(dir).endsWith('}\n') && raw(dir).includes('\n  "setup": {\n'), 'the 2-space format with a final newline');
  // readConfig still reads a file with `setup`
  assert.equal(readConfig(dir).ok, true);
});

test('walking back and through a step again replaces that step only', () => {
  const dir = library('setup-replace');
  recordSetupStep(dir, 'connection', { by: 'chose', detail: 'codex' }, { now: () => T1 });
  recordSetupStep(dir, 'pack', { by: 'chose', detail: 'blank' }, { now: () => T1 });
  recordSetupStep(dir, 'connection', { by: 'skipped' }, { now: () => T2 });
  const s = readSetup(dir);
  assert.deepEqual(s.connection, { by: 'skipped', at: T2.toISOString() }, 'the new record, without the old detail');
  assert.deepEqual(s.pack, { by: 'chose', at: T1.toISOString(), detail: 'blank' }, 'the other step untouched');
  assert.deepEqual(Object.keys(config(dir).setup), ['connection', 'pack']);
});

test('refused: an unknown step, an unknown by, an extra key, a detail too big; nothing written', () => {
  const dir = library('setup-bad');
  const was = raw(dir);
  const bad = [
    ['folder', { by: 'chose' }],
    ['', { by: 'chose' }],
    ['library', { by: 'picked' }],
    ['library', { by: 'Chose' }],
    ['library', {}],
    ['library', null],
    ['library', { by: 'chose', when: 'now' }],
    ['library', { by: 'chose', detail: 'x'.repeat(3000) }],
  ];
  for (const [step, entry] of bad) {
    assert.throws(() => recordSetupStep(dir, step, entry), (e) => e.code === 'bad-setup', `${step} ${JSON.stringify(entry)?.slice(0, 60)}`);
  }
  assert.equal(raw(dir), was, 'nothing written');
  // control: the same call with good values does write
  recordSetupStep(dir, 'library', { by: 'chose' });
  assert.notEqual(raw(dir), was);
});

test('the write goes through a temporary file and a rename: the file is a new one; with the temporary name taken, nothing changes', () => {
  const dir = library('setup-atomic');
  const path = join(dir, 'streams.json');
  const ino = statSync(path).ino;
  recordSetupStep(dir, 'library', { by: 'chose' });
  assert.notEqual(statSync(path).ino, ino, 'a rename put a new file in place (a write in place keeps the same file)');
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'no temporary file left');
  // the temporary name is a folder: the write cannot go there, so it fails and streams.json is what it was
  const tmp = `${path}.${process.pid}.tmp`;
  mkdirSync(tmp);
  const was = raw(dir);
  assert.throws(() => recordSetupStep(dir, 'trial', { by: 'chose' }));
  assert.equal(raw(dir), was, 'streams.json untouched when the temporary file cannot be written');
  rmSync(tmp, { recursive: true });
});

test('readSetup leaves out what is not a record; a library without streams.json is a config error; notes/ is never touched', () => {
  const dir = library('setup-read');
  const cfg = config(dir);
  cfg.setup = { library: { by: 'chose', at: T1.toISOString() }, pack: { by: 'guessed', at: T1.toISOString() }, folder: { by: 'chose', at: T1.toISOString() }, trial: 'skipped', schedule: { by: 'default' } };
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  assert.deepEqual(readSetup(dir), { library: { by: 'chose', at: T1.toISOString() } });
  cfg.setup = ['library'];
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  assert.deepEqual(readSetup(dir), {});
  const notes = join(dir, 'notes');
  const notesBefore = existsSync(notes) ? readdirSync(notes) : [];
  for (const step of SETUP_STEPS) recordSetupStep(dir, step, { by: 'default' });
  assert.deepEqual(existsSync(notes) ? readdirSync(notes) : [], notesBefore, 'notes/ as it was');
  const empty = caseDir('setup-none');
  assert.throws(() => readSetup(empty), (e) => e.code === 'config:missing');
  assert.throws(() => recordSetupStep(empty, 'library', { by: 'chose' }), (e) => e.code === 'config:missing');
});
