// The file header of 待规范 (S8) as the text the user edits: one `key: value` line per key, a list as `[a, b]`, strings
// quoted when the core's YAML reader would otherwise read them as something else (a number, true / null, a list…).
//   headerText(header, { comments }) -> string     comments: { key: text } → `  # text` after that key's line
//   parseHeaderText(text) -> { ok: true, header } | { ok: false, line }   (line: 1-based, the first one not understood)
// The subset is what a header of the core's spec v0 needs at its top level; nested values (scores) are not shown in the
// text and are kept by the core, which merges what the page sends over the proposed header (core-api 5.9).
// The id is not in the text: it is the file name's (the files are not renamed).

const PLAIN_WORDS = /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/i

const needsQuote = (s, inList) => s === '' || s !== s.trim() || PLAIN_WORDS.test(s) || /^[[{'"#&*!|>%@`-]/.test(s) || /:\s|\s#|:$/.test(s) || (inList && /[,[\]{}]/.test(s))
const quote = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
const scalar = (v, inList = false) => (typeof v === 'string' ? (needsQuote(v, inList) ? quote(v) : v) : String(v))

/** Keys whose value the text can show and give back unchanged. */
const shown = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number'))

export function headerText(header, { comments = {} } = {}) {
  const lines = []
  for (const [key, value] of Object.entries(header ?? {})) {
    if (key === 'id' || !shown(value)) continue
    const text = Array.isArray(value) ? `[${value.map(x => scalar(x, true)).join(', ')}]` : scalar(value)
    lines.push(`${key}: ${text}${comments[key] ? `  # ${comments[key]}` : ''}`)
  }
  return lines.join('\n')
}

function readQuoted(s) {
  const q = s[0]
  let out = ''
  for (let i = 1; i < s.length; i++) {
    const c = s[i]
    if (q === '"' && c === '\\') {
      const n = s[++i]
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n ?? ''
      continue
    }
    if (c === q) {
      if (q === "'" && s[i + 1] === "'") { out += "'"; i++; continue }
      return { value: out, rest: s.slice(i + 1) }
    }
    out += c
  }
  return null
}

const restOk = rest => /^\s*(?:#.*)?$/.test(rest)

/** `[a, "b, c", 'd']` (and a comment after it): the items, a quoted one may hold commas and brackets. */
function readList(s) {
  const items = []
  let i = 1
  for (;;) {
    while (s[i] === ' ' || s[i] === '\t') i++
    if (s[i] === ']' && items.length === 0) { i++; break }
    let item
    if (s[i] === '"' || s[i] === "'") {
      const r = readQuoted(s.slice(i))
      if (!r) return null
      item = r.value
      i = s.length - r.rest.length
      while (s[i] === ' ' || s[i] === '\t') i++
    } else {
      const m = /^[^,[\]{}]*/.exec(s.slice(i))
      item = m[0].trim()
      if (item === '') return null
      i += m[0].length
    }
    items.push(item)
    if (s[i] === ',') { i++; continue }
    if (s[i] === ']') { i++; break }
    return null
  }
  return restOk(s.slice(i)) ? { value: items } : null
}

function readValue(raw) {
  const s = raw.trim()
  if (s === '' || s.startsWith('#')) return { value: '' }
  if (s[0] === '"' || s[0] === "'") {
    const r = readQuoted(s)
    return r && restOk(r.rest) ? { value: r.value } : null
  }
  if (s[0] === '[') return readList(s)
  if (s[0] === '{') return null
  const hash = s.search(/\s#/)
  const plain = (hash < 0 ? s : s.slice(0, hash)).trim()
  if (/^-?\d+(?:\.\d+)?$/.test(plain)) return { value: Number(plain) }
  if (/^(?:true|false)$/.test(plain)) return { value: plain === 'true' }
  if (/^(?:null|~)$/.test(plain)) return { value: null }
  return { value: plain }
}

export function parseHeaderText(text) {
  const header = {}
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const m = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/.exec(line)
    if (!m || Object.hasOwn(header, m[1])) return { ok: false, line: i + 1 }
    const v = readValue(m[2] ?? '')
    if (!v) return { ok: false, line: i + 1 }
    header[m[1]] = v.value
  }
  return { ok: true, header }
}
