import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { appendFetchLog, readFetchLog, lastRoundStatus, fetchLogPath, FETCH_LOG_FILE } from '../src/fetch/log.mjs';
import { sourceHealth } from '../src/fetch/health.mjs';
import { makeLibrary } from './support/fixtures.mjs';
import { caseDir } from './support/tmp.mjs';

function line(dir, ts, source, status, extra = {}) {
  return appendFetchLog(dir, { ts, round: 'r-x', source, kind: 'rss', status, count: 0, new: 0, message: '', ...extra });
}

test('appendFetchLog: one JSON line, fixed key order, ts auto-filled, undefined fields dropped, append only', () => {
  const dir = makeLibrary('log-append');
  assert.equal(readFileSync(fetchLogPath(dir), 'utf8'), '');
  const e1 = appendFetchLog(dir, { round: 'r-1', source: 'a', kind: 'rss', status: 'ok', count: 3, new: 2, message: '3 item(s)', http: 200 });
  assert.match(e1.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(Object.keys(e1), ['ts', 'round', 'source', 'kind', 'status', 'hint', 'http', 'count', 'new', 'message']);
  assert.equal(e1.hint, 'none', 'hint derived from status when not given');
  const text1 = readFileSync(fetchLogPath(dir), 'utf8');
  assert.equal(text1, JSON.stringify(e1) + '\n');
  const e2 = appendFetchLog(dir, { ts: '2026-11-02T00:00:00.000Z', round: 'r-1', source: 'b', kind: 'hn', status: 'failed', count: 0, new: 0, message: 'HTTP 503', http: 503, retry_after_seconds: 120 });
  assert.equal(e2.ts, '2026-11-02T00:00:00.000Z');
  assert.equal(e2.hint, 'retry-next-round');
  assert.equal(e2.retry_after_seconds, 120);
  assert.ok(readFileSync(fetchLogPath(dir), 'utf8').startsWith(text1));
  assert.equal(FETCH_LOG_FILE.replace(/\\/g, '/'), '_pipeline/fetch_log.jsonl');
  // a log whose last line lost its newline gets a fresh line, not a glued one
  writeFileSync(fetchLogPath(dir), JSON.stringify(e1), 'utf8');
  line(dir, '2026-11-02T01:00:00.000Z', 'c', 'empty');
  const { entries, skipped } = readFetchLog(dir);
  assert.deepEqual(skipped, []);
  assert.deepEqual(entries.map((e) => e.source), ['a', 'c']);
});

test('sentinel: malformed entries are refused and nothing is written', () => {
  const dir = makeLibrary('log-refuse');
  const bad = [
    [{ source: 'a', status: 'ok', count: 1 }, /"new"/],
    [{ source: 'a', status: 'ok', new: 1 }, /"count"/],
    [{ source: 'a', status: 'pending', count: 0, new: 0 }, /unknown status "pending"/],
    [{ source: 'a', status: 'OK', count: 0, new: 0 }, /unknown status/],
    [{ source: '', status: 'ok', count: 0, new: 0 }, /"source"/],
    [{ status: 'ok', count: 0, new: 0 }, /"source"/],
    [{ source: 'a', status: 'ok', count: -1, new: 0 }, /"count"/],
    [{ source: 'a', status: 'ok', count: 1.5, new: 0 }, /"count"/],
    ['a ok', /plain object/],
    [null, /plain object/],
  ];
  for (const [entry, re] of bad) {
    assert.throws(() => appendFetchLog(dir, entry), (e) => e.code === 'bad-log-entry' && re.test(e.message), JSON.stringify(entry));
  }
  assert.equal(readFileSync(fetchLogPath(dir), 'utf8'), '');
});

test('readFetchLog: bad lines are skipped with line numbers, the rest is read; missing file -> empty', () => {
  const dir = makeLibrary('log-bad-lines');
  const good = JSON.stringify({ ts: '2026-11-01T00:00:00.000Z', round: 'r', source: 'a', kind: 'rss', status: 'ok', hint: 'none', count: 1, new: 1, message: '' });
  writeFileSync(fetchLogPath(dir), [
    good,
    '{nope',
    JSON.stringify({ ts: 'x', status: 'ok' }),
    JSON.stringify({ ts: 'x', source: 'a', status: 'weird' }),
    '[1]',
    '',
    good.replace('"a"', '"b"'),
  ].join('\n') + '\n', 'utf8');
  const { entries, skipped } = readFetchLog(dir);
  assert.deepEqual(skipped, [
    { line: 2, reason: 'not-json' }, { line: 3, reason: 'missing-source' }, { line: 4, reason: 'unknown-status:weird' }, { line: 5, reason: 'not-an-object' },
  ]);
  assert.deepEqual(entries.map((e) => e.source), ['a', 'b']);
  const none = caseDir('log-none');
  assert.deepEqual(readFetchLog(none), { entries: [], skipped: [] });
  assert.deepEqual(lastRoundStatus(none), {});
});

test('lastRoundStatus: latest status per source, consecutive streak, lastOkAt counts ok and empty', () => {
  const dir = makeLibrary('log-last');
  line(dir, '2026-11-01T00:00:00.000Z', 'a', 'ok', { count: 2, new: 2, http: 200 });
  line(dir, '2026-11-01T00:00:00.000Z', 'b', 'failed', { http: 503, retry_after_seconds: 60, message: 'HTTP 503' });
  line(dir, '2026-11-02T00:00:00.000Z', 'a', 'empty', { count: 2, http: 200 });
  line(dir, '2026-11-02T00:00:00.000Z', 'b', 'failed', { http: 502 });
  line(dir, '2026-11-03T00:00:00.000Z', 'a', 'failed', { message: 'timeout' });
  line(dir, '2026-11-03T00:00:00.000Z', 'b', 'failed', { http: 503 });
  line(dir, '2026-11-03T00:00:00.000Z', 'c', 'paused');
  const s = lastRoundStatus(dir);
  assert.deepEqual(Object.keys(s).sort(), ['a', 'b', 'c']);
  assert.deepEqual(s.a, { status: 'failed', hint: 'retry-next-round', consecutive: 1, lastTs: '2026-11-03T00:00:00.000Z', lastOkAt: '2026-11-02T00:00:00.000Z', kind: 'rss', message: 'timeout' });
  assert.deepEqual(s.b, { status: 'failed', hint: 'retry-next-round', consecutive: 3, lastTs: '2026-11-03T00:00:00.000Z', lastOkAt: null, kind: 'rss', message: '', http: 503 });
  assert.equal(s.c.status, 'paused');
  assert.equal(s.c.consecutive, 1);
  assert.equal(s.c.lastOkAt, null);
  // negative: a streak is broken by any different status, even a bad one of another kind
  line(dir, '2026-11-04T00:00:00.000Z', 'b', 'gap', { http: 404 });
  assert.equal(lastRoundStatus(dir).b.consecutive, 1);
  assert.equal(lastRoundStatus(dir).b.status, 'gap');
  assert.equal(lastRoundStatus(dir).b.hint, 'fix-address-or-remove');
  // a hand-added line with a wrong hint keeps its hint (the log is the record), a line without one gets the derived hint
  appendFileSync(fetchLogPath(dir), JSON.stringify({ ts: '2026-11-05T00:00:00.000Z', source: 'd', status: 'blocked', count: 0, new: 0 }) + '\n');
  assert.equal(lastRoundStatus(dir).d.hint, 'blocked-remove-source');
});

// 对照 test_pipeline.py::test_source_health_banner
test('sourceHealth: failed / gap warn, blocked is its own level with its own action, all ok/empty is quiet', () => {
  const dir = makeLibrary('health');
  // round 1: a ok, b failed -> warning naming b
  line(dir, '2026-11-01T00:00:00.000Z', 'a', 'ok', { count: 1, new: 1 });
  line(dir, '2026-11-01T00:00:00.000Z', 'b', 'failed', { http: 503 });
  let h = sourceHealth(lastRoundStatus(dir));
  assert.equal(h.level, 'warning');
  assert.deepEqual(h.lines, ['failed 1/2 b hint=retry-next-round', 'ok 1/2 a hint=none']);
  assert.deepEqual(h.counts, { ok: 1, empty: 0, gap: 0, failed: 1, blocked: 0, paused: 0 });
  // round 2: b gap (HN 400 lands here) -> still a warning, with the other action
  line(dir, '2026-11-02T00:00:00.000Z', 'a', 'ok', { count: 1, new: 1 });
  line(dir, '2026-11-02T00:00:00.000Z', 'b', 'gap', { http: 400 });
  h = sourceHealth(lastRoundStatus(dir));
  assert.equal(h.level, 'warning');
  assert.deepEqual(h.lines, ['gap 1/2 b hint=fix-address-or-remove', 'ok 1/2 a hint=none']);
  // round 3: b blocked -> level blocked, named separately, action is "change the source", never "retry"
  line(dir, '2026-11-03T00:00:00.000Z', 'a', 'ok', { count: 1, new: 1 });
  line(dir, '2026-11-03T00:00:00.000Z', 'b', 'blocked', { http: 403 });
  h = sourceHealth(lastRoundStatus(dir));
  assert.equal(h.level, 'blocked');
  assert.equal(h.lines[0], 'blocked 1/2 b hint=blocked-remove-source');
  assert.equal(h.lines.some((l) => l.startsWith('failed')), false, 'blocked is not lumped into failed');
  assert.equal(h.lines.some((l) => l.includes('retry')), false, 'no retry advice for a blocked source');
  assert.equal(readFetchLog(dir).entries.filter((e) => e.source === 'b' && e.status === 'blocked').length, 1, 'fetch_log records status=blocked');
  // round 4: a ok, b empty -> quiet: a short brief is a genuinely quiet day
  line(dir, '2026-11-04T00:00:00.000Z', 'a', 'ok', { count: 1, new: 1 });
  line(dir, '2026-11-04T00:00:00.000Z', 'b', 'empty', { count: 0 });
  h = sourceHealth(lastRoundStatus(dir));
  assert.equal(h.level, 'quiet');
  assert.deepEqual(h.lines, ['ok 2/2 a,b hint=none']);
  // mixed: blocked + failed + gap + paused on one round -> blocked level, three separate lines, paused outside the total
  line(dir, '2026-11-05T00:00:00.000Z', 'a', 'failed');
  line(dir, '2026-11-05T00:00:00.000Z', 'b', 'blocked');
  line(dir, '2026-11-05T00:00:00.000Z', 'c', 'gap');
  line(dir, '2026-11-05T00:00:00.000Z', 'd', 'paused');
  line(dir, '2026-11-05T00:00:00.000Z', 'e', 'empty');
  h = sourceHealth(lastRoundStatus(dir));
  assert.equal(h.level, 'blocked');
  assert.deepEqual(h.lines, [
    'blocked 1/4 b hint=blocked-remove-source',
    'failed 1/4 a hint=retry-next-round',
    'gap 1/4 c hint=fix-address-or-remove',
    'ok 1/4 e hint=none',
    'paused 1 d hint=none',
  ]);
  assert.equal(h.counts.paused, 1);
});

test('sourceHealth: nothing on record is quiet with no-fetch-yet; only paused sources is quiet too', () => {
  assert.deepEqual(sourceHealth({}), { level: 'quiet', counts: { ok: 0, empty: 0, gap: 0, failed: 0, blocked: 0, paused: 0 }, lines: ['no-fetch-yet'] });
  const h = sourceHealth({ z: { status: 'paused', consecutive: 1 } });
  assert.equal(h.level, 'quiet');
  assert.deepEqual(h.lines, ['paused 1 z hint=none']);
  // an unknown status in the input neither crashes nor counts
  const odd = sourceHealth({ a: { status: 'ok' }, q: { status: 'pending' } });
  assert.equal(odd.level, 'quiet');
  assert.deepEqual(odd.lines, ['ok 1/2 a hint=none']);
});

test('sentinel: a failed or blocked source can never come out quiet; a non-object input is refused', () => {
  for (const st of ['failed', 'gap', 'blocked']) {
    const h = sourceHealth({ a: { status: 'ok' }, b: { status: st } });
    assert.notEqual(h.level, 'quiet', st);
    assert.equal(h.lines.some((l) => l.startsWith(`${st} `) && l.includes(' b ')), true, st);
  }
  assert.equal(sourceHealth({ a: { status: 'ok' }, b: { status: 'blocked' } }).level, 'blocked');
  for (const bad of [null, undefined, 'ok', [], 42]) assert.throws(() => sourceHealth(bad), TypeError, String(bad));
});
