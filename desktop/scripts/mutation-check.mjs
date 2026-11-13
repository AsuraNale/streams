#!/usr/bin/env node
// `npm run mutants` — each check of the shell must be able to fail: break a copy of desktop/ on purpose, run the check
// there, and see it fail; the same check on an unbroken copy passes. Every copy is a mirror under the OS temp folder
// (scripts/lib/mirror.mjs). The originals are never edited — the files the mutants edit are hashed before and after.
//   npm run mutants                       all of them
//   npm run mutants -- no-node d2-unc      some, by id
// An edit is [file, text or RegExp (must match exactly once), replacement]; a RegExp edit is read from the file as
// it is now (e.g. the METHODS line), its replacement may use $1.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeMirror } from './lib/mirror.mjs'
import { DESKTOP_DIR } from './lib/paths.mjs'
import { removeTree } from './lib/remove-tree.mjs'
import { tempDir } from './lib/temp.mjs'

/** id → the edits (file, text before, text after) and the test that must then fail. */
const MUTANTS = [
  {
    id: 'no-node',
    what: 'the page gets Node: context isolation and sandbox off (also the app-wide sandbox), Node integration on',
    edits: [
      ['src/main/security.mjs', 'contextIsolation: true,\n  sandbox: true,\n  nodeIntegration: false,', 'contextIsolation: false,\n  sandbox: false,\n  nodeIntegration: true,'],
      ['src/main/main.mjs', 'app.enableSandbox()\n', ''],
    ],
    test: ['test/security.test.mjs', '--test-name-pattern=the page has no Node'],
  },
  {
    id: 'csp-off',
    what: 'the page has no CSP (header and <meta> gone); the session filter stays',
    edits: [
      ['src/main/protocol.mjs', "    'content-security-policy': csp,\n", ''],
      ['src/renderer/index.html', /<meta http-equiv="Content-Security-Policy"[^\n]*\n/, ''],
    ],
    test: ['test/security.test.mjs', '--test-name-pattern=refused in the page'],
  },
  {
    id: 'session-open',
    what: 'the session lets every address through (the page\'s CSP stays)',
    edits: [['src/main/security.mjs', 'callback({ cancel: !ok })', 'callback({ cancel: false })']],
    test: ['test/security.test.mjs', '--test-name-pattern=the session refuses'],
  },
  {
    id: 'bridge-extra',
    what: 'the preload exposes one method more than docs/desktop.md lists (the METHODS line as the file has it now)',
    edits: [['src/preload/preload.cjs', /^const METHODS = \[([^\]]*)\]$/m, "const METHODS = ['readFile', $1]"]],
    test: ['test/security.test.mjs', '--test-name-pattern=the bridge has exactly'],
  },
  {
    id: 'banned-word',
    what: 'a banned interface word in a text table',
    edits: [['src/renderer/texts/screens.js', "  placeholder: '这一页明天起做。',", "  placeholder: '这一页明天起做，先 pending。',"]],
    test: ['test/wording.test.mjs', '--test-name-pattern=passes the wording scanner'],
  },
  {
    id: 'd2-unc',
    what: 'the path is handed to the file system before it is judged as text (a network share is then opened)',
    // Windows keeps a failed SMB connection in a negative cache for some minutes: right after anything has tried
    // \\192.0.2.1, a realpath there answers in 2 ms instead of ~21 s, and the broken copy then passes the "< 1 s" check
    // (seen 2026-11-02: CAUGHT on a cold cache, MISSED on a warm one). Run it cold, or read a MISSED here with that in mind.
    edits: [
      // the text rule gone in both places, and the path resolved (a `//host/share` is then a UNC path) and handed to realpath
      ['src/main/safe-path.mjs', "  if (typeof path !== 'string' || !path.startsWith('/')) return null\n  const segments = path.slice(1).split('/')\n  return segments.every(isSafeSegment) ? segments : null", "  if (typeof path !== 'string' || !path.startsWith('/')) return null\n  return path.slice(1).split('/')"],
      ['src/main/safe-path.mjs', "import { isAbsolute, join, relative, sep } from 'node:path'", "import { isAbsolute, join, relative, resolve, sep } from 'node:path'"],
      ['src/main/safe-path.mjs', "  if (!Array.isArray(segments) || segments.length === 0 || !segments.every(isSafeSegment)) return null\n  const candidate = join(root, ...segments)\n  if (!lexicallyInside(candidate, root)) return null", "  if (!Array.isArray(segments) || segments.length === 0) return null\n  const candidate = resolve(root, segments.join('/'))"],
    ],
    test: ['test/protocol.test.mjs', '--test-name-pattern=refused at once'],
  },
  {
    id: 'd3-emit-any-topic',
    what: 'emit does not check the topic',
    edits: [['src/main/events.mjs', "    if (!Object.hasOwn(EVENT_TOPICS, topic)) throw new Error(`no event topic ${topic} (src/main/events.mjs EVENT_TOPICS)`)\n", '']],
    test: ['test/events.test.mjs', '--test-name-pattern=a listed topic only'],
  },
  {
    id: 'd3-any-topic',
    what: 'the page can subscribe to any topic',
    edits: [['src/preload/preload.cjs', "  if (!EVENT_TOPICS.includes(topic)) throw new Error(`onEvent: no topic ${String(topic)}`)\n", "  if (!listeners.has(topic)) listeners.set(topic, new Set())\n"]],
    test: ['test/events.test.mjs', '--test-name-pattern=only a listed topic'],
  },
  {
    id: 'd4-any-sender',
    what: 'the bridge does not check where a call comes from',
    edits: [['src/main/bridge.mjs', 'return Boolean(frame) && frame === event.sender?.mainFrame && isAppUrl(frame.url)', 'return true']],
    test: ['test/security.test.mjs', '--test-name-pattern=answers only the app'],
  },
  {
    id: 'd4-permissions-open',
    what: 'the permission handlers are gone',
    edits: [['src/main/security.mjs', '  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))\n  ses.setPermissionCheckHandler(() => false)\n', '']],
    test: ['test/security.test.mjs', '--test-name-pattern=every permission is refused'],
  },
  {
    id: 'd10-any-root',
    what: 'the development folder is filled whether or not these scripts made it',
    edits: [['scripts/lib/dev-root.mjs', '    if (entries.length && !hasMarker(root)) {', '    if (false) {']],
    test: ['test/start.test.mjs', '--test-name-pattern=did not make is refused'],
  },
  // redesign R1: tokens.css and docs/tokens.md's table are gone (the check that the two name the same tokens went with them);
  // the app's style files write no colour at all now (the colours are the template's)
  {
    id: 'colour-in-app-styles',
    what: 'a colour written in a style file of the app (the colours are the template\'s)',
    edits: [['src/renderer/styles/base.css', 'body { overflow: hidden; }', 'body { overflow: hidden; color: #1F6E8C; }']],
    test: ['test/kit.test.mjs', '--test-name-pattern=no colour in any app style file'],
  },
  {
    id: 'en-missing-key',
    what: 'an English table misses a key of its Chinese twin',
    edits: [['src/renderer/texts-en/screens.js', "    status: 'Status',\n  }),\n  about:", "  }),\n  about:"]],
    test: ['test/texts-en.test.mjs', '--test-name-pattern=key parity'],
  },
  // v2 package F (the shell of plan B)
  {
    id: 'f-sidebar-any-library',
    what: 'the sidebar takes an inbox-changed for every library line, whatever library the event names',
    edits: [['src/renderer/lib/libraries.js', 'rows.map(r => (r.id === payload.libraryId ? { ...r, inbox: payload.count } : r))', 'rows.map(r => ({ ...r, inbox: payload.count }))']],
    test: ['test/ui-shell.test.mjs', '--test-name-pattern=inbox-changed with a libraryId'],
  },
  {
    id: 'f-brief-not-yours',
    what: 'saving the brief from 来源与要求 does not record it as the user\'s (no changes.jsonl line by you)',
    edits: [['src/main/services/sources.mjs', "const r = byYou(dir, ['brief'], () => call('saveBrief', dir, text), { log, now })", "const r = call('saveBrief', dir, text)"]],
    test: ['test/services-sources.test.mjs', '--test-name-pattern=getBrief / setBrief'],
  },
  {
    id: 'f-brief-not-yours-ui',
    what: 'the same, seen on the running app (streams.json and changes.jsonl read after 「保存」)',
    edits: [['src/main/services/sources.mjs', "const r = byYou(dir, ['brief'], () => call('saveBrief', dir, text), { log, now })", "const r = call('saveBrief', dir, text)"]],
    test: ['test/ui-shell.test.mjs', '--test-name-pattern=the brief saved'],
  },
  {
    id: 'f-tabs-one-memory',
    what: 'the page a library was left on is remembered once for all libraries, not per library',
    edits: [
      ['src/renderer/app.js', 'memory.current.routes.set(libraryId, route)', "memory.current.routes.set('all', route)"],
      ['src/renderer/app.js', 'memory.current.routes.get(id)', "memory.current.routes.get('all')"],
    ],
    test: ['test/ui-shell.test.mjs', '--test-name-pattern=a click on a library|each library remembers'],
  },
  {
    id: 'f-scroll-one-memory',
    what: 'how far a page was scrolled is remembered per screen only, not per library',
    edits: [['src/renderer/screens/library-frame.js', 'const scrollKey = `${id ?? \'\'}:${screen}`', 'const scrollKey = screen']],
    test: ['test/ui-shell.test.mjs', '--test-name-pattern=a click on a library|each library remembers'],
  },
  // v2 package G (docs/checks/2026-11-09-wp-g/contract.md): the proposal card, 和主 Agent 聊, 问库's routing
  {
    id: 'g-decline-confirms',
    // redesign R5b: the card is screens/proposal.js (was proposal-card.js); its 拒绝 (was 不要) is the same call
    what: 'the proposal\'s 拒绝 calls confirmProposal',
    edits: [['src/renderer/screens/proposal.js', "async () => done(await call('declineProposal', id)))", "async () => done(await call('confirmProposal', id)))"]],
    test: ['test/ui-agent.test.mjs', '--test-name-pattern=the proposal card'],
  },
  {
    id: 'g-send-while-busy',
    what: '和主 Agent 聊 lets you send while a turn of the main Agent runs',
    edits: [['src/renderer/screens/chat.js', 'const busy = sending.length > 0 || agent.busy', 'const busy = false']],
    test: ['test/ui-agent.test.mjs', '--test-name-pattern=a turn in progress'],
  },
  {
    id: 'g-unsure-yes-question',
    what: '问库\'s 「是，改这个库」 resolves the sentence as a question',
    edits: [['src/renderer/screens/ask.js', "onClick=${() => onChoose('change')}", "onClick=${() => onChoose('question')}"]],
    test: ['test/ui-agent.test.mjs', '--test-name-pattern=unsure'],
  },
  {
    id: 'g-card-press-twice',
    what: 'a proposal card\'s button can be pressed again before the bridge answers (no guard, never disabled)',
    // redesign R5b: the guard is screens/proposal.js useActing (was proposal-card.js)
    edits: [
      ['src/renderer/screens/proposal.js', '    if (inFlight.current) return undefined\n    inFlight.current = true\n', ''],
      ['src/renderer/screens/proposal.js', 'return { acting, busy: acting !== null, error, setError, run }', 'return { acting, busy: false, error, setError, run }'],
    ],
    test: ['test/ui-agent.test.mjs', '--test-name-pattern=the proposal card'],
  },
  // v2 package H: the library page, the reading window, the 「写给 AI 的话」 mark
  // (redesign R3: h-obsidian-for-caught and h-default-kept are retired with what they broke — 资料库's 「抓到的」 tab and the page
  // opening on it when nothing is kept are gone; their reverse is r3-all-lists-caught below)
  {
    id: 'h-reader-preload',
    what: 'the reading window\'s page gets the app\'s preload (and with it the bridge)',
    edits: [['src/main/reader.mjs', 'view = new WebContentsView({ webPreferences: { ...READER_WEB_PREFERENCES } })', "view = new WebContentsView({ webPreferences: { ...READER_WEB_PREFERENCES, preload: join(import.meta.dirname, '..', 'preload', 'preload.cjs') } })"]],
    test: ['test/ui-reader.test.mjs', '--test-name-pattern=opens the reading window|web contents'],
  },
  {
    id: 'h-reader-node',
    what: 'the reading window has Node integration on',
    edits: [['src/main/reader.mjs', '  sandbox: true,\n  nodeIntegration: false,', '  sandbox: true,\n  nodeIntegration: true,']],
    test: ['test/ui-reader.test.mjs', '--test-name-pattern=opens the reading window|web contents'],
  },
  {
    id: 'h-no-fallback',
    what: 'a page with no text to take out does not fall back to the original page',
    edits: [['src/main/reader.mjs', '      if (article) showReading()\n      else showOriginal(true)\n', '      if (article) showReading()\n']],
    test: ['test/ui-reader.test.mjs', '--test-name-pattern=opens the reading window|nothing to read'],
  },
  {
    id: 'h-ai-mark-on-all',
    what: 'every card in 待看 carries the 「写给 AI 的话」 mark',
    // (redesign R3: retargeted at R2's card — the mark is a Mark of the template's status-chip now)
    edits: [['src/renderer/screens/inbox.js', "${item.aiInstruction === true ? html`<${Mark} attrs=${{ 'data-ai-instruction': '' }}", "${true ? html`<${Mark} attrs=${{ 'data-ai-instruction': '' }}"]],
    test: ['test/ui-library-reader.test.mjs', '--test-name-pattern=the card with words for the AI'],
  },
  // v2 package L: the queue, the right panel
  {
    id: 'l-refuse',
    what: '开始 while another library runs is refused again (package A\'s rule) instead of queued at the end',
    edits: [['src/main/services/schedule.mjs', "      const q = enqueue(e, why, 'manual')\n", "      if (busy()) { log(`schedule: ${why}: a round is running, no second one`); return { started: false, reason: 'running' } }\n      const q = enqueue(e, why, 'manual')\n"]],
    test: ['test/services-queue.test.mjs', '--test-name-pattern=开始|维护者'],
  },
  {
    id: 'l-panel-not-saved',
    what: 'the right panel\'s folded / open state and tab are not written into settings.json (only answered)',
    edits: [['src/main/app-services.mjs', 'const s = writeSettings(layout.settingsFile, { panel: patch })', 'const s = { panel: { ...readSettings(layout.settingsFile).panel, ...patch } }']],
    test: ['test/ui-panel.test.mjs', '--test-name-pattern=four tabs switch'],
  },
  {
    id: 'l-records-open',
    what: '文件\'s 程序记录（不用动） is open by default',
    edits: [['src/renderer/screens/right-panel.js', 'const [recordsOpen, setRecordsOpen] = useState(false)', 'const [recordsOpen, setRecordsOpen] = useState(true)']],
    test: ['test/ui-panel.test.mjs', '--test-name-pattern=文件'],
  },
  // redesign R1: the template's themes, the run button, the four tabs
  {
    id: 'r1-default-precision',
    what: 'the default theme is 精密国际主义 again (K2\'s), not 研究对话',
    edits: [['src/main/theme.mjs', "export const DEFAULT_THEME = 'research'", "export const DEFAULT_THEME = 'precision'"]],
    test: ['test/theme.test.mjs', '--test-name-pattern=four themes|migration'],
  },
  {
    id: 'r1-night-light',
    what: 'v1.0\'s night is migrated to light (not dark)',
    edits: [['src/main/theme.mjs', "export const LEGACY_THEMES = Object.freeze({ paper: 'light', night: 'dark' })", "export const LEGACY_THEMES = Object.freeze({ paper: 'light', night: 'light' })"]],
    test: ['test/theme.test.mjs', '--test-name-pattern=migration'],
  },
  {
    id: 'r1-first-frame-wrong',
    what: 'the window\'s colour before the first frame is not the page\'s (one cell of THEME_PAGE off by one)',
    edits: [['src/shared/themes.mjs', "research: Object.freeze({ light: '#F7F7F3', dark: '#161A19' }),", "research: Object.freeze({ light: '#F7F7F3', dark: '#161A1A' }),"]],
    test: ['test/ui-theme.test.mjs', '--test-name-pattern=first frame|every theme'],
  },
  {
    id: 'r1-sheets-out-of-order',
    what: '研究对话 loads its sheets in another order than the design page',
    edits: [['src/shared/themes.mjs', "'shared/round6/base.css', 'shared/round6/design.css', 'shared/round3/themes/research.css',", "'shared/round6/design.css', 'shared/round6/base.css', 'shared/round3/themes/research.css',"]],
    test: ['test/theme.test.mjs', '--test-name-pattern=design page'],
  },
  {
    id: 'r1-run-does-nothing',
    what: '立即运行 asks nothing of the main process (as if a dialog had to be answered first)',
    edits: [['src/renderer/screens/library-frame.js', "onAnswer?.(await call('startRound'))", 'onAnswer?.(null)']],
    test: ['test/ui-run.test.mjs', '--test-name-pattern=立即运行: the run starts'],
  },
  {
    id: 'r1-refuse-when-busy',
    what: '立即运行 while another library runs is refused (package A\'s rule) instead of queued at the end — on the page',
    edits: [['src/main/services/schedule.mjs', "      const q = enqueue(e, why, 'manual')\n", "      if (busy()) { log(`schedule: ${why}: a round is running, no second one`); return { started: false, reason: 'running' } }\n      const q = enqueue(e, why, 'manual')\n"]],
    test: ['test/ui-panel.test.mjs', '--test-name-pattern=立即运行 in a library not in the line'],
  },
  {
    id: 'r1-overview-back',
    what: 'a library opens on another tab than 待看',
    edits: [['src/renderer/screens/index.js', "export const LIBRARY_FIRST_SCREEN = 'inbox'", "export const LIBRARY_FIRST_SCREEN = 'sources'"]],
    test: ['test/ui-shell.test.mjs', '--test-name-pattern=a click on a library'],
  },
  // ---- redesign R2 (docs/checks/2026-11-11-r2/contract.md 「测」): each reverse the contract names, and a few more ----
  {
    id: 'r2-undo-writes',
    what: '撤销 writes the held 放弃 into the ledger instead of dropping it',
    edits: [['src/main/services/pipeline.mjs', "      if (!h) return { undone: false }\n      held = null\n", "      if (!h) return { undone: false }\n      settlePending('undo')\n"]],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-2 放弃 is held'],
  },
  {
    id: 'r2-no-write-at-quit',
    what: 'quitting the app no longer writes a held 放弃 (the before-quit line gone)',
    edits: [['src/main/main.mjs', "  app.on('before-quit', () => { pipeline.settlePending('the app quits') })\n", '']],
    test: ['test/ui-inbox.test.mjs', '--test-name-pattern=the app quits'],
  },
  {
    id: 'r2-placeholder-reason',
    what: 'a 放弃 closed without a reason is written with a made-up placeholder reason',
    edits: [['src/main/services/pipeline.mjs', "choice.reason.trim() !== '' ? choice.reason.trim() : undefined", "choice.reason.trim() !== '' ? choice.reason.trim() : 'no reason given'"]],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-2 the bar closes'],
  },
  {
    id: 'r2-later-not-back',
    what: 'a run of the library that ended does not give 稍后处理 back to 待看',
    edits: [['src/main/services/pipeline.mjs', 'try { const r = releaseLater(dir); if (r.released)', 'try { const r = { released: 0 }; if (r.released)']],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-3'],
  },
  {
    id: 'r2-later-any-library',
    what: 'any library\'s run gives the current library\'s 稍后处理 back (not only its own)',
    edits: [['src/main/services/pipeline.mjs', 'try { const r = releaseLater(dir); if (r.released)', 'try { const r = releaseLater(library.dir() ?? dir); if (r.released)']],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-3'],
  },
  {
    id: 'r2-move-writes-notes',
    what: '移入待看 also keeps the item (a file in notes/) instead of only putting it in 待看',
    edits: [['src/main/services/pipeline.mjs', '      try { moveToInbox(dir, url, { now }) } catch (err) {', '      try { moveToInbox(dir, url, { now }); keep(dir, url, { now }) } catch (err) {']],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-4'],
  },
  {
    id: 'r2-calls-part-off',
    what: 'one part of the funnel\'s 模型调用 is off by one (the last part, 核验, one more)',
    edits: [['src/main/services/pipeline.mjs', '    return { funnel: runFunnel(rec), outcome: roundOutcome(dir, rec.id) }', '    return { funnel: (f => { if (f.calls.parts) f.calls.parts[f.calls.parts.length - 1].n += 1; return f })(runFunnel(rec)), outcome: roundOutcome(dir, rec.id) }']],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-6'],
  },
  {
    id: 'r2-reason-on-card',
    what: 'the relevance reason is on the card again (it belongs to 详情 only)',
    edits: [['src/renderer/screens/inbox.js', "  const line = [item.source ?? '', item.date ?? '', ...scoreWords(item)].filter(Boolean).join(SEP)", "  const line = [item.source ?? '', item.date ?? '', ...scoreWords(item), item.scores?.relevance?.reason ?? ''].filter(Boolean).join(SEP)"]],
    test: ['test/ui-inbox.test.mjs', '--test-name-pattern=cards in the core'],
  },
  {
    id: 'r2-no-unverified-mark',
    what: 'the card no longer carries 「未通过核验」',
    edits: [['src/renderer/screens/inbox.js', "        ${unverified ? html`<${Mark} attrs=${{ 'data-unverified': '' }}>${T.card.unverified}<//>` : null}\n", '']],
    test: ['test/ui-inbox.test.mjs', '--test-name-pattern=cards in the core'],
  },
  {
    id: 'r2-no-manual-row',
    what: 'a link added by hand gets no 「待评分」 row in 待看',
    edits: [['src/renderer/screens/inbox.js', '        ${manual.length ? html`<div class="st-manual" data-part="manual">', '        ${false ? html`<div class="st-manual" data-part="manual">']],
    test: ['test/ui-inbox.test.mjs', '--test-name-pattern=添加链接'],
  },
  {
    id: 'r2-catch-up-said-scheduled',
    what: '补跑 is said 定时',
    edits: [['src/renderer/texts/panel.js', "schedule: '定时', 'catch-up': '补跑' }", "schedule: '定时', 'catch-up': '定时' }"]],
    test: ['test/services-r2.test.mjs', '--test-name-pattern=R2-7 why'],
  },
  {
    id: 'r2-source-banner',
    what: 'a library whose sources fail gets a banner on its page again (not only the card in 待确认)',
    edits: [['src/renderer/screens/library-frame.js', '  const problem = BANNER_CODES.includes(home.data?.problem?.code) ? home.data.problem : null', "  const problem = BANNER_CODES.includes(home.data?.problem?.code) ? home.data.problem : row?.problem === 'sources' ? { code: 'connection', connectionCode: 'network', kind: null, caughtKept: 0 } : null"]],
    test: ['test/ui-error.test.mjs', '--test-name-pattern=no banner on any tab'],
  },
  // ---- redesign R3 (docs/checks/2026-11-11-r3/contract.md 「测」): each reverse the contract names, and a few more ----
  {
    id: 'r3-all-lists-caught',
    what: '资料库 「全部」 also lists the caught items that have no file (the old 「抓到的」)',
    edits: [['src/main/services/browse.mjs', "      return { counts: call('libraryCounts', dir), ...listed }\n    },\n    searchLibrary", "      if (view === 'all') listed.items = [...listed.items, ...call('listLibrary', dir, { view: 'caught' }).items.map(c => ({ id: c.url, title: c.title, date: c.date, source_name: c.source, status: 'kept' }))]\n      return { counts: call('libraryCounts', dir), ...listed }\n    },\n    searchLibrary"]],
    test: ['test/ui-library-reader.test.mjs', '--test-name-pattern=R3 nothing kept'],
  },
  {
    id: 'r3-graph-caught',
    what: '图谱 also draws the ledger items that have no file',
    edits: [['src/main/services/status.mjs', "      return call('graph', dir, { days, status: 'all', topics: [], links: true, now })", "      const g = call('graph', dir, { days, status: 'all', topics: [], links: true, now })\n      for (const c of call('listLibrary', dir, { view: 'caught' }).items) g.nodes.push({ id: `item:${c.url}`, kind: 'item', label: c.title, count: 1, row: 2, col: g.nodes.length })\n      return g"]],
    test: ['test/ui-graph.test.mjs', '--test-name-pattern=only files are drawn'],
  },
  {
    id: 'r3-header-hint-always',
    what: '资料库 shows the line 「n 个文件缺少文件头」 even when no file lacks a header',
    edits: [['src/renderer/screens/library.js', '${(counts?.pending ?? 0) > 0 ? html`<div class="progress-alert st-lib-hint"', '${counts ? html`<div class="progress-alert st-lib-hint"']],
    test: ['test/ui-library-reader.test.mjs', '--test-name-pattern=R3 nothing kept'],
  },
  {
    id: 'r3-demand-forgotten',
    what: '问库\'s 「已加入待补充主题」 is the page\'s own state only: opened again, the answer says 「记到想补的主题」 again',
    edits: [['src/renderer/screens/ask.js', 'const added = named ? demandAdded(demands, missing, question) : noted !== null && demandAdded(demands, noted, question)', 'const added = noted !== null']],
    test: ['test/ui-ask-r3.test.mjs', '--test-name-pattern=an answer|记到想补的主题'],
  },
  {
    id: 'r3-card-not-shared',
    what: '待确认\'s 确认 / 拒绝 on a proposal call nothing (the card in 问库\'s conversation stays pending)',
    // redesign R5b: 待确认's card is the one 提议's small card (screens/proposal.js, compact); its 确认 calls nothing
    edits: [['src/renderer/screens/proposal.js', "    const next = done(await call('confirmProposal', id))", "    const next = done(compact ? null : await call('confirmProposal', id))"]],
    test: ['test/ui-ask-r3.test.mjs', '--test-name-pattern=转交主 Agent'],
  },
  {
    id: 'r3-source-opens-browser',
    what: '资料库\'s 查看原文 opens the system browser instead of Streams\' reading window',
    edits: [['src/renderer/screens/library.js', "onClick=${() => doCall('openReader', e.source, 'reader')}", "onClick=${() => doCall('openReader', e.source, 'browser')}"]],
    test: ['test/ui-library-reader.test.mjs', '--test-name-pattern=R3 收藏 in 待看'],
  },
  {
    id: 'r3-graph-filters-back',
    what: 'the bridge takes the graph\'s old filters again (status, topics, links)',
    edits: [['src/main/bridge-methods.mjs', "const graphFilter = f => f === null || (isObject(f) && onlyKeys(f, ['days']) && optional(f, 'days', days))", "const graphFilter = f => f === null || (isObject(f) && onlyKeys(f, ['days', 'status', 'topics', 'links']) && optional(f, 'days', days))"]],
    test: ['test/ui-graph.test.mjs', '--test-name-pattern=one filter'],
  },
  {
    id: 'r3-reader-not-template',
    what: 'the reading window\'s bar is not the template\'s reader-header (its own old bar)',
    edits: [['src/main/reader.mjs', '  const body = `<nav class="reader-header rd-bar" data-reader-bar', '  const body = `<nav class="rd-bar" data-reader-bar']],
    test: ['test/ui-reader.test.mjs', '--test-name-pattern=opens the reading window in'],
  },
  // redesign R4a (docs/checks/2026-11-12-r4a/contract.md 「测」)
  {
    id: 'r4a-pick-when-signed-in',
    what: '首次打开 shows 连接选择 even when a signed-in connection was found (it does not choose one without asking)',
    edits: [['src/renderer/screens/first-run.js', '      else if (first) {', '      else if (first && false) {']],
    test: ['test/ui-first-run.test.mjs', '--test-name-pattern=R4a-1 signed in'],
  },
  {
    id: 'r4a-no-pick-when-none',
    what: '首次打开 goes to the one screen when no connection is usable (连接选择 never shows on its own)',
    edits: [['src/renderer/screens/first-run.js', "      } else setView('pick')", "      } else setView('home')"]],
    test: ['test/ui-first-run.test.mjs', '--test-name-pattern=found but not signed in'],
  },
  {
    id: 'r4a-example-sends',
    what: 'an example of 首次打开 is sent to the main agent at once instead of only filling the box',
    edits: [['src/renderer/screens/first-run.js', 'onClick=${() => fill(t)}>', "onClick=${() => navigate('chat', { send: t })}>"]],
    test: ['test/ui-first-run.test.mjs', '--test-name-pattern=an example only fills'],
  },
  {
    id: 'r4a-create-only-runs',
    what: '仅创建 also puts the new library\'s first run in the queue',
    edits: [['src/main/services/new-library.mjs', '      if (f.run) {', '      if (true) {']],
    test: ['test/services-new-library.test.mjs', '--test-name-pattern=仅创建'],
  },
  {
    id: 'r4a-empty-brief-creates',
    what: 'a library can be made with an empty 追踪要求 (the main process fills in a placeholder)',
    edits: [['src/main/services/new-library.mjs', '    try { stored = checkNewLibrary({ brief: form.brief, topics, sources }) }', "    try { stored = checkNewLibrary({ brief: String(form.brief ?? '').trim() || '（未填写）', topics, sources }) }"]],
    test: ['test/services-new-library.test.mjs', '--test-name-pattern=empty brief'],
  },
  {
    id: 'r4a-empty-brief-page',
    what: '新建库\'s create buttons work with 追踪要求 empty (the page does not require it)',
    edits: [['src/renderer/screens/new-library.js', "  const briefEmpty = brief.trim() === ''", '  const briefEmpty = false']],
    test: ['test/ui-new-library.test.mjs', '--test-name-pattern=追踪要求 is required'],
  },
  {
    id: 'r4a-raw-fetch-message',
    what: 'a source row says the fetcher\'s own message instead of V3\'s 怎么办',
    edits: [['src/renderer/screens/new-library.js', ': hintWords(r.hint)', ': (r.message || hintWords(r.hint))']],
    test: ['test/ui-new-library.test.mjs', '--test-name-pattern=来源: typed'],
  },
  {
    id: 'r4a-edit-order-back',
    what: '编辑笔记\'s foot is 保存 · 取消 again (保存 not on the right, P11)',
    edits: [['src/renderer/screens/edit-dialog.js', /(<span class="st-act" data-action="cancel-edit">[^\n]*<\/span>)\n(\s*)(<span class="st-act" data-action="save-edit">[^\n]*<\/span>)/, '$3\n$2$1']],
    test: ['test/ui-library.test.mjs', '--test-name-pattern=R3-3 编辑笔记'],
  },
  // redesign R4b (docs/checks/2026-11-12-r4b/contract.md 「测」: each 反向 named there, and a few more)
  {
    id: 'r4b-name-not-saved',
    what: '库名称 saved on 来源与要求 changes the registry only — streams.json `name` is not written (nor recorded)',
    edits: [['src/main/services/library.mjs', "        try { byYou(e.path, ['name'], () => saveLibraryName(e.path, meta.name), { log, now }) } catch (err) { throw bridgeErrorOf(err) }", '        void saveLibraryName']],
    test: ['test/ui-sources.test.mjs', '--test-name-pattern=R4b-1 要求'],
  },
  {
    id: 'r4b-manual-not-recorded',
    what: 'a change made on the page is written but 变更记录 misses it (byYou records no line)',
    edits: [['src/main/services/changes.mjs', "      const lines = recordChanges(dir, before, snapshot(dir, fields), { by: 'you', now })", '      const lines = []']],
    test: ['test/ui-sources.test.mjs', '--test-name-pattern=R4b-1 要求'],
  },
  {
    id: 'r4b-who-back',
    what: 'a 「谁定的」 mark is back beside 来源与要求\'s 要求',
    edits: [['src/renderer/screens/sources.js', '    <div class="section-label"><span id="src-brief-h">${T.brief.heading}</span></div>', '    <div class="section-label"><span id="src-brief-h">${T.brief.heading}</span><small class="muted" data-who="brief" data-by="setup">谁定的 · 首次设置</small></div>']],
    test: ['test/ui-sources.test.mjs', '--test-name-pattern=R4b-1 four parts'],
  },
  {
    id: 'r4b-baseline-removable',
    what: 'a built-in rule of 校验规则 gets a delete button like the user\'s own',
    edits: [['src/renderer/screens/pipeline.js', "      ${it.origin === 'streams' ? null : html`<${Btn} name=\"remove-check\"", "      ${false ? null : html`<${Btn} name=\"remove-check\""]],
    test: ['test/ui-advanced.test.mjs', '--test-name-pattern=R4b-2 校验规则'],
  },
  {
    id: 'r4b-preview-writes',
    what: '单条测试 writes a line into the library\'s ledger',
    edits: [
      ['src/main/services/pipeline.mjs', "import { randomBytes } from 'node:crypto'\n", "import { randomBytes } from 'node:crypto'\nimport { appendFileSync } from 'node:fs'\n"],
      ['src/main/services/pipeline.mjs', '      log(`pipeline: preview ${nodeId}:', "      appendFileSync(`${dir}/_pipeline/ledger.jsonl`, `${JSON.stringify({ ts: now().toISOString(), ev: 'previewed', url })}\\n`); log(`pipeline: preview ${nodeId}:"],
    ],
    test: ['test/ui-pipeline.test.mjs', '--test-name-pattern=试一条看结果'],
  },
  {
    id: 'r4b-remove-deletes-file',
    what: '移除该库 also deletes one file of the library\'s folder (its streams.json)',
    edits: [
      ['src/main/services/library.mjs', "import { existsSync, readdirSync, statSync } from 'node:fs'", "import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'"],
      ['src/main/services/library.mjs', '      save(withoutLibrary(registry(), id))', "      save(withoutLibrary(registry(), id)); unlinkSync(join(e.path, 'streams.json'))"],
    ],
    test: ['test/ui-advanced.test.mjs', '--test-name-pattern=R4b-3 移除该库'],
  },
  {
    id: 'r4b-total-without-agent',
    what: '设置\'s 本月用量合计 leaves the main agent\'s calls out of the total (its line still shown)',
    edits: [['src/main/services/library.mjs', '        month: t.month, calls: t.calls, inputTokens:', '        month: t.month, calls: t.calls - (t.agent?.calls ?? 0), inputTokens:']],
    test: ['test/ui-settings-i.test.mjs', '--test-name-pattern=R4b-4 库与用量'],
  },
  {
    id: 'r4b-custom-not-shown',
    what: 'thresholds changed by hand (no level) — 严格程度 does not say 自定义',
    edits: [['src/renderer/screens/sources.js', "      ${savedLevel === 'custom' ? html`<button type=\"button\" role=\"radio\"", "      ${false ? html`<button type=\"button\" role=\"radio\""]],
    test: ['test/ui-advanced.test.mjs', '--test-name-pattern=a threshold changed by hand'],
  },
  {
    id: 'r4b-copy-in-banner',
    what: '复制诊断信息 is back on the library page\'s banner (not only in 设置 → 关于 → 高级)',
    edits: [['src/renderer/screens/problem-card.js', '        html`<${Btn} key="change" name="change" disabled=${busy} onClick=${onChange}>${P.change}<//>`,\n', "        html`<${Btn} key=\"change\" name=\"change\" disabled=${busy} onClick=${onChange}>${P.change}<//>`,\n        html`<${Btn} key=\"copy\" name=\"copy\" quiet disabled=${busy} onClick=${() => call('copyDiagnostics')}>复制诊断信息<//>`,\n"]],
    test: ['test/ui-settings-i.test.mjs', '--test-name-pattern=R4b-4 关于'],
  },
  {
    id: 'r4b-agent-part-back',
    what: '设置 has its 主 Agent part again',
    edits: [['src/renderer/screens/settings.js', '          <${Group} id="look" name=${T.groups.look}>', '          <div data-part="agent" data-group="agent">主 Agent</div>\n          <${Group} id="look" name=${T.groups.look}>']],
    test: ['test/ui-settings-i.test.mjs', '--test-name-pattern=R4b-4 four parts'],
  },
  {
    id: 'r4b-draft-overwritten',
    what: '定时与上限: a re-read that lands while the user types puts the saved time back over what they typed',
    edits: [['src/renderer/screens/sources.js', '  useEffect(() => { if (d && !draft.current) { setOn(d.enabled); setTime(d.time) } }, [d?.enabled, d?.time])', '  useEffect(() => { if (d) { setOn(d.enabled); setTime(d.time) } }, [d?.enabled, d?.time])']],
    test: ['test/ui-schedule.test.mjs', '--test-name-pattern=a new time'],
  },
  // the new logo (docs/checks/2026-11-12-logo/contract.md 「测」: each 反向 named there, and a few more)
  {
    id: 'logo-mark-black',
    what: 'the brand mark is written black (#000) instead of the theme\'s ink (currentColor)',
    edits: [['src/renderer/lib/brand-mark.js', '<path transform=${MARK.transform} fill="currentColor" d=${MARK.d} />', '<path transform=${MARK.transform} fill="#000" d=${MARK.d} />']],
    test: ['test/ui-brand.test.mjs', '--test-name-pattern=· dark:'],
  },
  {
    id: 'logo-weave-back',
    what: 'the sidebar\'s brand is the template\'s weave glyph again',
    edits: [['src/renderer/kit/sidebar.js', '      <span class="brandmark"><${BrandMark} /></span>', '      <span class="brandmark"><${TIcon} name="weave" /></span>']],
    test: ['test/ui-brand.test.mjs', '--test-name-pattern=the sidebar\'s brand is'],
  },
  {
    id: 'logo-path-changed',
    what: 'one number of the mark\'s path data differs from mark-black.svg (13 → 12: the long middle stream shorter)',
    edits: [['src/renderer/lib/brand-mark.js', 'M3 4L13 4L12 5L2 5Z', 'M3 4L12 4L12 5L2 5Z']],
    test: ['test/ui-brand.test.mjs', '--test-name-pattern=the sidebar\'s brand is'],
  },
  {
    id: 'logo-overlay-gone',
    what: 'the overlay\'s rule for the brand mark is gone (the template\'s tile and colour come back; 单线黑白 hides the svg for its 3D picture)',
    edits: [['src/renderer/styles/template-app.css', /^\.r11\.r11\.r11\.r11 \.st-sidebar \.brand \.brandmark \{[^\n]*\n/m, '']],
    test: ['test/ui-brand.test.mjs', '--test-name-pattern=the mark is the theme\'s ink'],
  },
  {
    id: 'logo-avatar-weave',
    what: '流息\'s speaker avatar in 问库 is the template\'s weave glyph again',
    edits: [['src/renderer/screens/ask.js', '<span class="avatar"><${BrandMark} /></span>', '<span class="avatar"><${TIcon} name="weave" fallback="spark" /></span>']],
    test: ['test/ui-ask-r3.test.mjs', '--test-name-pattern=speaker avatar'],
  },
  {
    id: 'logo-icon-source',
    what: 'one byte of icon-16.svg changed (#000000 → #000001): the source is no longer the design\'s file',
    edits: [['assets/icon/icon-16.svg', 'fill="#000000"', 'fill="#000001"']],
    test: ['test/icon.test.mjs', '--test-name-pattern=byte for byte'],
  },
  // redesign R5a (docs/checks/2026-11-12-r5a/contract.md 「测」: each 反向 named there, and a few more)
  {
    id: 'r5a-no-event',
    what: 'a 系统检测 made or handled sends no suggestions-changed (the page would depend on the order things run in)',
    edits: [['src/main/services/agent.mjs', "  const changed = (libraryId, key, status) => emit('suggestions-changed', { libraryId, key, status })", '  const changed = () => 0']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-1 listToConfirm'],
  },
  {
    id: 'r5a-view-current-only',
    what: 'the one view lists the current library\'s 系统检测 only',
    edits: [['src/main/services/agent.mjs', '    const libs = libraryId ? [library.entryOf(libraryId)] : library.entries()', '    const libs = libraryId ? [library.entryOf(libraryId)] : library.entries().filter(l => l.id === library.current()?.libraryId)']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-1 listToConfirm'],
  },
  {
    id: 'r5a-view-raw-evidence',
    what: 'the one view hands the page a 系统检测\'s evidence as it is (the fetcher\'s message, the HTTP code)',
    edits: [['src/main/services/agent.mjs', '    const evidence = suggestionFacts(s)\n', '    const evidence = s.evidence\n']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-1 listToConfirm'],
  },
  {
    id: 'r5a-act-current-only',
    what: 'actOnSuggestion acts on the current library whatever library id it is given',
    edits: [['src/main/services/agent.mjs', '    async actOnSuggestion(libraryId, key, action) {\n      const e = library.entryOf(libraryId)', '    async actOnSuggestion(libraryId, key, action) {\n      const e = library.entryOf(library.current()?.libraryId ?? libraryId)']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-2 actOnSuggestion'],
  },
  {
    id: 'r5a-confirm-no-collapse',
    what: 'a confirmed 暂停该来源 leaves the same source\'s ① ③ open until something lists them',
    edits: [['src/main/services/proposals.mjs', '    try { afterConfirmed(card) } catch', '    try { void afterConfirmed } catch']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=collapses that source'],
  },
  {
    id: 'r5a-forward-raw',
    what: '交由主 Agent 分析 hands the agent the card\'s evidence JSON (with the fetcher\'s message) beside the words',
    edits: [['src/main/services/agent.mjs', "    const t = await turn(text, { libraryId: entry.id, as: 'note' })", "    const t = await turn(`${text} ${JSON.stringify(s.evidence)}`, { libraryId: entry.id, as: 'note' })"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=交由主 Agent 分析'],
  },
  {
    id: 'r5a-dismiss-no-check',
    what: 'rule ⑤ waits for the end of a run (nothing is checked when a 放弃 is written)',
    edits: [['src/main/services/pipeline.mjs', '    try { afterDismiss({ dir: h.dir, libraryId: h.libraryId }) } catch', '    try { void afterDismiss } catch']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=right after a 放弃'],
  },
  {
    id: 'r5a-rescore-no-cap',
    what: '重新评分 from the page does not keep to the library\'s 单次运行上限',
    edits: [['src/main/services/pipeline.mjs', "probe: counter.wrap(a.connector, 'probe').probe }, cap, ctx:", "probe: counter.wrap(a.connector, 'probe').probe }, cap: 100000, ctx:"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=重新评分 through the queue'],
  },
  {
    id: 'r5a-rescore-no-queue',
    what: '重新评分 starts at once, past the one queue of the runs',
    edits: [['src/main/services/pipeline.mjs', '      if (rescoreGate) return rescoreGate({ id: e.id, path: e.path })', '      if (false) return rescoreGate({ id: e.id, path: e.path })']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=重新评分 through the queue'],
  },
  {
    id: 'r5a-raw-try-message',
    what: 'trySource hands the page the fetcher\'s message and the HTTP code again',
    edits: [['src/main/services/sources.mjs', '        status: r.status, hint: r.hint ?? null, count: items.length,', "        status: r.status, hint: r.hint ?? null, http: r.http ?? null, message: r.message ?? '', count: items.length,"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6'],
  },
  {
    id: 'r5a-diag-no-raw',
    what: '复制诊断信息 leaves out the raw error texts the page was not given',
    edits: [['src/main/diagnostics.mjs', "    ...(rawErrors.length ? rawErrors : ['(none)']),", "    '(none)',"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6'],
  },
  {
    id: 'r5a-problem-detail',
    what: 'a run\'s problems reach the page with their raw detail',
    edits: [['src/main/public-data.mjs', '    return { code: p.code ?? null,', '    return { detail: p.detail, code: p.code ?? null,']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6'],
  },
  {
    id: 'r5a-list-no-stale',
    what: 'the one view lists a 系统检测 that no longer fits (no 过时 check before listing)',
    edits: [['src/main/services/agent.mjs', '      if (!library.usable(l.path)) continue\n      checkLibrary(l.id)\n', '      if (!library.usable(l.path)) continue\n']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=no longer fits is not listed'],
  },
  {
    id: 'r5a-source-row-raw',
    what: 'getSources hands the page each row\'s fetcher message and HTTP code again',
    edits: [['src/main/services/sources.mjs', "      return { ...v, sources: (v.sources ?? []).map(s => publicSourceRow(s, { raw: rawErrors, where: 'source row' })) }", '      return v']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6 the sources'],
  },
  {
    id: 'r5a-home-raw-detail',
    what: 'getHome hands the page the last run record with its problems\' raw details',
    edits: [['src/main/services/pipeline.mjs', "        lastRound: publicResult(listRounds(dir, 1)[0] ?? null, { raw: rawErrors, where: 'last run' }),\n        // redesign R2 (N10)", '        lastRound: listRounds(dir, 1)[0] ?? null,\n        // redesign R2 (N10)']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6 the sources'],
  },
  {
    id: 'r5a-list-raw-card',
    what: 'listProposals hands the page a card\'s own try with the HTTP code and the fetcher\'s message',
    edits: [['src/main/services/proposals.mjs', '(f.libraryId === undefined || c.libraryId === f.libraryId)).map(shown)', '(f.libraryId === undefined || c.libraryId === f.libraryId))']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6 trySource'],
  },
  // redesign R5a, the two pre-checkers' findings (precheck fixes 1, 2, 3, 6, 8, 10, 11)
  {
    id: 'r5a-self-check-raw',
    what: 'startRound\'s own answer (and the queue\'s) hands the page a failed self-check\'s problems with their raw detail',
    edits: [['src/main/services/pipeline.mjs', "      return { started: false, problems: publicProblems(check.problems, { raw: rawErrors, where: `self-check ${roundId} of ${libraryId ?? '?'}` }) }", '      return { started: false, problems: check.problems }']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=a self-check that fails'],
  },
  {
    id: 'r5a-probe-detail',
    what: '测试连接 hands the page the connection\'s own text (detail) again',
    edits: [['src/main/services/connections.mjs', "      out.code = r.code ?? 'unknown'\n", "      out.code = r.code ?? 'unknown'\n      out.detail = r.detail ?? ''\n"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=测试连接'],
  },
  {
    id: 'r5a-overlap-one-side',
    what: 'rule ④ is recorded only in the library that was checked (the other one waits for a run of its own)',
    edits: [['src/main/services/agent.mjs', '    recordOtherSide({ dir, libraryId }, why)\n', '']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=two-sided'],
  },
  {
    id: 'r5a-unreadable-other-removed',
    what: 'an other library that cannot be read now (a drive taken out) counts as removed: its overlap cards expire',
    edits: [['src/main/services/agent.mjs', '  const othersOf = (libraryId, dir = null) => library.entries().filter(l => l.id !== libraryId && l.path !== dir).map(', '  const othersOf = (libraryId, dir = null) => library.entries().filter(l => l.id !== libraryId && l.path !== dir && library.usable(l.path)).map(']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=unreadable for now'],
  },
  {
    id: 'r5a-forward-recorded-first',
    what: '交由主 Agent 分析 is recorded as 已转交 although the turn had no answer (the connection failed)',
    edits: [['src/main/services/agent.mjs', '    if (t.reply === null) {', '    if (false) {']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=with the connection failing'],
  },
  {
    id: 'r5a-transcript-raw-rows',
    what: 'getAgentTranscript hands the page the rows as they are on disk (an old row\'s code and raw text)',
    edits: [['src/main/services/agent.mjs', '      const entries = upTo.slice(-limit).map(publicRow)', '      const entries = upTo.slice(-limit)']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=getAgentTranscript'],
  },
  {
    id: 'r5a-advice-not-the-page',
    what: 'the page\'s 处理建议 and the one the main agent is given say different things',
    edits: [['src/renderer/texts/common.js', "  'fix-address-or-remove': '这不是临时故障，重试没用：改地址，或删掉这个来源。',", "  'fix-address-or-remove': '重试无用，需修改地址或移除该来源。',"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=precheck fix 10'],
  },
  // redesign R5b (docs/checks/2026-11-12-r5b/contract.md 「测」): the one 提议, the 主 Agent page, 待确认, 重新评分, the page's words for
  // what went wrong — each test runs on its own (test/ui-r5b.test.mjs: a world per part, each test makes its own data)
  {
    id: 'r5b-confirm-left',
    what: 'the full card\'s buttons back to 确认 · 提出修改 · 拒绝 (the main one on the left)',
    edits: [['src/renderer/screens/proposal.js', `        <\${Btn} name="decline" kind="quiet" disabled=\${act.busy} onClick=\${act.decline}>\${T.actions.decline}<//>
        <\${Btn} name="revise" disabled=\${act.busy} onClick=\${() => setReviseOpen(o => !o)}>\${T.actions.revise}<//>
        <\${Btn} name="confirm" kind="primary" disabled=\${act.busy} onClick=\${act.confirm}><\${TIcon} name="approve" fallback="check" />\${create ? T.actions.create : T.actions.confirm}<//>
      </div>
    </div>`, `        <\${Btn} name="confirm" kind="primary" disabled=\${act.busy} onClick=\${act.confirm}><\${TIcon} name="approve" fallback="check" />\${create ? T.actions.create : T.actions.confirm}<//>
        <\${Btn} name="revise" disabled=\${act.busy} onClick=\${() => setReviseOpen(o => !o)}>\${T.actions.revise}<//>
        <\${Btn} name="decline" kind="quiet" disabled=\${act.busy} onClick=\${act.decline}>\${T.actions.decline}<//>
      </div>
    </div>`]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 ten'],
  },
  {
    id: 'r5b-system-main-left',
    what: 'a 系统检测\'s buttons in the 动作表\'s order as given (the main one on the left, 忽略 on the right)',
    edits: [['src/renderer/screens/proposal.js', 'const actions = list(item.actions).slice().reverse()', 'const actions = list(item.actions).slice()']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 ①'],
  },
  {
    id: 'r5b-threshold-number',
    what: '严格程度 on the card with the thresholds\' numbers again',
    // redesign R5b precheck fix 1: the line it edits now says 自定义's place (customText)
    edits: [['src/renderer/screens/proposal.js', "const levelText = t => (levelOf(t) === 'custom' ? customText(t) : C.levels[levelOf(t)])", "const levelText = t => `${levelOf(t) === 'custom' ? customText(t) : C.levels[levelOf(t)]} 相关度 ≥ ${t?.relevance} · 实质 ≥ ${t?.substance}`"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 ten'],
  },
  {
    id: 'r5b-old-word',
    what: '拒绝 is 不要 again (05 不再用)',
    edits: [['src/renderer/texts/proposals.js', "    decline: '拒绝',\n    pauseSource", "    decline: '不要',\n    pauseSource"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 ten'],
  },
  {
    id: 'r5b-raw-on-card',
    what: 'a failed proposal\'s line says the raw error',
    edits: [['src/renderer/screens/proposal.js', '>${failureText(card)}</span>', '>${card.failure?.message ?? failureText(card)}</span>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 the states'],
  },
  {
    id: 'r5b-waiting-back',
    what: '「等你定的事」 is back above the conversation',
    edits: [['src/renderer/screens/chat.js', '          <div class="thread" data-part="conversation">', '          <section data-part="waiting"><h2>等你定的事 · ${n}</h2></section><div class="thread" data-part="conversation">']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 the page'],
  },
  {
    id: 'r5b-panel-not-decide',
    what: 'the 主 Agent page leaves the right panel on the tab it had (not 待确认)',
    edits: [['src/renderer/screens/chat.js', "    if (panel && panel.tab !== 'decide') setPanel?.({ tab: 'decide' })", '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 the page'],
  },
  {
    id: 'r5b-calls-design',
    what: 'the line under the box says the design\'s 1–2 calls, not the core\'s 1–4',
    edits: [['src/renderer/screens/proposal.js', 'export const AGENT_CALLS = Object.freeze({ lo: 1, hi: 4, max: 18 })', 'export const AGENT_CALLS = Object.freeze({ lo: 1, hi: 2, max: 18 })']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 the page'],
  },
  {
    id: 'r5b-create-stays',
    what: '创建 leaves the page where it is (not the new library\'s 待看)',
    edits: [['src/renderer/screens/proposal.js', "await app?.openLibrary?.(next.result.libraryId, { screen: 'inbox', params: {} })", 'void 0']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 创建'],
  },
  {
    id: 'r5b-count-fixed',
    what: '待确认\'s number on the tab is written in, not the list\'s length',
    edits: [['src/renderer/screens/right-panel.js', '  const n = toConfirm?.items?.length ?? 0', '  const n = 4']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 O5'],
  },
  {
    id: 'r5b-no-event',
    what: '待确认 is not read again on suggestions-changed (a new 系统检测 shows only after something else reloads it)',
    edits: [['src/renderer/lib/agent.js', "  useEvent('suggestions-changed', again, [enabled])\n", '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 O5'],
  },
  {
    id: 'r5b-list-twice',
    what: 'on a library\'s page its 系统检测 are listed again below the list',
    edits: [['src/renderer/screens/right-panel.js', '    ${n ? html`<div class="st-stack" data-part="decide-list">${items.map(i => html`<${Proposal} key=${i.id} item=${i} size="compact" />`)}</div>` : null}',
      '    ${n ? html`<div class="st-stack" data-part="decide-list">${items.map(i => html`<${Proposal} key=${i.id} item=${i} size="compact" />`)}</div>` : null}\n    <div data-part="suggestions">${items.filter(i => i.from === \'system\' && i.libraryId === useApp().appState?.data?.library?.libraryId).map(i => html`<${Proposal} key=${`again:${i.id}`} item=${i} size="compact" />`)}</div>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 one list'],
  },
  {
    id: 'r5b-sync-off',
    what: 'the conversation\'s cards are not read again on proposals-changed (one decided in 待确认 stays pending there)',
    edits: [['src/renderer/lib/agent.js', "  useEvent('proposals-changed', () => list.reload())\n", '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 the same proposal'],
  },
  {
    id: 'r5b-act-current-only',
    what: 'a 系统检测\'s action is sent for the current library, whatever library the card is of',
    edits: [['src/renderer/screens/proposal.js', "    try { r = await call('actOnSuggestion', item.libraryId, item.key, a.id) }", "    try { r = await call('actOnSuggestion', app?.appState?.data?.library?.libraryId ?? item.libraryId, item.key, a.id) }"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 a 系统检测 of a library'],
  },
  {
    id: 'r5b-edit-address-no-dialog',
    what: '修改地址 opens 来源与要求 without the row\'s 修改地址 dialog',
    edits: [['src/renderer/screens/sources.js', "    if (source) setDialog({ kind: 'edit-source', source })", '    void source']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 修改地址'],
  },
  {
    id: 'r5b-rescore-always',
    what: '重新评分\'s notice and button also when nothing was judged under the old standard',
    edits: [['src/renderer/screens/inbox.js', '  if (!rescore || !(rescore.total > 0)) return null', '  if (!rescore) return null']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-4 a library whose'],
  },
  {
    id: 'r5b-code-funnel',
    what: '运行漏斗 says the code it does not know, in brackets ({code} back)',
    edits: [['src/renderer/screens/run-funnel.js', '  return T.what.other', "  return `${T.what.other}（${code ?? stop?.code ?? ''}）`"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9'],
  },
  {
    id: 'r5b-code-problem',
    what: '问题卡 says the connection\'s code it does not know ({code} back)',
    edits: [['src/renderer/screens/problem-card.js', '    const text = fmt(known ? P.connection[code] : P.connection.other, { name, n })', "    const text = `${fmt(known ? P.connection[code] : P.connection.other, { name, n })}（${code}）`"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9'],
  },
  {
    id: 'r5b-code-library',
    what: '资料库\'s file rules say the code they do not know ({code} back)',
    edits: [['src/renderer/screens/library.js', '  return T.pending.other', "  return `${T.pending.other}（${c}）`"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9'],
  },
  // redesign R5b precheck fixes (11-13): each fix's reverse, on the test that holds it (test/ui-r5b.test.mjs)
  {
    id: 'r5b-custom-manual',
    what: '自定义 on a proposal says 「通过阈值已在「高级设置」中手动修改」 again (no one edited it by hand)',
    edits: [['src/renderer/screens/proposal.js', "const levelText = t => (levelOf(t) === 'custom' ? customText(t) : C.levels[levelOf(t)])", "const levelText = t => (levelOf(t) === 'custom' ? '自定义（通过阈值已在「高级设置」中手动修改）' : C.levels[levelOf(t)])"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 自定义'],
  },
  {
    id: 'r5b-custom-no-delta',
    what: '自定义 → 自定义 in the same place: 修改后 reads the same as 修改前, nothing says what changed',
    edits: [['src/renderer/screens/proposal.js', '    return delta ? `${text}${C.delta.sep}${delta}` : text', '    return text']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 自定义'],
  },
  {
    id: 'r5b-edit-address-remembered',
    what: '修改地址\'s parameter stays in the route the library remembers (coming back to the library opens the dialog again)',
    edits: [['src/renderer/screens/sources.js', "    const { editAddress: _done, ...rest } = params\n    navigate('sources', rest)\n", '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-1 修改地址'],
  },
  {
    id: 'r5b-calls-no-most',
    what: 'the line under the box says the usual calls only (1–4), not the most (retries, the summary)',
    edits: [['src/renderer/texts/agent.js', "    calls: '每条消息通常 {lo}–{hi} 次模型调用；回答需要重试或整理对话记录时会更多，最多 {max} 次模型调用',", "    calls: '每条消息预计 {lo}–{hi} 次模型调用（需要查询各库情况时次数较多）',"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 the page'],
  },
  {
    id: 'r5b-calls-most-wrong',
    what: 'the most calls of one message is not the core\'s (4 instead of 18)',
    edits: [['src/renderer/screens/proposal.js', 'export const AGENT_CALLS = Object.freeze({ lo: 1, hi: 4, max: 18 })', 'export const AGENT_CALLS = Object.freeze({ lo: 1, hi: 4, max: 4 })']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-2 the page'],
  },
  {
    id: 'r5b-titles-again',
    what: 'the right panel lists the proposals\' titles a second time (a plain list, none of the old markup)',
    edits: [
      ['src/renderer/screens/right-panel.js', "import { Proposal } from './proposal.js'", "import { Proposal, proposalTitle } from './proposal.js'"],
      ['src/renderer/screens/right-panel.js', '    ${n ? html`<div class="st-stack" data-part="decide-list">${items.map(i => html`<${Proposal} key=${i.id} item=${i} size="compact" />`)}</div>` : null}',
        '    ${n ? html`<div class="st-stack" data-part="decide-list">${items.map(i => html`<${Proposal} key=${i.id} item=${i} size="compact" />`)}</div>` : null}\n    <ul>${items.map(i => html`<li key=${i.id}>${proposalTitle(i)}</li>`)}</ul>'],
    ],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 one list'],
  },
  {
    id: 'r5b-code-drawn-problem',
    what: '问题卡 as drawn puts the code back in brackets after its sentence',
    edits: [['src/renderer/screens/problem-card.js', '<div class="today-problem__text">${text}</div>', '<div class="today-problem__text">${text}（${problem.connectionCode ?? problem.code}）</div>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-code-drawn-funnel',
    what: '运行漏斗 as drawn puts the stop\'s code back in brackets after its line',
    edits: [['src/renderer/screens/run-funnel.js', "data-code=${f.stop.connectionCode ?? f.stop.code ?? ''}>${stopLine(f.stop)}</p>", "data-code=${f.stop.connectionCode ?? f.stop.code ?? ''}>${stopLine(f.stop)}（${f.stop.connectionCode ?? f.stop.code}）</p>"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-code-drawn-library',
    what: '资料库\'s file card as drawn says each rule with its code in brackets',
    edits: [['src/renderer/screens/library.js', '<small data-part="card-codes">${[folder, codes.map(pendingWords).join(SEP)]', '<small data-part="card-codes">${[folder, codes.map(c => `${pendingWords(c)}（${c}）`).join(SEP)]']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-why-raw',
    what: '运行漏斗 says a stop\'s reason it has no words for as it is',
    edits: [['src/renderer/screens/run-funnel.js', ': fmt(T.stopWhy.other, { what: stopWhat(stop) })', ': why']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-today-old-words',
    what: '问题卡\'s new sentence for a connection problem in the words 05 no longer uses (这一轮 · 打分 · 没丢)',
    edits: [['src/renderer/texts/today.js', "      other: '{name} 连接出现问题，本次运行未完成评分。已抓取的 {n} 条内容已保留。',", "      other: '{name} 连接出现问题，这一轮没有打分。抓到的 {n} 条都在，没丢。',"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-http-back',
    what: '来源与要求\'s state chip says an HTTP code again when the row has one',
    edits: [['src/renderer/screens/sources.js', '    return fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })', '    return s.http ? `${word} · HTTP ${s.http}` : fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=precheck fix 11'],
  },
  {
    id: 'r5b-rescore-mark-all',
    what: 'every row of 未通过筛选 is marked 按旧标准评分, also the one judged under the standard of now',
    edits: [['src/renderer/screens/inbox.js', '${r.old === true ? html`<span class="status-chip" data-part="old">', '${true ? html`<span class="status-chip" data-part="old">']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-4 严格程度 changed'],
  },
  {
    id: 'r5b-rescore-count-all',
    what: '重新评分\'s notice counts every row of 未通过筛选, not the old ones',
    edits: [['src/renderer/screens/inbox.js', '<${RescoreAlert} rescore=${d?.rescore ?? null}', '<${RescoreAlert} rescore=${d?.rescore ? { ...d.rescore, total: rejected.total } : null}']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-4 严格程度 changed'],
  },
  {
    id: 'r5b-eyebrow-caps',
    what: 'the small card\'s top line in the template\'s capitals again (「主 AGENT 提议 · AI AGENT 记忆」)',
    edits: [['src/renderer/styles/template-app.css', '.st-rp-decide [data-part="from"] { text-transform: none; }\n', '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 the small cards'],
  },
  {
    id: 'r5b-buttons-left',
    what: 'a small card whose buttons fit one row has them on the left again (the main one not at the right edge)',
    edits: [['src/renderer/styles/template-app.css', '.st-rp-decide .confirm-footer .row { margin-left: auto; }\n', '']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 the small cards'],
  },
  {
    id: 'r5b-time-spliced',
    what: 'a time spliced into the line with spaces round it again (「最近一次 今天 09:33」)',
    edits: [['src/renderer/texts/proposals.js', "    'source-failing': '暂时失败 {failed} 次 · 被拒绝 {blocked} 次 · 最近一次：{when}',", "    'source-failing': '暂时失败 {failed} 次 · 被拒绝 {blocked} 次 · 最近一次 {when}',"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-3 the small cards'],
  },
  {
    id: 'r5b-lead-when-empty',
    what: '待确认 says 「以下事项均需确认后才会执行。」 with nothing below it',
    edits: [['src/renderer/screens/right-panel.js', '      ${n ? html`<p data-part="decide-lead">${L.lead}</p>` : null}', '      <p>${L.lead}</p>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=precheck fix 9'],
  },
]

function runTest(desktop, test) {
  // node's own options (the name pattern) before the file: after it they would be arguments of the test file
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...test.slice(1), test[0]], {
    cwd: desktop, encoding: 'utf8', maxBuffer: 64 << 20, env: process.env,
  })
  const failed = [...r.stdout.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m => m[1])
  const passed = [...r.stdout.matchAll(/^\s*ok \d+ - (.+)$/gm)].map(m => m[1])
  return { status: r.status, failed, passed, tail: `${r.stdout}${r.stderr}`.split('\n').slice(-25).join('\n') }
}

/** How often `from` occurs in `text` (a RegExp keeps its own flags, e.g. m). */
function occurrences(text, from) {
  if (typeof from === 'string') return text.split(from).length - 1
  return (text.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`)) ?? []).length
}

// an argument is a mutant's id, or a prefix ending in * (e.g. r4b-*: every mutant of package R4b)
const only = process.argv.slice(2)
const picks = (arg, id) => (arg.endsWith('*') ? id.startsWith(arg.slice(0, -1)) : id === arg)
const unknown = only.filter(arg => !MUTANTS.some(m => picks(arg, m.id)))
if (unknown.length) {
  process.stderr.write(`no mutant ${unknown.join(', ')} (ids: ${MUTANTS.map(m => m.id).join(', ')})\n`)
  process.exit(2)
}
const chosen = MUTANTS.filter(m => only.length === 0 || only.some(arg => picks(arg, m.id)))
// the originals the chosen mutants edit, hashed before and after
const targets = [...new Set(chosen.flatMap(m => m.edits.map(e => e[0])))]
const hashOf = () => Object.fromEntries(targets.map(f => [f, createHash('sha256').update(readFileSync(join(DESKTOP_DIR, f))).digest('hex')]))
const before = hashOf()
const results = []
for (const m of chosen) {
  const root = tempDir(`st-mutant-${m.id}-`)
  try {
    const { desktop } = await makeMirror({ root })
    const control = runTest(desktop, m.test)
    for (const [file, from, to] of m.edits) {
      const path = join(desktop, file)
      const text = readFileSync(path, 'utf8')
      const count = occurrences(text, from)
      if (count !== 1) throw new Error(`${m.id}: expected the text to change once in ${file}, found ${count}`)
      // a plain text edit is taken literally; a RegExp edit's replacement may use $1
      writeFileSync(path, typeof from === 'string' ? text.replace(from, () => to) : text.replace(from, to))
    }
    const broken = runTest(desktop, m.test)
    const ok = control.status === 0 && control.passed.length > 0 && broken.status !== 0 && broken.failed.length > 0
    results.push({ id: m.id, what: m.what, test: m.test.join(' '), control: { status: control.status, passed: control.passed }, broken: { status: broken.status, failed: broken.failed }, caught: ok })
    process.stdout.write(`${ok ? 'CAUGHT ' : 'MISSED '} ${m.id} · control ${control.status === 0 ? 'passes' : 'FAILS'} (${control.passed.length} ok) · broken copy ${broken.status !== 0 ? 'fails' : 'PASSES'}: ${broken.failed.join(' | ')}\n`)
    if (!ok) process.stdout.write(`--- control\n${control.tail}\n--- broken\n${broken.tail}\n`)
  } finally {
    removeTree(root, { waitMs: 10_000 })
  }
}
const after = hashOf()
const untouched = JSON.stringify(before) === JSON.stringify(after)
process.stdout.write(`${JSON.stringify({ mutants: results.length, caught: results.filter(r => r.caught).length, originals_unchanged: untouched, files_hashed: targets.length }, null, 1)}\n`)
process.exit(results.every(r => r.caught) && untouched ? 0 : 1)
