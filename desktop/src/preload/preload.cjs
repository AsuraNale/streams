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
  'setShowDeveloperInfo',
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
  // the pipeline
  'applyStarterPack',
  'getStarterPacks',
  'getHome',
  'estimateRound',
  'setRoundCap',
  'startRound',
  'cancelRound',
  'getRoundState',
  'getInbox',
  'keepItem',
  'dismissItem',
  'laterItem',
  'openItemUrl',
  'getPipelineSettings',
  // the timed round
  'getSchedule',
  'setSchedule',
  // interface B: the library and reading
  'getLibrary',
  'searchLibrary',
  'readNote',
  'editNote',
  'openInObsidian',
  // 待规范 (S8): writing headers onto the files of an imported folder
  'applyHeader',
  'applyAllHeaders',
  // interface B: the sources and the topics
  'getSources',
  'guessSource',
  'trySource',
  'addSource',
  'updateSource',
  'removeSource',
  'setSourcePaused',
  'addManualLink',
  'addTopic',
  'updateTopic',
  'removeTopic',
  // interface B: the nodes of the pipeline
  'getPipeline',
  'savePipeline',
  'previewNode',
  // interface B: the run status, the graph, the verdicts
  'getStatus',
  'openLogsFolder',
  'getGraph',
  'getVerdicts',
  // interface B: asking the library
  'askLibrary',
  'getDemands',
  'addDemand',
  'answerFeedback',
]
const EVENT_TOPICS = [
  'settings-changed',
  'open-screen',
  // the update: a check, the download, the setup program
  'update',
  // the library, the connections, the pipeline
  'library-changed',
  'connections-changed',
  'round-progress',
  'inbox-changed',
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
