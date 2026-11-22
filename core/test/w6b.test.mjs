// 1.1 W6b (A2 改卡时显示改前改后, B3 改建库卡要确认): what changed between two cards, line by line; changing a library's
// card is a build conversation of its own (the agent is given the card the library has; its new card is the action
// edit_card, held until 确认); 不建了 takes the waiting card back. Each test was written against inputs that fail it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  cardChanges, checkQuestion, createBuild, cardHandlers, readCard, createActionRunner, loadDefinition, buildBuildPrompt,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const DEF = loadDefinition();
const A = 'https://www.example-agency.gc.ca/grants/';
const B = 'https://example-news.test/feed';
const C = 'https://example-board.test/notice/12';
const D = 'https://example-sample.test/2026/11/item';
const E = 'https://example-new.test/list';
const readsOf = (...urls) => urls.map((url) => ({ url, ok: true }));

const CARD = () => ({
  name: '安省补助',
  definition: {
    summary: '一座帮安省小企业找政府补助的库。', purpose: '找能申请的补助', scope: '对象：小企业；行业：食品加工；地域：安省；规模：12 人',
    exclude: '贷款', trust: '只收政府官方页', rhythm: '一周一次', language: '中文简报', hard: '只要不用还的补助',
  },
  decide: [{ what: '要不要收联邦的补助', default: '收' }],
  collect: ['设备和自动化补助', '工资补贴'], skip: ['贷款'],
  sources: [{ name: '安省补助目录', url: A, status: '读得到' }, { name: '新闻', url: B, status: '读得到' }],
  unreadable: [{ name: '某委员会', url: C, reason: '要登录' }],
  pick: ['截止日期在三个月内的先收'], write: ['写清截止日期和金额'],
  samples: [{ title: '一个样例', url: D, date: '2026-11-18' }],
});

function fakeSession(replies) {
  const calls = [];
  return {
    calls,
    async send(req, { sessionId } = {}) {
      const i = calls.length;
      calls.push({ prompt: req.prompt, sessionId });
      const r = replies[Math.min(i, replies.length - 1)];
      return { ok: true, text: JSON.stringify(r.json), json: r.json, sessionId: 'sess-1', reads: r.reads ?? [], searches: r.searches ?? [], otherTools: [] };
    },
  };
}
const card = (c, reads = []) => ({ json: { say: '请看卡', card: c }, reads });

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
const hashOf = (p) => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'absent');

test('cardChanges: only the lines that changed, in the card\'s order, with the words before and after', () => {
  const a = CARD();
  assert.deepEqual(cardChanges(a, CARD()), [], 'the same card: nothing');
  const b = CARD();
  b.definition.rhythm = '每天一次';
  b.sources.push({ name: '新来源', url: E, status: '读得到' });
  b.decide = [];
  const ch = cardChanges(a, b);
  assert.deepEqual(ch.map((c) => c.key), ['rhythm', 'decide', 'sources']);
  assert.deepEqual([ch[0].label, ch[0].before, ch[0].after], ['节奏', '一周一次', '每天一次']);
  assert.equal(ch[1].after, '', 'a part emptied: nothing after');
  assert.ok(ch[2].after.split('\n').length === 3 && ch[2].after.includes(E) && !ch[2].before.includes(E));
  assert.equal(cardChanges(null, a).length > 5, true, 'from no card: every line');
  assert.equal(cardChanges(a, b, 'en')[0].label, 'Rhythm');
});

test('a build: a card sent again is shown with the one before it (before / after); the first has none', async () => {
  const w = world('w6b-again');
  const second = CARD(); second.definition.rhythm = '每天一次';
  const b = createBuild({ connector: fakeSession([card(CARD(), readsOf(A, B, C, D)), card(second)]), definition: DEF, runner: w.runner, today: '2026-11-21' });
  const one = await b.start('帮我找安省的补助');
  assert.deepEqual([one.kind, one.canConfirm, one.before], ['card', true, null]);
  const two = await b.reply('改成每天一次');
  assert.equal(two.canConfirm, true);
  assert.equal(two.before.definition.rhythm, '一周一次');
  assert.deepEqual(cardChanges(two.before, two.card).map((c) => c.key), ['rhythm']);
  assert.equal(w.runner.pending().length, 1, 'the newer card took the older one\'s place');
});

test('changing a library\'s card: the agent is given the card; its new card is edit_card, held until 确认; before / after; then written with its history', async () => {
  const w = world('w6b-edit');
  const made = createBuild({ connector: fakeSession([card(CARD(), readsOf(A, B, C, D))]), definition: DEF, runner: w.runner, today: '2026-11-21' });
  await made.start('x');
  await made.confirm();
  const now = readCard(w.libDir);
  const cardFile = join(w.libDir, '_card', 'card.json');
  const before = hashOf(cardFile);

  const changed = CARD(); changed.collect = ['设备和自动化补助', '工资补贴', '出口补助'];
  const session = fakeSession([{ json: { say: '只改收什么吗？', question: { text: '出口补助也收吗？', kind: 'single', options: ['收', '不收'] } } }, card(changed)]);
  const e = createBuild({ connector: session, definition: DEF, runner: w.runner, today: '2026-11-21', edit: { library: 'lib-1', card: now } });
  const q = await e.start('出口那块也要');
  assert.equal(q.kind, 'question', 'changing a card, the 1st question may be a choice');
  assert.ok(session.calls[0].prompt.includes('## 这座库现在的建库卡') && session.calls[0].prompt.includes('设备和自动化补助'), 'the agent was given the card');
  const r = await e.reply({ picked: ['收'] });
  assert.deepEqual([r.kind, r.canConfirm, r.proposal.action, r.proposal.name], ['card', true, 'edit_card', '改建库卡']);
  assert.deepEqual(r.before, now, 'before = the card the library has');
  assert.deepEqual(cardChanges(r.before, r.card).map((c) => c.key), ['collect']);
  assert.equal(hashOf(cardFile), before, 'not confirmed: the card file is the same');
  const out = await e.confirm();
  assert.equal(out.status, 'done');
  assert.notEqual(hashOf(cardFile), before);
  assert.deepEqual(readCard(w.libDir).collect, changed.collect);
  assert.equal(readdirSync(join(w.libDir, '_card', 'history')).length, 2);
  assert.equal(e.state().status, 'built');
});

test('changing a card: the addresses already on it count as read; a new one must be read this time', async () => {
  const w = world('w6b-edit-urls');
  const old = CARD();
  const withNew = CARD(); withNew.sources.push({ name: '新来源', url: E, status: '读得到' });
  const unread = createBuild({ connector: fakeSession([card(withNew), card(withNew)]), definition: DEF, runner: w.runner, edit: { library: 'lib-1', card: old } });
  const r = await unread.start('加一个来源');
  assert.equal(r.canConfirm, false);
  assert.deepEqual(r.problems.map((p) => p.url ?? p.code), [E], 'only the new address is named');
  const read = createBuild({ connector: fakeSession([card(withNew, readsOf(E))]), definition: DEF, runner: w.runner, edit: { library: 'lib-1', card: old } });
  assert.equal((await read.start('加一个来源')).canConfirm, true);
  // a new build (not a change) still needs every address read
  const fresh = createBuild({ connector: fakeSession([card(old), card(old)]), definition: DEF, runner: w.runner });
  assert.equal((await fresh.start('x')).canConfirm, false);
});

test('不建了: the waiting card is taken back, nothing is made, the build ends', async () => {
  const w = world('w6b-drop');
  const b = createBuild({ connector: fakeSession([card(CARD(), readsOf(A, B, C, D))]), definition: DEF, runner: w.runner });
  await b.start('x');
  assert.equal(w.runner.pending().length, 1);
  b.drop();
  assert.equal(w.runner.pending().length, 0);
  assert.equal(existsSync(w.libDir), false);
  assert.equal(b.state().status, 'dropped');
  await assert.rejects(() => b.reply('还是建吧'), /dropped/);
});

test('the first question is still an input in a new build; the change of a card may open with a choice', () => {
  const choice = { text: '收哪几家？', kind: 'multi', options: ['甲', '乙'] };
  assert.deepEqual(checkQuestion(choice, []).problems, ['first-not-input']);
  assert.equal(checkQuestion(choice, [], { firstInput: false }).ok, true);
});

test('the prompt of a change carries the card; a new build\'s does not', () => {
  const p = buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-21', opener: '改一下', current: CARD() });
  assert.ok(p.includes('## 这座库现在的建库卡') && p.includes('"rhythm": "一周一次"') && p.endsWith('用户：改一下'));
  assert.ok(p.includes('## 改一座已有的库'), 'the SOP says how to change a card');
  assert.equal(buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-21', opener: 'x' }).includes('## 这座库现在的建库卡'), false);
});
