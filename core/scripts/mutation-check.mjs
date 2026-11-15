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
    edits: [['src/agent/words.mjs', "gap: '地址无效', failed: '暂时失败', blocked: '访问被拒', paused: '已暂停', never: '尚未抓取' }),", "gap: '地址待查', failed: '暂时失败', blocked: '访问被拒', paused: '已暂停', never: '尚未抓取' }),"]],
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
