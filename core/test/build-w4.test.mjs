// 1.1 W4 (建库): building a library is one run of the main agent with the build SOP and the two web tools. The code
// checks what it hands back — a question (A1), a library card (A2), the card's addresses against what this build read —
// and holds the card until the user confirms (B3). Proposal cards come from the definition. Each test was written
// against inputs that should fail it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBuild, buildBuildPrompt, checkQuestion, answerText, checkCard, cardUrls, sameUrl, renderCard, proposalCards,
  cardHandlers, readCard, createActionRunner, loadDefinition, DEFINITION_PATH, OUTPUT_TEXT, SOP_DIR,
  createSessionConnector, claudeSessionArgv, codexSessionArgv, codexResumeArgv, claudeWebOf, codexWebOf, CLAUDE_WEB_ARGS,
} from '../src/index.mjs';
import { fakeSpawn } from './support/fake-spawn.mjs';
import { caseDir } from './support/tmp.mjs';

const here = new URL('.', import.meta.url);
const fixture = (name) => readFileSync(new URL(`./support/web/${name}`, here), 'utf8');
const DEF = loadDefinition();

const A = 'https://www.example-agency.gc.ca/grants/';
const B = 'https://example-news.test/feed';
const C = 'https://example-board.test/notice/12';
const D = 'https://example-sample.test/2026/11/item';
const readsOf = (...urls) => urls.map((url) => ({ url, ok: true }));

const CARD = () => ({
  name: '安省补助',
  definition: {
    summary: '一座帮安省小企业找政府补助的库。',
    purpose: '找能申请的补助',
    scope: '对象：小企业；行业：食品加工；地域：安省；规模：12 人',
    exclude: '贷款',
    trust: '只收政府官方页（我替你定的）',
    rhythm: '一周一次',
    language: '中文简报，英文原文照收（我替你定的）',
    hard: '只要不用还的补助',
  },
  decide: [{ what: '要不要收联邦的补助', default: '收' }],
  collect: ['设备和自动化补助', '工资补贴'],
  skip: ['贷款'],
  sources: [{ name: '安省补助目录', url: A, status: '读得到，11-20 有更新', note: '新开的项目' }, { name: '新闻', url: B, status: '读得到' }],
  unreadable: [{ name: '某委员会', url: C, reason: '要登录' }],
  pick: ['截止日期在三个月内的先收'],
  write: ['写清截止日期和金额'],
  samples: [{ title: '一个样例', url: D, date: '2026-11-18', why: '设备补助' }],
});

// a stand-in for a session connection with the web tools: each send gets the next reply
function fakeSession(replies) {
  const calls = [];
  return {
    calls,
    sessionful: true,
    async send(req, { sessionId } = {}) {
      const i = calls.length;
      calls.push({ prompt: req.prompt, sessionId });
      const v = replies[Math.min(i, replies.length - 1)];
      const r = typeof v === 'function' ? v(req, i) : v;
      const text = typeof r.text === 'string' ? r.text : JSON.stringify(r.json);
      return { ok: r.ok ?? true, code: r.code, text, json: r.text ? undefined : r.json, sessionId: 'sess-1', resumed: Boolean(sessionId), reads: r.reads ?? [], searches: r.searches ?? [], otherTools: r.otherTools ?? [] };
    },
  };
}
const q = (text, kind = 'input', options = []) => ({ json: { say: '', question: { text, kind, options } } });
const card = (c = CARD(), reads = []) => ({ json: { say: '请看卡', card: c }, reads });

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
const build = (w, session, extra = {}) => createBuild({ connector: session, definition: DEF, runner: w.runner, today: '2026-11-21', ...extra });

function treeHash(dir) {
  if (!existsSync(dir)) return 'absent';
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

// ---------- sop ----------

test('sop: the prompt is the build SOP with the tools, budget, actions and format filled in; seven lines; nothing left unfilled', () => {
  const p = buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-21', opener: '帮我找安省的补助' });
  assert.doesNotMatch(p, /\{\{[A-Z_]+\}\}/);
  for (const w of ['用途', '边界', '不要什么', '多可信才算数', '节奏', '语言', '硬条件', '有没有硬性条件', '我替你定的']) assert.ok(p.includes(w), w);
  assert.ok(p.includes(OUTPUT_TEXT));
  assert.ok(p.includes('建库（create_library）'), 'the actions come from the definition, with their names');
  assert.ok(p.includes('WebSearch') && p.includes('WebFetch'));
  assert.ok(p.includes('2026-11-21') && p.endsWith('用户：帮我找安省的补助'));
  const codex = buildBuildPrompt({ definition: DEF, kind: 'codex', today: '2026-11-21', opener: 'x' });
  assert.ok(codex.includes('web_search') && !codex.includes('WebFetch'));
  // no field knowledge in the shipped SOP: none of the four simulated libraries' subjects
  const sop = readFileSync(join(SOP_DIR, 'build.md'), 'utf8');
  for (const w of ['小盘股', '补助', '电动车', '大模型', 'Godot', 'SEC']) assert.equal(sop.includes(w), false, w);
});

test('sop: a rule changed in a copy of the SOP, no code changed, is what the agent receives; a copy without the format place is refused', async () => {
  const dir = caseDir('w4-sop-copy');
  cpSync(SOP_DIR, dir, { recursive: true });
  const p = join(dir, 'build.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('5. 不给买卖建议。', '5. 不给买卖建议，也不推荐任何券商。'));
  const w = world('w4-sop-world');
  const s = fakeSession([q('你拿这些信息做什么？')]);
  await build(w, s, { sopDir: dir }).start('帮我盯美股');
  assert.ok(s.calls[0].prompt.includes('也不推荐任何券商'));
  // control: the shipped one does not say it
  assert.equal(readFileSync(join(SOP_DIR, 'build.md'), 'utf8').includes('也不推荐任何券商'), false);
  writeFileSync(p, readFileSync(p, 'utf8').replace('{{OUTPUT}}', ''));
  assert.throws(() => buildBuildPrompt({ definition: DEF, kind: 'claude-code', today: '2026-11-21', opener: 'x', sopDir: dir }), /OUTPUT/);
});

// ---------- questions ----------

test('questions: a 6th question, 5 options, a first question with options, a 3rd question with no options are never shown', async () => {
  const cases = {
    sixth: { replies: [q('用途？'), q('地域？', 'single', ['安省', '全国']), q('规模？', 'single', ['小', '大']), q('行业？', 'multi', ['食品', '制造']), q('节奏？', 'single', ['每天', '每周']), q('第六题？', 'single', ['a', 'b'])], at: 5, code: 'too-many-questions' },
    five: { replies: [q('用途？'), q('哪些？', 'multi', ['a', 'b', 'c', 'd', 'e'])], at: 1, code: 'too-many-options' },
    first: { replies: [q('用途？', 'single', ['研究', '投资'])], at: 0, code: 'first-not-input' },
    third: { replies: [q('用途？'), q('边界？'), q('还有？')], at: 2, code: 'too-many-inputs' },
  };
  for (const [name, c] of Object.entries(cases)) {
    const w = world(`w4-q-${name}`);
    const s = fakeSession(c.replies.concat([c.replies[c.replies.length - 1]])); // the retry gets the same bad question
    const b = build(w, s);
    let out = await b.start('帮我找补助');
    for (let i = 1; i <= c.at; i++) {
      assert.equal(out.kind, 'question', `${name}: question ${i} shown`);
      out = await b.reply(out.question.kind === 'input' ? '随便' : { picked: [out.question.options[0]] });
    }
    assert.notEqual(out.kind, 'question', `${name}: not shown`);
    assert.equal(out.notice, 'question-not-shown', name);
    assert.ok(out.problems.includes(c.code), `${name}: ${out.problems}`);
    assert.equal(b.state().asked.length, c.at, `${name}: never counted as asked`);
    // the agent was told what was wrong, once
    assert.match(s.calls[s.calls.length - 1].prompt, /没有给用户看，原因/, name);
  }
});

test('questions: a good one is shown with single / multi and 「其它」; one fixed after being told is shown', async () => {
  const w = world('w4-q-good');
  const s = fakeSession([q('用途？'), q('哪些行业？', 'multi', ['食品', '制造', '零售', '其它']), q('哪个地域？', 'single', ['安省', '全国', '一二三四五', '六', '七']), q('哪个地域？', 'single', ['安省', '全国'])]);
  const b = build(w, s);
  const first = await b.start('帮我找补助');
  assert.deepEqual([first.kind, first.question.kind, first.question.other, first.question.n], ['question', 'input', false, 1]);
  const second = await b.reply('找补助');
  assert.deepEqual([second.question.kind, second.question.options, second.question.other], ['multi', ['食品', '制造', '零售'], true], '「其它」 is the interface\'s, not an option');
  const third = await b.reply({ picked: ['食品'], other: '也看出口' });
  assert.equal(third.kind, 'question', 'the retry gave a good one');
  assert.deepEqual(third.question.options, ['安省', '全国']);
  assert.match(s.calls[2].prompt, /^用户：我选了：食品；其他：也看出口$/);
  assert.equal(answerText(third.question, { picked: [], other: '' }), '我一个都没选');
  assert.equal(answerText(third.question, { picked: ['不在选项里'] }), '我一个都没选', 'only the question\'s own options');
});

test('questions: the checks one by one', () => {
  const input = { text: '用途？', kind: 'input' };
  assert.equal(checkQuestion(input, []).ok, true);
  assert.deepEqual(checkQuestion({ text: '?', kind: 'single', options: ['a'] }, [{ kind: 'input' }]).problems, ['too-few-options']);
  assert.deepEqual(checkQuestion({ text: '?', kind: 'input', options: ['a'] }, []).problems, ['options-on-input']);
  assert.deepEqual(checkQuestion({ text: '', kind: 'essay' }, []).problems.sort(), ['bad-kind', 'no-text']);
  assert.ok(checkQuestion({ text: '?', kind: 'single', options: ['a', 'a'] }, [{ kind: 'input' }]).problems.includes('bad-option'));
  assert.equal(checkQuestion({ text: '?', kind: 'single', options: ['a', 'b', 'c', 'd', '其它'] }, [{ kind: 'input' }]).ok, true, '「其它」 not counted');
});

// ---------- card ----------

test('card: without 「读不到的来源」 or without the 「语言」 line there is no 确认, and it says what is missing; a whole one has 确认', async () => {
  const noUnreadable = CARD(); delete noUnreadable.unreadable;
  const noLanguage = CARD(); delete noLanguage.definition.language;
  const all = readsOf(A, B, C, D);
  for (const [bad, code, key] of [[noUnreadable, 'missing-part', 'unreadable'], [noLanguage, 'missing-line', 'language']]) {
    const w = world(`w4-card-${key}`);
    const b = build(w, fakeSession([card(bad, all), card(bad, [])]));
    const out = await b.start('帮我找补助');
    assert.equal(out.kind, 'card');
    assert.equal(out.canConfirm, false, key);
    assert.ok(out.problems.some((p) => p.code === code && (p.part === key || p.line === key)), JSON.stringify(out.problems));
    assert.equal(out.proposal, undefined);
    assert.deepEqual(w.runner.pending(), [], 'nothing waits for 确认');
  }
  const w = world('w4-card-whole');
  const out = await build(w, fakeSession([card(CARD(), all)])).start('帮我找补助');
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  assert.equal(out.proposal.action, 'create_library');
  assert.equal(w.runner.pending().length, 1);
});

test('card: the eight parts and the definition\'s lines, one by one; at most 3 things to decide; an empty list of unreadable sources is fine', () => {
  assert.equal(checkCard(CARD()).ok, true);
  for (const part of ['definition', 'collect', 'skip', 'sources', 'unreadable', 'pick', 'write', 'samples']) {
    const c = CARD(); delete c[part];
    assert.ok(checkCard(c).problems.some((p) => p.code === 'missing-part' && p.part === part), part);
  }
  for (const line of ['summary', 'purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard']) {
    const c = CARD(); c.definition[line] = ' ';
    assert.ok(checkCard(c).problems.some((p) => p.code === 'missing-line' && p.line === line), line);
  }
  const many = CARD(); many.decide = [1, 2, 3, 4].map((n) => ({ what: `事 ${n}`, default: 'x' }));
  assert.ok(checkCard(many).problems.some((p) => p.code === 'too-many-decisions'));
  const none = CARD(); none.unreadable = [];
  assert.equal(checkCard(none).ok, true);
  const noUrl = CARD(); noUrl.sources[0].url = '安省网站';
  assert.ok(checkCard(noUrl).problems.some((p) => p.code === 'bad-entry' && p.part === 'sources'));
});

test('card: the Markdown people read is made from the card, with headings in both languages', () => {
  const zh = renderCard(CARD(), 'zh-CN');
  for (const h of ['## 库的定义', '## 收什么', '## 不收什么', '## 读得到的来源和当天的状态', '## 读不到的来源和原因', '## 每次怎么挑', '## 每条怎么写', '## 样例', '### 要你定的事', '**硬条件**：只要不用还的补助']) assert.ok(zh.includes(h), h);
  assert.ok(zh.indexOf('## 库的定义') < zh.indexOf('## 收什么') && zh.indexOf('## 每条怎么写') < zh.indexOf('## 样例'), 'the order');
  assert.ok(zh.includes(`[安省补助目录](${A})`));
  const en = renderCard(CARD(), 'en');
  for (const h of ['## What this library is', '## Sources that cannot be read, and why', '**Hard conditions**: ', '## Examples']) assert.ok(en.includes(h), h);
  assert.equal(/## [\u4e00-\u9fff]/.test(en), false);
});

// ---------- urls ----------

test('urls: every address on the card must have been read in this build, in any turn; one that was not is named', async () => {
  const w = world('w4-urls-turns');
  const s = fakeSession([
    { ...q('用途？'), reads: readsOf(A, C) },
    { ...q('地域？', 'single', ['安省', '全国']), reads: readsOf('http://Example-News.test/feed/') },
    card(CARD(), readsOf(D)),
  ]);
  const b = build(w, s);
  await b.start('帮我找补助');
  await b.reply('找补助');
  const out = await b.reply({ picked: ['安省'] });
  assert.equal(out.canConfirm, true, JSON.stringify(out.problems));
  assert.equal(b.state().reads.length, 4, 'the reads of the three turns, added up');
  assert.equal(new Set(b.state().reads.map((r) => r.turn)).size, 3);

  const w2 = world('w4-urls-missing');
  const c = CARD(); c.write = [`照 ${'https://never-opened.test/guide'} 的写法`];
  const out2 = await build(w2, fakeSession([card(c, readsOf(A, B, C, D)), card(c, [])])).start('帮我找补助');
  assert.equal(out2.canConfirm, false);
  assert.deepEqual(out2.problems.filter((p) => p.code === 'not-read').map((p) => p.url), ['https://never-opened.test/guide']);
  assert.ok(cardUrls(c).includes('https://never-opened.test/guide'), 'an address written in the words counts');
});

test('urls: www, a trailing slash, the host\'s case and the scheme do not count; the path and the query do', () => {
  assert.equal(sameUrl('https://www.Example.gc.ca/grants/', 'http://example.gc.ca/grants'), true);
  assert.equal(sameUrl('https://example.gc.ca/grants?id=1', 'https://example.gc.ca/grants?id=2'), false);
  assert.equal(sameUrl('https://example.gc.ca/a', 'https://example.gc.ca/b'), false);
  assert.equal(sameUrl('not a url', 'not a url'), false);
});

test('urls: what was read comes from the two command lines\' real output (Claude Code\'s WebFetch, Codex\'s open_page)', () => {
  assert.deepEqual(claudeWebOf(fixture('claude-web-1.jsonl')).reads, [{ url: 'https://www.bankofcanada.ca/', ok: true }]);
  assert.deepEqual(claudeWebOf(fixture('claude-web-2.jsonl')).reads, [{ url: 'https://www.statcan.gc.ca/en/start', ok: true }]);
  assert.deepEqual(codexWebOf(fixture('codex-web-1.jsonl')).reads, [{ url: 'https://www.bankofcanada.ca/', ok: true }]);
  assert.deepEqual(codexWebOf(fixture('codex-web-2.jsonl')).reads, [{ url: 'https://www.statcan.gc.ca/en/start', ok: true }]);
  // the real Claude Code run had exactly these two tools
  const init = JSON.parse(fixture('claude-web-1.jsonl').split('\n')[0]);
  assert.deepEqual(init.tools.sort(), ['WebFetch', 'WebSearch']);
  // a real Codex run that searched and looked at pages without open_page: the pages it viewed (ref turn<N>view<M>) are
  // exactly the three it listed as opened; the search results (turn<N>search<M>) are not reads
  const multi = fixture('codex-web-3.jsonl');
  const viewed = codexWebOf(multi).reads.map((r) => r.url);
  assert.deepEqual(viewed, [
    'https://www.canada.ca/en/agriculture-agri-food/news/2026/10/canada-and-ontario-investing-2-million-to-protect-the-provinces-agri-food-industry.html',
    'https://agriculture.canada.ca/en/programs/supply-management-processing-investment-fund/applicant-guide',
    'https://www.canada.ca/en/agriculture-agri-food/news/2024/02/governments-helping-food-processors-boost-efficiency.html',
  ]);
  const said = multi.trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.item?.type === 'agent_message').at(-1).item.text;
  for (const u of viewed) assert.ok(said.includes(u), `Codex said it opened ${u}`);
  assert.equal(viewed.includes('https://www.ontario.ca/page/food-safety-and-growth-initiative'), false, 'a search result only');
  assert.ok(multi.includes('"ref_id":"turn0search0","snippet"') || multi.includes('turn0search0'), 'control: that address is in the stream, as a search result');
  assert.ok(codexWebOf(multi).searches.length >= 2);
  // control: a search action is a query, not a page read
  const search = JSON.stringify({ type: 'item.completed', item: { type: 'web_search', query: 'q', action: { type: 'search', query: 'ontario grants' } } });
  assert.deepEqual(codexWebOf(search), { reads: [], searches: ['ontario grants'], otherTools: [] });
});

// ---------- confirm ----------

test('confirm: the card waits outside the library until 确认; then the library, its card, its history and its state are written', async () => {
  const w = world('w4-confirm');
  const b = build(w, fakeSession([card(CARD(), readsOf(A, B, C, D))]));
  const out = await b.start('帮我找补助');
  assert.equal(out.canConfirm, true);
  assert.equal(treeHash(w.libDir), 'absent', 'nothing written before 确认');
  const done = await b.confirm();
  assert.equal(done.status, 'done', JSON.stringify(done));
  assert.equal(b.state().status, 'built');
  assert.deepEqual(readCard(w.libDir), CARD());
  assert.ok(readFileSync(join(w.libDir, '_card', 'card.md'), 'utf8').startsWith('# 安省补助'));
  assert.equal(readdirSync(join(w.libDir, '_card', 'history')).length, 1);
  assert.ok(existsSync(join(w.libDir, '_state', 'state.json')));
  assert.ok(existsSync(join(w.libDir, 'streams.json')));
  const log = readFileSync(join(w.libDir, '_actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(log.map((l) => [l.action, l.confirmedBy]), [['create_library', 'user']]);
  assert.deepEqual(w.runner.pending(), []);
});

test('confirm: not confirmed, nothing is written; a newer card takes the older one\'s place', async () => {
  const w = world('w4-not-confirmed');
  const second = CARD(); second.name = '安省补助二';
  const b = build(w, fakeSession([card(CARD(), readsOf(A, B, C, D)), card(second)]));
  await b.start('帮我找补助');
  const first = w.runner.pending()[0].id;
  await b.reply('名字改一下');
  assert.deepEqual(w.runner.pending().map((p) => p.params.card.name), ['安省补助二']);
  assert.notEqual(w.runner.pending()[0].id, first);
  w.runner.reject(w.runner.pending()[0].id);
  assert.equal(treeHash(w.libDir), 'absent');
  assert.equal((await b.confirm()).status, 'rejected', 'a card taken back cannot be confirmed');
  assert.equal(treeHash(w.libDir), 'absent');
  await assert.rejects(() => b.confirm(), /no card waiting/i);
});

test('confirm: a change of the card waits too; the library is the same byte for byte until 确认; its card shows before and after', async () => {
  const w = world('w4-edit');
  await build(w, fakeSession([card(CARD(), readsOf(A, B, C, D))])).start('x').then(() => w.runner.confirm(w.runner.pending()[0].id));
  const changed = CARD(); changed.definition.rhythm = '每天一次';
  const before = treeHash(w.libDir);
  const r = await w.runner.request('main_agent', { action: 'edit_card', params: { library: 'lib-1', card: changed, why: '用户要每天看' } });
  assert.equal(r.status, 'pending');
  assert.equal(treeHash(w.libDir), before);
  const [shown] = proposalCards(w.runner.pending(), DEF, { cardOf: () => readCard(w.libDir) });
  assert.deepEqual([shown.name, shown.before.definition.rhythm, shown.after.definition.rhythm, shown.canConfirm], ['改建库卡', '一周一次', '每天一次', true]);
  await w.runner.confirm(r.pending.id);
  assert.equal(readCard(w.libDir).definition.rhythm, '每天一次');
  assert.equal(readdirSync(join(w.libDir, '_card', 'history')).length, 2);
});

// ---------- proposals ----------

test('proposals: names come from the definition in both languages; a card that is not whole cannot be confirmed; an action the definition lacks gives no card', () => {
  const at = '2026-11-21T10:00:00.000Z';
  const broken = CARD(); delete broken.samples;
  const pending = [
    { id: 'p1', at, actor: 'main_agent', action: 'create_library', params: { card: CARD() } },
    { id: 'p2', at, actor: 'main_agent', action: 'create_library', params: { card: broken } },
    { id: 'p3', at, actor: 'main_agent', action: 'add_source', params: { library: 'l', source: { name: 'x', url: A } } },
    { id: 'p4', at, actor: 'main_agent', action: 'no_such_action', params: {} },
  ];
  const zh = proposalCards(pending, DEF);
  assert.deepEqual(zh.map((c) => [c.id, c.name, c.canConfirm]), [['p1', '建库', true], ['p2', '建库', false], ['p3', '加来源', true]]);
  assert.deepEqual(proposalCards(pending, DEF, { language: 'en' }).map((c) => c.name), ['Create the library', 'Create the library', 'Add a source']);
  const copy = JSON.parse(readFileSync(DEFINITION_PATH, 'utf8'));
  delete copy.actions.add_source;
  assert.deepEqual(proposalCards(pending, copy).map((c) => c.id), ['p1', 'p2']);
  // the definition requires the names of an action the user confirms
  const noName = JSON.parse(readFileSync(DEFINITION_PATH, 'utf8'));
  delete noName.actions.edit_card.names;
  const dir = caseDir('w4-def-no-name');
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(noName));
  assert.throws(() => loadDefinition({ path: join(dir, 'streams.json') }), /edit_card\.names/);
});

// ---------- connection ----------

const EXE = process.platform === 'win32' ? '.exe' : '';
function fakePath(name, tool) {
  const dir = caseDir(`w4-path-${name}`);
  writeFileSync(join(dir, `${tool}${EXE}`), '');
  return { PATH: dir, Path: dir, PATHEXT: '.EXE;.CMD' };
}

test('connection: Claude Code builds with WebSearch and WebFetch only, a new session first and the same one after; the folder stays empty', async () => {
  const cwd = join(caseDir('w4-claude-conn'), 'cwd');
  const outs = [fixture('claude-web-1.jsonl'), fixture('claude-web-2.jsonl')];
  const spawnImpl = fakeSpawn(({ index }) => ({ stdout: outs[index] }));
  const c = createSessionConnector({ kind: 'claude-code' }, { spawnImpl, env: fakePath('claude', 'claude') }, { cwd, web: true });
  const a = await c.send({ prompt: 'p1', format: 'json' });
  const b = await c.send({ prompt: 'p2', format: 'json' }, { sessionId: a.sessionId });
  const [one, two] = spawnImpl.calls.map((x) => x.args);
  for (const argv of [one, two]) {
    assert.equal(argv[argv.indexOf('--tools') + 1], 'WebSearch,WebFetch');
    assert.deepEqual(argv.slice(argv.indexOf('--allowedTools') + 1, argv.indexOf('--allowedTools') + 3), ['WebSearch', 'WebFetch']);
    assert.equal(argv.filter((x) => x === '--tools').length, 1);
    for (const f of ['--safe-mode', '--restricted', '--strict-mcp-config', '--disable-slash-commands']) assert.ok(argv.includes(f), f);
    for (const f of ['--dangerously-skip-permissions', '--add-dir', '--mcp-config', '--settings', '--agents']) assert.equal(argv.includes(f), false, f);
  }
  assert.ok(one.includes('--session-id') && !one.includes('--resume'));
  assert.equal(two[two.indexOf('--resume') + 1], a.sessionId);
  assert.deepEqual([a.reads[0].url, b.reads[0].url], ['https://www.bankofcanada.ca/', 'https://www.statcan.gc.ca/en/start']);
  assert.deepEqual(readdirSync(cwd), []);
  // control: the zero-tool session is unchanged
  const plain = claudeSessionArgv({ sessionId: 'x' });
  assert.equal(plain[plain.indexOf('--tools') + 1], '');
  assert.equal(CLAUDE_WEB_ARGS.includes('Bash'), false);
});

test('connection: Codex builds with --search on the first call and on every resume, read-only', () => {
  const first = codexSessionArgv({ cwd: 'C:\\x', web: true });
  const resume = codexResumeArgv({ sessionId: '01a1ff60-a746-71b1-9643-caf9260bea00', web: true });
  assert.equal(first[0], '--search');
  assert.equal(first[1], 'exec');
  assert.equal(first[first.indexOf('--sandbox') + 1], 'read-only');
  assert.deepEqual(resume.slice(0, 3), ['--search', 'exec', 'resume']);
  assert.ok(resume.includes('sandbox_mode="read-only"'));
  // control: without web, no search
  assert.equal(codexSessionArgv({ cwd: 'C:\\x' }).includes('--search'), false);
  assert.equal(codexResumeArgv({ sessionId: 'abc' }).includes('--search'), false);
});

test('a build stops when the agent uses any other tool, or goes past the budget; a connection failure keeps the state', async () => {
  const w = world('w4-stop');
  const b = build(w, fakeSession([{ ...q('用途？'), otherTools: ['Bash'] }]));
  assert.deepEqual(await b.start('x'), { kind: 'stopped', notice: 'other-tool' });
  const w2 = world('w4-budget');
  const many = Array.from({ length: 50 }, (_, i) => ({ url: `https://e.test/${i}`, ok: true }));
  const b2 = build(w2, fakeSession([{ ...q('用途？'), reads: many }]));
  const out = await b2.start('x');
  assert.equal(out.notice, 'over-budget');
  const w3 = world('w4-down');
  const b3 = build(w3, fakeSession([{ ok: false, code: 'login-expired', text: '' }, q('用途？')]));
  assert.deepEqual((await b3.start('x')).kind, 'failed');
});
