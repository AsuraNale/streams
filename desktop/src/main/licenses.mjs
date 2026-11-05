/**
 * 许可证与致谢 (mockup S14; docs/desktop.md §四 getLicenses / openNotices): Streams' own license in full, the parts that ship
 * with it, and whether the full third-party notices are there to open. Pure Node (no Electron: main.mjs gives the folders),
 * so the rules run in plain Node (test/licenses.test.mjs).
 *   own         { license: 'MIT', text }: the packaged app reads its own copy, resources/app/LICENSE (installer/build-installer.mjs
 *               puts the repository's LICENSE there); a development run reads the repository's, beside desktop/
 *   components  [{ name, version, license }]: Electron, Chromium, Node.js (the version from the runtime's process.versions),
 *               Preact and htm (the version and the license from their own package.json in the app's node_modules: what ships)
 *   notices     { available }: THIRD-PARTY-NOTICES.txt beside Streams.exe (installer/notices.mjs writes it at build time);
 *               only an install has it, so a development run says false whatever its folders hold
 * @module desktop/main/licenses
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The full notices of an install, beside Streams.exe. */
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt'

// the runtime's three parts (their license is the project's own) and the page's two (read from their package.json)
const RUNTIME = Object.freeze([
  Object.freeze({ name: 'Electron', version: 'electron', license: 'MIT' }),
  Object.freeze({ name: 'Chromium', version: 'chrome', license: 'BSD-3-Clause' }),
  Object.freeze({ name: 'Node.js', version: 'node', license: 'MIT' }),
])
const PACKAGES = Object.freeze([Object.freeze({ name: 'Preact', pkg: 'preact' }), Object.freeze({ name: 'htm', pkg: 'htm' })])

/** Where Streams' own LICENSE is: the packaged app's copy, or the repository's in development. */
export const licenseFileOf = ({ packaged, desktopDir }) => (packaged ? join(desktopDir, 'LICENSE') : join(desktopDir, '..', 'LICENSE'))

/** The notices file of an install, or null in development. */
export const noticesFileOf = ({ packaged, installDir }) => (packaged ? join(installDir, NOTICES_FILE) : null)

/**
 * @param {{packaged: boolean, desktopDir: string, installDir: string, versions?: Record<string, string>}} o
 *   desktopDir: the app's folder (desktop/ in development, resources/app installed); installDir: Streams.exe's folder
 */
export function licensesView({ packaged, desktopDir, installDir, versions = process.versions }) {
  const text = readFileSync(licenseFileOf({ packaged, desktopDir }), 'utf8')
  const pkgOf = name => JSON.parse(readFileSync(join(desktopDir, 'node_modules', name, 'package.json'), 'utf8'))
  const components = [
    ...RUNTIME.map(c => ({ name: c.name, version: String(versions[c.version] ?? ''), license: c.license })),
    ...PACKAGES.map(p => { const pkg = pkgOf(p.pkg); return { name: p.name, version: String(pkg.version ?? ''), license: String(pkg.license ?? '') } }),
  ]
  const notices = noticesFileOf({ packaged, installDir })
  return {
    own: { license: /^MIT License\b/.test(text) ? 'MIT' : 'unknown', text },
    components,
    notices: { available: notices !== null && existsSync(notices) },
  }
}
