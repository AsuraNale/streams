// Redesign R6a (docs/checks/2026-11-13-r6a/contract.md), the parts that need no window:
//   R6a-2  tests/acceptance/standards.mjs — the standards of V6, V8, V9 and V10 are, to the character, the four sentences the maintainer saw
//          on 11-11 (docs/design/redesign/施工计划.md 「维护者 过目的」 第 1 条); every other standard, V3's included, every `how`,
//          every file name and the rest of the file are what they were in git before R6a (commit 26e26a1), apart from one line
//          of the head comment.
//   R6a-1  Noto Serif SC — the two files under src/renderer/fonts/ are the bytes of the record (docs/design/fonts/noto-serif-sc/:
//          release tag, address, size, sha256), a TrueType font whose own name table says Noto Serif SC 2.003; styles/base.css
//          declares the face under the name the template's round9/research.css asks for, at the file app:// serves as font/ttf;
//          index.html (its CSP) is what it was; the license page's data has its row and the OFL in full.
// Each test stands on its own (no state of another test) and first shows the input that makes it fail; the mutants are
// scripts/mutation-check.mjs r6a-*. (The real window: test/ui-r6a.test.mjs.)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from '../scripts/lib/paths.mjs'
import { DISPLAY_FONT, FONT, fontVersion, licensesView } from '../src/main/licenses.mjs'
import { FILE_ALIASES, createAppProtocolHandler, vendorFiles } from '../src/main/protocol.mjs'

// the commit R6a starts from (the contract's own commit): what the files were before this package
const BEFORE = '26e26a1'
// a mirror (scripts/mutation-check.mjs) is not a git repository: it says which one it mirrors
const GIT_REPO = process.env.STREAMS_MIRROR_OF || REPO_DIR
const sha = b => createHash('sha256').update(b).digest('hex')

function before(path) {
  const r = spawnSync('git', ['-C', GIT_REPO, 'show', `${BEFORE}:${path}`], { encoding: 'buffer', maxBuffer: 64 << 20 })
  assert.equal(r.status, 0, `git show ${BEFORE}:${path} in ${GIT_REPO}: ${String(r.stderr).trim()}`)
  return r.stdout
}

/** STANDARDS of a standards.mjs text (the file has no imports: it is read as a module from a data: URL). */
async function standardsOf(text) {
  const m = await import(`data:text/javascript;base64,${Buffer.from(text, 'utf8').toString('base64')}`)
  return m.STANDARDS
}

/** The four sentences as 施工计划.md has them under 「维护者 过目的（2026-11-11…）」 第 1 条: { V6, V8, V9, V10 }. */
function plannedSentences() {
  const plan = readFileSync(join(REPO_DIR, 'docs', 'design', 'redesign', '施工计划.md'), 'utf8')
  const start = plan.indexOf('## 维护者 过目的（2026-11-11')
  assert.ok(start >= 0, 'the plan has the section')
  const section = plan.slice(start, plan.indexOf('\n## ', start + 4))
  const first = section.slice(section.indexOf('1. **验收标准改字**'), section.indexOf('\n2. **'))
  return Object.fromEntries([...first.matchAll(/^ {3}- (V\d+)：(.+)$/gm)].map(m => [m[1], m[2]]))
}

const NEW = Object.freeze({
  V6: '登录过期时，本次运行不开始，库页顶上的横幅说明，已抓取的条目完整保留',
  V8: '一个故意写坏的 .md 被列为「缺少文件头」的文件，不进索引、图谱、问库，且文件内容未被改动',
  V9: '问库答案的每个引用编号都在候选集内；库里没有的问题得到「库内暂无相关内容。」',
  V10: '单次运行上限生效：上限设 5，第 6 条不调模型，剩余条目下次运行接着处理',
})

// 1.1.1 P11a: V7's sentence after 11-24 (the search service's exception; 维护者 11-24 晚「按照你的推荐」, the 1.1 standard's E4)
const LATER = Object.freeze({ V7: '界面禁词零命中：Bronze、Silver、Gold、judge、keeper、gate、Medallion、pending、ledger；品牌词 Claude、Anthropic、OpenAI、ChatGPT 只出现在「连接你电脑上的 …」、型号表和许可证页；1.1.1 起设置页的搜索服务一处也可以出现服务商的名字（比照型号表；维护者 11-24 晚「按照你的推荐」，即 1.1 标准 E4 的例外）' })

test('R6a-2 standards.mjs: V6 / V8 / V9 / V10 are the four sentences the maintainer saw, to the character; V3 and everything else is what git had before R6a (V7: 1.1.1\'s exception)', async () => {
  const nowText = readFileSync(join(REPO_DIR, 'tests', 'acceptance', 'standards.mjs'), 'utf8')
  const wasText = before('tests/acceptance/standards.mjs').toString('utf8')
  assert.equal(sha(Buffer.from(wasText, 'utf8')), 'ac493067e28dbae3ad70559ddce4e826018173226661b78d00371fcee52bf8d1', 'control: the text from git is the file before R6a')
  const now = await standardsOf(nowText)
  const was = await standardsOf(wasText)
  // the sentences here are the plan's own lines (the V3 line of the plan says its standard does not change: no sentence there)
  const planned = plannedSentences()
  assert.deepEqual({ V6: planned.V6, V8: planned.V8, V9: planned.V9, V10: planned.V10 }, { ...NEW }, 'control: the sentences compared are the plan\'s, word for word')
  assert.deepEqual(Object.keys(planned), ['V6', 'V8', 'V9', 'V10'], 'control: the plan gives a new sentence for these four only (its V3 line says 原文不变)')
  assert.deepEqual(now.map(s => s.id), ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12'])
  assert.deepEqual(was.map(s => s.id), now.map(s => s.id))
  for (const [i, s] of now.entries()) {
    const old = was[i]
    assert.deepEqual(Object.keys(s), ['id', 'file', 'standard', 'how'], s.id)
    assert.equal(s.file, old.file, `${s.id}: the test file`)
    assert.equal(s.how, old.how, `${s.id}: how it is checked is not changed`)
    if (Object.hasOwn(NEW, s.id)) {
      assert.equal(s.standard, NEW[s.id], `${s.id}: the sentence the maintainer saw`)
      assert.notEqual(old.standard, NEW[s.id], `control: ${s.id} was another sentence before`)
    } else if (Object.hasOwn(LATER, s.id)) {
      // 1.1.1: V7 got the search service's exception 维护者 agreed to on 11-24 (「按照你的推荐」; the 1.1 standard's E4 too)
      assert.equal(s.standard, LATER[s.id], `${s.id}: the sentence of 1.1.1`)
      assert.ok(LATER[s.id].startsWith(old.standard.replace(/'/g, '')), `${s.id}: the old sentence and an exception added at its end`)
    } else {
      assert.equal(s.standard, old.standard, `${s.id}: not one of the four, unchanged`)
    }
  }
  assert.equal(now.find(s => s.id === 'V3').standard, '五种抓取状态各能触发，且界面文案和「怎么办」对应正确', 'V3, as it was')
  // the file itself: the same lines as before, but the four standards and one comment line added in the head
  const a = wasText.split('\n')
  const b = nowText.split('\n')
  assert.equal(nowText.includes('\r'), false, 'LF line ends')
  const added = b.filter(l => !a.includes(l))
  const removed = a.filter(l => !b.includes(l))
  assert.deepEqual(added, [
    '// V6 / V8 / V9 / V10 维护者 11-11 改字。',
    ...['V6', 'V7', 'V8', 'V9', 'V10'].map(id => `    standard: '${NEW[id] ?? LATER[id]}',`),
  ], 'the lines that are new')
  assert.deepEqual(removed, ['V6', 'V7', 'V8', 'V9', 'V10'].map(id => `    standard: '${was.find(s => s.id === id).standard}',`), 'the lines that are gone')
  assert.equal(b.length, a.length + 1, 'one line more: the comment')
  assert.equal(b[1], '// V6 / V8 / V9 / V10 维护者 11-11 改字。', 'the comment is the second line of the head')
  // controls of the comparison itself: one character off is told apart
  assert.notEqual(NEW.V9, NEW.V9.replace('。」', '」'))
  assert.notEqual(NEW.V10.replace('下次运行接着处理', '下一轮接着跑'), NEW.V10)
})

const RECORD_DIR = join(REPO_DIR, 'docs', 'design', 'fonts', 'noto-serif-sc')
const FONT_FILE = join(DESKTOP_DIR, ...DISPLAY_FONT.file)
const OFL_FILE = join(DESKTOP_DIR, ...DISPLAY_FONT.licenseFile)

test('R6a-1 the font\'s files are the record\'s bytes: release Serif2.003 of notofonts/noto-cjk, size, sha256, a TrueType file that names itself Noto Serif SC 2.003', async () => {
  const record = JSON.parse(readFileSync(join(RECORD_DIR, 'source.json'), 'utf8'))
  assert.equal(record.repository, 'https://github.com/notofonts/noto-cjk')
  assert.equal(record.release.tag, 'Serif2.003')
  assert.equal(record.asset.url, 'https://github.com/notofonts/noto-cjk/releases/download/Serif2.003/03_NotoSerifCJK-TTF-VF.zip', 'an asset of the official repository\'s release')
  assert.match(record.fetched, /^2026-11-13T\d\d:\d\d:\d\dZ$/)
  assert.deepEqual(record.files.map(f => f.path), ['desktop/src/renderer/fonts/NotoSerifSC-VF.ttf', 'desktop/src/renderer/fonts/OFL-NotoSerifSC.txt'])
  const list = readFileSync(join(RECORD_DIR, 'source-sha256.txt'), 'utf8')
  const font = readFileSync(FONT_FILE)
  const ofl = readFileSync(OFL_FILE)
  assert.equal(font.length, 25_125_232, 'the size')
  assert.equal(record.files[0].bytes, font.length)
  assert.equal(sha(font), '5326cfb097e3ab26fcb39329752b5c0a439bf8d5c4649520e4b492939c352a09')
  assert.equal(sha(font), record.files[0].sha256, 'the font is the record\'s')
  assert.equal(sha(ofl), record.files[1].sha256, 'the license text is the record\'s')
  assert.equal(list, `${record.files.map(f => `${f.sha256}  ${f.path}`).join('\n')}\n`, 'the list and the record say the same')
  assert.equal(font.subarray(0, 4).toString('hex'), '00010000', 'a TrueType font file')
  assert.equal(fontVersion(font), '2.003', 'its own name table\'s version')
  // the record's own check (the same one `node docs/design/fonts/noto-serif-sc/check-source.mjs` runs), and its controls
  const check = await import(pathToFileURL(join(RECORD_DIR, 'check-source.mjs')).href)
  assert.deepEqual(check.localProblems(REPO_DIR), [])
  assert.equal(check.fontName(font, 1), 'Noto Serif SC', 'the family the file names itself')
  const other = readFileSync(join(DESKTOP_DIR, ...FONT.file))
  assert.equal(check.fontName(other, 1) === 'Noto Serif SC', false, 'control: the interface font is another family')
  const wrong = check.fileProblems(record.files[0], other, 'x')
  assert.ok(wrong.some(p => p.includes('sha256')) && wrong.some(p => p.includes('bytes')) && wrong.some(p => p.includes('family')), `control: another font is told apart: ${wrong.join(' | ')}`)
  assert.ok(check.fileProblems(record.files[0], Buffer.concat([font.subarray(0, font.length - 1), Buffer.from([font.at(-1) ^ 1])]), 'x').some(p => p.includes('sha256')), 'control: one bit off is told apart')
  // the license text: the OFL 1.1 as it came (no line ends changed), not the interface font's file
  const text = ofl.toString('utf8')
  assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1 - 26 February 2007/)
  assert.match(text, /PERMISSION & CONDITIONS/)
  assert.equal(ofl.length, 4301)
  assert.notEqual(sha(ofl), sha(readFileSync(join(DESKTOP_DIR, ...FONT.licenseFile))), 'its own text, as the release carries it')
})

test('R6a-1 styles/base.css declares the face the template asks for, at the file app:// serves as font/ttf; index.html (the CSP) is unchanged', async () => {
  const research = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'template', 'shared', 'round9', 'research.css'), 'utf8')
  const asked = /--display-chinese:\s*'([^']+)'/.exec(research)?.[1]
  assert.equal(asked, 'Noto Serif SC', 'control: the family the template\'s research theme names first')
  assert.equal(/@font-face/.test(research), false, 'control: the template declares no face for it')
  const base = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const faces = [...base.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => ({
    family: /font-family:\s*'([^']+)'/.exec(m[1])?.[1] ?? null,
    url: /src:\s*url\('([^']+)'\)\s*format\('truetype'\)/.exec(m[1])?.[1] ?? null,
    weight: /font-weight:\s*([^;]+);/.exec(m[1])?.[1].trim() ?? null,
  }))
  assert.deepEqual(faces, [{ family: asked, url: '../fonts/NotoSerifSC-VF.ttf', weight: '200 900' }], 'one face, under the template\'s name, the file beside it, the font\'s own weights')
  // base.css is styles/base.css: ../fonts/… is app://ui/fonts/…, which the handler answers with the file's bytes as font/ttf
  const h = createAppProtocolHandler({ rendererDir: join(DESKTOP_DIR, 'src', 'renderer'), sharedDir: join(DESKTOP_DIR, 'src', 'shared'), vendor: vendorFiles(), csp: "default-src 'none'" })
  const got = await h(new Request(new URL(faces[0].url, 'app://ui/styles/base.css').href))
  assert.equal(got.status, 200)
  assert.equal(got.headers.get('content-type'), 'font/ttf')
  assert.ok(Buffer.from(await got.arrayBuffer()).equals(readFileSync(FONT_FILE)), 'byte for byte the font file')
  assert.equal((await h(new Request('app://ui/fonts/OFL-NotoSerifSC.txt'))).status, 404, 'control: the license text is not a file the page loads')
  assert.equal((await h(new Request('app://ui/fonts/NotoSerifSC-VF-moved.ttf'))).status, 404, 'control: a name that is not there is not answered')
  assert.deepEqual(Object.keys(FILE_ALIASES), ['template/shared/fonts/NotoSansSC-VF.ttf'], 'no alias was needed: the face is the app\'s own')
  // the CSP: index.html is the file git had before R6a (font-src 'self' covers app://ui/fonts/)
  const index = readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'index.html'))
  assert.ok(index.equals(before('desktop/src/renderer/index.html')), 'index.html is byte for byte what it was')
  assert.match(index.toString('utf8'), /font-src 'self';/)
})

test('R6a-1 the license page\'s data: a row 「Noto Serif SC · 2.003 · OFL-1.1」 (the version from the font file) and the OFL that came with it, in full', () => {
  const v = licensesView({ packaged: false, desktopDir: DESKTOP_DIR, installDir: join(DESKTOP_DIR, 'node_modules'), versions: { electron: '44.0.0', chrome: '1', node: '24' } })
  assert.deepEqual(v.components.at(-1), { name: 'Noto Serif SC', version: '2.003', license: 'OFL-1.1' })
  assert.equal(v.components.at(-1).version, fontVersion(readFileSync(FONT_FILE)), 'read from the file that ships')
  assert.deepEqual(v.components.at(-2), { name: 'Noto Sans SC', version: '2.04', license: 'OFL-1.1' }, 'the interface font keeps its row')
  assert.deepEqual([v.displayFont.name, v.displayFont.license], ['Noto Serif SC', 'OFL-1.1'])
  assert.equal(v.displayFont.text, readFileSync(OFL_FILE, 'utf8'), 'the text shipped beside the font, whole')
  assert.match(v.displayFont.text, /SIL OPEN FONT LICENSE Version 1\.1/)
  assert.notEqual(v.displayFont.text, v.font.text, 'control: not the interface font\'s text shown twice')
  assert.ok(existsSync(FONT_FILE) && statSync(FONT_FILE).size > 20_000_000)
})
