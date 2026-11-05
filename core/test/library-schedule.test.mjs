// streams.json `schedule` (v2 package A; docs/core-api.md 5.10): each library's own timed round, read field by field,
// written whole (the other keys keep value and order), and the migration from v1.0's settings.json schedule that writes
// only when the key is missing. scheduleOf / isSchedule. Controls first: each check fails on input made to break it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureLibrarySchedule, readLibrarySchedule, saveLibrarySchedule } from '../src/library/schedule.mjs';
import { DEFAULT_SCHEDULE, isSchedule, scheduleOf } from '../src/pipeline/schedule.mjs';
import { createLibrary } from '../src/library/create.mjs';
import { readConfig } from '../src/library/config.mjs';
import * as core from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

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

test('scheduleOf: each field on its own (a bad one is the default\'s); isSchedule: exactly { enabled, time }', () => {
  assert.deepEqual(scheduleOf({ enabled: false, time: '21:15' }), { enabled: false, time: '21:15' });
  assert.deepEqual(scheduleOf({ enabled: false, time: '25:00' }), { enabled: false, time: '08:30' });
  assert.deepEqual(scheduleOf({ enabled: 'no', time: '07:05' }), { enabled: true, time: '07:05' });
  assert.deepEqual(scheduleOf(undefined), { ...DEFAULT_SCHEDULE });
  assert.deepEqual(scheduleOf('daily'), { ...DEFAULT_SCHEDULE });
  assert.equal(isSchedule({ enabled: true, time: '00:00' }), true);
  for (const bad of [{ enabled: true, time: '24:00' }, { enabled: 1, time: '08:30' }, { enabled: true, time: '08:30', every: 2 }, { time: '08:30' }, null, []]) assert.equal(isSchedule(bad), false, JSON.stringify(bad));
  for (const name of ['readLibrarySchedule', 'saveLibrarySchedule', 'ensureLibrarySchedule', 'scheduleOf', 'isSchedule']) assert.equal(typeof core[name], 'function', name);
});

test('readLibrarySchedule: none stored → the default, stored false; a stored one field by field', () => {
  const dir = library('lib-schedule-read');
  assert.deepEqual(readLibrarySchedule(dir), { schedule: { enabled: true, time: '08:30' }, stored: false });
  const cfg = config(dir);
  writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...cfg, schedule: { enabled: false, time: '99:99' } }, null, 2) + '\n');
  assert.deepEqual(readLibrarySchedule(dir), { schedule: { enabled: false, time: '08:30' }, stored: true });
  assert.throws(() => readLibrarySchedule(caseDir('lib-schedule-none')), (e) => e.code === 'config:missing');
});

test('saveLibrarySchedule: written whole, every other key with its value and order; a bad schedule writes nothing', () => {
  const dir = library('lib-schedule-save');
  const before = config(dir);
  assert.deepEqual(saveLibrarySchedule(dir, { enabled: false, time: '21:15' }), { enabled: false, time: '21:15' });
  const after = config(dir);
  assert.deepEqual(Object.keys(after), [...Object.keys(before), 'schedule']);
  for (const k of Object.keys(before)) assert.deepEqual(after[k], before[k], k);
  assert.deepEqual(after.schedule, { enabled: false, time: '21:15' });
  assert.ok(raw(dir).endsWith('}\n'), '2-space JSON + final newline');
  assert.equal(readConfig(dir).ok, true);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'no temporary file left');
  const text = raw(dir);
  for (const bad of [{ enabled: true, time: '25:00' }, { enabled: true }, { enabled: true, time: '08:30', x: 1 }]) {
    assert.throws(() => saveLibrarySchedule(dir, bad), (e) => e.code === 'bad-argument', JSON.stringify(bad));
  }
  assert.equal(raw(dir), text, 'nothing written');
  // a second save keeps the key where it is
  saveLibrarySchedule(dir, { enabled: true, time: '06:00' });
  assert.deepEqual(Object.keys(config(dir)), Object.keys(after));
});

test('ensureLibrarySchedule: no key → the fallback (v1.0\'s settings.json schedule) written in, the rest deep-equal; a key there → nothing written', () => {
  const dir = library('lib-schedule-ensure');
  const before = config(dir);
  const r = ensureLibrarySchedule(dir, { enabled: false, time: '06:45' });
  assert.deepEqual(r, { schedule: { enabled: false, time: '06:45' }, migrated: true });
  const after = config(dir);
  assert.deepEqual(after, { ...before, schedule: { enabled: false, time: '06:45' } });
  // the second read: there now, nothing written, the fallback not used
  const text = raw(dir);
  assert.deepEqual(ensureLibrarySchedule(dir, { enabled: true, time: '12:00' }), { schedule: { enabled: false, time: '06:45' }, migrated: false });
  assert.equal(raw(dir), text);
  // no fallback (v1.0 had none): the default; a bad fallback field is the default's
  const fresh = library('lib-schedule-ensure-default');
  assert.deepEqual(ensureLibrarySchedule(fresh, undefined).schedule, { enabled: true, time: '08:30' });
  const half = library('lib-schedule-ensure-half');
  assert.deepEqual(ensureLibrarySchedule(half, { enabled: false, time: 'soon' }).schedule, { enabled: false, time: '08:30' });
  // control: a broken streams.json is an error, nothing written
  const broken = caseDir('lib-schedule-broken');
  writeFileSync(join(broken, 'streams.json'), '{ nope');
  assert.throws(() => ensureLibrarySchedule(broken, { enabled: true, time: '08:30' }), (e) => e.code === 'config:invalid-json');
  assert.equal(readFileSync(join(broken, 'streams.json'), 'utf8'), '{ nope');
});
