// 对比度实算：在无头 Edge 里打开设计稿，6 种组合下取真实元素的计算颜色（getComputedStyle）与它实际的底色
// （往上找第一层不透明的底；半透明的按 alpha 叠到下面那层上；渐变底取每个色标、报最差的那个），按 WCAG 2 相对亮度公式算。
// 输出：README.md 里 <!-- contrast:start --> … <!-- contrast:end --> 之间的表，和 tools/contrast-result.json（每一格的原始颜色）。
// 跑法（仓库根目录）：node docs/design/next/themes/tools/contrast.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../..')
const pw = await import(pathToFileURL(join(repo, 'desktop', 'node_modules', 'playwright-core', 'index.mjs')).href)
const page0 = pathToFileURL(join(here, '..', 'index.html')).href

// [id, 类别, 说明, 画面, 选择器, 门槛]
export const PROBES = [
  ['body-page', '正文', '正文 / 主区底（对话里主 Agent 的话）', 'chat', '#main .intro-copy', 4.5],
  ['body-surface', '正文', '正文 / 卡片（库架卡片的「在追」）', 'shelf', '#main .tile-track', 4.5],
  ['body-side', '正文', '正文 / 左栏（没选中的库名）', 'inbox', '#sidebar .project-item:not(.active) .project-name', 4.5],
  ['body-selected', '正文', '正文 / 选中底（左栏当前的库）', 'inbox', '#sidebar .project-item.active .project-name', 4.5],
  ['body-panel-card', '正文', '正文 / 右栏卡片（等你决定的标题）', 'shelf', '#panel .decide-card b', 4.5, 'decide'],
  ['sub-page', '次要', '次要 / 主区底（页头说明）', 'shelf', '#main .work-header .header-meta', 3],
  ['sub-surface', '次要', '次要 / 卡片（库架卡片「上次更新」）', 'shelf', '#main .tile-meta', 3],
  ['sub-side', '次要', '次要 / 左栏（库名下的状态）', 'inbox', '#sidebar .project-item:not(.active) .project-meta', 3],
  ['sub-quota', '次要', '次要 / 左下角余量（重置时间）', 'shelf', '#sidebar .quota-row small', 3],
  ['sub-panel', '次要', '次要 / 右栏摘要块（小标题）', 'shelf', '#panel .panel-summary .eyebrow', 3],
  ['btn-primary', '按钮', '主按钮字 / 强调色（「新建库」）', 'shelf', '#main .work-header .btn.primary', 4.5],
  ['btn-secondary', '按钮', '次要按钮字 / 按钮底（阅读区「编辑」）', 'library', '#main .reader-tools .btn', 4.5],
  ['btn-card', '按钮', '卡片上的次要按钮（待看「稍后」）', 'inbox', '#main .source-card:not(.selected) .card-actions .btn:not(.primary)', 4.5],
  ['btn-tab', '按钮', '当前标签字 / 选中底（库页「待看」）', 'inbox', '#main .lib-tabs .tab.active', 4.5],
  ['state-wait', '状态', '琥珀字 / 琥珀浅底（「写给 AI 的话」标记）', 'inbox', '#main .ai-mark', 4.5],
  ['state-done', '状态', '绿字 / 绿浅底（「已收藏」）', 'library', '#main .status-pill--done', 4.5],
  ['state-cite', '状态', '紫字 / 紫浅底（问库的出处编号）', 'ask', '#main .answer .cite', 4.5],
]
const THEMES = [['precision', '精密国际主义'], ['glass', '澄明玻璃'], ['research', '研究对话']]
const LOOKS = [['light', '浅'], ['dark', '深']]

function inPage(sel) {
  const parse = s => {
    const m = s.match(/rgba?\(([^)]+)\)/) || s.match(/color\(srgb ([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    const srgb = s.startsWith('color(')
    return { r: srgb ? p[0] * 255 : p[0], g: srgb ? p[1] * 255 : p[1], b: srgb ? p[2] * 255 : p[2], a: p[3] ?? 1 }
  }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const el = document.querySelector(sel)
  if (!el) return { missing: true }
  const fg = parse(getComputedStyle(el).color)
  // 底：自己和祖先一层层往下叠，直到不透明
  const layers = []
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const img = cs.backgroundImage
    if (img && img !== 'none') {
      const stops = [...img.matchAll(/(rgba?\([^)]+\)|color\(srgb [^)]+\))/g)].map(m => parse(m[1]))
      if (stops.length) { layers.push({ stops }); if (stops.every(s => s.a >= 1)) break }
    }
    const bg = parse(cs.backgroundColor)
    if (bg && bg.a > 0) { layers.push({ stops: [bg] }); if (bg.a >= 1) break }
  }
  // 每种色标组合叠一遍，取全部可能的底
  let bases = [{ r: 255, g: 255, b: 255, a: 1 }]
  for (const layer of layers.reverse()) bases = layer.stops.flatMap(s => bases.map(b => over(s, b)))
  const fgs = bases.map(b => over(fg, b))
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
  return { fg: fgs.map(hex), bg: bases.map(hex), text: el.textContent.trim().slice(0, 24) }
}

const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const browser = await pw.chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${page0}?bar=0`)
await page.evaluate(() => document.fonts.ready)
const result = {}
for (const [theme] of THEMES) for (const [look] of LOOKS) {
  const key = `${theme}-${look}`
  result[key] = {}
  for (const [id, , , screen, sel, , tab] of PROBES) {
    await page.evaluate(o => window.streamsDesign.set(o), { screen, theme, appearance: look, tab: tab ?? undefined })
    const got = await page.evaluate(inPage, sel)
    if (got.missing) { result[key][id] = { missing: sel }; continue }
    const ratios = got.bg.map((b, i) => ratio(got.fg[i], b))
    const worst = ratios.indexOf(Math.min(...ratios))
    result[key][id] = { fg: got.fg[worst], bg: got.bg[worst], ratio: +ratios[worst].toFixed(2), bgStops: got.bg.length, sample: got.text }
  }
}
// 只写在 token 里、页面上没用到的 --st-text-3（更淡的说明）：取 :root 的计算值
const faint = {}
for (const [theme] of THEMES) for (const [look] of LOOKS) {
  await page.evaluate(o => window.streamsDesign.set(o), { screen: 'shelf', theme, appearance: look })
  faint[`${theme}-${look}`] = await page.evaluate(() => {
    const p = document.createElement('p'); p.style.cssText = 'color: var(--st-text-3); background: var(--st-page)'; document.body.append(p)
    const p2 = document.createElement('p'); p2.style.cssText = 'color: var(--st-text-3); background: var(--st-sidebar)'; document.body.append(p2)
    const read = el => { const cs = getComputedStyle(el); return [cs.color, cs.backgroundColor] }
    const out = [read(p), read(p2)]; p.remove(); p2.remove(); return out
  })
}
await browser.close()

const toHex = s => '#' + s.match(/\d+(\.\d+)?/g).slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase()
const faintRows = Object.fromEntries(Object.entries(faint).map(([k, [[c1, b1], [c2, b2]]]) => [k, { page: +ratio(toHex(c1), toHex(b1)).toFixed(2), side: +ratio(toHex(c2), toHex(b2)).toFixed(2), color: toHex(c1) }]))

writeFileSync(join(here, 'contrast-result.json'), `${JSON.stringify({ measuredBy: 'tools/contrast.mjs', probes: PROBES.map(([id, kind, what, screen, sel, min]) => ({ id, kind, what, screen, sel, min })), result, textThree: faintRows }, null, 2)}\n`)

let md = '\n| 字 / 底 | 门槛 | ' + THEMES.flatMap(([, n]) => LOOKS.map(([, l]) => `${n} · ${l}`)).join(' | ') + ' |\n|---|---|' + '---|'.repeat(6) + '\n'
const below = []
for (const [id, , what, , , min] of PROBES) {
  md += `| ${what} | ${min} | `
  md += THEMES.flatMap(([t]) => LOOKS.map(([l]) => {
    const c = result[`${t}-${l}`][id]
    if (c.missing) { below.push(`${t}-${l} ${id}: 元素没找到`); return '没找到' }
    if (c.ratio < min) below.push(`${t}-${l} ${what}: ${c.ratio}（字 ${c.fg} / 底 ${c.bg}）`)
    return c.ratio < min ? `**${c.ratio.toFixed(2)}** ✗` : c.ratio.toFixed(2)
  })).join(' | ')
  md += ' |\n'
}
md += `| \`--st-text-3\`（更淡的说明，本稿页面上没用；token 值对主区底 / 栏底） | 3 | ${THEMES.flatMap(([t]) => LOOKS.map(([l]) => { const f = faintRows[`${t}-${l}`]; return `${f.page.toFixed(2)} / ${f.side.toFixed(2)}` })).join(' | ')} |\n`
md += `\n不达标：${below.length ? below.join('；') : '没有（上表每一格都过各自的门槛）'}。每一格的字色、底色原值在 \`tools/contrast-result.json\`。\n`

const readmePath = join(here, '..', 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const a = readme.indexOf('<!-- contrast:start -->')
const b = readme.indexOf('<!-- contrast:end -->')
if (a < 0 || b < a) throw new Error('README.md has no <!-- contrast:start --> … <!-- contrast:end --> block')
writeFileSync(readmePath, `${readme.slice(0, a)}<!-- contrast:start -->\n${md}\n${readme.slice(b)}`)
console.log(md)
