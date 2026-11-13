<p><img src="docs/brand/lockup-on-white.png" alt="流息 STREAMS" width="352"></p>

# 流息 · Streams

**流息**（英文名 **Streams**）是一个装在 Windows 上的本地资料库软件。你可以同时养几个库，每个库盯一个领域：告诉它追什么、从哪些来源抓；它按这个库自己的时间去抓，让模型按你定的关卡打分，把过关的放进这个库的「待看」；你花几分钟看一遍，点收藏或放弃；收藏的变成一个 Markdown 文件进库。库里的东西能读、能改、能画成图、能拿来问。

- **和主 Agent 聊着建库、改库**：在「和主 Agent 聊」里说一句「帮我建个库，追踪中国电动车行业」，主 Agent 一次只问一个问题，然后拿出一张**提议卡**——库名、要求、主题与关键词、来源（每个都先试抓过，被拒的默认不勾）、过关线、定时。在库里的问库对话框说「以后也追踪港股公告」，这句会转给主 Agent，同样出提议卡。
- **提议卡你确认才生效**：主 Agent 自己改不了任何东西；只有你点「确认」，流息的代码才去改，并在「来源与要求」里记下「主 Agent 提的 · 你确认的」。规则型的建议（某个来源连续被拒、连续几轮没有产出、材料里有写给 AI 的话）也一律等你点。
- **库架，多库**：左栏「库架」一眼看完所有库的待看数和有没有问题；每个库有自己的定时和每轮上限，几个库排队、同一时间只跑一轮。
- **阅读模式**：在资料库里点「打开原文」，在流息里的一个隔离窗口打开原网页，默认抽出正文（阅读模式），也能切回原网页。
- 库是一个 Markdown 文件夹，文件是真相，索引是生成物；卸了软件库还在，Obsidian 能开，git 能管。
- 机器推荐，人拍板：没有任何条目不经你点「收藏」进库。
- 模型用你自己的账号：连接你电脑上的 Claude Code / Codex，或输入任一厂商的 API key。软件不经手凭证；命令行一律「不能动手」（零工具或只读沙箱、空的工作目录）。
- 开源、本地运行、只做 Windows。

**Streams** is a local, open-source Windows app for people who track several fields every day. Each library follows one field on its own schedule: it fetches from your sources, lets a model score each item at the gates you define, and nothing enters a library until you keep it. You build and change libraries by talking to the **main agent**: it asks one question at a time and puts forward a **proposal card** (the library's name, brief, topics, sources it has already test-fetched, pass marks, schedule) — nothing changes until you confirm the card, and the agent itself cannot change anything. The **shelf** shows every library at a glance; the libraries queue so only one round runs at a time. **Reading mode** opens an item's page inside Streams, in an isolated window, with the article extracted. Each library is a plain Markdown folder.

## 结构

| 目录 | 内容 |
|---|---|
| `core/` | 纯 Node 的核心：库（解析 / 校验 / 索引 / 账本）、抓取、流水线、连接器、核验层；v2 加了库登记（`registry/`）、提议卡（`proposals/`）、主 Agent（`agent/`）、规则型建议（`suggest/`）、问库的分流（`ask/route.mjs`）。无界面、零依赖，有自己的测试。 |
| `desktop/` | Electron 外壳与页面（Preact）：库架、和主 Agent 聊、库页五个标签、设置、阅读窗口（`src/main/reader.mjs`）。 |
| `installer/` | 安装包：Electron 下载校验、Inno Setup。 |
| `wording/` | 界面用词：词表、禁用词、扫描器。 |
| `docs/` | 开发说明；v2 的设计在 `docs/design/v2/`。 |
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
- **N1–N6**：v2 新加的验收标准**草案**（主 Agent 只经你确认的提议卡改东西、命令行不能动手、写给 AI 的话被标记而配置不动、多库定时只跑一轮、会话缓存丢了能从对话记录接着聊、五个 Use Case 在真窗口里走通），`node tests/acceptance/v2-draft/run-draft.mjs`；同一个文件夹里还有对 V1–V12 在 v2 下的建议改字。草案待 维护者 定，定之前不算发版标准。

**Acceptance.** V1–V12 are the release standards (`tests/acceptance/run.mjs`). N1–N6 are a **draft** of the standards v2 adds, with suggested rewordings of V1–V12 (`tests/acceptance/v2-draft/`); they become standards only once the maintainer decides on them.

## 许可证

MIT，见 `LICENSE`。发布者 Starry Data & Technology Inc.

---

由 [Starry Digital](https://starrydigital.ca) 开发 · Developed by [Starry Digital](https://starrydigital.ca)
