// 1.1 W7a (E3, B3): a library made by the last version (no card) is brought over by a build conversation whose card is
// the action convert_library — asked in the user's name, held until 确认, then written into that library's own folder;
// its notes and its 待看 stay as they are. Each test was written against inputs that fail it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBuild, cardHandlers, readCard, writeCard, createActionRunner, loadDefinition, createLibrary, listInbox } from '../src/index.mjs';
import { writeInboxItem } from '../src/pipeline/inbox.mjs';
import { caseDir } from './support/tmp.mjs';

const DEF = loadDefinition();
const A = 'https://example-a.test/list';
const B = 'https://example-b.test/item/1';
const CARD = () => ({
  name: '旧库换过来',
  definition: { summary: '一座测试库。', purpose: '研究', scope: '对象：车企；行业：电动车；地域：中国；规模：大', exclude: '传闻', trust: '官方', rhythm: '每天', language: '中文', hard: '一手出处' },
  decide: [], collect: ['销量'], skip: ['传闻'],
  sources: [{ name: '甲', url: A, status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: B, date: '2026-11-20' }],
});
function fakeSession(replies) {
  const calls = [];
  return {
    calls,
    async send(req) {
      const r = replies[Math.min(calls.length, replies.length - 1)];
      calls.push(req.prompt);
      return { ok: true, text: JSON.stringify(r.json), json: r.json, sessionId: 's', reads: r.reads ?? [], searches: [], otherTools: [] };
    },
  };
}
const card = (c, urls = []) => ({ json: { say: '卡', card: c }, reads: urls.map((url) => ({ url, ok: true })) });

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, n.name);
      if (n.isDirectory()) { h.update(`d:${n.name}\n`); walk(p); } else h.update(`f:${n.name}:${createHash('sha256').update(readFileSync(p)).digest('hex')}\n`);
    }
  };
  walk(dir);
  return h.digest('hex');
}

/** A library as the last version left it: streams.json, a note, an item waiting in 待看; no card. */
function oldWorld(name) {
  const root = caseDir(name);
  const lib = join(root, 'old');
  createLibrary(lib, { name: 'old' });
  writeFileSync(join(lib, 'notes', '2026-11-01-a-note.md'), '---\ntitle: a note\n---\n\nkept by 1.0\n');
  writeInboxItem(lib, { url: 'https://example-c.test/waiting', title: '一条在待看里的', source: 's', what: '摘要', points: ['一点'] });
  const runner = createActionRunner({
    definition: DEF,
    handlers: cardHandlers({ libraryDirFor: () => join(root, 'new'), dirOfLibrary: (id) => (id === 'old' ? lib : join(root, id)) }),
    pendingDir: join(root, 'app', 'pending'),
    logFile: (action, params, result) => join(result.object.id, '_actions.jsonl'),
  });
  return { root, lib, runner };
}

test('convert: the card is convert_library in the user\'s name, held; the library is the same byte for byte until 确认; then the card is in its own folder, its note and 待看 as they were', async () => {
  const w = oldWorld('w7a-convert');
  const notesBefore = treeHash(join(w.lib, 'notes'));
  const inboxBefore = listInbox(w.lib).map((i) => i.url);
  const before = treeHash(w.lib);
  const b = createBuild({ connector: fakeSession([card(CARD(), [A, B])]), definition: DEF, runner: w.runner, convert: { library: 'old' } });
  const r = await b.start('原来的要求：跟踪电动车。原来的来源：甲。');
  assert.deepEqual([r.kind, r.canConfirm, r.proposal.action], ['card', true, 'convert_library']);
  assert.equal(w.runner.pending()[0].actor, 'user');
  assert.equal(treeHash(w.lib), before, 'not confirmed: the same library');
  assert.equal(existsSync(join(w.root, 'new')), false, 'no new folder');
  const out = await b.confirm();
  assert.equal(out.status, 'done');
  assert.equal(b.state().libraryDir, w.lib, 'the same folder');
  assert.equal(readCard(w.lib).name, '旧库换过来');
  assert.equal(treeHash(join(w.lib, 'notes')), notesBefore, 'the notes byte for byte');
  assert.deepEqual(listInbox(w.lib).map((i) => i.url), inboxBefore, '待看 as it was');
  assert.equal(existsSync(join(w.root, 'new')), false);
});

test('convert: every address on the card must be read this time; 不换了 leaves the library as it was', async () => {
  const w = oldWorld('w7a-convert-unread');
  const before = treeHash(w.lib);
  const b = createBuild({ connector: fakeSession([card(CARD(), [A]), card(CARD(), [A])]), definition: DEF, runner: w.runner, convert: { library: 'old' } });
  const r = await b.start('x');
  assert.equal(r.canConfirm, false);
  assert.ok(r.problems.some((p) => p.code === 'not-read' && p.url === B));
  const ok = createBuild({ connector: fakeSession([card(CARD(), [A, B])]), definition: DEF, runner: w.runner, convert: { library: 'old' } });
  await ok.start('x');
  ok.drop();
  assert.equal(w.runner.pending().length, 0);
  assert.equal(treeHash(w.lib), before);
});

test('convert: a library that has a card already is refused (that is a change of its card); the main agent may not ask for it', async () => {
  const w = oldWorld('w7a-convert-has-card');
  writeCard(w.lib, CARD());
  const b = createBuild({ connector: fakeSession([card(CARD(), [A, B])]), definition: DEF, runner: w.runner, convert: { library: 'old' } });
  await b.start('x');
  const out = await b.confirm();
  assert.notEqual(out.status, 'done');
  const asAgent = await w.runner.request('main_agent', { action: 'convert_library', params: { library: 'old', card: CARD() } });
  assert.equal(asAgent.status, 'rejected');
  assert.throws(() => createBuild({ connector: fakeSession([]), definition: DEF, runner: w.runner, convert: { library: 'old' }, edit: { library: 'old', card: CARD() } }), /no edit/);
});

// 1.1 W7a: 停止 during an update — no more sources read, the rest left for the next update, no agent run, recorded 'cancelled'
test('an update stopped while it reads: the sources not read wait for the next update; no agent run; the record says cancelled', async () => {
  const { runUpdate, listRounds } = await import('../src/index.mjs');
  const root = caseDir('w7a-cancel');
  const lib = join(root, 'lib');
  createLibrary(lib, { name: 'lib' });
  const c = CARD();
  c.sources = [{ name: '甲', url: A, status: '读得到' }, { name: '乙', url: 'https://example-d.test/list', status: '读得到' }];
  writeCard(lib, c);
  const controller = new AbortController();
  const read = [];
  let sent = 0;
  const r = await runUpdate(lib, {
    connector: { detect: async () => ({ installed: true, loggedIn: true }), send: async () => { sent += 1; return { ok: true, json: { items: [] }, text: '{"items":[]}', reads: [], searches: [] } } },
    judge: null,
    readLinks: async (url) => { read.push(url); controller.abort(); return { ok: true, url, links: [`${url}/1`], method: 'direct' }; },
    readPage: async () => ({ ok: false, reason: 'failed' }),
    signal: controller.signal,
    pendingDir: join(root, 'pending'),
  });
  assert.deepEqual([r.status, read.length, sent], ['cancelled', 1, 0]);
  assert.deepEqual(r.record.unfinished, ['https://example-d.test/list']);
  assert.equal(listRounds(lib, 1)[0].status, 'cancelled');
});
