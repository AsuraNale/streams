import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLibrary, keepNote } from './support/fixtures.mjs';
import { writeRawNote } from './support/raw-notes.mjs';
import { appendEvent } from '../src/library/ledger.mjs';
import { caseDir } from './support/tmp.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'streams-core.mjs');

function run(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}

test('rebuild: writes the index, prints meta, indexed ids and refused files', () => {
  const dir = makeLibrary('cli-rebuild');
  keepNote(dir, 'good');
  writeRawNote(dir, 'bad.md', '---\nid: bad\ntitle: Bad\ndate: 2026-10-01\nstatus: kept\ntopics: [MCP]\n---\n');
  const r = run('rebuild', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(r.json.indexed, ['good']);
  assert.deepEqual(r.json.pending, [{ file: 'bad.md', codes: ['missing:source'], messages: ['required field "source" is missing or empty'] }]);
  assert.equal(r.json.meta.count, 1);
  assert.equal(r.json.meta.pending_count, 1);
  assert.equal(existsSync(join(dir, 'index.jsonl')), true);
  assert.equal(existsSync(join(dir, 'index.meta.json')), true);
});

test('pending: lists non-conforming files with proposed headers', () => {
  const dir = makeLibrary('cli-pending');
  writeRawNote(dir, 'plain.md', '# Heading\n');
  const r = run('pending', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.pending.length, 1);
  assert.equal(r.json.pending[0].file, 'plain.md');
  assert.equal(r.json.pending[0].proposedHeader.title, 'Heading');
  assert.equal(r.json.pending[0].proposedHeader.source, 'file:plain.md');
});

test('replay: prints per-url states and skipped lines', () => {
  const dir = makeLibrary('cli-replay');
  appendEvent(dir, { ts: '2026-11-01T00:00:00.000Z', ev: 'seen', url: 'https://u/1', source: 's', title: 't' });
  appendEvent(dir, { ts: '2026-11-01T00:01:00.000Z', ev: 'dismissed', url: 'https://u/1', reason: 'meh' });
  const r = run('replay', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.count, 1);
  assert.equal(r.json.states[0].url, 'https://u/1');
  assert.equal(r.json.states[0].stage, 'dismissed');
  assert.deepEqual(r.json.skipped, []);
});

test('usage errors exit 2 and print nothing on stdout', () => {
  for (const args of [[], ['rebuild'], ['explode', 'x']]) {
    const r = run(...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /usage/);
  }
});

test('sentinel: a folder without streams.json exits 1 with a JSON error naming the cause', () => {
  const dir = caseDir('cli-noconfig');
  const r = run('rebuild', dir);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  const err = JSON.parse(r.stderr);
  assert.equal(err.error.code, 'config:missing');
  assert.match(err.error.message, /streams\.json/);
  assert.equal(existsSync(join(dir, 'index.jsonl')), false);
});
