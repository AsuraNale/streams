/**
 * The update's part of the main process (docs/desktop.md §十九; work order 08), made in one place so that main.mjs only does
 * three small things:
 *
 *   const update = wireUpdate({ … })                          after A1's services (it asks them whether a turn runs)
 *   emit = update.wrap(emit)                                   the pipeline's events are seen on their way: a round starting or
 *                                                              ending changes what the page shows (「等这一步做完再更新」)
 *   registerBridge({ handlers: { …, ...update.handlers } }); update.start()   the bridge methods; last time's leftovers removed
 *
 *   services/update.mjs         the check, the download into <appData>/updates/, the checks of the file, the setup program
 *   version.mjs                 the version it compares (release.json's)
 *
 * Development and tests only (main.mjs reads them only when the app is not packaged):
 *   devUpdateURL      STREAMS_DEV_UPDATE_URL: a stand-in for GitHub (`http://127.0.0.1:…`: its API and its downloads), or `off`
 *                     (no request at all: the tests, which never talk to GitHub unless they point it at a stand-in)
 *   devSetupRecord    STREAMS_DEV_UPDATE_SETUP_RECORD: a file; a development run may then download and update, but the setup
 *                     program is not started — what would have started it (the file, the arguments, how) is written there,
 *                     and the app quits as it would. Without it a development run checks only (「开发版不能自动更新」).
 * @module desktop/main/update-wiring
 */

import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUpdateService } from './services/update.mjs'

/**
 * A stand-in for child_process.spawn (development tests only): writes what would have been started, starts nothing.
 * @param {string} file - the record file
 * @param {(line: string) => void} log
 */
export function recordingSpawn(file, log) {
  return (command, args, options = {}) => {
    const child = new EventEmitter()
    child.pid = 0
    child.unref = () => {}
    try {
      const { detached = false, stdio = null, windowsHide = false, cwd = null } = options
      writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), command, args, options: { detached, stdio, windowsHide, cwd } })}\n`)
      log(`update: a test run: the setup program is not started; what would start it is written to ${file}`)
      setImmediate(() => child.emit('spawn'))
    } catch (err) {
      setImmediate(() => child.emit('error', err))
    }
    return child
  }
}

/**
 * @param {object} o
 * @param {(topic: string, payload?: unknown) => number} o.emit - events.mjs: the page's events (`update`)
 * @param {object} o.layout - layout.mjs (appData)
 * @param {(line: string) => void} o.log
 * @param {boolean} o.hidden - a test run: nothing is opened outside the app
 * @param {boolean} o.packaged - app.isPackaged
 * @param {{version: string, dev: boolean}} o.version - version.mjs
 * @param {() => boolean} o.turnRunning - is a research turn running (app-services anyTurnRunning)
 * @param {() => void} o.quit - the app's ordinary quit (app.quit)
 * @param {{openExternal: (url: string) => Promise<void>}} o.shell
 * @param {string|null} [o.devUpdateURL] - development only: a stand-in for GitHub, or 'off'
 * @param {string|null} [o.devSetupRecord] - development only: record the setup program instead of starting it
 * @param {object} [o.more] - more options for the service (tests: fetchImpl, openImpl, spawnImpl, stallMs …)
 */
export function wireUpdate({ emit, layout, log, hidden, packaged, version, turnRunning, quit, shell, devUpdateURL = null, devSetupRecord = null, more = {} }) {
  const dev = packaged ? {} : {
    ...(devUpdateURL === 'off' ? { fetchImpl: null } : devUpdateURL ? { apiBaseURL: devUpdateURL, downloadPrefix: `${new URL(devUpdateURL).origin}/`, allowHttp: true } : {}),
    ...(devSetupRecord ? { canUpdate: true, spawnImpl: recordingSpawn(devSetupRecord, log) } : {}),
  }
  const service = createUpdateService({
    dir: join(layout.appData, 'updates'),
    current: version.version,
    dev: version.dev,
    canUpdate: packaged,
    turnRunning,
    quit,
    onChange: snapshot => emit('update', snapshot),
    log,
    ...dev,
    ...more,
  })

  return {
    /** The emit a long-running service gets: the page gets each event as before; a turn starting or ending is passed on. */
    wrap(downstream) {
      return (topic, payload) => {
        const sent = downstream(topic, payload)
        if (topic === 'turn-state') { try { service.poke() } catch (err) { log(`update: ${topic}: ${String(err?.message ?? err)}`) } }
        return sent
      }
    },
    /** At start: the leftovers of the last update (the setup program has run by now) go. No check: only the user asks. */
    start: () => service.cleanUp(),
    service,
    handlers: {
      getUpdateState: () => service.snapshot(),
      checkForUpdate: () => service.check(),
      downloadUpdate: () => service.download(),
      cancelUpdateDownload: () => service.cancel(),
      installUpdate: () => service.install(),
      async openReleasePage() {
        const url = service.pageUrl()
        if (hidden) { log(`not opened in a test run: ${url}`); return null }
        await shell.openExternal(url)
        return null
      },
    },
  }
}
