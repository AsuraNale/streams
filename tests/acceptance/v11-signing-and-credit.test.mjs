// V11 · 安装包签名状态如实写在下载页（第一版未签名会有 SmartScreen 提示）；README 和关于页写「由 Starry Digital 开发」
// 怎么核：看下载页、关于页
//
// The download page of the first version is the README's 「下载与安装」 section (the public repository is made later):
// it says the installer is not signed, what SmartScreen shows and the two clicks past it (「Windows 已保护你的电脑」→
// 「更多信息」→「仍要运行」), and where the sha256 is (the release notes); it never says the installer is signed. The README
// says 「由 Starry Digital 开发」 / "Developed by Starry Digital" with the link to https://starrydigital.ca. The about page
// (设置 → 关于, desktop/src/renderer/screens/settings.js) shows the table's madeBy line — 「由 Starry Digital 开发」 in Chinese,
// "Developed by Starry Digital" in English — and links https://starrydigital.ca (维护者 11-02: 「README / 关于页写「由 Starry
// Digital 开发」链 starrydigital.ca」). Reverse: the same README check on a copy without the unsigned sentence, or without
// the credit, is red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { DESKTOP_DIR, REPO_DIR } from './support/paths.mjs'
import { stripComments } from './support/source-scan.mjs'
import { SETTINGS as ZH } from '../../desktop/src/renderer/texts/settings.js'
import { SETTINGS as EN } from '../../desktop/src/renderer/texts-en/settings.js'

const SITE = 'https://starrydigital.ca'
const README = readFileSync(join(REPO_DIR, 'README.md'), 'utf8')
// markdown links keep their words: [Starry Digital](https://…) → Starry Digital
const plain = md => md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '')

function section(md, heading) {
  const lines = md.split('\n')
  const start = lines.findIndex(l => new RegExp(`^##\\s*${heading}\\s*$`).test(l))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n')
}

/** What the README is missing for V11 ([] = right). */
function readmeProblems(md) {
  const problems = []
  const text = plain(md)
  if (!text.includes('由 Starry Digital 开发')) problems.push('README does not say 「由 Starry Digital 开发」')
  if (!text.includes('Developed by Starry Digital')) problems.push('README does not say "Developed by Starry Digital"')
  if (!new RegExp(`\\[Starry Digital\\]\\(${SITE.replace(/\./g, '\\.')}/?\\)`).test(md)) problems.push(`README does not link Starry Digital to ${SITE}`)
  const dl = section(md, '下载与安装')
  if (dl === null) return [...problems, 'README has no 「下载与安装」 section']
  const t = plain(dl)
  for (const must of ['未签名', 'SmartScreen', 'Windows 已保护你的电脑', '更多信息', '仍要运行', 'sha256', '发布说明', 'AsuraNale/streams', 'Releases']) {
    if (!t.includes(must)) problems.push(`「下载与安装」 does not say 「${must}」`)
  }
  if (!/not code-signed|not signed/i.test(t)) problems.push('the English lines do not say the installer is not signed')
  if (/已签名|已经签名|签过名|\bis signed\b|\bsigned installer\b/i.test(t.replace(/未签名|not code-signed|not signed/gi, ''))) problems.push('「下载与安装」 claims a signature')
  const order = ['Windows 已保护你的电脑', '更多信息', '仍要运行'].map(w => t.indexOf(w))
  if (order.every(i => i >= 0) && !(order[0] < order[1] && order[1] < order[2])) problems.push('the SmartScreen steps are not in the order the dialog shows them')
  return problems
}

function codeFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? codeFiles(p) : ['.js', '.mjs', '.cjs', '.html'].includes(extname(name)) ? [p] : []
  })
}

test('V11 download page (README 「下载与安装」): unsigned, SmartScreen and its two clicks, sha256 in the release notes; the credit and its link', () => {
  assert.deepEqual(readmeProblems(README), [])
})

test('V11 reverse: the same check on a README without the unsigned sentence, or without the credit, is red', () => {
  const unsignedLine = README.split('\n').find(l => l.includes('未签名'))
  assert.ok(unsignedLine, 'control: the README has the line')
  const noUnsigned = README.split('\n').filter(l => l !== unsignedLine).join('\n')
  assert.ok(readmeProblems(noUnsigned).some(p => p.includes('未签名')), readmeProblems(noUnsigned).join('\n'))
  const signedClaim = README.replace(unsignedLine, '- 安装包已签名，Windows 不会弹提示。')
  assert.ok(readmeProblems(signedClaim).length >= 1)
  const noCredit = README.split('\n').filter(l => !l.includes('Starry Digital')).join('\n')
  assert.ok(readmeProblems(noCredit).some(p => p.includes('由 Starry Digital 开发')))
  assert.ok(readmeProblems('# x\n').includes('README has no 「下载与安装」 section'))
})

test('V11 about page: 设置 → 关于 shows 「由 Starry Digital 开发」 / "Developed by Starry Digital"', () => {
  assert.equal(ZH.madeBy, '由 Starry Digital 开发')
  assert.equal(EN.madeBy, 'Developed by Starry Digital')
  const src = stripComments(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'screens', 'settings.js'), 'utf8'))
  const about = src.indexOf('id="about"')
  assert.ok(about >= 0, 'the settings page has the 关于 part')
  const end = src.indexOf('<//>', about)
  assert.ok(src.slice(about, end).includes('T.madeBy'), 'the 关于 part renders the madeBy line')
})

test('V11 about page: links https://starrydigital.ca', () => {
  const files = codeFiles(join(DESKTOP_DIR, 'src'))
  assert.ok(files.length > 50, `${files.length} files under desktop/src`)
  const has = text => stripComments(text).includes(SITE)
  assert.equal(has(`const a = '${SITE}'`), true, 'control: the check sees the address where it is')
  assert.equal(has(`// ${SITE}`), false, 'control: an address in a comment is not a link')
  const where = files.filter(f => has(readFileSync(f, 'utf8'))).map(f => relative(DESKTOP_DIR, f).replace(/\\/g, '/'))
  assert.ok(where.length > 0, `the about page does not link ${SITE}: no file under desktop/src has the address (the 关于 part shows T.madeBy as plain text)`)
})
