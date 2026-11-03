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
| `getAppState()` | 无 | `{ library: { path, name } \| null, showDeveloperInfo, language: { setting, resolved }, version, devBuild }`；`library` 是打开的库（侧栏显示 `name`，没有就是「未打开库」）；`version` 是 `installer/setup/release.json` 的版本，`devBuild` 为真时是开发版 | `app.js`（每一屏经 `useApp().appState`）、设置页 |
| `onEvent(topic, callback)` | 下面事件表里的一个主题；一个函数 | 不是信封：返回取消订阅的函数；主题不在表里、`callback` 不是函数就抛错 | `app.js` |
| `setLanguage(language)` | `'auto'` · `'zh-CN'` · `'en'` | `{ setting, resolved, changed }`；写进设置并重新决定界面语言；`changed` 为真时页面自己重新载入（§六） | 设置页「语言」 |
| `setShowDeveloperInfo(on)` | 布尔 | `{ showDeveloperInfo }` | 设置页「显示开发者信息」 |
| `copyDiagnostics()` | 无 | `{ ok: true }`；主进程把诊断信息写进剪贴板（不带 key；测试时写到 `logs\clipboard.txt`） | 设置页「复制诊断信息」 |
| `getUpdateState()` | 无 | 更新的数据：`{ state, current, dev, canUpdate, checkedAt, release, progress, reason, turnRunning }`（`state` 十二态之一：`idle` · `checking` · `up_to_date` · `available` · `manual` · `check_failed` · `downloading` · `download_failed` · `verify_failed` · `ready` · `launching` · `launch_failed`） | 设置页「关于」（`lib/use-update.js`） |
| `checkForUpdate()` | 无 | 同上；向 GitHub 问一次最新版（`AsuraNale/streams` 的 releases/latest） | 设置页「检查更新」 |
| `downloadUpdate()` | 无 | 同上（`downloading`，进度随 `update` 事件来）；开发版不下载 | 设置页「下载并更新」 |
| `cancelUpdateDownload()` | 无 | 同上；停下下载、删掉下了一半的文件 | 设置页下载中的「取消」 |
| `installUpdate()` | 无 | `{ ok: true }` 安装程序已启动、应用随即退出；或 `{ ok: false, reason }` | 设置页「开始更新」 |
| `openReleasePage()` | 无 | `null`；在用户的浏览器里打开这一版的发布页（测试时只记日志） | 设置页「打开发布页」 |
| `chooseLibraryFolder()` | 无 | 主进程开系统的选文件夹对话框（测试与开发：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>` 代替对话框）；`{ path, name, state: 'empty' \| 'library' \| 'other' } \| null`（取消是 null）。主进程记住这次选择，页面不回传路径 | S1 第 1 步、设置「新建库」「打开已有文件夹」 |
| `useChosenFolder(name)` | 库名字符串（空串 = 用文件夹名） | 对上一次 `chooseLibraryFolder` 的选择：`empty` → `createLibrary` 建库；`library`（已有 `streams.json`）→ 打开；`other` → `open_failed`。写 `settings.libraryPath`、进 `recentLibraries`；发 `library-changed` | S1 第 1 步、设置「库」 |
| `openRecentLibrary(path)` | 必须是 `recentLibraries` 里的一条，否则 `bad_arguments` | 同上的打开 | 设置「库 · 其他」 |
| `rebuildIndex()` | 无 | `{ count, pending: [{file, codes}] }`；`no_library` | 设置「重建索引」 |
| `revealLibrary()` | 无 | `null`；在资源管理器里显示库文件夹（测试只记日志） | S1 第 1 步「这个文件夹你随时可以打开」 |
| `getConnections()` | 无 | 见 §4.1「连接」；不含任何 key，API 只给 `keyHint` | S1 第 2 步、设置「连接方式」、S13 |
| `detectConnections()` | 无 | 重新检测三种连接（只读：`--version` / `auth status` / `login status` / 有没有 key），返回同 `getConnections` | S1「重新检测」、「我登录好了，再试一次」 |
| `probeConnection(kind)` | `'claude-code' \| 'codex' \| 'api'` | **一次真调用**；`{ ok, latencyMs, model, code?, detail? }`，同时记进 `getConnections().probes[kind]` | S1「试了一次：可用」、设置「现在试一次」 |
| `openLogin(kind)` | `'claude-code' \| 'codex'` | 起 CLI 自己的登录窗口（核心 `connector.openLogin`，窗口标题 = 品牌名）；`{ ok: true, pid } \| { ok: false, code }`；`api` → `bad_arguments` | S1 / S13 / S14 的「去登录」 |
| `setActiveConnection(kind)` | 三种之一或 `null` | `{ active }`；写设置；发 `connections-changed` | S1 第 2 步选定、设置 |
| `setConnectionModels(kind, models)` | `models = { model: string \| null, verifyModel: string \| null }`（null = 该连接的默认；核验 null = 同主模型） | `{ kind, model, verifyModel }` | 设置「主模型 / 核验模型」 |
| `setApiVendor(vendor, baseUrl)` | `vendor` 在核心 `VENDOR_IDS` 里；`baseUrl` 只有 `custom` 用，否则传 `null` | `{ vendor, baseUrl }` | 设置「输入 API key」对话框 |
| `setApiKey(vendor, key)` | key 字符串；**只往主进程走一次**，存 `secrets/key-<vendor>.bin`（safeStorage），从不返回 | `{ vendor, keyHint }`；safeStorage 不可用 → `internal` | 同上 |
| `removeApiKey(vendor)` | | `{ vendor, keyHint: null }` | 同上 |
| `applyStarterPack(packId, edits)` | `packId` 在核心 `STARTER_PACKS` 里或 `'blank'`；`edits = { removeSources: [name…], addRss: [{ name, url }] }` | 写 `streams.json` 的 `topics` / `sources`，并对每个来源试抓一次（不写盘）：`{ topics: [name…], sources: [{ name, kind, url, status, hint, count, message }] }` | S1 第 3 步 |
| `getStarterPacks()` | 无 | 核心 `STARTER_PACKS` 的 `[{ id, name, topics, sources: [{name, kind, url}] }]`（名字按界面语言） | S1 第 3 步 |
| `getHome()` | 无 | 见 §4.1「今日」 | S2 |
| `estimateRound()` | 无 | 核心 `estimateRound` + `{ connection: { kind, model, verifyModel } }` | S12 |
| `setRoundCap(cap)` | 正整数 | `{ cap }`；写 `streams.json` 的 `pipeline.cap` | S12「改上限」、设置「每轮上限」 |
| `startRound()` | 无 | `{ started: true, roundId } \| { started: false, problems }`（自检失败：S13）；一轮在跑时 `bad_arguments`。进度经 `round-progress` 事件；跑完发 `inbox-changed` 与最后一条 `round-progress { done: true, result }` | S12「开始」、S13「重试打分」 |
| `cancelRound()` | 无 | `{ cancelled }`；当前条目后停（核心 `signal`） | 「今日」进度条旁 |
| `getRoundState()` | 无 | `{ running, roundId, progress, last: runRound 的返回 \| null, lastProblems }` | S2 |
| `getInbox()` | 无 | `{ items: 核心 listInbox(), recentDismissReasons: [{ts, reason, title}] }` | S3 |
| `keepItem(url)` | url 必须在 inbox 里 | `{ id, file }`；发 `inbox-changed`、`library-changed`（索引重建了） | S3「收藏」 |
| `dismissItem(url, reason)` | 理由非空，否则 `bad_arguments` | `{ url }`；发 `inbox-changed` | S3「放弃」 |
| `laterItem(url)` | | `{ url }`；不写盘 | S3「稍后」 |
| `openItemUrl(url)` | 必须是 inbox 里或索引里某条的 `source`，否则 `bad_arguments` | `null`；`shell.openExternal`（测试只记日志） | S3「打开原文」 |
| `getPipelineSettings()` | 无 | `{ cap, thresholds: { relevance, substance }, schedule: null }`（定时 11-06 接上，先 null） | 设置「运行」 |
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

**首次设置**（S1，`screens/first-run.js`）：没打开库时 `app.js` 显示它（代替侧栏九入口），四步在自己的侧栏里：库放哪 → 连接方式 → 主题与来源 → 试跑一轮；每步的「谁定的」（用户选的 / 接受默认 / 跳过）记进 `streams.json` 的 `setup`（核心不读它）。连接步可跳过。做完 → `today`。

**界面 A 的六屏**：`first-run`（S1 四步）· `today`（S2 + S13 的出错卡片）· `inbox`（S3，键盘 J/K 上下、C 收藏、D 放弃、L 稍后；放弃对话框理由必填，右栏最近的放弃理由）· `run`（S12，`today` 上的对话框，不是独立屏）· `settings`（S14：连接方式 / 运行 / 库 / 软件四块；软件块 = 已有的语言 / 高级 / 关于）。按钮「去登录」出现在 S1 第 2 步、S13 卡片、S14 连接方式，副句「会打开一个终端窗口，由它自己完成登录；流息不经手任何凭据」，回路控件「我登录好了，再试一次」= `detectConnections`。

**回答一律是信封**，不抛异常：`{ ok: true, data }` 或 `{ ok: false, error: { code } }`。`code` 只有 `bridge-methods.mjs ERROR_CODES` 里的几个：`refused`（不是本应用页面的主框架发来的）、`bad_arguments`、`no_library`、`open_failed`、`internal`。细节只进 `logs\main.log`，不给页面。

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
  app.js            App：当前路由、navigate()、应用状态；显示当前屏幕
  lib/              html.js · bridge.js（call、onEvent）· use-load.js · use-update.js · format.js（fmt、日期）· app-context.js（useApp）
  kit/              组件（下表），从 kit/index.js 引
  screens/          index.js（SCREENS：id → 组件；FIRST_SCREEN）· placeholder.js（八个占位页的工厂）· settings.js · settings-update.js · kit.js（开发时）
  texts/            页面自己写的所有字：common.js（品牌、侧栏、五种状态、日期）· screens.js（占位页）· settings.js · kit.js
  texts-en/         英文字典，与 texts/ 同名同键（§六）
  styles/           app.css（@import 列表）· tokens.css（token 名单，docs/tokens.md）· base.css · kit.css · menu.css · screens/<屏幕>.css
```

**侧栏**（`kit/sidebar.js AppSidebar`）：品牌「流 · 流息 · STREAMS」、库名那一行（`SidebarLibrary`：库的文件夹名，没有就是「未打开库」）、九个入口里的八个（今日 · 待看 · 资料库 · 图谱 · 问库 · 流水线 · 来源与主题 · 运行状态，`NAV_ENTRIES`，每个 `a[data-nav=<id>]`）、底部「设置」。当前项画成白卡片。

**加一屏**：1. `screens/<id>.js` 导出组件，外面套 `AppFrame`（`sidebar=${html\`<${AppSidebar} current=${id} />\`}`），`Main screen=${id} state=${…}`；2. `screens/index.js` 的 `SCREENS` 把占位换成它；3. 字写进 `texts/<id>.js` 并给 `texts-en/<id>.js`；4. 样式写进 `styles/screens/<id>.css`（类名用屏幕前缀），在 `styles/app.css` 加 `@import`；5. 数据走 §四 的桥。

**规矩**（测试会核）：页面写的每一个字都在 `texts/` 里（别处的字符串里出现汉字就红，`test/wording.test.mjs`）；`texts/` 里的每个字串过用词扫描器 0 命中（V7 禁词：Bronze / Silver / Gold / judge / keeper / gate / Medallion / pending / ledger；品牌词只许在「连接你电脑上的 …」里，`wording/banned-terms.json`）；汉字旁一律全角标点；英文表与中文表键一一对应、没有汉字、没有禁词（`test/texts-en.test.mjs`）；**颜色只用 `tokens.css` 的变量**，别的样式文件里写 `#xxxxxx`、`rgb()` 就红，每个 token 都在 `docs/tokens.md` 的名单里（`test/kit.test.mjs`）；不用行内样式字符串、不用 `innerHTML`；源文件只用 LF、不放看不见的字符。测试用的挂钩：`main[data-screen][data-state]`（`ready` 表示数据到了）、`[data-nav=<id>]`、`[data-part=<id>]`。

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

1. 九个入口里八个是占位页；设置页只有语言、开发者信息、诊断、关于（含更新）。连接（方案 C2）、库（C3）等按 5.2 逐日换。
2. `release.json` 的 `version` 写成 `1.0.0`、`pre_release: dev.0`、`app_ver_name: 流息 1.0.0-dev.0`：`version.mjs` / 更新比较只认 `major.minor.patch` 数字，`1.0.0-dev.0` 填进 `version` 会让应用显示 0.0.0、安装包构建拒绝。要不要改 `VERSION_RE` 以认预发布号，归 PM。
3. 图标是 15 分钟内的记号（三条白色波浪 + river 圆角方块，`assets/icon/README.md`）；小尺寸由大图缩下来，没有像素级手画版；重建要 sharp（不是本仓依赖）。
4. `services/update.mjs` 的更新状态里还有 `turnRunning`（云织的「研究回合在跑」）：现在永远是 false，以后由流水线的「这一轮在跑」接上。
5. `services/notify.mjs` 建了没用：流水线（C5）发「抓到 N 条新的」时接上。
6. 侧栏底色选了 river（方案主色）而不是 ink，理由在 `docs/tokens.md`；要改只动 `--st-sidebar` 一行。
