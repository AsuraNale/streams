/**
 * Windows notifications of the app (the tray / toast hint of plan 4.9): when something the user should look at comes
 * while no window of the app is in front — a pipeline round finished with new items to look at (plan C5), later — the
 * system says so; a click brings the window to the front and the page to the screen named (event `open-screen`).
 * A window that is in front needs no notification: the page shows it. The words follow the language the app runs in
 * (`locale`, asked when the notice is made; docs/desktop.md��): main/texts/notify.js and main/texts-en/notify.js.
 *
 * Electron is given, so that this runs in plain Node under test: `Notification` (the class), `windows()` (the app's
 * windows), `bringToFront()`. In a test run of the app (hidden windows: no one at the machine) no notification is
 * shown: it is written, as it would have been shown, to <logs>/notifications.jsonl (as the diagnostics go to
 * clipboard.txt there). Nothing calls `notice` today: the shell only makes the notifier (main.mjs).
 * @module desktop/main/services/notify
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { NOTIFY } from '../texts/notify.js'
import { NOTIFY as NOTIFY_EN } from '../texts-en/notify.js'

const TABLES = Object.freeze({ 'zh-CN': NOTIFY, en: NOTIFY_EN })

const fmt = (template, values) => String(template).replace(/\{(\w+)\}/g, (whole, k) => (Object.hasOwn(values, k) ? String(values[k]) : whole))

/** Is a window of the app in front — shown, not minimised, with the focus? */
export function windowInFront(windows) {
  return windows().some(w => !w.isDestroyed() && w.isVisible() && !w.isMinimized() && w.isFocused())
}

/**
 * @param {object} o
 * @param {{isSupported: () => boolean, new (o: {title: string, body: string}): object}|null} o.Notification - Electron's
 * @param {() => object[]} o.windows - the app's windows (isDestroyed, isVisible, isMinimized, isFocused)
 * @param {() => boolean} o.bringToFront - the window to the front (restored when minimised); false: there is none
 * @param {(topic: string, payload: unknown) => number} o.emit - the page's events (`open-screen`)
 * @param {(line: string) => void} [o.log]
 * @param {string|null} [o.logFile] - hidden (test) runs: where a notification is written instead of being shown
 * @param {() => Date} [o.clock]
 * @param {() => 'zh-CN'|'en'} [o.locale] - the language the app runs in now (locale.mjs)
 */
export function createNotifier({ Notification, windows, bringToFront, emit, log = () => {}, logFile = null, clock = () => new Date(), locale = () => 'zh-CN' }) {
  const table = () => TABLES[locale()] ?? NOTIFY
  const open = new Set() // notifications on screen: kept, or Electron may drop them before they are clicked

  /** Bring the window to the front and the page to a screen. */
  function openScreen(screen) {
    if (!bringToFront()) return false
    emit('open-screen', { screen })
    return true
  }

  return {
    /**
     * Say something to the user outside the window. `kind` names the sentence of the table (`newItems` today), `values`
     * fill it, `screen` is where a click goes.
     */
    notice({ kind, values = {}, screen }) {
      const T = table()
      if (!Object.hasOwn(T.kinds, kind)) throw new Error(`notify: no notice ${String(kind)}`)
      if (windowInFront(windows)) return false
      const title = T.title
      const body = fmt(T.kinds[kind], values)
      if (logFile) {
        try {
          mkdirSync(dirname(logFile), { recursive: true })
          appendFileSync(logFile, `${JSON.stringify({ at: clock().toISOString(), kind, screen, title, body })}\n`)
        } catch (err) { log(`notification: not written: ${err.message}`) }
        return true
      }
      if (!Notification || !Notification.isSupported()) { log('notification: the system does not show notifications'); return false }
      try {
        const n = new Notification({ title, body })
        open.add(n)
        n.on('click', () => { open.delete(n); openScreen(screen) })
        n.on('close', () => open.delete(n))
        n.on('failed', (_event, error) => { open.delete(n); log(`notification: failed: ${String(error)}`) })
        n.show()
        log(`notification: ${kind} → ${screen}`)
        return true
      } catch (err) {
        log(`notification: ${String(err?.message ?? err)}`)
        return false
      }
    },
    openScreen,
  }
}
