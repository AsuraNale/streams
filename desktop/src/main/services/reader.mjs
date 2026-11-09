/**
 * 「打开原文」 (v2 package H; docs/desktop.md §4.9): `openReader(url, how)` opens an item of the open library — in the reading
 * window (how 'reader': reader.mjs, 阅读模式 or the original page) or with the system browser (how 'browser'). The address must
 * be an item the library knows: one in its record (the ledger: everything it ever caught, 抓到的 and 待看 included) or the
 * source of a note in its index; and http(s). Anything else is bad_arguments and nothing is opened. Nothing is written.
 *
 * The core's functions are reached by name (coreCaller), so a stand-in core can be given in the tests; the reader is injected.
 * Pure Node apart from what is injected: test/reader.test.mjs.
 * @module desktop/main/services/reader
 */

import { BridgeError, coreCaller } from '../bridge-methods.mjs'
import * as realCore from '../core.mjs'
import { isWebUrl } from '../reader.mjs'

/**
 * @param {object} o
 * @param {{require: () => string}} o.library - services/library.mjs
 * @param {{open: (url: string) => Promise<object>, openExternal: (url: string) => void}} o.reader - reader.mjs createReader
 * @param {(line: string) => void} o.log
 * @param {Record<string, unknown>} [o.core]
 */
export function createReaderService({ library, reader, log, core = realCore }) {
  const call = coreCaller(core)

  /** The url is an http(s) item of the open library, or bad_arguments. */
  const known = url => {
    const dir = library.require()
    if (!isWebUrl(url)) throw new BridgeError('bad_arguments', 'not an http(s) address')
    const inRecord = call('replayLedger', dir).states.has(url)
    if (!inRecord && !call('readIndex', dir).some(e => e.source === url)) throw new BridgeError('bad_arguments', 'not an item of the library')
  }

  const handlers = {
    async openReader(url, how) {
      known(url)
      if (how === 'browser') {
        reader.openExternal(url)
        return null
      }
      log(`reader: open ${url.slice(0, 200)}`)
      return reader.open(url)
    },
  }
  return { handlers }
}
