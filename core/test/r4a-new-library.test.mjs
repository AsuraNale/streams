// Redesign R4a (docs/checks/2026-11-12-r4a/contract.md R4a-3, R4a-4, 「测」): 严格程度 and a new library's settings in the core.
//   - the three levels are exactly 宽松 0.4 / 0.5 · 标准 0.5 / 0.6 · 严格 0.7 / 0.7 (相关度 / 实质); saving a level writes those two
//     thresholds; a level is shown only when both numbers are exactly one level's, else 自定义 ('custom').
//   - reading never writes: a library made before R4a (the pipeline's own 0.7 / 0.6) reads as custom and its streams.json is
//     byte for byte the same after; a library whose numbers are a level reads as that level, also untouched.
//   - a new library starts at 标准 whichever way it is made: fillNewLibrary with no thresholds, and a confirmed create_library card
//     that names none (before R4a the card left the pipeline's 0.7 / 0.6). The control: the same card with thresholds given keeps
//     them.
//   - O15: the form's way (createLibrary + newLibrarySettings + fillNewLibrary) and the card's way, from the same name, brief and
//     app schedule, give the same thresholds, schedule, cap and pipeline section.
//   - the first run's estimate: the self-check call + 1–4 calls per item a try found, each side at most the cap.
//   - checkNewLibrary refuses an empty brief before anything is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary } from '../src/library/create.mjs';
import { pipelineConfig, savePipelineConfig } from '../src/pipeline/config.mjs';
import { STRICTNESS, STRICTNESS_LEVELS, DEFAULT_STRICTNESS, strictnessOf, readStrictness, saveStrictness, withThresholds } from '../src/pipeline/strictness.mjs';
import { estimateFirstRound } from '../src/pipeline/estimate.mjs';
import { checkNewLibrary, fillNewLibrary, newLibrarySettings } from '../src/library/new-library.mjs';
import { confirmProposal, draftProposal } from '../src/proposals/proposals.mjs';
import { snapshot } from '../src/proposals/changes.mjs';
import { caseDir } from './support/tmp.mjs';

const CLOCK = new Date('2026-11-12T10:00:00Z');
const now = () => CLOCK;
const config = (dir) => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));
const sha = (dir) => createHash('sha256').update(readFileSync(join(dir, 'streams.json'))).digest('hex');
const gate = (dir, id) => config(dir).pipeline.nodes.find((n) => n.id === id).threshold;
const hooks = () => ({ register: () => ({ libraryId: 'new00001' }), unregister: () => {}, enqueue: () => ({ queued: true }) });

test('R4a-4 strictness: three levels, exactly 0.4 / 0.5 · 0.5 / 0.6 · 0.7 / 0.7; saving one writes its two thresholds; the default is 标准', () => {
  assert.deepEqual(STRICTNESS_LEVELS, ['loose', 'standard', 'strict']);
  assert.deepEqual({ ...STRICTNESS.loose }, { relevance: 0.4, substance: 0.5 });
  assert.deepEqual({ ...STRICTNESS.standard }, { relevance: 0.5, substance: 0.6 });
  assert.deepEqual({ ...STRICTNESS.strict }, { relevance: 0.7, substance: 0.7 });
  assert.equal(DEFAULT_STRICTNESS, 'standard');
  const dir = caseDir('r4a-strictness-save');
  createLibrary(dir, { name: 's' });
  for (const [level, r, s] of [['loose', 0.4, 0.5], ['standard', 0.5, 0.6], ['strict', 0.7, 0.7]]) {
    const out = saveStrictness(dir, level);
    assert.deepEqual([gate(dir, 'relevance'), gate(dir, 'substance')], [r, s], level);
    assert.deepEqual(out, { level, thresholds: { relevance: r, substance: s } });
  }
  assert.throws(() => saveStrictness(dir, 'medium'), (e) => e.code === 'bad-argument');
});

test('R4a-4 strictness: a level only when both numbers are exactly that level\'s, else custom', () => {
  assert.equal(strictnessOf({ relevance: 0.4, substance: 0.5 }), 'loose');
  assert.equal(strictnessOf({ relevance: 0.5, substance: 0.6 }), 'standard');
  assert.equal(strictnessOf({ relevance: 0.7, substance: 0.7 }), 'strict');
  // one number of a level, the other not: custom
  assert.equal(strictnessOf({ relevance: 0.5, substance: 0.7 }), 'custom');
  assert.equal(strictnessOf({ relevance: 0.7, substance: 0.6 }), 'custom', 'the pipeline\'s own default (before R4a) is no level');
  assert.equal(strictnessOf({ relevance: 0.55, substance: 0.6 }), 'custom');
  assert.equal(strictnessOf({ relevance: 0.5, substance: null }), 'custom');
  assert.equal(strictnessOf(null), 'custom');
});

test('R4a-4 strictness: reading an existing library changes nothing — its numbers stay, custom shows as custom', () => {
  // made before R4a: createLibrary's pipeline (0.7 / 0.6)
  const old = caseDir('r4a-strictness-old');
  createLibrary(old, { name: 'old' });
  const before = sha(old);
  assert.deepEqual(readStrictness(old), { level: 'custom', thresholds: { relevance: 0.7, substance: 0.6 } });
  assert.equal(sha(old), before, 'streams.json byte for byte the same after the read');
  assert.deepEqual(pipelineConfig(old).nodes.filter((n) => n.kind === 'gate').map((n) => n.threshold), [0.7, 0.6]);
  // one set by hand to a level's numbers: that level, also untouched
  const loose = caseDir('r4a-strictness-loose');
  createLibrary(loose, { name: 'loose' });
  savePipelineConfig(loose, withThresholds(pipelineConfig(loose), { relevance: 0.4, substance: 0.5 }));
  const b2 = sha(loose);
  assert.equal(readStrictness(loose).level, 'loose');
  assert.equal(sha(loose), b2);
});

test('R4a-4 new libraries start at 标准: fillNewLibrary without thresholds, and a confirmed create_library card that names none', async () => {
  const dir = caseDir('r4a-fill-default');
  createLibrary(dir, { name: 'f' });
  fillNewLibrary(dir, { brief: '追电池', topics: [], sources: [], schedule: { enabled: false, time: '08:30' } });
  assert.equal(readStrictness(dir).level, 'standard');
  const root = caseDir('r4a-card-default');
  const card = await draftProposal({ kind: 'create_library', params: { name: 'card', brief: '追电池' }, why: '你想追电池' }, { libraryRoot: root, fallbackSchedule: { enabled: false, time: '09:00' }, now });
  assert.deepEqual(card.after.thresholds, { relevance: 0.5, substance: 0.6 }, 'the card says 标准');
  const r = confirmProposal(card, { hooks: hooks(), now });
  assert.equal(r.status, 'confirmed', JSON.stringify(r.failure));
  assert.deepEqual(readStrictness(card.params.folder), { level: 'standard', thresholds: { relevance: 0.5, substance: 0.6 } });
  // control: thresholds on the card are kept (laid over 标准's: the one not named is 标准's)
  const c2 = await draftProposal({ kind: 'create_library', params: { name: 'named', brief: '追电池', thresholds: { relevance: 0.75 } }, why: '你想追电池' }, { libraryRoot: root, now });
  confirmProposal(c2, { hooks: hooks(), now });
  assert.deepEqual(readStrictness(c2.params.folder).thresholds, { relevance: 0.75, substance: 0.6 });
});

test('R4a-3 O15: the form\'s way and the card\'s way give a new library the same thresholds, schedule, cap and pipeline', async () => {
  const fallbackSchedule = { enabled: true, time: '07:45' };
  const root = caseDir('r4a-parity');
  const card = await draftProposal({ kind: 'create_library', params: { name: 'same', brief: '追中国电动车的月度数据' }, why: '你想追电动车' }, { libraryRoot: root, fallbackSchedule, now });
  confirmProposal(card, { hooks: hooks(), now });
  const byCard = card.params.folder;
  const byForm = caseDir('r4a-parity-form');
  createLibrary(byForm, { name: 'same' });
  const settings = newLibrarySettings({}, { fallbackSchedule });
  fillNewLibrary(byForm, { brief: '追中国电动车的月度数据', topics: [], sources: [], ...settings });
  const fields = ['thresholds', 'schedule', 'cap', 'brief'];
  assert.deepEqual(snapshot(byForm, fields), snapshot(byCard, fields));
  assert.deepEqual(config(byForm).pipeline, config(byCard).pipeline, 'the pipeline section of streams.json is the same');
  assert.deepEqual(snapshot(byForm, fields).thresholds, { relevance: 0.5, substance: 0.6 });
  assert.deepEqual(snapshot(byForm, fields).schedule, { enabled: true, time: '07:45' });
  assert.equal(snapshot(byForm, fields).cap, 120);
  // a cap the form names is written; one it leaves out is the pipeline's default (nothing written)
  assert.equal(newLibrarySettings({}).cap, null);
  const capped = caseDir('r4a-parity-cap');
  createLibrary(capped, { name: 'c' });
  fillNewLibrary(capped, { brief: 'b', ...newLibrarySettings({ cap: 30 }) });
  assert.equal(pipelineConfig(capped).cap, 30);
});

test('R4a-3 the first run\'s estimate: self-check + 1–4 calls per item the tries found, each side at most the cap', () => {
  assert.deepEqual(estimateFirstRound({ items: 2, cap: 120 }).expectedCalls, [3, 9], 'P04: ev-news 2 items → 预计 3–9 次');
  assert.deepEqual(estimateFirstRound({ items: 0, cap: 120 }).expectedCalls, [1, 1]);
  assert.deepEqual(estimateFirstRound({ items: 50, cap: 30 }).expectedCalls, [31, 31]);
  assert.deepEqual(estimateFirstRound({ items: 10, cap: 30 }).expectedCalls, [11, 31]);
});

test('R4a-3 checkNewLibrary: an empty brief is refused before anything is made; sources are judged against the topics', () => {
  assert.throws(() => checkNewLibrary({ brief: '   ', topics: [], sources: [] }), (e) => e.code === 'bad-argument');
  assert.throws(() => checkNewLibrary({ brief: '', topics: [], sources: [] }), (e) => e.code === 'bad-argument');
  assert.throws(() => checkNewLibrary({ brief: 'b', topics: [], sources: [{ name: 'a', kind: 'rss', url: 'https://a.test/f', topic: '没有这个主题' }] }), (e) => e.code === 'bad-source');
  assert.throws(() => checkNewLibrary({ brief: 'b', topics: [{ name: 'x' }, { name: 'X' }], sources: [] }), (e) => e.code === 'duplicate-topic');
  const stored = checkNewLibrary({ brief: 'b', topics: [{ name: 'x' }], sources: [{ name: 'a', kind: 'rss', url: 'https://a.test/f', topic: 'x' }] });
  assert.deepEqual(stored.map((s) => s.name), ['a']);
});
