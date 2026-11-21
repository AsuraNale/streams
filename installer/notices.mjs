/**
 * THIRD-PARTY-NOTICES.txt for the installed app, written by the build from the folder that goes into the installer, so
 * it lists exactly what ships: every npm package (name, version, license, the license and notice files it carries),
 * Electron (Chromium's own notices are the LICENSES.chromium.html shipped next to Streams.exe), and Streams' own parts.
 * The packages under the MPL-2.0 or the LGPL get a first section that says where their source code is.
 * v2 package K2: and the bundled UI font, Noto Sans SC (resources/app/src/renderer/fonts), with its SIL Open Font License in
 * full — read from the license file shipped beside the font, so the notices say what ships.
 * Redesign R6a: and Noto Serif SC, the heading font of the Research theme, the same way — its own line and its own OFL text
 * (the LICENSE of the release it came from); the fonts and their words are installer/fonts.mjs.
 * @module installer/notices
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { BUNDLED_FONTS, fontOfFile } from './fonts.mjs'

const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright|authors)([._-].*)?$/i
// 1.1 W2: projects shipped inside an npm package without their own license file there (desktop/src/main/third-party/)
export const BUNDLED_INSIDE = Object.freeze([
  Object.freeze({ pkg: 'unpdf', name: 'PDF.js 6.4.299', license: 'Apache-2.0', file: Object.freeze(['src', 'main', 'third-party', 'PDFJS-LICENSE.txt']) }),
])
const sha = text => createHash('sha256').update(text).digest('hex')
const rule = char => char.repeat(78)

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function licenseOf(pkg) {
  if (!pkg) return 'UNKNOWN'
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(l => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ') || 'UNKNOWN'
  return 'UNKNOWN'
}

function repoOf(pkg) {
  const r = pkg?.repository
  const url = typeof r === 'string' ? r : r?.url
  return url ? String(url).replace(/^git\+/, '') : (pkg?.homepage ?? null)
}

/** Every package folder below a node_modules folder (scoped ones too, nested node_modules too). */
function packagesIn(nodeModules, root, out = []) {
  if (!existsSync(nodeModules)) return out
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dirs = entry.name.startsWith('@')
      ? readdirSync(join(nodeModules, entry.name), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(nodeModules, entry.name, e.name))
      : [join(nodeModules, entry.name)]
    for (const dir of dirs) {
      const pkg = readJson(join(dir, 'package.json'))
      if (pkg?.name && pkg?.version) out.push({ dir, rel: relative(root, dir), pkg })
      packagesIn(join(dir, 'node_modules'), root, out)
    }
  }
  return out
}

function licenseTexts(dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (!LICENSE_FILE.test(name) || !statSync(path).isFile()) continue
    if (/\.html?$/i.test(name) && statSync(path).size > 64 * 1024) { out.push({ name, text: null, size: statSync(path).size }); continue }
    out.push({ name, text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim() })
  }
  return out
}

/** The lock's `resolved` URL for each package path, to say where an npm package came from. */
function resolvedUrls(lockFile) {
  const lock = readJson(lockFile)
  const out = new Map()
  for (const [key, value] of Object.entries(lock?.packages ?? {})) {
    if (key && value?.resolved) out.set(`${key.replace(/^.*node_modules\//, '')}@${value.version}`, value.resolved)
  }
  return out
}

/**
 * @param {object} o
 * @param {string} o.stage - the folder that goes into the installer (its layout: docs/installer.md §三)
 * @param {string} o.lockFile - desktop/package-lock.json (where each npm package was downloaded from)
 * @param {{appName: string, version: string, electron: string}} o.facts
 * @returns {{text: string, npm: number, fonts: number, fontLicenses: string[], fontProblems: string[], copyleft: object[]}}
 *   fonts: the font files listed; fontLicenses: the fonts whose license text is printed in full; fontProblems: a font file
 *   nobody listed, or one without its license text (redesign R6a)
 */
export function buildNotices({ stage, lockFile, facts }) {
  const resources = join(stage, 'resources')
  const npm = packagesIn(join(resources, 'app', 'node_modules'), stage)
  const byId = new Map()
  for (const p of npm) {
    const id = `${p.pkg.name}@${p.pkg.version}`
    if (!byId.has(id)) byId.set(id, { ...p, id, copies: [] })
    byId.get(id).copies.push(p.rel)
  }
  const ours = [...byId.values()].filter(p => p.pkg.name.startsWith('@streams/'))
  const third = [...byId.values()].filter(p => !p.pkg.name.startsWith('@streams/')).sort((a, b) => a.id.localeCompare(b.id))
  const urls = resolvedUrls(lockFile)
  const copyleft = third.filter(p => /MPL|LGPL|(^|[^L])GPL/i.test(licenseOf(p.pkg)))

  const L = []
  const line = (s = '') => L.push(s)
  line(`${facts.appName} ${facts.version} — THIRD-PARTY NOTICES / 第三方许可说明`)
  line(rule('='))
  line('This file lists the third-party software shipped in this installation and its licenses. It is written by the')
  line('build (installer/notices.mjs) from the installed files themselves. Paths are relative to the install folder.')
  line('本文件列出本安装包里第三方软件的名称、版本与许可；路径相对于安装文件夹。')
  line()
  line('Contents / 目录')
  line('  1. Source code for the MPL-2.0 and LGPL components / MPL-2.0 与 LGPL 组件的源码在哪里')
  line(`  2. Electron ${facts.electron} and Chromium`)
  line(`  3. ${third.length} npm packages: list`)
  line('  4. npm packages: license texts')
  line("  5. Streams' own parts")
  line('  6. Fonts / 字体')
  line()

  line(rule('='))
  line('1. Source code for the MPL-2.0 and LGPL components / MPL-2.0 与 LGPL 组件的源码在哪里')
  line(rule('='))
  line('These components are shipped unmodified, as published on the npm registry. Their source code is available at the')
  line('locations below (the npm tarball is the exact form shipped here; the repository holds the source it was built from).')
  line('以下组件按 npm 上发布的原样随附，未作修改；源码见下列地址。')
  line()
  if (copyleft.length === 0) line('(none in this build)')
  for (const p of copyleft) {
    line(`* ${p.id} — ${licenseOf(p.pkg)}`)
    line(`    installed at: ${p.copies.join(', ')}`)
    const tarball = urls.get(p.id)
    if (tarball) line(`    npm tarball:  ${tarball}`)
    const repo = repoOf(p.pkg)
    if (repo) line(`    repository:   ${repo}${p.pkg.repository?.directory ? ` (folder ${p.pkg.repository.directory})` : ''}`)
    line()
  }

  line(rule('='))
  line(`2. Electron ${facts.electron} and Chromium`)
  line(rule('='))
  line('Streams.exe and the files next to it are Electron (https://github.com/electron/electron), unmodified apart from the')
  line('file name of electron.exe and, in Streams.exe, its icon and version-information resources, which carry Streams\'')
  line('own (no code changed). Electron is under the MIT license below. Chromium and the components it includes are')
  line('under their own licenses, all listed in LICENSES.chromium.html in the install folder.')
  line()
  if (existsSync(join(stage, 'LICENSE'))) line(readFileSync(join(stage, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim())
  line()

  line(rule('='))
  line(`3. npm packages (${third.length}): name, version, license, where it came from`)
  line(rule('='))
  for (const p of third) {
    line(`* ${p.id} — ${licenseOf(p.pkg)}${repoOf(p.pkg) ? ` — ${repoOf(p.pkg)}` : ''}`)
  }
  line()

  line(rule('='))
  line('4. npm packages: license texts / 许可原文')
  line(rule('='))
  const printed = new Map()
  for (const p of third) {
    const texts = licenseTexts(p.dir)
    line(rule('-'))
    line(`${p.id} (${licenseOf(p.pkg)})`)
    line(rule('-'))
    if (texts.length === 0) line(`The package ships no license file; its package.json says: ${licenseOf(p.pkg)}.`)
    for (const t of texts) {
      if (t.text === null) { line(`${t.name}: ${t.size} bytes, shipped at ${join(p.rel, t.name)} (not copied here)`); continue }
      const h = sha(t.text)
      if (printed.has(h)) { line(`${t.name}: the same text as ${printed.get(h)} above.`); continue }
      printed.set(h, `${p.id} ${t.name}`)
      line(`${t.name}:`)
      line(t.text)
    }
    // 1.1 W2: a package that carries another project inside it, whose own license file it does not ship (unpdf bundles
    // PDF.js, Apache-2.0): that project's notice and license, from the file the app ships for it
    for (const b of BUNDLED_INSIDE.filter(x => x.pkg === p.pkg.name)) {
      const path = join(resources, 'app', ...b.file)
      line()
      line(`Inside ${p.pkg.name}: ${b.name} (${b.license}) — ${['resources', 'app', ...b.file].join('\\')}`)
      line(existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim() : `(MISSING: ${b.file.join('/')})`)
    }
    line()
  }

  line(rule('='))
  line("5. Streams' own parts")
  line(rule('='))
  line('resources\\app (the desktop app) and resources\\core (the core) are Streams\' own, under the MIT license below')
  line('(also at resources\\app\\LICENSE). Developed by Starry Digital (https://starrydigital.ca).')
  line('resources\\app（桌面端）与 resources\\core（核心）是流息自己的代码，MIT 许可（原文如下，另见 resources\\app\\LICENSE）。')
  line()
  const ownLicense = join(resources, 'app', 'LICENSE')
  if (existsSync(ownLicense)) {
    line(rule('-'))
    line('Streams: LICENSE')
    line(rule('-'))
    line(readFileSync(ownLicense, 'utf8').replace(/\r\n/g, '\n').trim())
    line()
  }
  for (const p of ours) {
    line(`* ${p.id} — ${licenseOf(p.pkg)} — ${p.copies.join(', ')}`)
  }
  for (const p of ours) {
    for (const t of licenseTexts(p.dir)) {
      if (t.text === null) continue
      line()
      line(rule('-'))
      line(`${p.id}: ${t.name}`)
      line(rule('-'))
      line(t.text)
    }
  }
  line()

  // v2 package K2: the bundled font and its license (the files themselves, as shipped)
  line(rule('='))
  line('6. Fonts / 字体')
  line(rule('='))
  // redesign R6a: every font file of the folder has its line — which font it is and what the app uses it for come from
  // installer/fonts.mjs (Noto Sans SC, the interface font; Noto Serif SC, the heading font of the Research theme) — and each
  // font's own license text follows in full, read from the file shipped beside it. A font file fonts.mjs does not list, or a
  // font whose license text is not in the stage, is reported (fontProblems): the build stops on it.
  const fontDir = join(resources, 'app', 'src', 'renderer', 'fonts')
  const fonts = existsSync(fontDir) ? readdirSync(fontDir).filter(n => /\.(ttf|otf|woff2?)$/i.test(n)).sort() : []
  const fontProblems = []
  const fontLicenses = []
  if (fonts.length === 0) line('(none in this build)')
  for (const f of fonts) {
    const font = fontOfFile(f)
    if (!font) { fontProblems.push(`${f}: a font file installer/fonts.mjs does not list`); line(`* ${f} — installed at ${relative(stage, join(fontDir, f))}`) }
    else line(`* ${f} — ${font.name}, ${font.role}, unmodified — ${font.license} — installed at ${relative(stage, join(fontDir, f))}`)
    line(`    sha256: ${createHash('sha256').update(readFileSync(join(fontDir, f))).digest('hex')}`)
    if (font && !existsSync(join(fontDir, font.licenseFile))) fontProblems.push(`${f}: its license text ${font.licenseFile} is not in the stage`)
  }
  for (const font of BUNDLED_FONTS) {
    const fontLicense = join(fontDir, font.licenseFile)
    if (!fonts.includes(font.file) || !existsSync(fontLicense)) continue
    line()
    line(rule('-'))
    line(`${font.name}: ${relative(stage, fontLicense)}`)
    line(rule('-'))
    line(readFileSync(fontLicense, 'utf8').replace(/\r\n/g, '\n').trim())
    fontLicenses.push(font.name)
  }
  line()
  return { text: `${L.join('\n')}\n`, npm: third.length, fonts: fonts.length, fontLicenses, fontProblems, copyleft: copyleft.map(p => ({ id: p.id, license: licenseOf(p.pkg), source: urls.get(p.id) ?? null, repository: repoOf(p.pkg) })) }
}
