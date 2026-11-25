// 1.1.2 第 4、5 件 and the main agent's rules (维护者 11-25; docs/feedback/2026-11-25-maintainer-1.1.1-final-test.md, the user case
// docs/feedback/2026-11-25-user-case-cross-border.md): the library's 「每次更新的量」 (three steps, kept in streams.json, used by
// an update), a card that proposes a step (written to streams.json on 确认 only, the card kept without it), the blocks the
// main agent is told of the library it talks about (its step, its earlier conversations, its last update), the user's
// choice kept as it was made (已答小卡), U3 / U9 in the SOP, 「其他」. Each test was first run against an input that fails it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VOLUMES, updateBudgetFor, readLibraryVolume, saveLibraryVolume, isVolume, STANDARD_UPDATE, UPDATE_BUDGET, updateBudgetText,
  createLibrary, createBuild, buildBuildPrompt, cardHandlers, createActionRunner, loadDefinition, readCard, cardChanges, splitVolume,
  buildContext, nearLimit, lastUpdateBlock, conversationsBlock, volumeBlock, answerText, articleLike, libraryUpdateBudget, writeCard,
} from '../src/index.mjs';
import { caseDir } from './support/tmp.mjs';

const DEF = loadDefinition();
const lib = (name) => { const dir = join(caseDir(name), 'lib'); createLibrary(dir, { name: '测试库', language: 'zh-CN' }); return dir; };
const json = (dir) => JSON.parse(readFileSync(join(dir, 'streams.json'), 'utf8'));

// ---------- the steps ----------

test('steps: standard / more / most scale the five limits ×1 / ×2 / ×3; reads at least the card\'s sources + 8; an unknown step is standard', () => {
  assert.deepEqual(VOLUMES, ['standard', 'more', 'most']);
  assert.deepEqual(updateBudgetFor('standard'), { sources: 30, newLinks: 20, searches: 8, reads: 20, items: 30 });
  assert.deepEqual(updateBudgetFor('more'), { sources: 60, newLinks: 40, searches: 16, reads: 40, items: 60 });
  assert.deepEqual(updateBudgetFor('most'), { sources: 90, newLinks: 60, searches: 24, reads: 60, items: 90 });
  // the user case: 14 sources, 20 reads, 5 sources not read
  assert.equal(updateBudgetFor('standard', { sources: 14 }).reads, 22);
  assert.equal(updateBudgetFor('standard', { sources: 5 }).reads, 20, 'a small card keeps the step\'s own number');
  assert.equal(updateBudgetFor('more', { sources: 50 }).reads, 58);
  assert.deepEqual(updateBudgetFor('loud'), updateBudgetFor('standard'));
  assert.deepEqual(UPDATE_BUDGET, STANDARD_UPDATE, 'the standard step is the update\'s budget as before (plus items)');
  assert.equal(isVolume('more'), true);
  assert.equal(isVolume('More'), false);
});

test('steps in streams.json: none -> standard (not stored); saved one -> read back; every other key and the rest of update kept; a bad one refused, nothing written', () => {
  const dir = lib('v112-store');
  assert.deepEqual(readLibraryVolume(dir), { volume: 'standard', stored: false });
  const before = json(dir);
  writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...before, update: { keep: 1 } }, null, 2) + '\n');
  assert.equal(saveLibraryVolume(dir, 'most'), 'most');
  const after = json(dir);
  assert.deepEqual(readLibraryVolume(dir), { volume: 'most', stored: true });
  assert.deepEqual(after.update, { keep: 1, volume: 'most' });
  assert.deepEqual(Object.keys(after), [...Object.keys(before), 'update']);
  for (const k of Object.keys(before)) assert.deepEqual(after[k], before[k], `${k} kept`);
  const text = readFileSync(join(dir, 'streams.json'), 'utf8');
  assert.throws(() => saveLibraryVolume(dir, 'huge'), /volume must be one of/);
  assert.equal(readFileSync(join(dir, 'streams.json'), 'utf8'), text, 'a refused step writes nothing');
  writeFileSync(join(dir, 'streams.json'), JSON.stringify({ ...before, update: { volume: 'huge' } }, null, 2) + '\n');
  assert.deepEqual(readLibraryVolume(dir), { volume: 'standard', stored: false }, 'one it does not know is standard');
});

test('an update is told this step\'s numbers and that how many items is the user\'s step, not the card\'s; libraryUpdateBudget reads the library', () => {
  const t = updateBudgetText(updateBudgetFor('more'));
  assert.match(t, /16 次搜索、40 次读网页/);
  assert.match(t, /合格的都交，最多交 60 条/);
  assert.match(t, /不当作上限，也不为了凑数降低标准/);
  assert.match(updateBudgetText(updateBudgetFor('standard'), { search: false }), /20 次读网页。合格的都交，最多交 30 条/);
  const dir = lib('v112-lib-budget');
  writeCard(dir, { name: 'x', sources: Array.from({ length: 14 }, (_, i) => ({ name: `s${i}`, url: `https://s${i}.test/` })) });
  assert.deepEqual(libraryUpdateBudget(dir), { volume: 'standard', budget: { ...updateBudgetFor('standard'), reads: 22 } });
  saveLibraryVolume(dir, 'more');
  assert.equal(libraryUpdateBudget(dir).budget.newLinks, 40);
  assert.equal(libraryUpdateBudget(dir).volume, 'more');
});

// ---------- U1: which links of a first-read source look like articles ----------

test('U1: article links — the same site, under the source, not the pages every site has, a name at the end', () => {
  const S = 'https://www.shopify.com/blog';
  const yes = ['https://www.shopify.com/blog/3pl-vs-dropshipping', 'https://shopify.com/blog/2026/11/sidekick'];
  const no = ['https://www.shopify.com/pricing', 'https://www.shopify.com/blog', 'https://www.shopify.com/', 'https://www.shopify.com/blog/tags/ai',
    'https://www.shopify.com/blog?page=2', 'https://other.test/blog/a-b-c', 'https://www.shopify.com/blog/guide.pdf', 'https://www.shopify.com/news', 'mailto:a@b.test'];
  for (const u of yes) assert.equal(articleLike(u, S), true, u);
  for (const u of no) assert.equal(articleLike(u, S), false, u);
  assert.equal(articleLike('https://changelog.shopify.com/posts/new-thing', 'https://changelog.shopify.com/'), true);
  assert.equal(articleLike('https://example.test/%E6%96%B0%E9%97%BB/%E4%B8%8A%E6%B5%B7', 'https://example.test/'), true, 'a Chinese name');
});

// ---------- the card's step: a proposal, written on 确认 ----------

const CARD = (extra = {}) => ({
  name: '量的测试', definition: { summary: '一座测试库。', purpose: '测试', scope: '对象；行业；地域；规模', exclude: '无', trust: '官方', rhythm: '每周一次', language: '中文', hard: '无' },
  decide: [], collect: ['新东西'], skip: ['旧闻'], sources: [{ name: '来源', url: 'https://a.test/', status: '读得到' }], unreadable: [],
  pick: ['新的先收'], write: ['写清日期'], samples: [{ title: '样例', url: 'https://a.test/x-1', date: '2026-11-20' }], ...extra,
});

test('create_library: the card\'s step goes into streams.json and not into the card; no step on the card -> the default the desktop gives', async () => {
  const w = caseDir('v112-create');
  const a = join(w, 'a'); const b = join(w, 'b');
  const ha = cardHandlers({ libraryDirFor: () => a, defaultVolume: () => 'most' });
  await ha.create_library({ card: CARD({ volume: 'more' }) }, { now: () => new Date('2026-11-25T12:00:00Z') });
  assert.equal(readLibraryVolume(a).volume, 'more');
  assert.equal(Object.hasOwn(readCard(a), 'volume'), false, 'the card is kept without the step');
  const hb = cardHandlers({ libraryDirFor: () => b, defaultVolume: () => 'most' });
  await hb.create_library({ card: CARD() }, { now: () => new Date('2026-11-25T12:00:00Z') });
  assert.deepEqual(readLibraryVolume(b), { volume: 'most', stored: true }, 'the default of 设置');
  assert.deepEqual(splitVolume(CARD({ volume: 'loud' })).volume, null, 'a step it does not know is not one');
});

test('edit_card: a card naming a step changes streams.json on 确认 only; one that does not leaves the step; before / after carry the step', async () => {
  const root = caseDir('v112-edit');
  const dir = join(root, 'lib');
  const h = cardHandlers({ libraryDirFor: () => dir, dirOfLibrary: () => dir });
  await h.create_library({ card: CARD() }, { now: () => new Date('2026-11-25T12:00:00Z') });
  assert.equal(readLibraryVolume(dir).volume, 'standard');
  const runner = createActionRunner({ definition: DEF, handlers: h, pendingDir: join(root, 'pending'), logFile: (x, p, r) => join(r.object.id, '_actions.jsonl') });
  const asked = await runner.request('main_agent', { action: 'edit_card', params: { library: 'lib-1', card: CARD({ volume: 'more' }), why: '多找一些' } });
  assert.equal(asked.status, 'pending');
  assert.equal(readLibraryVolume(dir).volume, 'standard', 'nothing before 确认');
  const done = await runner.confirm(asked.pending.id);
  assert.equal(done.status, 'done');
  assert.equal(readLibraryVolume(dir).volume, 'more');
  assert.equal(Object.hasOwn(readCard(dir), 'volume'), false);
  assert.equal(done.result.before.volume, 'standard');
  assert.equal(done.result.after.volume, 'more');
  const again = await runner.request('main_agent', { action: 'edit_card', params: { library: 'lib-1', card: CARD({ pick: ['只收官方'] }), why: '改挑法' } });
  await runner.confirm(again.pending.id);
  assert.equal(readLibraryVolume(dir).volume, 'more', 'a card without the step leaves it');
  const dropped = await runner.request('main_agent', { action: 'edit_card', params: { library: 'lib-1', card: CARD({ volume: 'most' }), why: 'x' } });
  runner.reject(dropped.pending.id);
  assert.equal(readLibraryVolume(dir).volume, 'more', '不改了: nothing changes');
});

test('the card\'s changes name the step in words; a card that does not name it shows no change of it', () => {
  const was = CARD({ volume: 'standard' });
  assert.deepEqual(cardChanges(was, CARD({ volume: 'more' })).filter((c) => c.key === 'volume'), [{ key: 'volume', label: '每次更新的量', before: '标准', after: '较多' }]);
  assert.deepEqual(cardChanges(was, CARD()).filter((c) => c.key === 'volume'), []);
  assert.deepEqual(cardChanges(was, CARD({ volume: 'most' }), 'en').find((c) => c.key === 'volume'), { key: 'volume', label: 'Amount per update', before: 'Standard', after: 'Most' });
});

// ---------- what the main agent is told of the library ----------

// the user case's last update, as rounds.jsonl has it (1.1.2 adds volume and budget)
const LAST = {
  id: 'u-1', kind: 'update', startedAt: '2026-11-25T19:00:47.809Z', status: 'done', volume: 'standard', budget: { sources: 30, newLinks: 20, searches: 8, reads: 20, items: 30 },
  counts: { sources: 14, read: 14, unreadable: 2, newLinks: 0, originals: 2, missing: 1, items: 3, inbox: 2 }, unfinished: [],
  agent: { searches: 3, reads: 19, sources: [{ url: 'https://www.shopify.com/editions', status: '这次没读（用量不够）' }, { url: 'https://www.dsers.com/blog/', status: '这次没读（用量不够）；建库时最新一篇是 2026-07-29' }, { url: 'https://www.shopify.com/blog', status: '读得到但没有新东西' }],
    gaps: ['加拿大价格页的月费按年付是 37，按月付是 49。', '因为用量有限，Shopify Editions 这次没读。'] },
};

test('the last update for the main agent: reads against the limit, the sources not read for the limit, the notes for the card', () => {
  const t = lastUpdateBlock(LAST);
  assert.match(t, /读网页 19 \/ 上限 20 次，搜索 3 \/ 上限 8 次/);
  assert.match(t, /因为用量不够没读的来源 2 个：https:\/\/www\.shopify\.com\/editions、https:\/\/www\.dsers\.com\/blog\//);
  assert.match(t, /月费按年付是 37/);
  assert.equal(lastUpdateBlock({ kind: 'build' }), '');
  assert.deepEqual(nearLimit(LAST), { reads: 19, limit: 20, notRead: 2, volume: 'standard' });
  assert.equal(nearLimit({ ...LAST, agent: { reads: 5, sources: [{ url: 'x', status: '读得到' }] } }), null, 'far from the limit, every source read: no hint');
  assert.equal(nearLimit({ ...LAST, budget: undefined }), null, 'an update of an earlier version (no limits kept): no hint');
});

test('earlier conversations for the main agent: what the user said and was asked, how it ended; the step in words', () => {
  const t = conversationsBlock([{ startedAt: '2026-11-25T18:32:22Z', mode: 'create', why: 'built', turns: [
    { role: 'user', text: '我想学习最新的跨境电商运营方法，我是零基础。' }, { role: 'agent', kind: 'question', question: { text: '你打算做什么？' } },
    { role: 'user', text: '我选了：独立站代发货' }, { role: 'agent', kind: 'card', say: '请看卡' },
  ] }]);
  assert.match(t, /建库，用户点了确认/);
  assert.match(t, /- 用户：我想学习最新的跨境电商运营方法/);
  assert.match(t, /- 你问：你打算做什么？/);
  assert.match(t, /- 你交了一张建库卡/);
  assert.match(volumeBlock('more'), /现在是「较多」：每次更新最多取 40 个新链接、搜索约 16 次、读网页约 40 次/);
  assert.equal(volumeBlock(null), '');
  const all = buildContext({ volume: 'standard', conversations: [], lastUpdate: LAST });
  assert.ok(all.indexOf('每次更新的量') < all.indexOf('最近一次更新'));
});

test('a build is given those blocks after the SOP and before the opener, again after a restart (the state keeps them)', async () => {
  const calls = [];
  const session = { sessionful: true, async send(req) { calls.push(req.prompt); return { ok: true, json: { say: '你好' }, text: '{"say":"你好"}', sessionId: 's', reads: [], searches: [], otherTools: [] }; } };
  const w = caseDir('v112-extra');
  const runner = createActionRunner({ definition: DEF, handlers: cardHandlers({ libraryDirFor: () => join(w, 'l'), dirOfLibrary: () => join(w, 'l') }), pendingDir: join(w, 'p'), logFile: (x, p, r) => join(r.object.id, '_actions.jsonl') });
  const extra = buildContext({ volume: 'standard', lastUpdate: LAST });
  const b = createBuild({ connector: session, definition: DEF, runner, today: '2026-11-25', edit: { library: 'lib-1', card: CARD({ volume: 'standard' }) }, extra });
  await b.start('一人独立站那个库，我觉得东西不够全，可以多帮我找一点吗？');
  const p = calls[0];
  assert.ok(p.indexOf('## 这座库最近一次更新') > p.indexOf('## 这座库现在的建库卡'));
  assert.ok(p.indexOf('## 这座库最近一次更新') < p.indexOf('## 用户的开场白'));
  assert.equal(b.state().extra, extra);
  const plain = buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-25', opener: 'x' });
  assert.equal(plain.includes('## 这座库最近一次更新'), false, 'nothing added when nothing is given');
});

// ---------- the user's choice, as made ----------

test('a choice answer keeps { picked, other } beside its sentence (only the question\'s options); a typed answer has none', async () => {
  const replies = [{ say: '', question: { text: '用途？', kind: 'input', options: [] } }, { say: '', question: { text: '不想看到哪些？', kind: 'multi', options: ['卖课', '平台店', '国内政策', '太深的技术'] } }, { say: '好' }];
  let i = 0;
  const session = { sessionful: true, async send() { const j = replies[Math.min(i++, replies.length - 1)]; return { ok: true, json: j, text: JSON.stringify(j), sessionId: 's', reads: [], searches: [], otherTools: [] }; } };
  const w = caseDir('v112-answer');
  const runner = createActionRunner({ definition: DEF, handlers: cardHandlers({ libraryDirFor: () => join(w, 'l') }), pendingDir: join(w, 'p'), logFile: (x, p, r) => join(r.object.id, '_actions.jsonl') });
  const b = createBuild({ connector: session, definition: DEF, runner, today: '2026-11-25' });
  await b.start('我想学跨境电商');
  await b.reply('做独立站');
  await b.reply({ picked: ['卖课', '平台店', '国内政策', '不存在的'], other: ' 也不要直播 ' });
  const users = b.state().turns.filter((t) => t.role === 'user');
  assert.equal(Object.hasOwn(users[1], 'answer'), false, 'a typed answer');
  assert.deepEqual(users[2].answer, { picked: ['卖课', '平台店', '国内政策'], other: '也不要直播' });
  assert.equal(users[2].text, '我选了：卖课、平台店、国内政策；其他：也不要直播');
  assert.equal(answerText({ options: ['甲'] }, { picked: [], other: '乙' }), '其他：乙');
});

// ---------- U3, U9 in the build SOP ----------

test('the build SOP: no per-update count on the card (U3); a choice not ticked is not the agent\'s to decide (U9); 「其他」', () => {
  const p = buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-25', opener: 'x' });
  assert.match(p, /「每次怎么挑」里不写每次收几条的上下限（例如「每次 3 到 8 条」）：每次的量由用户在流息里选的「每次更新的量」定/);
  assert.match(p, /多选题用户没勾的选项就是他没选：问「要哪些」的，没勾的就是不要；问「不要哪些」的，没勾的就是不排除。没勾的不由你定，卡上也不标「我替你定的」。/);
  assert.equal(p.includes('多选题用户没勾的，由你定'), false, 'the 1.1 rule is gone');
  assert.match(p, /用户没回答、或选了「你定」，由你定的，标「我替你定的」；用户答过的照他的答案写，不标/);
  assert.match(p, /"volume": "可以不写；只在用户要改「每次更新的量」时写 standard（标准）、more（较多）或 most（最多）"/);
  assert.equal(p.includes('其它'), false, '「其他」 throughout');
  assert.match(p, /不重复问用户已经答过的。用户说「不够多」「多找一些」时，先看上次更新有没有因为用量没读完的来源/);
});
