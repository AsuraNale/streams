# token 名单（`desktop/src/renderer/styles/tokens.css`）

> 2026-11-02。名字照外壳组件库的结构与分组（前缀 `--st-`），值照产品方案网页那套（`方案/src/head.html` 第 10–20 行：bg · surface · sunk · sunk2 · ink · muted · faint · rule · river · green · amber · red · violet · shadow）。`desktop/test/kit.test.mjs` 核：这张表与 `tokens.css` 名单一致、别的样式文件里不写颜色。
>
> 2026-11-04：三套已实装（方案 5.6 D5）——**河蓝 river**（`:root`，原来那套，值一个没改）、**素灰 paper**（`:root[data-theme="paper"]`）、**夜间 night**（`:root[data-theme="night"]`）。后两套只覆写和河蓝不同的值，表里写「同河蓝」的就是没覆写。名字三套一样。用哪套：`settings.json` 的 `theme`，默认只在 `desktop/src/main/theme.mjs` 的 `DEFAULT_THEME` 一处（现在是 `river`，维护者 周五选完只改这一行）；怎么换、第一帧怎么保证见 `docs/desktop.md` §五「主题」。并排截图：`docs/shots/themes/index.html`。`desktop/test/theme.test.mjs` 核：三套的块、`color-scheme`、窗口底色（`src/shared/themes.mjs THEME_PAGE`）与 `--st-page` 一致、下面「对比度」一节的十二组。

规则：
- 名字按用途起，不按颜色；一个颜色可以被多个名字用（例如 river 同时是 `--st-sidebar` 和 `--st-accent`）。
- 页面与组件只写 `var(--st-…)`；要新颜色先在这里加一行，再在 `tokens.css` 加一行，三套都要有值（没覆写的就是河蓝的）。
- 「云织里对应的名」是外壳来源（云织桌面版 `--yz-*`）里的同位 token，便于对照；云织没有的写「新」。
- 11-04 加了一个名字 `--st-on-accent`（强调色底上的字）：夜间的强调色是浅的河蓝，主按钮上原来用的 `--st-surface`（白）就看不清了。河蓝、素灰里它就是白，界面和改之前一样。

## 侧栏与强调色

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-sidebar` | `#1F6E8C`（river） | `#E9EEF2`（sunk） | `#16303C`（river-soft 暗色） | `--yz-sidebar` | 侧栏底色。选 river 而不是 ink：河蓝是产品方案的主色，侧栏是唯一大面积用它的地方，整个窗口就有了一个身份色；选 ink 会像任何一个深色面板。换成 ink 只改这一行。 |
| `--st-accent` | `#1F6E8C`（river） | 同河蓝 | `#74B7D3`（river 暗色） | `--yz-accent` | 主按钮底、链接、当前标签下划线、进行中的小方块、焦点环 |
| `--st-accent-hover` | `#1A5E77`（river 加深一档，自算） | 同河蓝 | `#97C9DE`（river 暗色变亮一档，自算） | `--yz-accent-hover` | 主按钮与链接悬停 |
| `--st-on-accent` | `#FFFFFF`（river-ink） | 同河蓝 | `#0F161B`（river-ink 暗色） | 新 | 强调色底上的字：主按钮、「推荐」标签、首次设置当前步的圆点、问库回答的记号（11-04 加：夜间的强调色变浅，白字就看不清了；河蓝、素灰与改之前同为白） |
| `--st-on-accent-2` | `#E1EEF4`（river-soft） | 同河蓝 | `#16303C`（river-soft 暗色） | `--yz-on-accent-2` | 强调色底上的次要文字 |

## 文字

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-text` | `#16222B`（ink） | 同河蓝 | `#E3E9ED`（ink） | `--yz-text` | 正文 |
| `--st-text-2` | `#56646F`（muted） | 同河蓝 | `#9CAAB5`（muted） | `--yz-text-2` | 副标题、说明（`.st-t-sub`） |
| `--st-text-3` | `#8794A0`（faint） | 同河蓝 | `#6F7D88`（faint） | `--yz-text-3` | 更淡的说明（`.st-t-muted`）、卡片脚注 |
| `--st-text-dark-2` | `#56646F`（muted） | 同河蓝 | `#9CAAB5`（muted） | `--yz-text-dark-2` | 条带里的步名等次要深色字 |
| `--st-line-todo` | `#8794A0`（faint） | 同河蓝 | `#6F7D88`（faint） | `--yz-line-todo` | 没到的步之间的连线、已回答卡片的顶边 |

## 线与面

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-page` | `#F2F5F7`（bg） | 同河蓝 | `#0F161B`（bg） | `--yz-page` | 窗口底色（`BrowserWindow.backgroundColor` 也写这个值） |
| `--st-surface` | `#FFFFFF`（surface） | 同河蓝 | `#171F26`（surface） | `--yz-surface` | 主区白框、卡片、按钮、侧栏当前项的白卡 |
| `--st-surface-2` | `#E9EEF2`（sunk） | 同河蓝 | `#121A20`（sunk） | `--yz-surface-2` | 顶栏底、次要按钮悬停、灰提示框底 |
| `--st-card-head` | `#E9EEF2`（sunk） | 同河蓝 | `#121A20`（sunk） | `--yz-card-head` | 卡片外框的抬头 |
| `--st-table-head` | `#DFE6EB`（sunk2） | 同河蓝 | `#1B252D`（sunk2） | `--yz-table-head` | 表头 |
| `--st-row-head` | `#E9EEF2`（sunk） | 同河蓝 | `#121A20`（sunk） | `--yz-row-head` | 行头 |
| `--st-border` | `#D5DEE4`（rule） | 同河蓝 | `#28343D`（rule） | `--yz-border` | 主区白框、卡片、菜单、对话框的边 |
| `--st-control-border` | `#D5DEE4`（rule） | 同河蓝 | `#28343D`（rule） | `--yz-control-border` | 按钮、输入框的边；细滚动条 |
| `--st-divider` | `#D5DEE4`（rule） | 同河蓝 | `#28343D`（rule） | `--yz-divider` | 设置页各部分之间、卡片抬头下面的分隔线 |
| `--st-divider-soft` | `#DFE6EB`（sunk2） | 同河蓝 | `#1B252D`（sunk2） | `--yz-divider-soft` | 更淡的分隔线（卡片脚注上方） |

## 侧栏

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-sidebar-text` | `#FFFFFF`（river-ink） | `#16222B`（ink） | `#E3E9ED`（ink） | `--yz-sidebar-text` | 侧栏文字、九个入口 |
| `--st-sidebar-text-2` | `#E1EEF4`（river-soft） | `#56646F`（muted） | `#9CAAB5`（muted） | `--yz-sidebar-text-2` | 侧栏次要文字：品牌下方的 STREAMS、「未打开库」、设置按钮 |
| `--st-sidebar-divider` | `rgba(255,255,255,.22)` | `rgba(22,34,43,.14)` | `rgba(255,255,255,.14)` | `--yz-sidebar-divider` | 品牌下面的分隔线、侧栏备注上方的线（白加透明度：跟着 `--st-sidebar` 变） |
| `--st-sidebar-button` | `rgba(255,255,255,.12)` | `rgba(22,34,43,.05)` | `rgba(255,255,255,.06)` | `--yz-sidebar-button` | 侧栏里的按钮与库名那一行的底 |
| `--st-sidebar-button-border` | `rgba(255,255,255,.35)` | `rgba(22,34,43,.24)` | `rgba(255,255,255,.24)` | `--yz-sidebar-button-border` | 侧栏按钮的边 |
| `--st-sidebar-selected-title` | `#1F6E8C`（river） | 同河蓝 | `#74B7D3`（river 暗色，当前入口的暗色卡上） | `--yz-sidebar-selected-title` | 当前入口白卡上的字 |
| `--st-sidebar-selected-sub` | `#56646F`（muted） | 同河蓝 | `#9CAAB5`（muted） | `--yz-sidebar-selected-sub` | 当前入口白卡上的第二行 |

## 状态

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-wait` | `#9A6412`（amber） | `#956112`（amber 加深一档，自算：在 amber-soft 上 4.65 : 1） | `#E3B464`（amber） | `--yz-wait` | 等你看 / 等你决定：琥珀字、卡片顶边、侧栏角标 |
| `--st-wait-bg` | `#FBF0DA`（amber-soft） | 同河蓝 | `#2A2316`（amber-soft） | `--yz-wait-bg` | 琥珀提示框与标签的底 |
| `--st-wait-border` | `#E7CC95`（amber-rule） | 同河蓝 | `#5B4722`（amber-rule） | `--yz-wait-border` | 琥珀提示框与标签的边 |
| `--st-done` | `#237A5B`（green） | `#22765A`（green 加深一档，自算：在 green-soft 上 4.68 : 1） | `#6CC9A6`（green） | `--yz-done` | 已收藏 / 做完：绿字、对勾、最后一步的圆点 |
| `--st-done-bg` | `#DDF1E8`（green-soft） | 同河蓝 | `#143026`（green-soft） | `--yz-done-bg` | 绿标签的底 |
| `--st-done-border` | `#237A5B`（green） | `#22765A` | `#6CC9A6`（green） | `--yz-done-border` | 绿标签的边（方案没有 green-rule，用 green 本色 1px） |
| `--st-danger` | `#B23E36`（red） | 同河蓝 | `#E88A81`（red） | 新 | 出错、危险操作（菜单里的删除项） |
| `--st-danger-bg` | `#F8E2DF`（red-soft） | 同河蓝 | `#2E1B1A`（red-soft） | 新 | 出错提示的底 |
| `--st-active-fill` | `#E1EEF4`（river-soft） | 同河蓝 | `#16303C`（river-soft） | `--yz-active-fill` | 进行中的小方块的底、菜单项悬停 |
| `--st-step-todo` | `#DFE6EB`（sunk2） | 同河蓝 | `#28343D`（rule 自算） | `--yz-step-todo` | 没到的小方块、下载进度条的槽 |
| `--st-step-done-past` | `#8794A0`（faint） | 同河蓝 | `#6F7D88`（faint） | `--yz-step-done-past` | 不是当前环节的已做完小方块 |
| `--st-accent-alt` | `#5B4FA8`（violet） | 同河蓝 | `#A79BE8`（violet） | 新 | 第二强调色：图谱、问库里的记号（不表示状态） |
| `--st-accent-alt-soft` | `#E8E5F6`（violet-soft） | 同河蓝 | `#241F3C`（violet-soft） | 新 | 第二强调色的底 |

## 五种抓取状态（方案 1.7：正常 · 没新内容 · 地址有问题 · 暂时失败 · 被拒绝）

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-fetch-ok` | `#237A5B`（green） | `#22765A` | `#6CC9A6`（green） | 新 | 正常 |
| `--st-fetch-ok-bg` | `#DDF1E8`（green-soft） | 同河蓝 | `#143026`（green-soft） | 新 | 正常的底 |
| `--st-fetch-empty` | `#56646F`（muted） | 同河蓝 | `#9CAAB5`（muted） | 新 | 没新内容 |
| `--st-fetch-empty-bg` | `#E9EEF2`（sunk） | 同河蓝 | `#121A20`（sunk） | 新 | 没新内容的底 |
| `--st-fetch-gap` | `#9A6412`（amber） | `#956112` | `#E3B464`（amber） | 新 | 地址有问题 |
| `--st-fetch-gap-bg` | `#FBF0DA`（amber-soft） | 同河蓝 | `#2A2316`（amber-soft） | 新 | 地址有问题的底 |
| `--st-fetch-failed` | `#9A6412`（amber） | `#956112` | `#E3B464`（amber） | 新 | 暂时失败 |
| `--st-fetch-failed-bg` | `#FBF0DA`（amber-soft） | 同河蓝 | `#2A2316`（amber-soft） | 新 | 暂时失败的底 |
| `--st-fetch-blocked` | `#B23E36`（red） | 同河蓝 | `#E88A81`（red） | 新 | 被拒绝 |
| `--st-fetch-blocked-bg` | `#F8E2DF`（red-soft） | 同河蓝 | `#2E1B1A`（red-soft） | 新 | 被拒绝的底 |

## 图表

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-chart-against` | `#B23E36`（red） | 同河蓝 | `#E88A81`（red） | `--yz-chart-against` | 反向 / 负值 |
| `--st-chart-background` | `#DFE6EB`（sunk2） | 同河蓝 | `#1B252D`（sunk2） | `--yz-chart-background` | 图的底 |
| `--st-chart-gap` | `#8794A0`（faint） | 同河蓝 | `#6F7D88`（faint） | `--yz-chart-gap` | 缺口 |
| `--st-chart-1` | `#1F6E8C`（river） | 同河蓝 | `#74B7D3`（river 暗色） | `--yz-chart-1` | 第一序列 |
| `--st-chart-2` | `#4A8AA3`（river 变浅，自算） | 同河蓝 | `#619AB0`（river 暗色往 surface 走 20%，自算） | `--yz-chart-2` | 第二序列 |
| `--st-chart-3` | `#78A7BA`（自算） | 同河蓝 | `#4F7A8E`（40%，自算） | `--yz-chart-3` | 第三序列 |
| `--st-chart-4` | `#A6C4D1`（自算） | 同河蓝 | `#3C5C6B`（60%，自算） | `--yz-chart-4` | 第四序列 |
| `--st-chart-5` | `#D3E1E8`（自算） | 同河蓝 | `#2A3D49`（80%，自算） | `--yz-chart-5` | 第五序列 |

## 库的颜色（v2 包 F，11-05）

每个库在登记表里有一个颜色名（包 A，核心 `LIBRARY_COLORS`：`river` · `violet` · `green` · `muted`，只存名字不存值）；界面把它画成库的图标方块（左栏「我的库」、库架的卡片、库头：`kit/library-sections.js LibraryMark`，class `st-lib-mark--<名>`），方块上的字用 `--st-on-lib`。河蓝与素灰用方案的四个色、白字；夜间用暗色板里浅的那四个、暗色 river-ink 字（同主按钮的做法）。方块上的字三套都 ≥ 4.5（`desktop/test/theme.test.mjs`「库的颜色」一条从 `tokens.css` 重算，也核四个名和核心的 `LIBRARY_COLORS` 一致）。

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-lib-river` | `#1F6E8C`（river） | 同河蓝 | `#74B7D3`（river 暗色） | —（新） | 颜色为 `river` 的库的图标方块；白字 5.73，夜间暗字 8.22 |
| `--st-lib-violet` | `#5B4FA8`（violet） | 同河蓝 | `#A79BE8`（violet 暗色） | —（新） | `violet` 的库；6.71 / 7.38 |
| `--st-lib-green` | `#237A5B`（green） | 同河蓝 | `#6CC9A6`（green 暗色） | —（新） | `green` 的库；5.24 / 9.16 |
| `--st-lib-muted` | `#56646F`（muted） | 同河蓝 | `#9CAAB5`（muted 暗色） | —（新） | `muted` 的库；6.09 / 7.67 |
| `--st-on-lib` | `#FFFFFF`（river-ink） | 同河蓝 | `#0F161B`（river-ink 暗色） | —（新） | 库图标方块上的字 |

## 衬底与阴影

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-scrim` | `rgba(22,34,43,.38)`（ink 加透明度） | 同河蓝 | `rgba(0,0,0,.55)` | `--yz-scrim` | 对话框后面的暗层 |
| `--st-shadow-menu` | `0 1px 2px rgba(22,34,43,.06), 0 8px 24px rgba(22,34,43,.07)`（方案的 shadow） | 同河蓝 | `0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35)` | `--yz-shadow-menu` | 菜单与对话框的阴影 |

## 字体与字号（维护者 11-02 定：沿用外壳）

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-font` | `'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif` | 同河蓝 | 同河蓝 | `--yz-font` | 全部文字 |
| `--st-font-mono` | `'Cascadia Mono', Consolas, ui-monospace, monospace` | 同河蓝 | 同河蓝 | 新 | 以后显示路径、地址、日志 |
| `--st-fs-body` | `13px` | 同河蓝 | 同河蓝 | `--yz-fs-body` | 正文 |
| `--st-fs-small` | `12px` | 同河蓝 | 同河蓝 | `--yz-fs-small` | 说明 |
| `--st-fs-tiny` | `11px` | 同河蓝 | 同河蓝 | `--yz-fs-tiny` | 角标、分组名 |
| `--st-fs-title` | `15px` | 同河蓝 | 同河蓝 | `--yz-fs-title` | 页面标题、侧栏品牌名 |
| `--st-fs-heading` | `16px` | 同河蓝 | 同河蓝 | `--yz-fs-heading` | 大标题、对话框标题 |
| `--st-lh` | `1.55` | 同河蓝 | 同河蓝 | `--yz-lh` | 行高 |

## 形状与尺寸

| token 名 | 河蓝 river（默认） | 素灰 paper | 夜间 night | 云织里对应的名 | 用在哪 |
|---|---|---|---|---|---|
| `--st-radius` | `4px` | 同河蓝 | 同河蓝 | `--yz-radius` | 主区白框、卡片、菜单 |
| `--st-radius-s` | `3px` | 同河蓝 | 同河蓝 | `--yz-radius-s` | 按钮、标签 |
| `--st-radius-xs` | `2px` | 同河蓝 | 同河蓝 | `--yz-radius-xs` | 小角标 |
| `--st-control-h` | `40px` | 同河蓝 | 同河蓝 | `--yz-control-h` | 按钮、输入框高 |
| `--st-gutter` | `12px` | 同河蓝 | 同河蓝 | `--yz-gutter` | 主区与侧栏、面板之间 |
| `--st-col-sidebar` | `232px` | 同河蓝 | 同河蓝 | `--yz-col-sidebar` | 侧栏宽 |
| `--st-col-panel` | `404px` | 同河蓝 | 同河蓝 | `--yz-col-panel` | 右侧面板宽（含两侧间距） |
| `--st-step` | `8px` | 同河蓝 | 同河蓝 | `--yz-step` | 小方块 |
| `--st-step-gap` | `3px` | 同河蓝 | 同河蓝 | `--yz-step-gap` | 小方块之间 |

## 附录：夜间用的暗色源值（11-04 已实装为 `night`）

来自 `方案/src/head.html` 第 25–44 行（`prefers-color-scheme: dark` 与 `[data-theme="dark"]` 同一套）。`tokens.css` 的 `:root[data-theme="night"]` 就是把下面的暗色值按上表河蓝那一栏的映射填进同名 token：

| 方案名 | 亮色 | 暗色 |
|---|---|---|
| bg | `#F2F5F7` | `#0F161B` |
| surface | `#FFFFFF` | `#171F26` |
| sunk | `#E9EEF2` | `#121A20` |
| sunk2 | `#DFE6EB` | `#1B252D` |
| ink | `#16222B` | `#E3E9ED` |
| muted | `#56646F` | `#9CAAB5` |
| faint | `#8794A0` | `#6F7D88` |
| rule | `#D5DEE4` | `#28343D` |
| river | `#1F6E8C` | `#74B7D3` |
| river-soft | `#E1EEF4` | `#16303C` |
| river-ink | `#FFFFFF` | `#0F161B` |
| green | `#237A5B` | `#6CC9A6` |
| green-soft | `#DDF1E8` | `#143026` |
| amber | `#9A6412` | `#E3B464` |
| amber-soft | `#FBF0DA` | `#2A2316` |
| amber-rule | `#E7CC95` | `#5B4722` |
| red | `#B23E36` | `#E88A81` |
| red-soft | `#F8E2DF` | `#2E1B1A` |
| violet | `#5B4FA8` | `#A79BE8` |
| violet-soft | `#E8E5F6` | `#241F3C` |
| shadow | `0 1px 2px rgba(22,34,43,.06), 0 8px 24px rgba(22,34,43,.07)` | `0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35)` |

暗色下另算的（都在上表「夜间」一栏，标「自算」）：`--st-accent-hover` 变亮一档（`#97C9DE`，而不是像河蓝那样变深）；侧栏底用暗色的 river-soft `#16303C`（不是暗色 river `#74B7D3`），字用暗色 ink，所以侧栏的白加透明度照样能用（透明度调低一点）；当前入口的白卡变成暗色 surface 卡、字用暗色 river；主按钮底是浅的暗色 river，字用 river-ink `#0F161B`（新 token `--st-on-accent`）；五个图表序列从暗色 river 往暗色 surface 走 0 / 20 / 40 / 60 / 80%（河蓝是往白走）；没到的小方块用 rule（sunk2 在暗色 surface 上看不出来）；衬底与阴影用黑加透明度。

## 对比度（WCAG 2，11-04 算）

契约列的十二组字 / 底，三套各算一次（`desktop/test/theme.test.mjs` 从 `tokens.css` 读值重算，测试输出里有 `# contrast` 一行）：

| 字 / 底 | 河蓝 | 素灰 | 夜间 |
|---|---|---|---|
| text / page | 14.78 | 14.78 | 14.90 |
| text / surface | 16.18 | 16.18 | 13.60 |
| text-2 / surface | 6.09 | 6.09 | 7.01 |
| text-2 / page | 5.56 | 5.56 | 7.67 |
| sidebar-text / sidebar | 5.73 | 13.85 | 11.26 |
| sidebar-text-2 / sidebar | 4.84 | 5.21 | 5.80 |
| sidebar-selected-title / surface | 5.73 | 5.73 | 7.50 |
| on-accent / accent（主按钮字） | 5.73 | 5.73 | 8.22 |
| wait / wait-bg | **4.42** | 4.65 | 8.13 |
| done / done-bg | **4.45** | 4.68 | 7.12 |
| danger / danger-bg | 4.66 | 4.66 | 6.51 |
| fetch-blocked / fetch-blocked-bg | 4.66 | 4.66 | 6.51 |

素灰与夜间十二组都 ≥ 4.5（最低：素灰 4.65 wait / wait-bg，夜间 5.80 sidebar-text-2 / sidebar）。**河蓝有两组不到 4.5**：方案原来的琥珀 `#9A6412` 在琥珀浅底 `#FBF0DA` 上 4.42、绿 `#237A5B` 在绿浅底 `#DDF1E8` 上 4.45——这是改动之前就有的值，契约又写了河蓝「值一个不改」，两条打架；**维护者 11-04 定：河蓝保持原样，这两组列为已知例外**（`theme.test.mjs` 的 `RIVER_BELOW`）。以后要河蓝也过，把 `:root` 的 `--st-wait` / `--st-fetch-gap` / `--st-fetch-failed` 改成 `#956112`、`--st-done` / `--st-done-border` / `--st-fetch-ok` 改成 `#22765A`（就是素灰现在用的两个值，各 4.65 / 4.68），再把 `theme.test.mjs` 的 `RIVER_BELOW` 清空。
