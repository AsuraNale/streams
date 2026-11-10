# 流息 · 三套主题设计稿（工作包 K1）

> 玄翎团队 2026-11-10。依据：维护者 11-10 的话（契约 `docs/checks/2026-11-10-wp-k1/contract.md` 引了原文）、`docs/feedback/2026-11-10-maintainer-v2-trial.md` #1–#6 与各「定」段。
> 来源：原样副本 `docs/design/next/themes-source/`（第十一轮开发交接，没改动）。本目录是在复制的部分上改成流息的版本。
> **这是设计稿，不是应用代码**：`desktop/`、`core/`、`wording/`、`installer/`、`tests/` 一个字没动。落进应用是 K2，维护者 看过本稿后另立契约。

## 一、怎么看

- 双击 `index.html`（file:// 离线可开；脚本、样式、字体都走相对路径，不引用任何外网资源）。
- 顶上一条深灰的**设计稿切换条**（不属于界面）：主题 × 外观 × 画面 × 左下角余量。默认 = **精密国际主义 + 跟随系统**。
- 给脚本用：URL 参数或页面上的函数，两种都行，结果一样。

| 参数 | 取值 | 默认 |
|---|---|---|
| `screen` | `shelf` 库架 · `chat` 和主 Agent 聊 · `inbox` 库页·待看 · `library` 库页·资料库 · `ask` 库页·问库 · `settings` 设置 · `queue` 排队 | `shelf` |
| `theme` | `precision` 精密国际主义 · `glass` 澄明玻璃 · `research` 研究对话 | `precision` |
| `appearance` | `system` 跟随系统 · `light` 浅色 · `dark` 深色 | `system` |
| `quota` | `claude` · `codex` · `api` · `unreadable` · `none`（见第四节） | `claude` |
| `tab` | 右栏：`progress` 进度 · `decide` 等你决定 · `detail` 详情 · `files` 文件 | 随画面（库架、设置、排队 = 进度；其余 = 详情） |
| `panel` | `open` · `closed`（右栏收起） | `open` |
| `bar` | `0` = 收掉设计稿切换条（截图用，窗口里只剩应用本身） | 显示 |
| `menu` | `1` = 右栏「文件」里第一篇笔记的右键菜单打开 | 关 |

例：`index.html?screen=queue&theme=glass&appearance=dark&bar=0`。页面里：`window.streamsDesign.set({ screen, theme, appearance, quota, tab, panel, menu })` 返回渲染后的状态；`window.streamsDesign.state` 读当前状态（`appearance` 是解析后的浅 / 深，`appearancePref` 是选的那一项）。

## 二、文件

| 文件 | 是什么 |
|---|---|
| `index.html` | 入口：切换条 + 三栏骨架（左栏 · 主区 · 右栏） |
| `css/fonts.css` | `@font-face`：直接引用 `../../themes-source/shared/fonts/NotoSansSC-VF.ttf`（= 本目录的 `../themes-source/shared/fonts/NotoSansSC-VF.ttf`，不另复制）；数字走本机等宽字（只用 `local()`） |
| `css/tokens.css` | **生成的**：三套主题 × 浅 / 深的 `--st-*` token（名字照 `docs/tokens.md`），由 `tools/gen-tokens.mjs` 从 `tools/tokens-data.mjs` 写出 |
| `css/app.css` | 三栏与各部件，只写 `var(--st-*)`，不写颜色 |
| `css/themes.css` | 三套主题各自的形状与选中反馈（定位条 / 渐变光 / 书签），颜色也只用 token |
| `css/design-bar.css` | 设计稿切换条（固定中性灰，不跟主题变） |
| `js/icons.js` | 三套图标（路径抄自原型各主题的 edition.js，缺的几个照同一笔法补） |
| `js/data.js` | 示例数据：流息的三个库、条目、提议卡（数字都是示意） |
| `js/app.js` | 渲染 7 个画面与右栏四个标签；URL 参数与 `window.streamsDesign` |
| `tools/tokens-data.mjs` · `tools/gen-tokens.mjs` | token 数据与生成器（也写本文第五节的表） |
| `tools/contrast.mjs` · `tools/contrast-result.json` | 对比度实算（写本文第六节的表）与每一格的原始颜色 |
| `tools/shoot.mjs` | 截图：42 + 7 张到 `docs/shots/2026-11-10-k1/`；`--extra` 另截右栏各标签、收起、余量各状态、右键菜单 |
| `tools/check.mjs` | 自查（见第十节）；失败退出码 1 |

截图：`docs/shots/2026-11-10-k1/`，`<画面>-<主题>-<外观>.png`（1440×900，42 张）+ `<画面>-precision-light-1280.png`（1280×800，7 张）。另有 `docs/shots/2026-11-10-k1-extra/`（不算进那 49 张）：右栏四个标签、四个画面下的详情、收起的右栏、右键菜单、余量五种状态、三套深色下的文件树。

## 三、七个画面（契约 K1.1）

| # | 画面 | 画了什么 |
|---|---|---|
| 1 | 库架 `shelf` | 左栏方案 B：库架 · 和主 Agent 聊（角标 3 = 等你定的事）· 我的库（三个库，带待看数、状态：在跑 / 排队中 · 第 2 位 / 琥珀点 = 有个来源出问题）· 新建库；左下角余量在「设置」上面。主区三张库卡 + 「新建库 · 和主 Agent 聊着建」卡 |
| 2 | 和主 Agent 聊 `chat` | 顶上「等你定的事 · 3」一条；一段对话（你的话、它查过的三行、它的回答）+ 一张提议卡：改「流息Test」：加 2 个来源，为什么、改前 / 改后（注明由流息的代码算出，不是主 Agent 写的）、确认 · 改一下 · 不要 |
| 3 | 库页 · 待看 `inbox` | 库头（图标、名字、在追、正在跑）+ 五个标签（概览 · 待看 23 · 资料库 · 问库 · 来源与要求）；待看卡片：标题、新 / 后续、来源日期、这是什么、相关度 / 实质分数与理由、收藏 · 放弃… · 稍后 · 这一条的记录；第二张有「这一条里有写给 AI 的话，已忽略」 |
| 4 | 库页 · 资料库 `library` | **两栏**：左列表（搜索、已收藏 / 我写的 / 抓到的 / 待规范、列表 / 图谱、按主题分组的 8 篇），右阅读（已收藏、编辑、打开原文、更多；这是什么、正文）。原来的第三栏（主题、来源、分数、文件、链到这里的、同一来源的）画进右栏「详情」 |
| 5 | 库页 · 问库 `ask` | 一问一答，答案每句后带出处编号 1 2 3，下面列出处；「记到想补的主题」「这个回答哪里不对」；输入框说明「只用这个库的条目回答 · 想改…会转给主 Agent」 |
| 6 | 设置 `settings` | 连接 / 主 Agent / 库三组折成一行一项（本稿不改它们）；**外观与语言**：主题三选一（三张卡各用自己那套 token 画缩略图，精密国际主义标「默认」）、外观 浅色 / 深色 / 跟随系统、语言；**软件**：关于（由 Starry Digital 开发）、许可证与致谢表里有「Noto Sans SC（界面字体）· SIL OFL 1.1」一行 |
| 7 | 排队 `queue` | 反馈 #1 的情形，三处说法：**库页**（安省中小企业补助 · 概览）横幅「排队中 · 第 2 位：前面是「流息Test」…它跑完，这个库自动接着跑，不用再点「开始」」，库头按钮是灰的「已排上」；**对话框**「跑一轮」：「「流息Test」正在补跑错过的那一轮；这个库排在它后面，跑完会自动接着跑。」；**右栏进度**：在跑的流息Test 到哪一步、调用 61 / 上限 200、排队先后 1 流息Test 2 安省中小企业补助（标「这个库」） |

示例库名「流息Test」「安省中小企业补助」「Rust 异步生态」；时间照反馈 #1 换成东部时间（UTC 14:53 开机 = 09:53，错过的定时 = 08:30 那一档）。

## 四、右栏与左下角余量

**右栏四个标签：进度 · 等你决定 · 详情 · 文件**，右上角按钮收起成 52px 的一条（四个图标 + 角标，点一下展开）。

| 标签 | 画了什么 |
|---|---|
| 进度 | 所有库：谁在跑（流息Test，补跑错过的那一轮，09:53 开始）、到哪一步（自检 ✓ 抓取 ✓ 去重 ✓ 打分 进行中 · 摘要 · 完成）、调用 61 / 上限 200；排队的先后；下次定时（三个库）；最近几轮（含昨晚被取消的那一轮：94 次调用后停，23 条进了待看） |
| 等你决定 | 所有库待确认的提议卡、新建议卡，每条写是哪个库、在哪里、点了去那里 |
| 详情 | 随主区变：待看 = 选中条目每道关的分数与理由、核验（有没有写给 AI 的话）、来源；资料库 = 这一篇的主题、来源、分数、文件、链到这里的、同一来源的；问库 = 答案引用的笔记与「这次用了什么」；和主 Agent 聊 = 这一轮查过的东西与提的卡；排队 = 为什么排队；库架、设置 = 一句说明（没有选中的东西） |
| 文件 | 「讲给人听的结构」（反馈 #3）：库名 + 在资源管理器中显示；**笔记（8）按主题分组**（MCP 安全 3 · Agent 框架 3 · 评测 2），点一篇在资料库标签里读，**右键**：用 Obsidian 打开 · 在资源管理器中显示；待看（23）点了去待看；**这个库的要求与来源**点了去「来源与要求」标签（不显示文件名、不提供直接打开）；**程序记录（不用动）默认折叠**，展开只有一句说明和「在资源管理器中显示」（不列里面的文件名：其中一个文件名本身是界面禁词） |

**左下角余量**（在「设置」上面，只显示**当前连接**的）：

| `quota=` | 样子 |
|---|---|
| `claude` | 「套餐已用 · 截至 10:16」+ 5 小时 5%（14:30 重置）、7 天 11%（11-13 16:00 重置）两条 |
| `codex` | 同上，只有 7 天 28%（11-11 12:11 重置）一条 |
| `api` | 厂商有余额接口：「余额 ¥ 41.20 · 截至 10:16」 |
| `unreadable` | 读不到：**一行灰字「余量暂时读不到」** |
| `none` | API 而厂商没有余额接口：**整块不显示** |

读不到选「一行灰字」而不是整块不显示，理由：Claude Code / Codex 这两种连接平时是有数的，读不到时整块消失，看起来像界面坏了，也和「API 本来就没有余额接口」分不出来；一行灰字不报错、不打断，悬停说明「下次调用时再读」。API 无接口则从来没有数，整块不显示才对（#4「定」：没有的不显示）。标签里不写品牌词；悬停时说是哪条连接，只用「连接你电脑上的 Claude Code」「连接你电脑上的 Codex」原句。

## 五、tokens 映射表

原型每套主题用九个变量（`--paper --bench --panel --well --ink11 --sub11 --accent11 --pick --inverse11`，加上 `--rule11 = ink 12%` 与 `--float11` 阴影），出自 `themes-source/shared/round11/workbench.css`。下面把它们对到流息现有的 `--st-*`（`docs/tokens.md`），K2 照表落地。表由 `tools/gen-tokens.mjs` 从 `tools/tokens-data.mjs` 生成，和 `css/tokens.css` 同出一处。

要点：

- **面**：主区底 `--st-page` = `--bench`；卡片 `--st-surface` = `--paper`；次要按钮、灰提示框 `--st-surface-2` = `--well`；左栏和右栏同一个 `--st-sidebar` = `--panel`（原型两栏同色）。
- **选中**：原型的 `--pick` 是选中行、当前标签、悬停的底。流息原来用 `--st-active-fill`（河蓝浅底）做这件事，这里两者同值；另加一个新名 `--st-selected`，K2 里选中一律用它（名字说用途）。
- **流息有、原型没有的**：状态色（等你看 / 已收藏 / 出错 / 第二强调色、五种抓取状态）。原型是单色系，没有琥珀 / 绿 / 红。取值：色相沿用流息现有的琥珀、绿、红、紫；**浅色**的琥珀、绿、红各比河蓝深一档（`#8F5D10` `#21714F` `#A93A33`），保证在浅底上 ≥ 4.5；**深色**用夜间那套原值；浅底一律 = 状态色按比例混进这套主题的 `--paper`（浅 12%、深 16%），所以每套主题的琥珀浅底都带自己的纸色，不会像贴上去的。`--st-text-3`（更淡的说明）原型没有，取 `--sub11` 往 `--bench` 走 20–22%。
- **库的颜色**（`--st-lib-*`）不随主题变：它是库的身份色，核心只存名字（river / violet / green / muted），值沿用 `docs/tokens.md`。
- **新 token**（表里「从哪来」写了「新」的）：`--st-selected`、`--st-focus`、`--st-shadow-card`、`--st-radius-key`、`--st-weight-body`、`--st-weight-display`、`--st-tracking-display`、`--st-weight-label`、`--st-icon-cap`、`--st-icon-join`、`--st-icon-weight`。形状、字重、图标线头三套不同，是三套主题「手感」的主要来源，所以也做成 token。
- 原型深色下的 ink / sub / inverse 三套共用（`.r11.r11[data-appearance=dark]`），这里照抄，所以三套深色的正文色一样，差别在底色和强调色。

<!-- tokens:start -->

#### 精密国际主义（`data-theme="precision"`，原型 `precision11`）

原型的九个变量：

| 原型变量 | 浅色 | 深色 |
|---|---|---|
| `--paper` | `#FCFCFA` | `#20201F` |
| `--bench` | `#F6F6F3` | `#151515` |
| `--panel` | `#F0F0ED` | `#1B1B1A` |
| `--well` | `#E9E9E6` | `#292928` |
| `--ink11` | `#242424` | `#E5E5DF` |
| `--sub11` | `#555555` | `#A9ABA8` |
| `--accent11` | `#363636` | `#C9CDCE` |
| `--pick` | `#E4E4E2` | `#353635` |
| `--inverse11` | `#FFFFFF` | `#191A19` |
| `--rule11` | ink 12% | ink 12% |
| `--float11` | `0 6px 22px -13px #1a20302e` | 同左（深色另算，见 --st-shadow-card） |

映射到流息的 `--st-*`：

| token | 从哪来 | 浅色 | 深色 |
|---|---|---|---|
| `--st-page` | --bench | `#F6F6F3` | `#151515` |
| `--st-surface` | --paper | `#FCFCFA` | `#20201F` |
| `--st-surface-2` | --well | `#E9E9E6` | `#292928` |
| `--st-card-head` | --well（原型 .confirm-top） | `#E9E9E6` | `#292928` |
| `--st-table-head` | --well | `#E9E9E6` | `#292928` |
| `--st-row-head` | --panel | `#F0F0ED` | `#1B1B1A` |
| `--st-selected` | --pick（新：选中的行、标签、条目） | `#E4E4E2` | `#353635` |
| `--st-active-fill` | --pick | `#E4E4E2` | `#353635` |
| `--st-border` | --rule11 = ink 12% | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-control-border` | ink 18%（原型控件无边，输入框要能看出边，自算） | `rgba(36, 36, 36, 0.18)` | `rgba(229, 229, 223, 0.18)` |
| `--st-divider` | --rule11 | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-divider-soft` | ink 7%（自算） | `rgba(36, 36, 36, 0.07)` | `rgba(229, 229, 223, 0.07)` |
| `--st-sidebar` | --panel（左栏、右栏同色） | `#F0F0ED` | `#1B1B1A` |
| `--st-sidebar-text` | --ink11 | `#242424` | `#E5E5DF` |
| `--st-sidebar-text-2` | --sub11 | `#555555` | `#A9ABA8` |
| `--st-sidebar-divider` | --rule11 | `rgba(36, 36, 36, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-sidebar-button` | --well | `#E9E9E6` | `#292928` |
| `--st-sidebar-button-border` | 原型 border-color: transparent | `transparent` | `transparent` |
| `--st-sidebar-selected-title` | --ink11（选中项底是 --pick） | `#242424` | `#E5E5DF` |
| `--st-sidebar-selected-sub` | --sub11 | `#555555` | `#A9ABA8` |
| `--st-text` | --ink11 | `#242424` | `#E5E5DF` |
| `--st-text-2` | --sub11 | `#555555` | `#A9ABA8` |
| `--st-text-3` | sub 往 bench 走 22%（原型没有，自算） | `#787878` | `#8B8D8B` |
| `--st-text-dark-2` | --sub11 | `#555555` | `#A9ABA8` |
| `--st-line-todo` | 同 --st-text-3 | `#787878` | `#8B8D8B` |
| `--st-accent` | --accent11 | `#363636` | `#C9CDCE` |
| `--st-accent-hover` | accent 88% + ink（原型主按钮 :hover） | `#343434` | `#CCD0D0` |
| `--st-on-accent` | --inverse11 | `#FFFFFF` | `#191A19` |
| `--st-on-accent-2` | inverse 78% + accent（自算） | `#D3D3D3` | `#404141` |
| `--st-focus` | --accent11（新：焦点环，原型 --focus） | `#363636` | `#C9CDCE` |
| `--st-wait` | 琥珀（比河蓝深一档） | `#8F5D10` | `#E3B464` |
| `--st-wait-bg` | wait 12% + paper | `#EFE9DE` | `#3F382A` |
| `--st-wait-border` | wait 35% + paper | `#D6C4A8` | `#6E5B3B` |
| `--st-done` | 绿（比河蓝深一档） | `#21714F` | `#6CC9A6` |
| `--st-done-bg` | done 12% + paper | `#E2EBE5` | `#2C3B35` |
| `--st-done-border` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-danger` | 红 | `#A93A33` | `#E88A81` |
| `--st-danger-bg` | danger 12% + paper | `#F2E5E2` | `#40312F` |
| `--st-step-todo` | --well（原型 .progress-line 没到的一段） | `#E9E9E6` | `#292928` |
| `--st-step-done-past` | 同 --st-text-3 | `#787878` | `#8B8D8B` |
| `--st-accent-alt` | 紫（问库记号、图谱） | `#5B4FA8` | `#A79BE8` |
| `--st-accent-alt-soft` | alt 12% + paper | `#E9E7F0` | `#36343F` |
| `--st-fetch-ok` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-fetch-ok-bg` | 同 --st-done-bg | `#E2EBE5` | `#2C3B35` |
| `--st-fetch-empty` | --sub11 | `#555555` | `#A9ABA8` |
| `--st-fetch-empty-bg` | --well | `#E9E9E6` | `#292928` |
| `--st-fetch-gap` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-gap-bg` | 同 --st-wait-bg | `#EFE9DE` | `#3F382A` |
| `--st-fetch-failed` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-failed-bg` | 同 --st-wait-bg | `#EFE9DE` | `#3F382A` |
| `--st-fetch-blocked` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-fetch-blocked-bg` | 同 --st-danger-bg | `#F2E5E2` | `#40312F` |
| `--st-chart-against` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-chart-background` | --well | `#E9E9E6` | `#292928` |
| `--st-chart-gap` | 同 --st-text-3 | `#787878` | `#8B8D8B` |
| `--st-chart-1` | accent | `#363636` | `#C9CDCE` |
| `--st-chart-2` | accent 往 paper 走 20% | `#5E5E5D` | `#A7AAAB` |
| `--st-chart-3` | 40% | `#858584` | `#858888` |
| `--st-chart-4` | 60% | `#ADADAC` | `#646565` |
| `--st-chart-5` | 80% | `#D4D4D3` | `#424342` |
| `--st-lib-river` | 不随主题变（docs/tokens.md 原值） | `#1F6E8C` | `#74B7D3` |
| `--st-lib-violet` | 同上 | `#5B4FA8` | `#A79BE8` |
| `--st-lib-green` | 同上 | `#237A5B` | `#6CC9A6` |
| `--st-lib-muted` | 同上 | `#56646F` | `#9CAAB5` |
| `--st-on-lib` | 同上 | `#FFFFFF` | `#0F161B` |
| `--st-scrim` | ink 32% | `rgba(36, 36, 36, 0.32)` | `rgba(0, 0, 0, 0.55)` |
| `--st-shadow-menu` | 菜单与对话框（自算） | `0 1px 2px rgba(36, 36, 36, 0.06), 0 12px 32px -12px rgba(36, 36, 36, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` |
| `--st-shadow-card` | --float11（新：卡片浮起） | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` |
| `--st-radius` | 原型 --key-radius 一系（新值） | `0px` | `0px` |
| `--st-radius-s` | 按钮、标签 | `0px` | `0px` |
| `--st-radius-xs` | 小角标 | `0px` | `0px` |
| `--st-radius-key` | 新：主按钮（玻璃更圆、研究对话 3px） | `0px` | `0px` |
| `--st-font` | 原型 --copy：数字走等宽、其余 Noto Sans SC | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` |
| `--st-font-mono` | 原型 --data | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` |
| `--st-fs-body` | 原型 --reading-size | `14px` | `14px` |
| `--st-weight-body` | 新：深色字重减一点（原型 --dark-copy 360） | `400` | `360` |
| `--st-weight-display` | 新：原型 --display-weight（深色减 40） | `650` | `610` |
| `--st-tracking-display` | 新：原型 --display-spacing | `-0.035em` | `-0.035em` |
| `--st-weight-label` | 新：原型 --label-weight | `550` | `550` |
| `--st-icon-cap` | 新：图标线头（原型 --cap） | `butt` | `butt` |
| `--st-icon-join` | 新：图标拐角（原型 --join） | `miter` | `miter` |
| `--st-icon-weight` | 新：图标线宽（原型 --icon-weight） | `1.6` | `1.6` |

#### 澄明玻璃（`data-theme="glass"`，原型 `glass11`）

原型的九个变量：

| 原型变量 | 浅色 | 深色 |
|---|---|---|
| `--paper` | `#FBFCFF` | `#22262E` |
| `--bench` | `#F6F8FC` | `#16191F` |
| `--panel` | `#EFF2F8` | `#1B1F26` |
| `--well` | `#E9EDF6` | `#292F38` |
| `--ink11` | `#27334B` | `#E5E5DF` |
| `--sub11` | `#53617A` | `#A9ABA8` |
| `--accent11` | `#495F98` | `#B2C5EF` |
| `--pick` | `#E1E8F7` | `#303A50` |
| `--inverse11` | `#FFFFFF` | `#191A19` |
| `--rule11` | ink 12% | ink 12% |
| `--float11` | `0 6px 22px -13px #1a20302e` | 同左（深色另算，见 --st-shadow-card） |

映射到流息的 `--st-*`：

| token | 从哪来 | 浅色 | 深色 |
|---|---|---|---|
| `--st-page` | --bench | `#F6F8FC` | `#16191F` |
| `--st-surface` | --paper | `#FBFCFF` | `#22262E` |
| `--st-surface-2` | --well | `#E9EDF6` | `#292F38` |
| `--st-card-head` | --well（原型 .confirm-top） | `#E9EDF6` | `#292F38` |
| `--st-table-head` | --well | `#E9EDF6` | `#292F38` |
| `--st-row-head` | --panel | `#EFF2F8` | `#1B1F26` |
| `--st-selected` | --pick（新：选中的行、标签、条目） | `#E1E8F7` | `#303A50` |
| `--st-active-fill` | --pick | `#E1E8F7` | `#303A50` |
| `--st-border` | --rule11 = ink 12% | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-control-border` | ink 18%（原型控件无边，输入框要能看出边，自算） | `rgba(39, 51, 75, 0.18)` | `rgba(229, 229, 223, 0.18)` |
| `--st-divider` | --rule11 | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-divider-soft` | ink 7%（自算） | `rgba(39, 51, 75, 0.07)` | `rgba(229, 229, 223, 0.07)` |
| `--st-sidebar` | --panel（左栏、右栏同色） | `#EFF2F8` | `#1B1F26` |
| `--st-sidebar-text` | --ink11 | `#27334B` | `#E5E5DF` |
| `--st-sidebar-text-2` | --sub11 | `#53617A` | `#A9ABA8` |
| `--st-sidebar-divider` | --rule11 | `rgba(39, 51, 75, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-sidebar-button` | --well | `#E9EDF6` | `#292F38` |
| `--st-sidebar-button-border` | 原型 border-color: transparent | `transparent` | `transparent` |
| `--st-sidebar-selected-title` | --ink11（选中项底是 --pick） | `#27334B` | `#E5E5DF` |
| `--st-sidebar-selected-sub` | --sub11 | `#53617A` | `#A9ABA8` |
| `--st-text` | --ink11 | `#27334B` | `#E5E5DF` |
| `--st-text-2` | --sub11 | `#53617A` | `#A9ABA8` |
| `--st-text-3` | sub 往 bench 走 22%（原型没有，自算） | `#778297` | `#8C8E8D` |
| `--st-text-dark-2` | --sub11 | `#53617A` | `#A9ABA8` |
| `--st-line-todo` | 同 --st-text-3 | `#778297` | `#8C8E8D` |
| `--st-accent` | --accent11 | `#495F98` | `#B2C5EF` |
| `--st-accent-hover` | accent 88% + ink（原型主按钮 :hover） | `#455A8F` | `#B8C9ED` |
| `--st-on-accent` | --inverse11 | `#FFFFFF` | `#191A19` |
| `--st-on-accent-2` | inverse 78% + accent（自算） | `#D7DCE8` | `#3B4048` |
| `--st-focus` | --accent11（新：焦点环，原型 --focus） | `#495F98` | `#B2C5EF` |
| `--st-wait` | 琥珀（比河蓝深一档） | `#8F5D10` | `#E3B464` |
| `--st-wait-bg` | wait 12% + paper | `#EEE9E2` | `#413D37` |
| `--st-wait-border` | wait 35% + paper | `#D5C4AB` | `#6F5F44` |
| `--st-done` | 绿（比河蓝深一档） | `#21714F` | `#6CC9A6` |
| `--st-done-bg` | done 12% + paper | `#E1EBEA` | `#2E4041` |
| `--st-done-border` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-danger` | 红 | `#A93A33` | `#E88A81` |
| `--st-danger-bg` | danger 12% + paper | `#F1E5E7` | `#42363B` |
| `--st-step-todo` | --well（原型 .progress-line 没到的一段） | `#E9EDF6` | `#292F38` |
| `--st-step-done-past` | 同 --st-text-3 | `#778297` | `#8C8E8D` |
| `--st-accent-alt` | 紫（问库记号、图谱） | `#5B4FA8` | `#A79BE8` |
| `--st-accent-alt-soft` | alt 12% + paper | `#E8E7F5` | `#37394C` |
| `--st-fetch-ok` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-fetch-ok-bg` | 同 --st-done-bg | `#E1EBEA` | `#2E4041` |
| `--st-fetch-empty` | --sub11 | `#53617A` | `#A9ABA8` |
| `--st-fetch-empty-bg` | --well | `#E9EDF6` | `#292F38` |
| `--st-fetch-gap` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-gap-bg` | 同 --st-wait-bg | `#EEE9E2` | `#413D37` |
| `--st-fetch-failed` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-failed-bg` | 同 --st-wait-bg | `#EEE9E2` | `#413D37` |
| `--st-fetch-blocked` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-fetch-blocked-bg` | 同 --st-danger-bg | `#F1E5E7` | `#42363B` |
| `--st-chart-against` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-chart-background` | --well | `#E9EDF6` | `#292F38` |
| `--st-chart-gap` | 同 --st-text-3 | `#778297` | `#8C8E8D` |
| `--st-chart-1` | accent | `#495F98` | `#B2C5EF` |
| `--st-chart-2` | accent 往 paper 走 20% | `#6D7EAD` | `#95A5C8` |
| `--st-chart-3` | 40% | `#909EC1` | `#7885A2` |
| `--st-chart-4` | 60% | `#B4BDD6` | `#5C667B` |
| `--st-chart-5` | 80% | `#D7DDEA` | `#3F4655` |
| `--st-lib-river` | 不随主题变（docs/tokens.md 原值） | `#1F6E8C` | `#74B7D3` |
| `--st-lib-violet` | 同上 | `#5B4FA8` | `#A79BE8` |
| `--st-lib-green` | 同上 | `#237A5B` | `#6CC9A6` |
| `--st-lib-muted` | 同上 | `#56646F` | `#9CAAB5` |
| `--st-on-lib` | 同上 | `#FFFFFF` | `#0F161B` |
| `--st-scrim` | ink 32% | `rgba(39, 51, 75, 0.32)` | `rgba(0, 0, 0, 0.55)` |
| `--st-shadow-menu` | 菜单与对话框（自算） | `0 1px 2px rgba(39, 51, 75, 0.06), 0 12px 32px -12px rgba(39, 51, 75, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` |
| `--st-shadow-card` | --float11（新：卡片浮起） | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` |
| `--st-radius` | 原型 --key-radius 一系（新值） | `16px` | `16px` |
| `--st-radius-s` | 按钮、标签 | `12px` | `12px` |
| `--st-radius-xs` | 小角标 | `8px` | `8px` |
| `--st-radius-key` | 新：主按钮（玻璃更圆、研究对话 3px） | `20px` | `20px` |
| `--st-font` | 原型 --copy：数字走等宽、其余 Noto Sans SC | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` |
| `--st-font-mono` | 原型 --data | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` |
| `--st-fs-body` | 原型 --reading-size | `15px` | `15px` |
| `--st-weight-body` | 新：深色字重减一点（原型 --dark-copy 360） | `400` | `360` |
| `--st-weight-display` | 新：原型 --display-weight（深色减 40） | `600` | `560` |
| `--st-tracking-display` | 新：原型 --display-spacing | `0.025em` | `0.025em` |
| `--st-weight-label` | 新：原型 --label-weight | `600` | `600` |
| `--st-icon-cap` | 新：图标线头（原型 --cap） | `round` | `round` |
| `--st-icon-join` | 新：图标拐角（原型 --join） | `round` | `round` |
| `--st-icon-weight` | 新：图标线宽（原型 --icon-weight） | `1.65` | `1.65` |

#### 研究对话（`data-theme="research"`，原型 `research11`）

原型的九个变量：

| 原型变量 | 浅色 | 深色 |
|---|---|---|
| `--paper` | `#FDFCF9` | `#232724` |
| `--bench` | `#F7F7F3` | `#161A19` |
| `--panel` | `#F1F2ED` | `#1C201E` |
| `--well` | `#ECECE5` | `#292E2A` |
| `--ink11` | `#283C40` | `#E5E5DF` |
| `--sub11` | `#536466` | `#A9ABA8` |
| `--accent11` | `#395D62` | `#B3D0C0` |
| `--pick` | `#E2EAE5` | `#303E38` |
| `--inverse11` | `#FFFFFF` | `#191A19` |
| `--rule11` | ink 12% | ink 12% |
| `--float11` | `0 6px 22px -13px #1a20302e` | 同左（深色另算，见 --st-shadow-card） |

映射到流息的 `--st-*`：

| token | 从哪来 | 浅色 | 深色 |
|---|---|---|---|
| `--st-page` | --bench | `#F7F7F3` | `#161A19` |
| `--st-surface` | --paper | `#FDFCF9` | `#232724` |
| `--st-surface-2` | --well | `#ECECE5` | `#292E2A` |
| `--st-card-head` | --well（原型 .confirm-top） | `#ECECE5` | `#292E2A` |
| `--st-table-head` | --well | `#ECECE5` | `#292E2A` |
| `--st-row-head` | --panel | `#F1F2ED` | `#1C201E` |
| `--st-selected` | --pick（新：选中的行、标签、条目） | `#E2EAE5` | `#303E38` |
| `--st-active-fill` | --pick | `#E2EAE5` | `#303E38` |
| `--st-border` | --rule11 = ink 12% | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-control-border` | ink 18%（原型控件无边，输入框要能看出边，自算） | `rgba(40, 60, 64, 0.18)` | `rgba(229, 229, 223, 0.18)` |
| `--st-divider` | --rule11 | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-divider-soft` | ink 7%（自算） | `rgba(40, 60, 64, 0.07)` | `rgba(229, 229, 223, 0.07)` |
| `--st-sidebar` | --panel（左栏、右栏同色） | `#F1F2ED` | `#1C201E` |
| `--st-sidebar-text` | --ink11 | `#283C40` | `#E5E5DF` |
| `--st-sidebar-text-2` | --sub11 | `#536466` | `#A9ABA8` |
| `--st-sidebar-divider` | --rule11 | `rgba(40, 60, 64, 0.12)` | `rgba(229, 229, 223, 0.12)` |
| `--st-sidebar-button` | --well | `#ECECE5` | `#292E2A` |
| `--st-sidebar-button-border` | 原型 border-color: transparent | `transparent` | `transparent` |
| `--st-sidebar-selected-title` | --ink11（选中项底是 --pick） | `#283C40` | `#E5E5DF` |
| `--st-sidebar-selected-sub` | --sub11 | `#536466` | `#A9ABA8` |
| `--st-text` | --ink11 | `#283C40` | `#E5E5DF` |
| `--st-text-2` | --sub11 | `#536466` | `#A9ABA8` |
| `--st-text-3` | sub 往 bench 走 22%（原型没有，自算） | `#778485` | `#8C8E8B` |
| `--st-text-dark-2` | --sub11 | `#536466` | `#A9ABA8` |
| `--st-line-todo` | 同 --st-text-3 | `#778485` | `#8C8E8B` |
| `--st-accent` | --accent11 | `#395D62` | `#B3D0C0` |
| `--st-accent-hover` | accent 88% + ink（原型主按钮 :hover） | `#37595E` | `#B9D3C4` |
| `--st-on-accent` | --inverse11 | `#FFFFFF` | `#191A19` |
| `--st-on-accent-2` | inverse 78% + accent（自算） | `#D3DBDC` | `#3B423E` |
| `--st-focus` | --accent11（新：焦点环，原型 --focus） | `#395D62` | `#B3D0C0` |
| `--st-wait` | 琥珀（比河蓝深一档） | `#8F5D10` | `#E3B464` |
| `--st-wait-bg` | wait 12% + paper | `#F0E9DD` | `#423E2E` |
| `--st-wait-border` | wait 35% + paper | `#D7C4A7` | `#705F3E` |
| `--st-done` | 绿（比河蓝深一档） | `#21714F` | `#6CC9A6` |
| `--st-done-bg` | done 12% + paper | `#E3EBE5` | `#2F4139` |
| `--st-done-border` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-danger` | 红 | `#A93A33` | `#E88A81` |
| `--st-danger-bg` | danger 12% + paper | `#F3E5E1` | `#433733` |
| `--st-step-todo` | --well（原型 .progress-line 没到的一段） | `#ECECE5` | `#292E2A` |
| `--st-step-done-past` | 同 --st-text-3 | `#778485` | `#8C8E8B` |
| `--st-accent-alt` | 紫（问库记号、图谱） | `#5B4FA8` | `#A79BE8` |
| `--st-accent-alt-soft` | alt 12% + paper | `#EAE7EF` | `#383A43` |
| `--st-fetch-ok` | 同 --st-done | `#21714F` | `#6CC9A6` |
| `--st-fetch-ok-bg` | 同 --st-done-bg | `#E3EBE5` | `#2F4139` |
| `--st-fetch-empty` | --sub11 | `#536466` | `#A9ABA8` |
| `--st-fetch-empty-bg` | --well | `#ECECE5` | `#292E2A` |
| `--st-fetch-gap` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-gap-bg` | 同 --st-wait-bg | `#F0E9DD` | `#423E2E` |
| `--st-fetch-failed` | 同 --st-wait | `#8F5D10` | `#E3B464` |
| `--st-fetch-failed-bg` | 同 --st-wait-bg | `#F0E9DD` | `#423E2E` |
| `--st-fetch-blocked` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-fetch-blocked-bg` | 同 --st-danger-bg | `#F3E5E1` | `#433733` |
| `--st-chart-against` | 同 --st-danger | `#A93A33` | `#E88A81` |
| `--st-chart-background` | --well | `#ECECE5` | `#292E2A` |
| `--st-chart-gap` | 同 --st-text-3 | `#778485` | `#8C8E8B` |
| `--st-chart-1` | accent | `#395D62` | `#B3D0C0` |
| `--st-chart-2` | accent 往 paper 走 20% | `#607D80` | `#96AEA1` |
| `--st-chart-3` | 40% | `#879D9E` | `#798C82` |
| `--st-chart-4` | 60% | `#AFBCBD` | `#5D6B62` |
| `--st-chart-5` | 80% | `#D6DCDB` | `#404943` |
| `--st-lib-river` | 不随主题变（docs/tokens.md 原值） | `#1F6E8C` | `#74B7D3` |
| `--st-lib-violet` | 同上 | `#5B4FA8` | `#A79BE8` |
| `--st-lib-green` | 同上 | `#237A5B` | `#6CC9A6` |
| `--st-lib-muted` | 同上 | `#56646F` | `#9CAAB5` |
| `--st-on-lib` | 同上 | `#FFFFFF` | `#0F161B` |
| `--st-scrim` | ink 32% | `rgba(40, 60, 64, 0.32)` | `rgba(0, 0, 0, 0.55)` |
| `--st-shadow-menu` | 菜单与对话框（自算） | `0 1px 2px rgba(40, 60, 64, 0.06), 0 12px 32px -12px rgba(40, 60, 64, 0.28)` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35)` |
| `--st-shadow-card` | --float11（新：卡片浮起） | `0 6px 22px -13px rgba(26, 32, 48, 0.18)` | `0 6px 22px -13px rgba(0, 0, 0, 0.6)` |
| `--st-radius` | 原型 --key-radius 一系（新值） | `9px` | `9px` |
| `--st-radius-s` | 按钮、标签 | `6px` | `6px` |
| `--st-radius-xs` | 小角标 | `3px` | `3px` |
| `--st-radius-key` | 新：主按钮（玻璃更圆、研究对话 3px） | `3px` | `3px` |
| `--st-font` | 原型 --copy：数字走等宽、其余 Noto Sans SC | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` | `'Streams Numerals', 'Streams Noto Sans SC', sans-serif` |
| `--st-font-mono` | 原型 --data | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` | `'Cascadia Mono', Consolas, 'Streams Noto Sans SC', monospace` |
| `--st-fs-body` | 原型 --reading-size | `14px` | `14px` |
| `--st-weight-body` | 新：深色字重减一点（原型 --dark-copy 360） | `400` | `360` |
| `--st-weight-display` | 新：原型 --display-weight（深色减 40） | `600` | `560` |
| `--st-tracking-display` | 新：原型 --display-spacing | `-0.02em` | `-0.02em` |
| `--st-weight-label` | 新：原型 --label-weight | `500` | `500` |
| `--st-icon-cap` | 新：图标线头（原型 --cap） | `round` | `round` |
| `--st-icon-join` | 新：图标拐角（原型 --join） | `round` | `round` |
| `--st-icon-weight` | 新：图标线宽（原型 --icon-weight） | `1.65` | `1.65` |

三套都一样的：`--st-fs-small: 12px` · `--st-fs-tiny: 11px` · `--st-fs-title: 22px` · `--st-fs-heading: 26px` · `--st-lh: 1.65` · `--st-control-h: 38px` · `--st-gutter: 12px` · `--st-col-sidebar: 232px` · `--st-col-panel: 380px` · `--st-step: 8px` · `--st-step-gap: 3px`

<!-- tokens:end -->

## 六、对比度实算（WCAG 2）

`tools/contrast.mjs` 在无头 Edge 里打开本稿，六种组合下取**真实元素**的计算颜色（`getComputedStyle`）和它实际的底色（往上找第一层不透明的底；半透明按 alpha 叠；澄明玻璃选中项是渐变底，取每个色标、报最差的那个），按 WCAG 2 相对亮度公式算。门槛：正文、按钮字、状态字 ≥ 4.5，次要文字 ≥ 3。

<!-- contrast:start -->

| 字 / 底 | 门槛 | 精密国际主义 · 浅 | 精密国际主义 · 深 | 澄明玻璃 · 浅 | 澄明玻璃 · 深 | 研究对话 · 浅 | 研究对话 · 深 |
|---|---|---|---|---|---|---|---|
| 正文 / 主区底（对话里主 Agent 的话） | 4.5 | 14.34 | 14.44 | 11.89 | 13.92 | 10.80 | 13.88 |
| 正文 / 卡片（库架卡片的「在追」） | 4.5 | 15.11 | 12.89 | 12.32 | 11.99 | 11.30 | 11.97 |
| 正文 / 左栏（没选中的库名） | 4.5 | 13.60 | 13.63 | 11.27 | 13.07 | 10.31 | 13.03 |
| 正文 / 选中底（左栏当前的库） | 4.5 | 12.19 | 9.60 | 8.38 | 6.98 | 9.46 | 8.87 |
| 正文 / 右栏卡片（等你决定的标题） | 4.5 | 15.11 | 12.89 | 12.32 | 11.99 | 11.30 | 11.97 |
| 次要 / 主区底（页头说明） | 3 | 6.89 | 7.89 | 5.88 | 7.61 | 5.78 | 7.59 |
| 次要 / 卡片（库架卡片「上次更新」） | 3 | 7.26 | 7.05 | 6.09 | 6.56 | 6.05 | 6.54 |
| 次要 / 左栏（库名下的状态） | 3 | 6.53 | 7.45 | 5.58 | 7.14 | 5.52 | 7.12 |
| 次要 / 左下角余量（重置时间） | 3 | 7.26 | 7.05 | 6.09 | 6.56 | 6.05 | 6.54 |
| 次要 / 右栏摘要块（小标题） | 3 | 6.13 | 6.29 | 5.33 | 5.83 | 5.23 | 5.98 |
| 主按钮字 / 强调色（「新建库」） | 4.5 | 12.08 | 10.89 | 6.22 | 10.08 | 7.20 | 10.56 |
| 次要按钮字 / 按钮底（阅读区「编辑」） | 4.5 | 12.76 | 11.51 | 10.78 | 10.66 | 9.77 | 10.93 |
| 卡片上的次要按钮（待看「稍后」） | 4.5 | 12.76 | 11.51 | 10.78 | 10.66 | 7.02 | 9.16 |
| 当前标签字 / 选中底（库页「待看」） | 4.5 | 12.19 | 9.60 | 10.28 | 8.99 | 9.46 | 8.87 |
| 琥珀字 / 琥珀浅底（「写给 AI 的话」标记） | 4.5 | 4.65 | 6.06 | 4.65 | 5.64 | 4.65 | 5.60 |
| 绿字 / 绿浅底（「已收藏」） | 4.5 | 4.87 | 5.91 | 4.88 | 5.47 | 4.88 | 5.45 |
| 紫字 / 紫浅底（问库的出处编号） | 4.5 | 5.48 | 4.94 | 5.49 | 4.59 | 5.49 | 4.58 |
| `--st-text-3`（更淡的说明，本稿页面上没用；token 值对主区底 / 栏底） | 3 | 4.08 / 3.87 | 5.46 / 5.16 | 3.64 / 3.45 | 5.34 / 5.01 | 3.61 / 3.44 | 5.32 / 4.99 |

不达标：没有（上表每一格都过各自的门槛）。每一格的字色、底色原值在 `tools/contrast-result.json`。

<!-- contrast:end -->

说明：

- 次要文字（`--st-text-2`）在六种组合下都 ≥ 5.2，其实也过 4.5，不是只过 3。
- 最紧的几格是状态字：浅色琥珀 4.65、浅色绿 4.87–4.88、深色紫 4.58–4.94。都过 4.5，但余量小；K2 若改了浅底的混合比例（12% / 16%），要重跑这张表。
- `--st-text-3` 浅色只有 3.4–4.1：过「次要 ≥ 3」，不过 4.5。本稿页面上没用它；K2 里它只能用在不承载信息的地方（脚注、占位），要当正文用就得换成 `--st-text-2`。这一条如实列出，不算达标的正文色。
- 设计稿切换条（固定深灰）不属于界面，不在表里。

## 七、和原型的差别

**改了的**

| 原型 | 本稿 | 为什么 |
|---|---|---|
| 产品名、品牌字、示例项目「中国能源优势」、研究阶段（明确任务 → 收集资料 → 拟定提纲 → 撰写交付） | 流息、「流」字标、三个库（流息Test、安省中小企业补助、Rust 异步生态）、一轮的步骤（自检 → 抓取 → 去重 → 打分 → 摘要 → 完成） | 换成流息的对象和流程 |
| 左栏：新建研究项目、全部项目、研究项目列表、版本与确认记录、我的工作空间 | 方案 B：库架 · 和主 Agent 聊 · 我的库 · 新建库 · 余量 · 设置 | v2 已定的左栏（`docs/design/v2/architecture.md` §三） |
| 右栏四标签：进度 · 资料 · 文件 · 成稿（只管当前项目） | 进度 · 等你决定 · 详情 · 文件（进度、等你决定管**所有库**） | 维护者 11-10 定 |
| 主区：确认卡（改动内容 / 最薄弱的依据 / 最可能出错的地方 + 先不确认 / 确认这一版） | 提议卡（为什么、改前 / 改后、确认 · 改一下 · 不要）；待看卡片；资料库两栏；问库 | 流息的部件 |
| 原型的「文件」= 委托、材料、阶段产物的版本列表 | 「讲给人听的结构」：笔记按主题、待看、要求与来源、程序记录（折叠） | 反馈 #3「定」 |
| 字体：精密国际主义用随包 Noto；澄明玻璃用等线（DengXian）；研究对话正文用微软雅黑、标题用衬线（Noto Serif SC → 宋体） | 三套都用 Noto Sans SC（随包这一份） | #6「定」：字体用 Noto Sans SC。**研究对话因此没有了衬线标题**，观感比原型「平」一些（见第九节） |
| 字体族名（原型的中文字体族名带着原产品名；数字字体叫 `'Workbench Numerals'`） | `'Streams Noto Sans SC'`、`'Streams Numerals'` | 名字里不带别的产品 |
| CSS 叠了十层（round6 → round11，后一层覆盖前一层） | 三个文件：`tokens.css`（颜色）· `app.css`（部件）· `themes.css`（三套各自的形状），只保留第十一轮最终生效的样子 | 叠层里大半规则被后面覆盖掉了；K2 要的是最终值，不是演化史 |
| 颜色写死在各条规则里 | 一律经 `--st-*` token | 流息的规矩：别的样式文件里不写颜色（`desktop/test/kit.test.mjs`） |
| 右栏宽约 380px | `--st-col-panel: 380px`（≤ 1360 宽时 352px） | 1280×800 下三栏放得下（看 `-1280` 那 7 张） |

**删了的（演示层，按交接说明不搬）**：示例项目与 localStorage（本稿不存任何东西）、模拟回复计时器与逐字出现的动画、顶上的试用条（视觉 / 示例场景 / 深色 · 开关 / 推进演示 / 重置示例）——换成本稿自用的切换条，明写「不属于界面」；选区批注、分栏拖动、阅读视图里的引用回看（流息另有阅读器）；第九、十轮里被第十一轮覆盖掉的渐变背景、硬阴影按键。

**补的**：等你决定、详情、收起右栏、更多、书架等几个图标原型没有，照各套的笔法补画（`js/icons.js` 开头注明）。

## 八、字体与许可

- **Noto Sans SC** 可变字体，文件 `docs/design/next/themes-source/shared/fonts/NotoSansSC-VF.ttf`（17.8 MB），许可 **SIL Open Font License 1.1**，全文 `themes-source/shared/fonts/OFL-NotoSansSC.txt`。随原型的交接包而来（交接包出处与 sha256 见 `themes-source/来源.md`）。
- OFL 允许随软件打包、再分发；要求带上许可全文、不单独出售字体文件、改了字体不能沿用保留名。流息只原样带着用，不改字体。
- 本稿只引用、不复制这份字体。K2 打包时字体进安装包（#6：约 +18 MB），许可证页加一行（本稿设置页已画），`THIRD-PARTY-NOTICES.txt` 带 OFL 全文。
- 数字用本机的 Cascadia Mono / Consolas（`local()`，不打包、不下载）；本机没有时退回 Noto 的数字，不出错。

## 九、K2 要做的事（清单）

**主题与外观**

| 改哪里 | 改什么 |
|---|---|
| `desktop/src/renderer/styles/tokens.css` | 河蓝 / 素灰 / 夜间三块换成本稿 `css/tokens.css` 的六块（`[data-theme][data-appearance]`）；加第五节列的新 token |
| `desktop/src/shared/themes.mjs` | `THEME_IDS` 换成 `precision` · `glass` · `research`；外观单独一个 `APPEARANCES = light · dark · system`；`THEME_PAGE` 变成按主题 × 浅深的窗口底色（= `--st-page`） |
| `desktop/src/main/theme.mjs` | `DEFAULT_THEME = 'precision'`，新增默认外观 `system`；`withTheme` 在 `<html>` 上写 `data-theme` 和 `data-appearance`；`nativeSource`：外观选 `system` 时 `nativeTheme.themeSource = 'system'`，并在 `nativeTheme` 的 `updated` 事件里改页面的 `data-appearance` 与窗口底色 |
| `desktop/src/main/settings.mjs` · `bridge-methods.mjs` · `app-services.mjs` | 设置多一个 `appearance`；`setTheme` 只收三个新 id，加 `setAppearance`；旧值迁移（下表） |
| `desktop/src/renderer/screens/settings.js` · `texts/settings.js` · `texts-en/settings.js` | 「外观与语言」：主题三张卡（名字：精密国际主义 / 澄明玻璃 / 研究对话，英文名待定）+ 外观三段 |
| `desktop/src/renderer/styles/*.css` | 形状差别（本稿 `css/themes.css`）：选中项的定位条 / 渐变光 / 书签，圆角、主按钮形状、研究对话的下划线次要按钮 |
| 字体 | `@font-face` 指向打包进应用的 `NotoSansSC-VF.ttf`（app:// 下可读）；`--st-font` 换成 Noto；`desktop/src/main/licenses.mjs`、`test/licenses.test.mjs`、`installer/build-installer.mjs` 加字体与 OFL |
| 测试 | `desktop/test/theme.test.mjs`（三套 → 六组，对比度门槛照第六节）、`ui-theme.test.mjs`、`kit.test.mjs`（token 名单）；`docs/tokens.md`、`docs/desktop.md` §五 跟着改 |

**旧设置怎么迁移（建议，待 维护者 定）**。注意：代码里旧主题的 id 是 `river` · `paper` · `night`（素灰叫 `paper`，不叫 slate；`desktop/src/shared/themes.mjs`）。

| `settings.json` 里的 `theme` | 迁成 | 理由 |
|---|---|---|
| 没有这个字段 | `precision` + `system` | 新默认 |
| `river`（河蓝） | `precision` + `system` | `river` 是旧默认，而且 `writeSettings` 每次写都把它带进文件（`desktop/src/main/settings.mjs`），分不出是用户选的还是默认，按默认处理 |
| `paper`（素灰） | `precision` + `light` | 用户主动选过一套浅色的灰调，精密国际主义最接近，保留「浅色」的意思 |
| `night`（夜间） | `precision` + `dark` | #6「定」：夜间由「深色」接替 |
| 其他值 | `precision` + `system` | 同 `themeOf` 现在的兜底 |

迁移只在读设置时做一次映射、写回新字段，不删用户别的设置；`paper` / `night` 要不要改成「保留原主题名、只换外观」由 维护者 定。

**本稿画了、但不属于主题落地的**（右栏四个标签、资料库两栏、左下角余量与读余量的两条接口、排队的三处说法、「开始」改成「已排上」/ 排到队尾）：反馈 #1–#4 的改动，K2 契约里要不要一起做、拆几个包，由 维护者 看过本稿后定。读余量的做法照 #4 的风险处理：读不到就不显示数（本稿是一行灰字），字段按白名单取，不显示账户 id。

## 十、还没定的事（本稿没有替 维护者 定）

1. **研究对话的标题字**：原型用衬线（Noto Serif SC，不随包，退到宋体）；#6 定的是 Noto Sans SC，本稿三套都用无衬线。要不要给研究对话的标题单独带衬线字（再加一份字体，约 +10–20 MB），待 维护者 定。
2. **旧设置迁移**：上表是建议。
3. **英文版的主题名**（Streams 里叫什么）：本稿只画中文。
4. 余量「读不到」选了一行灰字（理由见第四节），维护者 可改成整块不显示。

## 十一、自查（`tools/check.mjs`，17 项）

默认状态；六种组合颜色两两不同；跟随系统（模拟系统深 / 浅）；Noto 字体 `loaded` 且 `document.fonts.check` 为真；7 个画面 × 3 主题 × 3 外观 × 4 个右栏标签切遍、收起 / 展开、右键菜单，**console error / pageerror 0 条**、没有任何非 file:// 请求；wording 包 `scanStrings` 扫 7 × 4 × 3 份 innerText **0 处**；品牌词只出现在「连接你电脑上的 …」里；详情在四个画面下各不相同；文件树按主题分组、要求与来源不直接打开、程序记录默认折叠；余量在「设置」前、五种状态各自对；本目录没有原型产品名、没有外网引用。哨兵：`scanStrings({a: '这一条 pending'}).ok` 为 false。
