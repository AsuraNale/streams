// Source hygiene: the wording sources hold no raw invisible or blank-looking
// characters. Code writes them as escapes (backslash, u, code point); prose writes "U+200B".
// Why: a raw one can be stripped by an editor or a tool without anyone noticing, and the tests
// that feed such characters to the scanner then quietly stop testing anything. It happened once:
// scanner-fixes.test.mjs carried raw zero-width characters, and with them stripped and the
// zero-width removal deleted from normalize.mjs, the whole suite stayed green (seen in the earlier shell).
// Characters are named here by number only, so this file cannot trip its own check.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORDING = fileURLToPath(new URL('../', import.meta.url))
const DOC = fileURLToPath(new URL('../../docs/wording.md', import.meta.url))

// The set the review named, the astral variation selectors, and every format character (Cf),
// line / paragraph separator, non-spacing mark, and space other than the plain one.
const NAMED = [[0x00A0, 0x00A0], [0x00AD, 0x00AD], [0x034F, 0x034F], [0x115F, 0x1160], [0x17B4, 0x17B5], [0x180B, 0x180F],
  [0x2000, 0x200F], [0x2028, 0x2029], [0x202F, 0x202F], [0x205F, 0x206F], [0x2800, 0x2800], [0x3000, 0x3000], [0x3164, 0x3164],
  [0xFE00, 0xFE0F], [0xFEFF, 0xFEFF], [0xFFA0, 0xFFA0], [0xE0100, 0xE01EF]]
const hidden = ch => {
  const cp = ch.codePointAt(0)
  return NAMED.some(([a, b]) => cp >= a && cp <= b) || /[\p{Cf}\p{Zl}\p{Zp}\p{Mn}]/u.test(ch) || (cp !== 0x20 && /\p{Zs}/u.test(ch))
}

// The warning sign as an emoji is U+26A0 followed by the selector U+FE0F: nothing is tolerated; the pair is the control.
const WARNING_EMOJI = String.fromCodePoint(0x26A0, 0xFE0F)
const TOLERATED = {}

/** Raw hidden characters in `text`, as ['line:U+XXXX', ...]. */
function rawHidden(text, tolerated = []) {
  let rest = text
  for (const seq of tolerated) rest = rest.split(seq).join(' '.repeat(seq.length))
  const found = []
  let line = 1
  for (const ch of rest) {
    if (ch === '\n') { line++; continue }
    if (ch !== '\r' && ch !== '\t' && hidden(ch)) found.push(`${line}:U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
  }
  return found
}

function sources(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.(?:mjs|js|json|md)$/u.test(entry.name)) out.push(path)
  }
  return out
}

test('no raw invisible or blank-looking characters in wording/ or docs/wording.md', () => {
  const files = [...sources(WORDING), DOC]
  assert.ok(files.length >= 12, `only ${files.length} files found — is the walker broken?`)
  const found = []
  for (const path of files) {
    const name = relative(WORDING, path).replaceAll('\\', '/')
    const hits = rawHidden(readFileSync(path, 'utf8'), TOLERATED[name] ?? [])
    if (hits.length) found.push(`${name}: ${hits.join(', ')}`)
  }
  assert.deepEqual(found, [], 'write these as escapes (code) or as U+XXXX (prose)')
})

test('control: the hygiene check sees each kind of hidden character and passes plain text', () => {
  for (const cp of [0x200B, 0x200D, 0x2060, 0xFEFF, 0x00AD, 0x00A0, 0x3000, 0x3164, 0x2800, 0x2028, 0xFE0F, 0xE0100]) {
    const code = cp.toString(16).toUpperCase().padStart(4, '0')
    assert.deepEqual(rawHidden(`a${String.fromCodePoint(cp)}b`), [`1:U+${code}`], code)
  }
  assert.deepEqual(rawHidden('普通文字 plain text\n第二行\tTab\r\n'), [])
  assert.deepEqual(rawHidden(`x\n${WARNING_EMOJI}`), ['2:U+FE0F'], 'the emoji selector is tolerated only where listed')
  assert.deepEqual(rawHidden(`x\n${WARNING_EMOJI}`, [WARNING_EMOJI]), [])
})
