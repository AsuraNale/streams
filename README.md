<p><img src="docs/brand/lockup-on-white.png" alt="流息 STREAMS" width="352"></p>

# 流息 · Streams

**流息**（英文名 **Streams**）是一个装在 Windows 上的本地资料库软件。可以同时管理多个库，每个库追踪一个领域：写下追踪要求、选好来源；流息按该库自己的定时去抓取，由模型按追踪要求与严格程度评分，通过筛选的内容进入该库的「待看」；你花几分钟看一遍，点击收藏或放弃；收藏的内容成为库里的一个 Markdown 文件。库里的内容可以阅读、编辑、以图谱查看，也可以用来提问。

- **通过主 Agent 建库、改库**：在「主 Agent」里说一句「帮我建个库，追踪中国电动车行业」，主 Agent 一次只问一个问题，然后给出一项**提议**——库名、追踪要求、主题与关键词、来源（每个都已试抓，状态为「访问被拒」的默认不勾选）、严格程度、定时。在某个库的「问库」里说「以后也追踪港股公告」，这句话会转交主 Agent，同样给出提议。
- **提议确认后才生效**：主 Agent 自己不能修改任何设置；只有点击「确认」后，流息的代码才执行修改，并记入该库「来源与要求 → 高级设置」的变更记录（操作来源：主 Agent 提议 · 已确认）。流息自己检测到的情况（某个来源连续失败、连续多次运行没有新内容进入待看、内容中检测到面向 AI 的指令等）列为「系统检测」，同样需要你点击后才处理。所有待处理的事项都在右栏的「待确认」里。
- **库架，多库**：「库架」列出全部库的待看数与问题；每个库有自己的定时与单次运行上限，多个库排队，同一时间只有一次运行。库页有四个标签：待看、资料库、问库、来源与要求。
- **阅读模式**：点击待看卡片的标题，在流息的一个隔离窗口里打开原网页，默认只显示正文（阅读模式），也可以切换到原网页。
- 库是一个 Markdown 文件夹，文件是真相，索引是生成物；卸载软件后库仍在，Obsidian 能打开，git 能管理。
- 机器推荐，人来决定：没有任何内容不经你点击「收藏」进入库。
- 模型使用你自己的账号：连接你电脑上的 Claude Code / Codex，或输入任一厂商的 API key。软件不经手凭证；命令行一律「不能动手」（零工具或只读沙箱、空的工作目录）。
- 四套主题，各有浅色与深色；界面有中文与英文两套。
- 开源、本地运行、只做 Windows。

**Streams** is a local, open-source Windows app for people who track several fields every day. Each library follows one field on its own schedule: it fetches from your sources, has a model score each item against the library's brief at the strictness you choose, and puts what passes into that library's **Inbox** — nothing enters a library until you keep it. You build and change libraries through the **main agent**: it asks one question at a time and then makes a **proposal** (the library's name, brief, topics, sources it has already test-fetched, strictness, schedule). Nothing changes until you confirm the proposal; the agent itself cannot change anything, and every confirmed change is recorded in the library's change log. What Streams notices by itself (a source that keeps failing, several runs with nothing new, instructions aimed at AI inside an article) is listed as **Detected by Streams** and also waits for you, in the right panel's **To confirm**. The **Shelf** shows every library at a glance; libraries queue, so only one run happens at a time. A library's page has four tabs: Inbox, Library, Ask, Sources & Brief. **Reading view** opens an item's page inside Streams, in an isolated window, with the article extracted. Each library is a plain Markdown folder.

## 结构

| 目录 | 内容 |
|---|---|
| `core/` | 纯 Node 的核心：库（解析 / 校验 / 索引 / 账本）、抓取、流水线、连接器、核验层；库登记（`registry/`）、提议（`proposals/`）、主 Agent（`agent/`）、系统检测（`suggest/`）、问库的分流（`ask/route.mjs`）。无界面、零依赖，有自己的测试。 |
| `desktop/` | Electron 外壳与页面（Preact，外观用设计模板）：库架、主 Agent、库页四个标签（待看 · 资料库 · 问库 · 来源与要求）、右栏、设置、阅读窗口（`src/main/reader.mjs`）。 |
| `installer/` | 安装包：Electron 下载校验、Inno Setup。 |
| `wording/` | 界面用词：词表（中文与英文用词表）、禁用词、扫描器。 |
| `docs/` | 开发说明；v2 的设计在 `docs/design/v2/`，重设计（现在的界面）在 `docs/design/redesign/`。 |
| `tests/acceptance/` | 发版验收 V1–V12（`run.mjs`）。 |
| `tests/acceptance/v2-draft/` | v2 验收标准草案 N1–N6 与对 V1–V12 的建议改字（`run-draft.mjs`）：**草案，待 维护者 定**，定了之后并入 `standards.mjs`。 |

## 下载与安装

只做 Windows。公开仓 `AsuraNale/streams` 发布后，从它的 Releases 页面下载安装包（`Streams-<版本号>-setup.exe`）。

- 每个版本的安装包的 sha256 写在那个版本的发布说明里。下载后可以自己核对，例如在 PowerShell 里：`Get-FileHash .\Streams-<版本号>-setup.exe -Algorithm SHA256`，算出来的值应当和发布说明里的一致。
- 第一版的安装包**未签名**（没有代码签名证书）。所以运行它时，Windows 会弹出 SmartScreen 提示「Windows 已保护你的电脑」：点「更多信息」，再点「仍要运行」，就会开始安装。

**Download and install.** Windows only. Once the public repository `AsuraNale/streams` is up, download the installer from its Releases page. The SHA-256 of each installer is in that release's notes. The first release's installer is **not code-signed**, so Windows SmartScreen shows "Windows protected your PC": click "More info", then "Run anyway".

## 开发

需要 Node ≥ 24。各目录有自己的 `package.json`；核心无第三方依赖。

```
cd core && npm test
cd wording && npm test
cd desktop && npm test
node tests/acceptance/run.mjs
node tests/acceptance/v2-draft/run-draft.mjs
```

### 验收

- **V1–V12**：发版的验收标准（维护者 2026-11-02 定稿），`node tests/acceptance/run.mjs` 打一张表；标准原文在 `tests/acceptance/standards.mjs`，只有 维护者 能改。
- **N1–N6**：v2 新加的验收标准**草案**（主 Agent 的修改只经你确认的提议生效、命令行不能动手、面向 AI 的指令被标记而配置不变、多个库定时运行时同一时间只有一次运行、会话缓存丢失后能从对话记录继续、五个 Use Case 在真窗口里走通），`node tests/acceptance/v2-draft/run-draft.mjs`；同一个文件夹里还有对 V1–V12 在 v2 下的建议改字。草案待 维护者 定，定之前不算发版标准。

**Acceptance.** V1–V12 are the release standards (`tests/acceptance/run.mjs`). N1–N6 are a **draft** of the standards v2 adds, with suggested rewordings of V1–V12 (`tests/acceptance/v2-draft/`); they become standards only once the maintainer decides on them.

## 许可证

MIT，见 `LICENSE`。发布者 Starry Data & Technology Inc.

---

由 [Starry Digital](https://starrydigital.ca) 开发 · Developed by [Starry Digital](https://starrydigital.ca)
