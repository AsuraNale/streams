/**
 * What must never be inside the installer or an installed copy (W7-4, V7): a key, a real e-mail address of ours, a path
 * or name of the build machine, the content of a real or example project. Used by the build (on the folder that goes into
 * the installer) and by the packaged-app test (on the installed folder and the installer file itself).
 *
 * Every file is read whole as bytes and searched as Latin-1 text (UTF-8 and ASCII inside binaries) and, for the fixed
 * strings, also as UTF-16LE (Windows binaries and resources keep strings that way). A hit is reported with the file, the
 * offset and the kind; a key-shaped hit only by its first characters, never in full.
 *
 * What counts:
 *   key           an API key (`sk-` and 32 hexadecimal digits) or a key-shaped test value of this repository
 *                 (`sk-streams-test-key-…`), not inside a word
 *   machine       the build machine: `Users\<profile folder>` in any slash or JSON-escaped form, its computer name
 *   email         the e-mail addresses of this repository's git identity and of the user (`emails` option), and any
 *                 address at a personal mail domain inside our own code (desktop, core)
 *   content       content that is not ours to ship: a development folder's name, the trial folder
 *   dev           development-only things: the component gallery's files, the development scripts
 * Third-party packages carry their authors' public addresses (package.json, licenses); those are counted as `info`,
 * not as hits.
 * @module installer/scan
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { basename, join, relative, sep } from 'node:path'

const PERSONAL_MAIL = /[A-Za-z0-9._%+-]+@(?:gmail|googlemail|qq|163|126|yeah|sina|sohu|foxmail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail)\.(?:com|cn|me)\b/g
// an API key (sk- and 32 hexadecimal digits), or a key-shaped test value as this repository writes them
// (sk-streams-test-key-…: words joined by hyphens, 20 characters or more); not inside a word (disk-count, task-policy)
const KEY = /(?<![A-Za-z0-9])sk-(?:[0-9a-f]{32}(?![0-9A-Za-z])|(?=[a-z0-9-]{17})[a-z0-9]+(?:-[a-z0-9]+){2,})/g

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The build machine's own markers, read from the machine (nothing hard-coded: a real address written here would itself be
 * the leak). Addresses: git's user.email (repository and global) and any in STREAMS_SCAN_EMAILS (comma-separated), which
 * the person building sets for the addresses that must never ship.
 */
export function machineMarkers({ emails = [] } = {}) {
  const profile = basename(homedir())
  const gitEmail = args => {
    const git = spawnSync('git', ['config', ...args, 'user.email'], { encoding: 'utf8', windowsHide: true })
    return git.status === 0 ? git.stdout.trim() : ''
  }
  const fromEnv = (process.env.STREAMS_SCAN_EMAILS ?? '').split(',').map(e => e.trim())
  return {
    profile,
    host: hostname(),
    emails: [...new Set([gitEmail([]), gitEmail(['--global']), ...fromEnv, ...emails].filter(e => e && e.includes('@')))],
  }
}

/** Where a path sits: our own code or a third-party package (only our own code is held to the personal-mail rule). */
export function isThirdParty(rel) {
  const parts = rel.split(/[\\/]/)
  const nm = parts.lastIndexOf('node_modules')
  if (nm >= 0) {
    const name = parts[nm + 1]?.startsWith('@') ? `${parts[nm + 1]}/${parts[nm + 2]}` : parts[nm + 1]
    return !String(name).startsWith('@streams/') && !String(name).startsWith('@streams\\')
  }
  if (/^(LICENSES\.chromium\.html|LICENSE|THIRD-PARTY-NOTICES\.txt)$/i.test(rel)) return true
  return /\.(dll|pak|bin|dat|exe)$/i.test(rel) && parts.length === 1 // Electron's own files next to the app
}

function* files(root, dir = root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const st = lstatSync(path)
    if (st.isSymbolicLink()) { yield { path, link: true }; continue }
    if (entry.isDirectory()) yield* files(root, path)
    else if (entry.isFile()) yield { path, link: false }
  }
}

/**
 * @param {string[]} targets - folders and files
 * @param {{markers?: object, contentMarkers?: string[], devFiles?: string[]}} [o]
 * @returns {{scanned: number, bytes: number, hits: object[], info: {thirdPartyPersonalMail: number, links: string[]}}}
 */
export function scanForLeaks(targets, { markers = machineMarkers(), contentMarkers = [], devFiles = [] } = {}) {
  const fixed = []
  const add = (kind, text, { caseless = false } = {}) => {
    for (const variant of caseless ? [...new Set([text, text.toLowerCase(), text.toUpperCase()])] : [text]) {
      fixed.push({ kind, text, latin1: Buffer.from(variant, 'utf8'), utf16: Buffer.from(variant, 'utf16le') })
    }
  }
  const pathRe = new RegExp(`users(?:\\\\{1,2}|/)${esc(markers.profile)}(?![A-Za-z0-9_-])`, 'gi')
  for (const slash of ['\\', '/']) add('machine', `Users${slash}${markers.profile}${slash}`, { caseless: true })
  add('machine', markers.host, { caseless: true })
  for (const e of markers.emails) add('email', e, { caseless: true })
  for (const c of contentMarkers) add('content', c)

  const hits = []
  const info = { thirdPartyPersonalMail: 0, links: [] }
  let scanned = 0
  let bytes = 0
  const seen = new Set()
  const note = (file, kind, offset, shown) => {
    const key = `${file}|${kind}|${shown}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ file, kind, offset, shown })
  }
  for (const target of targets) {
    const st = lstatSync(target)
    const list = st.isDirectory() ? files(target) : [{ path: target, link: false }]
    for (const { path, link } of list) {
      const rel = st.isDirectory() ? relative(target, path) : basename(path)
      if (link) { info.links.push(rel); continue }
      const lower = rel.split(sep).join('/').toLowerCase()
      for (const dev of devFiles) if (lower.endsWith(dev.toLowerCase())) note(rel, 'dev', 0, dev)
      const buf = readFileSync(path)
      scanned += 1
      bytes += buf.length
      for (const f of fixed) {
        for (const [enc, needle] of [['utf8', f.latin1], ['utf16le', f.utf16]]) {
          const at = buf.indexOf(needle)
          if (at >= 0) note(rel, f.kind, at, `${f.kind === 'content' ? f.text : f.text.slice(0, 40)} (${enc})`)
        }
      }
      const text = buf.toString('latin1')
      for (const m of text.matchAll(pathRe)) note(rel, 'machine', m.index, m[0])
      for (const m of text.matchAll(KEY)) note(rel, 'key', m.index, `${m[0].slice(0, 6)}… (${m[0].length} characters)`)
      const third = isThirdParty(rel)
      for (const m of text.matchAll(PERSONAL_MAIL)) {
        if (third) info.thirdPartyPersonalMail += 1
        else note(rel, 'email', m.index, m[0])
      }
    }
  }
  return { scanned, bytes, hits, info }
}
