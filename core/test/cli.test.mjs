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

// 1.1 W7b: status / inbox / keep / dismiss / rounds over what core/src writes. v1.0's fetch / try-source / self-check /
// estimate / run (its fetch round and its scoring pipeline) left with the scoring pipeline: they are usage errors now.
import { appendFetchLog } from '../src/fetch/log.mjs';
import { putMissingInInbox } from '../src/update/inbox.mjs';
import { appendRoundRecord } from '../src/pipeline/rounds-log.mjs';

test('status reads the fetch log back; inbox / keep / dismiss / rounds work on items 1.1 put in 待看', () => {
  const dir = makeLibrary('cli-inbox');
  appendFetchLog(dir, { round: 'r1', source: 'okfeed', kind: 'rss', status: 'ok', count: 2, new: 2, message: '' });
  appendFetchLog(dir, { round: 'r1', source: 'oldblog', kind: 'rss', status: 'gap', count: 0, new: 0, message: 'HTTP 404' });
  const s = run('status', dir);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.json.sources.oldblog.status, 'gap');
  assert.equal(s.json.health.level, 'warning');

  const at = new Date('2026-11-21T10:00:00Z');
  putMissingInInbox(dir, { item: { url: 'https://a.test/one', title: 'One about agent memory', source: 'okfeed', date: '2026-11-20' }, round: 'u1', now: () => at });
  putMissingInInbox(dir, { item: { url: 'https://a.test/two', title: 'Two', source: 'okfeed', date: '2026-11-20' }, round: 'u1', now: () => at });
  appendRoundRecord(dir, { id: 'u1', startedAt: at.toISOString(), finishedAt: at.toISOString(), counts: { inbox: 2 } });

  const inbox = run('inbox', dir);
  assert.equal(inbox.status, 0, inbox.stderr);
  assert.deepEqual(inbox.json.items.map((i) => i.url), ['https://a.test/one', 'https://a.test/two']);

  const k = run('keep', dir, 'https://a.test/one');
  assert.equal(k.status, 0, k.stderr);
  assert.equal(k.json.id, '2026-11-20-one-about-agent-memory');
  assert.equal(existsSync(join(dir, 'notes', k.json.file)), true);

  assert.equal(run('dismiss', dir, 'https://a.test/two').status, 2, 'dismiss without a reason is a usage error');
  const d = run('dismiss', dir, 'https://a.test/two', 'not for this library');
  assert.equal(d.status, 0, d.stderr);
  const again = run('dismiss', dir, 'https://a.test/two', 'twice');
  assert.equal(again.status, 1);
  assert.equal(JSON.parse(again.stderr).error.code, 'not-in-inbox');
  assert.deepEqual(run('inbox', dir).json.items, []);

  const rounds = run('rounds', dir);
  assert.equal(rounds.status, 0, rounds.stderr);
  assert.deepEqual(rounds.json.rounds.map((r) => r.id), ['u1']);
});

test('v1.0\'s fetch / try-source / self-check / estimate / run are gone: usage errors, nothing written', () => {
  const dir = makeLibrary('cli-gone');
  for (const args of [['fetch', dir], ['try-source', dir, 'okfeed'], ['self-check', dir, '--connection', 'fake'], ['estimate', dir], ['run', dir, '--connection', 'fake']]) {
    const r = run(...args);
    assert.equal(r.status, 2, args[0]);
    assert.equal(r.stdout, '', args[0]);
  }
  assert.equal(existsSync(join(dir, '_pipeline', 'rounds.jsonl')), false);
  // control: a command that is there runs on the same library
  assert.equal(run('rounds', dir).status, 0);
});
