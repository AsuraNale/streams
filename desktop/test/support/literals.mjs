// The string and template literals of a JavaScript source, for the wording checks: a small tokenizer that
// skips comments and regular-expression literals and follows ${…} inside templates (PLACEHOLDER stands for the
// inserted value). Kept here so desktop/'s tests depend on no other package's test helpers.

const REGEX_AFTER_CHAR = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

// a private-use character: not Chinese, but counted as the wide side next to a comma in a Chinese sentence
export const PLACEHOLDER = String.fromCodePoint(0xE000)

/** @returns {{text: string, line: number}[]} */
export function stringLiterals(source) {
  const out = []
  const n = source.length
  let i = 0
  let prev = ''
  const lineOf = pos => source.slice(0, pos).split('\n').length
  const push = (start, text) => out.push({ text, line: lineOf(start) })
  function readQuoted(q) {
    const start = i++
    let text = ''
    while (i < n && source[i] !== q && source[i] !== '\n') {
      if (source[i] === '\\') { text += source.slice(i, i + 2); i += 2 } else text += source[i++]
    }
    i++
    push(start, text)
  }
  function readTemplate() {
    const start = i++
    let text = ''
    while (i < n && source[i] !== '`') {
      if (source[i] === '\\') { text += source.slice(i, i + 2); i += 2 } else if (source[i] === '$' && source[i + 1] === '{') {
        i += 2
        scan(true)
        text += PLACEHOLDER
      } else text += source[i++]
    }
    i++
    push(start, text)
  }
  function skipRegex() {
    i++
    let inClass = false
    while (i < n && source[i] !== '\n') {
      const c = source[i]
      if (c === '\\') { i += 2; continue }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) { i++; break }
      i++
    }
    while (i < n && /[a-z]/.test(source[i])) i++
  }
  function scan(inTemplate) {
    let depth = 0
    while (i < n) {
      const c = source[i]
      if (inTemplate && c === '}' && depth === 0) { i++; return }
      if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue }
      if (c === '/' && source[i + 1] === '*') { const e = source.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue }
      if (c === '"' || c === "'") { readQuoted(c); prev = 'literal'; continue }
      if (c === '`') { readTemplate(); prev = 'literal'; continue }
      if (c === '/') {
        if (prev === '' || REGEX_AFTER_CHAR.has(prev) || REGEX_AFTER_WORD.has(prev)) { skipRegex(); prev = 'literal' } else { prev = '/'; i++ }
        continue
      }
      if (/\s/.test(c)) { i++; continue }
      if (/[\w$]/.test(c)) {
        let j = i
        while (j < n && /[\w$]/.test(source[j])) j++
        prev = source.slice(i, j)
        i = j
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      prev = c
      i++
    }
  }
  scan(false)
  return out
}

const range = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`
export const CJK = new RegExp(`[${range(0x3400, 0x9FFF)}]`)

const WIDE = new RegExp(`[${range(0x3000, 0x303F)}${range(0x3400, 0x9FFF)}${range(0xFF00, 0xFFEF)}${PLACEHOLDER}]`)
const HALF = new Set([',', ';', ':', '?', '!', '(', ')'])

/** Half-width , ; : ? ! ( ) next to Chinese (spaces between do not help): should be ， ； ： ？ ！ （ ）. */
export function halfWidthPunctuation(text) {
  const chars = [...text]
  const hits = []
  for (let k = 0; k < chars.length; k++) {
    if (!HALF.has(chars[k])) continue
    let a = k - 1
    while (a >= 0 && chars[a] === ' ') a--
    let b = k + 1
    while (b < chars.length && chars[b] === ' ') b++
    if ((a >= 0 && WIDE.test(chars[a])) || (b < chars.length && WIDE.test(chars[b]))) hits.push({ char: chars[k], context: chars.slice(Math.max(0, k - 8), k + 9).join('') })
  }
  return hits
}
