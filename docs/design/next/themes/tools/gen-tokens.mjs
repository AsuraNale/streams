// 由 tokens-data.mjs 生成 css/tokens.css，并把 README.md 里 <!-- tokens:start --> … <!-- tokens:end --> 之间换成映射表。
// 跑法（在仓库根目录）：node docs/design/next/themes/tools/gen-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES, ROLES, tokensOf, COMMON } from './tokens-data.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const block = (selector, rows, scheme) =>
  `${selector} {\n  color-scheme: ${scheme};\n${rows.map(([n, v]) => `  ${n}: ${v};`).join('\n')}\n}\n`

let css = `/* 生成的文件：tools/gen-tokens.mjs 由 tools/tokens-data.mjs 写出，别手改。
   三套主题 × 浅 / 深。选择器不只在 :root 上——设置页「主题」三张预览卡各自带 data-theme，就地套那一套。
   K2 落地时照这张表把值抄进 desktop/src/renderer/styles/tokens.css（名字一样）。 */

:root {
${COMMON.map(([n, v]) => `  ${n}: ${v};`).join('\n')}
}
`
for (const id of Object.keys(THEMES)) {
  const lightSel = id === 'precision' ? `:root, [data-theme="precision"]` : `[data-theme="${id}"]`
  css += `\n/* ${THEMES[id].name}（原型 ${THEMES[id].proto}） */\n`
  css += block(lightSel, tokensOf(id, 'light'), 'light')
  css += block(`[data-theme="${id}"][data-appearance="dark"]`, tokensOf(id, 'dark'), 'dark')
}
writeFileSync(join(root, 'css', 'tokens.css'), css)

// README 表
let md = ''
for (const id of Object.keys(THEMES)) {
  const L = tokensOf(id, 'light')
  const D = new Map(tokensOf(id, 'dark').map(([n, v]) => [n, v]))
  const r = ROLES[id]
  md += `\n#### ${THEMES[id].name}（\`data-theme="${id}"\`，原型 \`${THEMES[id].proto}\`）\n\n`
  md += `原型的九个变量：\n\n| 原型变量 | 浅色 | 深色 |\n|---|---|---|\n`
  const protoName = { paper: '--paper', bench: '--bench', panel: '--panel', well: '--well', ink: '--ink11', sub: '--sub11', accent: '--accent11', pick: '--pick', inverse: '--inverse11' }
  for (const k of Object.keys(protoName)) md += `| \`${protoName[k]}\` | \`${r.light[k]}\` | \`${r.dark[k]}\` |\n`
  md += `| \`--rule11\` | ink 12% | ink 12% |\n| \`--float11\` | \`0 6px 22px -13px #1a20302e\` | 同左（深色另算，见 --st-shadow-card） |\n`
  md += `\n映射到流息的 \`--st-*\`：\n\n| token | 从哪来 | 浅色 | 深色 |\n|---|---|---|---|\n`
  for (const [n, v, from] of L) md += `| \`${n}\` | ${from} | \`${v}\` | \`${D.get(n)}\` |\n`
}
md += `\n三套都一样的：${COMMON.map(([n, v]) => `\`${n}: ${v}\``).join(' · ')}\n`

const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const a = readme.indexOf('<!-- tokens:start -->')
const b = readme.indexOf('<!-- tokens:end -->')
if (a < 0 || b < a) throw new Error('README.md has no <!-- tokens:start --> … <!-- tokens:end --> block')
writeFileSync(readmePath, `${readme.slice(0, a)}<!-- tokens:start -->\n${md}\n${readme.slice(b)}`)
console.log('tokens.css + README tables written')
