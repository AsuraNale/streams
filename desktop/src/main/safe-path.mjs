/**
 * The path rule for every app:// address that reaches files (docs/desktop.md §二「app:// 的路径规则」): app://ui/ now,
 * any other app:// host later. All of them use these functions; no copy of the rule anywhere else.
 *
 * 1. safeSegments(path): the decoded URL path as its segments, judged on the text alone. Nothing here touches the
 *    file system, so no spelling can make Windows open a network share (D2). A segment may hold letters and digits
 *    of any script, marks, punctuation, symbols and the plain space, so `样式.css` and `第 1 稿（定稿）.html` are
 *    names like any other (N1). It may not be empty, `.` or `..`; start with a dot; start or end with a space; end
 *    with a dot (Windows drops it); hold a control or format character, a line separator or any space but the
 *    plain one; hold `%` (a second decoding), a colon (drive letters, streams), a slash or backslash or a
 *    look-alike of one, or one of `< > " | ? *`; or be a Windows device name, with or without an extension
 *    (`CON`, `aux.js`, `COM1.css`, `com¹`, `CONIN$`, `nul .txt`).
 * 2. resolveInside(root, segments): the joined path must be inside `root` by its text; only then realpath (links
 *    and 8.3 short names followed, the case as it is on disk) and inside again. It returns the real file and its
 *    path relative to the real root with `/`: compare a name against that, never against the request's spelling
 *    (N2: `Screens/KIT.js` is `screens/kit.js` on a Windows disk).
 * @module desktop/main/safe-path
 */

import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

// printable: letters, marks, digits, punctuation, symbols of any script, and the plain space
const PRINTABLE = /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]+$/u
// backslash, slash, colon, percent, < > " | ? *, and slashes that look like one (∕ ⧵ ﹨ ／ ＼)
const FORBIDDEN = new Set([0x5c, 0x2f, 0x3a, 0x25, 0x3c, 0x3e, 0x22, 0x7c, 0x3f, 0x2a, 0x2215, 0x29f5, 0xfe68, 0xff0f, 0xff3c].map(c => String.fromCodePoint(c)))
// Windows device names, with or without an extension (spaces before it too), superscript digits included
const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin[$]|conout[$])( *[.].*)?$/i

/** One segment of a path the app may look up (rule 1 above). */
export function isSafeSegment(s) {
  if (typeof s !== 'string' || s === '' || s === '.' || s === '..') return false
  if (s.startsWith('.') || s.startsWith(' ') || s.endsWith('.') || s.endsWith(' ')) return false
  if (!PRINTABLE.test(s)) return false
  for (const ch of s) if (FORBIDDEN.has(ch)) return false
  return !DEVICE.test(s)
}

/**
 * The decoded request path as its segments, or null when any segment breaks rule 1.
 * @param {string} path - the URL's path, percent-decoded once, starting with `/`
 * @returns {string[]|null}
 */
export function safeSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null
  const segments = path.slice(1).split('/')
  return segments.every(isSafeSegment) ? segments : null
}

/** `child` is inside `parent`, by the text of the paths alone (no file system). */
export function lexicallyInside(child, parent) {
  const rel = relative(parent, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Rule 2: the file `segments` name under `root`, or null. The file system is asked only about a path that is
 * inside `root` by its text, and the answer must be inside the real root as well.
 * @param {string} root - an absolute folder
 * @param {string[]} segments - from safeSegments (checked again here)
 * @returns {Promise<{ file: string, rel: string }|null>} the real path, and the path relative to the real root with `/`
 */
export async function resolveInside(root, segments) {
  if (!Array.isArray(segments) || segments.length === 0 || !segments.every(isSafeSegment)) return null
  const candidate = join(root, ...segments)
  if (!lexicallyInside(candidate, root)) return null
  try {
    const [r, f] = await Promise.all([realpath(root), realpath(candidate)])
    if (!lexicallyInside(f, r)) return null
    return { file: f, rel: relative(r, f).split(sep).join('/') }
  } catch {
    return null
  }
}
