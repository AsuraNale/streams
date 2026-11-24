// 1.1.1 P10 (A8): progress as it happens. The command-line sessions count the run's searches and reads from its output while
// it still runs (a stand-in process that writes one line at a time, the real runs' lines of 11-21); the update says which step
// and how many at each step; the build says the agent's counts and Streams' own check of the card's addresses. Every number
// comes from something that happened. Each check holds first the state that would make it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSessionConnector, runUpdate, createLibrary, writeCard, createBuild, cardHandlers, createActionRunner, loadDefinition,
} from '../src/index.mjs';
import { fakeConnector } from '../src/connect/fakes.mjs';
import { caseDir } from './support/tmp.mjs';

const fixture = (name) => readFileSync(new URL(`./support/web/${name}`, import.meta.url), 'utf8');
const EXE = process.platform === 'win32' ? '.exe' : '';
function fakePath(name, tool) {
  const dir = caseDir(`p10-path-${name}`);
  writeFileSync(join(dir, `${tool}${EXE}`), '');
  return { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' };
}
// a process that writes its output one line every `gapMs`, then ends; `closed` says whether it has ended
function lineByLine(text, gapMs = 30) {
  const state = { closed: false };
  const impl = function spawn(file, args = []) {
    const child = new EventEmitter();
    child.pid = 4243;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({ write(c, e, cb) { cb(); } });
    child.kill = () => true;
    child.unref = () => {};
    // a call that is not the run itself (Codex is asked its version first) answers a version line at once
    const run = !args.some((a) => /version/.test(String(a)))
    const lines = run ? text.split('\n').filter((l) => l !== '').map((l) => `${l}\n`) : ['codex-cli 0.167.0\n'];
    setImmediate(() => child.emit('spawn'));
    let i = 0;
    const next = () => {
      if (i < lines.length) { child.stdout.write(lines[i]); i += 1; setTimeout(next, gapMs); return; }
      child.stdout.end();
      child.stderr.end();
      if (run) state.closed = true;
      setImmediate(() => child.emit('close', 0, null));
    };
    setTimeout(next, gapMs);
    return child;
  };
  return { impl, state };
}

test('Claude Code: the reads are counted from the output while the run still goes, not only at its end', async () => {
  const { impl, state } = lineByLine(fixture('claude-web-1.jsonl'));
  const c = createSessionConnector({ kind: 'claude-code' }, { spawnImpl: impl, env: fakePath('claude', 'claude') }, { cwd: join(caseDir('p10-claude'), 'cwd'), web: true });
  const seen = [];
  const r = await c.send({ prompt: 'p', format: 'json' }, { onProgress: (p) => seen.push({ ...p, closed: state.closed }) });
  assert.equal(r.reads.length, 1, 'control: the whole run read one page');
  assert.ok(seen.length >= 1, 'progress was told');
  assert.deepEqual(seen.at(-1), { searches: 0, reads: 1, closed: false }, 'the read was counted before the process ended');
});

test('Codex: the same, from its own events', async () => {
  const { impl, state } = lineByLine(fixture('codex-web-3.jsonl'));
  const c = createSessionConnector({ kind: 'codex' }, { spawnImpl: impl, env: fakePath('codex', 'codex') }, { cwd: join(caseDir('p10-codex'), 'cwd'), web: true });
  const seen = [];
  const r = await c.send({ prompt: 'p', format: 'json' }, { onProgress: (p) => seen.push({ ...p, closed: state.closed }) });
  assert.ok(r.reads.length + r.searches.length > 0, `control: the run used the web (${JSON.stringify([r.reads.length, r.searches.length])})`);
  assert.ok(seen.some((p) => !p.closed && p.reads + p.searches > 0), JSON.stringify(seen));
  assert.deepEqual([seen.at(-1).searches, seen.at(-1).reads], [r.searches.length, r.reads.length], 'the last count is the run\'s whole count');
});

// ---- the update ----
const SRC = 'https://u.example.test/list';
const NEW = ['https://u.example.test/p/1', 'https://u.example.test/p/2'];
const sentence = (n) => `新补助第 ${n} 段：设备补助的第 ${n} 条规定，额度 ${n * 10} 万元，截止日期写在官方页上，申请要交三份材料。`;
const CARD = {
  name: '测试', definition: { summary: 's', purpose: 'p', scope: 's', exclude: 'e', trust: 't', rhythm: '每天一次', language: 'l', hard: 'h' },
  decide: [], collect: ['c'], skip: ['k'], sources: [{ name: '目录', url: SRC, status: 'ok' }], unreadable: [],
  pick: ['p'], write: ['w'], samples: [{ title: 't', url: 'https://u.example.test/sample', date: '2026-11-21' }],
};

test('the update tells each step as it happens: sources n/m, originals fetched, the agent\'s counts, items checked', async () => {
  const dir = join(caseDir('p10-update'), 'lib');
  createLibrary(dir, { name: '测试', language: 'zh-CN' });
  writeCard(dir, CARD);
  let listed = [];
  const readLinks = async (url) => ({ ok: true, url, links: listed, method: 'direct' });
  const readPage = async (url) => ({ ok: true, url, title: '新补助', text: [1, 2, 3, 4].map(sentence).join('\n\n'), method: 'direct' });
  const judge = fakeConnector({ mode: 'counting', json: (req) => ({ items: [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map((m) => ({ id: m[1], passed: true, evidence: 'ok' })) }) });
  const agent = {
    async detect() { return { installed: true, loggedIn: true }; },
    async send(req, { onProgress } = {}) {
      onProgress?.({ searches: 1, reads: 0 });
      onProgress?.({ searches: 2, reads: 3 });
      const items = NEW.map((url) => ({ url, title: '新补助', date: '2026-11-24', due: '', what: '一项补助。', points: [1, 2, 3].map((n) => ({ text: `第 ${n} 条`, quote: sentence(n) })), why: '在范围里' }));
      return { ok: true, json: { items }, text: '{}', sessionId: 's', reads: [], searches: ['a', 'b'] };
    },
  };
  // the first update only notes the links; the second finds two new ones
  await runUpdate(dir, { connector: agent, judge, readPage, readLinks, now: () => new Date('2026-11-24T10:00:00Z') });
  listed = [...NEW];
  const seen = [];
  const r = await runUpdate(dir, { connector: agent, judge, readPage, readLinks, now: () => new Date('2026-11-25T10:00:00Z'), progress: (p) => seen.push(p) });
  assert.equal(r.status, 'done', JSON.stringify(r.problems ?? r.record));
  const steps = seen.map((p) => p.step);
  // the order: sources, then the originals, then the agent, then the check — never back
  const order = ['sources', 'originals', 'agent', 'check'];
  assert.deepEqual([...new Set(steps)], order, steps.join(','));
  assert.ok(steps.every((s, i) => i === 0 || order.indexOf(s) >= order.indexOf(steps[i - 1])), steps.join(','));
  assert.deepEqual(seen.filter((p) => p.step === 'sources').map((p) => p.sources), [{ done: 0, total: 1 }, { done: 1, total: 1 }]);
  assert.deepEqual(seen.filter((p) => p.step === 'originals').map((p) => [p.originals.done, p.originals.total, p.originals.kept]), [[0, 2, 0], [1, 2, 1], [2, 2, 2]]);
  assert.deepEqual(seen.filter((p) => p.step === 'agent').map((p) => p.agent), [{ searches: 0, reads: 0 }, { searches: 1, reads: 0 }, { searches: 2, reads: 3 }], 'the agent\'s counts as its connection told them');
  assert.deepEqual(seen.filter((p) => p.step === 'check').map((p) => p.check), [{ done: 0, total: 2 }, { done: 1, total: 2 }, { done: 2, total: 2 }]);
});

test('the build tells the agent\'s counts while it works, and Streams\' own check of the card\'s addresses n/m', async () => {
  const root = caseDir('p10-build');
  const libDir = join(root, 'library');
  const DEF = loadDefinition();
  const runner = createActionRunner({ definition: DEF, handlers: cardHandlers({ libraryDirFor: () => libDir, dirOfLibrary: () => libDir }), pendingDir: join(root, 'pending'), logFile: (a, params, result) => join(result.object.id, '_actions.jsonl') });
  const connector = {
    sessionful: true,
    async send(req, { onProgress } = {}) {
      onProgress?.({ searches: 1, reads: 1 });
      return { ok: true, json: { say: '请看卡', card: CARD }, text: '{}', sessionId: 'b', reads: [{ url: SRC, ok: true }], searches: ['q'] };
    },
  };
  const readPage = async (url) => ({ ok: true, url, title: 't', text: '正文', method: 'direct' });
  const readLinks = async (url) => ({ ok: true, url, links: ['https://u.example.test/p/9'], method: 'direct' });
  const seen = [];
  const out = await createBuild({ connector, definition: DEF, runner, today: '2026-11-24', readPage, readLinks, progress: (p) => seen.push(p) }).start('帮我找补助');
  assert.equal(out.kind, 'card');
  assert.deepEqual(seen.filter((p) => p.step === 'agent'), [{ step: 'agent', searches: 0, reads: 0 }, { step: 'agent', searches: 1, reads: 1 }]);
  const check = seen.filter((p) => p.step === 'check').map((p) => [p.done, p.total]);
  assert.deepEqual(check.at(0), [0, 2], 'two addresses on the card to read');
  assert.deepEqual(check.at(-1), [2, 2]);
});
