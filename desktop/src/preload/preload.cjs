'use strict'
// The preload bridge: the only way the page talks to the main process (docs/desktop.md §四).
//
// It runs sandboxed, before the page, in its own world (context isolation): the page sees one frozen object,
// `window.streams`, with exactly
//   - the methods in METHODS — each one call, `ipcRenderer.invoke('streams:<name>', …)`, answered by the main
//     process with `{ ok: true, data }` or `{ ok: false, error: { code } }`;
//   - onEvent(topic, callback) → unsubscribe — for the topics in EVENT_TOPICS only. Messages arrive on the one
//     channel `streams:event` as { topic, payload }; a topic not listed here is dropped, whoever sent it, and the
//     page never sees the IPC event object.
// The page gets no ipcRenderer, no require, no process, no file system, no key.
//
// METHODS must equal BRIDGE_METHODS in src/main/bridge-methods.mjs; EVENT_TOPICS must equal EVENT_TOPICS in
// src/main/events.mjs; both lists are tables in docs/desktop.md §四. test/bridge.test.mjs checks all of it.

const { contextBridge, ipcRenderer } = require('electron')

// one name per line, so later work adding methods or topics does not edit the same line
const METHODS = [
  // the shell: the app state, the settings page
  'getAppState',
  'setLanguage',
  'setTheme',
  'setAppearance',
  'setShowDeveloperInfo',
  // v2 package L: the right panel
  'setPanel',
  'copyDiagnostics',
  'openMakerPage',
  'getLicenses',
  'openNotices',
  // the update (docs/desktop.md section 19)
  'getUpdateState',
  'checkForUpdate',
  'downloadUpdate',
  'cancelUpdateDownload',
  'installUpdate',
  'openReleasePage',
  // the library
  'chooseLibraryFolder',
  'useChosenFolder',
  'openRecentLibrary',
  'rebuildIndex',
  'revealLibrary',
  'revealLibraryOf',
  'findLibraries',
  'addFoundLibraries',
  'recordSetupStep',
  'getSetup',
  // the connections
  'getConnections',
  'detectConnections',
  'probeConnection',
  'openLogin',
  'setActiveConnection',
  'setConnectionModels',
  'setApiVendor',
  'setApiKey',
  'removeApiKey',
  'setSearchKey',
  'removeSearchKey',
  // 1.1.1 P9: 来源授权 (the contact e-mail sent to the sites of the list)
  'getSourceAuth',
  'setSourceContact',
  // the run and 待看
  'getHome',
  'startRound',
  'cancelRound',
  'getRoundState',
  'getInbox',
  'keepItem',
  'dismissItem',
  'settleDismiss',
  'undoDismiss',
  'laterItem',
  'openItemUrl',
  // the timed round
  'getSchedule',
  'setSchedule',
  // the queue of every library (v2 package L)
  'getQueue',
  // the libraries the app knows (v2 package A)
  'listLibraries',
  'setActiveLibrary',
  'addLibrary',
  'removeLibrary',
  'setLibraryMeta',
  'getLibrariesOverview',
  'getLibrarySchedule',
  'setLibrarySchedule',
  'getUsageTotal',
  'getLibraryRoot',
  'chooseLibraryRoot',
  'setLibraryRoot',
  // redesign R4b: the 变更记录 of 高级设置
  'getChangeLog',
  // interface B: the library and reading
  'getLibrary',
  'searchLibrary',
  'readNote',
  'editNote',
  'openInObsidian',
  // v2 package H: the file of a note in the file manager, the original in the reading window
  'showNoteInFolder',
  'openReader',
  // v2 package L: 「文件」 of the right panel
  'getLibraryOutline',
  'revealProgramRecords',
  // 待规范 (S8): writing headers onto the files of an imported folder
  'applyHeader',
  'applyAllHeaders',
  // the sources (read only), the card of a library and its sources, the build conversation (1.1 W6a, W6b)
  'getSources',
  'getCardView',
  'getBuild',
  'startBuild',
  'replyBuild',
  'retryBuild',
  'confirmBuild',
  'dropBuild',
  'proposeCardSource',
  'settleCardSource',
  // interface B: the run-log folder, the graph, the verdicts
  'openLogsFolder',
  'getGraph',
  'getVerdicts',
  // interface B: asking the library
  'askLibrary',
  'getDemands',
  'addDemand',
  'answerFeedback',
  // v2 package M: what is left of the plan or the API balance of the current connection (the corner above 设置)
  'getQuota',
]
const EVENT_TOPICS = [
  'settings-changed',
  'open-screen',
  // the update: a check, the download, the setup program
  'update',
  // the library, the connections, the run
  'library-changed',
  // the registry changed (v2 package A)
  'libraries-changed',
  'connections-changed',
  'round-progress',
  'inbox-changed',
  'build-changed',
  // the quota of a connection changed (v2 package M)
  'quota-changed',
  // the queue of the rounds changed (v2 package L)
  'queue-changed',
]
const EVENT_CHANNEL = 'streams:event'

// what a method's arguments become before they are sent (nothing today; a method that takes dropped files would read
// their paths here with webUtils, so the page never holds a path)
const PREPARE = {}

const bridge = {}
for (const name of METHODS) {
  const channel = `streams:${name}`
  const prepare = Object.hasOwn(PREPARE, name) ? PREPARE[name] : null
  bridge[name] = (...args) => ipcRenderer.invoke(channel, ...(prepare ? prepare(...args) : args))
}

const listeners = new Map(EVENT_TOPICS.map(topic => [topic, new Set()]))
ipcRenderer.on(EVENT_CHANNEL, (_event, message) => {
  const topic = message !== null && typeof message === 'object' ? message.topic : undefined
  if (!EVENT_TOPICS.includes(topic)) return
  for (const callback of [...listeners.get(topic)]) {
    try { callback(message.payload) } catch { /* a page callback's error stays in the page */ }
  }
})

bridge.onEvent = (topic, callback) => {
  if (!EVENT_TOPICS.includes(topic)) throw new Error(`onEvent: no topic ${String(topic)}`)
  if (typeof callback !== 'function') throw new Error('onEvent: the callback must be a function')
  listeners.get(topic).add(callback)
  return () => { listeners.get(topic).delete(callback) }
}

contextBridge.exposeInMainWorld('streams', Object.freeze(bridge))
