// 自查：无头 Edge 以 file:// 打开设计稿，逐项核（每一项都写了它什么时候会失败）：
//  1 默认 = 精密国际主义 + 跟随系统；六种组合的页面底色 / 正文色两两不同（同一主题浅深不同、同一外观三主题不同）
//  2 切遍 7 个画面 × 3 主题 × 3 外观 × 右栏 4 标签 + 收起 + 右键菜单，收集 console error 与 pageerror（要 0 条）
//  3 document.fonts 里 Noto 那一款状态是 loaded，并且正文真的用上了它（document.fonts.check）
//  4 wording 包的 scanStrings 扫 7 个画面 × 4 个右栏标签 × 3 主题的 innerText（要 0 处）；品牌词只出现在「连接你电脑上的 …」里
//  5 左下角余量：在「设置」前面；五种状态各自的样子；API 无接口时整块不在
//  6 右栏：四个标签名、可收起；详情在待看 / 资料库 / 问库 / 和主 Agent 聊四个画面下各不相同；文件树按主题分组、要求与来源一项不直接打开、程序记录默认折叠
//  7 themes/ 下的文件：没有原型产品名那两个字（U+4E91 U+7EC7），没有 http(s):// 资源引用
// 跑法（仓库根目录）：node docs/design/next/themes/tools/check.mjs        失败时退出码 1
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const themesDir = resolve(here, '..')
const repo = resolve(here, '../../../../..')
const pw = await import(pathToFileURL(join(repo, 'desktop', 'node_modules', 'playwright-core', 'index.mjs')).href)
const wording = await import(pathToFileURL(join(repo, 'wording', 'src', 'index.mjs')).href)
const page0 = pathToFileURL(join(themesDir, 'index.html')).href

const results = []
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

// 7 文件层面
const files = []
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk(themesDir)
const textFiles = files.filter(f => /\.(html|css|js|mjs|md|json)$/.test(f))
const YZ = String.fromCodePoint(0x4e91, 0x7ec7) // 那两个字本身不写进本目录
const yz = textFiles.filter(f => readFileSync(f, 'utf8').includes(YZ))
ok('themes/ 里没有原型产品的名字（U+4E91 U+7EC7）', yz.length === 0, yz.length ? yz.map(f => relative(themesDir, f)).join(', ') : `${textFiles.length} 个文本文件`)
const net = []
for (const f of textFiles.filter(f => /\.(html|css|js)$/.test(f))) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/(?:src|href|url)\s*[=(]\s*['"]?(https?:)?\/\//g)) net.push(`${relative(themesDir, f)}: ${m[0]}`)
  for (const m of s.matchAll(/@import|https?:\/\/[^\s'")]+/g)) net.push(`${relative(themesDir, f)}: ${m[0]}`)
}
ok('页面（html/css/js）不引用外网', net.length === 0, net.join('; '))

const browser = await pw.chromium.launch({ channel: 'msedge', headless: true })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()}`))
const requests = []
page.on('request', r => requests.push(r.url()))

// 1 默认状态
await page.goto(page0)
await page.evaluate(() => document.fonts.ready)
const def = await page.evaluate(() => ({ ...window.streamsDesign.state, bar: !!document.querySelector('#designBar') && getComputedStyle(document.querySelector('#designBar')).display !== 'none', screen: window.streamsDesign.state.screen }))
ok('默认：精密国际主义 + 跟随系统', def.theme === 'precision' && def.appearancePref === 'system', JSON.stringify(def))
const looks = {}
for (const theme of ['precision', 'glass', 'research']) for (const appearance of ['light', 'dark']) {
  looks[`${theme}-${appearance}`] = await page.evaluate(o => {
    window.streamsDesign.set(o)
    const main = getComputedStyle(document.querySelector('#main'))
    const side = getComputedStyle(document.querySelector('#sidebar'))
    return { page: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color, side: side.backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--st-accent').trim(), main: main.backgroundColor }
  }, { screen: 'shelf', theme, appearance })
}
const keys = Object.keys(looks)
const sig = k => `${looks[k].page}|${looks[k].text}|${looks[k].side}|${looks[k].accent}`
const dup = keys.flatMap((a, i) => keys.slice(i + 1).filter(b => sig(a) === sig(b)).map(b => `${a}=${b}`))
ok('六种组合的底色 / 正文 / 栏底 / 强调色两两不同', dup.length === 0, dup.join(', ') || keys.map(k => `${k}: ${looks[k].page} ${looks[k].text} ${looks[k].accent}`).join(' · '))
// 跟随系统真的跟：模拟系统深色
await page.emulateMedia({ colorScheme: 'dark' })
const sysDark = await page.evaluate(() => window.streamsDesign.set({ appearance: 'system' }).appearance)
await page.emulateMedia({ colorScheme: 'light' })
await page.waitForTimeout(150)
const sysLight = await page.evaluate(() => window.streamsDesign.state.appearance)
ok('跟随系统：系统深色→深色，系统浅色→浅色', sysDark === 'dark' && sysLight === 'light', `${sysDark} / ${sysLight}`)

// 3 字体
const fonts = await page.evaluate(async () => {
  await document.fonts.ready
  const faces = [...document.fonts].map(f => ({ family: f.family, status: f.status }))
  return { faces, check: document.fonts.check('14px "Streams Noto Sans SC"', '流息'), bodyFont: getComputedStyle(document.body).fontFamily }
})
const noto = fonts.faces.filter(f => /Noto/.test(f.family))
ok('Noto Sans SC 已加载', noto.length > 0 && noto.every(f => f.status === 'loaded') && fonts.check, `${JSON.stringify(noto)} check=${fonts.check}`)

// 2 + 4 + 6 切遍
const screens = ['shelf', 'chat', 'inbox', 'library', 'ask', 'settings', 'queue']
const tabs = ['progress', 'decide', 'detail', 'files']
const scanHits = []
const brandBad = []
const details = {}
const BRANDS = /Claude|Codex|Anthropic|OpenAI|GPT|Gemini|DeepSeek/g
for (const theme of ['precision', 'glass', 'research']) for (const appearance of ['light', 'dark', 'system']) for (const screen of screens) {
  for (const tab of tabs) {
    const text = await page.evaluate(o => { window.streamsDesign.set(o); return document.body.innerText }, { screen, theme, appearance, tab, panel: 'open', bar: true })
    if (appearance !== 'dark') {
      const r = wording.scanStrings({ [`${screen}/${tab}/${theme}`]: text })
      if (!r.ok) scanHits.push(...r.hits.map(h => `${screen}/${tab}/${theme}: 「${h.text}」 ${h.context}`))
      for (const line of text.split('\n')) for (const m of line.matchAll(BRANDS)) {
        if (!/连接你电脑上的 (Claude Code|Codex)/.test(line)) brandBad.push(`${screen}/${tab}: ${line.trim()}`)
      }
      if (tab === 'detail' && theme === 'precision' && appearance === 'light') details[screen] = await page.evaluate(() => document.querySelector('#panel [data-tab-content="detail"]').innerText)
    }
  }
  await page.evaluate(() => window.streamsDesign.set({ panel: 'closed' }))
  await page.evaluate(() => window.streamsDesign.set({ panel: 'open', tab: 'files', menu: true }))
  await page.evaluate(() => window.streamsDesign.set({ menu: false }))
}
// 点几下真的交互：标签、收起、右键、主题卡
await page.evaluate(() => window.streamsDesign.set({ screen: 'library', theme: 'precision', appearance: 'light', tab: 'files' }))
await page.click('#panel [data-tree="note"]', { button: 'right' })
const menuText = await page.evaluate(() => document.querySelector('#menu').hidden ? '' : document.querySelector('#menu').innerText)
await page.keyboard.press('Escape')
await page.click('#panel .panel-collapse')
const collapsed = await page.evaluate(() => ({ cls: document.querySelector('#panel').classList.contains('collapsed'), w: document.querySelector('#panel').getBoundingClientRect().width }))
await page.click('#panel [data-panel="open"]')
const reopened = await page.evaluate(() => document.querySelector('#panel').getBoundingClientRect().width)
await page.evaluate(() => window.streamsDesign.set({ screen: 'settings' }))
await page.click('[data-set-theme="glass"]')
const afterCard = await page.evaluate(() => window.streamsDesign.state.theme)
await page.click('[data-set-appearance="dark"]')
const afterLook = await page.evaluate(() => window.streamsDesign.state.appearance)
await page.evaluate(() => window.streamsDesign.set({ theme: 'precision', appearance: 'system' }))

ok('切遍画面 / 主题 / 外观 / 标签无控制台报错', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : `${screens.length}×3×3×${tabs.length} 种`)
const foreign = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:'))
ok('只读本机文件（没有任何网络请求）', foreign.length === 0, foreign.slice(0, 3).join(', ') || `${new Set(requests).size} 个 file:// 请求`)
ok('scanStrings：7 个画面 × 4 标签 × 3 主题的可见文字没有禁词', scanHits.length === 0, scanHits.slice(0, 5).join(' | ') || '0 处')
ok('品牌词只在「连接你电脑上的 …」里', brandBad.length === 0, [...new Set(brandBad)].slice(0, 5).join(' | ') || '0 处')
const ds = ['inbox', 'library', 'ask', 'chat'].map(s => details[s])
ok('详情随主区变（待看 / 资料库 / 问库 / 和主 Agent 聊四种各不相同）', new Set(ds).size === 4 && ds.every(Boolean), ds.map(d => d?.split('\n').slice(0, 2).join(' ')).join(' ‖ '))
ok('右键菜单：用 Obsidian 打开 · 在资源管理器中显示', /用 Obsidian 打开/.test(menuText) && /在资源管理器中显示/.test(menuText), menuText.replace(/\n/g, ' · '))
ok('右栏可收起、可再展开', collapsed.cls && collapsed.w < 80 && reopened > 300, `收起 ${collapsed.w}px，展开 ${reopened}px`)
ok('设置页主题卡与外观按钮真的切换', afterCard === 'glass' && afterLook === 'dark', `${afterCard} / ${afterLook}`)

// 右栏结构
const panel = await page.evaluate(() => {
  window.streamsDesign.set({ screen: 'library', theme: 'precision', appearance: 'light', tab: 'files' })
  const tabsText = [...document.querySelectorAll('#panel .panel-tabs .tab')].map(t => t.innerText.replace(/\d+/g, '').trim())
  const topics = [...document.querySelectorAll('#panel [data-tree="topic"] > summary')].map(s => s.innerText.trim())
  const req = document.querySelector('#panel [data-tree="requirements"]')
  const prog = document.querySelector('#panel [data-tree="program"]')
  return { tabsText, topics, reqOpens: req?.dataset.opens, reqHasPath: /streams\.json|\.json/.test(req?.innerText ?? ''), programOpen: prog?.open, programButtons: [...(prog?.querySelectorAll('button') ?? [])].map(b => b.textContent.trim()) }
})
ok('右栏四个标签：进度 · 等你决定 · 详情 · 文件', JSON.stringify(panel.tabsText) === JSON.stringify(['进度', '等你决定', '详情', '文件']), panel.tabsText.join(' · '))
ok('文件：按主题分组；要求与来源去标签页不直接打开；程序记录默认折叠、只给「在资源管理器中显示」',
  panel.topics.length >= 2 && panel.reqOpens === 'sources-tab' && !panel.reqHasPath && panel.programOpen === false && JSON.stringify(panel.programButtons) === JSON.stringify(['在资源管理器中显示']),
  JSON.stringify(panel))

// 5 余量
const quota = {}
for (const q of ['claude', 'codex', 'api', 'unreadable', 'none']) {
  quota[q] = await page.evaluate(q => {
    window.streamsDesign.set({ screen: 'shelf', quota: q })
    const el = document.querySelector('#sidebar .quota')
    const settings = document.querySelector('#sidebar .side-footer [data-go="settings"]')
    return { present: !!el, before: el ? !!(el.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING) : null, text: el?.innerText.replace(/\n/g, ' ') ?? '', title: el?.title ?? '' }
  }, q)
}
const qBrand = Object.values(quota).filter(v => /Claude|Codex|Anthropic|OpenAI/.test(v.text))
const qTitleBad = Object.values(quota).filter(v => /Claude|Codex/.test(v.title) && !/连接你电脑上的 (Claude Code|Codex)/.test(v.title))
ok('余量在「设置」上面；三种状态（有数 / 读不到 / API 无接口不显示）；标签无品牌词',
  quota.claude.present && quota.claude.before && quota.codex.before && quota.api.before && quota.unreadable.present && quota.unreadable.text === '余量暂时读不到' && !quota.none.present && qBrand.length === 0 && qTitleBad.length === 0,
  Object.entries(quota).map(([k, v]) => `${k}: ${v.present ? v.text : '（不显示）'}`).join(' ‖ '))

await browser.close()
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length} / ${results.length} ok`)
if (failed.length) process.exitCode = 1
