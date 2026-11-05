// V1 · 在本机（Windows 11 家庭版，不另装虚拟机）直接装安装包，从安装包到用例 A 第 6 步（文件出现在 notes/）全程不敲命令，真连接一并测；发布说明写明 v1.0 未在干净机器上验过
// 怎么核：验收者亲自装、亲自点，录屏；本机装着流息时安装测试会拒跑，重跑先卸载（人工项；本文件只核安装包与用例 A 的前置：安装包存在、哈希与「未在干净机器上验过」写进发布说明）
//
// The install on a clean machine and the recording are done by hand. What this file checks is what that needs first:
//   1. the installer exists where installer/build-installer.mjs puts it: installer/dist/<output_base_filename>.exe, the
//      name from installer/setup/release.json (installer/build/ is looked at too);
//   2. installer/dist/build-record.json, when there, records the same sha256 as the file has;
//   3. release notes for that version — a file named release-notes* or 发布说明* in installer/dist, installer/setup,
//      installer/build or docs/ — carry the installer's sha256, and it is the one computed from the file, and say
//      「未在干净机器上验过」 (维护者 11-04: v1.0 is checked by installing it on this machine, not on a clean one).
// The same check runs on a scratch folder laid out the same way: right hash and the sentence → nothing wrong; wrong hash,
// no notes or no sentence → red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_DIR, caseDir } from './support/paths.mjs'

const NOTE_DIRS = ['installer/dist', 'installer/setup', 'installer/build', 'docs']
const NOTE_NAME = /^(?:release[-_ ]?notes|发布说明)/i
const NOT_CLEAN = '未在干净机器上验过'
const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex')

/** What is missing before V1 can be done by hand on a clean machine ([] = ready). */
function installerProblems(root) {
  const problems = []
  const release = JSON.parse(readFileSync(join(root, 'installer', 'setup', 'release.json'), 'utf8'))
  const name = `${release.output_base_filename}.exe`
  const places = ['installer/dist', 'installer/build'].map(d => join(root, d, name))
  const exe = places.find(p => existsSync(p) && statSync(p).isFile())
  if (!exe) {
    const others = ['installer/dist', 'installer/build'].flatMap(d => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter(f => f.toLowerCase().endsWith('.exe')).map(f => `${d}/${f}`) : []))
    problems.push(`安装包还没构建：installer/dist/${name} 不存在（installer/build 下也没有${others.length ? `；只有 ${others.join(', ')}` : ' .exe'}）。安装包由 node installer/build-installer.mjs 生成，排在 11-05。`)
  }
  const hash = exe ? sha256(exe) : null
  const record = join(root, 'installer', 'dist', 'build-record.json')
  if (hash && existsSync(record)) {
    const recorded = JSON.parse(readFileSync(record, 'utf8')).installer?.sha256
    if (recorded !== hash) problems.push(`installer/dist/build-record.json 记的 sha256 是 ${recorded}，文件算出来是 ${hash}`)
  }
  const notes = NOTE_DIRS.flatMap(d => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter(f => NOTE_NAME.test(f)).map(f => join(root, d, f)) : []))
    .filter(p => statSync(p).isFile())
  if (notes.length === 0) {
    problems.push(`没有发布说明：${NOTE_DIRS.join('、')} 下没有 release-notes* / 发布说明* 文件，安装包的 sha256 还没写进发布说明。`)
  } else if (hash) {
    const texts = notes.map(p => readFileSync(p, 'utf8'))
    const written = [...new Set(texts.flatMap(t => t.match(/\b[0-9a-f]{64}\b/gi) ?? []).map(h => h.toLowerCase()))]
    if (!written.includes(hash)) problems.push(`发布说明里没有这个安装包的 sha256 ${hash}${written.length ? `（写的是 ${written.join(', ')}）` : ''}`)
    if (!texts.some(t => t.includes(release.version))) problems.push(`发布说明里没有版本号 ${release.version}`)
    if (!texts.some(t => t.includes(NOT_CLEAN))) problems.push(`发布说明里没有写「${NOT_CLEAN}」（V1，维护者 11-04 改字）`)
  }
  return problems
}

test('V1 prerequisites: the installer exists, its sha256 is in the release notes, and the notes say it was not verified on a clean machine', () => {
  const problems = installerProblems(REPO_DIR)
  assert.deepEqual(problems, [], problems.join('\n'))
})

test('V1 reverse: the same check on a scratch layout — right hash passes, a wrong hash or no notes is red', () => {
  const root = caseDir('v01-layout')
  for (const d of ['installer/setup', 'installer/dist', 'docs']) mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, 'installer', 'setup', 'release.json'), readFileSync(join(REPO_DIR, 'installer', 'setup', 'release.json')))
  const release = JSON.parse(readFileSync(join(root, 'installer', 'setup', 'release.json'), 'utf8'))
  assert.ok(installerProblems(root).some(p => p.startsWith('安装包还没构建')), 'no installer → red')
  const exe = join(root, 'installer', 'dist', `${release.output_base_filename}.exe`)
  writeFileSync(exe, 'MZ stand-in installer bytes')
  const hash = sha256(exe)
  assert.ok(installerProblems(root).some(p => p.startsWith('没有发布说明')), 'no notes → red')
  const notes = join(root, 'installer', 'dist', 'release-notes.md')
  writeFileSync(notes, `# 流息 ${release.version}\n\n安装包 sha256：${'0'.repeat(64)}\n`)
  assert.ok(installerProblems(root).some(p => p.includes('发布说明里没有这个安装包的 sha256')), 'wrong hash → red')
  writeFileSync(notes, `# 流息 ${release.version}\n\n安装包 sha256：${hash}\n`)
  assert.ok(installerProblems(root).some(p => p.includes(NOT_CLEAN)), 'right hash but no not-clean sentence → red')
  writeFileSync(notes, `# 流息 ${release.version}\n\n安装包 sha256：${hash}\n\nv1.0 ${NOT_CLEAN}。\n`)
  assert.deepEqual(installerProblems(root), [], 'right hash and the sentence → ready')
  writeFileSync(join(root, 'installer', 'dist', 'build-record.json'), JSON.stringify({ installer: { sha256: 'f'.repeat(64) } }))
  assert.ok(installerProblems(root).some(p => p.includes('build-record.json')), 'a build record that disagrees → red')
})
