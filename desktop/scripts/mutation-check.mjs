#!/usr/bin/env node
// `npm run mutants` — each check of the shell must be able to fail: break a copy of desktop/ on purpose, run the check
// there, and see it fail; the same check on an unbroken copy passes. Every copy is a mirror under the OS temp folder
// (scripts/lib/mirror.mjs). The originals are never edited — the files the mutants edit are hashed before and after.
//   npm run mutants                       all of them
//   npm run mutants -- no-node d2-unc      some, by id
// An edit is [file, text or RegExp (must match exactly once), replacement] — the file relative to desktop/ ('../tests/acceptance/…'
// is the mirror's copy of the acceptance tests, redesign R6a; never a path into a linked folder: core, installer, wording); a RegExp edit is read from the file as
// it is now (e.g. the METHODS line), its replacement may use $1.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeMirror } from './lib/mirror.mjs'
import { DESKTOP_DIR, REPO_DIR } from './lib/paths.mjs'
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
    // redesign R6b-2: anchored in shell.js (texts/screens.js, the placeholder screen's table, is deleted as dead code)
    edits: [['src/renderer/texts/shell.js', "    problem: '该库存在异常',\n    inboxBadge:", "    problem: '该库存在异常，先 pending',\n    inboxBadge:"]],
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
    // redesign R6b-2: anchored in shell.js (texts-en/screens.js is deleted with the placeholder screen)
    edits: [['src/renderer/texts-en/shell.js', "    mine: 'My libraries',\n    newLibrary: 'New library',\n", "    mine: 'My libraries',\n"]],
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
    id: 'r2-no-unverified-mark',
    what: 'the card no longer carries 「未通过核验」',
    edits: [['src/renderer/screens/inbox.js', "        ${unverified ? html`<${Mark} attrs=${{ 'data-unverified': '' }}>${T.card.unverified}<//>` : null}\n", '']],
    test: ['test/ui-inbox.test.mjs', '--test-name-pattern=cards in the core'],
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
    what: '问库\'s 「已加入待补充主题」 is the page\'s own state only: opened again, the answer says 「加入待补充主题」 again',
    edits: [['src/renderer/screens/ask.js', 'const added = named ? demandAdded(demands, missing, question) : noted !== null && demandAdded(demands, noted, question)', 'const added = noted !== null']],
    test: ['test/ui-ask-r3.test.mjs', '--test-name-pattern=an answer|加入待补充主题'],
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
    id: 'r4a-edit-order-back',
    what: '编辑笔记\'s foot is 保存 · 取消 again (保存 not on the right, P11)',
    edits: [['src/renderer/screens/edit-dialog.js', /(<span class="st-act" data-action="cancel-edit">[^\n]*<\/span>)\n(\s*)(<span class="st-act" data-action="save-edit">[^\n]*<\/span>)/, '$3\n$2$1']],
    test: ['test/ui-library.test.mjs', '--test-name-pattern=R3-3 编辑笔记'],
  },
  // redesign R4b (docs/checks/2026-11-12-r4b/contract.md 「测」: each 反向 named there, and a few more)
  {
    id: 'r4b-name-not-saved',
    what: '库名称 saved (setLibraryMeta) changes the registry only — streams.json `name` is not written (nor recorded); 1.1 W7b: held by the registry test (来源与要求\'s 库名称 field went with v1.0\'s editing)',
    edits: [['src/main/services/library.mjs', "        try { byYou(e.path, ['name'], () => saveLibraryName(e.path, meta.name), { log, now }) } catch (err) { throw bridgeErrorOf(err) }", '        void saveLibraryName']],
    test: ['test/services-registry.test.mjs', '--test-name-pattern=setLibraryMeta: name'],
  },
  {
    id: 'r4b-manual-not-recorded',
    what: 'a change made on the page is written but 变更记录 misses it (byYou records no line); 1.1 W7b: the schedule saved on 来源与要求',
    edits: [['src/main/services/changes.mjs', "      const lines = recordChanges(dir, before, snapshot(dir, fields), { by: 'you', now })", '      const lines = []']],
    test: ['test/ui-sources.test.mjs', '--test-name-pattern=R4b-1 定时'],
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
    // (1.1.1 P11a: the same guard, the effect sets the rhythm too)
    edits: [['src/renderer/screens/sources.js', '    if (d && !draft.current) { setOn(d.enabled);', '    if (d) { setOn(d.enabled);']],
    // redesign R6b-5: pointed at the test that makes a re-read land for real (a third time through the bridge, waited for). The
    // test it used to name (「a new time」) only met the re-read by timing: with 80 ms between 保存 and the next fill it missed
    test: ['test/ui-schedule.test.mjs', '--test-name-pattern=R6b-5 a time typed and not saved'],
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
  // redesign R6a (docs/checks/2026-11-13-r6a/contract.md 「测」): the serif font, the four standards' sentences and the words that
  // follow them, the shelf's selected card — each test runs on its own (test/r6a.test.mjs, test/ui-r6a.test.mjs: every test sets
  // what it needs; the acceptance tests V6 / V8 / V9 / V10 run from the mirror's copy of tests/acceptance on the mirror's desktop/)
  // 1.1 W7b: the mutants that ran 1.0's acceptance tests (V3 / V6 / V8 / V9, tests/acceptance) are gone or point at a desktop
  // test: that suite drives v1.0's round, which left core/src in W7b's core step (the suite itself is not the desktop step's)
  {
    id: 'r6a-font-family',
    what: 'the face is declared under a name the template does not ask for (Noto Serif SCx): 研究对话\'s headings fall to whatever the machine has',
    edits: [['src/renderer/styles/base.css', "@font-face { font-family: 'Noto Serif SC';", "@font-face { font-family: 'Noto Serif SCx';"]],
    test: ['test/ui-r6a.test.mjs', '--test-name-pattern=R6a-1 研究对话'],
  },
  {
    id: 'r6a-font-file',
    what: 'the face points at a file that is not there (the font moved away)',
    edits: [['src/renderer/styles/base.css', "src: url('../fonts/NotoSerifSC-VF.ttf')", "src: url('../fonts/NotoSerifSC-VF-moved.ttf')"]],
    test: ['test/ui-r6a.test.mjs', '--test-name-pattern=R6a-1 研究对话'],
  },
  {
    id: 'r6a-font-face-plain',
    what: 'the face in base.css names another file of the folder (the interface font under the serif\'s name)',
    edits: [['src/renderer/styles/base.css', "src: url('../fonts/NotoSerifSC-VF.ttf')", "src: url('../fonts/NotoSansSC-VF.ttf')"]],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-1 styles/base.css'],
  },
  {
    id: 'r6a-licenses-no-row',
    what: 'the license page\'s data has no row for Noto Serif SC',
    edits: [['src/main/licenses.mjs', '    { name: DISPLAY_FONT.name, version: fontVersion(readFileSync(join(desktopDir, ...DISPLAY_FONT.file))), license: DISPLAY_FONT.license },\n', '']],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-1 the license page'],
  },
  {
    id: 'r6a-licenses-other-text',
    what: 'the heading font\'s license text on the license page is the interface font\'s file',
    edits: [['src/main/licenses.mjs', "text: readFileSync(join(desktopDir, ...DISPLAY_FONT.licenseFile), 'utf8') },", "text: readFileSync(join(desktopDir, ...FONT.licenseFile), 'utf8') },"]],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-1 the license page'],
  },
  {
    id: 'r6a-licenses-no-line',
    what: '许可证与致谢 has no 「标题字体 · Noto Serif SC」 line',
    edits: [['src/renderer/screens/settings.js', '${d.displayFont ? html`<section class="readable" data-part="display-font"', '${d.displayFont === 0 ? html`<section class="readable" data-part="display-font"']],
    // the whole file: the dialog is opened by its first test
    test: ['test/ui-licenses.test.mjs'],
  },
  {
    id: 'r6a-standard-v6-old',
    what: 'standards.mjs: V6 is the sentence before the maintainer\'s 11-11 change again',
    edits: [['../tests/acceptance/standards.mjs', '登录过期时，本次运行不开始，库页顶上的横幅说明，已抓取的条目完整保留', '登录过期时，当轮不开始，首页横幅说明，抓到的条目完整保留']],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-2 standards'],
  },
  {
    id: 'r6a-standard-v9-char',
    what: 'standards.mjs: V9\'s sentence one character off (no 。 inside the quotes)',
    edits: [['../tests/acceptance/standards.mjs', '库里没有的问题得到「库内暂无相关内容。」', '库里没有的问题得到「库内暂无相关内容」']],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-2 standards'],
  },
  {
    id: 'r6a-standard-v3-touched',
    what: 'standards.mjs: V3\'s standard, which the maintainer left as it was, changed',
    edits: [['../tests/acceptance/standards.mjs', '五种抓取状态各能触发，且界面文案和「怎么办」对应正确', '五种抓取状态各能触发，界面文案和「怎么办」对应正确']],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-2 standards'],
  },
  {
    id: 'r6a-standard-how-touched',
    what: 'standards.mjs: a `how` changed (V10\'s)',
    edits: [['../tests/acceptance/standards.mjs', "    how: '假连接器计数' },", "    how: '假连接器计数，界面核对' },"]],
    test: ['test/r6a.test.mjs', '--test-name-pattern=R6a-2 standards'],
  },
  {
    id: 'r6a-shelf-hover',
    what: 'the app\'s rule for the shelf\'s card under the pointer is gone (round 9\'s light surface under round 11\'s dark ink)',
    edits: [['src/renderer/styles/template-app.css', '.r11.r11.r11.r11 .project-tile:hover { color: var(--ink11); background: var(--pick); box-shadow: var(--float11); transform: none; }\n.r12-line.r11.r11.r11.r11 .project-tile:hover { background: var(--well); box-shadow: inset 4px 0 var(--ink11); }\n', '']],
    test: ['test/ui-r6a.test.mjs', '--test-name-pattern=R6a-3'],
  },
  {
    id: 'r6a-shelf-monoline-pick',
    what: '单线黑白\'s card under the pointer takes --pick like the other themes (there --pick is the ink: text on its own colour)',
    edits: [['src/renderer/styles/template-app.css', '.r12-line.r11.r11.r11.r11 .project-tile:hover { background: var(--well); box-shadow: inset 4px 0 var(--ink11); }\n', '']],
    test: ['test/ui-r6a.test.mjs', '--test-name-pattern=R6a-3 monoline'],
  },
  {
    id: 'r6a-shelf-monoline-bar',
    what: '单线黑白\'s card under the pointer has only --well, no bar of ink at its edge (in the dark set --well is close to the resting card: the selected one is hard to tell from its neighbours)',
    edits: [['src/renderer/styles/template-app.css', '.r12-line.r11.r11.r11.r11 .project-tile:hover { background: var(--well); box-shadow: inset 4px 0 var(--ink11); }\n', '.r12-line.r11.r11.r11.r11 .project-tile:hover { background: var(--well); }\n']],
    test: ['test/ui-r6a.test.mjs', '--test-name-pattern=R6a-3 monoline'],
  },
  // redesign R5a (docs/checks/2026-11-12-r5a/contract.md 「测」: each 反向 named there, and a few more)
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
    id: 'r5a-source-row-raw',
    what: 'getSources hands the page each row\'s fetcher message and HTTP code again',
    edits: [['src/main/services/sources.mjs', "      return { ...v, sources: (v.sources ?? []).map(s => publicSourceRow(s, { raw: rawErrors, where: 'source row' })) }", '      return v']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6 the sources'],
  },
  {
    id: 'r5a-home-raw-detail',
    what: 'getHome hands the page the last run record with its problems\' raw details',
    edits: [['src/main/services/pipeline.mjs', "        lastRound: publicResult(listRounds(dir, 1)[0] ?? null, { raw: rawErrors, where: 'last run' }),\n        roundState", '        lastRound: listRounds(dir, 1)[0] ?? null,\n        roundState']],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=R5a-6 the sources'],
  },
  // redesign R5a, the two pre-checkers' findings (precheck fixes 1, 2, 3, 6, 8, 10, 11)
  {
    id: 'r5a-probe-detail',
    what: '测试连接 hands the page the connection\'s own text (detail) again',
    edits: [['src/main/services/connections.mjs', "      out.code = r.code ?? 'unknown'\n", "      out.code = r.code ?? 'unknown'\n      out.detail = r.detail ?? ''\n"]],
    test: ['test/services-r5a.test.mjs', '--test-name-pattern=测试连接'],
  },
  // redesign R5b (docs/checks/2026-11-12-r5b/contract.md 「测」): the one 提议, the 主 Agent page, 待确认, 重新评分, the page's words for
  // what went wrong — each test runs on its own (test/ui-r5b.test.mjs: a world per part, each test makes its own data)
  {
    id: 'r5b-count-fixed',
    what: '待确认\'s number on the tab is written in, not the list\'s length (1.1: the build\'s waiting card)',
    edits: [['src/renderer/screens/right-panel.js', '  const n = waitingCard(build?.data) ? 1 : 0\n  const icons', '  const n = 4\n  const icons']],
    test: ['test/ui-panel.test.mjs', '--test-name-pattern=待确认: only the build'],
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
    id: 'r5b-code-drawn-problem',
    what: '问题卡 as drawn puts the code back in brackets after its sentence',
    edits: [['src/renderer/screens/problem-card.js', '<div class="today-problem__text">${text}</div>', '<div class="today-problem__text">${text}（${problem.connectionCode ?? problem.code}）</div>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-code-drawn-library',
    what: '资料库\'s file card as drawn says each rule with its code in brackets',
    edits: [['src/renderer/screens/library.js', '<small data-part="card-codes">${[folder, codes.map(pendingWords).join(SEP)]', '<small data-part="card-codes">${[folder, codes.map(c => `${pendingWords(c)}（${c}）`).join(SEP)]']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-today-old-words',
    what: '问题卡\'s new sentence for a connection problem in the words 05 no longer uses (这一轮 · 打分 · 没丢)',
    edits: [['src/renderer/texts/today.js', "      other: '{name} 连接出现问题，本次运行未开始。已抓取的 {n} 条内容已保留。',", "      other: '{name} 连接出现问题，这一轮没有打分。抓到的 {n} 条都在，没丢。',"]],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=R5b-5 O9 drawn'],
  },
  {
    id: 'r5b-http-back',
    what: '来源与要求\'s state chip says an HTTP code again when the row has one',
    edits: [['src/renderer/screens/sources.js', '    return fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })', '    return s.http ? `${word} · HTTP ${s.http}` : fmt(T.row.streakNoHttp, { state: word, n: s.consecutive ?? 1 })']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=precheck fix 11'],
  },
  {
    id: 'r5b-lead-when-empty',
    what: '待确认 says 「以下事项均需确认后才会执行。」 with nothing below it',
    edits: [['src/renderer/screens/right-panel.js', '      ${n ? html`<p data-part="decide-lead">${BUILD.panelLead}</p>` : null}', '      <p>${BUILD.panelLead}</p>']],
    test: ['test/ui-r5b.test.mjs', '--test-name-pattern=precheck fix 9'],
  },
  // redesign R6b (docs/checks/2026-11-13-r6b/contract.md 「测」): R6b-1 the five states and the four 处理建议, R6b-2 05's last pass and
  // the dead placeholder screen (R6b-5's is r4b-draft-overwritten above, pointed at its new test). Where a mutant puts a v1 word
  // back, the word is written in two pieces: the repository is searched for the v1 words (contract R6b-1, last point).
  {
    id: 'r6b-state-word-zh',
    what: 'a state\'s Chinese word on the page is not 05\'s (地址无效)',
    edits: [['src/renderer/texts/common.js', "  gap: '地址无效',", "  gap: '地址待查',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1 the five states'],
  },
  {
    id: 'r6b-state-word-v1',
    what: 'a state\'s v1 word is back on the page (the one 05 replaced with 访问被拒)',
    edits: [['src/renderer/texts/common.js', "  blocked: '访问被拒',", "  blocked: '" + '被' + "拒绝',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1'],
  },
  {
    id: 'r6b-state-word-en',
    what: 'a state\'s English word on the page is not the contract\'s (Access denied)',
    edits: [['src/renderer/texts-en/common.js', "  blocked: 'Access denied',", "  blocked: 'No access',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1 the five states'],
  },
  {
    id: 'r6b-hint-next-round',
    what: 'the 处理建议 of 暂时失败 says 下一轮 again where 05 says 下次运行',
    edits: [['src/renderer/texts/common.js', "  'retry-next-round': '下次运行时将自动重试，无需修改地址。',", "  'retry-next-round': '下一轮将自动重试，无需修改地址。',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1 the five states'],
  },
  {
    id: 'r6b-hint-failed-told-to-remove',
    what: 'a temporary failure is told what only 访问被拒 is told (请改用其他来源)',
    edits: [['src/renderer/texts/common.js', "  'retry-next-round': '下次运行时将自动重试，无需修改地址。',", "  'retry-next-round': '下次运行时将自动重试，无需修改地址。请改用其他来源。',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1 the five states'],
  },
  {
    id: 'r6b-hint-en-old',
    what: 'the English 处理建议 of 无需处理 is another sentence than the contract\'s',
    edits: [['src/renderer/texts-en/common.js', "  none: 'No action needed.',", "  none: 'There is nothing to do.',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1 the five states'],
  },
  {
    id: 'r6b-never-v1',
    what: 'a source never fetched says the v1 words again (05 规则 4: 尚未抓取)',
    edits: [['src/renderer/texts/common.js', "  never: '尚未抓取',", "  never: '" + '还没' + "抓过',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-1'],
  },
  {
    id: 'r6b-login-colloquial',
    what: '设置\'s sign-in button says the v1 words again (05 第 161 行: 已登录，重新检测)',
    edits: [['src/renderer/texts/common.js', "    again: '已登录，重新检测',", "    again: '" + '我登录' + "好了，再试一次',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-2 the colloquial'],
  },
  {
    id: 'r6b-verdict-colloquial',
    what: '核验记录 says a check did not pass in the v1 word again (统一用词: 未通过)',
    edits: [['src/renderer/texts/library.js', "  notPassed: '未通过',", "  notPassed: '" + '没' + "过',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-2 the colloquial'],
  },
  {
    id: 'r6b-english-colloquial',
    what: 'the English notification is the sentence before R6b again (round)',
    edits: [['src/main/texts-en/notify.js', "    newItems: '{library}: this run added {n} to the Inbox.',", "    newItems: '{library}: this " + 'round' + " brought {n} into your Inbox.',"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-2 the colloquial'],
  },
  {
    id: 'r6b-notify-round',
    what: 'the notification says 本轮 where 05 第 173 行 says 本次运行',
    edits: [['src/main/texts/notify.js', "    newItems: '{library}：本次运行新增 {n} 条待看。',", "    newItems: '{library}：本轮新增 {n} 条待看。',"]],
    test: ['test/services-schedule.test.mjs', '--test-name-pattern=after a round'],
  },
  {
    id: 'r6b-placeholder-import-back',
    what: 'app.css imports the deleted placeholder screen\'s style file again',
    edits: [['src/renderer/styles/app.css', "@import url('./menu.css');\n", "@import url('./menu.css');\n@import url('./screens/placeholder.css');\n"]],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-2 the placeholder'],
  },
  {
    id: 'r6b-interim-name-back',
    what: 'a style names --st-text-3 again, the interim name that went with the placeholder screen (not defined any more)',
    edits: [['src/renderer/styles/base.css', 'body { overflow: hidden; }', 'body { overflow: hidden; color: var(--st-text-3); }']],
    test: ['test/r6b-words.test.mjs', '--test-name-pattern=R6b-2 the placeholder'],
  },
  // redesign R6b-3 (docs/checks/2026-11-13-r6b/contract.md 「英文字典全量」「测」): the English word list over the dictionaries
  // (test/r6b-english.test.mjs, no window) and the 21 screens in the real window in English (test/ui-english-screens.test.mjs)
  {
    id: 'r6b-en-to-read',
    what: 'an English sentence names 待看 with the old word again (To read; the word list says Inbox)',
    edits: [['src/renderer/texts-en/panel.js', "    inboxHint: 'Click to go to the Inbox',", "    inboxHint: 'Click to go to " + 'To' + " read',"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the English word list holds'],
  },
  {
    id: 'r6b-en-round-for-run',
    what: 'an English sentence calls a run a round again (round is kept only for the verification rounds)',
    edits: [['src/renderer/texts-en/settings.js', "    turnRunning: 'A run is in progress. Update after it finishes.',", "    turnRunning: 'A " + 'round' + " is in progress. Update after it finishes.',"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the English word list holds'],
  },
  {
    id: 'r6b-en-check-for-verification',
    what: '核验模型 is the Checking model again (核验 = verification, not mixed with check)',
    edits: [['src/renderer/texts-en/settings.js', "    verify: 'Verification model',", "    verify: 'Che" + "cking model',"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the English word list holds'],
  },
  {
    id: 'r6b-en-save-for-keep',
    what: '收藏 is save again in the line under 流息怎样工作 (the word list says Keep)',
    edits: [['src/renderer/texts-en/first-run.js', 'Only items you keep become notes in the library folder.', 'Only items you ' + 'save' + ' become notes in the library folder.']],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the English word list holds'],
  },
  {
    id: 'r6b-en-proper-name-case',
    what: 'the tab 来源与要求 is written Sources & brief (the word list writes the proper name Sources & Brief)',
    edits: [['src/renderer/texts-en/shell.js', "sources: 'Sources & Brief'", "sources: 'Sources & " + "brief'"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 the English word list holds'],
  },
  {
    id: 'r6b-en-fullwidth-in-code',
    what: 'a screen writes a full-width bracket itself again (what is left to decide, on 来源与要求\'s card)',
    edits: [['src/renderer/screens/sources.js', '`${PUNCT.open}${x.default}${PUNCT.close}`', "`（${x.default}）`"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 no full-width punctuation'],
  },
  {
    id: 'r6b-en-punct-table-fullwidth',
    what: 'the English punctuation table holds a full-width bracket',
    edits: [['src/renderer/texts-en/common.js', "  open: ' (',", "  open: '（',"]],
    test: ['test/r6b-english.test.mjs', '--test-name-pattern=R6b-3 no full-width punctuation'],
  },
  {
    id: 'r6b-en-screen-key-in-chinese',
    what: 'an English key is Chinese again (库架\'s title): the shelf in the real window shows it',
    edits: [['src/renderer/texts-en/shell.js', "    title: 'Shelf',", "    title: '库架',"]],
    test: ['test/ui-english-screens.test.mjs', '--test-name-pattern=shelf · '],
  },
  // redesign R6b precheck (adversarial M1): a short word put back in Chinese that the seeded world's sentences hold inside them
  // (「…评测的新动态」, 「追踪中国…」) — it passed as the user's own while a run was looked up as a bare substring of the world's files
  {
    id: 'r6b-en-screen-short-word-beside-user',
    what: 'the shelf card\'s line is 「追踪 {what}」 — a short Chinese word the brief itself starts with, beside the user\'s brief',
    edits: [['src/renderer/texts-en/shell.js', "    tracking: 'Tracking: {what}',", "    tracking: '追踪 {what}',"]],
    test: ['test/ui-english-screens.test.mjs', '--test-name-pattern=shelf · '],
  },
  {
    id: 'r6b-zh-punct-not-frozen',
    what: 'the Chinese table of the screens\' own punctuation can be changed at run time (not frozen)',
    edits: [['src/renderer/texts/common.js', "export const PUNCT = Object.freeze({\n  open: '（',", "export const PUNCT = ({\n  open: '（',"]],
    test: ['test/texts-en.test.mjs', '--test-name-pattern=key parity'],
  },
  // redesign R6d-4 (docs/checks/2026-11-15-r6d/contract.md 「试评分失败项显示裸 id」): the fix put back, seen in each language
  // (redesign R6d precheck: the anchors follow pipeline.js, where the list's description now comes before a desc the failed
  // item carries itself — checkDesc(id, f.desc); the broken line each mutant puts back is the same as before)
  // redesign R6d-6 (total acceptance; found by the v2 draft's UC3 step 4 picture): 来源与要求 ⇄ 高级设置 no longer resets the
  // scroll of their one body — 高级设置 opened from the link at the bottom shows its middle (test/ui-r6d-scroll.test.mjs)
  {
    id: 'r6d-advanced-scroll',
    what: 'a change of view between 来源与要求 and 高级设置 keeps the body\'s scroll (高级设置 opens in its middle)',
    edits: [['src/renderer/screens/sources.js', '    if (body.current) body.current.scrollTop = 0\n', '']],
    test: ['test/ui-r6d-scroll.test.mjs', '--test-name-pattern=R6d 高级设置 opened'],
  },
  // redesign R6d-3 / R6d-2 (docs/checks/2026-11-15-r6d/contract.md): each rule of styles/template-app.css §12 (and the graph's pressed
  // node, §7) taken out again — the screen and the look where it was found is under the contrast bar again (test/ui-r6d-looks.test.mjs)
  {
    id: 'r6d-contrast-light-notes',
    what: 'light: the small notes of round 6 (.panel-summary p, .confirm-footer .muted, .after-card, .speaker small, .compose-help) are left in its fixed greys again',
    edits: [['src/renderer/styles/template-app.css', '.r11:not([data-appearance="dark"]) :is(.panel-summary p, .confirm-footer .muted, .after-card, .speaker small, .compose-help) { color: var(--sub11); }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 问库 in the four light looks'],
  },
  {
    id: 'r6d-contrast-light-rows',
    what: '精密国际主义 and 研究对话, light: .chart-row and .step-line are left in round 6\'s #777 again',
    edits: [['src/renderer/styles/template-app.css', '.r11:not([data-appearance="dark"]):is(.r11-research, .r11-precision:not(.r12-line)) :is(.chart-row, .chart-row b, .step-line) { color: var(--sub11); }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 待看 in 精密国际主义 and 研究对话, light'],
  },
  {
    id: 'r6d-contrast-activity-row',
    what: 'dark: .activity-row is left in round 6\'s #666 again',
    edits: [['src/renderer/styles/template-app.css', '.r11[data-appearance="dark"] .activity-row { color: var(--sub11); }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 待看 in the four dark looks'],
  },
  {
    id: 'r6d-contrast-glass-chosen',
    what: '澄明玻璃, dark: the chosen row\'s small lines are left in the second ink again',
    edits: [['src/renderer/styles/template-app.css', '.r11.r11-glass[data-appearance="dark"] :is(.project-item.active .project-meta, .source-card.selected p, .source-card.selected .eyebrow) { color: var(--ink11); }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 (待看|资料库) in 澄明玻璃'],
  },
  {
    id: 'r6d-contrast-card-body',
    what: '精密国际主义, dark: a card\'s body is left white again',
    edits: [['src/renderer/styles/template-app.css', '.r11-precision[data-appearance="dark"]:not(.r12-line) .card-body { background: transparent; }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 待看 in 精密国际主义, dark'],
  },
  {
    id: 'r6d-contrast-new-current',
    what: '新建库 in the sidebar keeps the solid button\'s inverse ink while it is the current screen again',
    edits: [['src/renderer/styles/template-app.css', '.r11.r11 .sidebar .navitem.new.active { color: var(--ink11); }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 新建库 in 单线黑白 and the dark looks'],
  },
  {
    id: 'r6d-contrast-lib-name',
    what: 'the library\'s name in the sidebar is faded (1.1.2: the marks are gone, the contrast check reads the names)',
    edits: [['src/renderer/styles/template-app.css', '.st-sidebar__lib-name { overflow: hidden; text-overflow: ellipsis; }\n', '.st-sidebar__lib-name { overflow: hidden; text-overflow: ellipsis; opacity: .45; }\n']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d-3 待看 in 澄明玻璃 dark and 研究对话 light'],
  },
  {
    id: 'r6d-graph-press',
    what: 'a pressed node of 图谱 takes the theme\'s pressed transform again (it jumps from under the pointer)',
    edits: [['src/renderer/styles/template-app.css', '.st-graph .st-node, .st-graph .st-node:hover, .st-graph .st-node:active { transform: translate(-50%, -50%) !important; }\n', '']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d 图谱 in 单线黑白'],
  },
  // redesign R6d: the app no longer draws again once a new look is on the page — a theme chosen in 设置 keeps the icons of the theme before it
  {
    id: 'r6d-look-icons',
    what: 'after a change of theme the page is not drawn again: the icons stay those of the theme before',
    edits: [['src/renderer/app.js', 'applyLook({ theme, scheme }).then(() => setLookDrawn(n => n + 1))', 'applyLook({ theme, scheme })']],
    test: ['test/ui-r6d-looks.test.mjs', '--test-name-pattern=R6d a theme chosen while the app runs'],
  },
  // redesign R6d-2 (docs/checks/2026-11-15-r6d/对照.md): each defect the comparison with the design's pictures found, put back
  // (test/ui-r6d-compare.test.mjs sees it in the real window; 阅读窗口's icons: test/reader.test.mjs)
  {
    id: 'r6d-cmp-step-dots',
    what: 'the running library\'s step dots are in its details again, not beside its state',
    edits: [['src/renderer/screens/right-panel.js', '${SEP}${P.here}` : \'\'}${dots}</small></span>', '${SEP}${P.here}` : \'\'}</small></span>'], ['src/renderer/screens/right-panel.js', '    <div class="phase-details">\n', '    <div class="phase-details">\n      ${running ? dots : null}\n']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 进度'],
  },
  {
    id: 'r6d-cmp-node-meta',
    what: 'the node\'s line of 图谱\'s 详情 is below the head block again',
    edits: [['src/renderer/screens/graph.js', ' lead=${meta ? html`<span data-part="node-meta">${meta}</span>` : null}>\n    <div class="st-rp-detail" data-part="node-detail" data-node-id=${node.id} data-kind=${node.kind}>\n', '>\n    <div class="st-rp-detail" data-part="node-detail" data-node-id=${node.id} data-kind=${node.kind}>\n      ${meta ? html`<p class="limit-note" data-part="node-meta">${meta}</p>` : null}\n']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 图谱'],
  },
  {
    id: 'r6d-cmp-node-rows',
    what: 'the rows of 图谱\'s 详情 keep a section\'s distance from their label again',
    edits: [['src/renderer/styles/template-app.css', '.st-rp-detail [data-part^="node-"].panel-section { margin-top: 0; }\n', '']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 图谱'],
  },
  {
    id: 'r6d-cmp-note-icon',
    what: '我的笔记 in 图谱\'s 详情 falls back to the file\'s icon again',
    edits: [['src/renderer/screens/graph.js', '<${TIcon} name=${it.status === \'authored\' ? \'note\' : \'file\'} /></span>', '<${TIcon} name=${it.status === \'authored\' ? \'note\' : \'file\'} fallback="file" /></span>']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 图谱'],
  },
  {
    id: 'r6d-cmp-edit-padding',
    what: '编辑笔记\'s dialog body has no padding again',
    edits: [['src/renderer/styles/template-app.css', '.st-edit .new-content { padding: 16px 20px 20px; max-width: none; }', '.st-edit .dialog-body { padding: 0; }\n.st-edit .new-content { padding: 16px 20px 20px; max-width: none; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 编辑笔记'],
  },
  {
    id: 'r6d-cmp-edit-close',
    what: '编辑笔记\'s close button falls back to the down arrow again',
    edits: [['src/renderer/screens/edit-dialog.js', '<${TIcon} name="close" /></button></span>', '<${TIcon} name="close" fallback="down" /></button></span>']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 编辑笔记'],
  },
  {
    id: 'r6d-cmp-tdialog-padding',
    what: 'the template dialog\'s body has no padding again',
    edits: [['src/renderer/styles/template-app.css', '.st-tdialog .new-content { flex: 1 1 auto;', '.st-tdialog .dialog-body { padding: 0; }\n.st-tdialog .new-content { flex: 1 1 auto;']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 来源与要求'],
  },
  {
    id: 'r6d-cmp-tdialog-plain',
    what: 'a dialog with no field keeps the form\'s panel over the dialog\'s own surface again',
    edits: [['src/renderer/styles/template-app.css', '.r11.r11 .st-tdialog .new-content:not(:has(.field)) { padding: 0; background: transparent; }\n', '']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 来源与要求'],
  },
  {
    id: 'r6d-cmp-tdialog-close',
    what: 'the template dialog\'s close button falls back to the down arrow again',
    edits: [['src/renderer/screens/t-dialog.js', '<${TIcon} name="close" /></button></span>', '<${TIcon} name="close" fallback="down" /></button></span>']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 来源与要求'],
  },
  {
    id: 'r6d-cmp-licenses-scroll',
    what: '许可证与致谢 scrolls as a whole again (its head and buttons go with the text)',
    edits: [['src/renderer/styles/template-app.css', '.dialog.st-tdialog { width: min(560px, 92vw); max-width: 92vw; overflow: hidden; }\n.dialog.st-tdialog[open] { display: flex; flex-direction: column; }', '.dialog.st-tdialog { width: min(560px, 92vw); max-width: 92vw; overflow: auto; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 许可证与致谢'],
  },
  {
    id: 'r6d-cmp-form-panel',
    what: '输入 API key\'s form panel is taken away too (every dialog shows the bare surface)',
    edits: [['src/renderer/styles/template-app.css', '.r11.r11 .st-tdialog .new-content:not(:has(.field)) { padding: 0; background: transparent; }', '.r11.r11 .st-tdialog .new-content { padding: 0; background: transparent; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 许可证与致谢'],
  },
  {
    id: 'r6d-cmp-header-gap',
    what: '缺少文件头\'s label touches the card\'s head again',
    edits: [['src/renderer/styles/template-app.css', '.lib-missing .field { margin: 14px 0 8px; }', '.lib-missing .field { margin: 0; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 缺少文件头'],
  },
  {
    id: 'r6d-cmp-hint-row',
    what: 'the hint of a file without a header puts its sentence and its button in one row again',
    edits: [['src/renderer/styles/template-app.css', '.st-lib-hint { margin: 0; display: grid; justify-items: start; gap: 8px; }', '.st-lib-hint { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 资料库'],
  },
  {
    id: 'r6d-cmp-alert-button',
    what: 'dark: a plain button on a notice has the notice\'s own surface again',
    edits: [['src/renderer/styles/template-app.css', '.r11[data-appearance="dark"] :is(.lib-page, .context-panel) .progress-alert .btn:not(.primary) { background: var(--paper); }\n', '']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 资料库'],
  },
  {
    id: 'r6d-cmp-card-title',
    what: 'a small card\'s title in 待确认 is 13px again, under its 14px text',
    edits: [['src/renderer/styles/template-app.css', '.st-rp-decide h3 { margin: 4px 0 0; font-size: 15px; line-height: 1.6; }', '.st-rp-decide h3 { margin: 4px 0 0; font-size: 13px; line-height: 1.6; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 待确认'],
  },
  {
    id: 'r6d-cmp-conn-grid',
    what: '设置\'s connections are three grids of their own again, the icon column 22px',
    edits: [['src/renderer/styles/template-app.css', '.st-set-conn.file-row { display: grid; grid-template-columns: subgrid; gap: 12px; align-items: center; }', '.st-set-conn.file-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) minmax(0, 220px) auto; gap: 12px; align-items: center; }']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 设置'],
  },
  {
    id: 'r6d-cmp-conn-icon',
    what: '设置\'s icon column is 22px again (单线黑白\'s box is squeezed); the rows stay one grid',
    edits: [['src/renderer/styles/template-app.css', '.st-set-conns { display: grid; grid-template-columns: auto minmax(0, 1fr)', '.st-set-conns { display: grid; grid-template-columns: 22px minmax(0, 1fr)']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 设置'],
  },
  {
    id: 'r6d-cmp-inbox-title',
    // 1.1.2: 待看卡 v2 (赞妮) says it again for its own card (.r11.r11.r11 .st-card …): with one left the title keeps its
    // heading's face, so both go
    what: 'a 待看 card\'s title is in the body face of a link again (both rules that give it its heading\'s face gone)',
    edits: [
      ['src/renderer/styles/template-app.css', '.r9.r9 .confirm-title h2 .st-card__title { font-family: inherit; }\n', ''],
      ['src/renderer/styles/template-app.css', '.r11.r11.r11 .st-card .confirm-title h2 .st-card__title { font-family: inherit; }\n', ''],
    ],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 待看'],
  },
  {
    id: 'r6d-cmp-spark',
    what: '首次打开\'s connection icon falls back to the note again',
    edits: [['src/renderer/screens/first-run.js', '<${TIcon} name="spark" /></span>\n          <span class="file-text">${fmt(T.current,', '<${TIcon} name="spark" fallback="note" /></span>\n          <span class="file-text">${fmt(T.current,']],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=R6d 对照 · 首次打开'],
  },
  {
    id: 'r6d-cmp-reader-back',
    what: '阅读窗口\'s bar draws 研究对话\'s back for 精密国际主义 too (the themes share one shape again)',
    edits: [['src/main/reader.mjs', "  precision: Object.freeze({ back: [['M22 12H6m6-6-6 6 6 6 M3 5v14']], layered: true,", "  precision: Object.freeze({ back: [['M21 6v4q0 4-4 4H4m6-6-6 6 6 6']], layered: true,"]],
    test: ['test/reader.test.mjs', '--test-name-pattern=redesign R6d'],
  },
  // 1.0.1 (docs/checks/2026-11-17-1.0.1/contract.md): each of the desktop's fixes put back the way it was (test/ui-v101.test.mjs,
  // test/ui-v101-en.test.mjs, test/services-v101.test.mjs). The window tests' first test makes the cards the others read, so each
  // pattern takes it along ("F2 setup" / "English. setup"); every check after it reads the bridge and the page after a fixed wait,
  // so a broken copy fails on an assertion, not on a wait.
  // 1.1 W1 (C2 / C3): the app checks its own files before it starts
  {
    id: 'w1-startup-ignored',
    what: 'C2 / C3: the start-up check\'s answer is not acted on (the app starts on a missing SOP or a broken definition)',
    edits: [['src/main/main.mjs', '  if (broken) {\n', '  if (false) {\n']],
    test: ['test/startup-check.test.mjs', '--test-name-pattern=a missing SOP'],
  },
  {
    id: 'w1-startup-problem-null',
    what: 'C2 / C3: the start-up check is said to pass whatever it found',
    edits: [['src/main/startup-check.mjs', '  if (r.ok) return null\n', '  return null\n']],
    test: ['test/startup-check.test.mjs', '--test-name-pattern=startupProblem|a broken definition file'],
  },
  // 1.1 W2 (B5): the hidden render window and the PDF reader
  {
    id: 'w2-render-shown',
    what: 'the render window is shown',
    edits: [['src/main/render.mjs', 'new BrowserWindow({ show: false, width: 1280', 'new BrowserWindow({ show: true, width: 1280']],
    test: ['test/render.test.mjs', '--test-name-pattern=a real hidden window|it stops at a human check'],
  },
  {
    id: 'w2-render-not-streams',
    what: 'the render window does not read as Streams (Electron\'s own User-Agent)',
    edits: [
      ['src/main/render.mjs', '    if (userAgent) s.setUserAgent(userAgent)\n', ''],
      ['src/main/render.mjs', 'wc.loadURL(url, userAgent ? { userAgent } : {})', 'wc.loadURL(url, {})'],
    ],
    test: ['test/render.test.mjs', '--test-name-pattern=a real hidden window|it stops at a human check'],
  },
  {
    id: 'w2-render-new-window',
    what: 'a page in the render window may open a new window',
    edits: [['src/main/render.mjs', "return { action: 'deny' }", "return { action: 'allow' }"]],
    test: ['test/render.test.mjs', '--test-name-pattern=the render window\'s settings and guards'],
  },
  {
    id: 'w2-render-any-request',
    what: 'the render session lets every address through (file:, app:)',
    edits: [['src/main/render.mjs', "const ok = isWebUrl(details.url) || details.url.startsWith('data:') || details.url.startsWith('blob:')", 'const ok = true']],
    test: ['test/render.test.mjs', '--test-name-pattern=the render window\'s settings and guards'],
  },
  {
    id: 'w2-pdf-pages-run-together',
    what: 'the PDF reader runs the pages together',
    edits: [['src/main/pdf-text.mjs', ".filter(Boolean).join('\\n\\n')", ".filter(Boolean).join(' ')"]],
    test: ['test/render.test.mjs', '--test-name-pattern=the PDF reader'],
  },
  {
    id: 'w2-licences-no-pdfjs',
    what: 'the licenses page leaves out PDF.js inside unpdf',
    edits: [['src/main/licenses.mjs', "  Object.freeze({ name: 'PDF.js', version: '6.4.299', license: 'Apache-2.0', inside: 'unpdf' }),\n", '']],
    // (only this test: the development one reads font sources a mirror does not carry)
    test: ['test/licenses.test.mjs', '--test-name-pattern=^PDF.js inside unpdf'],
  },
  // 1.1 W5 (docs/checks/2026-11-20-1.1/w5/scorecard.json): a library with a card is updated by it, on Claude Code only
  {
    id: 'w5-card-library-old-round',
    what: 'a library with a card still runs v1.0\'s scoring pipeline',
    edits: [['src/main/services/pipeline.mjs', '    if (u && u.applies(dir)) return startUpdateIn({ id: libraryId, path: dir }, u)', '    if (false && u && u.applies(dir)) return startUpdateIn({ id: libraryId, path: dir }, u)']],
    test: ['test/services-library-update.test.mjs', '--test-name-pattern=^a library with a card'],
  },
  {
    id: 'w5-codex-updates',
    // (1.1.1 P13: turned round — 1.1 kept Codex from updating; 1.1.1 lets it, acceptance C8; taking it off must fail)
    what: 'Codex may not update (1.1.1 lets it: C8)',
    edits: [['src/main/services/library-update.mjs', "export const UPDATE_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const UPDATE_KINDS = Object.freeze(['claude-code', 'api'])"]],
    test: ['test/services-library-update.test.mjs', '--test-name-pattern=Codex and \\(P6\\) an API key update'],
  },
  // 1.1 W6a (docs/checks/2026-11-20-1.1/w6a/scorecard.json): the interface in the real window
  {
    id: 'w6a-card-no-opening',
    what: 'the 待看 card shows no opening of the original under the summary',
    edits: [['src/renderer/screens/inbox.js', '      ${item.opening ? html`<div class="st-card__opening"', '      ${false ? html`<div class="st-card__opening"']],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^A3'],
  },
  {
    id: 'w6a-card-missing-silent',
    what: 'an item whose original was not kept does not say so',
    edits: [['src/renderer/screens/inbox.js', "      ${missing ? html`<p class=\"intro-copy\" data-part=\"missing-note\">", "      ${false ? html`<p class=\"intro-copy\" data-part=\"missing-note\">"]],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^A3'],
  },
  {
    id: 'w6a-reader-web',
    what: 'a point opens the web page instead of the kept original',
    edits: [['src/main/services/reader.mjs', '      if (stored) {', '      if (false) {']],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^A4'],
  },
  {
    id: 'w6a-mark-shifted',
    what: 'the marked stretch starts one character late',
    edits: [['src/main/reader.mjs', '    const s = Math.max(a, m.start)', '    const s = Math.max(a, m.start + 1)']],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^A4'],
  },
  {
    id: 'w6a-source-no-confirm',
    what: 'a source typed on 来源与要求 is written into the card before 确认',
    edits: [['src/main/services/sources.mjs', "      log(`sources: a source proposed (${url ? 'address' : 'search word'}), waiting for the user to confirm it`)", "      await cardRunner().confirm(r.pending.id)"]],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^A5'],
  },
  // w6a-settings-no-note: retired in 1.1.1 P13 — 设置's 「只能问库」 under Codex and an API key is gone (acceptance A6 as settled for 1.1.1; ui-p6 checks no such words)
  {
    id: 'w6a-old-any-connection',
    what: '「重新查一遍来源」 can be pressed on any connection',
    edits: [['src/renderer/screens/sources.js', "  const can = connection === 'claude-code'", '  const can = true']],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^the notice'],
  },
  {
    id: 'w6a-no-banner',
    what: 'an update that did not start for the sign-in leaves no banner',
    edits: [['src/main/services/pipeline.mjs', "      if (result.status === 'login-expired') updateProblems.set(dir, { code: 'login-expired', at: now().toISOString() })\n", '']],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=^no banner before'],
  },
  {
    id: 'w6a-banner-stays',
    what: 'an update that ran does not clear the sign-in banner',
    edits: [['src/main/services/pipeline.mjs', '      else if (result.started) updateProblems.delete(dir)\n', '']],
    test: ['test/services-library-update.test.mjs', '--test-name-pattern=^the sign-in banner'],
  },
  // 1.1 W7a: a library of the last version; the connections
  {
    id: 'w7a-convert-refused',
    what: 'a library without a card cannot be brought over (refused as before W7a)',
    edits: [['src/main/services/build.mjs', '        else convert = { library: libraryId }\n', "        else throw new BridgeError('bad_arguments', 'that library has no card')\n"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=^bringing a library'],
  },
  {
    id: 'w7a-no-banner',
    what: 'the page shows no banner for a library that needs bringing over, nor for a connection that can only ask',
    edits: [['src/renderer/screens/library-frame.js', "export const BANNER_CODES = Object.freeze(['needs-build', 'update-not-supported'])", 'export const BANNER_CODES = Object.freeze([])']],
    test: ['test/ui-w7a.test.mjs'],
  },
  {
    id: 'w7a-convert-writes-early',
    what: 'the card of a library brought over is written before 确认',
    // (1.1.1 P6: the build is made with its connection's connector; the early write is a file in the library brought over)
    edits: [['src/main/services/build.mjs', "      build = createBuild({ connector: connectorFor(active, () => saved?.core?.calls ?? 0, found)", "      if (convert) writeFileSync(join(dirOfLibrary(libraryId), 'early-card.md'), 'early')\n      build = createBuild({ connector: connectorFor(active, () => saved?.core?.calls ?? 0, found)"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=^bringing a library'],
  },
  {
    id: 'w7a-later-kept',
    what: 'the items put off with 稍后处理 are not given back after an update',
    edits: [['src/main/services/pipeline.mjs', '      if (result.started) { try { const r = releaseLater(dir);', '      if (false) { try { const r = releaseLater(dir);']],
    test: ['test/services-library-update.test.mjs', '--test-name-pattern=^after an update'],
  },
  {
    id: 'w7a-update-no-signal',
    what: '停止 is not handed to the update',
    // (1.1.1 P10: the update is handed its progress too)
    edits: [['src/main/services/pipeline.mjs', '        result = await u.run(dir, a, { round: roundId, signal: controller.signal, progress:', '        result = await u.run(dir, a, { round: roundId, progress:']],
    test: ['test/ui-run.test.mjs', '--test-name-pattern=^运行中'],
  },
  // 1.1 W6b: 新建库 and the build conversation
  {
    id: 'w6b-build-any-connection',
    // (1.1.1 P13: turned round, as w5-codex-updates — 1.1 kept Codex and an API key from building; 1.1.1 lets both (C8, C9,
    // B17), so taking the guard out changed nothing any more: tried, not caught. Taking Codex off the list must fail now.)
    what: 'Codex may not build (1.1.1 lets it: C8)',
    edits: [['src/main/services/build.mjs', "export const BUILD_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const BUILD_KINDS = Object.freeze(['claude-code', 'api'])"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=Codex and \\(P6\\) an API key with its key build'],
  },
  {
    id: 'w6b-drop-leaves-card',
    what: '不建了 leaves the card waiting',
    edits: [['src/main/services/build.mjs', '      try { const r = runner(); for (const p of r.pending()) r.reject(p.id) } catch', '      try { void runner } catch']],
    test: ['test/services-build.test.mjs', '--test-name-pattern=^不建了 after the connection'],
  },
  {
    id: 'w6b-not-kept',
    what: 'the conversation is not written after a turn (gone after a restart)',
    edits: [['src/main/services/build.mjs', '      if (saved) write()\n', '']],
    test: ['test/services-build.test.mjs', '--test-name-pattern=^one conversation at a time'],
  },
  {
    id: 'w6b-edit-no-before',
    what: 'a change of a card comes without the card before it',
    edits: [['src/main/services/build.mjs', "a.card = t.card; a.before = t.before ?? null;", "a.card = t.card; a.before = null;"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=^changing a library'],
  },
  {
    id: 'w6b-ui-confirm-any-card',
    what: 'the page offers 确认 on a card that is not whole',
    edits: [['src/renderer/screens/build.js', "  const can = last && turn.canConfirm === true\n", "  const can = last\n"]],
    test: ['test/ui-w6b.test.mjs', '--test-name-pattern=^W6b: 新建库'],
  },
  {
    id: 'w6b-ui-single-as-multi',
    what: 'a single-choice question lets several options be pressed',
    edits: [['src/renderer/screens/build.js', "  const multi = q.kind === 'multi'\n", "  const multi = q.kind === 'multi' || q.kind === 'single'\n"]],
    test: ['test/ui-w6b.test.mjs', '--test-name-pattern=^W6b: 新建库'],
  },
  {
    id: 'w6b-ui-no-changes',
    what: 'the card sent again shows no before / after',
    edits: [['src/renderer/screens/build.js', "  if (!Array.isArray(changes)) return null\n", "  if (changes || !changes) return null\n"]],
    test: ['test/ui-w6b.test.mjs', '--test-name-pattern=^W6b: 新建库'],
  },
  {
    id: 'w6b-ui-old-form',
    what: '新建库 still opens v1.0\'s form',
    edits: [['src/renderer/app.js', "newLibrary: () => setRoute(r => (r.screen === 'build' ? r : { screen: 'build', params: { back: r.screen } })),", "newLibrary: () => setRoute(r => (r.screen === 'new-library' ? r : { screen: 'new-library', params: { back: r.screen } })),"]],
    test: ['test/ui-w6b.test.mjs', '--test-name-pattern=^W6b: 新建库'],
  },
  // 1.1 W7b: v1.0's scoring pipeline, v2's main agent chat, its proposal cards and 系统检测 left the product; what is left must
  // hold — E4 (the interface's banned words in both languages), C1 (no scoring words in the code the product runs), the sidebar's
  // 主 Agent opening the build conversation, 待确认 holding only the build's card, 问库 only answering, a library without a card
  // not updated, one step for an update, a 1.0 library read only on 来源与要求
  {
    id: 'w7b-e4-blind-to-relevance-word',
    what: 'E4\'s list no longer knows 相关度 — and a text table says it again (the empty 待看 line)',
    edits: [
      ['test/wording.test.mjs', "export const E4_WORDS = Object.freeze(['状态包', '四档', '交卷', '把关', '相关度', '实质', 'relevance', 'substance'])", "export const E4_WORDS = Object.freeze(['状态包', '四档', '交卷', '把关', '实质', 'relevance', 'substance'])"],
      ['src/renderer/texts/inbox.js', "    title: '暂无待看内容',", "    title: '暂无待看内容（按相关度）',"],
    ],
    test: ['test/wording.test.mjs', '--test-name-pattern=^E4'],
  },
  {
    id: 'w7b-e4-planted-en',
    what: 'an English text table says relevance again (a card\'s label in 待看)',
    edits: [['src/renderer/texts-en/inbox.js', "    label: 'Inbox item',", "    label: 'Inbox item by relevance',"]],
    test: ['test/wording.test.mjs', '--test-name-pattern=^E4 · every interface text file'],
  },
  {
    id: 'w7b-e4-planted-main',
    what: 'a word of the discussions (把关) in a table of the main process (the notification of a run)',
    edits: [['src/main/texts/notify.js', "    newItems: '{library}：本次运行新增 {n} 条待看。',", "    newItems: '{library}：本次运行新增 {n} 条待看，已把关。',"]],
    test: ['test/wording.test.mjs', '--test-name-pattern=^E4 · every interface text file'],
  },
  {
    id: 'w7b-e4-texts-en-skipped',
    what: 'E4 reads the Chinese tables only (texts-en left out) — and an English table says substance',
    edits: [
      ['test/wording.test.mjs', 'const ALL_TEXT_DIRS = [TEXTS, EN_TEXTS, MAIN_TEXTS, MAIN_EN_TEXTS]', 'const ALL_TEXT_DIRS = [TEXTS, MAIN_TEXTS]'],
      ['src/renderer/texts-en/inbox.js', "    label: 'Inbox item',", "    label: 'Inbox item of substance',"],
    ],
    test: ['test/wording.test.mjs', '--test-name-pattern=^E4 · every interface text file'],
  },
  {
    id: 'w7b-c1-desktop-off',
    what: 'the C1 scan of the desktop reads none of its files — and a screen judges by a relevance score again',
    edits: [
      ['test/c1-scan-desktop.test.mjs', "  const files = codeFiles('desktop/src', { repo: ROOT })\n", "  const files = codeFiles('desktop/src', { repo: ROOT }).filter(f => !f.includes('/screens/'))\n"],
      ['src/renderer/screens/inbox.js', "  const unverified = Boolean(item.verification) && item.verification.passed === false\n", "  const unverified = Boolean(item.verification) && item.verification.passed === false\n  const strong = (item.scores?.relevance?.score ?? 0) >= 0.7\n"],
    ],
    test: ['test/c1-scan-desktop.test.mjs', '--test-name-pattern=^C1 desktop'],
  },
  {
    id: 'w7b-c1-desktop-word',
    what: 'a desktop service names a threshold of v1.0\'s scoring again (C1 must report it)',
    edits: [['src/main/services/pipeline.mjs', "const HTTP_URL = /^https?:\\/\\/\\S+$/i\n", "const HTTP_URL = /^https?:\\/\\/\\S+$/i\nconst threshold = 0.7\n"]],
    test: ['test/c1-scan-desktop.test.mjs', '--test-name-pattern=^C1 desktop'],
  },
  {
    id: 'w7b-c1-desktop-legacy',
    what: 'the desktop imports core/legacy again (v1.0\'s round, for a library without a card)',
    edits: [['src/main/services/pipeline.mjs', "import { publicProblems, publicResult } from '../public-data.mjs'\n", "import { publicProblems, publicResult } from '../public-data.mjs'\nimport { runRound } from '../../../../core/legacy/index.mjs'\n"]],
    test: ['test/c1-scan-desktop.test.mjs', '--test-name-pattern=^C1 desktop'],
  },
  {
    id: 'w7b-sidebar-old-chat',
    what: 'the sidebar\'s 主 Agent leads to a route of its own again (v2\'s chat, now no screen): the build conversation does not open',
    edits: [['src/renderer/screens/index.js', "  chat: Object.freeze(['build', Object.freeze({})]),\n", '']],
    test: ['test/ui-w7b.test.mjs', '--test-name-pattern=W7b · 主 Agent opens'],
  },
  {
    id: 'w7b-sidebar-talk-not-marked',
    what: 'a build conversation going marks 新建库 in the sidebar, not 主 Agent',
    edits: [['src/renderer/screens/build.js', '  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`}', '  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="build" />`}']],
    test: ['test/ui-w7b.test.mjs', '--test-name-pattern=W7b · 主 Agent opens'],
  },
  {
    id: 'w7b-decide-not-build',
    what: '待确认 shows something that is not the build\'s card (its count is never 0: a card while none waits)',
    edits: [['src/renderer/screens/right-panel.js', '  const waiting = waitingCard(build?.data)\n  const n = waiting ? 1 : 0\n', '  const waiting = waitingCard(build?.data)\n  const n = 1\n']],
    test: ['test/ui-w7b.test.mjs', '--test-name-pattern=W7b · 主 Agent opens'],
  },
  {
    id: 'w7b-ask-routes-change',
    what: '问库 hands a sentence to an agent again (v2 package E\'s routing call instead of askLibrary)',
    edits: [['src/renderer/screens/ask.js', "      const r = await call('askLibrary', q)", "      const r = await call('sendLibraryMessage', q)"]],
    test: ['test/ui-ask-r3.test.mjs', '--test-name-pattern=W7b 问库 just answers'],
  },
  {
    id: 'w7b-no-card-updated',
    what: 'a library without a card is updated anyway (as if it had one) instead of needs-build',
    edits: [['src/main/services/pipeline.mjs', '    if (u && u.applies(dir)) return startUpdateIn({ id: libraryId, path: dir }, u)', '    if (u) return startUpdateIn({ id: libraryId, path: dir }, u)']],
    test: ['test/services-library-update.test.mjs', '--test-name-pattern=^a library without a card'],
  },
  {
    id: 'w7b-update-steps-two',
    what: 'a running update is shown with a step it does not have (a self-check of v1.0 before its four, 1.1.1 P10)',
    edits: [['src/renderer/screens/run-steps.js', "export const UPDATE_STEPS = Object.freeze(['sources', 'originals', 'agent', 'check'])", "export const UPDATE_STEPS = Object.freeze(['self-check', 'sources', 'originals', 'agent', 'check'])"]],
    test: ['test/ui-r6d-compare.test.mjs', '--test-name-pattern=the step dots'],
  },
  {
    id: 'w7b-old-library-editable',
    what: 'a library made by the last version gets a field to edit its brief on 来源与要求 again',
    edits: [['src/renderer/screens/sources.js', '    ${text ? html`<p class="intro-copy st-src-old-brief">${text}</p>` : html`<p class="limit-note">${T.brief.none}</p>`}', '    <textarea data-field="brief" value=${text}></textarea>']],
    test: ['test/ui-w7b.test.mjs', '--test-name-pattern=W7b · 来源与要求'],
  },
  {
    id: 'w7b-last-run-wrong-count',
    what: 'the last run\'s one line says another number than the run record\'s (counts.inbox)',
    edits: [['src/renderer/screens/run-steps.js', '  const added = Number.isInteger(record.counts?.inbox) ? record.counts.inbox : 0\n', '  const added = (Number.isInteger(record.counts?.inbox) ? record.counts.inbox : 0) + 1\n']],
    test: ['test/ui-status.test.mjs', '--test-name-pattern=^redesign R2: no 运行状态 block'],
  },
  {
    id: 'w7b-inbox-score-back',
    what: 'a card of 待看 carries v1.0\'s 未评分 mark again',
    edits: [['src/renderer/screens/inbox.js', "        ${waiting >= LONG_WAIT ? html`<${Mark} attrs=${{ 'data-waiting': waiting }}>", "        ${html`<${Mark} attrs=${{ 'data-scoreless': '' }}>x<//>`}\n        ${waiting >= LONG_WAIT ? html`<${Mark} attrs=${{ 'data-waiting': waiting }}>"]],
    test: ['test/ui-w7b.test.mjs', '--test-name-pattern=W7b · 待看'],
  },
  // 1.1 W9: A6 names the API key — 「重新查一遍来源」 is off there too
  {
    id: 'w9-old-api-on',
    what: 'on an API key, 「重新查一遍来源」 of a library of the last version can be pressed (only Codex is kept off)',
    edits: [['src/renderer/screens/sources.js', "  const can = connection === 'claude-code'", "  const can = connection !== 'codex'"]],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=on an API key'],
  },
  // 1.1 W10 (维护者 11-23 「要，建好就跑」): a library made or brought over has its first update queued at once; a changed card not
  {
    id: 'w10-no-first-update',
    what: '确认 a new library queues no update (1.1 W6b as it was)',
    edits: [['src/main/services/build.mjs', "if (mode !== 'edit' && afterBuilt && libraryId) {", "if (false && mode !== 'edit' && afterBuilt && libraryId) {"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=W10'],
  },
  {
    id: 'w10-edit-runs',
    what: 'a changed card (edit) runs an update too',
    edits: [['src/main/services/build.mjs', "if (mode !== 'edit' && afterBuilt && libraryId) {", 'if (afterBuilt && libraryId) {']],
    test: ['test/services-build.test.mjs', '--test-name-pattern=W10'],
  },
  {
    id: 'w10-convert-no-run',
    what: 'a library of the last version brought over gets no first update (only a new one does)',
    edits: [['src/main/services/build.mjs', "if (mode !== 'edit' && afterBuilt && libraryId) {", "if (mode === 'create' && afterBuilt && libraryId) {"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=W10'],
  },
  {
    id: 'w10-queue-failure-fails',
    what: 'a queue that throws makes 确认 fail although the library is made',
    edits: [['src/main/services/build.mjs', "catch (err) { log(`build: the first update not queued:", "catch (err) { throw err; log(`build: the first update not queued:"]],
    test: ['test/services-build.test.mjs', '--test-name-pattern=W10'],
  },
  {
    id: 'w10-not-wired',
    what: 'main.mjs hands the build service no queue: in the real window nothing runs after 确认',
    edits: [['src/main/main.mjs', "return entry ? scheduler.queueRound(entry, 'a confirmed build card') : null", 'return null']],
    test: ['test/ui-w6b.test.mjs'],
  },
  // 1.1 W11 (Codex's install test, B3): getHome's problem is the open library's own
  {
    id: 'w11-home-global-problem',
    what: 'getHome gives the last problem of any library (the catch-up\'s needs-build shows on a new library)',
    edits: [['src/main/services/pipeline.mjs', 'const p = problemsOf.get(dir)?.[0] ?? null', 'const p = lastProblems?.[0] ?? null']],
    test: ['test/services-pipeline.test.mjs', '--test-name-pattern=W11'],
  },
  // 1.1 W13 (维护者 11-23「发之前先补」): 「打开已有的库」, and 查看原文 on a kept note
  {
    id: 'w13-any-folder-opened',
    what: '「打开已有的库」 takes any folder: an empty one is made a library, a folder of .md files imported (useChosenFolder)',
    edits: [['src/renderer/app.js', "      if (chosen.state !== 'library') return 'not-library'\n      const lib = await call('addLibrary', chosen.path)", "      const lib = await call('useChosenFolder', chosen.name)"]],
    test: ['test/ui-w13.test.mjs'],
  },
  {
    id: 'w13-no-state-check',
    what: '「打开已有的库」 hands any folder to addLibrary: a folder with no library gets 「未能打开」, not the line saying it is no library',
    edits: [['src/renderer/app.js', "      if (chosen.state !== 'library') return 'not-library'\n", '']],
    test: ['test/ui-w13.test.mjs'],
  },
  {
    id: 'w13-first-run-no-entry',
    what: '首次打开 has no 「打开已有的库」',
    edits: [['src/renderer/screens/first-run.js', /\n {6}<span class="st-act" data-action="open-existing">[^\n]*/, '']],
    test: ['test/ui-w13.test.mjs'],
  },
  {
    id: 'w13-shelf-toolbar-no-entry',
    what: 'the shelf\'s toolbar has no 「打开已有的库」 (the empty state still does)',
    edits: [['src/renderer/screens/shelf.js', /\n {12}\$\{rows && rows\.length \? html`<\$\{Act\} name="open-existing"[^\n]*/, '']],
    test: ['test/ui-w13.test.mjs'],
  },
  {
    id: 'w13-no-stored-fallback',
    what: '查看原文 on a note (not in 待看) opens the page as it is today, though its original was kept',
    edits: [['src/main/services/reader.mjs', 'if (!stored) {', 'if (false) {']],
    test: ['test/reader.test.mjs', '--test-name-pattern=W13'],
  },
  // 1.1.1 P11a (A10, A11, A14)
  {
    id: 'p11a-queue-not-reread',
    what: 'removing a library re-arms the timer but the page is not told: 「下次运行时间」 keeps it as 「（未登记的库）」 (待办 C4)',
    edits: [['src/main/main.mjs', "else if (topic === 'libraries-changed') scheduler.librariesChanged()", "else if (topic === 'libraries-changed') scheduler.arm()"]],
    test: ['test/ui-p11a.test.mjs'],
  },
  {
    id: 'p11a-cost-names-claude',
    what: "新建库's cost line names Claude Code's quota whatever the connection (待办 A4)",
    edits: [['src/renderer/screens/build.js', "can ? fmt(active === 'api' ? T.costApi : T.cost, { name: names[active] ?? active }) : ''", "fmt(T.cost, { name: names['claude-code'] })"]],
    test: ['test/ui-p11a.test.mjs'],
  },
  {
    id: 'p11a-no-rhythm-line',
    what: "来源与要求 does not say when the schedule is not the card's rhythm (no 「按节奏设」)",
    edits: [['src/renderer/screens/sources.js', '${rhythm && !rhythm.matches ? html', '${false ? html']],
    test: ['test/ui-p11a.test.mjs'],
  },
  // 1.1.1 P11b (A13, A15, 场景四②)
  {
    id: 'p11b-gaps-hidden',
    what: "待看's 「上次更新」 block shows the counts but not what the update agent left",
    edits: [['src/renderer/screens/run-steps.js', "  return (Array.isArray(record?.agent?.gaps) ? record.agent.gaps : [])", "  return ([])"]],
    test: ['test/ui-p11b.test.mjs'],
  },
  {
    id: 'p11b-plain-listed',
    what: 'any folder under the default place is listed as a library found (the plain folder too)',
    edits: [['src/main/services/library.mjs', "if (!dir || known.has(path.toLowerCase()) || folderState(path) !== 'library' || !usable(path)) continue", "if (!dir || known.has(path.toLowerCase())) continue"]],
    test: ['test/ui-p11b.test.mjs'],
  },
  {
    id: 'p11b-any-path-added',
    what: 'addFoundLibraries takes a path findLibraries did not give',
    edits: [['src/main/services/library.mjs', "if (list.length === 0 || list.some(p => !found.has(p)))", "if (list.length === 0)"]],
    test: ['test/ui-p11b.test.mjs'],
  },
  {
    id: 'p11b-fallback-group',
    what: "the fallback topic 「未分类」 counts as a topic: the right panel's 文件 shows one lone group",
    edits: [['src/main/services/browse.mjs', ".map(t => t.trim()).filter(t => !fallback.has(t)))]", ".map(t => t.trim()))]"]],
    test: ['test/ui-p11b.test.mjs'],
  },
  // 1.1.1 P1 (B19)
  {
    id: 'p1-no-why',
    what: 'a card that cannot be confirmed does not say which addresses could not be checked, nor why',
    edits: [['src/renderer/screens/build.js', "const unchecked = (Array.isArray(turn.problems) ? turn.problems : []).filter(", "const unchecked = [].filter("]],
    test: ['test/ui-p1.test.mjs'],
  },
  {
    id: 'p1-no-ask-fix',
    what: 'no 「请它改好再交」 on a card that cannot be confirmed',
    edits: [['src/renderer/screens/build.js', "${last && turn.canConfirm !== true && onAskFix ? html", "${false ? html"]],
    test: ['test/ui-p1.test.mjs'],
  },
  // 1.1.1 P12 (C3)
  {
    id: 'p12-mark-dark',
    what: "the reading window's marked sentence takes the theme's light mark colours again: light words on a light ground in dark",
    edits: [['src/main/reader.mjs', "background:color-mix(in srgb,var(--accent,currentColor) 24%,transparent)!important;color:inherit!important;", "background:color-mix(in srgb,var(--accent) 20%,transparent);color:inherit;"]],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=A4'],
  },
  // 1.1.1 P3 (C7, C8)
  {
    id: 'p3-codex-no-build',
    what: 'Codex cannot build again (BUILD_KINDS without it)',
    edits: [['src/main/services/build.mjs', "export const BUILD_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const BUILD_KINDS = Object.freeze(['claude-code', 'api'])"]],
    test: ['test/services-build.test.mjs'],
  },
  {
    id: 'p3-codex-no-update',
    what: 'Codex cannot update again (UPDATE_KINDS without it)',
    edits: [['src/main/services/library-update.mjs', "export const UPDATE_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const UPDATE_KINDS = Object.freeze(['claude-code', 'api'])"]],
    test: ['test/services-library-update.test.mjs'],
  },
  // 1.1.1 P5
  {
    id: 'p5-key-shared',
    what: "the search key is stored as the model's key (not apart)",
    edits: [['src/main/services/connections.mjs', 'secrets.set(SEARCH_KEY_REF, key.trim())', 'secrets.set(keyRefOf(settings().connections.api.vendor), key.trim())']],
    test: ['test/ui-p5.test.mjs'],
  },
  {
    id: 'p5-no-search-row',
    what: "设置 has no 搜索 row",
    edits: [['src/renderer/screens/settings.js', '${data ? html`<${SearchRow} search=${data.search} onChanged=${() => conns.reload()} />` : null}', '']],
    test: ['test/ui-p5.test.mjs'],
  },
  // 1.1.1 P6 (B17, A6, C9)
  {
    id: 'p6-api-no-build',
    what: 'an API key cannot build again (BUILD_KINDS without it)',
    edits: [['src/main/services/build.mjs', "export const BUILD_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const BUILD_KINDS = Object.freeze(['claude-code', 'codex'])"]],
    test: ['test/services-build.test.mjs'],
  },
  {
    id: 'p6-no-key-starts',
    what: 'an API key with no model key stored starts a build anyway',
    edits: [['src/main/services/build.mjs', "if (active.kind === 'api' && !hasModelKey(active)) throw new BridgeError('bad_arguments', 'build-needs-key')", '']],
    test: ['test/services-build.test.mjs'],
  },
  {
    id: 'p6-api-no-update',
    what: 'an API key cannot update again (UPDATE_KINDS without it)',
    edits: [['src/main/services/library-update.mjs', "export const UPDATE_KINDS = Object.freeze(['claude-code', 'codex', 'api'])", "export const UPDATE_KINDS = Object.freeze(['claude-code', 'codex'])"]],
    test: ['test/services-library-update.test.mjs'],
  },
  {
    id: 'p6-api-no-tools',
    what: "an API key builds without Streams' own tools (the stand-in session, not the tool session)",
    edits: [['src/main/services/build.mjs', "const connectorFor = (active, callsSoFar, found) => (active.kind === 'api' && apiSession", "const connectorFor = (active, callsSoFar, found) => (false && apiSession"]],
    test: ['test/ui-p6.test.mjs'],
  },
  {
    id: 'p6-only-ask-back',
    what: '设置 says 「只能问库」 of the API key again (A6\'s failing input)',
    edits: [['src/renderer/texts/settings.js', "    apiHint: '", "    apiHint: '这一版用这种连接只能问库。'"]],
    test: ['test/ui-w6a.test.mjs', '--test-name-pattern=A6'],
  },
  // 1.1.1 P10 (A8)
  {
    id: 'p10-pinned-last',
    what: 'the update shows its last step whatever happened (the progress pinned, not from events)',
    edits: [['src/renderer/screens/run-steps.js', 'return i < 0 ? 0 : i', 'return UPDATE_STEPS.length - 1']],
    test: ['test/ui-p10.test.mjs', '--test-name-pattern=an update'],
  },
  {
    id: 'p10-build-no-live',
    what: "the build page does not show the agent's counts while it works",
    edits: [['src/renderer/screens/build.js', "if (p?.phase === 'progress') call('getBuild').then(v => setLive(v?.live ?? null), () => {})", "if (p?.phase === 'progress') void 0"]],
    test: ['test/ui-p10.test.mjs', '--test-name-pattern=a build'],
  },
  // 1.1.1 P8 「快到期」 (A12, B23): the file's tests open one world one after another, so each mutant runs the whole file
  {
    id: 'p8-no-due-block',
    what: '待看 does not show 快到期',
    edits: [['src/renderer/screens/inbox.js', '  if (!items?.length) return null\n', '  return null\n']],
    test: ['test/ui-p8.test.mjs'],
  },
  {
    id: 'p8-notice-not-recorded',
    what: 'a due notification sent is not recorded: the app opened again the same day notifies again',
    edits: [['src/main/services/due-notify.mjs', '      try { markDueNotices(e.path, owed, { now }) }', '      try { void markDueNotices }']],
    test: ['test/ui-p8.test.mjs'],
  },
  // 1.1.1 P9 来源授权 (B24): the file's tests run one after another on one world, so each mutant runs the whole file
  {
    id: 'p9-no-hint',
    what: '待看 does not say that a site of the list wants a contact e-mail',
    edits: [['src/main/services/pipeline.mjs', ".map(i => (i.original?.saved === false && needsContact(i.url) ? { ...i, needsContact: needsContact(i.url) } : i))", '']],
    test: ['test/ui-p9.test.mjs'],
  },
  {
    id: 'p9-reader-no-contact',
    what: "the update's page reader is made without the contact (the plain User-Agent)",
    edits: [['src/main/main.mjs', 'createPageReader({ render: renderService.render, pdfText, userAgent: agentFor() })', 'createPageReader({ render: renderService.render, pdfText })']],
    test: ['test/ui-p9.test.mjs'],
  },
  {
    id: 'p9-hint-despite-contact',
    what: 'the card still asks for a contact e-mail after one is filled in',
    edits: [['src/main/main.mjs', 'needsContact: url => (readSettings(layout.settingsFile).sourceContact ? null : siteOf(url, siteList())?.id ?? null),', 'needsContact: url => siteOf(url, siteList())?.id ?? null,']],
    test: ['test/ui-p9.test.mjs'],
  },
  // 1.1.1 P14 动效 (A16–A19): the file's tests run one after another on one world, so each mutant runs the whole file
  {
    id: 'p14-act-after-animation',
    what: 'a decision on a card waits for its leaving animation before the call goes (killed mid-animation, nothing is kept)',
    edits: [['src/renderer/screens/inbox.js', '    call(method, item.url)\n', '    new Promise(resolve => setTimeout(resolve, LEAVE_MS + 300)).then(() => call(method, item.url))\n']],
    test: ['test/ui-p14.test.mjs'],
  },
  {
    id: 'p14-in-2s',
    what: 'entering and leaving take 2 s',
    edits: [['src/renderer/styles/motion.css', '--mo-in: 200ms;', '--mo-in: 2000ms;']],
    test: ['test/ui-p14.test.mjs'],
  },
  {
    // (taking out motion.css's own reduced-motion rule alone changes nothing — tried, not caught: each theme's template sheets
    // carry the same rule, round6/base.css and round9/system.css in all four. A loop that escapes them is what breaks A18.)
    id: 'p14-reduced-keeps-loops',
    what: "减少动态效果 is not followed: the sidebar ring's loop is marked !important and goes on",
    edits: [['src/renderer/styles/motion.css', 'animation: st-mo-ring var(--mo-ring) linear infinite; }', 'animation: st-mo-ring var(--mo-ring) linear infinite !important; }']],
    test: ['test/ui-p14.test.mjs'],
  },
  {
    id: 'p14-ring-always',
    what: 'every library of the sidebar has the turning ring, running or not',
    edits: [['src/renderer/kit/sidebar.js', '${running ? html`<span class="st-mo-ring"', '${true ? html`<span class="st-mo-ring"']],
    test: ['test/ui-p14.test.mjs'],
  },
  // 1.1.1 B26: an API key connection with no search says this time it cannot search (新建库)
  {
    id: 'b26-no-sentence',
    what: '新建库 does not say that this time there is no search',
    edits: [['src/renderer/screens/build.js', "  const noSearch = active === 'api' && !noKey && appState?.data?.activeCanSearch === false\n", '  const noSearch = false\n']],
    test: ['test/ui-p6.test.mjs'],
  },
]

function runTest(desktop, test) {
  // node's own options (the name pattern) before the file: after it they would be arguments of the test file
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...test.slice(1), test[0]], {
    // redesign R6a: a mirror is not a git repository — STREAMS_MIRROR_OF names the one it mirrors (test/r6a.test.mjs reads
    // standards.mjs as it was before R6a from there)
    cwd: desktop, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, STREAMS_MIRROR_OF: REPO_DIR },
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
