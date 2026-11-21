// Redesign R6b-1 / R6b-2 (docs/checks/2026-11-13-r6b/contract.md): the words of the interface after 05-措辞规范's last pass.
//   1. the five fetch states and the four 处理建议 are the contract's two tables, word for word, in the page's two dictionaries
//      and in the words the core gives the main agent; the sentences that spell the states out use the same words;
//   2. none of the v1 state words or of the v1 处理建议's fragments is left in any dictionary value or in the core's words;
//   3. the colloquial sentences 05 replaces (the ones the contract names, and the others its rules 2 / 4 / 5 / 6 found) are gone
//      from both dictionaries; the notification's sentence is 05 第 173 行's;
//   4. the placeholder screen (dead since v2), its style file, its two text tables and the one interim name only it used are
//      gone, and nothing names them.
// The old words are written here as patterns with one character in brackets (没新[内]容), and their samples in two pieces, so
// that this file does not itself contain them: the repository is searched for them (contract R6b-1, last point).
// No window: plain imports of the tables. The dev-only gallery (texts/kit.js, not shipped) is not read, as in texts-en.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ADVICE_WORDS, STATE_WORDS } from '../../core/src/agent/words.mjs'
import { FETCH_HINTS, FETCH_STATES, SOURCE_STATES } from '../src/renderer/texts/common.js'
import { FETCH_HINTS as FETCH_HINTS_EN, FETCH_STATES as FETCH_STATES_EN, SOURCE_STATES as SOURCE_STATES_EN } from '../src/renderer/texts-en/common.js'
import { PIPELINE } from '../src/renderer/texts/pipeline.js'
import { PIPELINE as PIPELINE_EN } from '../src/renderer/texts-en/pipeline.js'
import { PROPOSALS } from '../src/renderer/texts/proposals.js'
import { PROPOSALS as PROPOSALS_EN } from '../src/renderer/texts-en/proposals.js'
import { NOTIFY } from '../src/main/texts/notify.js'
import { NOTIFY as NOTIFY_EN } from '../src/main/texts-en/notify.js'

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(DESKTOP, 'src')
const TABLES = [
  { lang: 'zh', dir: join(SRC, 'renderer', 'texts'), skip: ['kit.js'] },
  { lang: 'en', dir: join(SRC, 'renderer', 'texts-en'), skip: [] },
  { lang: 'zh', dir: join(SRC, 'main', 'texts'), skip: [] },
  { lang: 'en', dir: join(SRC, 'main', 'texts-en'), skip: [] },
]

// ---- the contract's two tables (R6b-1) -------------------------------------------------------------------------------------
const STATES = {
  // 1.1 W2: acceptance B8 adds the sixth state, 要登录 (1.1 验收标准 V3 → B8: 「多一种『要登录』」)
  zh: { ok: '正常', empty: '无更新', gap: '地址无效', failed: '暂时失败', blocked: '访问被拒', login: '要登录' },
  en: { ok: 'OK', empty: 'No updates', gap: 'Invalid address', failed: 'Temporary failure', blocked: 'Access denied', login: 'Sign-in required' },
}
const HINTS = {
  zh: {
    none: '无需处理。',
    'fix-address-or-remove': '该地址无效，重试无法解决。请修改地址，或移除该来源。',
    'retry-next-round': '下次运行时将自动重试，无需修改地址。',
    'blocked-remove-source': '该网站拒绝程序访问，重试无法解决。请改用其他来源。',
    'login-not-supported': '该网站需要登录才能读取，流息这一版还读不了要登录的网站。请改用其他来源。',
  },
  en: {
    none: 'No action needed.',
    'fix-address-or-remove': 'This address is not valid, so retrying will not help. Change the address or remove this source.',
    'retry-next-round': 'Streams tries again on the next run. There is no need to change the address.',
    'blocked-remove-source': 'This site does not allow programs to read it, so retrying will not help. Use a different source.',
    'login-not-supported': 'This site needs you to sign in before it can be read, and this version of Streams cannot read such sites. Use a different source.',
  },
}
const FIVE = ['ok', 'empty', 'gap', 'failed', 'blocked', 'login'] // (the name stays; 1.1 W2 added the sixth)

/** What differs from the contract's tables in one set of words ({ states, hints } of one language). */
function tableProblems({ states, hints }, lang, where) {
  const problems = []
  for (const k of FIVE) if (states[k] !== STATES[lang][k]) problems.push(`${where} ${lang}: ${k} is 「${states[k]}」, the contract says 「${STATES[lang][k]}」`)
  for (const k of Object.keys(HINTS[lang])) if (hints[k] !== HINTS[lang][k]) problems.push(`${where} ${lang}: the 处理建议 ${k} is 「${hints[k]}」, the contract says 「${HINTS[lang][k]}」`)
  if (Object.keys(hints).sort().join() !== Object.keys(HINTS[lang]).sort().join()) problems.push(`${where} ${lang}: the 处理建议 keys are ${Object.keys(hints).join()}`)
  return problems
}

test('R6b-1 the five states and the four 处理建议 are the contract\'s tables word for word: the page\'s two dictionaries and the core\'s words', () => {
  assert.deepEqual(tableProblems({ states: FETCH_STATES, hints: FETCH_HINTS }, 'zh', 'page'), [])
  assert.deepEqual(tableProblems({ states: FETCH_STATES_EN, hints: FETCH_HINTS_EN }, 'en', 'page'), [])
  assert.deepEqual(tableProblems({ states: STATE_WORDS.zh, hints: ADVICE_WORDS.zh }, 'zh', 'core'), [])
  assert.deepEqual(tableProblems({ states: STATE_WORDS.en, hints: ADVICE_WORDS.en }, 'en', 'core'), [])
  assert.deepEqual(Object.keys(FETCH_STATES), FIVE, 'the six keys: the five as they were, and 要登录 of 1.1')
  // 尚未抓取 (05 规则 4), the same in the core
  assert.deepEqual([SOURCE_STATES.never, SOURCE_STATES_EN.never, STATE_WORDS.zh.never, STATE_WORDS.en.never], ['尚未抓取', 'Not fetched yet', '尚未抓取', 'Not fetched yet'])
  // the sentences that spell the states out use the same words
  assert.ok(PIPELINE.about.fetch.includes(FIVE.map(k => STATES.zh[k]).join(' / ')), PIPELINE.about.fetch)
  assert.ok(PIPELINE_EN.about.fetch.includes(FIVE.map(k => STATES.en[k]).join(' / ')), PIPELINE_EN.about.fetch)
  assert.ok(PROPOSALS.kinds['source-failing-gap'].includes(STATES.zh.gap) && PROPOSALS.evidence['source-failing-gap'].includes(STATES.zh.gap))
  assert.ok(PROPOSALS.evidence['source-failing'].includes(STATES.zh.failed) && PROPOSALS.evidence['source-failing'].includes(STATES.zh.blocked))
  assert.ok(PROPOSALS_EN.kinds['source-failing-gap'].includes(STATES.en.gap) && PROPOSALS_EN.evidence['source-failing-gap'].includes(STATES.en.gap))
  assert.ok(PROPOSALS_EN.evidence['source-failing'].includes(STATES.en.failed) && PROPOSALS_EN.evidence['source-failing'].includes(STATES.en.blocked))
  // reverse: a table with one word or one sentence changed is reported (each of the five, each of the four, both languages)
  for (const lang of ['zh', 'en']) {
    for (const k of FIVE) assert.equal(tableProblems({ states: { ...STATES[lang], [k]: `${STATES[lang][k]} ` }, hints: HINTS[lang] }, lang, 'x').length, 1, `${lang} ${k}`)
    for (const k of Object.keys(HINTS[lang])) assert.equal(tableProblems({ states: STATES[lang], hints: { ...HINTS[lang], [k]: HINTS[lang][k].slice(0, -1) } }, lang, 'x').length, 1, `${lang} ${k}`)
  }
})

// ---- every value of every table --------------------------------------------------------------------------------------------
async function allValues() {
  const out = []
  const walk = (v, path, lang) => {
    if (typeof v === 'string') out.push({ path, lang, text: v })
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, lang))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, lang)
  }
  for (const t of TABLES) {
    for (const f of readdirSync(t.dir).filter(f => f.endsWith('.js') && !t.skip.includes(f)).sort()) {
      const mod = await import(pathToFileURL(join(t.dir, f)).href)
      for (const [name, v] of Object.entries(mod)) walk(v, `${relative(SRC, join(t.dir, f)).replaceAll('\\', '/')}:${name}`, t.lang)
    }
  }
  return out
}
const hitsOf = (values, patterns) => values.flatMap(v => patterns.filter(re => re.test(v.text)).map(re => `${v.path}: ${re} in 「${v.text}」`))

// the v1 state words and the fragments of the v1 处理建议 (contract R6b-1), and 「还没抓过」
const OLD_STATES = [/没新[内]容/, /地址有[问]题/, /被[拒]绝/, /nothing[ ]new/i, /address[ ]problem/i, /failed for[ ]now/i, /blocked by the[ ]site/i,
  /重试[没]用/, /删掉这个[来]源/, /换一个[来]源/, /不需要[你]/, /next[ ]round/i, /还没[抓]过/]
const OLD_STATE_SAMPLES = ['没新' + '内容', '地址有' + '问题', '被' + '拒绝了', 'Nothing' + ' new', 'address' + ' problem', 'Failed for' + ' now', 'Blocked by the' + ' site',
  '重试' + '没用', '删掉这个' + '来源', '换一个' + '来源', '不需要' + '你改地址', 'next' + ' round', '还没' + '抓过']

test('R6b-1 no v1 state word and no fragment of the v1 处理建议 in any dictionary value or in the core\'s words (中英)', async () => {
  const values = await allValues()
  assert.ok(values.length > 1300, `control: the tables were read (${values.length} strings)`)
  assert.ok(values.some(v => v.lang === 'en') && values.some(v => v.path.startsWith('main/')), 'control: both languages, both processes')
  assert.deepEqual(hitsOf(values, OLD_STATES), [])
  const core = Object.values({ ...STATE_WORDS.zh, ...ADVICE_WORDS.zh }).concat(Object.values({ ...STATE_WORDS.en, ...ADVICE_WORDS.en })).map((text, i) => ({ path: `core[${i}]`, lang: 'zh', text }))
  assert.deepEqual(hitsOf(core, OLD_STATES), [])
  // control: each pattern sees a sentence that has its word
  assert.equal(OLD_STATE_SAMPLES.length, OLD_STATES.length)
  for (const [i, sample] of OLD_STATE_SAMPLES.entries()) assert.equal(hitsOf([{ path: 'sample', lang: 'zh', text: `来源 x：${sample}。` }], [OLD_STATES[i]]).length, 1, `${OLD_STATES[i]} sees its sample`)
  assert.deepEqual(hitsOf([{ path: 'sample', lang: 'zh', text: '已拒绝 · 访问被拒 · 请求被拒 · the next run' }], OLD_STATES), [], 'control: the words in use are not hit')
})

// the colloquial words 05 replaces (统一用词「不再用」, 规则 2 / 4 / 5 / 6) that R6b-2 took out of the dictionaries
const COLLOQUIAL_ZH = [/去[登]录/, /我登录[好]了/, /等你[看收]/, /我[写]的/, /这一条的[记]录/, /写给 AI 的[话]/, /没[过]/, /想补的[主]题/, /没有[打]分/, /[打]分/, /删[掉]/,
  /[这上下]一[轮]/, /第一[轮]/, /正在[跑]/, /跑[完]/, /试了[一]次/, /还[没]/, /没[能]/, /没[法]/, /这一[条]/, /不[对]/, /[连]不上/, /发给[我]们/, /装[好]/, /已经/]
const COLLOQUIAL_ZH_SAMPLES = ['去' + '登录', '我登录' + '好了', '3 条等你' + '看', '我' + '写的', '这一条的' + '记录', '写给 AI 的' + '话', '没' + '过', '想补的' + '主题', '没有' + '打分', '重新' + '打分', '删' + '掉',
  '这一' + '轮', '建库后的第一' + '轮', '流水线正在' + '跑', '跑' + '完再更新', '试了' + '一次', '还' + '没登录', '没' + '能打开', '没' + '法校验', '这一' + '条没有评分', 'key 不' + '对', '网络' + '连不上', '发给' + '我们', '装' + '好它后', '已经' + '下载好']
const COLLOQUIAL_EN = [/i am signed[ ]in/i, /waiting for[ ]you/i, /written by[ ]you/i, /words for the[ ]ai/i, /this round[ ]brought/i, /save or[ ]dismiss/i, /the pipeline is[ ]running/i, /tried[ ]once/i]
const COLLOQUIAL_EN_SAMPLES = ['I am signed' + ' in, try again', '3 items waiting for' + ' you', 'Written by' + ' you', 'Words for the' + ' AI in this item', 'this round' + ' brought 3', 'to save or' + ' dismiss', 'The pipeline is' + ' running.', 'Tried' + ' once: usable']
// (the sentences that keep a colloquial word on purpose — docs/checks/2026-11-13-r6b/05-对照.md 附表「查到、没有改」, e.g. the
// detection line's 「没找到」 that installer/test/packaged.test.mjs asserts — are not named by any of the patterns above)

test('R6b-2 the colloquial sentences 05 replaces are gone from both dictionaries; the notification says 本次运行新增 n 条待看', async () => {
  const values = await allValues()
  assert.deepEqual(hitsOf(values.filter(v => v.lang === 'zh'), COLLOQUIAL_ZH), [])
  assert.deepEqual(hitsOf(values.filter(v => v.lang === 'en'), COLLOQUIAL_EN), [])
  assert.equal(NOTIFY.kinds.newItems, '{library}：本次运行新增 {n} 条待看。')
  assert.equal(NOTIFY_EN.kinds.newItems, '{library}: this run added {n} to the Inbox.')
  // control: each pattern sees a sentence that has its word, and the words in use now are not hit
  assert.equal(COLLOQUIAL_ZH_SAMPLES.length, COLLOQUIAL_ZH.length)
  for (const [i, sample] of COLLOQUIAL_ZH_SAMPLES.entries()) assert.ok(hitsOf([{ path: 'sample', lang: 'zh', text: sample }], [COLLOQUIAL_ZH[i]]).length === 1, `${COLLOQUIAL_ZH[i]} sees its sample`)
  assert.equal(COLLOQUIAL_EN_SAMPLES.length, COLLOQUIAL_EN.length)
  for (const [i, sample] of COLLOQUIAL_EN_SAMPLES.entries()) assert.ok(hitsOf([{ path: 'sample', lang: 'en', text: sample }], [COLLOQUIAL_EN[i]]).length === 1, `${COLLOQUIAL_EN[i]} sees its sample`)
  const fine = '前往登录 · 已登录，重新检测 · 3 条待看 · 我的笔记 · 核验记录 · 面向 AI 的指令 · 未通过 · 待补充主题 · 未评分 · 重新评分 · 删除 · 本次运行 · 上次运行 · 下次运行 · 首次运行 · 运行中 · 测试结果 · 尚未 · 未能 · 无法 · 该条内容 · 无效 · 无法连接 · 已下载'
  assert.deepEqual(hitsOf([{ path: 'sample', lang: 'zh', text: fine }], COLLOQUIAL_ZH), [], 'control: the words in use are not hit')
})

// ---- the placeholder screen (dead code) ------------------------------------------------------------------------------------
function filesUnder(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p))
    else out.push(p)
  }
  return out
}
const GONE = ['renderer/screens/placeholder.js', 'renderer/styles/screens/placeholder.css', 'renderer/texts/screens.js', 'renderer/texts-en/screens.js']
/** Where the app's own code still names the placeholder screen's files, its classes or the interim name only it used. */
function placeholderLeftovers(read = p => readFileSync(p, 'utf8')) {
  const problems = []
  for (const f of GONE) if (existsSync(join(SRC, f))) problems.push(`${f} is there`)
  const names = [/placeholder\.js/, /placeholder\.css/, /texts\/screens\.js/, /placeholderScreen/, /\bph-(body|note|hint)\b/, /--st-text-3\b/]
  for (const p of filesUnder(SRC).filter(p => /\.(js|mjs|cjs|css|html)$/.test(p) && !p.includes(`${join('renderer', 'template')}`))) {
    const rel = relative(SRC, p).replaceAll('\\', '/')
    // interim.css says in a comment that the screen and its name went (redesign R6b): only what is outside comments counts
    const text = read(p).replace(/\/\*[\s\S]*?\*\//g, '')
    for (const re of names) if (re.test(text)) problems.push(`${rel} names ${re}`)
  }
  return problems
}

test('R6b-2 the placeholder screen, its style file, its two text tables and the interim name only it used are gone, and nothing names them', () => {
  assert.deepEqual(placeholderLeftovers(), [])
  const appCss = readFileSync(join(SRC, 'renderer', 'styles', 'app.css'), 'utf8')
  assert.equal(/@import[^\n]*placeholder/.test(appCss), false)
  assert.equal(appCss.includes('removed by R2–R4'), false, 'the comment that said interim.css would be removed is corrected')
  // every file app.css imports is there
  const imports = [...appCss.matchAll(/@import url\('\.\/([^']+)'\)/g)].map(m => m[1])
  assert.ok(imports.length >= 5, `control: the imports were read (${imports.length})`)
  for (const f of imports) assert.ok(existsSync(join(SRC, 'renderer', 'styles', f)), `${f} exists`)
  // reverse: the same scan on a tree where app.css imports the file again, and where a style names the variable
  const withImport = placeholderLeftovers(p => (/[\\/]app\.css$/.test(p) ? `${readFileSync(p, 'utf8')}\n@import url('./screens/placeholder.css');\n` : readFileSync(p, 'utf8')))
  assert.deepEqual(withImport, ['renderer/styles/app.css names /placeholder\\.css/'])
  const withName = placeholderLeftovers(p => (/[\\/]base\.css$/.test(p) ? `${readFileSync(p, 'utf8')}\n.x { color: var(--st-text-3); }\n` : readFileSync(p, 'utf8')))
  assert.deepEqual(withName, ['renderer/styles/base.css names /--st-text-3\\b/'])
})
