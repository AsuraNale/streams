// Static reading of the product's JavaScript for V2: which calls write a file whose path leads into notes/, and who
// calls writeNoteFile with what `by`. Plain text analysis, no dependency:
//   stripComments(src)          the source with comments blanked out (strings and line breaks kept)
//   notesWrites(files)          [{ file, line, call, arg }] for every write call whose path argument leads into notes/
//   writeNoteCalls(files)       [{ file, line, by, fn }] for every call of writeNoteFile (fn = the enclosing function)
//   sourceFiles(dir, exts)      [{ rel, text }] for every file under dir with one of the extensions (no node_modules)
//
// "Leads into notes/": the argument mentions the notes folder (NOTES_DIR, notesDir(…), notePath(…), a string literal
// 'notes' or '…/notes/…'), or an identifier that was assigned from such an expression in the same file, or a parameter of
// a function in the same file that is called with such an argument (followed to a fixed point).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export const WRITE_CALLS = {
  writeFileSync: [0], appendFileSync: [0], createWriteStream: [0], openSync: [0], truncateSync: [0],
  writeFile: [0], appendFile: [0], open: [0], truncate: [0],
  renameSync: [0, 1], rename: [0, 1], copyFileSync: [1], copyFile: [1], cpSync: [1], cp: [1],
  symlinkSync: [1], symlink: [1], linkSync: [1], link: [1],
}
const WRITE_RE = new RegExp(`(?<![\\w$])(${Object.keys(WRITE_CALLS).join('|')})\\s*\\(`, 'g')
const NOTES_REF = /\bNOTES_DIR\b|\bnotesDir\s*\(|\bnotePath\s*\(|(['"`])(?:[^'"`\n]*[\\/])?notes(?:[\\/][^'"`\n]*)?\1/

export function sourceFiles(dir, exts, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p, exts, base))
    else if (exts.includes(extname(name))) out.push({ rel: relative(base, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') })
  }
  return out
}

export function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++ } continue }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2)
      const end = e < 0 ? n : e + 2
      out += src.slice(i, end).replace(/[^\n]/g, ' ')
      i = end
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue }
        if (q !== '`' && src[i] === '\n') break
        out += src[i++]
      }
      if (i < n) out += src[i++]
      continue
    }
    out += c
    i++
  }
  return out
}

// the argument texts of the call whose '(' is at `open`, split at depth-0 commas
export function callArgs(code, open) {
  const args = []
  let depth = 0
  let cur = ''
  let quote = null
  for (let i = open + 1; i < code.length; i++) {
    const c = code[i]
    if (quote) {
      cur += c
      if (c === '\\') { cur += code[++i] ?? ''; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { if (cur.trim() !== '' || args.length) args.push(cur.trim()); return args }
      depth--
    }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  return args
}

const lineAt = (code, pos) => code.slice(0, pos).split('\n').length
const IDENT = '[A-Za-z_$][\\w$]*'

function mentions(text, tainted) {
  if (NOTES_REF.test(text)) return true
  for (const name of tainted) if (new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(text)) return true
  return false
}

function taintedNames(code) {
  const tainted = new Set()
  const assigns = [...code.matchAll(new RegExp(`(?:\\b(?:const|let|var)\\s+)?(${IDENT})\\s*=(?![=>])\\s*([^;\\n]+)`, 'g'))]
  const fns = []
  for (const m of code.matchAll(new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'g'))) fns.push({ name: m[1], params: m[2] })
  for (const m of code.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`, 'g'))) fns.push({ name: m[1], params: m[2] })
  const params = fns.map(f => ({ name: f.name, params: f.params.split(',').map(p => p.trim().replace(/\s*=.*$/, '')).map(p => (new RegExp(`^${IDENT}$`).test(p) ? p : null)) }))
  for (let pass = 0; pass < 12; pass++) {
    const size = tainted.size
    for (const m of assigns) if (!tainted.has(m[1]) && mentions(m[2], tainted)) tainted.add(m[1])
    for (const f of params) {
      for (const call of code.matchAll(new RegExp(`(?<![\\w$.])${f.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g'))) {
        const args = callArgs(code, call.index + call[0].length - 1)
        args.forEach((a, i) => { const p = f.params[i]; if (p && !tainted.has(p) && mentions(a, tainted)) tainted.add(p) })
      }
    }
    if (tainted.size === size) break
  }
  return tainted
}

export function notesWrites(files) {
  const found = []
  for (const { rel, text } of files) {
    const code = stripComments(text)
    const tainted = taintedNames(code)
    for (const m of code.matchAll(WRITE_RE)) {
      const args = callArgs(code, m.index + m[0].length - 1)
      for (const i of WRITE_CALLS[m[1]]) {
        if (args[i] !== undefined && mentions(args[i], tainted)) { found.push({ file: rel, line: lineAt(code, m.index), call: m[1], arg: args[i] }); break }
      }
    }
  }
  return found
}

export function writeNoteCalls(files) {
  const out = []
  for (const { rel, text } of files) {
    const code = stripComments(text)
    for (const m of code.matchAll(/(?<![\w$])writeNoteFile\s*\(/g)) {
      const lineStart = code.lastIndexOf('\n', m.index) + 1
      const line = code.slice(lineStart, code.indexOf('\n', m.index) < 0 ? code.length : code.indexOf('\n', m.index))
      if (/^\s*export\s+function\s+writeNoteFile\b/.test(line)) continue // the definition itself
      const args = callArgs(code, m.index + m[0].length - 1)
      const by = /\bby\s*:\s*(['"`])([^'"`]*)\1/.exec(args.at(-1) ?? '')?.[2] ?? null
      const before = code.slice(0, m.index)
      const fns = [...before.matchAll(new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(`, 'g'))]
      out.push({ file: rel, line: lineAt(code, m.index), by, fn: fns.at(-1)?.[1] ?? null })
    }
  }
  return out
}
