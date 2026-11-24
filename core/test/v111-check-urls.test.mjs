// 1.1.1 P1 (acceptance B19; plan 场景二③④): a card's web addresses are checked by Streams' own readers, not only by what
// the model says it opened.
//   1  an address with no open but read by Streams -> the card can be confirmed (without Streams' reader: it cannot)
//   2  no open and a 404 -> sent back once with what Streams got; handed in again the same -> shown, not confirmable, with the
//      address and why
//   3  an open that came back as an error (Codex 11-24: one result, no address, 「Internal Error」) is not a read
//   4  「读不到的来源」 asks for no open; Streams' result goes beside it — 11-24 Codex customer 3's card replayed
//   5  「原文」 of 来源与要求 has a value on the day the library is built
// Each check holds first the state that would make it fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBuild, checkCard, cardHandlers, createActionRunner, loadDefinition, codexWebOf, sourceRows,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const DEF = loadDefinition();
const A = 'https://www.example-agency.gc.ca/grants/';
const B = 'https://example-news.test/feed';
const C = 'https://example-board.test/notice/12';
const D = 'https://example-sample.test/2026/11/item';
const P = 'https://example-agency.gc.ca/grants/guide.pdf';

const CARD = () => ({
  name: '安省补助',
  definition: {
    summary: '一座帮安省小企业找政府补助的库。', purpose: '找能申请的补助', scope: '对象：小企业；地域：安省', exclude: '贷款',
    trust: '只收政府官方页', rhythm: '一周一次', language: '中文简报', hard: '只要不用还的补助',
  },
  collect: ['设备补助'], skip: ['贷款'],
  sources: [{ name: '安省补助目录', url: A, status: '读得到' }, { name: '新闻', url: B, status: '读得到' }],
  unreadable: [{ name: '某委员会', url: C, reason: '要登录' }],
  pick: ['截止在三个月内的先收'], write: ['写清截止日期和金额'],
  samples: [{ title: '一个样例', url: D, date: '2026-11-18' }],
});

function fakeSession(replies) {
  const calls = [];
  return {
    calls,
    sessionful: true,
    async send(req, { sessionId } = {}) {
      const i = calls.length;
      calls.push({ prompt: req.prompt, sessionId });
      const r = replies[Math.min(i, replies.length - 1)];
      return { ok: true, text: JSON.stringify(r.json), json: r.json, sessionId: 'sess-1', resumed: Boolean(sessionId), reads: r.reads ?? [], searches: [], otherTools: [] };
    },
  };
}
const handIn = (c, reads = []) => ({ json: { say: '请看卡', card: c }, reads });
const ok = (...urls) => urls.map((url) => ({ url, ok: true }));

function world(name) {
  const root = caseDir(name);
  const libDir = join(root, 'library');
  const runner = createActionRunner({
    definition: DEF,
    handlers: cardHandlers({ libraryDirFor: () => libDir, dirOfLibrary: () => libDir }),
    pendingDir: join(root, 'app', 'pending'),
    logFile: (action, params, result) => join(result.object.id, '_actions.jsonl'),
  });
  return { root, libDir, runner };
}
// Streams' readers over a table of addresses: { url: { ok, method?, reason? } }; anything else: a server that does not answer
function readers(table) {
  const asked = [];
  const look = (url) => table[url] ?? { ok: false, reason: 'failed' };
  return {
    asked,
    readPage: async (url) => { asked.push(['page', url]); const r = look(url); return { url, ok: r.ok, method: r.ok ? r.method ?? 'direct' : null, reason: r.ok ? undefined : r.reason, text: r.ok ? '正文'.repeat(200) : '' }; },
    readLinks: async (url) => { asked.push(['links', url]); const r = look(url); return r.ok ? { ok: true, url, links: r.links ?? [], method: 'direct' } : { ok: false, url, links: [], reason: r.reason }; },
  };
}
const build = (w, session, extra = {}) => createBuild({ connector: session, definition: DEF, runner: w.runner, today: '2026-11-24', ...extra });

test('B19 ①: an address the model did not open but Streams read — the card can be confirmed, not sent back', async () => {
  // what would fail it: no reader of Streams' own — then the address has nothing for it, and the card goes back
  const w0 = world('p1-1-none');
  const s0 = fakeSession([handIn(CARD(), ok(B, D))]);
  const out0 = await build(w0, s0).start('帮我找补助');
  assert.equal(out0.canConfirm, false);
  assert.equal(s0.calls.length, 2, 'sent back once');
  assert.ok(out0.problems.some((p) => p.code === 'not-read' && p.url === A));

  const w = world('p1-1');
  const s = fakeSession([handIn(CARD(), ok(B, D))]);
  const r = readers({ [A]: { ok: true, links: [`${A}item-1`] }, [`${A}item-1`]: { ok: true }, [B]: { ok: true }, [D]: { ok: true }, [C]: { ok: false, reason: 'login' } });
  const out = await build(w, s, r).start('帮我找补助');
  assert.equal(out.kind, 'card');
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  assert.equal(s.calls.length, 1, 'not sent back');
  assert.deepEqual(out.card.sources[0].checked, { ok: true, original: 'read', reason: null });
  assert.ok(r.asked.some(([, u]) => u === A), 'Streams read it itself');
});

test('B19 ②: no open and a 404 — sent back once with what Streams got; again the same: shown, not confirmable, with the address and why', async () => {
  const w = world('p1-2');
  const s = fakeSession([handIn(CARD(), ok(B, D)), handIn(CARD(), ok(B, D))]);
  const r = readers({ [A]: { ok: false, reason: 'dead' }, [B]: { ok: true }, [D]: { ok: true }, [C]: { ok: false, reason: 'login' } });
  const out = await build(w, s, r).start('帮我找补助');
  assert.equal(s.calls.length, 2, 'sent back once, not more');
  const back = s.calls[1].prompt;
  assert.ok(back.includes(A) && back.includes('地址失效'), back);
  assert.equal(out.kind, 'card');
  assert.equal(out.canConfirm, false);
  assert.deepEqual(out.problems.filter((p) => p.code === 'not-read'), [{ code: 'not-read', url: A, reason: 'dead' }]);
  // 「读不到的来源」: no open asked for, Streams' result beside it
  assert.ok(!out.problems.some((p) => p.url === C));
  assert.deepEqual(out.card.unreadable[0].checked, { ok: false, original: 'link', reason: 'login' });
  assert.equal(existsSync(join(w.libDir, '_card', 'card.json')), false, 'nothing written');
});

test('B19 ③: a Codex open that came back as an error is not a read; Streams has to read the address itself', async () => {
  const lines = [
    { type: 'item.completed', item: { id: 'i1', type: 'web_search', query: A, action: { type: 'open_page', url: A }, results: [{ type: 'text_result', ref_id: 'turn0view0', title: 'Internal Error' }] } },
    { type: 'item.completed', item: { id: 'i2', type: 'web_search', query: B, action: { type: 'open_page', url: B }, results: [{ type: 'text_result', ref_id: 'turn1view0', title: 'News', url: B }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  const web = codexWebOf(lines);
  assert.deepEqual(web.reads, [{ url: A, ok: false }, { url: B, ok: true }]);
  // the same address opened again, this time with the page: a read
  const again = `${lines}\n${JSON.stringify({ type: 'item.completed', item: { id: 'i3', type: 'web_search', action: { type: 'open_page', url: A }, results: [{ type: 'text_result', ref_id: 'turn2view0', title: 'Grants', url: A }] } })}`;
  assert.deepEqual(codexWebOf(again).reads, [{ url: A, ok: true }, { url: B, ok: true }]);

  // the failed open in a build: Streams cannot read it either -> not confirmable
  const w = world('p1-3');
  const s = fakeSession([handIn(CARD(), [...web.reads, ...ok(D)])]);
  const out = await build(w, s, readers({ [B]: { ok: true }, [D]: { ok: true } })).start('帮我找补助');
  assert.equal(out.canConfirm, false);
  assert.ok(out.problems.some((p) => p.code === 'not-read' && p.url === A && p.reason === 'failed'), JSON.stringify(out.problems));
});

test('B19 ④: 「读不到的来源」 needs no open — 11-24 Codex customer 3\'s card, replayed, can be confirmed', async () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/codex-customer3.json', import.meta.url), 'utf8'));
  // what would fail it: the 1.1.0 rule (every address opened) — the unreadable ones have no open
  const before = checkCard(fx.card, { reads: fx.reads });
  const unread = fx.card.unreadable.map((u) => u.url);
  assert.ok(before.problems.length > 0 && before.problems.every((p) => p.code === 'not-read' && unread.includes(p.url)), JSON.stringify(before.problems));

  const w = world('p1-4');
  const s = fakeSession([handIn(fx.card, fx.reads)]);
  // Streams reads none of them (a server that does not answer): the model's own opens are what count here
  const out = await build(w, s, readers({})).start('帮我盯中国电动车');
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  assert.equal(s.calls.length, 1);
  for (const u of out.card.unreadable) assert.deepEqual(u.checked, { ok: false, original: 'link', reason: 'failed' }, u.url);
});

test('B19 ⑤: 「原文」 of 来源与要求 has a value the day the library is built, before any update', async () => {
  const c = CARD();
  c.sources.push({ name: '指南', url: P, status: '读得到' });
  const w = world('p1-5');
  const s = fakeSession([handIn(c, ok(A, B, D, P))]);
  // A: a page of links whose own link is an article; B: the model opened it, Streams cannot (only links); P: a PDF
  const r = readers({ [A]: { ok: true, links: [`${A}item-1`] }, [`${A}item-1`]: { ok: true }, [B]: { ok: false, reason: 'blocked' }, [D]: { ok: true }, [P]: { ok: true, method: 'pdf' } });
  const b = build(w, s, r);
  const out = await b.start('帮我找补助');
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  const done = await b.confirm();
  assert.equal(done.status, 'done');
  const rows = sourceRows(w.libDir);
  assert.deepEqual(rows.map((x) => [x.url, x.state, x.original]), [[A, 'never', 'read'], [B, 'never', 'link'], [P, 'never', 'pdf'], [C, 'blocked', 'link']]);
  assert.deepEqual(rows[3].checked, { ok: false, original: 'link', reason: 'failed' });
});
