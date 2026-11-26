// 1.1.3 (停止处理; 赞妮's plan 6.4, 维护者 11-26 「做，开工」): the user stops the main agent's turn. A command line's process tree
// is ended (taskkill /T on Windows); an API key's request is aborted; Streams' own check of the card's addresses stops between
// two addresses. The build goes back to before the user's words — the questions answered and the card waiting stay — but what
// was spent (searches, reads, calls) counts; the next words open a new session told Streams' own record of the build. A stop
// is never a lost session. Each test was first run against code that fails it (no signal passed, the snapshot not put back,
// the counts reset, a resumed stop taken as sessionLost).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProcess } from '../src/connect/process.mjs';
import { createSessionConnector } from '../src/connect/session.mjs';
import { createApiToolSession } from '../src/connect/api-tools.mjs';
import { checkCardUrls } from '../src/build/check-urls.mjs';
import { createBuild, cardHandlers, createActionRunner, loadDefinition, replayPrompt } from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const DEF = loadDefinition();

/** A child that prints `first` and then waits until it is killed; spawns of taskkill are recorded and close at once. */
function hangingSpawn(first = '') {
  const calls = [];
  const impl = (file, args, opts) => {
    const call = { file, args, opts, killed: false };
    calls.push(call);
    const child = new EventEmitter();
    child.pid = 5150 + calls.length;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
    child.kill = () => { call.killed = true; setImmediate(() => child.emit('close', null, 'SIGTERM')); return true; };
    if (file === 'taskkill') { setImmediate(() => child.emit('close', 0, null)); return child; }
    // Codex's choice of a binary asks its version first: answered at once
    if (args.includes('--version')) { setImmediate(() => { child.emit('spawn'); child.stdout.end('codex-cli 0.167.0\n'); child.stderr.end(); setImmediate(() => child.emit('close', 0, null)); }); return child; }
    setImmediate(() => { child.emit('spawn'); if (first) child.stdout.write(first); });
    return child;
  };
  impl.calls = calls;
  return impl;
}
const fakePath = (name) => {
  const dir = caseDir(`stop-path-${name}`);
  mkdirSync(dir, { recursive: true });
  for (const n of ['claude.exe', 'codex.exe']) writeFileSync(join(dir, n), '');
  return { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' };
};
const later = (ms) => new Promise((r) => setTimeout(r, ms));

test('runProcess: a signal aborted ends the whole tree (taskkill /pid <pid> /T /F on Windows, then kill) and says aborted', async () => {
  const spawnImpl = hangingSpawn('partial');
  const ctl = new AbortController();
  const p = runProcess({ file: 'C:/x/claude.exe', args: [], cwd: caseDir('stop-run'), timeoutMs: 0, spawnImpl, platform: 'win32', signal: ctl.signal });
  await later(20);
  ctl.abort();
  const r = await p;
  assert.equal(r.aborted, true);
  assert.equal(r.stdout, 'partial');
  const tk = spawnImpl.calls.find((c) => c.file === 'taskkill');
  assert.ok(tk, 'taskkill was started');
  assert.deepEqual(tk.args, ['/pid', String(spawnImpl.calls[0].opts && 5151), '/T', '/F']);
  assert.equal(spawnImpl.calls[0].killed, true);
  // elsewhere no taskkill; and a signal aborted before the start runs nothing
  const other = hangingSpawn();
  const c2 = new AbortController();
  const p2 = runProcess({ file: '/bin/x', args: [], cwd: caseDir('stop-run2'), timeoutMs: 0, spawnImpl: other, platform: 'linux', signal: c2.signal });
  await later(10); c2.abort();
  assert.equal((await p2).aborted, true);
  assert.equal(other.calls.some((c) => c.file === 'taskkill'), false);
  const none = hangingSpawn();
  const done = new AbortController(); done.abort();
  const r3 = await runProcess({ file: '/bin/x', cwd: caseDir('stop-run3'), spawnImpl: none, signal: done.signal });
  assert.equal(r3.aborted, true);
  assert.equal(none.calls.length, 0);
});

const searchLine = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'WebSearch', input: { query: '电车 销量' } }] } });

test('Claude Code: a stopped call is code stopped — never sessionLost, even resumed — and carries the searches made until then', async () => {
  for (const resume of [undefined, '11111111-2222-4333-8444-555555555555']) {
    const spawnImpl = hangingSpawn(`${searchLine}\n`);
    const c = createSessionConnector({ kind: 'claude-code' }, { spawnImpl, env: fakePath('claude'), platform: 'win32' }, { cwd: caseDir('stop-cc-cwd'), web: true });
    const ctl = new AbortController();
    const p = c.send({ prompt: 'hi', format: 'json' }, { sessionId: resume, signal: ctl.signal });
    await later(40);
    ctl.abort();
    const r = await p;
    assert.equal(r.ok, false);
    assert.equal(r.code, 'stopped');
    assert.equal(r.stopped, true);
    assert.equal(r.sessionLost, undefined, 'a stop is not a lost session');
    assert.deepEqual(r.searches, ['电车 销量']);
    assert.ok(spawnImpl.calls.some((x) => x.file === 'taskkill' && x.args.includes('/T')));
  }
});

test('Codex: a stopped resume is code stopped, not sessionLost', async () => {
  const spawnImpl = hangingSpawn('');
  const c = createSessionConnector({ kind: 'codex' }, { spawnImpl, env: fakePath('codex'), platform: 'win32', tmpRoot: caseDir('stop-cx-tmp') }, { cwd: caseDir('stop-cx-cwd'), web: true });
  const ctl = new AbortController();
  const p = c.send({ prompt: 'hi', format: 'json' }, { sessionId: 'thread-abc', signal: ctl.signal });
  await later(60);
  ctl.abort();
  const r = await p;
  assert.equal(r.code, 'stopped');
  assert.equal(r.sessionLost, undefined);
});

test('API key: the request in flight is aborted, no further step runs, the kept conversation is left as it was', async () => {
  const dir = caseDir('stop-api');
  let fetches = 0;
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    fetches += 1;
    if (fetches === 1) {
      // the first step asks for a page
      resolve({ ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'tool_use', id: 'u1', name: 'read_page', input: { url: 'https://example-a.test/x' } }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }) });
      return;
    }
    signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const s = createApiToolSession({ kind: 'api', api: { vendor: 'anthropic', keyRef: 'k' }, model: 'claude-opus-5-5' }, { getKey: () => 'sk-test', fetchImpl }, {
    sessionDir: dir, readPage: async (url) => ({ ok: true, url, title: 't', text: 'body' }), lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  const ctl = new AbortController();
  const p = s.send({ prompt: 'hi', format: 'json', model: 'main' }, { signal: ctl.signal });
  await later(40);
  ctl.abort();
  const r = await p;
  assert.equal(r.code, 'stopped');
  assert.equal(r.stopped, true);
  assert.deepEqual(r.reads.map((x) => x.url), ['https://example-a.test/x'], 'the page read before the stop counts');
  assert.equal(fetches, 2);
  const before = new AbortController(); before.abort();
  assert.equal((await s.send({ prompt: 'hi', format: 'json', model: 'main' }, { signal: before.signal })).code, 'stopped');
  assert.equal(fetches, 2, 'nothing sent once stopped');
});

test('checkCardUrls: stopped() asked between two addresses — no more read once it says so', async () => {
  const card = { name: 'x', definition: {}, sources: [{ name: 'a', url: 'https://a.test/1' }, { name: 'b', url: 'https://b.test/2' }, { name: 'c', url: 'https://c.test/3' }], samples: [], unreadable: [] };
  const read = [];
  let stop = false;
  const r = await checkCardUrls(card, { readPage: async (u) => { read.push(u); stop = true; return { ok: true, text: 'x' }; }, stopped: () => stop });
  assert.equal(r.stopped, true);
  assert.equal(read.length, 1);
});

// ---- the build conversation ------------------------------------------------------------------------------------------

const A = 'https://example-a.test/list';
const B = 'https://example-b.test/s/1';
const CARD = () => ({
  name: '测试库',
  definition: { summary: '一座测试库。', purpose: '研究', scope: '对象：车企；行业：电车；地域：中国；规模：大', exclude: '自媒体', trust: '官方', rhythm: '每天', language: '中文', hard: '一手' },
  decide: [], collect: ['销量'], skip: ['传闻'], sources: [{ name: '甲', url: A, status: '读得到' }], unreadable: [], pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
});

/** A session whose calls answer from `replies`; a reply with hold: true waits until its signal is aborted (then: stopped). */
function session(replies) {
  const calls = [];
  return {
    calls,
    async send(req, { sessionId, signal } = {}) {
      const i = calls.length;
      calls.push({ prompt: req.prompt, sessionId });
      const r = replies[Math.min(i, replies.length - 1)];
      if (r.hold) {
        await new Promise((resolve) => { if (signal?.aborted) resolve(); signal?.addEventListener('abort', resolve, { once: true }); });
        return { ok: false, code: 'stopped', stopped: true, sessionId: sessionId ?? 'new-sess', reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] };
      }
      return { ok: true, text: JSON.stringify(r.json), json: r.json, sessionId: `sess-${i}`, reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] };
    },
  };
}
function world(name) {
  const root = caseDir(name);
  const libDir = join(root, 'library');
  const runner = createActionRunner({ definition: DEF, handlers: cardHandlers({ libraryDirFor: () => libDir, dirOfLibrary: () => libDir }), pendingDir: join(root, 'pending'), logFile: (a, p, r) => join(r.object.id, '_actions.jsonl') });
  return { root, runner };
}
const question = (text, kind = 'input', options = []) => ({ json: { say: '', question: { text, kind, options } } });

test('a stop on the first sentence: the build is as new (no opener, no turns), the call and its searches still counted', async () => {
  const w = world('stop-build-first');
  const ctl = new AbortController();
  const b = createBuild({ connector: session([{ hold: true, searches: ['q1'], reads: [{ url: A, ok: true }] }]), definition: DEF, runner: w.runner });
  const p = b.start('跟踪电车', { signal: ctl.signal });
  await later(10);
  ctl.abort();
  const out = await p;
  assert.equal(out.kind, 'aborted');
  assert.equal(out.text, '跟踪电车');
  const s = b.state();
  assert.equal(s.status, 'new');
  assert.equal(s.opener, null);
  assert.deepEqual(s.turns, []);
  assert.equal(s.calls, 1);
  assert.equal(s.searches.length, 1, 'the search made before the stop counts');
  assert.equal(s.reads.length, 1);
  // it can be started again
  assert.equal(s.status, 'new');
});

test('a stop part way: back to before the words — the question answered and the card waiting stay; the next words open a new session told the record', async () => {
  const w = world('stop-build-mid');
  const sess = session([
    question('拿来做什么？'),
    question('看哪些车企？', 'single', ['大厂', '新势力']),
    { json: { say: '请看卡', card: CARD() }, reads: [{ url: A, ok: true }, { url: B, ok: true }] },
    { hold: true, reads: [{ url: 'https://example-z.test/p', ok: true }] },
    question('还要别的吗？'),
  ]);
  const b = createBuild({ connector: sess, definition: DEF, runner: w.runner });
  await b.start('跟踪电车');
  await b.reply('做研究');
  const third = await b.reply({ picked: ['新势力'] });
  assert.equal(third.kind, 'card');
  assert.equal(third.canConfirm, true);
  const pendingId = b.state().pendingId;
  const before = JSON.parse(JSON.stringify(b.state()));
  const ctl = new AbortController();
  const p = b.reply('再多找几个来源', { signal: ctl.signal });
  await later(10);
  ctl.abort();
  const out = await p;
  assert.equal(out.kind, 'aborted');
  assert.equal(out.text, '再多找几个来源');
  const s = b.state();
  assert.deepEqual(s.turns, before.turns, 'the turns are as before the words');
  assert.deepEqual(s.asked, before.asked);
  assert.equal(s.pendingId, pendingId, 'the card still waits');
  assert.equal(w.runner.pending().some((x) => x.id === pendingId), true);
  assert.equal(s.calls, before.calls + 1, 'the stopped call counts');
  assert.equal(s.reads.length, before.reads.length + 1, 'its read counts');
  assert.equal(s.sessionId, null);
  assert.equal(s.fresh, true);
  // the next words: a new session (no id), told the opener, the questions and answers and the latest card
  const next = await b.reply('再多找几个来源');
  assert.equal(next.kind, 'question');
  const last = sess.calls.at(-1);
  assert.equal(last.sessionId, undefined);
  assert.match(last.prompt, /## 用户的开场白\n用户：跟踪电车/);
  assert.match(last.prompt, /你（第 1 题）：拿来做什么？/);
  assert.match(last.prompt, /用户：做研究/);
  assert.match(last.prompt, /你（第 2 题）：看哪些车企？（选项：大厂 \/ 新势力）/);
  assert.match(last.prompt, /你交了建库卡：请看卡\n```json\n/);
  assert.match(last.prompt, /## 用户接着说\n用户：再多找几个来源$/);
  assert.equal(b.state().fresh, false);
  // and after that the session goes on as before
  await b.reply('好').catch(() => {});
  assert.equal(sess.calls.at(-1).sessionId, 'sess-5');
});

test('a stop while Streams checks the card\'s addresses: the card is not offered, the state goes back', async () => {
  const w = world('stop-build-check');
  const ctl = new AbortController();
  const many = { ...CARD(), sources: [1, 2, 3].map((n) => ({ name: `s${n}`, url: `https://s${n}.test/l`, status: '读得到' })) };
  const read = [];
  const b = createBuild({
    connector: session([question('拿来做什么？'), { json: { say: '卡', card: many } }]), definition: DEF, runner: w.runner,
    readPage: async (u) => { read.push(u); if (read.length === 1) ctl.abort(); return { ok: true, text: 'x' }; },
  });
  await b.start('跟踪电车');
  const before = JSON.parse(JSON.stringify(b.state()));
  const out = await b.reply('做研究', { signal: ctl.signal });
  assert.equal(out.kind, 'aborted');
  assert.equal(read.length, 1, 'no address read after the stop');
  assert.deepEqual(b.state().turns, before.turns);
  assert.equal(b.state().pendingId, null);
  assert.equal(w.runner.pending().length, 0, 'no card was offered');
});

test('a stop on the call that sends a bad answer back (退回重交): back to before the words, the note gone', async () => {
  const w = world('stop-build-back');
  const ctl = new AbortController();
  const sess = session([question('拿来做什么？'), { json: { say: '', question: { text: '', kind: 'input' } } }, { hold: true }]);
  const b = createBuild({ connector: sess, definition: DEF, runner: w.runner });
  await b.start('跟踪电车');
  const before = JSON.parse(JSON.stringify(b.state()));
  const p = b.reply('做研究', { signal: ctl.signal });
  await later(15);
  ctl.abort();
  assert.equal((await p).kind, 'aborted');
  assert.equal(sess.calls.length, 3, 'the call sending it back was made');
  assert.deepEqual(b.state().turns, before.turns, 'the note to the agent is gone with the rest');
  assert.equal(b.state().calls, 3);
});

test('replayPrompt: an earlier card is only named, the latest in full; notes are left out', () => {
  const turns = [
    { role: 'user', text: '开场' },
    { role: 'agent', kind: 'card', say: '一', card: { name: '旧' } },
    { role: 'note', text: '（流息）重交' },
    { role: 'user', text: '改一下' },
    { role: 'agent', kind: 'card', say: '二', card: { name: '新' } },
    { role: 'agent', kind: 'say', say: '好的' },
  ];
  const p = replayPrompt('FIRST', turns, '接着');
  assert.match(p, /^FIRST\n\n## 这次到现在的来回/);
  assert.match(p, /你交过一张建库卡（已被后面的那张替换）。一/);
  assert.match(p, /"name": "新"/);
  assert.doesNotMatch(p, /"name": "旧"/);
  assert.doesNotMatch(p, /重交/);
  assert.doesNotMatch(p, /开场/);
  assert.match(p, /你：好的\n\n## 用户接着说\n用户：接着$/);
});
