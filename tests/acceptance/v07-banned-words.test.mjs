// V7 · 界面禁词零命中：Bronze、Silver、Gold、judge、keeper、gate、Medallion、pending、ledger；品牌词 Claude、Anthropic、OpenAI、ChatGPT 只出现在「连接你电脑上的 …」、型号表和许可证页
// 怎么核：扫描器跑全部界面文件（中英两套）
//
// Every string of every interface table — the page's (desktop/src/renderer/texts, texts-en) and the main process's
// (desktop/src/main/texts, texts-en), plus index.html's <title> — goes through the wording package's scanner
// (wording/src scanStrings): 0 hits. Every one of them that names a brand is one of the sentences V7 allows. The page's code
// (screens, kit, lib, app.js) writes no Chinese string of its own and no banned word in its markup text, so the tables
// really are all the words. Reverse: the same scanner reports a sentence with Silver, one with pending, one with OpenAI and
// one with Claude outside the allowed sentence; the same literal check reports a Chinese string planted in a page file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { DESKTOP_DIR, WORDING_DIR, fileUrl } from './support/paths.mjs'
import { CJK, PLACEHOLDER, stringLiterals } from '../../desktop/test/support/literals.mjs'

const wording = await import(fileUrl(join(WORDING_DIR, 'src', 'index.mjs')))
const SRC = join(DESKTOP_DIR, 'src')
const TABLE_DIRS = ['renderer/texts', 'renderer/texts-en', 'main/texts', 'main/texts-en'].map(d => join(SRC, d))
const PAGE_CODE = ['renderer/screens', 'renderer/kit', 'renderer/lib', 'renderer/app.js'].map(d => join(SRC, d))
const BANNED = ['Bronze', 'Silver', 'Gold', 'judge', 'keeper', 'gate', 'Medallion', 'pending', 'ledger']
const BRAND = /Claude|Anthropic|OpenAI|ChatGPT/i
const ALLOWED_BRAND = [/^连接你电脑上的 (?:Claude Code|Codex)$/, /^Connect the (?:Claude Code|Codex) on this computer$/]

function files(p, exts) {
  if (!statSync(p).isDirectory()) return exts.includes(extname(p)) ? [p] : []
  return readdirSync(p).flatMap(name => files(join(p, name), exts))
}

function strings(value, path, out) {
  if (typeof value === 'string') out.push({ path, text: value })
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  return out
}

async function tableStrings() {
  const all = []
  for (const dir of TABLE_DIRS) {
    for (const file of files(dir, ['.js', '.mjs'])) {
      const mod = await import(fileUrl(file))
      for (const [name, value] of Object.entries(mod)) strings(value, `${relative(DESKTOP_DIR, file).replace(/\\/g, '/')}:${name}`, all)
    }
  }
  const title = /<title>([^<]*)<\/title>/.exec(readFileSync(join(SRC, 'renderer', 'index.html'), 'utf8'))?.[1]
  if (title) all.push({ path: 'src/renderer/index.html:title', text: title })
  return all
}

const scan = list => wording.scanStrings(Object.fromEntries(list.map(s => [s.path, s.text])))
const brandProblems = list => list.filter(s => BRAND.test(s.text) && !ALLOWED_BRAND.some(re => re.test(s.text))).map(s => `${s.path}: ${s.text}`)

// Chinese in a string literal of page code, and banned words in the text between tags of its html`` templates
function pageCodeProblems(sources) {
  const found = []
  for (const { rel, text } of sources) {
    for (const lit of stringLiterals(text)) {
      if (CJK.test(lit.text)) found.push(`${rel}:${lit.line} Chinese string ${JSON.stringify(lit.text)}`)
      for (const m of lit.text.matchAll(/>([^<>]+)</g)) {
        const words = m[1].split(PLACEHOLDER).join(' ').trim()
        if (words !== '' && !wording.scanStrings({ t: words }).ok) found.push(`${rel}:${lit.line} banned word in markup ${JSON.stringify(words)}`)
      }
    }
  }
  return found
}

test('V7: every interface string (中英两套, page and main process) passes the scanner with 0 hits', async () => {
  const all = await tableStrings()
  const perDir = TABLE_DIRS.map(d => all.filter(s => s.path.startsWith(relative(DESKTOP_DIR, d).replace(/\\/g, '/'))).length)
  assert.ok(perDir.every(n => n > 0), `strings per table folder: ${perDir.join(' / ')}`)
  assert.ok(all.length > 1000, `${all.length} strings scanned`)
  const r = scan(all)
  assert.deepEqual(r.hits.map(h => `${h.field}: ${h.text} (${h.rule})`), [])
  assert.equal(r.ok, true)
  // the nine words themselves, case-insensitive, as whole words: none in any table
  const raw = all.filter(s => BANNED.some(w => new RegExp(`(?<![A-Za-z])${w}(?![A-Za-z])`, 'i').test(s.text)))
  assert.deepEqual(raw.map(s => `${s.path}: ${s.text}`), [])
})

test('V7: a brand word appears only in the sentences V7 allows (「连接你电脑上的 …」); the model table comes from the core, not the tables', async () => {
  const all = await tableStrings()
  const branded = all.filter(s => BRAND.test(s.text))
  assert.ok(branded.length >= 2, 'control: the two connect sentences are found')
  assert.deepEqual(brandProblems(all), [])
})

test('V7: the page code writes no Chinese string and no banned word of its own (the tables are all the words)', () => {
  const sources = PAGE_CODE.flatMap(p => files(p, ['.js', '.mjs'])).map(f => ({ rel: relative(DESKTOP_DIR, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))
  assert.ok(sources.length > 30, `${sources.length} page files`)
  assert.ok(sources.some(s => s.rel.startsWith('src/renderer/screens/')) && sources.some(s => s.rel.startsWith('src/renderer/kit/')) && sources.some(s => s.rel.startsWith('src/renderer/lib/')))
  assert.deepEqual(pageCodeProblems(sources), [])
})

test('V7 reverse: the same scanner and checks report Silver, pending, OpenAI, a stray Claude, and a Chinese string in page code', () => {
  for (const [text, group] of [['这一条是 Silver 级', 'tier-names'], ['还在 pending 里', null], ['用 OpenAI 打分', 'brand-names'], ['Claude Code 打分完成', 'brand-names'], ['Gate 1 passed', null]]) {
    const r = wording.scanStrings({ probe: text })
    assert.equal(r.ok, false, `${text} is reported`)
    if (group) assert.ok(r.hits.some(h => h.group === group), `${text}: ${JSON.stringify(r.hits.map(h => h.rule))}`)
  }
  assert.equal(wording.scanStrings({ probe: '连接你电脑上的 Claude Code' }).ok, true, 'the allowed sentence passes')
  assert.deepEqual(brandProblems([{ path: 'x', text: '用 OpenAI 打分' }]), ['x: 用 OpenAI 打分'])
  const planted = [
    { rel: 'src/renderer/screens/planted.js', text: "export const a = () => html`<div class=\"x\">${n} 条待看</div>`\n" },
    { rel: 'src/renderer/kit/planted.js', text: "export const b = () => html`<span>Silver</span>`\n" },
  ]
  const problems = pageCodeProblems(planted)
  assert.equal(problems.length, 2, problems.join('\n'))
})
