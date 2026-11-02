/**
 * app://ui/ — the only origin the page loads from (docs/desktop.md §二).
 *
 *   app://ui/…          src/renderer/…           the page: index.html, app.js, kit/, screens/, texts/, texts-en/, styles/
 *                                                (texts/<name>.js is answered with texts-en/<name>.js while the app runs in
 *                                                English and that file exists: docs/desktop.md §十六)
 *   app://ui/shared/…   src/shared/…             modules shared with the main process (pure, no Node, no DOM)
 *   app://ui/vendor/…   three files of node_modules, by name (VENDOR); nothing else of node_modules
 *
 * GET only. The path rule is safe-path.mjs (docs/desktop.md §二): the path is judged as text first, so nothing
 * reaches the file system that could name another folder or another machine; then only a path inside the folder by
 * its text is looked up, links followed and still inside. Only the file types the page uses are served; the
 * gallery's files only in development (DEV_ONLY, compared with the real path). Every response carries the CSP,
 * nosniff and no-store. Any other app:// host added later (a reading view of a document, plan C3) uses safe-path.mjs the same way.
 * @module desktop/main/protocol
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { resolveInside, safeSegments } from './safe-path.mjs'
import { APP_HOST } from './security.mjs'

const require = createRequire(import.meta.url)

/** The folder of an installed package: up from its main file to the package.json that names it. */
function packageDir(name) {
  let dir = dirname(require.resolve(name))
  for (;;) {
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === name) return dir
    } catch { /* not this folder */ }
    const up = dirname(dir)
    if (up === dir) throw new Error(`cannot find the folder of the package ${name}`)
    dir = up
  }
}

/** The vendored modules, as the import map in index.html names them. */
export function vendorFiles() {
  const preact = packageDir('preact')
  const htm = packageDir('htm')
  return Object.freeze({
    'preact.module.js': join(preact, 'dist', 'preact.module.js'),
    'preact-hooks.module.js': join(preact, 'hooks', 'dist', 'hooks.module.js'),
    'htm.module.js': join(htm, 'dist', 'htm.module.js'),
  })
}

const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
})

function notFound() {
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export { safeSegments } from './safe-path.mjs'

/** The page's files only a development run serves: the component gallery (screens/kit.js and its words, style).
 *  Compared with the path relative to the real folder (its case on disk), not with the request's spelling (N2). */
export const DEV_ONLY = Object.freeze(['screens/kit.js', 'texts/kit.js', 'styles/screens/kit.css'])

/**
 * The request handler for protocol.handle('app', …).
 * @param {object} o
 * @param {string} o.rendererDir
 * @param {string} o.sharedDir
 * @param {Record<string,string>} o.vendor - vendorFiles()
 * @param {string} o.csp
 * @param {boolean} [o.dev] - a development run (not packaged): only then are the DEV_ONLY files served
 * @param {() => 'zh-CN'|'en'} [o.locale] - the language the app runs in now (locale.mjs), asked on every request
 */
export function createAppProtocolHandler({ rendererDir, sharedDir, vendor, csp, dev = false, locale = () => 'zh-CN' }) {
  const headers = type => ({
    'content-type': type,
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
  })
  return async function handle(request) {
    if (request.method !== 'GET') return notFound()
    let url
    try { url = new URL(request.url) } catch { return notFound() }
    if (url.host !== APP_HOST) return notFound()
    let path
    try { path = decodeURIComponent(url.pathname) } catch { return notFound() }
    if (path === '/') path = '/index.html'
    // first the text: anything that is not a plain name of the page's files is refused before any file is looked at
    const segments = safeSegments(path)
    if (!segments) return notFound()

    let file = null
    if (segments[0] === 'vendor') {
      file = segments.length === 2 && Object.hasOwn(vendor, segments[1]) ? vendor[segments[1]] : null
    } else {
      const [root, rest] = segments[0] === 'shared' ? [sharedDir, segments.slice(1)] : [rendererDir, segments]
      // the page's words in the user's language (docs/desktop.md §十六): texts/<name>.js is answered with texts-en/<name>.js
      // while the app runs in English and that file exists; the zh file otherwise (the gallery's words have no en table)
      let found = null
      if (root === rendererDir && rest[0] === 'texts' && rest.length === 2 && locale() === 'en') found = await resolveInside(root, ['texts-en', rest[1]])
      // then the file system, and only for a path inside the folder by its text (links followed: still inside)
      if (!found) found = await resolveInside(root, rest)
      if (found && !dev && root === rendererDir && DEV_ONLY.includes(found.rel)) return notFound()
      file = found ? found.file : null
    }
    if (!file) return notFound()
    const type = Object.hasOwn(TYPES, extname(file).toLowerCase()) ? TYPES[extname(file).toLowerCase()] : null
    if (!type) return notFound()
    try {
      if (!(await stat(file)).isFile()) return notFound()
      return new Response(await readFile(file), { status: 200, headers: headers(type) })
    } catch {
      return notFound()
    }
  }
}
