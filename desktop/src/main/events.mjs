/**
 * Events from the main process to the page (docs/desktop.md §四「事件」). One channel, `streams:event`, carries
 * `{ topic, payload }`; the preload hands a message on only for a topic in its own list (preload.cjs EVENT_TOPICS),
 * and only to callbacks the page registered with `window.streams.onEvent(topic, callback)`.
 *
 * EVENT_TOPICS here, EVENT_TOPICS in the preload and the table in docs/desktop.md §四 name the same topics;
 * test/bridge.test.mjs checks the three. Adding a topic: docs/desktop.md §四.
 * @module desktop/main/events
 */

import { isAppUrl } from './security.mjs'

export const EVENT_CHANNEL = 'streams:event'

/** topic → when it is sent (payload: see docs/desktop.md §四) */
export const EVENT_TOPICS = Object.freeze({
  'settings-changed': 'a setting changed (the language, the library folder, a switch, a schedule): the page re-reads the app state; null, or { libraryId } when it was the schedule of one library',
  'open-screen': 'the page goes to this screen: a click on a notification of the app, a second launch with an argument',
  // the update (update-wiring.mjs, docs/desktop.md§四)
  'update': 'the update has something new: a check started or ended, the download moved on, ended or failed, the setup program starts (the payload is what getUpdateState gives)',
  // the library, the connections and the pipeline (services/*.mjs; docs/desktop.md §4.1)
  'library-changed': 'the current library changed (opened, made, switched to, renamed) or its contents did (its index rebuilt, a keep, a source…): { libraryId, path, name } or null',
  // v2 package A (services/library.mjs): the registry
  'libraries-changed': 'the registry changed (a library registered, removed, switched to, renamed): { libraryId } of the one concerned',
  'connections-changed': 'the connection settings changed (the active one, a model slot, a key stored or removed): null',
  'round-progress': 'a round of the pipeline moved: { roundId, libraryId, phase, counts, calls, cap, done, result?, problems? }; the last one has done: true',
  'inbox-changed': 'the inbox of a library changed (a round wrote into it, a keep, a dismiss): { libraryId, count }',
})

/**
 * @param {() => Electron.BrowserWindow[]} windows - the app's own windows
 * @param {(line: string) => void} [log]
 * @returns {(topic: string, payload?: unknown) => number} emit: how many pages it was sent to
 * @throws {Error} for a topic not in EVENT_TOPICS (a defect of the caller)
 */
export function createEmitter(windows, log = () => {}) {
  return function emit(topic, payload = null) {
    if (!Object.hasOwn(EVENT_TOPICS, topic)) throw new Error(`no event topic ${topic} (src/main/events.mjs EVENT_TOPICS)`)
    let sent = 0
    for (const win of windows()) {
      if (win.isDestroyed() || !isAppUrl(win.webContents.getURL())) continue
      win.webContents.send(EVENT_CHANNEL, { topic, payload })
      sent++
    }
    log(`event ${topic} → ${sent} page(s)`)
    return sent
  }
}
