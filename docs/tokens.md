# token 名单（`desktop/src/renderer/styles/tokens.css`）

> 2026-11-02。名字照外壳组件库的结构与分组（前缀 `--st-`），值照产品方案网页那套（`方案/src/head.html` 第 10–20 行：bg · surface · sunk · sunk2 · ink · muted · faint · rule · river · green · amber · red · violet · shadow）。周五在真界面上并排三套时，换的只是这张表「值」一栏，名字不动。`desktop/test/kit.test.mjs` 核：这张表与 `tokens.css` 名单一致、别的样式文件里不写颜色。

规则：
- 名字按用途起，不按颜色；一个颜色可以被多个名字用（例如 river 同时是 `--st-sidebar` 和 `--st-accent`）。
- 页面与组件只写 `var(--st-…)`；要新颜色先在这里加一行，再在 `tokens.css` 加一行。
- 「云织里对应的名」是外壳来源（云织桌面版 `--yz-*`）里的同位 token，便于对照；云织没有的写「新」。

## 侧栏与强调色

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-sidebar` | `#1F6E8C`（river） | `--yz-sidebar` | 侧栏底色。选 river 而不是 ink：河蓝是产品方案的主色，侧栏是唯一大面积用它的地方，整个窗口就有了一个身份色；选 ink 会像任何一个深色面板。换成 ink 只改这一行。 |
| `--st-accent` | `#1F6E8C`（river） | `--yz-accent` | 主按钮底、链接、当前标签下划线、进行中的小方块、焦点环 |
| `--st-accent-hover` | `#1A5E77`（river 加深一档，自算） | `--yz-accent-hover` | 主按钮与链接悬停 |
| `--st-on-accent-2` | `#E1EEF4`（river-soft） | `--yz-on-accent-2` | 强调色底上的次要文字 |

## 文字

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-text` | `#16222B`（ink） | `--yz-text` | 正文 |
| `--st-text-2` | `#56646F`（muted） | `--yz-text-2` | 副标题、说明（`.st-t-sub`） |
| `--st-text-3` | `#8794A0`（faint） | `--yz-text-3` | 更淡的说明（`.st-t-muted`）、卡片脚注 |
| `--st-text-dark-2` | `#56646F`（muted） | `--yz-text-dark-2` | 条带里的步名等次要深色字 |
| `--st-line-todo` | `#8794A0`（faint） | `--yz-line-todo` | 没到的步之间的连线、已回答卡片的顶边 |

## 线与面

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-page` | `#F2F5F7`（bg） | `--yz-page` | 窗口底色（`BrowserWindow.backgroundColor` 也写这个值） |
| `--st-surface` | `#FFFFFF`（surface） | `--yz-surface` | 主区白框、卡片、按钮、侧栏当前项的白卡 |
| `--st-surface-2` | `#E9EEF2`（sunk） | `--yz-surface-2` | 顶栏底、次要按钮悬停、灰提示框底 |
| `--st-card-head` | `#E9EEF2`（sunk） | `--yz-card-head` | 卡片外框的抬头 |
| `--st-table-head` | `#DFE6EB`（sunk2） | `--yz-table-head` | 表头 |
| `--st-row-head` | `#E9EEF2`（sunk） | `--yz-row-head` | 行头 |
| `--st-border` | `#D5DEE4`（rule） | `--yz-border` | 主区白框、卡片、菜单、对话框的边 |
| `--st-control-border` | `#D5DEE4`（rule） | `--yz-control-border` | 按钮、输入框的边；细滚动条 |
| `--st-divider` | `#D5DEE4`（rule） | `--yz-divider` | 设置页各部分之间、卡片抬头下面的分隔线 |
| `--st-divider-soft` | `#DFE6EB`（sunk2） | `--yz-divider-soft` | 更淡的分隔线（卡片脚注上方） |

## 侧栏

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-sidebar-text` | `#FFFFFF`（river-ink） | `--yz-sidebar-text` | 侧栏文字、九个入口 |
| `--st-sidebar-text-2` | `#E1EEF4`（river-soft） | `--yz-sidebar-text-2` | 侧栏次要文字：品牌下方的 STREAMS、「未打开库」、设置按钮 |
| `--st-sidebar-divider` | `rgba(255,255,255,.22)` | `--yz-sidebar-divider` | 品牌下面的分隔线、侧栏备注上方的线（白加透明度：跟着 `--st-sidebar` 变） |
| `--st-sidebar-button` | `rgba(255,255,255,.12)` | `--yz-sidebar-button` | 侧栏里的按钮与库名那一行的底 |
| `--st-sidebar-button-border` | `rgba(255,255,255,.35)` | `--yz-sidebar-button-border` | 侧栏按钮的边 |
| `--st-sidebar-selected-title` | `#1F6E8C`（river） | `--yz-sidebar-selected-title` | 当前入口白卡上的字 |
| `--st-sidebar-selected-sub` | `#56646F`（muted） | `--yz-sidebar-selected-sub` | 当前入口白卡上的第二行 |

## 状态

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-wait` | `#9A6412`（amber） | `--yz-wait` | 等你看 / 等你决定：琥珀字、卡片顶边、侧栏角标 |
| `--st-wait-bg` | `#FBF0DA`（amber-soft） | `--yz-wait-bg` | 琥珀提示框与标签的底 |
| `--st-wait-border` | `#E7CC95`（amber-rule） | `--yz-wait-border` | 琥珀提示框与标签的边 |
| `--st-done` | `#237A5B`（green） | `--yz-done` | 已收藏 / 做完：绿字、对勾、最后一步的圆点 |
| `--st-done-bg` | `#DDF1E8`（green-soft） | `--yz-done-bg` | 绿标签的底 |
| `--st-done-border` | `#237A5B`（green） | `--yz-done-border` | 绿标签的边（方案没有 green-rule，用 green 本色 1px） |
| `--st-danger` | `#B23E36`（red） | 新 | 出错、危险操作（菜单里的删除项） |
| `--st-danger-bg` | `#F8E2DF`（red-soft） | 新 | 出错提示的底 |
| `--st-active-fill` | `#E1EEF4`（river-soft） | `--yz-active-fill` | 进行中的小方块的底、菜单项悬停 |
| `--st-step-todo` | `#DFE6EB`（sunk2） | `--yz-step-todo` | 没到的小方块、下载进度条的槽 |
| `--st-step-done-past` | `#8794A0`（faint） | `--yz-step-done-past` | 不是当前环节的已做完小方块 |
| `--st-accent-alt` | `#5B4FA8`（violet） | 新 | 第二强调色：图谱、问库里的记号（不表示状态） |
| `--st-accent-alt-soft` | `#E8E5F6`（violet-soft） | 新 | 第二强调色的底 |

## 五种抓取状态（方案 1.7：正常 · 没新内容 · 地址有问题 · 暂时失败 · 被拒绝）

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-fetch-ok` | `#237A5B`（green） | 新 | 正常 |
| `--st-fetch-ok-bg` | `#DDF1E8`（green-soft） | 新 | 正常的底 |
| `--st-fetch-empty` | `#56646F`（muted） | 新 | 没新内容 |
| `--st-fetch-empty-bg` | `#E9EEF2`（sunk） | 新 | 没新内容的底 |
| `--st-fetch-gap` | `#9A6412`（amber） | 新 | 地址有问题 |
| `--st-fetch-gap-bg` | `#FBF0DA`（amber-soft） | 新 | 地址有问题的底 |
| `--st-fetch-failed` | `#9A6412`（amber） | 新 | 暂时失败 |
| `--st-fetch-failed-bg` | `#FBF0DA`（amber-soft） | 新 | 暂时失败的底 |
| `--st-fetch-blocked` | `#B23E36`（red） | 新 | 被拒绝 |
| `--st-fetch-blocked-bg` | `#F8E2DF`（red-soft） | 新 | 被拒绝的底 |

## 图表

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-chart-against` | `#B23E36`（red） | `--yz-chart-against` | 反向 / 负值 |
| `--st-chart-background` | `#DFE6EB`（sunk2） | `--yz-chart-background` | 图的底 |
| `--st-chart-gap` | `#8794A0`（faint） | `--yz-chart-gap` | 缺口 |
| `--st-chart-1` | `#1F6E8C`（river） | `--yz-chart-1` | 第一序列 |
| `--st-chart-2` | `#4A8AA3`（river 变浅，自算） | `--yz-chart-2` | 第二序列 |
| `--st-chart-3` | `#78A7BA`（自算） | `--yz-chart-3` | 第三序列 |
| `--st-chart-4` | `#A6C4D1`（自算） | `--yz-chart-4` | 第四序列 |
| `--st-chart-5` | `#D3E1E8`（自算） | `--yz-chart-5` | 第五序列 |

## 衬底与阴影

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-scrim` | `rgba(22,34,43,.38)`（ink 加透明度） | `--yz-scrim` | 对话框后面的暗层 |
| `--st-shadow-menu` | `0 1px 2px rgba(22,34,43,.06), 0 8px 24px rgba(22,34,43,.07)`（方案的 shadow） | `--yz-shadow-menu` | 菜单与对话框的阴影 |

## 字体与字号（维护者 11-02 定：沿用外壳）

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-font` | `'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif` | `--yz-font` | 全部文字 |
| `--st-font-mono` | `'Cascadia Mono', Consolas, ui-monospace, monospace` | 新 | 以后显示路径、地址、日志 |
| `--st-fs-body` | `13px` | `--yz-fs-body` | 正文 |
| `--st-fs-small` | `12px` | `--yz-fs-small` | 说明 |
| `--st-fs-tiny` | `11px` | `--yz-fs-tiny` | 角标、分组名 |
| `--st-fs-title` | `15px` | `--yz-fs-title` | 页面标题、侧栏品牌名 |
| `--st-fs-heading` | `16px` | `--yz-fs-heading` | 大标题、对话框标题 |
| `--st-lh` | `1.55` | `--yz-lh` | 行高 |

## 形状与尺寸

| token 名 | 值 | 云织里对应的名 | 用在哪 |
|---|---|---|---|
| `--st-radius` | `4px` | `--yz-radius` | 主区白框、卡片、菜单 |
| `--st-radius-s` | `3px` | `--yz-radius-s` | 按钮、标签 |
| `--st-radius-xs` | `2px` | `--yz-radius-xs` | 小角标 |
| `--st-control-h` | `40px` | `--yz-control-h` | 按钮、输入框高 |
| `--st-gutter` | `12px` | `--yz-gutter` | 主区与侧栏、面板之间 |
| `--st-col-sidebar` | `232px` | `--yz-col-sidebar` | 侧栏宽 |
| `--st-col-panel` | `404px` | `--yz-col-panel` | 右侧面板宽（含两侧间距） |
| `--st-step` | `8px` | `--yz-step` | 小方块 |
| `--st-step-gap` | `3px` | `--yz-step-gap` | 小方块之间 |

## 附录：第二套（暗色）值，今天不实装

来自 `方案/src/head.html` 第 25–44 行（`prefers-color-scheme: dark` 与 `[data-theme="dark"]` 同一套）。实装时只换下面这些源值，按上表的映射填进同名 token：

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

暗色下要另算的：`--st-accent-hover`（river 变亮一档而不是变深）、`--st-sidebar-*` 的白加透明度（侧栏底变成 river 的暗色值 `#74B7D3` 时，白字就不对了——到时侧栏文字应改用 river-ink `#0F161B`）、五个图表序列。
