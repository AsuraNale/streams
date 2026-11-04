# 桌面外壳（desktop/）

> 2026-11-02，流息 Streams 第一天：外壳。本文是外壳的说明——窗口、安全基线、应用数据布局、预加载桥与事件、界面骨架与组件、token 名单（`docs/tokens.md`）、测试、从云织拿了什么。外壳来自云织桌面版（`C:\Users\you\dev\yunzhi-desktop`，按产品方案 4.9 的清单复制并改名），谢谢它。
> 之后每天按方案 5.2 往 `src/renderer/screens/` 里换占位页，往 `src/main/` 里加服务；桥和事件按 §四 的办法加。

## 〇、放在哪、怎么跑

```
desktop/
  package.json · package-lock.json     依赖与脚本（§一）；ESM，Node ≥ 24，没有构建步骤
  src/main/          主进程（Node，Electron 44.0.0）
    main.mjs           入口：布局 → 协议 → 沙箱 → 会话加锁 → 桥 → 窗口
    layout.mjs         应用数据布局（§三）        security.mjs   安全基线（§二）
    protocol.mjs       app://ui/ 只发本地文件     safe-path.mjs  app:// 的路径规则
    bridge-methods.mjs · bridge.mjs   预加载桥（§四）   events.mjs   主进程推给页面的事件（§四）
    app-services.mjs   外壳自己的服务：应用状态、设置页、密钥仓
    settings.mjs       settings.json              secrets.mjs    safeStorage 加密的 API key（按厂商一个文件）
    locale.mjs         界面语言（§六）            diagnostics.mjs 「复制诊断信息」
    update-wiring.mjs · services/update.mjs   自更新（GitHub AsuraNale/streams 的发布）· services/env-proxy-fetch.mjs
    services/notify.mjs   Windows 通知（今天只建，不发）   quit.mjs   退出时结束本次运行的辅助进程
    version.mjs · icon.mjs · app-id.mjs · log.mjs
    texts/notify.js · texts-en/notify.js   主进程自己的字
  src/preload/preload.cjs   预加载桥：页面里唯一的 window.streams
  src/shared/fetch-states.mjs   主进程与页面共用：五种抓取状态的键
  src/renderer/      页面（§五）：index.html · app.js · lib/ · kit/ · screens/ · texts/ · texts-en/ · styles/
  assets/icon/       图标：icon-512.svg → png/ → streams.ico（README 在那里）
  scripts/           start · screenshot · run-tests · csp · mutation-check · build-icon · lib/
  test/              node:test；用 Playwright 驱动 Electron（§七）
```

先决条件：Node 24（开发机 24.14.1）；`installer/electron` 装好的 Electron 44.0.0（没有就在仓库根目录 `node installer/electron/setup_electron.mjs build`——它按 `manifest.json` 的 sha256 校验 zip 与 electron.exe；下载缓存在 `installer/downloads/electron/`，不进 git）。

```
cd desktop
npm ci --ignore-scripts         # 装依赖：只从 registry.npmjs.org，逐个按 package-lock.json 的 sha512 核对
npm start                       # 开发时启动：空世界在 %TEMP%\streams-desktop-dev，第一次启动时生成
npm start -- --screen settings  # 先打开某一屏（settings · kit = 组件一览 · 九个入口的 id）
npm start -- --lang en          # 英文界面（替代系统语言）   --library   把世界里的空库当作已打开
npm start -- --fresh            # 重新生成开发文件夹          --update    允许向 GitHub 查更新（默认关）
npm test                        # 全部测试（§七）
npm run shots [-- --screen kit] # 真窗口截图 → docs/shots/<日期>-empty-window.png（--out 另存）
npm run mutants [-- <id> …]     # 故意改坏的副本上，每项检查都会失败（§七）
node scripts/csp.mjs [--write]  # 改了 index.html 的 import map 之后：核对 / 重写 <meta> 里的 CSP 哈希
npm run icon · npm run icon:check   # 重新渲染图标 / 核对（要 sharp：assets/icon/README.md）
```

`npm start` 只清空、重填**它自己建的**文件夹（标记文件 `.streams-desktop-dev.json`，`scripts/lib/dev-root.mjs`）；`--root` 指向一个有东西却没有标记的文件夹一律拒绝（退出码 2），不在系统临时目录下的也拒绝。`npm start` 用 `installer/electron` 里钉死的 `electron.exe`，并把 `ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS` 从环境里去掉。开发与测试时的应用数据一律在系统临时目录下（§三），**不会碰到真的 `%APPDATA%\Streams`**。

临时目录用 `fs.mkdirSync` 建在 `os.tmpdir()` 下自己起的名字里，不用 `mkdtemp`（`scripts/lib/temp.mjs`；教训：mkdtemp 的文件夹沙箱写不进）。

## 一、依赖

| 包 | 版本 | 许可 | 用途 | 来源 |
|---|---|---|---|---|
| `preact` | 10.29.8 | MIT | 页面组件（含 `preact/hooks`） | registry.npmjs.org，sha512 见 lock |
| `htm` | 3.1.1 | Apache-2.0 | 模板写法（tagged template，不用 JSX、不用构建） | 同上 |
| `playwright-core` | 1.63.0 | Apache-2.0 | 只用于测试与截图：驱动 Electron（不下载浏览器） | 同上（devDependency） |
| Electron | 44.0.0 | MIT | 外壳运行时 | **不是** desktop/ 的 npm 依赖：用 `installer/electron` 装好的那一份 |

三个 npm 包都没有依赖、都不跑安装脚本；`test/deps.test.mjs` 核版本钉死、来源、sha512、许可、`node_modules` 里装的就是 lock 里的版本；没有本地链接（云织的 `@yunzhi/app-core` 链接没拿）。页面用到的三个文件由 `app://ui/vendor/` 按名字直接从 `node_modules` 发出。

## 二、安全基线

照云织（`security.mjs`、`protocol.mjs`、`safe-path.mjs` 原样拿），`test/security.test.mjs` 与 `test/protocol.test.mjs` 核：页面里没有 Node（`contextIsolation` · `sandbox` · `nodeIntegration: false`，`app.enableSandbox()`）；页面只从 `app://ui/` 加载，协议处理器只发 `src/renderer/`、`src/shared/` 与 vendor 三个文件，**路径先按文字判、判过才碰文件系统**（`safe-path.mjs`：网络共享、盘符、`..` 在文字这一步就 404）；CSP 不许任何外部地址（头与 `<meta>` 各一份，`frame-src 'none'`——云织给成稿开的 `app://draft/` 没拿）；不能导航、不能开新窗口、`webview` 拒；会话上 `onBeforeRequest` 拦掉 `app://ui/` 以外的一切，权限一律拒，下载一律取消；WebRTC 不走 UDP；Trusted Types 让页面写不了 HTML、跑不了字符串。

```
default-src 'none'; script-src 'self' 'sha256-<import map 的哈希>'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none';
manifest-src 'none'; form-action 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none';
frame-ancestors 'none'
```

开发与测试专用的环境变量，打包后的应用不认：`STREAMS_WINDOW=hidden`（不显示窗口）、`STREAMS_START_SCREEN=<屏幕 id>`、`STREAMS_DEV_SYSTEM_LANGUAGES`（§六）、`STREAMS_DEV_LIBRARY`（当作已打开的库）、`STREAMS_DEV_UPDATE_URL`（`off` 或 GitHub 的替身）、`STREAMS_DEV_UPDATE_SETUP_RECORD`。组件一览（`screens/kit.js`、`texts/kit.js`、`styles/screens/kit.css`）只在开发时发（`protocol.mjs DEV_ONLY`）。

**页面拿不到 key、文件系统**：桥上的方法不收路径、不返回任何密钥材料；key 只在主进程里解密、只交给发请求的那条连接（方案 C2），页面最多看到「已连接」和末四位（`secrets.mjs keyHint`）。

## 三、应用数据布局

| 位置 | 打包后的应用 | 开发与测试 | 放什么 |
|---|---|---|---|
| **受保护目录** `appData` | `%APPDATA%\Streams` | `STREAMS_APP_DATA` | 下面各项；`protectedDirs = [appData]` |
| `settings.json` | ↑ 下 | ↑ 下 | `language`、`libraryPath`、`showDeveloperInfo`（`settings.mjs`） |
| `secrets\` | | | `key-<厂商>.bin`：各条连接的 API key，`safeStorage` 加密，盘上不留明文（`secrets.mjs`；今天只定名字） |
| `updates\` | | | 新版本的安装程序（`services/update.mjs`），下一次启动时清空 |
| `logs\` | | | `main.log`（应用自己的诊断）、测试时的 `clipboard.txt`、`notifications.jsonl` |
| `electron\` | | | Chromium 自己的数据（缓存、`safeStorage` 用的密钥） |
| **本地数据** `localData` | `%LOCALAPPDATA%\Streams` | `STREAMS_LOCAL_DATA` | `cache\`：以后的抓取缓存、索引（不漫游） |
| **库** | `settings.json` 的 `libraryPath`（用户选的 Markdown 文件夹） | `STREAMS_DEV_LIBRARY` | 用户的库；今天侧栏只显示「未打开库」 |

两个顶层目录不许互相包含（`layout.mjs checkOverlaps`）。开发与测试**必须**给 `STREAMS_APP_DATA`、`STREAMS_LOCAL_DATA`，不给就不启动（`missing_dev_paths`）。Electron 的 `userData` / `sessionData` / `crashDumps` / 日志目录在 `ready` 之前就指进受保护目录。

## 四、预加载桥（IPC 约定）

页面里只有一个 `window.streams`（冻结的对象），上面**恰好**是下表的方法。除 `onEvent` 外，每个方法 = 一次 `ipcRenderer.invoke('streams:<方法名>', …参数)`。下表由测试读取：`test/bridge.test.mjs` 核它与 `src/preload/preload.cjs` 的 `METHODS`（加上 `onEvent`）、`src/main/bridge-methods.mjs` 的 `BRIDGE_METHODS` 三者一致，`test/security.test.mjs` 核运行中的页面上恰好是这些。

<!-- bridge:begin -->
| 方法 | 参数 | 返回的 `data` | 谁用 |
|---|---|---|---|
| `getAppState()` | 无 | `{ library: { path, name } \| null, recentLibraries: [{ path, name }], showDeveloperInfo, language: { setting, resolved }, version, devBuild }`；`library` 是打开的库（侧栏显示 `name`，没有就是「未打开库」）；`version` 是 `installer/setup/release.json` 的版本，`devBuild` 为真时是开发版 | `app.js`（每一屏经 `useApp().appState`）、设置页 |
| `onEvent(topic, callback)` | 下面事件表里的一个主题；一个函数 | 不是信封：返回取消订阅的函数；主题不在表里、`callback` 不是函数就抛错 | `app.js` |
| `setLanguage(language)` | `'auto'` · `'zh-CN'` · `'en'` | `{ setting, resolved, changed }`；写进设置并重新决定界面语言；`changed` 为真时页面自己重新载入（§六） | 设置页「语言」 |
| `setShowDeveloperInfo(on)` | 布尔 | `{ showDeveloperInfo }` | 设置页「显示开发者信息」 |
| `copyDiagnostics()` | 无 | `{ ok: true }`；主进程把诊断信息写进剪贴板（不带 key；测试时写到 `logs\clipboard.txt`） | 设置页「复制诊断信息」 |
| `openMakerPage()` | 无 | `null`；在用户的浏览器里打开 `https://starrydigital.ca`（地址写死在主进程 `app-services.mjs MAKER_URL`，页面不给地址；测试时只记日志） | 设置页「关于」的「由 Starry Digital 开发」（V11，维护者 11-02 定「链 starrydigital.ca」） |
| `getUpdateState()` | 无 | 更新的数据：`{ state, current, dev, canUpdate, checkedAt, release, progress, reason, turnRunning }`（`state` 十二态之一：`idle` · `checking` · `up_to_date` · `available` · `manual` · `check_failed` · `downloading` · `download_failed` · `verify_failed` · `ready` · `launching` · `launch_failed`） | 设置页「关于」（`lib/use-update.js`） |
| `checkForUpdate()` | 无 | 同上；向 GitHub 问一次最新版（`AsuraNale/streams` 的 releases/latest） | 设置页「检查更新」 |
| `downloadUpdate()` | 无 | 同上（`downloading`，进度随 `update` 事件来）；开发版不下载 | 设置页「下载并更新」 |
| `cancelUpdateDownload()` | 无 | 同上；停下下载、删掉下了一半的文件 | 设置页下载中的「取消」 |
| `installUpdate()` | 无 | `{ ok: true }` 安装程序已启动、应用随即退出；或 `{ ok: false, reason }` | 设置页「开始更新」 |
| `openReleasePage()` | 无 | `null`；在用户的浏览器里打开这一版的发布页（测试时只记日志） | 设置页「打开发布页」 |
| `chooseLibraryFolder()` | 无 | 主进程开系统的选文件夹对话框（测试与开发：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>` 代替对话框）；`{ path, name, state: 'empty' \| 'library' \| 'other' } \| null`（取消是 null）。主进程记住这次选择，页面不回传路径 | S1 第 1 步、设置「新建库」「打开已有文件夹」 |
| `useChosenFolder(name)` | 库名字符串（空串 = 用文件夹名） | 对上一次 `chooseLibraryFolder` 的选择：`empty` → `createLibrary` 建库；`library`（已有 `streams.json`）→ 打开；`other` → `open_failed`。写 `settings.libraryPath`、进 `recentLibraries`；发 `library-changed`；返回 `{ path, name }`（没选过文件夹 → `bad_arguments`） | S1 第 1 步、设置「库」 |
| `openRecentLibrary(path)` | 必须是 `recentLibraries` 里的一条，否则 `bad_arguments` | 同上的打开；那个文件夹里的 `streams.json` 读不出 → `open_failed` | 设置「库 · 其他」 |
| `rebuildIndex()` | 无 | `{ count, pending: [{file, codes}] }`；`no_library` | 设置「重建索引」 |
| `revealLibrary()` | 无 | `null`；在资源管理器里显示库文件夹（测试只记日志） | S1 第 1 步「这个文件夹你随时可以打开」 |
| `getConnections()` | 无 | 见 §4.1「连接」；不含任何 key，API 只给 `keyHint` | S1 第 2 步、设置「连接方式」、S13 |
| `detectConnections()` | 无 | 重新检测三种连接（只读：`--version` / `auth status` / `login status` / 有没有 key），返回同 `getConnections` | S1「重新检测」、「我登录好了，再试一次」 |
| `probeConnection(kind)` | `'claude-code' \| 'codex' \| 'api'` | **一次真调用**；`{ ok, latencyMs, model, code?, detail? }`，同时记进 `getConnections().probes[kind]` | S1「试了一次：可用」、设置「现在试一次」 |
| `openLogin(kind)` | `'claude-code' \| 'codex'` | 起 CLI 自己的登录窗口（核心 `connector.openLogin`，窗口标题 = 品牌名，`src/main/texts/app.js`）；`{ ok: true, pid } \| { ok: false, code }`；`api` → `bad_arguments`；假连接或测试（窗口隐藏）下只记日志、回 `{ ok: true, pid: 0 }` | S1 / S13 / S14 的「去登录」 |
| `setActiveConnection(kind)` | 三种之一或 `null` | `{ active }`；写设置；发 `connections-changed` | S1 第 2 步选定、设置 |
| `setConnectionModels(kind, models)` | `models = { model: string \| null, verifyModel: string \| null }`（null = 该连接的默认；核验 null = 同主模型） | `{ kind, model, verifyModel }` | 设置「主模型 / 核验模型」 |
| `setApiVendor(vendor, baseUrl)` | `vendor` 在核心 `VENDOR_IDS` 里；`baseUrl` 只有 `custom` 用，否则传 `null` | `{ vendor, baseUrl }` | 设置「输入 API key」对话框 |
| `setApiKey(vendor, key)` | key 字符串；**只往主进程走一次**，存 `secrets/key-<vendor>.bin`（safeStorage），从不返回 | `{ vendor, keyHint }`；safeStorage 不可用 → `internal` | 同上 |
| `removeApiKey(vendor)` | | `{ vendor, keyHint: null }` | 同上 |
| `applyStarterPack(packId, edits)` | `packId` 在核心 `STARTER_PACKS` 里或 `'blank'`；`edits = { removeSources: [name…], addRss: [{ name, url }] }` | 写 `streams.json` 的 `topics` / `sources`，并对每个来源试抓一次（不写盘）：`{ topics: [name…], sources: [{ name, kind, url, status, hint, count, message }] }` | S1 第 3 步 |
| `getStarterPacks()` | 无 | 核心 `STARTER_PACKS` 的 `[{ id, name, topics, sources: [{name, kind, url, query?, topic}] }]`（名字按界面语言；arXiv / HN 来源 `url` 为 null、带 `query`）；不需要打开库 | S1 第 3 步 |
| `getHome()` | 无 | 见 §4.1「今日」 | S2 |
| `estimateRound()` | 无 | 核心 `estimateRound` + `{ connection: { kind, model, verifyModel } }` | S12 |
| `setRoundCap(cap)` | 正整数 | `{ cap }`；写 `streams.json` 的 `pipeline.cap` | S12「改上限」、设置「每轮上限」 |
| `startRound()` | 无 | `{ started: true, roundId } \| { started: false, problems }`（自检失败：S13；没选连接也算自检失败，`connectionCode: 'not-installed'`）；一轮在跑时 `bad_arguments`。进度经 `round-progress` 事件；跑完发 `inbox-changed` 与最后一条 `round-progress { done: true, result }`。`roundId` 是主进程给这一轮的 id（`d-…`），核心自己的 round id 在 `result.round.id` | S12「开始」、S13「重试打分」 |
| `cancelRound()` | 无 | `{ cancelled }`；当前条目后停（核心 `signal`） | 「今日」进度条旁 |
| `getRoundState()` | 无 | `{ running, roundId, progress, last: runRound 的返回 \| null, lastProblems }` | S2 |
| `getInbox()` | 无 | `{ items: 核心 listInbox(), recentDismissReasons: [{ts, reason, title}] }` | S3 |
| `keepItem(url)` | url 必须在 inbox 里 | `{ id, file }`（`file` = `notes/` 里的文件名）；发 `inbox-changed`、`library-changed`（索引重建了） | S3「收藏」 |
| `dismissItem(url, reason)` | 理由非空，否则 `bad_arguments` | `{ url }`；发 `inbox-changed` | S3「放弃」 |
| `laterItem(url)` | | `{ url }`；不写盘 | S3「稍后」 |
| `openItemUrl(url)` | 必须是 inbox 里或索引里某条的 `source`，否则 `bad_arguments` | `null`；`shell.openExternal`（测试只记日志） | S3「打开原文」 |
| `getPipelineSettings()` | 无 | `{ cap, thresholds: { relevance, substance }, schedule: null }`（定时 11-06 接上，先 null） | 设置「运行」 |
| `getLibrary(view, filter)` | `view` ∈ `kept` · `authored` · `caught` · `pending`；`filter = { topics: string[], days: number \| null }` | `{ counts: 核心 libraryCounts, view, items, total }`（核心 `listLibrary`） | S6 |
| `searchLibrary(q, filter)` | 字符串（≤ 200 字）；`filter = { view: 'kept' \| 'authored' \| 'all', topics, days }` | 核心 `search` 的结果数组 | S6 搜索框 |
| `readNote(id)` | id 必须在索引里，否则 `bad_arguments` | 核心 `readNote` | S6 正文与右栏 |
| `editNote(id, changes)` | `changes` 只能有 `title` / `topics` / `body` | `{ id, file, entry }`；核心 `bad-edit` / `invalid-note` → `bad_arguments`；发 `library-changed` | S7 |
| `openInObsidian(id)` | id 在索引里 | `null`；`shell.openExternal('obsidian://open?path=<绝对路径>')`，打不开时 `shell.openPath(路径)`（测试只记日志） | S6「用 Obsidian 打开」 |
| `getSources()` | 无 | 核心 `sourcesView` | S5 |
| `guessSource(input)` | 字符串 | 核心 `guessSource` | S5「加来源」第一步 |
| `trySource(source)` | 来源对象（形状同 streams.json 的一项） | 核心 `fetchSource` 的结果，只回 `{ status, hint, http, message, count, sample: [前 3 条的 {title, date}] }`；不写盘 | S5「试抓」 |
| `addSource(source)` | 见核心 5.6 | 核心的返回；错误码 → `bad_arguments`；发 `library-changed` | S5 |
| `updateSource(name, patch)` | 见核心 5.6；`name` 必须在 streams.json 里 | 同上 | S5 |
| `removeSource(name)` | 同上 | 同上 | S5 |
| `setSourcePaused(name, paused)` | 同上；`paused` 布尔 | 同上 | S5 |
| `addManualLink(url, title)` | http(s) 地址；title 可为空串 | 核心 `addManual` 的返回；真登记了（`added: true`）才发 `library-changed` | S5「贴一个链接进待看」 |
| `addTopic(topic)` | 见核心 5.6 | 核心的返回；发 `library-changed` | S5「主题」 |
| `updateTopic(name, patch)` | 见核心 5.6；`name` 必须在 streams.json 里 | 同上 | S5「主题」 |
| `removeTopic(name)` | 同上 | 同上 | S5「主题」 |
| `getPipeline()` | 无 | `{ config: 核心 pipelineConfig, defaults: 同形状的默认配置（「恢复默认」用）, lastRound: 核心 roundLog 最近一行 \| null, dismissReasons: recentDismissReasons(10), verdictFailures: { [节点 id]: recentVerdictFailures(…, 5) } }` | S4 |
| `savePipeline(cfg)` | 整份 pipeline 配置 | `{ config }`；核心 `locked-node` / `bad-config` → `bad_arguments` | S4「保存」「恢复默认」 |
| `previewNode(nodeId, url, draft)` | `nodeId` 是配置里的关卡或摘要；url 必须在账本里；`draft` 是页面上正在改、还没保存的那个节点（`id` 必须等于 `nodeId`），或 `null` 用已保存的（方案 C3：改了要求先试一条再保存）；草稿不过核心的配置校验 → `bad_arguments` | 核心 `previewNode`（连接失败的 `{ ok: false, code }` 原样作 `data`）；不写账本 / inbox / verdicts；计入连接的用量（`purpose: preview:<节点 id>`）；没选连接 → `no_connection` | S4「试一条看结果」 |
| `getStatus()` | 无 | `{ ...核心 statusView, connections: getConnections() }` | S11 |
| `openLogsFolder()` | 无 | `null`；`shell.openPath(<库>/_pipeline/logs)`（测试只记日志） | S11「打开运行记录文件夹」 |
| `getGraph(filter)` | `{ days: number \| null, status: 'kept' \| 'all', topics: string[], links: boolean }` | 核心 `graph` | S9 |
| `askLibrary(question)` | 1–500 字（去掉首尾空白后） | 核心 `ask` 的返回（连接失败的 `{ ok: false, code }` 原样作 `data`）；一次只许一个问题在跑（第二个 → `bad_arguments`）；没选连接 → `no_connection`（新错误码） | S10 |
| `getDemands()` | 无 | 核心 `demands` | S10 右栏 |
| `addDemand(topic, question)` | 主题非空 | 核心 `addDemand` | S10「记到想补的主题」 |
| `answerFeedback(question, note)` | 两个非空字符串 | `{ ok: true }` | S10「这个回答哪里不对」 |
| `getVerdicts(url)` | url 在账本里 | 核心 `verdictsFor` | S15 |
<!-- bridge:end -->

### 4.1 §四补：数据形状（11-03 定稿，界面 A 的建方按此做）

**连接** `getConnections()`：
```json
{ "active": "claude-code" | "codex" | "api" | null,
  "kinds": {
    "claude-code": { "installed": true, "loggedIn": true, "version": "2.1.287", "code": null, "model": null, "verifyModel": null, "models": [{ "id", "label", "recommended" }] },
    "codex":       { "installed": true, "loggedIn": false, "version": "0.166.0", "source": "desktop-app", "code": "not-logged-in", "model": null, "verifyModel": null, "models": [...] },
    "api":         { "installed": true, "loggedIn": false, "hasKey": false, "keyHint": null, "vendor": "anthropic", "baseUrl": null, "vendors": [{ "id", "label" }], "model": null, "verifyModel": null, "models": [...] }
  },
  "probes": { "claude-code": { "ok": true, "latencyMs": 2800, "model": "…", "at": "ISO" } | null, "codex": null, "api": null },
  "recommended": "claude-code" | "codex" | "api" | null }
```
`recommended`：第一个 `loggedIn`（api = `hasKey`）的，按 claude-code → codex → api。`api.installed` 永远 true。模型表与厂商表来自核心（`modelsFor`、`VENDORS`），界面不写型号名、厂商名（V7：品牌词只在型号表里）。

**今日** `getHome()`：
```json
{ "library": { "path", "name", "count" },
  "numbers": 核心 homeNumbers(),            // caught · inbox · inboxOldestDays · kept · dismissed · lastRound · sources{level, lines}
  "lastRound": 核心 roundLog 的一行 | null,
  "roundState": getRoundState(),
  "recentKept": [{ "id", "title", "source_name", "date", "kept" }],   // 索引里 status kept 按 kept 日期倒序 3 条
  "connection": { "kind", "model" } | null,
  "nextRun": null,                            // 定时 11-06
  "problem": { "code": "connection" | "not-writable" | "index", "connectionCode": "login-expired" | …, "kind": "claude-code", "caughtKept": 34 } | null }   // 上一次 startRound 的自检失败 → S13
```

**事件**（下表加四个）：`library-changed`（payload `{ path, name } | null`）、`connections-changed`（`null`）、`round-progress`（`{ roundId, phase: 'self-check' | 'fetch' | 'gate:<id>' | 'summary' | 'done', counts, calls, cap, done: boolean, result?, problems? }`）、`inbox-changed`（`{ count }`）。

**开发与测试的钩子**（打包后的应用不认）：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>`（代替选文件夹对话框）、`STREAMS_DEV_CONNECTION=fake | login-expired | bad-format-once`（三种连接全部换成核心的假连接器 / 脚本连接器，`detect` 回「已装已登录」，probe 与一轮都走它；`login-expired` 让自检失败，演 S13）、`STREAMS_DEV_LIBRARY`（已有）。

**实做差别**（11-03 主进程建方，以代码为准；契约原文不改）：

- `getConnections().kinds.*.code`：三种都带（没问题是 null）；`api` 没存 key 时是 `bad-key`（核心 `detect` 的码）。`claude-code` / `codex` 的检测在第一次 `getConnections` 时做一次并记住，之后只有 `detectConnections` 重做；`setApiVendor` / `setApiKey` / `removeApiKey` 会让 `api` 这一项重新判。`codex` 多一个 `source`（核心给的 `command | path | desktop-app`）。
- `probes[kind]` 失败时带 `code` 与 `detail`（核心已把 key 抹掉）。页面发起的 `probeConnection` 在打开库时记进库的 `_pipeline/usage.jsonl`（`purpose: probe`）。
- `getHome().problem.caughtKept` = `numbers.caught`（还停在「抓到的」、没丢的条目数）；`kind` 是出错时选定的连接，没选连接时为 null。`getHome().connection.model` 是解析后的主模型（Claude Code / Codex 没填型号时为 null = 工具自己的默认）。
- `round-progress`：`phase` 为 `self-check`（`startRound` 一进来）→ `fetch`（自检过了、后台开始）→ 每条打完 `gate:<id>` / `summary` → `done`。`counts` 在 `fetch` 阶段为 null；`cap` 是这一轮用的上限。后台抛了异常也发 `done`，`result: null`、`problems: [{ code: 'internal', detail }]`，并进 `getRoundState().lastProblems`。
- `getRoundState().roundId`：在跑时是当前这轮的，否则是上一轮的（没跑过为 null）；`progress` 是最后一条 `round-progress` 的 payload。
- `applyStarterPack` 整体替换 `streams.json` 的 `topics` / `sources`（首次设置只做一次），其余键（`name`、`pipeline`、页面写的 `setup`）原样保留；坏的 `edits`（不是 http(s) 地址、重名）→ `bad_arguments`，什么都不写。来源名重复 → `bad_arguments`。
- `rebuildIndex()` 也发一次 `library-changed`；`useChosenFolder` / `openRecentLibrary` 打开时顺手重建一次索引（失败只记日志），并额外发 `settings-changed`（`libraryPath` 变了）。
- 开发钩子 `STREAMS_DEV_CONNECTION` 下 `api` 的 `hasKey` / `keyHint` 仍看真的密钥仓，`loggedIn` 看假连接器。

**首次设置**（S1，`screens/first-run.js`）：没打开库时 `app.js` 显示它（代替侧栏九入口），四步在自己的侧栏里：库放哪 → 连接方式 → 主题与来源 → 试跑一轮；每步的「谁定的」（用户选的 / 接受默认 / 跳过）记进 `streams.json` 的 `setup`（核心不读它）。连接步可跳过。做完 → `today`。

**界面 A 的六屏**：`first-run`（S1 四步）· `today`（S2 + S13 的出错卡片）· `inbox`（S3，键盘 J/K 上下、C 收藏、D 放弃、L 稍后；放弃对话框理由必填，右栏最近的放弃理由）· `run`（S12，`today` 上的对话框，不是独立屏）· `settings`（S14：连接方式 / 运行 / 库 / 软件四块；软件块 = 已有的语言 / 高级 / 关于）。按钮「去登录」出现在 S1 第 2 步、S13 卡片、S14 连接方式，副句「会打开一个终端窗口，由它自己完成登录；流息不经手任何凭据」，回路控件「我登录好了，再试一次」= `detectConnections`。

### 4.2 §四补：界面 B 的屏（11-03 下午定稿，维护者「界面A和界面B一起开工」）

核心形状一律见 `docs/core-api.md` 第五节；桥只做包装与参数检查，不改形状（`getLibrary` 多一个 `counts`，`getStatus` 多一个 `connections`，`trySource` 只回摘要）。

| 屏 | 文件 | 要点 |
|---|---|---|
| S6 资料库与阅读 | `screens/library.js` | 三栏：列表（顶上搜索框、四个分页带条数、主题与「最近 30 天」筛选）· 正文（Markdown 渲染：标题、段落、列表、粗体、`[[链接]]` 可点跳到那一条，不用 innerHTML，自己把 Markdown 切成元素）· 右栏 `Panel`（这一条：主题、来源、关卡①②分数与理由、新鲜度、文件名；链到这里的；同一来源的）。顶栏「编辑」「用 Obsidian 打开」「打开原文」。「抓到的」分页：标题、来源、首次见到、各关分数、停在哪一步（词在字典里）。「待规范」分页只读列出文件与问题（写头在 11-06） |
| S7 编辑一条 | `screens/edit-dialog.js` | `Dialog`：标题输入、主题（标签 + 下拉加，选项来自 streams.json 的主题）、正文 textarea、「插入 [[链接]]…」（搜索框选一条，插入 `[[标题]]`）；「来源、日期、分数不能在这里改，它们是记录。」；保存 → `editNote` → 关对话框并重读 |
| S5 来源与主题 | `screens/sources.js` | 来源行：名字、kind · 地址或检索词、五态词 + 条数 / 连续轮数 + 「怎么办」句（`hint` → 字典）、主题、「试抓」「暂停 / 恢复」「改地址」「删除」（删除要确认）。顶栏「贴一个链接进待看」「加来源」。加来源对话框：贴地址或检索词 → `guessSource` → 可改 kind → 名字、默认主题 → 「试抓」显示条数与最新一条样例 → 「加入」。主题表：名字、关键词（「固定锚，软件不会自己改」）、已收藏条数；加 / 改关键词 / 删 |
| S4 流水线 | `screens/pipeline.js` | 节点条：固定（锁 + 一句解释）· 脚本 · 模型关卡 · 摘要 · 固定，箭头相连；选中一个关卡：要求（textarea）、输出格式（只读 code）、过关线（数字 0–1）、材料（只看标题摘要 / 读正文）、工具（固定：没有）、核对单（底线项标「底线」不可删，自己的项可加可删）、「试一条看结果」（从最近抓到的里选一条 → `previewNode` → 显示分数、理由、核验结果）、「保存」「恢复默认」。右栏：上一轮各节点的数量、最近的放弃理由、最近没通过核验的原因 |
| S11 运行状态 | `screens/status.js` | 四格数字（上次运行 · 上次你拍板 · 本月调用次数 · 下次运行；`data-num`）· 连接三行（复用设置页导出的连接行零件：状态、「现在试一次」、未登录时「去登录」+ 副句 + 「我登录好了，再试一次」——这是第四处）· 来源（最近一轮）每行五态词 + 连续轮数 + 「软件已经做了什么 / 需要你做什么」· 顶栏「复制诊断信息」「打开运行记录文件夹」 |
| S10 问库 | `screens/ask.js` | 顶栏「只用库里的东西回答」+ 范围（已收藏 n 条 · 我写的 n 条）；对话列表（问题 → 回答：每句后面上标出处编号，点编号在下方出处列表里高亮并可打开那一条）；`removedCites` / `removedSentences` 非零时提示「有 n 处出处不在库里，已删掉」；`notInLibrary` 时「库里没有」是正式答案 + 「记到想补的主题」（`missing` 预填）；「这个回答哪里不对」（textarea → `answerFeedback`）。右栏两块：「这次用了什么」（命中 n 条 · 用了 n 条 · 调用 n 次 · 连接名 · 没给模型任何工具，不联网）；「想补的主题」（`getDemands`，≥ 3 次标「建议加成主题」）。问题在跑时输入框禁用、显示「正在查库……」 |
| S9 图谱 | `screens/graph.js` | 顶栏筛选：最近 30 天 / 全部、只看已收藏 / 全部、显示 [[链接]] 开关。SVG：三行（主题 · 来源 · 条目），节点位置 = 核心给的 `row` / `col` 乘固定间距（不做力导向、不做动画），节点大小随 count，实线边 topic→item、source→item，虚线边 link；`[data-node=<id>]` 与 `[data-edge]` 挂钩；点条目节点右下浮层显示标题、来源、日期、状态、链到的，「打开」→ 资料库那一条。条目多于 60 个时只画前 60 个并提示「只画了最近的 60 条」 |
| S15 核验记录 | `screens/verdict-dialog.js` | `Dialog`：按轮次列每一项（过 / 没过 · 规则 / 判定 · 证据），「说做了其实没做」单独标；结果行（通过 / 未通过 · n 轮 · n 次调用）。从资料库右栏（这一条）与待看卡片的「这一条的记录」打开（待看卡片的入口由 PM 在集成时接） |

**实做差别（界面 B 主进程）**（11-03 主进程建方，以代码为准；契约原文不改）：

- 参数检查（`bridge-methods.mjs`）：`getLibrary` / `searchLibrary` / `getGraph` 的 `filter` 可以是 `null`（= `{}`），键都可省，多出的键 → `bad_arguments`；`topics` ≤ 50 个、每个 ≤ 100 字；`days` 为 `null` 或正整数。`editNote` 的 `changes` 至少一个键，`title` 非空 ≤ 300 字，`topics` 非空字符串 ≤ 20 个，`body` ≤ 100 万字。id ≤ 200 字，名字 ≤ 100 字，url ≤ 2000 字；来源 / 主题对象、patch 写成 JSON ≤ 1 万字，`savePipeline` 的整份配置 ≤ 20 万字。`addDemand` 的 `question` 可为空串（≤ 500 字）；`answerFeedback` 的问题 ≤ 500 字、意见 ≤ 2000 字。
- 核心错误码 → 桥：`bad-argument` · `bad-edit` · `invalid-note` · `not-editable` · `bad-source` · `bad-topic` · `bad-input` · `bad-url` · `bad-feedback` · `bad-question` · `bad-view` · `locked-node` · `bad-config` · `not-found` 与一切 `duplicate-*` → `bad_arguments`（`bridge-methods.mjs CORE_BAD_ARGUMENT_CODES`）；其余 → `internal`。核心还没有的函数（W5 未落地时）→ `internal`，日志写函数名。
- 「库里已有」的核法：`readNote` / `editNote` / `openInObsidian` 的 id 在 `readIndex` 里；`previewNode` / `getVerdicts` 的 url 在 `replayLedger` 的 states 里；`updateSource` / `removeSource` / `setSourcePaused` 与 `updateTopic` / `removeTopic` 的名字先在 `streams.json` 里查一遍，没有 → `bad_arguments`。
- `openInObsidian`：核心 `notePath` 给的路径必须在 `<库>/notes/` 之内（按文字核），否则 `internal`；`openExternal` 失败才 `openPath`，`openPath` 也失败 → `open_failed`。`openLogsFolder`：文件夹不在或 `openPath` 失败 → `open_failed`。hidden 下两者都只记日志、回 `null`。
- `trySource`：只取来源对象里抓取器读的键（`name` `kind` `url` `query` `topic` `min_points` `max_results`）；`kind` 不在核心 `SOURCE_KINDS`、rss 没有 http(s) 地址、arXiv / HN 没有检索词 → `bad_arguments`，不发请求。`sample` 每项 `{ title, date }`，`http` 没有时为 `null`。
- `searchLibrary`、`getLibrary`、`getGraph`、`getStatus`、`addDemand`、`answerFeedback` 把主进程的时钟（`now` 函数）传给核心。
- `askLibrary` 的模型调用经 `createUsageCounter(库).wrap(连接器, 'ask')` 记进 `usage.jsonl`。
- `savePipeline` 返回的 `config` 是保存后重读的 `pipelineConfig`（带底线项）。`getPipeline().verdictFailures` 的键是配置里全部关卡与摘要节点的 id。
- 发 `library-changed`（payload 同 §4.1）的：`editNote`、`addSource`、`updateSource`、`removeSource`、`setSourcePaused`、`addTopic`、`updateTopic`、`removeTopic`、`savePipeline`，以及真登记了的 `addManualLink`。
- 没选连接时 `startRound` 跑一轮**不打分**的（方案 S1「没有连接也能抓，只是不打分，全部进待看」）：`selfCheck(dir, { connector: null, scoreless: true })` 与 `runRound(dir, { connector: null, scoreless: true, … })`，抓到的全部进待看、0 次模型调用；`round-progress` 的 `result` 与 `getHome().lastRound` 里带 `scoreless: true`；这种轮写待看时核心报的 `inbox` 阶段在事件里仍记 `phase: 'fetch'`（页面的阶段词表没有 `inbox`），不出现 `gate:*` / `summary`。选了连接时照旧（连接器坏 → `started: false` 与 S13）。

**新错误码** `no_connection`：要调模型的方法（`askLibrary`、`previewNode`）在没选连接时回它；页面说「还没选连接方式」并给「去设置」。

**侧栏**：九个入口都成真屏（界面 B 后 `placeholder.js` 只剩不用的工厂，可删）。

**回答一律是信封**，不抛异常：`{ ok: true, data }` 或 `{ ok: false, error: { code } }`。`code` 只有 `bridge-methods.mjs ERROR_CODES` 里的几个：`refused`（不是本应用页面的主框架发来的）、`bad_arguments`、`no_library`、`open_failed`、`no_connection`、`internal`。细节只进 `logs\main.log`，不给页面。

**页面里怎么调**：`import { call } from '../lib/bridge.js'` → `const data = await call('getAppState')`；失败时抛 `BridgeError`，`err.code` 是上面的代码之一。

**加一个方法**：1. `src/main/bridge-methods.mjs` 的 `BRIDGE_METHODS` 加一项（`args` 个数、可选 `check`）；2. 处理函数放进 `main.mjs` 的 `registerBridge({ handlers })`（业务放 `src/main/services/` 或自己的 wiring）；3. `src/preload/preload.cjs` 的 `METHODS` 加同名；4. 本节上表加一行。少一处 `npm test` 就红；主进程启动时也核「处理函数 = 表」。规矩：参数在主进程里核；页面给的路径不直接进文件系统；不返回任何 key。

**事件：主进程推给页面**。一条通道 `streams:event`，消息是 `{ topic, payload }`：主进程里 `emit(topic, payload)`（`events.mjs createEmitter`），只发给还开着、地址是 `app://ui/` 的窗口，主题不在 `EVENT_TOPICS` 里就抛错；页面里 `onEvent('<主题>', payload => …)`，返回的函数就是 effect 的清理。

<!-- events:begin -->
| 主题 | `payload` | 什么时候发 | 谁在听 |
|---|---|---|---|
| `settings-changed` | `null` | 设置变了（语言、库、开关） | `app.js`：重读应用状态 |
| `open-screen` | `{ screen }` | 页面该去某一屏：点了应用的 Windows 通知（`services/notify.mjs`） | `app.js` |
| `update` | `getUpdateState()` 的同一份数据 | 更新有了新东西：开始检查、检查完、下载进度、下完 / 失败 / 校验不过、开始启动安装 | 设置页「关于」（`lib/use-update.js`） |
| `library-changed` | `{ path, name } \| null` | 打开 / 新建了库，或索引重建了（收藏之后） | `app.js`：重读应用状态；今日 |
| `connections-changed` | `null` | 连接的设置变了（选定、模型槽、key 存了或删了） | 设置、S1 |
| `round-progress` | `{ roundId, phase, counts, calls, cap, done, result?, problems? }` | 一轮的每个阶段开始、每条打完分、跑完或停下 | 今日、S12 |
| `inbox-changed` | `{ count }` | 待看变了（一轮写入、收藏、放弃） | 侧栏角标、待看、今日 |
<!-- events:end -->

**加一个主题**：`src/main/events.mjs` 的 `EVENT_TOPICS` 加一项、`src/preload/preload.cjs` 的 `EVENT_TOPICS` 加同名、上表加一行；少一处 `npm test` 就红。

## 五、界面写法

**选型：Preact 10 + htm，原生 ES 模块，不构建**（理由照云织：离线、合严格 CSP、小、局部更新）。

```
src/renderer/
  index.html        CSP <meta>、import map（preact、preact/hooks、htm）、styles/app.css、app.js
  app.js            App：当前路由、navigate()、应用状态；显示当前屏幕；没打开库时显示首次设置（screens/first-run.js），做完才回到入口
  lib/              html.js · bridge.js（call、onEvent）· use-load.js · use-update.js · format.js（fmt、日期）· app-context.js（useApp）· use-events.js（useEvent、useInboxCount：待看角标）· action.js（Act：带 data-action 的按钮）· markdown.js（renderMarkdown：笔记的 Markdown 切成 Preact 元素，不经 HTML 字符串）
  kit/              组件（下表），从 kit/index.js 引
  screens/          index.js（SCREENS：id → 组件；FIRST_SCREEN）· first-run.js（S1 四步）· today.js（S2 + S13 出错卡片）· run-dialog.js（S12，今日上的对话框）· inbox.js（S3）· settings.js（S14 四块；连接行的零件也从这里导出）· settings-update.js · library.js（S6）· edit-dialog.js（S7，资料库上的对话框）· verdict-dialog.js（S15，资料库与待看共用的对话框）· sources.js（S5）· pipeline.js（S4）· status.js（S11）· ask.js（S10）· graph.js（S9）· placeholder.js（界面 B 之后没人用的占位工厂）· kit.js（开发时）
  texts/            页面自己写的所有字：common.js（品牌、侧栏、五种状态、日期、三种连接与登录回路的词、节点名、阶段名）· first-run.js · today.js · inbox.js · run.js · settings.js · library.js（含编辑与核验记录两个对话框的字）· sources.js · pipeline.js · status.js · ask.js · graph.js · screens.js（占位页）· kit.js；common.js 末尾加了界面 B 共用的：五态的「怎么办」句 `FETCH_HINTS`、`SOURCE_STATES`（已暂停 / 还没抓过）、`SOURCE_KINDS`、`NOTE_STATUS`、`NO_CONNECTION`
  texts-en/         英文字典，与 texts/ 同名同键（§六）
  styles/           app.css（@import 列表）· tokens.css（token 名单，docs/tokens.md）· base.css · kit.css · menu.css · screens/<屏幕>.css
```

**侧栏**（`kit/sidebar.js AppSidebar`）：品牌「流 · 流息 · STREAMS」、库名那一行（`SidebarLibrary`：库的文件夹名，没有就是「未打开库」）、九个入口里的八个（今日 · 待看 · 资料库 · 图谱 · 问库 · 流水线 · 来源与主题 · 运行状态，`NAV_ENTRIES`，每个 `a[data-nav=<id>]`）、底部「设置」。当前项画成白卡片。「待看」后面有角标（`[data-badge="inbox"]`）：等你看的条数，来自 `getHome().numbers.inbox`，之后跟 `inbox-changed` 的 `count`（`lib/use-events.js useInboxCount`，由 `app.js` 放进 `useApp().inboxCount`）；0 或没打开库时不画。

**加一屏**：1. `screens/<id>.js` 导出组件，外面套 `AppFrame`（`sidebar=${html\`<${AppSidebar} current=${id} />\`}`），`Main screen=${id} state=${…}`；2. `screens/index.js` 的 `SCREENS` 把占位换成它；3. 字写进 `texts/<id>.js` 并给 `texts-en/<id>.js`；4. 样式写进 `styles/screens/<id>.css`（类名用屏幕前缀），在 `styles/app.css` 加 `@import`；5. 数据走 §四 的桥。

**首次设置**（`screens/first-run.js`，S1）：不是入口里的一屏，`app.js` 在应用状态第一次回来、`library` 为 null 时显示它（`setup` 状态），直到它调 `onDone(screen)`；开发时也可以按 id 打开（`npm start -- --screen first-run`）。它用侧栏零件（`Sidebar`）自己摆四步（`[data-step][data-step-state=current|done|todo]`），每步一个组件：库放哪（`chooseLibraryFolder` → `useChosenFolder('')`）、连接方式（三张卡 `[data-connection][data-selected]`，「用这一条」= `setActiveConnection` + `probeConnection`，未登录的卡带登录回路，可跳过）、主题与来源（`getStarterPacks` → 删来源 / 加 RSS → `applyStarterPack`，每个来源的试抓状态用 `st-fetch`）、试跑一轮（`estimateRound` → `startRound`，`round-progress` 画在 `[data-part="round-progress"][data-phase][data-done]`，跑完「去待看」「去今日」）。「谁定的」这次不写盘（没有桥方法，见 §九）。连接行的零件（检测词 `detectWords`、`connectionState`、登录回路 `LoginLoop`、试调结果 `ProbeLine`、key 对话框 `ApiKeyDialog`）在 `screens/settings.js` 里，首次设置和今日的出错卡片共用。

**界面 B 的屏**（11-03，§4.2 的要点；数据一律经桥，改了库之后听 `library-changed` 重读；页面不算数字，条数、状态、分数都是桥给的）：
- `library`（S6）：主区里两栏（列表 300px · 正文），右栏 `Panel` 是「这一条」。列表：搜索框（停 250 ms 后 `searchLibrary`，≤ 200 字）、四个分页（`getLibrary(view, filter).counts`，`[data-view][data-count]`）、主题与「最近 30 天」筛选（`[data-filter-topic]` `[data-filter-days]`，主题名来自 `getSources().topics`）、行 `[data-row=<id | url | 文件名>]`。正文：`lib/markdown.js` 画，`[[链接]]` 按核心的规则（先 id、再标题）在已收藏 + 我写的里找，找到的可点（`[data-wiki-id]`）、找不到的只画成灰字（`[data-wiki-missing]`）；正文里的普通网址只显示、不跳（页面离不开 `app://ui/`）。右栏：主题、来源、各关分数、文件名、「这一条的核验记录」、链到这里的、同一来源的。「抓到的」行带各关分数与停在哪一步（`[data-stopped]`，词在 `texts/library.js`），点开可看核验记录；「待规范」只读列出文件与问题码的说法。顶栏「编辑」「用 Obsidian 打开」（`openInObsidian`）「打开原文」（`openItemUrl`，只给 http(s) 来源）。`navigate('library', { id })` 直接打开那一条（图谱、问库的出处用它）。
- `edit-dialog`（S7）：`Dialog name="edit"`，只有标题、主题（标签 × 去掉；「+ 加主题」选项来自 streams.json 的主题）、正文三个字段；「插入 [[链接]]…」用 `searchLibrary` 找一条，把 `[[标题]]` 插在光标处；没有主题时「保存」不能按；保存只送改了的键（`editNote`），`bad_arguments` 说「这样改不合规范，文件没有动」。
- `verdict-dialog`（S15）：`Dialog name="verdicts"`，导出 `VerdictDialog({ url, title, onClose })`；按核心 `verdictsFor` 的组（同一步再跑一次是新的一组，按写入顺序）逐轮列每项：过 / 没过、规则 / 判定、证据；`claimedNotDone` 单独一行「说做了其实没做」；核对项的说法取 `getPipeline` 的核对单 `desc`，没有就显示 id；结果行 = 这一步最后一组全过与否 + 轮数。待看卡片的入口由 PM 集成时接。
- `sources`（S5）：来源行 `[data-row=<name>][data-state]`（五态 / `paused` / `never`）、`[data-hint]`（`FETCH_HINTS`）、「试抓」（`trySource`，结果 `[data-tried]`）、「暂停 / 恢复」、「改地址 / 改检索词」（`[data-dialog="edit-source"]`）、「删除」（`[data-dialog="remove-source"]` 先问）。「加来源」（`[data-dialog="add-source"]`）：识别（`guessSource`）→ 可改种类、地址、名字（核心建议的 `name` 预填）、默认主题 →「试抓」→ 只有对现在这份填写试抓过、且结果是正常 / 没新内容 / 暂时失败时「加入」才能按（改了地址要重试）。「贴一个链接进待看」（`[data-dialog="add-link"]`，`addManualLink`，见过的说「已经见过」）。主题表 `[data-topic-row]`：关键词可改（逗号或顿号隔开）、加、删（先问）。
- `pipeline`（S4）：节点条 `[data-flow-node][data-kind][data-locked]`；选中模型关卡或摘要：要求、输出格式（只读，`JSON.stringify(output)`）、过关线（0–1 之外在页面就拒、不发送）、材料、工具（没有）、核对单（`origin: 'streams'` 标「底线」、没有删除钮；自己的项至少 6 个字才加）、「试一条看结果」（从 `getLibrary('caught')` 选一条 → `previewNode`；没选连接 → `NO_CONNECTION` +「去设置」）。保存把 `getPipeline().config` 改过的整份交给 `savePipeline`。右栏：上一轮各节点（`lastRound`）、最近的放弃理由、各步最近没通过核验的原因。
- `status`（S11）：四格 `[data-num=last-run|last-decision|month-calls|next-run][data-value]`（`statusView` 的 `lastRound.startedAt` · `lastDecisionAt` · `monthUsage.calls` · 定时未接时 `none`）；连接三行用设置页导出的零件拼（`connectionState` · `detectWords` · `LoginLoop` · `ProbeLine` · `probeView`），未登录的行是第四处「去登录」+ 副句 +「我登录好了，再试一次」；来源行五态词 + 连续轮数 + 「软件已经做了什么 / 需要你做什么」，地址有问题 / 被拒绝的行有「去处理」→ 来源与主题。顶栏「复制诊断信息」「打开运行记录文件夹」。
- `ask`（S10）：顶栏范围（`getLibrary` 的 `counts`）；每轮问答 `[data-turn][data-state]`，每句后面的出处编号 `[data-cite]` 可点、在下方出处表 `[data-source-n][data-highlight]` 里标出，「打开」→ 资料库那一条；`removedCites` / `removedSentences` 非零各一行提示；`notInLibrary` 画成正式答案「库里没有。」；有 `notInLibrary` 或 `missing` 时给「记到想补的主题」（预填 `missing`）；「这个回答哪里不对」。问着时输入框禁用、显示「正在查库……」；`no_connection` →「去设置」。右栏：这次用了什么（命中 / 用了 / 调用 / 连接名 / 没给工具不联网 / 核对几轮）、想补的主题（`getDemands`，`suggest` 标「建议加成主题」）。`Answer` 组件导出给页面内的测试画一条给定的答案。
- `graph`（S9）：节点位置 = `PAD_X + col × COL_GAP`、`PAD_Y + row × ROW_GAP`（`screens/graph.js` 导出这几个常数与 `place`），大小随 `count`；实线 topic / source → item，虚线（弧线）link；`svg[data-part="graph"]` 带着这份数据的 `data-days` / `data-status` / `data-links`（核心回显的 `filters`），测试据此等新数据画好。点条目开右下的框（`readNote` 补来源、日期、状态）。多于 60 条只画日期最近的 60 条（日期从 `getLibrary` 的条目取：图谱的节点不带日期），保持核心的列序。

**规矩**（测试会核）：页面写的每一个字都在 `texts/` 里（别处的字符串里出现汉字就红，`test/wording.test.mjs`）；`texts/` 里的每个字串过用词扫描器 0 命中（V7 禁词：Bronze / Silver / Gold / judge / keeper / gate / Medallion / pending / ledger；品牌词只许在「连接你电脑上的 …」里，`wording/banned-terms.json`）；汉字旁一律全角标点；英文表与中文表键一一对应、没有汉字、没有禁词（`test/texts-en.test.mjs`）；**颜色只用 `tokens.css` 的变量**，别的样式文件里写 `#xxxxxx`、`rgb()` 就红，每个 token 都在 `docs/tokens.md` 的名单里（`test/kit.test.mjs`）；不用行内样式字符串、不用 `innerHTML`；源文件只用 LF、不放看不见的字符。测试用的挂钩：`main[data-screen][data-state]`（`ready` 表示数据到了）、`[data-nav=<id>]`、`[data-part=<id>]`、`[data-action=<id>]`（按钮外的一层，`lib/action.js Act`）、`[data-num=inbox|caught|passed|kept][data-value]`（今日的四个数字）、`[data-dialog=run|dismiss|api-key]`、`[data-card][data-url][data-current]`（待看的卡）、`[data-connection=<kind>][data-conn-state]`（连接行）。页面不算数字：今日的四个数字直接是 `getHome` 的 `numbers.inbox` · `numbers.caught` · `lastRound.counts.inbox` · `numbers.kept`。

**组件**（`kit/index.js`；`npm start -- --screen kit` 看全部）：`AppFrame` / `Main` / `Panel`（232 · 主区 · 404，间距 12）、`AppSidebar` 与侧栏零件、`TopBar`、`Button` / `LinkButton`、`PanelTabs`、`CardFrame`（`waiting` · `answered` · `plain`）、`Steps` / `StageProgress` / `stepClass`（小方块）、`Tag` / `Notice`（`wait` · `done` · `recommend` / `plain`）、`Icon`（线条图标；新增 `inbox` · `graph` · `flow` · `rss`）、`Popover`、`Menu`、`Dialog`；五种抓取状态的小标签是 CSS 类 `st-fetch st-fetch--<state>`（`kit.css`，颜色 `--st-fetch-*`）。文字样式类 `st-t-heading` · `st-t-title` · `st-t-body` · `st-t-small` · `st-t-tiny` · `st-t-sub` · `st-t-muted` · `st-t-strong` · `st-t-wait` · `st-t-done` · `st-t-num`。

## 六、语言

照云织：`settings.json` 的 `language`（`auto` · `zh-CN` · `en`，`locale.mjs`），`auto` 跟系统（系统显示语言里有中文就是中文）；页面在英文下由 `app://ui/` 用 `texts-en/<name>.js` 代替同名 `texts/<name>.js` 发出，`<html lang>` 与窗口标题跟着 `BRAND`；设置页切换后页面自己重新载入。开发时 `npm start -- --lang en`，测试钉中文（`STREAMS_DEV_SYSTEM_LANGUAGES=zh-CN`）。英文版叫 Streams，侧栏：Today · Inbox · Library · Graph · Ask · Pipeline · Sources & Topics · Status · Settings。

## 七、测试

`npm test`（node:test，`--test-concurrency=1`）。带 Electron 的测试每个文件起一次应用：系统临时目录下一个空世界（`scripts/lib/world.mjs`）、Playwright 启动钉死的 Electron 44.0.0、窗口不显示，跑完关应用（超时就结束整棵进程树，`scripts/lib/close-app.mjs`）再删文件夹。

| 文件 | 核什么 | 起 Electron |
|---|---|---|
| `security.test.mjs` | 页面里没有 Node；外部地址在页面里被 CSP 拒、在会话里被拒（本机测试服务器一个请求也没收到）；桥只回应本应用的页面；权限一律拒；下载被拒；WebRTC 不发 UDP；CSP 头与 `<meta>`；不能写 HTML、不能 eval；`app://` 不越界；桥上恰好是 §四 的方法；Electron 自己的数据在受保护目录、本地数据在外面、真的 `%APPDATA%\Streams` 没被建 | 是 |
| `events.test.mjs` | `emit` 只发表里的主题、只发给开着的本应用页面；`onEvent` 只收表里的主题与函数、只交 `payload`、能取消；`setShowDeveloperInfo` → `settings-changed` → 页面重读状态、不重载；`open-screen` 让页面去那一屏；侧栏 232px、主区从 244 起、页面不横向溢出 | 是 |
| `language.test.mjs` | 英文界面：侧栏九个词、窗口标题、`<html lang>`；设置页切中文重载、切跟随系统不重载；没设置时系统无中文 → 英文 | 是 |
| `single-instance.test.mjs` | 第二次启动立刻退出、第一个把窗口提到前面 | 是 |
| `protocol.test.mjs` | 不起 Electron：页面文件 200；指向别的机器的写法 1 秒内 404；路径规则逐条；中文文件名；英文下 `texts/` 换 `texts-en/`；组件一览只在开发时发 | 否 |
| `bridge.test.mjs` | 预加载、主进程表、本文 §四 表三者一致；事件主题三处一致；预加载只交出一个对象；信封与错误码 | 否 |
| `layout.test.mjs` · `settings.test.mjs` · `locale.test.mjs` | 布局；settings.json 的每个字段；语言的判定与状态 | 否 |
| `kit.test.mjs` | tokens.css 与 docs/tokens.md 名单一致；别处不写颜色；五种状态各有一对 token；字体与主色是 维护者 定的 | 否 |
| `wording.test.mjs` · `texts-en.test.mjs` | 字典过扫描器 0 命中、全角标点、别处无汉字、LF；英文表与中文表对齐、无禁词 | 否 |
| `app-id.test.mjs` · `icon.test.mjs` · `deps.test.mjs` · `start.test.mjs` | 身份值；streams.ico 的五个尺寸（重建对比要 sharp，没有就跳过并说明）；依赖钉死；`npm start` 的文件夹规矩 | 否 |

**每项检查都能失败**：`npm run mutants` 在临时副本上逐个故意改坏、跑对应的那条测试，要求「没改坏的副本通过、改坏的副本失败」，并核原文件字节没变：`no-node` · `csp-off` · `session-open` · `bridge-extra` · `banned-word` · `d2-unc` · `d3-emit-any-topic` · `d3-any-topic` · `d4-any-sender` · `d4-permissions-open` · `d10-any-root` · `tokens-undocumented` · `colour-outside-tokens` · `en-missing-key`。11-02 首跑：14 项里 13 项 CAUGHT；`d2-unc` 只在「冷」的时候抓得到——Windows 会把连不上的 SMB 主机 `\\192.0.2.1` 记进否定缓存几分钟，缓存热时 realpath 2 毫秒就回来，改坏的副本也过了「1 秒内 404」这条（冷时 21 秒，抓到）。这是测试判据的盲区，不是改坏项的问题；跑它前别碰那个地址。

## 八、从云织拿了什么、没拿什么、改了什么

**拿了（改名后）**：主进程 `main.mjs` 骨架、`layout`（改成 appData + localData 两个目录）、`security`（去掉 `app://draft/` 那一道）、`protocol`、`safe-path`、`bridge` + `bridge-methods`（表只剩外壳的 10 个方法）+ `preload.cjs`、`events`（三个主题）、`secrets`（名字改成 `key-<厂商>`，加 `list()`）、`services/update` + `update-wiring`（`RELEASES_REPO` = `AsuraNale/streams`，`/STRELAUNCH`）、`services/env-proxy-fetch`、`services/notify`（改成通用的「说一句、点了去某屏」）、`diagnostics`、`log`、`quit`、`icon`、`locale`、`version`、`settings`（只剩 language / libraryPath / showDeveloperInfo）、`app-id`（`StarryDigital.Streams`，新 CLSID）；`app-services` 自己写了个最小的。页面 kit 的 frame / sidebar（重写）/ topbar / button / tabs / card / progress（去掉 core-words）/ tag / icons（加四个）/ popover / menu / dialog / index；lib 的 html / bridge / use-load / use-update / format / app-context；styles 的 base / kit（去掉研究流程、余额）/ menu / screens/settings；`screens/settings-update.js`；`index.html`、`app.js`（去掉研究屏路由与余额）。脚本 start（重写）、screenshot（重写：一张真窗口）、run-tests（无夹具）、csp、mutation-check（14 个改坏项）、build-icon 与 lib 的 paths / dev-root / temp（mkdirSync）/ close-app / remove-tree / viewer / icon（sharp 的位置可配）/ mirror（只拷 desktop/）/ world（空世界）。测试 security / protocol / layout / locale / language / app-id / icon / start / single-instance / bridge / events / deps / wording / texts-en 改到能跑，`settings-model` 换成 `settings.test`，新加 `kit.test`。

**没拿**：services/engine、registry、workbench、reading、draft、milestones、projects、new-project、project-admin、balance、usage-ledger、conversation、keycheck、signing、sandbox-check、各 wiring、home-model、reading-model、workbench-model、page-frames、folders、resources、texts 里的研究词、`data/deepseek-prices.json`；页面的研究屏、`kit/balance.js`、`kit/project-menu.js`、`kit/pipeline.js`（引用不存在的研究词与 `shared/pipelines.mjs`，删掉）、`lib/money.js`、`use-balance.js`、`cn-numerals.js`、`core-words.js`、`limit.js`、`first-run` 屏（连接流程是方案 C2，不在今天）；`scripts/test-head.mjs` 与 `lib/mirror.mjs` 的 git HEAD 镜像（它镜像的是云织的 app-core）；按工单编号命名的截图与变异脚本；研究相关的测试；`src/shared/` 里的研究模块（换成 `fetch-states.mjs`）。

**没拿**：`installer/test/`（装、升级、卸载的测试）引用云织的引擎替身、Python 与余额替身，改名后也跑不起来，11-02 验方核出 57 行源产品残留，当天删掉；安装包那一轮（11-06）按流息的安装包重写。

## 九、已知缺口与要定的事

1. 11-03 界面 A 落地：首次设置、今日（含 S13 出错卡片与 S12 对话框）、待看、设置的连接方式 / 运行 / 库三块。同日界面 B 的六屏与两个对话框落地（§五「界面 B 的屏」），九个入口没有占位页了；待看的「去调提示词」落到流水线；待看卡片「这一条的记录」（`VerdictDialog`）由 PM 集成时接。
2. `release.json` 的 `version` 写成 `1.0.0`、`pre_release: dev.0`、`app_ver_name: 流息 1.0.0-dev.0`：`version.mjs` / 更新比较只认 `major.minor.patch` 数字，`1.0.0-dev.0` 填进 `version` 会让应用显示 0.0.0、安装包构建拒绝。要不要改 `VERSION_RE` 以认预发布号，归 PM。
3. 图标是 15 分钟内的记号（三条白色波浪 + river 圆角方块，`assets/icon/README.md`）；小尺寸由大图缩下来，没有像素级手画版；重建要 sharp（不是本仓依赖）。
4. `services/update.mjs` 的更新状态里还有 `turnRunning`（云织的「研究回合在跑」）：现在永远是 false，以后由流水线的「这一轮在跑」接上。
5. `services/notify.mjs` 建了没用：流水线（C5）发「抓到 N 条新的」时接上。
6. 侧栏底色选了 river（方案主色）而不是 ink，理由在 `docs/tokens.md`；要改只动 `--st-sidebar` 一行。
7. 托盘与定时 11-06：今日的「下次运行」在 `nextRun` 为 null 时写「还没设定时」，设置「运行 · 定时」写「还没启用（托盘做好后）」，`getPipelineSettings().schedule` 先是 null。
8. 安装包 11-06 按流息的安装包重写（§八）；界面 A 的六张截图在 `docs/shots/2026-11-03-<screen>.png`，由 `npm run shots -- --world seeded --screen <id>` 在播种世界上拍。
9. ~~`getAppState` 没有 `recentLibraries`~~ 已解决（11-03 PM 集成）：`getAppState().recentLibraries = [{ path, name }]`，设置「库 · 其他」就用它。首次设置每步「谁定的」没有桥方法，这次不写盘（11-06 再定）。
10. ~~「没有连接也能抓」做不到~~ 已解决（11-03 PM 集成）：核心 `runRound({ scoreless: true })`，主进程没选连接时走它（见 §4.2「实做差别（界面 B 主进程）」）；待看卡片对这种条目标「没有打分」并显示来源自带的摘要。
11. 界面 B 的取舍与缺口（11-03）：
    - ~~资料库右栏只有分数没有理由~~ 已解决（11-03 PM 集成）：核心 `readNote` 多返回 `scores`（文件头里的分数与理由），页面右栏照它显示。
    - ~~「试一条看结果」只能试已保存的配置~~ 已解决（11-03 PM 集成）：桥 `previewNode(nodeId, url, draft)`，页面有未保存改动时把正在改的节点作 `draft` 传过去，核心按保存时同一套校验检查后只用这一次、不写盘（方案 C3「改要求 → 试一条 → 保存」）。
    - ~~「恢复默认」没有默认配置~~ 已解决（11-03 PM 集成）：`getPipeline().defaults`。样机的「加一个关卡」「删除这个关卡」不在 §4.2 要点里，这次没做（v1.1）。
    - 图谱的条目节点不带日期，「只画最近的 60 条」靠 `getLibrary` 的条目日期挑；三行直线布局下，主题 → 条目的线可能正好穿过中间那行的某个来源点（样机同样），没另走线。
    - 核验记录的「n 次调用」：`verdictsFor` 不给调用次数，结果行只写「通过 / 未通过 · n 轮」。
    - 正文里的普通网址 `[字](地址)` 只显示、不能点（页面不能导航；`openItemUrl` 只认库里条目的来源）。
    - 界面 B 的七张截图在 `docs/shots/2026-11-03-{library,edit,sources,pipeline,status,ask,graph}.png`：`npm run shots -- --world seeded --screen <id>`（播种世界 + `test/support/seed.mjs seedPlanB`，假连接）。
