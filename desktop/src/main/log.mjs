/**
 * The app's own diagnostic log: <appData>/logs/main.log (inside the protected folder). One line per entry.
 * Never write a key, a token or a signing key here.
 * @module desktop/main/log
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** @returns {(line: string) => void} */
export function createLog(logsDir) {
  const file = join(logsDir, 'main.log')
  return line => {
    try {
      mkdirSync(logsDir, { recursive: true })
      appendFileSync(file, `${new Date().toISOString()} ${String(line).replace(/\r?\n/g, '\n    ')}\n`)
    } catch {
      // a log that cannot be written must not stop the app
    }
  }
}
