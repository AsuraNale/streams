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

// 2026-11-02 evening: fetch / try-source / status for the Tuesday checkpoint demo. Offline: a local fake server.
import { writeFileSync, readFileSync } from 'node:fs';
import { startFakeServer } from './support/fake-server.mjs';
import { RSS2 } from './support/feeds.mjs';
import { spawn } from 'node:child_process';

// spawnSync would block this process's event loop, and the fake server lives in this process:
// the child could never be answered. So these two tests spawn asynchronously.
function runAsync(...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null }));
  });
}

function withSources(dir, sources) {
  const p = join(dir, 'streams.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  cfg.sources = sources;
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

test('fetch: one round writes fetch_log with one line per source and lists the per-source states', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ok = srv.route('/ok', { status: 200, body: RSS2 });
  const gone = srv.route('/gone', { status: 404, body: 'nope' });
  const dir = makeLibrary('cli-fetch');
  withSources(dir, [
    { name: 'okfeed', kind: 'rss', url: ok, topic: 'agent 记忆' },
    { name: 'oldblog', kind: 'rss', url: gone, topic: 'agent 记忆' },
    { name: 'resting', kind: 'rss', url: ok, topic: 'agent 记忆', paused: true },
  ]);
  const r = await runAsync('fetch', dir);
  assert.equal(r.status, 0, r.stderr);
  const states = Object.fromEntries(r.json.perSource.map((s) => [s.name, s.status]));
  assert.deepEqual(states, { okfeed: 'ok', oldblog: 'gap', resting: 'paused' });
  assert.ok(r.json.newItems > 0);
  const log = readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.length, 3);
  // the status command reads that log back
  const s = await runAsync('status', dir);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.json.sources.oldblog.status, 'gap');
  assert.equal(s.json.health.level, 'warning');
});

test('try-source: fetches one source and writes nothing; an unknown name exits 1', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const ok = srv.route('/ok', { status: 200, body: RSS2 });
  const dir = makeLibrary('cli-try-source');
  withSources(dir, [{ name: 'okfeed', kind: 'rss', url: ok, topic: 'agent 记忆' }]);
  const r = await runAsync('try-source', dir, 'okfeed');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.status, 'ok');
  assert.ok(r.json.count >= 1);
  assert.equal(existsSync(join(dir, '_pipeline', 'fetch_log.jsonl')) && readFileSync(join(dir, '_pipeline', 'fetch_log.jsonl'), 'utf8') !== '', false, 'try-source must not write the fetch log');
  const bad = await runAsync('try-source', dir, 'nobody');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'no-such-source');
  // sentinel: try-source without a name is a usage error
  assert.equal((await runAsync('try-source', dir)).status, 2);
});
