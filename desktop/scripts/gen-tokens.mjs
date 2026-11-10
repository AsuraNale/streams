#!/usr/bin/env node
// v2 package K2: src/renderer/styles/tokens.css is generated from the one token data source of the approved design draft,
// docs/design/next/themes/tools/tokens-data.mjs (K1: the three themes × light / dark, the values the maintainer saw). Nothing in
// tokens.css is written by hand: change the data there (a design change) and run this again.
//   node scripts/gen-tokens.mjs           write src/renderer/styles/tokens.css
//   node scripts/gen-tokens.mjs --check   exit 1 when the file is not what the data gives (test/theme.test.mjs does the same)
// The blocks: `:root` the values all six share; then for each theme its light set on `[data-theme="<id>"]` (precision's
// also on `:root`, the default when a page names no theme) and its dark set on `[data-theme="<id>"][data-appearance="dark"]`.
// The selectors are not tied to <html>: 设置's three theme cards carry their own data-theme / data-appearance and draw
// themselves in that set (the K1 draft does the same). The main process serves index.html with both attributes on <html>
// (main/theme.mjs withTheme), so the first frame is already the set in force.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DESKTOP_DIR, REPO_DIR } from './lib/paths.mjs'

export const TOKENS_FILE = join(DESKTOP_DIR, 'src', 'renderer', 'styles', 'tokens.css')
export const TOKENS_DATA = join(REPO_DIR, 'docs', 'design', 'next', 'themes', 'tools', 'tokens-data.mjs')

/** The K1 data module (THEMES, tokensOf, COMMON). */
export async function tokenData() {
  return import(pathToFileURL(TOKENS_DATA).href)
}

/** The selector of one set: the light one of precision is also :root (the default). */
export const selectorOf = (id, appearance) => (appearance === 'dark'
  ? `[data-theme="${id}"][data-appearance="dark"]`
  : (id === 'precision' ? `:root, [data-theme="${id}"]` : `[data-theme="${id}"]`))

/** tokens.css as the data gives it. */
export async function tokensCss(data = null) {
  const { THEMES, tokensOf, COMMON } = data ?? await tokenData()
  const block = (selector, scheme, rows) => `${selector} {\n  color-scheme: ${scheme};\n${rows.map(([n, v]) => `  ${n}: ${v};`).join('\n')}\n}\n`
  let css = `/* Design tokens of 流息 Streams — GENERATED, do not edit: desktop/scripts/gen-tokens.mjs writes this file from the approved
   design draft's one token data source, docs/design/next/themes/tools/tokens-data.mjs (v2 package K2; docs/tokens.md is
   the list: name · value per set · where it comes from). Use these names; no colour is written in any other style file
   (test/kit.test.mjs). Three themes (精密国际主义 precision, the default · 澄明玻璃 glass · 研究对话 research) × light / dark
   = six sets, all with the same names; the page says which on <html data-theme="…" data-appearance="light|dark"> (the main
   process serves index.html with both, so the first frame is already the set in force: main/theme.mjs withTheme). */

:root {
${COMMON.map(([n, v]) => `  ${n}: ${v};`).join('\n')}
}
`
  for (const id of Object.keys(THEMES)) {
    css += `\n/* ${THEMES[id].name} ${id} */\n`
    css += block(selectorOf(id, 'light'), 'light', tokensOf(id, 'light'))
    css += block(selectorOf(id, 'dark'), 'dark', tokensOf(id, 'dark'))
  }
  return css
}

// ---- docs/tokens.md: the tables between <!-- tokens:start --> and <!-- tokens:end -->, and the contrast table between
// <!-- contrast:start --> and <!-- contrast:end -->; the words outside the markers are written by hand. Each row's last cell
// (用在哪) is kept from the doc as it is; a token the doc has no row for yet takes NEW_USES.
export const DOC_FILE = join(REPO_DIR, 'docs', 'tokens.md')
const SETS = [['precision', 'light'], ['precision', 'dark'], ['glass', 'light'], ['glass', 'dark'], ['research', 'light'], ['research', 'dark']]
const NEW_USES = {
  '--st-selected': '选中的东西：左栏当前的库与入口、当前标签、待看当前的卡、资料库当前的一条、设置里选中的卡；悬停也用它',
  '--st-focus': '焦点环（精密国际主义是虚线）',
  '--st-shadow-card': '卡片浮起：库架的卡、待看的卡、提议卡、设置的每组、左下角余量',
  '--st-radius-key': '主按钮的圆角（澄明玻璃是胶囊、研究对话是 3px 的页角）',
  '--st-weight-body': '正文字重（深色减一点，免得发虚）',
  '--st-weight-display': '标题字重：页面标题、卡片标题、品牌名',
  '--st-tracking-display': '标题字距',
  '--st-weight-label': '标签字重：导航、按钮、标签、表头',
  '--st-icon-cap': '图标线头',
  '--st-icon-join': '图标拐角',
  '--st-icon-weight': '图标线宽',
}
const GROUPS = [
  ['面', ['--st-page', '--st-surface', '--st-surface-2', '--st-card-head', '--st-table-head', '--st-row-head', '--st-selected', '--st-active-fill']],
  ['线', ['--st-border', '--st-control-border', '--st-divider', '--st-divider-soft']],
  ['左栏（右栏同色）', ['--st-sidebar', '--st-sidebar-text', '--st-sidebar-text-2', '--st-sidebar-divider', '--st-sidebar-button', '--st-sidebar-button-border', '--st-sidebar-selected-title', '--st-sidebar-selected-sub']],
  ['文字', ['--st-text', '--st-text-2', '--st-text-3', '--st-text-dark-2', '--st-line-todo']],
  ['强调色', ['--st-accent', '--st-accent-hover', '--st-on-accent', '--st-on-accent-2', '--st-focus']],
  ['状态', ['--st-wait', '--st-wait-bg', '--st-wait-border', '--st-done', '--st-done-bg', '--st-done-border', '--st-danger', '--st-danger-bg', '--st-step-todo', '--st-step-done-past', '--st-accent-alt', '--st-accent-alt-soft']],
  ['五种抓取状态（方案 1.7：正常 · 没新内容 · 地址有问题 · 暂时失败 · 被拒绝）', ['--st-fetch-ok', '--st-fetch-ok-bg', '--st-fetch-empty', '--st-fetch-empty-bg', '--st-fetch-gap', '--st-fetch-gap-bg', '--st-fetch-failed', '--st-fetch-failed-bg', '--st-fetch-blocked', '--st-fetch-blocked-bg']],
  ['图表', ['--st-chart-against', '--st-chart-background', '--st-chart-gap', '--st-chart-1', '--st-chart-2', '--st-chart-3', '--st-chart-4', '--st-chart-5']],
  ['库的颜色（不随主题变，只分浅深）', ['--st-lib-river', '--st-lib-violet', '--st-lib-green', '--st-lib-muted', '--st-on-lib']],
  ['衬底与阴影', ['--st-scrim', '--st-shadow-menu', '--st-shadow-card']],
  ['形状', ['--st-radius', '--st-radius-s', '--st-radius-xs', '--st-radius-key']],
  ['字体与字重（维护者 11-10：Noto Sans SC）', ['--st-font', '--st-font-mono', '--st-fs-body', '--st-weight-body', '--st-weight-display', '--st-tracking-display', '--st-weight-label']],
  ['图标', ['--st-icon-cap', '--st-icon-join', '--st-icon-weight']],
]
const cell = v => `\`${String(v).replace(/\|/g, '\\|')}\``

/** The usage cell of each row the doc has now: token → text. */
export function docUses(doc) {
  const out = {}
  for (const line of doc.split('\n')) {
    const m = /^\| `(--st-[a-z0-9-]+)` \|/.exec(line)
    if (!m) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    out[m[1]] = cells[cells.length - 1]
  }
  return out
}

/** The tables of docs/tokens.md: one per group, the six sets in six columns; then the values all six share. */
export async function docTables(uses, data = null) {
  const { tokensOf, COMMON } = data ?? await tokenData()
  const sets = Object.fromEntries(SETS.map(([t, a]) => [`${t}/${a}`, new Map(tokensOf(t, a).map(([n, v, from]) => [n, { v, from }]))]))
  const all = new Set(tokensOf('precision', 'light').map(r => r[0]))
  const listed = new Set(GROUPS.flatMap(g => g[1]))
  const missing = [...all].filter(n => !listed.has(n))
  if (missing.length) throw new Error(`docs/tokens.md has no group for ${missing.join(', ')}`)
  const head = '| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |\n|---|---|---|---|---|---|---|---|---|\n'
  let md = ''
  for (const [title, names] of GROUPS) {
    md += `\n### ${title}\n\n${head}`
    for (const n of names) md += `| \`${n}\` | ${sets['precision/light'].get(n).from} | ${SETS.map(([t, a]) => cell(sets[`${t}/${a}`].get(n).v)).join(' | ')} | ${uses[n] ?? NEW_USES[n] ?? ''} |\n`
  }
  md += `\n### 六组都一样的\n\n${head}`
  for (const [n, v] of COMMON) md += `| \`${n}\` | 三套共用 | ${SETS.map(() => cell(v)).join(' | ')} | ${uses[n] ?? ''} |\n`
  return md
}

/** The contrast table of docs/tokens.md: every pair of test/support/contrast-pairs.mjs in the six sets. */
export async function contrastTable(css) {
  const { CONTRAST_PAIRS } = await import('../test/support/contrast-pairs.mjs')
  const { contrast, tokenSets } = await import('../test/support/tokens.mjs')
  const sets = tokenSets(css)
  let md = '\n| 字 / 底 | 门槛 | 精密 · 浅 | 精密 · 深 | 玻璃 · 浅 | 玻璃 · 深 | 研究 · 浅 | 研究 · 深 |\n|---|---|---|---|---|---|---|---|\n'
  for (const [fg, bg, floor, what] of CONTRAST_PAIRS) {
    md += `| ${what}（\`${fg}\` / \`${bg}\`） | ${floor} | ${SETS.map(([t, a]) => contrast(sets[`${t}/${a}`][`--st-${fg}`], sets[`${t}/${a}`][`--st-${bg}`]).toFixed(2)).join(' | ')} |\n`
  }
  return md
}

const between = (text, a, b, inner) => {
  const i = text.indexOf(a)
  const j = text.indexOf(b)
  if (i < 0 || j < i) throw new Error(`docs/tokens.md has no ${a} … ${b}`)
  return `${text.slice(0, i + a.length)}\n${inner}\n${text.slice(j)}`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes('--doc')) {
  const doc = readFileSync(DOC_FILE, 'utf8')
  let next = between(doc, '<!-- tokens:start -->', '<!-- tokens:end -->', await docTables(docUses(doc)))
  next = between(next, '<!-- contrast:start -->', '<!-- contrast:end -->', await contrastTable(readFileSync(TOKENS_FILE, 'utf8')))
  writeFileSync(DOC_FILE, next)
  process.stdout.write(`written ${DOC_FILE}\n`)
  process.exit(0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const css = await tokensCss()
  if (process.argv.includes('--check')) {
    const same = readFileSync(TOKENS_FILE, 'utf8') === css
    process.stdout.write(same ? 'tokens.css is what tokens-data.mjs gives\n' : 'tokens.css differs from tokens-data.mjs: run node scripts/gen-tokens.mjs\n')
    process.exit(same ? 0 : 1)
  }
  writeFileSync(TOKENS_FILE, css)
  process.stdout.write(`written ${TOKENS_FILE}\n`)
}
