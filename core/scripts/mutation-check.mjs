#!/usr/bin/env node
// Each check of the core named here must be able to fail: break a copy of core/ on purpose (a folder under the OS temp
// folder, made with mkdirSync), run the check there, and see it fail; the same check on an unbroken copy passes. The
// originals are never edited — the files the mutants edit are hashed before and after.
//   node core/scripts/mutation-check.mjs              all of them
//   node core/scripts/mutation-check.mjs <id> …       some
// (The desktop's own mutants: desktop/scripts/mutation-check.mjs.)
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MUTANTS = [
  {
    id: 'b-hash-whole-config',
    what: 'a card\'s baseHash covers the whole configuration again, not only the part the card changes (v2 package G, 11-09)',
    edits: [['src/proposals/proposals.mjs', 'hashOf(snapshot(libraryDir, HASH_FIELDS[kind]))', "hashOf(snapshot(libraryDir, ['brief', 'sources', 'topics', 'thresholds', 'schedule', 'cap']))"]],
    test: ['test/proposals.test.mjs', '--test-name-pattern=UC3: an add_source'],
  },
  // redesign R6a (docs/checks/2026-11-13-r6a/contract.md 「测」): V9's sentence in the core
  {
    id: 'r6a-core-sentence',
    what: 'the core\'s copy of 问库\'s 「库内暂无相关内容。」 is the sentence before R6a again (the main agent would say 库里没有。)',
    edits: [['src/agent/words.mjs', "export const NOT_IN_LIBRARY = Object.freeze({ zh: '库内暂无相关内容。',", "export const NOT_IN_LIBRARY = Object.freeze({ zh: '库里没有。',"]],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a NOT_IN_LIBRARY'],
  },
  // redesign R6b-1 (docs/checks/2026-11-13-r6b/contract.md 「测」): the words the main agent is given for a source's state and
  // what to do about it are the contract's tables (the page's are held to the same tables by the desktop's and V3's tests)
  {
    id: 'r6b-core-state-word',
    what: 'the core\'s word for a state is not 05\'s (the main agent would say another word than the page)',
    edits: [['src/agent/words.mjs', "gap: '地址无效', failed: '暂时失败', blocked: '访问被拒', login: '要登录',", "gap: '地址待查', failed: '暂时失败', blocked: '访问被拒', login: '要登录',"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=redesign R6b-1'],
  },
  {
    id: 'r6b-core-advice-round',
    what: 'the core\'s 处理建议 of 暂时失败 says 下一轮 again (a word 05 no longer uses; R5a took such sentences out of its scan)',
    edits: [['src/agent/words.mjs', "    'retry-next-round': '下次运行时将自动重试，无需修改地址。',", "    'retry-next-round': '下一轮会自动重试，无需修改地址。',"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=redesign R6b-1'],
  },
  {
    id: 'r6b-core-advice-en',
    what: 'the core\'s English 处理建议 of 访问被拒 is not the contract\'s sentence',
    edits: [['src/agent/words.mjs', "    'blocked-remove-source': 'This site does not allow programs to read it, so retrying will not help. Use a different source.',", "    'blocked-remove-source': 'This site does not allow programs to read it. Use another source.',"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=redesign R6b-1'],
  },
  {
    id: 'r6b-core-connection-words',
    what: 'the sentence of a connection that failed is the one before R6b again (连接出了问题 … 这条消息没有回答)',
    edits: [['src/agent/words.mjs', '`连接出现问题：${why}，该消息未获得回答。`', '`连接出了问题：${why}，这条消息没有回答。`']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 2: a proposal not made'],
  },
  // redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md 「英文字典全量」): the English the core supplies
  {
    id: 'r6b-core-rule-desc-not-english',
    what: 'the English description of a built-in rule is the Chinese one (an English interface would show 理由不超过 120 字)',
    edits: [['src/verify/checklist.mjs', "    'reason-length': 'The reason is at most 120 characters',", "    'reason-length': '理由不超过 120 字',"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 describeChecklist: the eleven'],
  },
  {
    id: 'r6b-core-rule-desc-from-words',
    what: 'describeChecklist rewords a user\'s own item that carries a built-in id',
    edits: [['src/verify/checklist.mjs', "  if (!isPlainObject(item) || item.origin !== 'streams' || typeof item.id !== 'string') return null;", "  if (!isPlainObject(item) || typeof item.id !== 'string') return null;"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 describeChecklist leaves'],
  },
  {
    id: 'r6b-core-run-desc-changed',
    what: 'the description the pipeline runs with (and tells the verifier) is the English one',
    edits: [['src/verify/checklist.mjs', "export function summaryBaseline(language = 'zh-CN') {", "export function summaryBaseline(language = 'en') {"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 describeChecklist: the eleven'],
  },
  {
    id: 'r6b-core-inbox-case',
    what: 'the English sentence the core writes into the conversation says inbox in lower case again',
    edits: [['src/suggest/act.mjs', 'runs in a row put nothing new into the Inbox.', 'runs in a row put nothing new into the ' + 'in' + 'box.']],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the proper names'],
  },
  // redesign R2 (docs/checks/2026-11-11-r2/contract.md 「测」)
  {
    id: 'r2-dismiss-placeholder',
    what: 'a dismissal without a reason gets a made-up placeholder reason in the ledger',
    edits: [['src/pipeline/decide.mjs', "  if (words !== '') ev.reason = words;", "  ev.reason = words !== '' ? words : '未说明';"]],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-2 dismiss with no reason'],
  },
  {
    id: 'r2-move-writes-notes',
    what: '移入待看 also keeps the item (a note file is written) instead of only putting it in the inbox',
    edits: [['src/pipeline/decide.mjs', "  appendEvent(libraryDir, { ts, ev: 'inbox', url, moved: 'rejected', from: below.gate });\n  return { url };", "  appendEvent(libraryDir, { ts, ev: 'inbox', url, moved: 'rejected', from: below.gate });\n  keep(libraryDir, url, { now });\n  return { url };"]],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-4 moveToInbox'],
  },
  {
    id: 'r2-calls-part-off',
    what: 'one part of the run\'s calls is off by one (核验 counts one call too many)',
    edits: [['src/pipeline/round.mjs', '    callsBy.verify += judged;', '    callsBy.verify += judged + 1;']],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-6 callsBy'],
  },
  {
    id: 'r2-later-kept',
    what: 'releaseLater leaves the 稍后 file in place (the items never come back to 待看)',
    edits: [['src/pipeline/later.mjs', '  unlinkSync(path);\n  return { released };', '  return { released };']],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-3 later'],
  },
  // redesign R3 (docs/checks/2026-11-11-r3/contract.md 「测」)
  {
    id: 'r3-all-lists-caught',
    what: '资料库 「全部」 also lists the caught items that have no file (the old 「抓到的」)',
    edits: [['src/library/browse.mjs', "    items = readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e));", "    items = [...readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e)), ...(view === 'all' ? caughtItems(libraryDir, { topics, days, now }) : [])];"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-1'],
  },
  {
    id: 'r3-graph-caught',
    what: 'the graph also draws the ledger items that have no file',
    edits: [
      ['src/graph/graph.mjs', "import { cmp, entryFilter } from '../library/browse.mjs';", "import { cmp, entryFilter, listLibrary } from '../library/browse.mjs';"],
      ['src/graph/graph.mjs', "  const items = readIndex(libraryDir).filter((e) => (status === 'all' || e.status === 'kept') && keep(e));", "  const items = [...readIndex(libraryDir), ...listLibrary(libraryDir, { view: 'caught' }).items.map((c) => ({ id: c.url, title: c.title, topics: [], source_name: c.source, date: c.date, status: 'kept' }))].filter((e) => (status === 'all' || e.status === 'kept') && keep(e));"],
    ],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-2'],
  },
  {
    id: 'r3-header-changes-body',
    what: 'writing a header also changes the body (a line added at its end)',
    edits: [['src/library/write-note.mjs', "  const bytes = Buffer.concat([bom, Buffer.from(serializeFrontmatter(header), 'utf8'), body]);", "  const bytes = Buffer.concat([bom, Buffer.from(serializeFrontmatter(header), 'utf8'), body, Buffer.from('\\n')]);"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-4'],
  },
  {
    id: 'r3-snippet-marks',
    what: 'a search snippet is cut from the raw body again (its Markdown marks show)',
    edits: [['src/library/search.mjs', '    snippet: snippetOf(plainBody(body), tokens, entry.summary),', '    snippet: snippetOf(body, tokens, entry.summary),']],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=search snippets'],
  },
  {
    id: 'r3-edit-source',
    what: '编辑 also takes the source (a record field)',
    edits: [['src/library/edit.mjs', "export const EDITABLE_KEYS = ['title', 'topics', 'body'];", "export const EDITABLE_KEYS = ['title', 'topics', 'body', 'source'];"]],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-3'],
  },
  // redesign R4a (docs/checks/2026-11-12-r4a/contract.md 「测」)
  {
    id: 'r4a-standard-0707',
    what: '标准 is 0.7 / 0.7 instead of 0.5 / 0.6',
    edits: [['src/pipeline/strictness.mjs', 'standard: Object.freeze({ relevance: 0.5, substance: 0.6 }),', 'standard: Object.freeze({ relevance: 0.7, substance: 0.7 }),']],
    test: ['test/r4a-new-library.test.mjs', '--test-name-pattern=R4a-4'],
  },
  {
    id: 'r4a-read-rewrites',
    what: 'reading a library\'s strictness writes 标准 over numbers that are no level (an existing library\'s thresholds changed)',
    edits: [['src/pipeline/strictness.mjs', '  const thresholds = thresholdsOf(pipelineConfig(libraryDir));\n  return { level: strictnessOf(thresholds), thresholds };', "  let thresholds = thresholdsOf(pipelineConfig(libraryDir));\n  if (strictnessOf(thresholds) === 'custom') { savePipelineConfig(libraryDir, withThresholds(pipelineConfig(libraryDir), STRICTNESS.standard)); thresholds = thresholdsOf(pipelineConfig(libraryDir)); }\n  return { level: strictnessOf(thresholds), thresholds };"]],
    test: ['test/r4a-new-library.test.mjs', '--test-name-pattern=reading an existing library'],
  },
  {
    id: 'r4a-card-old-default',
    what: 'a create_library card that names no thresholds leaves the pipeline\'s 0.7 / 0.6 (the new library is not 标准)',
    edits: [['src/library/new-library.mjs', "  step('thresholds', () => savePipelineConfig(dir, withThresholds(pipelineConfig(dir), spec.thresholds ?? STRICTNESS[DEFAULT_STRICTNESS])));", "  step('thresholds', () => { if (spec.thresholds && spec.thresholds !== STRICTNESS[DEFAULT_STRICTNESS]) savePipelineConfig(dir, withThresholds(pipelineConfig(dir), spec.thresholds)); });"], ['src/library/new-library.mjs', "    thresholds: { ...STRICTNESS[DEFAULT_STRICTNESS], ...(thresholds ?? {}) },", "    thresholds: thresholds ?? STRICTNESS[DEFAULT_STRICTNESS],"]],
    test: ['test/r4a-new-library.test.mjs', '--test-name-pattern=new libraries start at'],
  },
  // redesign R4b (docs/checks/2026-11-12-r4b/contract.md 「测」)
  {
    id: 'r4b-name-unsaved',
    what: 'saveLibraryName answers the new name but does not put it into streams.json',
    edits: [['src/library/brief.mjs', '  whole.name = name.trim();\n', '']],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=R4b-1 库名称'],
  },
  {
    id: 'r4b-log-drops-setup',
    what: '变更记录 leaves out 首次设置\'s record',
    edits: [['src/proposals/changes.mjs', '  for (const [step, s] of Object.entries(setup)) {', '  for (const [step, s] of Object.entries({})) {']],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=变更记录'],
  },
  {
    id: 'r4b-prompts-builtin',
    what: 'the history\'s prompts count the built-in check items as the user\'s',
    edits: [['src/proposals/changes.mjs', ".filter((c) => isPlainObject(c) && c.origin !== 'streams')", '.filter((c) => isPlainObject(c))']],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=the name and the prompts'],
  },
  {
    id: 'r4b-tools-kept',
    what: 'a scoring step keeps a `tools` list stored in streams.json (the model could be given a tool)',
    edits: [['src/pipeline/config.mjs', "    for (const k of ['threshold', 'material', 'requirement']) if (stored[k] !== undefined) out[k] = stored[k];", "    for (const k of ['threshold', 'material', 'requirement', 'tools']) if (stored[k] !== undefined) out[k] = stored[k];"]],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=no tool'],
  },
  // redesign R5a (docs/checks/2026-11-12-r5a/contract.md 「测」: each 反向 named there, and a few more)
  {
    id: 'r5a-gap-threshold-3',
    what: 'rule ① needs 地址无效 three times in a row (not two)',
    edits: [['src/suggest/rules.mjs', 'export const SOURCE_GAP_ROUNDS = 2;', 'export const SOURCE_GAP_ROUNDS = 3;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ①'],
  },
  {
    id: 'r5a-free-text-counts',
    what: 'rule ⑤ counts a dismissal with words only (「其他原因…」) as a reason of its own',
    edits: [
      ['src/suggest/rules.mjs', "typeof ev.url !== 'string' || !DISMISS_QUICK.includes(ev.quick)) continue;", "typeof ev.url !== 'string' || (!DISMISS_QUICK.includes(ev.quick) && typeof ev.reason !== 'string')) continue;"],
      ['src/suggest/rules.mjs', "    out.push({ ts: typeof ev.ts === 'string' ? ev.ts : null, quick: ev.quick, url: ev.url });", "    out.push({ ts: typeof ev.ts === 'string' ? ev.ts : null, quick: ev.quick ?? ev.reason, url: ev.url });"],
    ],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ⑤'],
  },
  {
    id: 'r5a-target-custom',
    what: 'rule ②\'s target level needs both thresholds lower (a custom 0.7 / 0.6 gets 宽松, not 标准)',
    edits: [['src/suggest/act.mjs', '(L.relevance < r || L.substance < s)', '(L.relevance < r && L.substance < s)']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ②'],
  },
  {
    id: 'r5a-stale-acts',
    what: 'a 系统检测 that no longer fits (its source paused by hand) is still acted on',
    edits: [['src/suggest/act.mjs', '  if (reason) return { done: false, stale: reason,', '  if (false) return { done: false, stale: reason,']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=no longer fits is expired'],
  },
  {
    id: 'r5a-handoff-kind',
    what: 'the handing over to the main agent names the card\'s kind (an internal name)',
    edits: [['src/suggest/act.mjs', '  const what = suggestionText(s, { otherName, lang: l, thresholds });', '  const what = `${s.kind}: ${suggestionText(s, { otherName, lang: l, thresholds })}`;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=the handing over'],
  },
  {
    id: 'r5a-no-brief-in-prompt',
    what: 'the 相关度 prompt does not carry the library\'s 追踪要求',
    edits: [['src/pipeline/prompts.mjs', "  if (typeof brief === 'string' && brief.trim() !== '') lines.push(`${L.brief}${brief.trim()}`);", '']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a 追踪要求'],
  },
  {
    id: 'r5a-brief-not-in-cfg',
    what: 'the 追踪要求 is not part of the cfg (changing it is not a change of the 评分标准)',
    edits: [['src/pipeline/config.mjs', 'output: node?.output, brief });', 'output: node?.output });']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a 追踪要求'],
  },
  {
    id: 'r5a-auto-rescore',
    what: 'a verdict made under another 评分标准 is scored again by the next run (the old behaviour)',
    edits: [['src/pipeline/queue.mjs', "typeof scored.score === 'number' && !rescore) return", "typeof scored.score === 'number' && rescore === 'never') return"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=after 严格程度 changed'],
  },
  {
    id: 'r5a-rescore-no-cap',
    what: '重新评分 does not stop at the 单次运行上限',
    edits: [['src/pipeline/rescore.mjs', "    if (calls >= limit) { stoppedAt = 'cap'; return true; }", "    if (false) { stoppedAt = 'cap'; return true; }"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=only the old ones, under'],
  },
  {
    id: 'r5a-situation-old-word',
    what: 'the situation says 建议卡 again',
    edits: [['src/agent/situation.mjs', '  out.push(`未处理的系统检测：', '  out.push(`未处理的建议卡：']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a N11'],
  },
  {
    id: 'r5a-situation-state-code',
    what: 'the situation gives a source\'s state as its internal code (failed)',
    edits: [['src/agent/situation.mjs', ' · ${W.failed} ${st.failed} · ', ' · failed ${st.failed} · ']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a N11'],
  },
  {
    id: 'r5a-lookup-raw-message',
    what: 'a source_log lookup hands the model the fetcher\'s message and the HTTP code again',
    edits: [['src/agent/lookups.mjs', '...fetchFacts(e.status), count: e.count, new: e.new }));', '...fetchFacts(e.status), count: e.count, new: e.new, http: e.http, message: e.message }));']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a N11'],
  },
  {
    id: 'r5a-paused-checked',
    what: 'rule ① (and ③) also look at a paused source',
    edits: [['src/suggest/rules.mjs', "    if (s && typeof s.name === 'string' && s.name !== '' && s.paused !== true) out.add(s.name);", "    if (s && typeof s.name === 'string' && s.name !== '') out.add(s.name);"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ①'],
  },
  {
    id: 'r5a-loose-adjusts',
    what: 'rule ② offers 将严格程度调整为「宽松」 when the library is loose already',
    edits: [['src/suggest/act.mjs', "    if (L.relevance <= r && L.substance <= s && (L.relevance < r || L.substance < s)) return level;\n  }\n  return null;", "    if (L.relevance <= r && L.substance <= s && (L.relevance < r || L.substance < s)) return level;\n  }\n  return 'loose';"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ②'],
  },
  {
    id: 'r5a-reason-before-ignore',
    what: 'rule ⑤ after 忽略 still counts the dismissals from before it',
    edits: [['src/suggest/rules.mjs', '  if (!newest.every((d) => after(d.ts, since))) return [];\n', '']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a rule ⑤'],
  },
  {
    id: 'r5a-no-staleness',
    what: 'no card is ever found to no longer fit (no 过时 check: a paused source\'s card can still be acted on)',
    edits: [['src/suggest/act.mjs', '  if (!r.ok) return null; // an unreadable library', '  if (r.ok || !r.ok) return null; // an unreadable library']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=no longer fits is expired'],
  },
  {
    id: 'r5a-rescore-every-rejected',
    what: '重新评分 scores again every item of 未通过筛选, not only those judged under the old standard',
    edits: [['src/pipeline/rescore.mjs', '  const targets = listRejected(libraryDir, { limit: Number.MAX_SAFE_INTEGER, onlyOld: true })', '  const targets = listRejected(libraryDir, { limit: Number.MAX_SAFE_INTEGER, onlyOld: false })']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=only the old ones, under'],
  },
  {
    id: 'r5a-old-verdict-new-threshold',
    what: 'an old verdict is judged against the threshold of now (a loosened 严格程度 would move it out of 未通过筛选 without 重新评分)',
    // precheck fix 4: verdictThreshold no longer falls back to the threshold of now; the mutant puts it back the same way
    edits: [['src/pipeline/queue.mjs', "  if (typeof scored?.threshold === 'number') return scored.threshold;\n  return thresholdOfStamp(stamp, node);", '  return node.threshold;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=after 严格程度 changed'],
  },
  {
    id: 'r5a-turn-old-heading',
    what: 'the user\'s message reaches the model under the old heading 「## 这一轮」',
    edits: [['src/agent/turn.mjs', '  return `## 这条消息\\n${from}用户：${text}`;', '  return `## 这一轮\\n${from}用户：${text}`;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=what one turn sends'],
  },
  // redesign R5a, the two pre-checkers' findings (precheck fixes 2, 3, 4, 5, 7, 9)
  {
    id: 'r5a-legacy-now-threshold',
    what: 'an old verdict whose threshold cannot be worked out is judged against the threshold of now again (a loosened 严格程度 moves it out of 未通过筛选 and the next run calls the model)',
    edits: [['src/pipeline/queue.mjs', '  return later.some((id) => state?.scores?.[id] !== undefined || state?.unscored?.[id] !== undefined);', '  return scored.score >= node.threshold;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 4'],
  },
  {
    id: 'r5a-dropped-kind-in-note',
    what: 'the row of the proposals not made names their kinds and keeps the refusals\' own texts (the next message hands them to the model)',
    edits: [
      ['src/agent/turn.mjs', "    write('note', droppedSentence(dropped, lang), { dropped: dropped.map((d) => ({ index: d.index, category: d.category })) });", "    write('note', `有 ${dropped.length} 张提议没出：${dropped.map((d) => d.kind).join('、')}`, { dropped });"],
    ],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 2: a proposal not made'],
  },
  {
    id: 'r5a-connection-code-note',
    what: 'the row of a connection that failed says the internal code and keeps the connection\'s own text',
    edits: [['src/agent/turn.mjs', "    write('note', connectionSentence(code, lang), { error: code });", "    write('note', `连接出了问题（${code}），这条消息没有回答`, { error: code, detail: clip(r?.detail, 300) });"]],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 2: a proposal not made'],
  },
  {
    id: 'r5a-old-rows-as-they-are',
    what: 'rows written before the fix reach the model (and the page) as they are: kind names, codes, raw texts',
    edits: [['src/agent/turn.mjs', "  if (!r || r.role !== 'note' || !isObject(r.data)) return r;", '  return r;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 2: rows written before'],
  },
  {
    id: 'r5a-lookup-problem-codes',
    what: 'the lookup library gives the problems as internal codes (missing · sources · no-output) again',
    edits: [['src/agent/lookups.mjs', '        problems: facts.problems.map((p) => PROBLEM_WORDS[p] ?? p), noOutputStreak', '        problems: facts.problems, noOutputStreak']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 5'],
  },
  {
    id: 'r5a-case-change-kept',
    what: 'rule ①\'s card stays when the source turns to the other case (a 暂时失败 card left open while the address is invalid)',
    edits: [['src/suggest/act.mjs', "        if (now !== null && now !== was) return 'state-changed';\n", '']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 7'],
  },
  {
    id: 'r5a-replaced-counts-as-handling',
    what: 'a card that gave way because its case changed counts as a handling (the card that fits now never comes)',
    edits: [['src/suggest/records.mjs', "    const replaced = line.ev === 'expired' && REPLACED_REASONS.includes(line.reason);", '    const replaced = false;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 7'],
  },
  {
    id: 'r5a-partial-not-counted',
    what: '重新评分 stopped in the middle of an item does not count it (counts all 0 while calls were spent)',
    edits: [['src/pipeline/rescore.mjs', '      if (stopNow()) { if (touched) counts.partial += 1; break outer; }', '      if (stopNow()) break outer;']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 9'],
  },
  {
    id: 'r5a-overlap-ignores-handling',
    what: 'rule ④ for the other library ignores that library\'s own handlings (a card it dismissed comes back)',
    edits: [['src/suggest/rules.mjs', '  return topicOverlap(r.config, otherLibraries, handledTimes(libraryDir)).map(asCard(clockOf(now).toISOString()));', '  return topicOverlap(r.config, otherLibraries, new Map()).map(asCard(clockOf(now).toISOString()));']],
    test: ['test/r5a.test.mjs', '--test-name-pattern=R5a precheck fix 3'],
  },
  // redesign R6d-4 (docs/checks/2026-11-15-r6d/contract.md 「三处应用小问题」): the two fixes in the core, each put back
  {
    id: 'r6d-core-collected-utc',
    what: 'a note\'s collected is the UTC day of the first-seen instant again (an Eastern-time evening: collected one day after kept)',
    edits: [['src/pipeline/decide.mjs', '    collected: collectedDay(state.firstSeen, now),', "    collected: typeof state.firstSeen === 'string' ? state.firstSeen.slice(0, 10) : localIsoDate(now()),"]],
    test: ['test/r6d.test.mjs', '--test-name-pattern=R6d-4 collected'],
  },
  {
    id: 'r6d-core-fallback-topic-unknown',
    what: 'validateNote does not know the core\'s own fallback topic again (a note kept in a library without topics carries unknown-topic:未分类)',
    edits: [['src/library/validate.mjs', '    const topics = new Set([...topicNames(config), ...Object.values(FALLBACK_TOPIC)]);', '    const topics = new Set(topicNames(config));']],
    test: ['test/r6d.test.mjs', '--test-name-pattern=R6d-4 fallback topic'],
  },
  {
    id: 'r6d-core-fallback-topic-zh-only',
    what: 'validateNote knows the fallback topic under its Chinese name only (uncategorized still warns)',
    edits: [['src/library/validate.mjs', '    const topics = new Set([...topicNames(config), ...Object.values(FALLBACK_TOPIC)]);', "    const topics = new Set([...topicNames(config), FALLBACK_TOPIC['zh-CN']]);"]],
    test: ['test/r6d.test.mjs', '--test-name-pattern=R6d-4 validateNote'],
  },
  {
    id: 'r6d-core-fallback-topic-all-known',
    what: 'validateNote takes every topic of the note as known (no unknown-topic warning at all any more)',
    edits: [['src/library/validate.mjs', '    const topics = new Set([...topicNames(config), ...Object.values(FALLBACK_TOPIC)]);', '    const topics = new Set([...topicNames(config), ...Object.values(FALLBACK_TOPIC), ...meta.topics]);']],
    test: ['test/r6d.test.mjs', '--test-name-pattern=R6d-4 validateNote'],
  },
  // 1.0.1 (docs/checks/2026-11-17-1.0.1/contract.md): each of the core's fixes put back the way it was (test/v101.test.mjs)
  {
    id: 'v101-f1-whole-sources',
    what: 'F1: a source card\'s baseHash covers the whole sources list again (one source card confirmed, every other one of the library stale)',
    edits: [['src/proposals/proposals.mjs', "  if (name !== null) return hashOf({ source: name, value: snapshot(libraryDir, ['sources']).sources.find((s) => s.name === name) ?? null });\n", '']],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F1: three add_source cards'],
  },
  {
    id: 'v101-f1-ignore-source',
    what: 'F1: a source card\'s baseHash covers nothing of its source (two cards about the same source both go through)',
    edits: [['src/proposals/proposals.mjs', "  if (name !== null) return hashOf({ source: name, value: snapshot(libraryDir, ['sources']).sources.find((s) => s.name === name) ?? null });\n", "  if (name !== null) return hashOf({ source: name });\n"]],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F1: two cards about the SAME source'],
  },
  {
    id: 'v101-f3-no-language',
    what: 'F3: the situation does not say the interface\'s language again',
    edits: [['src/agent/situation.mjs', '`# 局面（${clock.toISOString()}）`, languageLine(language), ', '`# 局面（${clock.toISOString()}）`, ']],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F3: the situation says'],
  },
  {
    id: 'v101-f3-rule5',
    what: 'F3: rule 5 is the one of before 1.0.1 again (the why follows the user\'s message, not the interface)',
    edits: [['src/agent/protocol.mjs', ` Write each proposal\\'s "why" in the interface\\'s language the situation gives (界面语言), unless the user has said plainly which language they want the proposals in: then in that language.',`, `',`]],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F3: the rules'],
  },
  {
    id: 'v101-f3-turn-language',
    what: 'F3: agentTurn does not hand the interface\'s language to the situation (the desktop\'s locale is lost on the way)',
    edits: [['src/agent/turn.mjs', 'agentUsageFile: paths.usage, language: ctx.language, connection,', 'agentUsageFile: paths.usage, connection,']],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F3 · F5: agentTurn'],
  },
  {
    id: 'v101-f4-rule-last',
    what: 'F4: the rules\' last sentence does not say when the test fetch is done again (it is the sentence of before 1.0.1)',
    edits: [['src/agent/protocol.mjs', /\n  'Streams tries each new source once when the proposal is made[^\n]*/, '']],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F4: the rules'],
  },
  {
    id: 'v101-f5-no-connection',
    what: 'F5: the situation does not say the connection and its two model slots again',
    edits: [['src/agent/situation.mjs', "languageLine(language), connectionLines(connection).join('\\n'), ", 'languageLine(language), ']],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F5: the situation says'],
  },
  {
    id: 'v101-f5-key-leak',
    what: 'F5: the situation copies the whole connection object it is given (a key beside it goes to the model)',
    edits: [['src/agent/situation.mjs', "languageLine(language), connectionLines(connection).join('\\n'), ", "languageLine(language), connectionLines(connection).join('\\n') + JSON.stringify(connection ?? null), "]],
    test: ['test/v101.test.mjs', '--test-name-pattern=v101 F5 \\(the other way\\)'],
  },
  // 1.1 W1 (骨架; docs/checks/2026-11-20-1.1/contract-draft.md): every check of the definition, the actions, the record
  // and the SOPs taken out one at a time
  {
    id: 'w1-check-name',
    what: 'B2: an action not in the definition is let through (and done if there is a handler for it)',
    edits: [['src/actions/actions.mjs', "if (!def) return { ok: false, errors: [`\"${request.action}\" is not an action of the definition`] };", "if (!def) return { ok: true, errors: [], def: { actors: [actor], params: { type: 'object' }, confirm: false } };"]],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^check · an action not in the definition|^list-from-file'],
  },
  {
    id: 'w1-check-actor',
    what: 'B2: who may do an action is not checked',
    edits: [['src/actions/actions.mjs', "  if (!def.actors.includes(actor)) return { ok: false, errors: [`\"${actor}\" may not do \"${request.action}\"`] };\n", '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^check · an action this actor may not do'],
  },
  {
    id: 'w1-check-params',
    what: 'B2: an action\'s params are not checked against its schema',
    edits: [['src/actions/actions.mjs', "const errors = validate(def.params, request.params ?? {}, 'params');", 'const errors = [];']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^check · params that do not fit'],
  },
  {
    id: 'w1-check-tool',
    what: 'B2: a tool is accepted as something handed in',
    edits: [['src/actions/actions.mjs', "  if (def.tool && typeof handlers[request.action] !== 'function') return { ok: false, errors: [`\"${request.action}\" is a tool used during the run, not something to hand in`] };\n", '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^check · a tool'],
  },
  {
    id: 'w1-confirm-skipped',
    what: 'B3: an action that waits for the user is done at once',
    edits: [['src/actions/actions.mjs', 'if (c.def.confirm) {', 'if (false) {']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^confirm · a held action changes nothing|^confirm · rejected'],
  },
  {
    id: 'w1-confirm-no-recheck',
    what: 'B3: a held action is done when confirmed without being checked again',
    edits: [['src/actions/actions.mjs', "      if (!c.ok) { unlinkSync(p); return { status: 'rejected', errors: c.errors }; }\n", '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^confirm · a held action is checked again'],
  },
  {
    id: 'w1-log-off',
    what: 'B4: an action done is not recorded',
    edits: [['src/actions/actions.mjs', 'const line = appendActionLog(logFile(action, params, result), ', 'const line = ((file, entry) => entry)(logFile(action, params, result), ']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^log · five kinds|^confirm · a held action changes nothing'],
  },
  {
    id: 'w1-log-unchecked-object',
    what: 'B4: a handler that does not say what it changed counts as done',
    edits: [['src/actions/actions.mjs', "    if (!isObj(result?.object) || typeof result.object.type !== 'string') return { status: 'failed', errors: [`the handler of \"${action}\" did not say which object it changed`] };\n", '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^log · an action whose handler fails'],
  },
  {
    id: 'w1-list-fixed',
    what: 'C3: the list an agent is given is the shipped file\'s, whatever definition is passed (as if written into the code)',
    edits: [['src/actions/definition.mjs', '  return Object.entries(definition.actions)\n', "  return Object.entries(JSON.parse(readFileSync(DEFINITION_PATH, 'utf8')).actions)\n"]],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^list-from-file'],
  },
  {
    id: 'w1-def-unchecked',
    what: 'the definition file is loaded without being checked',
    edits: [['src/actions/definition.mjs', '  const errors = checkDefinition(d);\n', '  const errors = [];\n']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^definition · a broken file'],
  },
  {
    id: 'w1-def-ghost-actor',
    what: 'an action\'s actors are not checked against the definition\'s actors',
    edits: [['src/actions/definition.mjs', "else for (const who of a.actors) if (!Object.hasOwn(d.actors, who)) errors.push(`${at}.actors: \"${who}\" is not an actor of the definition`);", 'else {}']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^definition · a broken file'],
  },
  {
    id: 'w1-sop-missing-silent',
    what: 'C2: a missing SOP is read as an empty one, silently',
    edits: [['src/sop/sop.mjs', "if (!existsSync(path)) throw new StreamsError('sop-missing', `the ${name} SOP is missing (${path})`);", "if (!existsSync(path)) return '';"]],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^sop · a missing or empty SOP'],
  },
  {
    id: 'w1-sop-empty-silent',
    what: 'C2: an empty SOP is accepted',
    edits: [['src/sop/sop.mjs', "if (text.trim() === '') throw", 'if (false) throw']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^sop · a missing or empty SOP'],
  },
  {
    id: 'w1-sop-unfilled-silent',
    what: 'C2: a placeholder left without a value is sent as it is',
    edits: [['src/sop/sop.mjs', '  if (missing.size) throw', '  if (false) throw']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^sop · filled with'],
  },
  {
    id: 'w1-sop-not-from-file',
    what: 'C2: the SOP given is always the shipped one, whatever folder is named (a change to the file is not followed)',
    edits: [['src/sop/sop.mjs', "  const text = readFileSync(path, 'utf8');", "  const text = readFileSync(join(SOP_DIR, `${name}.md`), 'utf8');"]],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^sop · a rule changed in the file'],
  },
  {
    id: 'w1-startup-ignores-sops',
    what: 'C2: the start-up check does not look at the SOPs',
    edits: [['src/actions/startup.mjs', '  problems.push(...checkSops({ dir: sopDir }).problems);\n', '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^sop · a missing or empty SOP'],
  },
  {
    id: 'w1-startup-ignores-definition',
    what: 'C3: the start-up check does not look at the definition file',
    edits: [['src/actions/startup.mjs', '    loadDefinition({ path: definitionPath });\n', '']],
    test: ['test/actions-w1.test.mjs', '--test-name-pattern=^startup · a broken definition'],
  },
  // 1.1 W2 (读网页和原文): each rule of reading a page, keeping its original and a source's state, taken out one at a time
  {
    id: 'w2-no-render',
    what: 'B5: the second way (rendering) is never tried',
    edits: [['src/read/read-page.mjs', "    if (typeof render !== 'function') return fail(refused ? 'blocked' : 'no-article', out.message);", "    return fail(refused ? 'blocked' : 'no-article', out.message);"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^tiers · a page whose text a script writes|^tiers · a page that refuses'],
  },
  {
    id: 'w2-403-reported-at-once',
    what: 'B8: a refusal (403) is reported without trying the other way first',
    edits: [['src/read/read-page.mjs', '      if (REFUSED_HTTP.includes(d.status)) {\n', "      if (REFUSED_HTTP.includes(d.status)) {\n        return fail('blocked', `HTTP ${d.status}: refused`);\n"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^states · six states|^tiers · a page that refuses'],
  },
  {
    id: 'w2-no-human-check',
    what: 'a human check is not recognised (it would be rendered, and read as a page)',
    edits: [['src/read/detect.mjs', "  return CHECK.test(String(html ?? ''));", '  return false;']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^guards · a human check'],
  },
  {
    id: 'w2-no-sign-in',
    what: 'B8: a sign-in page is not recognised',
    edits: [['src/read/detect.mjs', "export function signInPage(html, url = '') {\n", "export function signInPage(html, url = '') {\n  return false;\n"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^guards · a sign-in page'],
  },
  {
    id: 'w2-no-error-page',
    what: 'an error page once rendered is taken as read (pretest 2: weibo.com\'s 404 page)',
    edits: [['src/read/detect.mjs', '  return ERROR_TITLE.test(t) || ERROR_TITLE.test(body.slice(0, 200));', '  return false;']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^dead · an error page'],
  },
  {
    id: 'w2-404-not-dead',
    what: '404 / 410 are not a dead address (they become a temporary failure)',
    edits: [['src/read/read-page.mjs', '      if (DEAD_HTTP.includes(d.status)) return fail(\'dead\', `HTTP ${d.status}`);\n', '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^dead · 404 and 410'],
  },
  {
    id: 'w2-own-ua-gone',
    what: 'the direct way does not say it is Streams (no User-Agent of its own)',
    edits: [['src/read/read-page.mjs', "headers: { 'user-agent': userAgent, accept: ACCEPT_PAGE }", 'headers: { accept: ACCEPT_PAGE }']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^guards · both ways read as Streams'],
  },
  {
    id: 'w2-no-gap-per-site',
    what: 'one site is read again at once (no wait between two reads)',
    edits: [['src/read/read-page.mjs', '      if (wait > 0) await sleep(wait);\n', '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^guards · both ways read as Streams'],
  },
  {
    id: 'w2-empty-original-written',
    what: 'B6: an unreadable page gets an (empty) original file',
    edits: [['src/read/original.mjs', "  if (typeof text !== 'string' || text.trim() === '') throw new StreamsError('bad-argument', 'an original needs text: a page that could not be read has no original (originalFor)');\n", "  if (typeof text !== 'string') text = '';\n"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^original · a page that could not be read'],
  },
  {
    id: 'w2-dismissed-at-once',
    what: 'B7: a dismissed item loses its original at once, not after 7 days',
    edits: [['src/read/original.mjs', 't - since >= RETAIN_DISMISSED_DAYS * DAY_MS', 't - since >= 0']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^retention'],
  },
  {
    id: 'w2-kept-cleaned',
    what: 'B7: a kept item\'s original is cleaned too',
    edits: [['src/read/original.mjs', "    if (s?.stage === 'dismissed' && ", "    if ((s?.stage === 'dismissed' || s?.stage === 'kept') && "]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^retention'],
  },
  {
    id: 'w2-originals-scanned',
    what: 'an imported library takes _originals for a folder of the user\'s own',
    edits: [['src/library/scan.mjs', "const NOT_SCANNED = new Set(['_pipeline', '_originals', '_card', '_state']);", "const NOT_SCANNED = new Set(['_pipeline', '_card', '_state']);"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^original · an imported library'],
  },
  {
    id: 'w2-login-as-blocked',
    what: 'B8: a sign-in page is reported as 访问被拒, not 要登录',
    edits: [['src/read/source-state.mjs', "check: 'blocked', login: 'login',", "check: 'blocked', login: 'blocked',"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^states · six states'],
  },
  {
    id: 'w2-401-not-login',
    what: 'B8: a 401 is a wrong address again (as in 1.0)',
    edits: [['src/fetch/states.mjs', '  if (s === 401) return out(\'login\', `HTTP ${s}: the site asks to sign in`);\n', '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^states · a feed address'],
  },
  {
    id: 'w2-feed-sign-in-gap',
    what: 'B8: a sign-in page where a feed should be is a wrong address again',
    edits: [['src/fetch/sources/rss.mjs', "  if (!parsed.ok && signInPage(doc.text, url)) return result('login', 'the address shows a sign-in page, not a feed', { http: doc.http });\n", '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^states · a feed address'],
  },
  {
    id: 'w2-no-contact-trim',
    what: 'the contact details at the top of an article stay in its original',
    edits: [['src/read/extract.mjs', '  while (start < Math.min(LEAD_MAX, ps.length - 1) && isContact(ps[start])) start++;\n', '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^extract · contact details'],
  },
  {
    id: 'w2-no-closing-trim',
    what: 'short closing lines that only point elsewhere (a newsletter, customer service) stay in the original',
    edits: [['src/read/extract.mjs', '  while (end - 1 > start && Array.from(ps[end - 1]).length <= TAIL_SHORT && (TAIL_ANY.test(ps[end - 1]) || isContact(ps[end - 1]))) end--;\n', '']],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^extract · short closing lines'],
  },
  {
    id: 'w2-whole-page-original',
    what: 'a page that only gives its whole text (a menu) is taken for an original',
    edits: [['src/read/extract.mjs', "  return { text: '', paragraphs: [], way: 'none', title };", "  return { text: stripHtml(raw), paragraphs: [stripHtml(raw)], way: 'paragraphs', title };"]],
    test: ['test/read-w2.test.mjs', '--test-name-pattern=^extract · a page that only gives its whole text'],
  },
  // 1.1 W3 (docs/checks/2026-11-20-1.1/w3/scorecard.json): a summary checked against the original kept in the library
  {
    id: 'w3-quote-always-found',
    what: 'a point\'s sentence counts as found whether or not it is in the original',
    edits: [['src/verify/rules.mjs', '        if (!locateQuote(text, quote)) bad.push(', '        if (false) bad.push(']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^quotes: a made-up sentence'],
  },
  {
    id: 'w3-quote-from-handed-back',
    what: 'the sentence is looked for in the material handed to the check, not in the original kept in the library',
    edits: [['src/verify/rules.mjs', "      const text = typeof original?.text === 'string' ? original.text : source;", '      const text = source;']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^quotes: what is checked is the original'],
  },
  {
    id: 'w3-quote-any-length',
    what: 'a sentence of any length counts (two characters of the original would do)',
    edits: [['src/verify/original-check.mjs', 'export const QUOTE_MIN_CHARS = 6;', 'export const QUOTE_MIN_CHARS = 1;']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^quotes: a sentence shorter than'],
  },
  {
    id: 'w3-spacing-matters',
    what: 'the spacing of the sentence must be the original\'s exactly (a summary that writes 10月 for 10 月 is sent back)',
    edits: [['src/verify/original-check.mjs', "    .replace(DROP, '');", ';']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^quotes: spacing'],
  },
  {
    id: 'w3-numbers-always-found',
    what: 'every number of the summary counts as in the original',
    edits: [['src/verify/original-check.mjs', '    const found = have.some((o) => o.value === n.value && (n.unit === \'\' || o.unit === n.unit));', '    const found = true;']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^numbers: a number the original does not have'],
  },
  {
    id: 'w3-numbers-no-unit',
    what: 'the unit of a number is not compared (1.2 万 written as 1.2 亿 passes)',
    edits: [['src/verify/original-check.mjs', "(n.unit === '' || o.unit === n.unit)", 'true']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^numbers: a number the original does not have'],
  },
  {
    id: 'w3-numbers-not-title',
    what: 'the title of the original is left out of the number check',
    edits: [['src/verify/rules.mjs', "[original.title ?? '', original.text].join('\\n')", 'original.text']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^numbers: the same number written another way'],
  },
  {
    id: 'w3-anchor-off-by-one',
    what: 'the place of a point in the original starts one character late',
    edits: [['src/verify/original-check.mjs', '  const start = t.from[at];', '  const start = t.from[at] + 1;']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^anchors: each point that passed'],
  },
  {
    id: 'w3-points-not-lines',
    what: 'the card\'s points are the { text, quote } objects, not the plain lines the 待看 card shows',
    edits: [['src/verify/summary.mjs', "    points: points.map((p) => (typeof p === 'string' ? p : isObj(p) && typeof p.text === 'string' ? p.text : '')),", '    points,']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^anchors: each point that passed'],
  },
  {
    id: 'w3-failed-not-in-inbox',
    what: 'an item that did not pass after its rounds is kept out of 待看 (it would disappear)',
    edits: [['src/update/inbox.mjs', "  if (!checked || checked.status !== 'checked') throw", "  if (!checked || checked.status !== 'checked' || !checked.verification.passed) throw"]],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^twice: two rounds that fail'],
  },
  {
    id: 'w3-feedback-everything',
    what: 'the second round gets back every item, not only the ones that failed',
    edits: [['src/verify/verify.mjs', '    feedback = { failed: last.items.filter((it) => !it.passed).map(', '    feedback = { failed: last.items.map(']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^twice: two rounds that fail'],
  },
  {
    id: 'w3-summary-without-original',
    what: 'a summary is asked for although no original was kept',
    edits: [['src/verify/summary.mjs', "  if (!stored || stored.text.trim() === '') return { status: 'no-original'", "  if (false) return { status: 'no-original'"], ['src/verify/summary.mjs', '  const original = { text: stored.text, title: stored.title };', "  const original = { text: stored?.text ?? '', title: stored?.title ?? '' };"], ['src/verify/summary.mjs', '  const source = stored.text.length > judgeMaxChars ? stored.text.slice(0, judgeMaxChars) : stored.text;', '  const source = original.text;']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^no original'],
  },
  {
    id: 'w3-judge-on-failed-rules',
    what: 'the judge is called although a rule failed',
    edits: [['src/verify/verify.mjs', '  if (rulesPassed && judgeList.length > 0) {', '  if (judgeList.length > 0) {']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^judge: only when the rules pass'],
  },
  // 1.1 W4 (docs/checks/2026-11-20-1.1/w4/scorecard.json): building a library
  {
    id: 'w4-six-questions',
    what: 'a 6th question is shown',
    edits: [['src/build/questions.mjs', 'Object.freeze({ questions: 5, options: 4, inputs: 2, minOptions: 2 })', 'Object.freeze({ questions: 6, options: 4, inputs: 2, minOptions: 2 })']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^questions: a 6th question'],
  },
  {
    id: 'w4-first-with-options',
    what: 'the first question may come with options',
    edits: [['src/build/questions.mjs', "    if (n === 1) problems.push('first-not-input');\n", '']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^questions: a 6th question'],
  },
  {
    id: 'w4-five-options',
    what: 'a choice question may have 5 options',
    edits: [['src/build/questions.mjs', 'if (options.length > QUESTION_LIMITS.options)', 'if (options.length > QUESTION_LIMITS.options + 1)']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^questions: a 6th question'],
  },
  {
    id: 'w4-three-inputs',
    what: 'a 3rd question with no options is shown',
    edits: [['src/build/questions.mjs', 'if (inputs > QUESTION_LIMITS.inputs)', 'if (inputs > QUESTION_LIMITS.inputs + 1)']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^questions: a 6th question'],
  },
  {
    id: 'w4-no-unreadable-part',
    what: 'a card without 读不到的来源 can be confirmed',
    edits: [['src/build/card.mjs', "    else if (part === 'unreadable') ok = Array.isArray(v);", "    else if (part === 'unreadable') ok = true;"]],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^card: without'],
  },
  {
    id: 'w4-six-lines',
    what: 'the definition is checked for six lines, not the 语言 line',
    edits: [['src/build/card.mjs', "export const DEFINITION_LINES = Object.freeze(['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'language', 'hard']);", "export const DEFINITION_LINES = Object.freeze(['purpose', 'scope', 'exclude', 'trust', 'rhythm', 'hard']);"]],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^card: without'],
  },
  {
    id: 'w4-urls-last-turn-only',
    what: 'only the last turn\'s reads count for the card\'s addresses',
    edits: [['src/build/conversation.mjs', '    for (const x of r.reads ?? []) s.reads.push({ url: x.url, ok: x.ok !== false, turn });', '    s.reads = (r.reads ?? []).map((x) => ({ url: x.url, ok: x.ok !== false, turn }));']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^urls: every address'],
  },
  {
    id: 'w4-urls-not-checked',
    what: 'the card\'s addresses are not checked against what was read',
    edits: [['src/build/card.mjs', '    for (const url of cardUrls(card)) if (!read.has(urlKey(url))) problems.push', '    for (const url of []) if (!read.has(urlKey(url))) problems.push']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^urls: every address'],
  },
  {
    id: 'w4-library-at-once',
    what: 'the library is made when the card is handed in, not when the user confirms',
    edits: [['src/ontology/streams.json', '"names": { "zh": "建库", "en": "Create the library" },\n      "class": 1, "object": "library", "actors": ["main_agent"], "confirm": true,', '"names": { "zh": "建库", "en": "Create the library" },\n      "class": 1, "object": "library", "actors": ["main_agent"], "confirm": false,']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^confirm: the card waits'],
  },
  {
    id: 'w4-claude-more-tools',
    what: 'Claude Code builds with one more tool than the two web tools',
    edits: [['src/connect/session.mjs', "export const WEB_TOOLS = Object.freeze(['WebSearch', 'WebFetch']);", "export const WEB_TOOLS = Object.freeze(['WebSearch', 'WebFetch', 'Bash']);"]],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^connection: Claude Code builds'],
  },
  {
    id: 'w4-codex-no-search-on-resume',
    what: 'a Codex resume goes without --search (the build would lose the web after the first turn)',
    edits: [['src/connect/session.mjs', "  const argv = [...(web ? [CODEX_SEARCH_FLAG] : []), ...CODEX_RESUME_ARGS];", '  const argv = [...CODEX_RESUME_ARGS];']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^connection: Codex builds'],
  },
  {
    id: 'w4-codex-views-not-read',
    what: 'the pages Codex viewed without an open_page action are not counted as read (every card of a Codex build would fail)',
    edits: [['src/connect/session.mjs', '    for (const res of Array.isArray(item.results) ? item.results : []) if (CODEX_VIEW.test(String(res?.ref_id ?? \'\'))) read(res.url);\n', '']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^urls: what was read comes from'],
  },
  {
    id: 'w4-codex-search-results-read',
    what: 'Codex\'s search results count as pages read',
    edits: [['src/connect/session.mjs', 'const CODEX_VIEW = /^turn\\d+view\\d+$/;', 'const CODEX_VIEW = /^turn\\d+(view|search)\\d+$/;']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^urls: what was read comes from'],
  },
  // 1.1 W5 (docs/checks/2026-11-20-1.1/w5/scorecard.json): updating a library
  {
    id: 'w5-seen-not-kept',
    what: 'the links seen on a source are not kept in the state (every link is new every time)',
    edits: [['src/update/run.mjs', '      entry.seen = [...(prev?.seen ?? []), ...r.links.filter((l) => !seen.has(l))];', '      entry.seen = [];']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^new links'],
  },
  {
    id: 'w5-agent-for-nothing',
    what: 'the agent runs although no source has a new link and nothing is carried or due',
    edits: [['src/update/run.mjs', '  if (originals.length === 0 && missing.length === 0 && !sweepDue) {', '  if (false) {']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^nothing new, twice'],
  },
  {
    id: 'w5-no-repeat-check',
    what: 'an item already in the library goes to 待看 again',
    edits: [['src/update/run.mjs', 'if (knownUrls.some((k) => sameUrl(k, url)) || ready.some((x) => sameUrl(x.url, url)))', 'if (ready.some((x) => sameUrl(x.url, url)))']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^items: one already'],
  },
  {
    id: 'w5-source-not-read-ok',
    what: 'an item from a page neither handed to the agent nor opened by it is taken',
    edits: [['src/update/run.mjs', "      if (!handed && !opened) { out.dropped.push({ url, why: 'not-read' }); continue; }", '']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^items: one already'],
  },
  {
    id: 'w5-missing-not-in-inbox',
    what: 'an item whose page cannot be read is left out of 待看 instead of going in with 「原文没存下来」',
    edits: [['src/update/run.mjs', "        else { putMissingInInbox(libraryDir, { item, reason: page.reason ?? 'no-article', round: id, now }); out.missing.push(key); continue; }", '        else { out.missing.push(key); continue; }']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^items: one already'],
  },
  {
    id: 'w5-budget-ignored',
    what: 'every source is read whatever the budget',
    edits: [['src/update/run.mjs', '  const toRead = order.slice(0, budget.sources);\n  const unfinished = order.slice(budget.sources);', '  const toRead = order;\n  const unfinished = [];']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^budget'],
  },
  {
    id: 'w5-unfinished-not-first',
    what: 'the sources left unread last time are not read first',
    edits: [['src/update/run.mjs', '  const order = [...state.unfinished.filter((u) => cardUrls.includes(u)), ...cardUrls.filter((u) => !state.unfinished.includes(u))];', '  const order = cardUrls;']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^budget'],
  },
  {
    id: 'w5-bad-format-no-retry',
    what: 'a reply that cannot be read is not asked for once more',
    edits: [['src/update/run.mjs', "  if (!isObj(answer) || !Array.isArray(answer.items)) {\n    r = await send(", "  if (false) {\n    r = await send("]],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^bad format twice'],
  },
  {
    id: 'w5-bad-format-originals-dropped',
    what: 'after two unreadable replies the originals are not given to the next update',
    edits: [['src/update/run.mjs', "    carryAll();\n    return finish('summary-not-written', { calls });", "    return finish('summary-not-written', { calls });"]],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^bad format twice'],
  },
  {
    id: 'w5-login-starts',
    what: 'an update starts although the connection says the login ran out',
    edits: [['src/update/run.mjs', "    if (d && (d.loggedIn === false || d.code === 'login-expired' || d.code === 'not-logged-in'))", '    if (false)']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^login expired: not started'],
  },
  {
    id: 'w5-ai-text-not-marked',
    what: 'words for an AI in a page are not marked on the item',
    edits: [['src/update/run.mjs', "aiInstruction: ai.hit ? { source: 'rule', matches: ai.matches } : null", 'aiInstruction: null']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^words for an AI'],
  },
  {
    id: 'w5-failed-not-sent-back',
    what: 'the items whose check failed are not sent back to the agent',
    edits: [['src/update/run.mjs', '    if (failed.length) {', '    if (false) {']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^one run'],
  },
  {
    id: 'w5-feedback-no-original',
    what: 'an item sent back after its check failed goes without the original Streams kept',
    edits: [['src/update/run.mjs', '\\n流息存下的原文（原话从这里抄）：\\n${x.text.length > FEEDBACK_TEXT_CHARS ? `${x.text.slice(0, FEEDBACK_TEXT_CHARS)}……` : x.text}`', '`']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^one run'],
  },
  {
    id: 'w5-no-sweep',
    what: 'the agent never reads the sources itself again (only the first update)',
    edits: [['src/update/run.mjs', '  const sweepDue = !state.lastAgentAt || now().getTime() - Date.parse(state.lastAgentAt) >= sweepDays * DAY_MS;', '  const sweepDue = !state.lastAgentAt;']],
    test: ['test/update-w5.test.mjs', '--test-name-pattern=^the card'],
  },
  // 1.1 W6a (docs/checks/2026-11-20-1.1/w6a/scorecard.json): what the interface is given
  {
    id: 'w6a-no-opening',
    what: 'a 待看 item carries no opening of its kept original',
    edits: [['src/pipeline/inbox.mjs', '        card.opening = openingOf(o.text);\n', '']],
    test: ['test/w6a.test.mjs', '--test-name-pattern=^A3'],
  },
  {
    id: 'w6a-pdf-as-read',
    what: 'a source whose pages are only PDFs reads as 「读得到」',
    edits: [['src/update/sources.mjs', "  if ((p.pdf ?? 0) > 0) return 'pdf';", "  if ((p.pdf ?? 0) > 0) return 'read';"]],
    test: ['test/w6a.test.mjs', '--test-name-pattern=^A5'],
  },
  {
    id: 'w6a-source-at-once',
    what: 'a source the user adds is written into the card at once, before 确认',
    edits: [['src/ontology/streams.json', '"class": 2, "object": "source", "actors": ["main_agent", "user"], "confirm": true,\n      "about": "Add a source', '"class": 2, "object": "source", "actors": ["main_agent", "user"], "confirm": false,\n      "about": "Add a source']],
    test: ['test/w6a.test.mjs', '--test-name-pattern=^B3'],
  },
  {
    id: 'w6a-url-and-query',
    what: 'a card source may have both a web address and a search word',
    edits: [['src/build/card.mjs', '        && ((isWeb(e.url) && !filled(e.query)) || (filled(e.query) && (e.url === undefined || e.url === \'\')));', '        && (isWeb(e.url) || filled(e.query));']],
    test: ['test/w6a.test.mjs', '--test-name-pattern=^a card source'],
  },
  {
    id: 'w4-proposal-no-definition',
    what: 'a proposal card is made for an action the definition does not have',
    edits: [['src/build/proposals.mjs', '    if (!def || def.confirm !== true) continue;', "    if (def && def.confirm !== true) continue;"]],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^proposals: names come'],
  },
  {
    id: 'w4-other-tool-ok',
    what: 'a build goes on when the agent used another tool',
    edits: [['src/build/conversation.mjs', "    if ((r.otherTools ?? []).length) { s.status = 'stopped'; return { kind: 'stopped', notice: 'other-tool' }; }\n    let a = interpret(r);", '    let a = interpret(r);']],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^a build stops'],
  },
  {
    id: 'w4-sop-place-not-required',
    what: 'a build SOP without the place of the answer format is sent anyway',
    edits: [['src/build/conversation.mjs', "export const BUILD_SOP_PLACES = Object.freeze(['TODAY', 'TOOLS', 'BUDGET', 'ACTIONS', 'OUTPUT']);", "export const BUILD_SOP_PLACES = Object.freeze(['TODAY', 'TOOLS', 'BUDGET', 'ACTIONS']);"]],
    test: ['test/build-w4.test.mjs', '--test-name-pattern=^sop: a rule changed'],
  },
];

function runTest(dir, [file, ...opts]) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...opts, file], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  const passed = [...r.stdout.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { status: r.status, failed, passed, tail: `${r.stdout}${r.stderr}`.split('\n').slice(-25).join('\n') };
}

// an argument is a mutant's id, or a prefix ending in * (e.g. r4b-*: every mutant of package R4b)
const only = process.argv.slice(2);
const picks = (arg, id) => (arg.endsWith('*') ? id.startsWith(arg.slice(0, -1)) : id === arg);
const chosen = MUTANTS.filter((m) => only.length === 0 || only.some((arg) => picks(arg, m.id)));
if (only.some((arg) => !MUTANTS.some((m) => picks(arg, m.id)))) { process.stderr.write(`ids: ${MUTANTS.map((m) => m.id).join(', ')}\n`); process.exit(2); }
const targets = [...new Set(chosen.flatMap((m) => m.edits.map((e) => e[0])))];
const hashes = () => Object.fromEntries(targets.map((f) => [f, createHash('sha256').update(readFileSync(join(CORE, f))).digest('hex')]));
const before = hashes();
const results = [];
for (const m of chosen) {
  const root = join(tmpdir(), `st-core-mutant-${m.id}-${randomBytes(4).toString('hex')}`);
  mkdirSync(root);
  try {
    const copy = join(root, 'core');
    cpSync(CORE, copy, { recursive: true });
    const control = runTest(copy, m.test);
    for (const [file, from, to] of m.edits) {
      const path = join(copy, file);
      const text = readFileSync(path, 'utf8');
      if (text.split(from).length !== 2) throw new Error(`${m.id}: the text is not in ${file} exactly once`);
      writeFileSync(path, text.replace(from, () => to));
    }
    const broken = runTest(copy, m.test);
    const caught = control.status === 0 && control.passed.length > 0 && broken.status !== 0 && broken.failed.length > 0;
    results.push({ id: m.id, caught });
    process.stdout.write(`${caught ? 'CAUGHT ' : 'MISSED '} ${m.id} · control ${control.status === 0 ? 'passes' : 'FAILS'} (${control.passed.length} ok) · broken copy ${broken.status !== 0 ? 'fails' : 'PASSES'}: ${broken.failed.join(' | ')}\n`);
    if (!caught) process.stdout.write(`--- control\n${control.tail}\n--- broken\n${broken.tail}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const untouched = JSON.stringify(before) === JSON.stringify(hashes());
process.stdout.write(`${JSON.stringify({ mutants: results.length, caught: results.filter((r) => r.caught).length, originals_unchanged: untouched })}\n`);
process.exit(results.every((r) => r.caught) && untouched ? 0 : 1);
