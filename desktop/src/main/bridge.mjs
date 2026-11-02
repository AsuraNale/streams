/**
 * Registers the bridge (bridge-methods.mjs) with ipcMain. A call is answered only when it comes from the
 * top frame of a page the app serves (app://ui/); anything else gets `{ ok: false, error: { code: 'refused' } }`.
 * @module desktop/main/bridge
 */

import { ipcMain } from 'electron'
import { assertHandlers, channelOf, methodNames, runHandler } from './bridge-methods.mjs'
import { isAppUrl } from './security.mjs'

/** The call came from the main frame of an app page (not a subframe, not another origin). */
export function trustedSender(event) {
  const frame = event?.senderFrame
  return Boolean(frame) && frame === event.sender?.mainFrame && isAppUrl(frame.url)
}

/**
 * @param {object} o
 * @param {Record<string, Function>} o.handlers - one per BRIDGE_METHODS entry
 * @param {(line: string) => void} o.log
 */
export function registerBridge({ handlers, log }) {
  assertHandlers(handlers)
  for (const name of methodNames()) {
    ipcMain.handle(channelOf(name), async (event, ...args) => {
      if (!trustedSender(event)) {
        log(`bridge ${name}: refused a call from ${event?.senderFrame?.url ?? 'an unknown frame'}`)
        return { ok: false, error: { code: 'refused' } }
      }
      return runHandler(name, handlers[name], args, log)
    })
  }
}
