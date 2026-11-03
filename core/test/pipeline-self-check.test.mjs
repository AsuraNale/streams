import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selfCheck, runRound } from '../src/pipeline/round.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { scriptedConnector } from '../src/pipeline/fake.mjs';
import { startFakeServer } from './support/fake-server.mjs';
import { serveItems, feedRoute, libraryWithFeed, ctx, hashTree } from './support/pipeline.mjs';
import { keepNote } from './support/fixtures.mjs';
import { writeRawNote } from './support/raw-notes.mjs';

// Every failure case: selfCheck says ok:false with the code, runRound does not start, the feed is never
// requested, and not one byte under the library changes.
async function expectBlocked(t, dir, connector, srv, code) {
  const before = hashTree(dir);
  const check = await selfCheck(dir, { connector });
  assert.equal(check.ok, false);
  assert.equal(check.problems[0].code, code, JSON.stringify(check.problems));
  const r = await runRound(dir, { connector, ctx: ctx() });
  assert.equal(r.ok, false);
  assert.equal(r.started, false);
  assert.equal(r.problems[0].code, code);
  assert.deepEqual(hashTree(dir), before, 'nothing written');
  assert.equal(srv.hits('/feed'), 0, 'no fetch happened');
  return check;
}

test('self-check: login-expired connector -> connection problem with connectionCode; the round does not start', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 2));
  const dir = libraryWithFeed('selfcheck-login', feed);
  const check = await expectBlocked(t, dir, fakeConnector({ mode: 'login-expired' }), srv, 'connection');
  assert.equal(check.problems[0].connectionCode, 'login-expired');
  assert.equal(existsSync(join(dir, 'index.jsonl')), false, 'the index is not rebuilt when the check fails');
});

test('self-check: a broken index.jsonl line is an index problem; a missing note folder too', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 2));
  const dir = libraryWithFeed('selfcheck-index', feed);
  keepNote(dir, 'good-note');
  writeFileSync(join(dir, 'index.jsonl'), '{"id":"good-note","title":"x"}\nthis is not json\n', 'utf8');
  writeFileSync(join(dir, 'index.meta.json'), '{"count": 99}\n', 'utf8');
  const check = await expectBlocked(t, dir, scriptedConnector(), srv, 'index');
  assert.match(check.problems[0].detail, /bad-index-line/);
  // a non-conforming note file is only a warning, never a failure
  const dir2 = libraryWithFeed('selfcheck-warn', feed);
  writeRawNote(dir2, 'broken.md', '# no front matter\n');
  const c2 = await selfCheck(dir2, { connector: scriptedConnector() });
  assert.equal(c2.ok, true);
  assert.ok(c2.warnings.some((w) => /broken\.md/.test(w)), JSON.stringify(c2.warnings));
  // the note folder gone: the index cannot be built -> index problem
  const dir3 = libraryWithFeed('selfcheck-nonotes', feed);
  rmSync(join(dir3, 'notes'), { recursive: true, force: true });
  const c3 = await selfCheck(dir3, { connector: scriptedConnector() });
  assert.equal(c3.ok, false);
  assert.equal(c3.problems[0].code, 'index');
  assert.match(c3.problems[0].detail, /no-notes-dir/);
});

test('self-check: _pipeline not writable (a file in its place) or a folder that does not exist -> not-writable', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 2));
  const dir = libraryWithFeed('selfcheck-unwritable', feed);
  rmSync(join(dir, '_pipeline'), { recursive: true, force: true });
  writeFileSync(join(dir, '_pipeline'), 'a file where the folder should be', 'utf8');
  await expectBlocked(t, dir, scriptedConnector(), srv, 'not-writable');
  const missing = join(dir, 'does', 'not', 'exist');
  const c = await selfCheck(missing, { connector: scriptedConnector() });
  assert.equal(c.ok, false);
  assert.equal(c.problems[0].code, 'not-writable');
  assert.equal(existsSync(missing), false, 'nothing created');
});

test('self-check: unreadable streams.json -> config; a connector without probe -> connection', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 1));
  const dir = libraryWithFeed('selfcheck-config', feed);
  appendFileSync(join(dir, 'streams.json'), '{{{', 'utf8');
  const check = await expectBlocked(t, dir, scriptedConnector(), srv, 'config');
  assert.match(check.problems[0].detail, /invalid-json/);
  const dir2 = libraryWithFeed('selfcheck-noconn', feed);
  const c2 = await selfCheck(dir2, { connector: undefined });
  assert.equal(c2.ok, false);
  assert.equal(c2.problems[0].code, 'connection');
});

test('self-check: a healthy library with a working connector is ok, probed once, index rebuilt; the round then starts', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 1));
  const dir = libraryWithFeed('selfcheck-ok', feed);
  keepNote(dir, 'kept-one');
  const conn = scriptedConnector();
  const check = await selfCheck(dir, { connector: conn });
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  assert.deepEqual(check.problems, []);
  assert.equal(check.probe.model, 'fake-model');
  assert.equal(typeof check.probe.latencyMs, 'number');
  assert.equal(conn.calls.length, 1, 'exactly one probe call');
  assert.equal(existsSync(join(dir, 'index.jsonl')), true, 'index rebuilt on success');
  assert.match(readFileSync(join(dir, 'index.jsonl'), 'utf8'), /"id":"kept-one"/);
  const r = await runRound(dir, { connector: conn, ctx: ctx() });
  assert.equal(r.ok, true);
  assert.equal(r.started, true);
  assert.equal(srv.hits('/feed'), 1);
});

test('sentinel: the probe is the connector\'s, so a connector that answers the probe with bad format blocks the round too', async (t) => {
  const srv = await startFakeServer();
  t.after(() => srv.close());
  const feed = feedRoute(srv, serveItems(srv, 1));
  const dir = libraryWithFeed('selfcheck-badprobe', feed);
  const check = await expectBlocked(t, dir, fakeConnector({ mode: 'bad-format-always' }), srv, 'connection');
  assert.equal(check.problems[0].connectionCode, 'bad-format');
});
