import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ledgerLines } from './support/pipeline.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'streams-core.mjs');

// spawnSync would block this process's event loop, and the fake server lives in this process.
function run(...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null }));
  });
}

test('self-check / estimate / run / inbox / keep / dismiss / rounds with the fake connection, end to end', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const items = serveItems(srv, 3);
  const dir = libraryWithFeed('cli-pipeline', feedRoute(srv, items));

  const sc = await run('self-check', dir, '--connection', 'fake');
  assert.equal(sc.status, 0, sc.stderr);
  assert.equal(sc.json.ok, true);
  assert.equal(sc.json.probe.model, 'fake-model');

  const est = await run('estimate', dir);
  assert.equal(est.status, 0, est.stderr);
  assert.deepEqual([est.json.sources, est.json.paused, est.json.cap], [1, 0, 120]);

  const r1 = await run('run', dir, '--connection', 'fake', '--cap', '4');
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r1.json.started, true);
  assert.equal(r1.json.calls, 4);
  assert.equal(r1.json.stoppedAt, 'cap');
  assert.equal(r1.json.counts.new, 3);

  const r2 = await run('run', dir, '--connection', 'fake');
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(r2.json.stoppedAt, undefined);
  assert.equal(r2.json.counts.inbox, 3);

  const inbox = await run('inbox', dir);
  assert.equal(inbox.status, 0, inbox.stderr);
  assert.equal(inbox.json.items.length, 3);
  assert.equal(inbox.json.items[0].verification.passed, true);
  const url = inbox.json.items[0].url;

  const k = await run('keep', dir, url);
  assert.equal(k.status, 0, k.stderr);
  assert.match(k.json.id, /^\d{4}-\d{2}-\d{2}-item-\d-about-agent-memory$/);
  assert.equal(existsSync(join(dir, 'notes', k.json.file)), true);

  const noReason = await run('dismiss', dir, inbox.json.items[1].url);
  assert.equal(noReason.status, 2, 'dismiss without a reason is a usage error');
  const d = await run('dismiss', dir, inbox.json.items[1].url, 'not for this library');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.json.url, inbox.json.items[1].url);
  assert.equal(ledgerLines(dir).find((e) => e.ev === 'dismissed').reason, 'not for this library');
  const again = await run('dismiss', dir, inbox.json.items[1].url, 'twice');
  assert.equal(again.status, 1);
  assert.equal(JSON.parse(again.stderr).error.code, 'not-in-inbox');

  const after = await run('inbox', dir);
  assert.equal(after.json.items.length, 1);

  const rounds = await run('rounds', dir);
  assert.equal(rounds.status, 0, rounds.stderr);
  assert.deepEqual(rounds.json.rounds.map((r) => r.stoppedAt), [undefined, 'cap']);
  assert.equal(rounds.json.rounds.length, 2);
  assert.equal(readdirSync(join(dir, '_pipeline', 'logs')).length, 1);
});

test('self-check with a bad library exits 0 and reports ok:false; usage errors exit 2; an unknown connection kind exits 1', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const dir = libraryWithFeed('cli-pipeline-bad', feedRoute(srv, serveItems(srv, 1)));
  const noConn = await run('run', dir);
  assert.equal(noConn.status, 2);
  assert.match(noConn.stderr, /usage/);
  assert.equal((await run('self-check', dir)).status, 2);
  assert.equal((await run('keep', dir)).status, 2);
  const bad = await run('run', dir, '--connection', 'telepathy');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'bad-connection');
  const badCap = await run('run', dir, '--connection', 'fake', '--cap', 'lots');
  assert.equal(badCap.status, 1);
  assert.equal(JSON.parse(badCap.stderr).error.code, 'bad-argument');
  const missing = await run('self-check', join(dir, 'nope'), '--connection', 'fake');
  assert.equal(missing.status, 0);
  assert.equal(missing.json.ok, false);
  assert.equal(missing.json.problems[0].code, 'not-writable');
  // api without a key in the environment fails at the probe, not with a crash
  const api = await run('self-check', dir, '--connection', 'api');
  assert.equal(api.status, 0, api.stderr);
  assert.equal(api.json.ok, false);
  assert.equal(api.json.problems[0].code, 'connection');
});
