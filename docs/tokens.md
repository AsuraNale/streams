# token 名单（`desktop/src/renderer/styles/tokens.css`）

> 2026-11-02 起的名单；**2026-11-10 v2 包 K2 换成三套新主题**（维护者 11-10 #6「定」：河蓝 · 素灰 · 夜间换掉）。值的唯一来源是 K1 设计稿的 `docs/design/next/themes/tools/tokens-data.mjs`（映射说明见 `docs/design/next/themes/README.md` 第五节）：`desktop/scripts/gen-tokens.mjs` 由它**生成** `tokens.css`（别手改；`--check` 核文件与数据一致），`--doc` 写本文件两块标记之间的表（「用在哪」一栏手写、重生成时保留）。

- **六组 = 三套主题 × 浅 / 深**：精密国际主义 `precision`（默认）· 澄明玻璃 `glass` · 研究对话 `research`，各有浅色、深色。页面在 `<html data-theme="…" data-appearance="light|dark">` 上说用哪组；选择器是 `[data-theme="<id>"]`（精密国际主义的浅色也是 `:root`）与 `[data-theme="<id>"][data-appearance="dark"]`，不绑在 `<html>` 上——设置页的三张主题卡各自带 `data-theme`，就地用那一套画缩略图。每组都写全全部名字。
- **外观**：`settings.json` 的 `appearance`：`light` · `dark` · `system`（默认，跟随 Windows 实时变）；生效的那组由主进程算（`desktop/src/main/theme.mjs resolveAppearance`）。窗口首帧底色 = 那组的 `--st-page`（`desktop/src/shared/themes.mjs THEME_PAGE`，六个值，`desktop/test/theme.test.mjs` 逐个核）。怎么换、旧设置怎么迁移见 `docs/desktop.md` §五「主题」。
- **名字按用途起，不按颜色**。页面与组件只写 `var(--st-…)`；别的样式文件里不写颜色（`desktop/test/kit.test.mjs`）。要新颜色：先改 `tokens-data.mjs`（设计稿），再跑生成。
- K2 新加的名字：`--st-selected`（选中的东西，K2 里一律用它）、`--st-focus`、`--st-shadow-card`、`--st-radius-key`、`--st-weight-body`、`--st-weight-display`、`--st-tracking-display`、`--st-weight-label`、`--st-icon-cap`、`--st-icon-join`、`--st-icon-weight`。三套的「手感」（直角 / 圆角、字重、图标线头）主要靠这些；各套自己的选中记号（精密国际主义的 3px 定位条、澄明玻璃的渐变光、研究对话的书签与下划线安静按钮）在 `desktop/src/renderer/styles/kit.css` 最后一节，颜色也只用 token。
- 字体：随包的 **Noto Sans SC** 可变字体（`desktop/src/renderer/fonts/NotoSansSC-VF.ttf`，SIL OFL 1.1，许可全文在同一文件夹，许可证页与 `THIRD-PARTY-NOTICES.txt` 都带），`styles/fonts.css` 经 app:// 加载。阅读窗口的页面是不加载任何东西的 data: 页，用系统的无衬线字。

## 名单

<!-- tokens:start -->

### 面

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-page` | --bench | `#F6F6F3` | `#151515` | `#F6F8FC` | `#16191F` | `#F7F7F3` | `#161A19` | 窗口底色（`BrowserWindow.backgroundColor` 也写这个值） |
| `--st-surface` | --paper | `#FCFCFA` | `#20201F` | `#FBFCFF` | `#22262E` | `#FDFCF9` | `#232724` | 卡片（库架、待看、提议卡、设置的每组）、输入框、左下角余量、分段控件选中的那一段 |
| `--st-surface-2` | --well | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 次要按钮底、灰提示框、提议卡的「改前」、你说的话的底、主题卡的底 |
| `--st-card-head` | --well（原型 .confirm-top） | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 卡片外框的抬头 |
| `--st-table-head` | --well | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 表头 |
| `--st-row-head` | --panel | `#F0F0ED` | `#1B1B1A` | `#EFF2F8` | `#1B1F26` | `#F1F2ED` | `#1C201E` | 行头 |
| `--st-selected` | --pick（新：选中的行、标签、条目） | `#E4E4E2` | `#353635` | `#E1E8F7` | `#303A50` | `#E2EAE5` | `#303E38` | 选中的东西：左栏当前的库与入口、当前标签、待看当前的卡、资料库当前的一条、设置里选中的卡；悬停也用它 |
| `--st-active-fill` | --pick | `#E4E4E2` | `#353635` | `#E1E8F7` | `#303A50` | `#E2EAE5` | `#303E38` | 同 `--st-selected`（旧名，K2 里选中一律用 `--st-selected`） |

### 线

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-border` | --rule11 = ink 12% | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` | 菜单的边、主题缩略图的边、只要一条细线的卡 |
| `--st-control-border` | ink 18%（原型控件无边，输入框要能看出边，自算） | `rgba(36, 36, 36, 0.18)` | `rgba(229, 229, 223, 0.18)` | `rgba(39, 51, 75, 0.18)` | `rgba(229, 229, 223, 0.18)` | `rgba(40, 60, 64, 0.18)` | `rgba(229, 229, 223, 0.18)` | 输入框的边、安静按钮的边、链接下划线、细滚动条 |
| `--st-divider` | --rule11 | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` | 库页标签下面那条线、设置里精密国际主义的组名下划线 |
| `--st-divider-soft` | ink 7%（自算） | `rgba(36, 36, 36, 0.07)` | `rgba(229, 229, 223, 0.07)` | `rgba(39, 51, 75, 0.07)` | `rgba(229, 229, 223, 0.07)` | `rgba(40, 60, 64, 0.07)` | `rgba(229, 229, 223, 0.07)` | 设置每一项之间、提议卡按钮上方的淡线 |

### 左栏（右栏同色）

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-sidebar` | --panel（左栏、右栏同色） | `#F0F0ED` | `#1B1B1A` | `#EFF2F8` | `#1B1F26` | `#F1F2ED` | `#1C201E` | 左栏底色（右栏也用它：设计稿两栏同色） |
| `--st-sidebar-text` | --ink11 | `#242424` | `#E5E5DF` | `#27334B` | `#E5E5DF` | `#283C40` | `#E5E5DF` | 左栏文字：入口、库名、设置 |
| `--st-sidebar-text-2` | --sub11 | `#555555` | `#A9ABA8` | `#53617A` | `#A9ABA8` | `#536466` | `#A9ABA8` | 左栏次要文字：品牌下方的 STREAMS、分组名「我的库」、库的待看数 |
| `--st-sidebar-divider` | --rule11 | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` | 品牌下面、「设置」上面的线 |
| `--st-sidebar-button` | --well | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 「新建库」那一行的底 |
| `--st-sidebar-button-border` | 原型 border-color: transparent | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | `transparent` | （K1 没有边：transparent，留着名字给以后的按钮） |
| `--st-sidebar-selected-title` | --ink11（选中项底是 --pick） | `#242424` | `#E5E5DF` | `#27334B` | `#E5E5DF` | `#283C40` | `#E5E5DF` | 左栏当前项的字（底是 `--st-selected`） |
| `--st-sidebar-selected-sub` | --sub11 | `#555555` | `#A9ABA8` | `#53617A` | `#A9ABA8` | `#536466` | `#A9ABA8` | 左栏当前项的第二行 |

### 文字

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-text` | --ink11 | `#242424` | `#E5E5DF` | `#27334B` | `#E5E5DF` | `#283C40` | `#E5E5DF` | 正文 |
| `--st-text-2` | --sub11 | `#555555` | `#A9ABA8` | `#53617A` | `#A9ABA8` | `#536466` | `#A9ABA8` | 副标题、说明（`.st-t-sub`） |
| `--st-text-3` | sub 往 bench 走 22%（原型没有，自算） | `#787878` | `#8B8D8B` | `#778297` | `#8C8E8D` | `#778485` | `#8C8E8B` | 更淡的说明（`.st-t-muted`）、卡片脚注 |
| `--st-text-dark-2` | --sub11 | `#555555` | `#A9ABA8` | `#53617A` | `#A9ABA8` | `#536466` | `#A9ABA8` | 条带里的步名等次要深色字 |
| `--st-line-todo` | 同 --st-text-3 | `#787878` | `#8B8D8B` | `#778297` | `#8C8E8D` | `#778485` | `#8C8E8B` | 没到的步之间的连线 |

### 强调色

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-accent` | --accent11 | `#363636` | `#C9CDCE` | `#495F98` | `#B2C5EF` | `#395D62` | `#B3D0C0` | 主按钮底、链接、当前标签的下划线（精密国际主义、研究对话）、当前项的定位条、进度条、品牌方块 |
| `--st-accent-hover` | accent 88% + ink（原型主按钮 :hover） | `#343434` | `#CCD0D0` | `#455A8F` | `#B8C9ED` | `#37595E` | `#B9D3C4` | 主按钮与链接悬停 |
| `--st-on-accent` | --inverse11 | `#FFFFFF` | `#191A19` | `#FFFFFF` | `#191A19` | `#FFFFFF` | `#191A19` | 强调色底上的字：主按钮、品牌方块的「流」、「推荐」标签、首次设置当前步的圆点 |
| `--st-on-accent-2` | inverse 78% + accent（自算） | `#D3D3D3` | `#404141` | `#D7DCE8` | `#3B4048` | `#D3DBDC` | `#3B423E` | 强调色底上的次要文字 |
| `--st-focus` | --accent11（新：焦点环，原型 --focus） | `#363636` | `#C9CDCE` | `#495F98` | `#B2C5EF` | `#395D62` | `#B3D0C0` | 焦点环（精密国际主义是虚线） |

### 状态

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-wait` | 琥珀（比河蓝深一档） | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | 等你看 / 等你决定：琥珀字、和主 Agent 聊的角标、待看数、「写给 AI 的话」标记 |
| `--st-wait-bg` | wait 12% + paper | `#EFE9DE` | `#3F382A` | `#EEE9E2` | `#413D37` | `#F0E9DD` | `#423E2E` | 琥珀提示框与标签的底 |
| `--st-wait-border` | wait 35% + paper | `#D6C4A8` | `#6E5B3B` | `#D5C4AB` | `#6F5F44` | `#D7C4A7` | `#705F3E` | 琥珀提示框与标签的细边（inset 1px） |
| `--st-done` | 绿（比河蓝深一档） | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | 已收藏 / 做完：绿字；提议卡「改后」的字 |
| `--st-done-bg` | done 12% + paper | `#E2EBE5` | `#2C3B35` | `#E1EBEA` | `#2E4041` | `#E3EBE5` | `#2F4139` | 绿标签的底、提议卡「改后」的底 |
| `--st-done-border` | 同 --st-done | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | 提议卡「改后」的细边 |
| `--st-danger` | 红 | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | 出错、危险操作（菜单里的删除项） |
| `--st-danger-bg` | danger 12% + paper | `#F2E5E2` | `#40312F` | `#F1E5E7` | `#42363B` | `#F3E5E1` | `#433733` | 出错提示的底 |
| `--st-step-todo` | --well（原型 .progress-line 没到的一段） | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 没到的小方块、进度条与余量条的槽 |
| `--st-step-done-past` | 同 --st-text-3 | `#787878` | `#8B8D8B` | `#778297` | `#8C8E8D` | `#778485` | `#8C8E8B` | 不是当前环节的已做完小方块 |
| `--st-accent-alt` | 紫（问库记号、图谱） | `#5B4FA8` | `#A79BE8` | `#5B4FA8` | `#A79BE8` | `#5B4FA8` | `#A79BE8` | 第二强调色：图谱、问库里的记号（不表示状态） |
| `--st-accent-alt-soft` | alt 12% + paper | `#E9E7F0` | `#36343F` | `#E8E7F5` | `#37394C` | `#EAE7EF` | `#383A43` | 第二强调色的底 |

### 五种抓取状态（方案 1.7：正常 · 没新内容 · 地址有问题 · 暂时失败 · 被拒绝）

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-fetch-ok` | 同 --st-done | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | `#21714F` | `#6CC9A6` | 正常 |
| `--st-fetch-ok-bg` | 同 --st-done-bg | `#E2EBE5` | `#2C3B35` | `#E1EBEA` | `#2E4041` | `#E3EBE5` | `#2F4139` | 正常的底 |
| `--st-fetch-empty` | --sub11 | `#555555` | `#A9ABA8` | `#53617A` | `#A9ABA8` | `#536466` | `#A9ABA8` | 没新内容 |
| `--st-fetch-empty-bg` | --well | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 没新内容的底 |
| `--st-fetch-gap` | 同 --st-wait | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | 地址有问题 |
| `--st-fetch-gap-bg` | 同 --st-wait-bg | `#EFE9DE` | `#3F382A` | `#EEE9E2` | `#413D37` | `#F0E9DD` | `#423E2E` | 地址有问题的底 |
| `--st-fetch-failed` | 同 --st-wait | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | `#8F5D10` | `#E3B464` | 暂时失败 |
| `--st-fetch-failed-bg` | 同 --st-wait-bg | `#EFE9DE` | `#3F382A` | `#EEE9E2` | `#413D37` | `#F0E9DD` | `#423E2E` | 暂时失败的底 |
| `--st-fetch-blocked` | 同 --st-danger | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | 被拒绝 |
| `--st-fetch-blocked-bg` | 同 --st-danger-bg | `#F2E5E2` | `#40312F` | `#F1E5E7` | `#42363B` | `#F3E5E1` | `#433733` | 被拒绝的底 |

### 图表

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-chart-against` | 同 --st-danger | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | `#A93A33` | `#E88A81` | 反向 / 负值 |
| `--st-chart-background` | --well | `#E9E9E6` | `#292928` | `#E9EDF6` | `#292F38` | `#ECECE5` | `#292E2A` | 图的底 |
| `--st-chart-gap` | 同 --st-text-3 | `#787878` | `#8B8D8B` | `#778297` | `#8C8E8D` | `#778485` | `#8C8E8B` | 缺口 |
| `--st-chart-1` | accent | `#363636` | `#C9CDCE` | `#495F98` | `#B2C5EF` | `#395D62` | `#B3D0C0` | 第一序列 |
| `--st-chart-2` | accent 往 paper 走 20% | `#5E5E5D` | `#A7AAAB` | `#6D7EAD` | `#95A5C8` | `#607D80` | `#96AEA1` | 第二序列 |
| `--st-chart-3` | 40% | `#858584` | `#858888` | `#909EC1` | `#7885A2` | `#879D9E` | `#798C82` | 第三序列 |
| `--st-chart-4` | 60% | `#ADADAC` | `#646565` | `#B4BDD6` | `#5C667B` | `#AFBCBD` | `#5D6B62` | 第四序列 |
| `--st-chart-5` | 80% | `#D4D4D3` | `#424342` | `#D7DDEA` | `#3F4655` | `#D6DCDB` | `#404943` | 第五序列 |

### 库的颜色（不随主题变，只分浅深）

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-lib-river` | 不随主题变（docs/tokens.md 原值） | `#1F6E8C` | `#74B7D3` | `#1F6E8C` | `#74B7D3` | `#1F6E8C` | `#74B7D3` | 颜色为 `river` 的库的图标方块 |
| `--st-lib-violet` | 同上 | `#5B4FA8` | `#A79BE8` | `#5B4FA8` | `#A79BE8` | `#5B4FA8` | `#A79BE8` | `violet` 的库 |
| `--st-lib-green` | 同上 | `#237A5B` | `#6CC9A6` | `#237A5B` | `#6CC9A6` | `#237A5B` | `#6CC9A6` | `green` 的库 |
| `--st-lib-muted` | 同上 | `#56646F` | `#9CAAB5` | `#56646F` | `#9CAAB5` | `#56646F` | `#9CAAB5` | `muted` 的库 |
| `--st-on-lib` | 同上 | `#FFFFFF` | `#0F161B` | `#FFFFFF` | `#0F161B` | `#FFFFFF` | `#0F161B` | 库图标方块上的字 |

### 衬底与阴影

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-scrim` | ink 32% | `rgba(36, 36, 36, 0.32)` | `rgba(0, 0, 0, 0.55)` | `rgba(39, 51, 75, 0.32)` | `rgba(0, 0, 0, 0.55)` | `rgba(40, 60, 64, 0.32)` | `rgba(0, 0, 0, 0.55)` | 对话框后面的暗层 |
| `--st-shadow-menu` | 菜单与对话框（自算） | `0 1px 2px rgba(36, 36, 36, 0.06), 0 12px 32px -12px rgba(36, 36, 36, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` | `0 1px 2px rgba(39, 51, 75, 0.06), 0 12px 32px -12px rgba(39, 51, 75, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` | `0 1px 2px rgba(40, 60, 64, 0.06), 0 12px 32px -12px rgba(40, 60, 64, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` | 菜单与对话框的阴影 |
| `--st-shadow-card` | --float11（新：卡片浮起） | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` | 卡片浮起：库架的卡、待看的卡、提议卡、设置的每组、左下角余量 |

### 形状

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-radius` | 原型 --key-radius 一系（新值） | `0px` | `0px` | `16px` | `16px` | `9px` | `9px` | 卡片、对话框、菜单 |
| `--st-radius-s` | 按钮、标签 | `0px` | `0px` | `12px` | `12px` | `6px` | `6px` | 按钮、标签 |
| `--st-radius-xs` | 小角标 | `0px` | `0px` | `8px` | `8px` | `3px` | `3px` | 小角标 |
| `--st-radius-key` | 新：主按钮（玻璃更圆、研究对话 3px） | `0px` | `0px` | `20px` | `20px` | `3px` | `3px` | 主按钮的圆角（澄明玻璃是胶囊、研究对话是 3px 的页角） |

### 字体与字重（维护者 11-10：Noto Sans SC）

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-font` | 原型 --copy：数字走等宽、其余 Noto Sans SC | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | 全部文字：随包的 Noto Sans SC（`styles/fonts.css`），数字走本机等宽字（Cascadia Mono / Consolas，没有就用 Noto 的数字） |
| `--st-font-mono` | 原型 --data | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | 路径、地址、分数、余量的百分比 |
| `--st-fs-body` | 原型 --reading-size | `14px` | `14px` | `15px` | `15px` | `14px` | `14px` | 正文 |
| `--st-weight-body` | 新：深色字重减一点（原型 --dark-copy 360） | `400` | `360` | `400` | `360` | `400` | `360` | 正文字重（深色减一点，免得发虚） |
| `--st-weight-display` | 新：原型 --display-weight（深色减 40） | `650` | `610` | `600` | `560` | `600` | `560` | 标题字重：页面标题、卡片标题、品牌名 |
| `--st-tracking-display` | 新：原型 --display-spacing | `-0.035em` | `-0.035em` | `0.025em` | `0.025em` | `-0.02em` | `-0.02em` | 标题字距 |
| `--st-weight-label` | 新：原型 --label-weight | `550` | `550` | `600` | `600` | `500` | `500` | 标签字重：导航、按钮、标签、表头 |

### 图标

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-icon-cap` | 新：图标线头（原型 --cap） | `butt` | `butt` | `round` | `round` | `round` | `round` | 图标线头 |
| `--st-icon-join` | 新：图标拐角（原型 --join） | `miter` | `miter` | `round` | `round` | `round` | `round` | 图标拐角 |
| `--st-icon-weight` | 新：图标线宽（原型 --icon-weight） | `1.6` | `1.6` | `1.65` | `1.65` | `1.65` | `1.65` | 图标线宽 |

### 六组都一样的

| token 名 | 从哪来（K1 映射） | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 | 用在哪 |
|---|---|---|---|---|---|---|---|---|
| `--st-fs-small` | 三套共用 | `12px` | `12px` | `12px` | `12px` | `12px` | `12px` | 说明 |
| `--st-fs-tiny` | 三套共用 | `11px` | `11px` | `11px` | `11px` | `11px` | `11px` | 角标、分组名 |
| `--st-fs-title` | 三套共用 | `22px` | `22px` | `22px` | `22px` | `22px` | `22px` | 页面标题（顶栏、库页库名） |
| `--st-fs-heading` | 三套共用 | `26px` | `26px` | `26px` | `26px` | `26px` | `26px` | （留着：K1 的大标题；卡片标题、对话框标题各自写 16–19px） |
| `--st-lh` | 三套共用 | `1.65` | `1.65` | `1.65` | `1.65` | `1.65` | `1.65` | 行高 |
| `--st-control-h` | 三套共用 | `38px` | `38px` | `38px` | `38px` | `38px` | `38px` | 按钮、输入框高 |
| `--st-gutter` | 三套共用 | `12px` | `12px` | `12px` | `12px` | `12px` | `12px` | （K1 主区不再留白框的间距；留着名字） |
| `--st-col-sidebar` | 三套共用 | `232px` | `232px` | `232px` | `232px` | `232px` | `232px` | 侧栏宽 |
| `--st-col-panel` | 三套共用 | `380px` | `380px` | `380px` | `380px` | `380px` | `380px` | 右侧面板宽 |
| `--st-step` | 三套共用 | `8px` | `8px` | `8px` | `8px` | `8px` | `8px` | 小方块 |
| `--st-step-gap` | 三套共用 | `3px` | `3px` | `3px` | `3px` | `3px` | `3px` | 小方块之间 |

<!-- tokens:end -->

## 对比度（WCAG 2，从 `tokens.css` 算）

`desktop/test/theme.test.mjs` 用同一组字 / 底（`desktop/test/support/contrast-pairs.mjs`）从 `tokens.css` 读值重算，任何一格低于门槛测试就红。门槛：正文、按钮字、状态字 ≥ 4.5，次要文字 ≥ 3（契约 K2）。K1 设计稿第六节另有在真页面上取色算的表（取真实元素的计算颜色），两张表的字 / 底不完全一样，数对得上。

<!-- contrast:start -->

| 字 / 底 | 门槛 | 精密 · 浅 | 精密 · 深 | 玻璃 · 浅 | 玻璃 · 深 | 研究 · 浅 | 研究 · 深 |
|---|---|---|---|---|---|---|---|
| 正文 / 主区底（`text` / `page`） | 4.5 | 14.34 | 14.44 | 11.89 | 13.92 | 10.80 | 13.88 |
| 正文 / 卡片（`text` / `surface`） | 4.5 | 15.11 | 12.89 | 12.32 | 11.99 | 11.30 | 11.97 |
| 正文 / 左栏（`sidebar-text` / `sidebar`） | 4.5 | 13.60 | 13.63 | 11.27 | 13.07 | 10.31 | 13.03 |
| 正文 / 选中底（左栏当前的库）（`sidebar-selected-title` / `selected`） | 4.5 | 12.19 | 9.60 | 10.28 | 8.99 | 9.46 | 8.87 |
| 正文 / 选中底（待看当前的卡、当前标签）（`text` / `selected`） | 4.5 | 12.19 | 9.60 | 10.28 | 8.99 | 9.46 | 8.87 |
| 正文 / 灰底（提示框、改前）（`text` / `surface-2`） | 4.5 | 12.76 | 11.51 | 10.78 | 10.66 | 9.77 | 10.93 |
| 次要 / 主区底（`text-2` / `page`） | 3 | 6.89 | 7.89 | 5.88 | 7.61 | 5.78 | 7.59 |
| 次要 / 卡片（`text-2` / `surface`） | 3 | 7.26 | 7.05 | 6.09 | 6.56 | 6.05 | 6.54 |
| 次要 / 左栏（`sidebar-text-2` / `sidebar`） | 3 | 6.53 | 7.45 | 5.58 | 7.14 | 5.52 | 7.12 |
| 次要 / 灰底（`text-2` / `surface-2`） | 3 | 6.13 | 6.29 | 5.33 | 5.83 | 5.23 | 5.98 |
| 次要 / 选中底（`text-2` / `selected`） | 3 | 5.86 | 5.25 | 5.09 | 4.92 | 5.07 | 4.85 |
| 更淡的说明 / 主区底（`text-3` / `page`） | 3 | 4.08 | 5.46 | 3.64 | 5.34 | 3.61 | 5.32 |
| 更淡的说明 / 卡片（`text-3` / `surface`） | 3 | 4.30 | 4.88 | 3.77 | 4.60 | 3.77 | 4.58 |
| 主按钮字 / 强调色（`on-accent` / `accent`） | 4.5 | 12.08 | 10.89 | 6.22 | 10.08 | 7.20 | 10.56 |
| 次要按钮字 / 按钮底（`text` / `surface-2`） | 4.5 | 12.76 | 11.51 | 10.78 | 10.66 | 9.77 | 10.93 |
| 链接、安静按钮字 / 卡片（`accent` / `surface`） | 4.5 | 11.76 | 10.18 | 6.07 | 8.76 | 7.02 | 9.16 |
| 琥珀字 / 琥珀浅底（`wait` / `wait-bg`） | 4.5 | 4.65 | 6.06 | 4.65 | 5.64 | 4.65 | 5.60 |
| 绿字 / 绿浅底（`done` / `done-bg`） | 4.5 | 4.87 | 5.91 | 4.88 | 5.47 | 4.88 | 5.45 |
| 红字 / 红浅底（`danger` / `danger-bg`） | 4.5 | 5.11 | 4.94 | 5.12 | 4.60 | 5.12 | 4.57 |
| 紫字 / 紫浅底（`accent-alt` / `accent-alt-soft`） | 4.5 | 5.48 | 4.94 | 5.49 | 4.59 | 5.49 | 4.58 |

<!-- contrast:end -->

说明：`--st-text-3`（更淡的说明）浅色只到 3.4–4.1，过「次要 ≥ 3」、不过 4.5，只用在不承载信息的地方（脚注、占位）；要当正文用就换 `--st-text-2`。
