/**
 * 许可证与致谢 (mockup S14; docs/desktop.md §四 getLicenses / openNotices): Streams' own license in full, the parts that ship
 * with it, and whether the full third-party notices are there to open. Pure Node (no Electron: main.mjs gives the folders),
 * so the rules run in plain Node (test/licenses.test.mjs).
 *   own         { license: 'MIT', text }: the packaged app reads its own copy, resources/app/LICENSE (installer/build-installer.mjs
 *               puts the repository's LICENSE there); a development run reads the repository's, beside desktop/
 *   components  [{ name, version, license }]: Electron, Chromium, Node.js (the version from the runtime's process.versions),
 *               Preact, htm and @mozilla/readability (the reading mode's article extraction, v2 package H; the version and
 *               the license from their own package.json in the app's node_modules: what ships)
 *               v2 package K2: and the bundled UI font, Noto Sans SC (its version from the font file's own name table, the
 *               license SIL OFL 1.1)
 *   font        v2 package K2: { name, license, text } — the font's license in full (src/renderer/fonts/OFL-NotoSansSC.txt,
 *               shipped beside the font), shown in the dialog under the table
 *   notices     { available }: THIRD-PARTY-NOTICES.txt beside Streams.exe (installer/notices.mjs writes it at build time);
 *               only an install has it, so a development run says false whatever its folders hold
 * @module desktop/main/licenses
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The full notices of an install, beside Streams.exe. */
export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt'

// the runtime's three parts (their license is the project's own) and the app's three packages (read from their package.json):
// the page's two, and the reading window's article extraction (main process, v2 package H; desktop/package.json dependencies)
const RUNTIME = Object.freeze([
  Object.freeze({ name: 'Electron', version: 'electron', license: 'MIT' }),
  Object.freeze({ name: 'Chromium', version: 'chrome', license: 'BSD-3-Clause' }),
  Object.freeze({ name: 'Node.js', version: 'node', license: 'MIT' }),
])
const PACKAGES = Object.freeze([
  Object.freeze({ name: 'Preact', pkg: 'preact' }),
  Object.freeze({ name: 'htm', pkg: 'htm' }),
  Object.freeze({ name: '@mozilla/readability', pkg: '@mozilla/readability' }),
])

// v2 package K2: the UI font that ships with the app (styles/fonts.css loads it through app://) and its license text
export const FONT = Object.freeze({
  name: 'Noto Sans SC',
  license: 'OFL-1.1',
  file: Object.freeze(['src', 'renderer', 'fonts', 'NotoSansSC-VF.ttf']),
  licenseFile: Object.freeze(['src', 'renderer', 'fonts', 'OFL-NotoSansSC.txt']),
})

/**
 * A TrueType / OpenType font's version from its own name table (name id 5, Windows / Unicode BMP), the leading
 * 「Version 」 dropped and cut at the first 「;」: 'Version 2.04;241114210130;non-release' → '2.04'. '' when it has none.
 * @param {Buffer} b - the font file
 */
export function fontVersion(b) {
  try {
    const tables = b.readUInt16BE(4)
    let name = -1
    for (let i = 0; i < tables; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'name') name = b.readUInt32BE(12 + i * 16 + 8)
    if (name < 0) return ''
    const count = b.readUInt16BE(name + 2)
    const strings = name + b.readUInt16BE(name + 4)
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12
      if (b.readUInt16BE(r) !== 3 || b.readUInt16BE(r + 6) !== 5) continue
      const len = b.readUInt16BE(r + 8)
      const at = strings + b.readUInt16BE(r + 10)
      let s = ''
      for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(b.readUInt16BE(at + j))
      return s.replace(/^Version\s+/i, '').split(';')[0].trim()
    }
  } catch { /* not a font file */ }
  return ''
}

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
    // v2 package K2: the bundled font, read from the file that ships
    { name: FONT.name, version: fontVersion(readFileSync(join(desktopDir, ...FONT.file))), license: FONT.license },
  ]
  const notices = noticesFileOf({ packaged, installDir })
  return {
    own: { license: /^MIT License\b/.test(text) ? 'MIT' : 'unknown', text },
    components,
    font: { name: FONT.name, license: FONT.license, text: readFileSync(join(desktopDir, ...FONT.licenseFile), 'utf8') },
    notices: { available: notices !== null && existsSync(notices) },
  }
}
