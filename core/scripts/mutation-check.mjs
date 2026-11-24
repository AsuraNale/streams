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
  // 1.1 W7b: the mutants of v1.0's scoring pipeline and of v2's main agent, proposal cards and suggestion cards (b-*, r2's
  // moveToInbox and callsBy, r4a-*, r4b's prompts and tools, r5a-*, r6a-*, r6b-*, v101-*, w2-feed-sign-in-gap) went with the code
  // they broke: it left core/src (core/legacy/, or deleted).
  // redesign R2 (docs/checks/2026-11-11-r2/contract.md 「测」)
  {
    id: 'r2-dismiss-placeholder',
    what: 'a dismissal without a reason gets a made-up placeholder reason in the ledger',
    edits: [['src/pipeline/decide.mjs', "  if (words !== '') ev.reason = words;", "  ev.reason = words !== '' ? words : '未说明';"]],
    test: ['test/r2-inbox.test.mjs', '--test-name-pattern=R2-2 dismiss with no reason'],
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
    what: '资料库 「全部」 also lists the ledger items that have no file (what v1.0 called 「抓到的」; 1.1 W7b: read from the ledger, the caught view is gone)',
    edits: [
      ['src/library/browse.mjs', "import { readIndex } from './index.mjs';", "import { readIndex } from './index.mjs';\nimport { replayLedger, TERMINAL_STAGES } from './ledger.mjs';"],
      ['src/library/browse.mjs', "    items = readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e));", "    items = [...readIndex(libraryDir).filter((e) => (view === 'all' || e.status === view) && keep(e)), ...(view === 'all' ? [...replayLedger(libraryDir).states.values()].filter((s) => !TERMINAL_STAGES.includes(s.stage)).map((s) => ({ url: s.url, title: s.title ?? '', source: s.source ?? '' })) : [])];"],
    ],
    test: ['test/r3-library.test.mjs', '--test-name-pattern=R3-1'],
  },
  {
    id: 'r3-graph-caught',
    what: 'the graph also draws the ledger items that have no file',
    edits: [
      ['src/graph/graph.mjs', "import { cmp, entryFilter } from '../library/browse.mjs';", "import { cmp, entryFilter } from '../library/browse.mjs';\nimport { replayLedger, TERMINAL_STAGES } from '../library/ledger.mjs';"],
      ['src/graph/graph.mjs', "  const items = readIndex(libraryDir).filter((e) => (status === 'all' || e.status === 'kept') && keep(e));", "  const items = [...readIndex(libraryDir), ...[...replayLedger(libraryDir).states.values()].filter((s) => !TERMINAL_STAGES.includes(s.stage)).map((c) => ({ id: c.url, title: c.title, topics: [], source_name: c.source, date: c.date, status: 'kept' }))].filter((e) => (status === 'all' || e.status === 'kept') && keep(e));"],
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
    edits: [['src/library/changes.mjs', '  for (const [step, s] of Object.entries(setup)) {', '  for (const [step, s] of Object.entries({})) {']],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=变更记录'],
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
    // 1.1.1 P2: the comparison is three branches now; every one of them made to find
    edits: [['src/verify/original-check.mjs', '    if (!found && !missing.includes(n.raw)) missing.push(n.raw);', '    found = true; if (!found && !missing.includes(n.raw)) missing.push(n.raw);']],
    test: ['test/verify-w3.test.mjs', '--test-name-pattern=^numbers: a number the original does not have'],
  },
  {
    id: 'w3-numbers-no-unit',
    what: 'the unit of a number is not compared (1.2 万 written as 1.2 亿 passes)',
    // 1.1.1 P2: the unit is compared through the amount; the fault is comparing the bare value
    edits: [['src/verify/original-check.mjs', "else found = have.some((o) => !STRICT.has(o.unit) && same(o.amount, n.amount));", "else found = have.some((o) => same(o.value, n.value));"]],
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
    // (1.1 W7b: the line as W6b left it — W6b made the rule depend on firstInput, and this mutant's text had not followed)
    edits: [['src/build/questions.mjs', "    if (n === 1 && firstInput) problems.push('first-not-input');\n", '']],
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
  // 1.1 W6b: before / after of a card, a change of a library's card, 不建了
  {
    id: 'w6b-no-changes',
    what: 'two cards are always said to be the same (no before / after)',
    edits: [['src/build/card.mjs', '    if (a !== b) out.push({ key, label: label[key] ?? key, before: a, after: b });', '    void a; void b;']],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^cardChanges'],
  },
  {
    id: 'w6b-edit-as-create',
    what: 'a change of a library\'s card is proposed as a new library',
    // (1.1 W7b: the line as W7a left it — W7a put convert_library between the two, and this mutant's text had not followed)
    edits: [['src/build/conversation.mjs', "    const request = editing() ? { action: 'edit_card', params: { library: s.edit.library, card } }\n", "    const request = false ? { action: 'edit_card', params: { library: s.edit.library, card } }\n"]],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^changing a library'],
  },
  {
    id: 'w6b-edit-old-urls-unread',
    what: 'changing a card, the addresses already on it must be opened again',
    edits: [['src/build/conversation.mjs', '  const readsSoFar = () => (editing() ? [...s.reads, ...cardUrls(s.edit.card).map((url) => ({ url, ok: true }))] : s.reads);', '  const readsSoFar = () => s.reads;']],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^changing a card: the addresses'],
  },
  {
    id: 'w6b-edit-any-url',
    what: 'changing a card, a new address need not be read',
    edits: [['src/build/conversation.mjs', '      const c = checkCard(json.card, { reads: readsSoFar() });', '      const c = checkCard(json.card, { reads: editing() ? null : readsSoFar() });']],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^changing a card: the addresses'],
  },
  {
    id: 'w6b-drop-keeps-card',
    what: '不建了 leaves the card waiting',
    edits: [['src/build/conversation.mjs', "    drop() {\n      if (s.pendingId) { runner.reject(s.pendingId); s.pendingId = null; }", '    drop() {']],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^不建了'],
  },
  {
    id: 'w6b-first-choice-anywhere',
    what: 'a new build may open with a choice question',
    edits: [['src/build/questions.mjs', "    if (n === 1 && firstInput) problems.push('first-not-input');", "    if (n === 1 && firstInput === 'never') problems.push('first-not-input');"]],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^the first question'],
  },
  {
    id: 'w6b-no-before',
    what: 'a card sent again is shown without the one before it',
    edits: [['src/build/conversation.mjs', '  async function offerCard(card, say) {\n    const before = s.card ?? s.edit?.card ?? null;', '  async function offerCard(card, say) {\n    const before = null;']],
    test: ['test/w6b.test.mjs', '--test-name-pattern=^a build: a card sent again'],
  },
  // 1.1 W7a: bringing a library of the last version over
  {
    id: 'w7a-convert-as-new',
    what: 'bringing a library over makes a new library instead',
    edits: [['src/build/conversation.mjs', "      : isObj(s.convert) ? { action: 'convert_library', params: { library: s.convert.library, card } }\n", '']],
    test: ['test/w7a.test.mjs', '--test-name-pattern=^convert: the card is convert_library'],
  },
  {
    id: 'w7a-convert-over-card',
    what: 'a library that has a card is brought over again (its card overwritten)',
    edits: [['src/build/store.mjs', "      if (readCard(dir)) throw new StreamsError('has-card', 'this library has a card already');\n", '']],
    test: ['test/w7a.test.mjs', '--test-name-pattern=^convert: a library that has a card'],
  },
  {
    id: 'w7a-update-not-stopped',
    what: '停止 does not stop an update: it reads every source and runs the agent',
    edits: [['src/update/run.mjs', '  const stopped = () => signal?.aborted === true;', '  const stopped = () => false;']],
    test: ['test/w7a.test.mjs', '--test-name-pattern=^an update stopped'],
  },
  // 1.1 W7b (core): v1.0's scoring pipeline out of core/src — each new check put back the way it was not
  {
    id: 'w7b-scan-blind',
    what: 'the C1 scan reports nothing: a line that judges by a score goes through',
    edits: [['test/c1-scan.test.mjs', '    if (!WORDS.test(line)) return;\n', '    return;\n']],
    test: ['test/c1-scan.test.mjs', '--test-name-pattern=^sentinel: C1 scan'],
  },
  {
    id: 'w7b-src-imports-legacy',
    what: 'a module of core/src imports core/legacy',
    edits: [['src/library/language.mjs', "export const LANGUAGES = Object.freeze(['zh-CN', 'en']);", "import '../../legacy/index.mjs';\nexport const LANGUAGES = Object.freeze(['zh-CN', 'en']);"]],
    test: ['test/c1-scan.test.mjs', '--test-name-pattern=^C1 scan · nothing in core/src imports core/legacy'],
  },
  {
    id: 'w7b-create-writes-gates',
    what: 'a new library\'s streams.json gets a v1.0 scoring step again',
    edits: [['src/library/create.mjs', '    pipeline: languageConfig(language),\n', "    pipeline: { ...languageConfig(language), nodes: [{ id: 'relevance', kind: 'gate', threshold: 0.7 }] },\n"]],
    test: ['test/create.test.mjs', '--test-name-pattern=^createLibrary lays out'],
  },
  {
    id: 'w7b-inbox-by-score',
    what: 'cards of the same moment are ordered by a v1.0 score again',
    edits: [['src/pipeline/inbox.mjs', '  cards.sort((a, b) => t(b) - t(a) || (a.url < b.url ? -1 : 1));', '  cards.sort((a, b) => t(b) - t(a) || (b.scores.relevance?.score ?? -1) - (a.scores.relevance?.score ?? -1) || (a.url < b.url ? -1 : 1));']],
    test: ['test/pipeline-numbers.test.mjs', '--test-name-pattern=^listInbox: the same moment'],
  },
  {
    id: 'w7b-change-log-scoring-field',
    what: 'the change log takes v1.0\'s gate marks as a field again',
    edits: [['src/library/changes.mjs', "export const CHANGE_FIELDS = Object.freeze(['brief', 'sources', 'topics', 'schedule', 'name']);", "export const CHANGE_FIELDS = Object.freeze(['brief', 'sources', 'topics', 'thresholds', 'schedule', 'name']);"]],
    test: ['test/r4b-sources.test.mjs', '--test-name-pattern=^R4b'],
  },
  {
    id: 'w7b-caught-view-back',
    what: 'the library pages take v1.0\'s 「抓到的」 view again',
    edits: [['src/library/browse.mjs', "export const LIBRARY_VIEWS = ['kept', 'authored', 'pending', 'all'];", "export const LIBRARY_VIEWS = ['kept', 'authored', 'caught', 'pending', 'all'];"]],
    test: ['test/browse.test.mjs', '--test-name-pattern=^libraryCounts'],
  },
  {
    id: 'w7b-cli-estimate-back',
    what: 'the command line takes v1.0\'s estimate again',
    edits: [['bin/streams-core.mjs', "const COMMANDS = ['rebuild', 'pending', 'replay', 'status', 'inbox', 'keep', 'dismiss', 'rounds'];", "const COMMANDS = ['rebuild', 'pending', 'replay', 'status', 'estimate', 'inbox', 'keep', 'dismiss', 'rounds'];"]],
    test: ['test/cli.test.mjs', '--test-name-pattern=^v1.0'],
  },
  {
    id: 'w7b-folder-name-reserved',
    what: 'a library named after a reserved Windows name gets that folder name',
    edits: [['src/library/create.mjs', '  if (RESERVED_NAME.test(s.split(\'.\')[0])) s = `${s}-`;\n', '']],
    test: ['test/create.test.mjs', '--test-name-pattern=^libraryFolderName'],
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
  // 1.1 W8: 问库 with the saved originals, the note's line to its original, a broken note kept out (B1, B15, B16)
  {
    id: "w8-ask-no-original",
    what: "问库 leaves a kept note's saved original out of its material",
    edits: [["src/ask/ask.mjs", "    const original = stored ? Array.from(stored.text).slice(0, Math.max(0, Math.min(ORIGINAL_CHARS, originals))).join('') : '';", "    const original = '';"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^ask-original: a kept note"],
  },
  {
    id: "w8-prompt-drops-original",
    what: "the candidate carries its original but the prompt (and the check) never shows it",
    edits: [["src/ask/prompts.mjs", "    return `${head}\\n${body}${original}`;", "    return `${head}\\n${body}`;"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^ask-original: a kept note"],
  },
  {
    id: "w8-original-uncut",
    what: "an original goes in whole, not cut at ORIGINAL_CHARS",
    edits: [["src/ask/ask.mjs", "Math.max(0, Math.min(ORIGINAL_CHARS, originals))", "Infinity"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^ask-original: an original is cut"],
  },
  {
    id: "w8-inbox-candidate",
    what: "an item only in 待看 becomes a candidate of 问库",
    edits: [["src/ask/ask.mjs", "import { readOriginal, originalId } from '../read/original.mjs';\n", "import { readOriginal, originalId } from '../read/original.mjs';\nimport { listInbox } from '../pipeline/inbox.mjs';\n"], ["src/ask/ask.mjs", "  const entries = readIndex(libraryDir).filter((e) => ASK_STATUSES.includes(e.status));", "  const entries = [...readIndex(libraryDir).filter((e) => ASK_STATUSES.includes(e.status)), ...listInbox(libraryDir).map((c) => ({ id: c.url, title: c.title, source: c.url, date: c.date, status: 'kept', topics: [], summary: c.summary?.what ?? '' }))];"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^ask-scope"],
  },
  {
    id: "w8-summary-label-kept",
    what: "the index summary keeps the note's opening label (「这是什么：」 matches every question with 什么)",
    edits: [["src/library/index.mjs", "  if (label) text = text.slice(label.length).trimStart();", ""]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^ask-scope"],
  },
  {
    id: "w8-no-original-line",
    what: "收藏 writes no line to the original",
    edits: [["src/pipeline/decide.mjs", "  lines.push('', original);\n", ""]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^note-link: 收藏 writes"],
  },
  {
    id: "w8-link-into-notes",
    what: "the line links to a file beside the note (in the note folder) instead of the saved original",
    edits: [["src/pipeline/decide.mjs", "(../${ORIGINALS_DIR}/${id}.md)", "(${id}.md)"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^note-link: 收藏 writes"],
  },
  {
    id: "w8-link-when-not-saved",
    what: "an item whose original was not saved gets a link anyway",
    edits: [["src/pipeline/decide.mjs", "  return readOriginal(libraryDir, id) ?", "  return true ?"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^note-link: 收藏 writes"],
  },
  {
    id: "w8-english-line-chinese",
    what: "an English library's note gets the Chinese line",
    edits: [["src/pipeline/decide.mjs", "  const L = ORIGINAL_LINE[language] ?? ORIGINAL_LINE['zh-CN'];", "  const L = ORIGINAL_LINE['zh-CN'];"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^note-link: an English"],
  },
  {
    id: "w8-broken-note-indexed",
    what: "a note with a broken header goes into the index (and so the graph and 问库) instead of 待规范",
    edits: [["src/library/scan.mjs", "    if (r.ok) valid.push({ file, path, stat, meta: r.meta, body: r.body, warnings: r.warnings });\n    else pending.push(toPending({ file, path, stat, text, meta: r.meta, body: r.body, problems: r.problems }));", "    valid.push({ file, path, stat, meta: r.ok ? r.meta : { id: file.slice(0, -3), title: file, status: 'kept', topics: [] }, body: r.body ?? text, warnings: r.warnings ?? [] });"]],
    test: ["test/w8.test.mjs", "--test-name-pattern=^b15"],
  },
  // 1.1 W11 (Codex's install test, B4): an item's title is checked with its summary
  {
    id: "w11-judge-no-title",
    what: "the judge reads the summary without the item's title",
    edits: [["src/verify/summary.mjs", "  const withTitle = typeof title === 'string' && title.trim() !== ''", "  const withTitle = false"]],
    test: ["test/update-w5.test.mjs", "--test-name-pattern=W11"],
  },
  {
    id: "w11-no-title-item",
    what: "the checklist has no title-same-thing item",
    edits: [["src/verify/checklist.mjs", "    { id: 'title-same-thing', desc: w['title-same-thing'], kind: 'judge', origin: 'streams' },\n", ""]],
    test: ["test/update-w5.test.mjs", "--test-name-pattern=W11"],
  },
  {
    id: "w11-title-not-revised",
    what: "a title the agent sends back changed is not taken",
    edits: [["src/update/run.mjs", "const title = typeof re.title === 'string' && re.title.trim() !== '' ? re.title.trim() : x.title;", "const title = x.title;"]],
    test: ["test/update-w5.test.mjs", "--test-name-pattern=W11"],
  },
  {
    id: "w11-samples-not-known",
    what: "an item at the address of one of the card's samples goes into 待看 as new",
    edits: [["src/update/run.mjs", "const knownUrls = [...ledger.keys(), ...sampleUrls];", "const knownUrls = [...ledger.keys()];"]],
    test: ["test/update-w5.test.mjs", "--test-name-pattern=W11"],
  },
  // 1.1.1 P2 (B20): numbers by value
  {
    id: "v111-yi-wrong",
    what: "亿 multiplies by 10^9 instead of 10^8 (161M would no longer be 1.61 亿)",
    edits: [["src/verify/original-check.mjs", "亿: 1e8,", "亿: 1e9,"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B20"],
  },
  {
    id: "v111-no-amount",
    what: "a scaled number is compared by its written value and unit again (W3's rule): 1.61 亿 is not found in 161M",
    edits: [["src/verify/original-check.mjs", "else found = have.some((o) => !STRICT.has(o.unit) && same(o.amount, n.amount));", "else found = have.some((o) => o.value === n.value && o.unit === n.unit);"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B20"],
  },
  {
    id: "v111-no-months",
    what: "English month names in the original are not read as month numbers (12 月 is not found in December)",
    edits: [["src/verify/original-check.mjs", "const have = [...numbersIn(original), ...monthsIn(original).map((v) => ({ raw: String(v), value: v, unit: '', amount: v }))];", "const have = numbersIn(original);"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B20"],
  },
  {
    id: "v111-percent-as-amount",
    what: "a percentage is matched like an amount (30% found in 'the 30 largest')",
    edits: [["src/verify/original-check.mjs", "if (STRICT.has(n.unit)) found = have.some((o) => o.unit === n.unit && same(o.value, n.value));", "if (STRICT.has(n.unit)) found = have.some((o) => same(o.value, n.value));"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B20"],
  },
  // 1.1.1 P7 (B21, B22)
  {
    id: "v111-utc-date",
    what: "the update agent is told the last update's UTC date again (an evening update reads as the next day)",
    edits: [["src/update/format.mjs", "`上次更新：${localStamp(lastAgentAt)}（本地时间）。", "`上次更新：${lastAgentAt.slice(0, 10)}（本地时间）。"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B21"],
  },
  {
    id: "v111-samples-untold",
    what: "the card's samples are not in the list of what the library has (the agent is not told)",
    edits: [["src/update/run.mjs", "...samples.map((s) => ({ url: s.url, title: `${s.title ?? ''}（建库卡上的样例）` }))];", "];"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B21"],
  },
  {
    id: "v111-tracking-kept",
    what: "tracking parameters stay in the links (the same page with another campaign is new)",
    edits: [["src/update/links.mjs", "for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);", ""]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B22"],
  },
  {
    id: "v111-dup-fetched",
    what: "an address new on two sources is fetched and handed in twice",
    edits: [["src/update/run.mjs", " && !fresh.some((f) => f.url === l)) fresh.push", ") fresh.push"]],
    test: ["test/v111-update-numbers.test.mjs", "--test-name-pattern=B22"],
  },
  // 1.1.1 P11a (A10): how often
  {
    id: "v111-sch-weekly-as-daily",
    what: "a weekly schedule's days are not looked at: it comes every day",
    edits: [["src/pipeline/schedule.mjs", "if (s.every === 'week') return s.days.includes(d.getDay());", "if (s.every === 'week') return true;"]],
    test: ["test/v111-schedule.test.mjs", "--test-name-pattern=A10: a weekly schedule"],
  },
  {
    id: "v111-sch-create-no-rhythm",
    what: "confirming a card makes the library without setting its schedule by the card's rhythm (every day, as before)",
    edits: [["src/build/store.mjs", "saveLibrarySchedule(dir, rhythmSchedule(card.definition?.rhythm, now()));", "void 0;"]],
    test: ["test/v111-schedule.test.mjs", "--test-name-pattern=A10: confirming a card"],
  },
  {
    id: "v111-sch-count-as-monday",
    what: "「每周一次」 is read as every Monday",
    edits: [["src/pipeline/schedule.mjs", "(?:周|星期|礼拜)([一二三四五六日天])(?![次回遍])/g", "(?:周|星期|礼拜)([一二三四五六日天])/g"]],
    test: ["test/v111-schedule.test.mjs", "--test-name-pattern=A10: the card"],
  },
  // 1.1.1 P1 (B19)
  {
    id: "v111-p1-no-own-read",
    what: "Streams does not read the card's addresses itself: only the model's opens count",
    edits: [["src/build/check-urls.mjs", "    const rec = await readOne(url);", "    const rec = null;"]],
    test: ["test/v111-check-urls.test.mjs", "--test-name-pattern=B19 ①"],
  },
  {
    id: "v111-p1-codex-error-read",
    what: "a Codex open that came back as an error counts as read",
    edits: [["src/connect/session.mjs", "read(a.url, results.some((res) => typeof res?.url === 'string' && res.url !== ''));", "read(a.url, true);"]],
    test: ["test/v111-check-urls.test.mjs", "--test-name-pattern=B19 ③"],
  },
  {
    id: "v111-p1-unreadable-needs-open",
    what: "an address in 「读不到的来源」 needs an open again (the 1.1.0 rule)",
    edits: [["src/build/check-urls.mjs", "if (unreadable.has(k) || opened.has(k) || out[k]?.ok) continue;", "if (opened.has(k) || out[k]?.ok) continue;"]],
    test: ["test/v111-check-urls.test.mjs", "--test-name-pattern=B19 ④"],
  },
  // 1.1.1 P4 (A3, C6)
  {
    id: "v111-p4-no-budget",
    what: "the API tools' read budget is not checked: past the number the reader is still called",
    edits: [["src/connect/api-tools.mjs", "if (s.used.reads >= budget.reads) return { id: call.id, error: true, text: OUT_OF_BUDGET };", ""]],
    test: ["test/v111-api-tools.test.mjs", "--test-name-pattern=the budget is hard"],
  },
  {
    id: "v111-p4-no-address-guard",
    what: "any address is read, this machine's and a private network's too",
    edits: [["src/connect/api-tools.mjs", "const g = await publicAddress(url, { lookup });", "const g = { ok: true };"]],
    test: ["test/v111-api-tools.test.mjs", "--test-name-pattern=public pages only"],
  },
  {
    id: "v111-p4-any-tool",
    what: "a tool off the list is not recorded: the build goes on as if nothing happened",
    edits: [["src/connect/api-tools.mjs", "out.otherTools.push(call.name || '(no name)');", ""]],
    test: ["test/v111-api-tools.test.mjs", "--test-name-pattern=a tool not on the list"],
  },
  // 1.1.1 P5
  {
    id: "v111-p5-key-choice",
    what: "a DeepSeek model's own key is not used for searching (the search key is asked for even then)",
    edits: [["src/connect/search.mjs", "if (connection.api?.vendor === 'deepseek' && typeof getKey === 'function') {", "if (false) {"]],
    test: ["test/v111-search.test.mjs", "--test-name-pattern=which key"],
  },
  {
    id: "v111-p5-key-in-detail",
    what: "a failed search's detail keeps the key",
    edits: [["src/connect/search.mjs", "const safe = (s) => clip(scrub(s, [key]), 300);", "const safe = (s) => clip(String(s), 300);"]],
    test: ["test/v111-search.test.mjs", "--test-name-pattern=failures are codes"],
  },
  // 1.1.1 P4 round 2
  {
    id: "v111-p4-no-search-budget",
    what: "the API tools' search budget is not checked: past the number the search service is still called",
    edits: [["src/connect/api-tools.mjs", "if (s.used.searches >= budget.searches) return { id: call.id, error: true, text: OUT_OF_SEARCHES };", ""]],
    test: ["test/v111-api-tools.test.mjs", "--test-name-pattern=the search budget is hard"],
  },
  {
    id: "v111-p4-look-always-search",
    what: "the build SOP's first step speaks of searches even when there is no search (B26)",
    edits: [["src/build/conversation.mjs", "LOOK: search ? LOOK_TEXT.search : LOOK_TEXT.noSearch,", "LOOK: LOOK_TEXT.search,"]],
    test: ["test/v111-api-tools.test.mjs", "--test-name-pattern=B26"],
  },
  // 1.1.1 P10 (A8)
  {
    id: "v111-p10-count-at-end",
    what: "a command-line session counts its searches and reads only when the run has ended",
    edits: [["src/connect/session.mjs", "    if (!web || typeof onProgress !== 'function') return null;", "    return null;"]],
    test: ["test/v111-progress.test.mjs", "--test-name-pattern=Claude Code: the reads"],
  },
  {
    id: "v111-p10-update-no-agent-count",
    what: "the update does not pass the agent's counts on",
    edits: [["src/update/run.mjs", "onProgress: (p) => tell('agent', { searches: base.searches + (p.searches ?? 0), reads: base.reads + (p.reads ?? 0) }) });", "onProgress: () => {} });"]],
    test: ["test/v111-progress.test.mjs", "--test-name-pattern=the update tells"],
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
