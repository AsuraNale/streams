import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLibrary, DEFAULT_NODE_IDS } from '../src/library/create.mjs';
import { readConfig, nodeIds, topicNames } from '../src/library/config.mjs';
import { caseDir } from './support/tmp.mjs';
import { DEFAULT_PIPELINE } from '../src/pipeline/config.mjs';
import { DEFAULT_REQUIREMENTS } from '../src/pipeline/prompts.mjs';

test('createLibrary lays out the documented tree with a minimal streams.json', () => {
  const dir = caseDir('create-ok');
  const r = createLibrary(dir, { name: '我的库' });
  assert.equal(r.libraryDir, dir);
  for (const d of ['notes', '_pipeline', '_pipeline/inbox', '_pipeline/cache', '_pipeline/logs']) {
    assert.equal(statSync(join(dir, d)).isDirectory(), true, d);
  }
  for (const f of ['streams.json', '_pipeline/ledger.jsonl', '_pipeline/fetch_log.jsonl']) {
    assert.equal(statSync(join(dir, f)).isFile(), true, f);
  }
  assert.equal(readFileSync(join(dir, '_pipeline', 'ledger.jsonl'), 'utf8'), '');
  assert.equal(readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8'), '');
  assert.deepEqual(readdirSync(join(dir, 'notes')), []);
  assert.equal(existsSync(join(dir, 'index.jsonl')), false, 'index is built later, not at creation');
  const cfg = readConfig(dir);
  assert.equal(cfg.ok, true);
  // W4: the default pipeline (core-api 4.0) is written at creation, Chinese requirement texts by default
  assert.deepEqual(cfg.config, { name: '我的库', topics: [], sources: [], pipeline: DEFAULT_PIPELINE('zh-CN') });
  assert.deepEqual(cfg.config.pipeline.nodes.map((n) => [n.id, n.kind]), [['fetch', 'fixed'], ['dedup', 'script'], ['relevance', 'gate'], ['substance', 'gate'], ['summary', 'summary'], ['decide', 'fixed'], ['store', 'fixed']]);
  for (const id of DEFAULT_NODE_IDS) assert.ok(nodeIds(cfg.config).includes(id), `score key ${id} is known to the validator`);
  assert.equal(cfg.config.pipeline.nodes[2].requirement, DEFAULT_REQUIREMENTS['zh-CN'].relevance);
  // language: 'en' writes the English requirement texts; an unknown language is refused
  const en = caseDir('create-en');
  createLibrary(en, { name: 'lib', language: 'en' });
  assert.equal(readConfig(en).config.pipeline.nodes[2].requirement, DEFAULT_REQUIREMENTS.en.relevance);
  assert.throws(() => createLibrary(caseDir('create-badlang'), { name: 'lib', language: 'fr' }), (e) => e.code === 'bad-argument');
  assert.deepEqual(topicNames(cfg.config), []);
  assert.ok(readFileSync(join(dir, 'streams.json'), 'utf8').endsWith('\n'));
});

test('a folder that is not yet there is created; an existing empty folder is fine', () => {
  const parent = caseDir('create-nested');
  const dir = join(parent, 'deeper', 'lib');
  assert.equal(existsSync(dir), false);
  createLibrary(dir, { name: 'n' });
  assert.equal(readConfig(dir).ok, true);
  const empty = join(parent, 'empty');
  mkdirSync(empty);
  createLibrary(empty, { name: 'n' });
  assert.equal(readConfig(empty).ok, true);
});

test('exists: a non-empty folder is refused and left exactly as it was', () => {
  const dir = caseDir('create-exists');
  writeFileSync(join(dir, 'something.txt'), 'mine', 'utf8');
  assert.throws(() => createLibrary(dir, { name: 'n' }), (e) => e.code === 'exists' && e.message.includes(dir));
  assert.deepEqual(readdirSync(dir), ['something.txt']);
  assert.equal(readFileSync(join(dir, 'something.txt'), 'utf8'), 'mine');
  // a library created once cannot be created again on top of itself
  const lib = caseDir('create-twice');
  createLibrary(lib, { name: 'n' });
  assert.throws(() => createLibrary(lib, { name: 'n' }), (e) => e.code === 'exists');
});

test('sentinel: a missing or blank name is refused and nothing is created', () => {
  const dir = caseDir('create-noname');
  for (const opts of [undefined, {}, { name: '' }, { name: '   ' }, { name: 3 }]) {
    assert.throws(() => createLibrary(dir, opts), (e) => e.code === 'bad-argument', JSON.stringify(opts));
  }
  assert.deepEqual(readdirSync(dir), []);
  assert.throws(() => createLibrary('', { name: 'n' }), (e) => e.code === 'bad-argument');
});
