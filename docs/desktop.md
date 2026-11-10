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
    services/notify.mjs   Windows 通知（一轮跑完「这一轮进来 n 条待看」）   quit.mjs   退出时结束本次运行的辅助进程
    services/schedule.mjs 定时、补跑、跑完的提示（§4.3）   tray.mjs   托盘图标、提示文字与菜单（§4.3）
    services/library.mjs · pipeline.mjs · sources.mjs · browse.mjs · ask.mjs · status.mjs · connections.mjs   库与各页的服务（§4.1–4.2；v2 包 A 起 library.mjs 管库登记、每库定时排队见 §4.4）
    v2：services/proposals.mjs 提议卡（§4.5）· services/changes.mjs「谁定的」· services/agent.mjs 主 Agent 与建议卡（§4.6）· reader.mjs 阅读窗口（§4.9）
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
| `@mozilla/readability` | 0.6.0（2025-03-03 发布） | Apache-2.0 | 阅读窗口的「阅读模式」抽正文（v2 包 H，§4.9）：主进程读它自己的 `Readability.js`，原样包进隐藏窗口里跑；页面不加载它 | 同上 |
| Electron | 44.0.0 | MIT | 外壳运行时 | **不是** desktop/ 的 npm 依赖：用 `installer/electron` 装好的那一份 |

四个 npm 包都没有依赖、都不跑安装脚本；`test/deps.test.mjs` 核版本钉死、来源、sha512、许可、`node_modules` 里装的就是 lock 里的版本；没有本地链接（云织的 `@yunzhi/app-core` 链接没拿）。页面用到的三个文件由 `app://ui/vendor/` 按名字直接从 `node_modules` 发出。`@mozilla/readability` 在 `dependencies` 里，安装包按 `desktop/package.json` 的 `dependencies` 把它拷进 `resources/app/node_modules`，`THIRD-PARTY-NOTICES.txt` 按装进去的包自动列出它与它的 `LICENSE.md`（`installer/notices.mjs`，本包没改 installer/）；设置页「许可证与致谢」的部件表 v2 包 J1 起也列它（`src/main/licenses.mjs`，名字 `@mozilla/readability`、版本与许可证取应用里那份 `package.json`：0.6.0、Apache-2.0）；installer 打包测试里对这张表的逐项核对（`installer/test/packaged.test.mjs`）v2 包 J2 已同步：装好的应用里部件表含 `@mozilla/readability`、版本与装进 `resources\app\node_modules` 的那份相同，`THIRD-PARTY-NOTICES.txt` 列着它（docs/installer.md §五）。抽正文不加 DOM 解析库：用 Chromium 自己的 `DOMParser`（§4.9）。

## 二、安全基线

照云织（`security.mjs`、`protocol.mjs`、`safe-path.mjs` 原样拿），`test/security.test.mjs` 与 `test/protocol.test.mjs` 核：页面里没有 Node（`contextIsolation` · `sandbox` · `nodeIntegration: false`，`app.enableSandbox()`）；页面只从 `app://ui/` 加载，协议处理器只发 `src/renderer/`、`src/shared/` 与 vendor 三个文件，**路径先按文字判、判过才碰文件系统**（`safe-path.mjs`：网络共享、盘符、`..` 在文字这一步就 404）；CSP 不许任何外部地址（头与 `<meta>` 各一份，`frame-src 'none'`——云织给成稿开的 `app://draft/` 没拿）；不能导航、不能开新窗口、`webview` 拒；会话上 `onBeforeRequest` 拦掉 `app://ui/` 以外的一切，权限一律拒，下载一律取消；WebRTC 不走 UDP；Trusted Types 让页面写不了 HTML、跑不了字符串。

```
default-src 'none'; script-src 'self' 'sha256-<import map 的哈希>'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none';
manifest-src 'none'; form-action 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none';
frame-ancestors 'none'
```

开发与测试专用的环境变量，打包后的应用不认：`STREAMS_WINDOW=hidden`（不显示窗口）、`STREAMS_START_SCREEN=<屏幕 id>`、`STREAMS_DEV_SYSTEM_LANGUAGES`（§六）、`STREAMS_DEV_LIBRARY`（当作已打开的库）、`STREAMS_DEV_UPDATE_URL`（`off` 或 GitHub 的替身）、`STREAMS_DEV_UPDATE_SETUP_RECORD`、`STREAMS_DEV_NOW`（§4.3：启动时「现在」是这个本地时间，之后照常往前走）。组件一览（`screens/kit.js`、`texts/kit.js`、`styles/screens/kit.css`）只在开发时发（`protocol.mjs DEV_ONLY`）。

**阅读窗口是唯一能显示外部网页的窗口**（v2 包 H，§4.9）：它的两个 web contents 不带 preload、不带桥，`sandbox` · `contextIsolation` · 不给 Node，用自己的内存分区 `streams-reader`（不是 `persist:`，也不是应用的默认会话）；`main.mjs` 的 `web-contents-created` 对这个分区（和抽正文用的 `streams-reader-extract`）的 web contents 不套上面那道「只许 `app://ui/`」的锁，改由 `reader.mjs guardReaderContents` 管：只许 http(s)，不许新窗口、`webview`、下载，页面里点链接一律交系统浏览器。应用自己的窗口与会话不变。

**页面拿不到 key、文件系统**：桥上的方法不收路径、不返回任何密钥材料；key 只在主进程里解密、只交给发请求的那条连接（方案 C2），页面最多看到「已连接」和末四位（`secrets.mjs keyHint`）。

## 三、应用数据布局

| 位置 | 打包后的应用 | 开发与测试 | 放什么 |
|---|---|---|---|
| **受保护目录** `appData` | `%APPDATA%\Streams` | `STREAMS_APP_DATA` | 下面各项；`protectedDirs = [appData]` |
| `settings.json` | ↑ 下 | ↑ 下 | `language`、`libraryPath`、`showDeveloperInfo`（`settings.mjs`）；v2 包 A 起 `libraryPath` / `recentLibraries` / `schedule` 只读不写（留作迁移来源，§4.4）；v2 包 B 加 `libraryRoot`（提议卡建库的默认位置，§4.5；v2 包 I 起设置页可改，§4.10）；v2 包 I 加 `setupConnection`（首次打开的连接那一步「谁定的」，还没有库时记在这里，§4.10） |
| `libraries.json` | ↑ 下 | ↑ 下 | **v2 包 A**：库登记表（核心 registry，`layout.librariesFile`；§4.4） |
| `proposals.jsonl` | ↑ 下 | ↑ 下 | **v2 包 B**：所有提议卡与结果，只追加（核心 proposals；§4.5） |
| `agent\` | ↑ 下 | ↑ 下 | **v2 包 C**：主 Agent 的东西（核心 agent，§4.6）：`transcript.jsonl`（对话正本，只追加）、`session.json`（各连接的会话 id 缓存，丢了从正本重建）、`notes.jsonl`（主 Agent 的笔记）、`usage.jsonl`（主 Agent 每次调用一行）。Claude Code / Codex 给主 Agent 跑的工作目录**不在这里**，见下一行 |
| **主 Agent 的工作目录** | `%TEMP%\streams-agent-cwd` | 同左（系统临时目录；`createAgentService` 的 `cwd` 可另给，测试用） | **v2 包 C**：Claude Code / Codex 给主 Agent 跑的专门的空文件夹（核心 `AGENT_CWD`；`fs.mkdirSync` 建、每次调用前确认是空的、调用后核对）。固定一个文件夹，因为 Claude Code 把会话按工作目录分开存（`~/.claude/projects/<工作目录>`；换文件夹能不能 resume 没测）。契约 C3 写的是 `agent\cwd\`；**实做改为临时目录**（玄翎 11-09），理由：保持 `layout.mjs` 的受保护目录约定——模型子进程碰不到应用数据（库 Agent 的 v1.0 做法也是临时目录）；服务启动时核对它不在应用数据里，在就不启动 |
| `secrets\` | | | `key-<厂商>.bin`：各条连接的 API key，`safeStorage` 加密，盘上不留明文（`secrets.mjs`；今天只定名字） |
| `updates\` | | | 新版本的安装程序（`services/update.mjs`），下一次启动时清空 |
| `logs\` | | | `main.log`（应用自己的诊断）、测试时的 `clipboard.txt`、`notifications.jsonl` |
| `electron\` | | | Chromium 自己的数据（缓存、`safeStorage` 用的密钥） |
| **本地数据** `localData` | `%LOCALAPPDATA%\Streams` | `STREAMS_LOCAL_DATA` | `cache\`：以后的抓取缓存、索引（不漫游） |
| **库** | `libraries.json` 登记的文件夹，当前库是它的 `active`（v1.0 是 `settings.json` 的 `libraryPath`） | `STREAMS_DEV_LIBRARY` | 用户的库；每个库的定时在它自己的 `streams.json`（§4.4） |

两个顶层目录不许互相包含（`layout.mjs checkOverlaps`）。开发与测试**必须**给 `STREAMS_APP_DATA`、`STREAMS_LOCAL_DATA`，不给就不启动（`missing_dev_paths`）。Electron 的 `userData` / `sessionData` / `crashDumps` / 日志目录在 `ready` 之前就指进受保护目录。

## 四、预加载桥（IPC 约定）

页面里只有一个 `window.streams`（冻结的对象），上面**恰好**是下表的方法。除 `onEvent` 外，每个方法 = 一次 `ipcRenderer.invoke('streams:<方法名>', …参数)`。下表由测试读取：`test/bridge.test.mjs` 核它与 `src/preload/preload.cjs` 的 `METHODS`（加上 `onEvent`）、`src/main/bridge-methods.mjs` 的 `BRIDGE_METHODS` 三者一致，`test/security.test.mjs` 核运行中的页面上恰好是这些。

<!-- bridge:begin -->
| 方法 | 参数 | 返回的 `data` | 谁用 |
|---|---|---|---|
| `getAppState()` | 无 | `{ library: { libraryId, path, name } \| null, recentLibraries: [{ path, name }], showDeveloperInfo, language: { setting, resolved }, version, devBuild, theme, libraryCount, activeConnection }`；`library` 是当前库（侧栏显示 `name`，没有就是「未打开库」；v2 包 A 起带登记 id `libraryId`，`name` 是登记表的名字，默认文件夹名）；`recentLibraries` 是登记表里的库（v2 包 A 起不再读 `settings.json`）；`version` 是 `installer/setup/release.json` 的版本，`devBuild` 为真时是开发版；`theme` 是 `river` · `paper` · `night` 之一（§五「主题」）；**v2 包 I**：`libraryCount` = 应用知道的库有几个（登记表的，加上开发钩子那个临时库），0 → 首次打开；`activeConnection` = `settings.json` 里选定的连接（`claude-code` · `codex` · `api` · `null`，只读设置、不检测），和主 Agent 聊的引导据此说「还没有连接」 | `app.js`（每一屏经 `useApp().appState`）、设置页 |
| `onEvent(topic, callback)` | 下面事件表里的一个主题；一个函数 | 不是信封：返回取消订阅的函数；主题不在表里、`callback` 不是函数就抛错 | `app.js` |
| `setLanguage(language)` | `'auto'` · `'zh-CN'` · `'en'` | `{ setting, resolved, changed }`；写进设置并重新决定界面语言；`changed` 为真时页面自己重新载入（§六） | 设置页「语言」 |
| `setTheme(id)` | `'river'` · `'paper'` · `'night'`（别的 → `bad_arguments`） | `{ theme }`；写进 `settings.json` 的 `theme`，主进程跟着改 `nativeTheme.themeSource`（`night` → `dark`，另两套 → `light`）和窗口底色（那一套的 `--st-page`）；发 `settings-changed`。页面自己马上把 `<html data-theme>` 换掉（§五「主题」） | 设置页「主题」 |
| `setShowDeveloperInfo(on)` | 布尔 | `{ showDeveloperInfo }` | 设置页「显示开发者信息」 |
| `copyDiagnostics()` | 无 | `{ ok: true }`；主进程把诊断信息写进剪贴板（不带 key；测试时写到 `logs\clipboard.txt`） | 设置页「复制诊断信息」 |
| `openMakerPage()` | 无 | `null`；在用户的浏览器里打开 `https://starrydigital.ca`（地址写死在主进程 `app-services.mjs MAKER_URL`，页面不给地址；测试时只记日志） | 设置页「关于」的「由 Starry Digital 开发」（V11，维护者 11-02 定「链 starrydigital.ca」） |
| `getLicenses()` | 无 | `{ own: { license: 'MIT', text }, components: [{ name, version, license }], notices: { available } }`：`text` 是流息 `LICENSE` 全文（装好的应用读 `resources\app\LICENSE`，构建把仓库根的 `LICENSE` 放在那里；开发时读仓库根那份）；`components` 依次是 Electron · Chromium · Node.js（版本取运行时 `process.versions`）、Preact · htm · @mozilla/readability（版本与许可证取应用里 `node_modules/<名>/package.json`；Readability 是阅读模式抽正文用的，v2 包 J1 加进表里）；`notices.available`：装好的应用安装目录里有 `THIRD-PARTY-NOTICES.txt` 时为真，开发时总为假（`app-services.mjs licensesView`） | 设置页「许可证与致谢」对话框 |
| `openNotices()` | 无 | `null`；用系统的查看程序打开安装目录里的 `THIRD-PARTY-NOTICES.txt`（文件名写死在主进程，页面不给路径；测试时只记日志）；没有这个文件（开发时）→ `open_failed` | 许可证与致谢「打开完整的第三方声明」 |
| `getUpdateState()` | 无 | 更新的数据：`{ state, current, dev, canUpdate, checkedAt, release, progress, reason, turnRunning }`（`state` 十二态之一：`idle` · `checking` · `up_to_date` · `available` · `manual` · `check_failed` · `downloading` · `download_failed` · `verify_failed` · `ready` · `launching` · `launch_failed`） | 设置页「关于」（`lib/use-update.js`） |
| `checkForUpdate()` | 无 | 同上；向 GitHub 问一次最新版（`AsuraNale/streams` 的 releases/latest） | 设置页「检查更新」 |
| `downloadUpdate()` | 无 | 同上（`downloading`，进度随 `update` 事件来）；开发版不下载 | 设置页「下载并更新」 |
| `cancelUpdateDownload()` | 无 | 同上；停下下载、删掉下了一半的文件 | 设置页下载中的「取消」 |
| `installUpdate()` | 无 | `{ ok: true }` 安装程序已启动、应用随即退出；或 `{ ok: false, reason }` | 设置页「开始更新」 |
| `openReleasePage()` | 无 | `null`；在用户的浏览器里打开这一版的发布页（测试时只记日志） | 设置页「打开发布页」 |
| `chooseLibraryFolder()` | 无 | 主进程开系统的选文件夹对话框（测试与开发：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>` 代替对话框）；`{ path, name, state: 'empty' \| 'library' \| 'importable' \| 'other', mdCount? } \| null`（取消是 null；`importable` = 没有 `streams.json`、第一层有 `.md`，`mdCount` 是那一层 `.md` 的个数，11-04 加）。主进程记住这次选择，页面不回传路径 | 新建库第 1 步（v2 包 I；v1.0：S1 第 1 步、设置「新建库」「打开已有文件夹」）；**v2 包 I**：对话框打开时停在「新建库默认放在」（那个文件夹在的话） |
| `useChosenFolder(name)` | 库名字符串（空串 = 用文件夹名） | 对上一次 `chooseLibraryFolder` 的选择：`empty` → `createLibrary` 建库；`library`（已有 `streams.json`）→ 打开；`importable` → 核心 `importFolder`（在旁边写 `streams.json` 与 `_pipeline/`，不碰已有文件，`notesDir: "."`）再打开；`other` → `open_failed`。登记进 `libraries.json`（已登记就不重复）并设为当前库（v2 包 A；不再写 `settings.json`）；发 `libraries-changed`、`library-changed`；**v2 包 I**：新建或导入出来的库（`empty` / `importable`），`settings.json` 有 `setupConnection` 且这个库还没有 `setup.connection` 时，把它抄进去（`at` 照原样）；返回 `{ libraryId, path, name }`（没选过文件夹 → `bad_arguments`） | 新建库第 1 步（v2 包 I） |
| `openRecentLibrary(path)` | 必须是 `recentLibraries` 里的一条（= 登记表里某个库的路径，原样），否则 `bad_arguments` | 同上的打开；那个文件夹里的 `streams.json` 读不出 → `open_failed` | v1.0 设置「库 · 其他」（v2 包 I 起页面不再用，桥上保留） |
| `rebuildIndex()` | 无 | `{ count, pending: [{file, codes}] }`；`no_library` | 来源与要求「这个库」（v2 包 I；v1.0：设置「重建索引」） |
| `revealLibrary()` | 无 | `null`；在资源管理器里显示库文件夹（测试只记日志） | 来源与要求「这个库」的「在资源管理器中显示」（v2 包 I） |
| `recordSetupStep(step, entry)` | `step` ∈ `library` · `connection` · `pack` · `sources` · `trial` · `schedule`；`entry = { by, detail? }`，`by` ∈ `chose` · `wrote` · `default` · `skipped`（核心 `recordSetupStep` 判，不认识 → `bad_arguments`） | `{ step, by, at, detail? }`；写进打开的库的 `streams.json` 的 `setup`（那一步的记录被新的替换，别的步不动；经临时文件 + rename）；`no_library`。**v2 包 I**：没有当前库时 `step` 是 `connection` → 写进 `settings.json` 的 `setupConnection = { by, at, detail? }`（同样的检查：`by` 不认识、多了键、`detail` 不是 ≤ 100 字的字符串 → `bad_arguments`），别的步仍是 `no_library` | 首次打开的连接一步、新建库每一步走完时（§4.1、§4.10） |
| `getSetup()` | 无 | 核心 `readSetup`：`{ <step>: { by, at, detail? } }`，这个库没有记录（导入的、或这次之前建的）→ `{}`；`no_library` | 来源与要求「这个库 · 首次设置」（v2 包 I；v1.0：设置） |
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
| `startRound()` | 无 | 当前库的一轮。`{ started: true, roundId } \| { started: false, problems }`（自检失败：S13；没选连接也算自检失败，`connectionCode: 'not-installed'`）；一轮在跑时 `bad_arguments`（v2 包 A：走全应用的队列，任何库的一轮在跑或有库在排队都算，见 §4.4）。进度经 `round-progress` 事件；跑完发 `inbox-changed` 与最后一条 `round-progress { done: true, result }`。`roundId` 是主进程给这一轮的 id（`d-…`），核心自己的 round id 在 `result.round.id` | S12「开始」、S13「重试打分」 |
| `cancelRound()` | 无 | `{ cancelled }`；当前条目后停（核心 `signal`） | 概览（v1.0 的「今日」）进度条旁 |
| `getRoundState()` | 无 | `{ running, roundId, libraryId, progress, last: runRound 的返回 \| null, lastProblems }`（`libraryId`：那一轮是哪个库的，v2 包 A；全应用同一时间只有一轮） | S2 |
| `getInbox()` | 无 | `{ items: 核心 listInbox(), recentDismissReasons: [{ts, reason, title}] }` | S3 |
| `keepItem(url)` | url 必须在 inbox 里 | `{ id, file }`（`file` = `notes/` 里的文件名）；发 `inbox-changed`、`library-changed`（索引重建了） | S3「收藏」 |
| `dismissItem(url, reason)` | 理由非空，否则 `bad_arguments` | `{ url }`；发 `inbox-changed` | S3「放弃」 |
| `laterItem(url)` | | `{ url }`；不写盘 | S3「稍后」 |
| `openItemUrl(url)` | 必须是 inbox 里或索引里某条的 `source`，否则 `bad_arguments` | `null`；`shell.openExternal`（测试只记日志） | S3「打开原文」 |
| `getPipelineSettings()` | 无 | `{ cap, thresholds: { relevance, substance }, schedule }`；`schedule` = `getSchedule()` 的返回 | 设置「运行」 |
| `getSchedule()` | 无 | 当前库的定时：`{ libraryId, enabled, time, nextRunAt: ISO \| null, lastRoundAt: ISO \| null, missed: boolean }`（§4.3–4.4；没打开库时是 `settings.json` 的、`libraryId` / `lastRoundAt` 为 null、`missed` 为 false） | 库页头「下次运行」（v2 包 F；v1.0 的设置「运行」与今日顶栏已不在，设置里是只读的「定时一览」，见 §4.10） |
| `setSchedule(schedule)` | `{ enabled: boolean, time: 'HH:MM' }`（00:00–23:59，别的键 → `bad_arguments`） | 同上；写**当前库的 `streams.json`** 的 `schedule`（v2 包 A；v1.0 写 `settings.json`）、重设定时器；发 `settings-changed { libraryId }`；没打开库 → `no_library` | 设置「运行」、首次设置最后一步 |
| `listLibraries()` | 无 | **v2 包 A**：登记表的库，按登记顺序：`[{ id, path, name, icon, color, addedAt, temporary, active, exists }]`；`exists` = 文件夹在、`streams.json` 读得出；`temporary` 只有开发钩子 `STREAMS_DEV_LIBRARY` 指的、没登记的那个库（id `dev`，排第一，不写进登记表）；`active` = 当前库 | 包 F 的左栏、库架 |
| `setActiveLibrary(id)` | 登记表里的 id（不认识 → `bad_arguments`） | 换当前库，返回 `{ libraryId, path, name }`；文件夹不在或读不出 → `open_failed`，什么都不变；发 `libraries-changed`、`library-changed`、`settings-changed`。原有的库相关方法签名不变，都作用于当前库 | 包 F 切库 |
| `addLibrary(path)` | 必须是上一次 `chooseLibraryFolder` 给的那个路径（页面不另给路径），否则 `bad_arguments` | 「添加已有库」= 打开已有文件夹：那里没有库 → `open_failed`；登记（已登记就不重复）并设为当前库；返回同 `useChosenFolder` | 包 F「添加已有库」 |
| `removeLibrary(id)` | 登记表里的 id（不认识、或开发钩子那个临时库 → `bad_arguments`） | `{ removed, active }`：**只去掉登记，绝不删文件夹里的任何东西**；移除的是当前库时，当前库变成顶替它位置的那个（下一个；它是最后一个就是新的最后一个），一个不剩就是 null（之后库相关方法回 `no_library`）；发 `libraries-changed`（当前库变了再发 `library-changed`、`settings-changed`） | 包 F |
| `setLibraryMeta(id, meta)` | `meta = { name?, icon?, color? }`，至少一个；`name` 1–100 字、`icon` 1–2 字、`color` ∈ 核心 `LIBRARY_COLORS`（token 名）；不认识的 id、坏值 → `bad_arguments`，什么都不写 | `{ id, name, icon, color }`；发 `libraries-changed`；改的是当前库再发 `library-changed`（侧栏的名字跟着变） | 包 F 库页 |
| `getLibrariesOverview()` | 无 | 每个库一行：`[{ id, name, icon, color, inbox, lastRoundAt, problem, brief, topics, sources, noOutputStreak }]`；`brief` 是 `streams.json` 的要求（核心 `readBrief`，没有 → null）、`topics` 是主题名、`sources` 是来源个数、`noOutputStreak` 是连续没有产出的轮数（包 F 加：库架卡片与库头的「在追」、卡片的问题一行）；`inbox` / `lastRoundAt` 来自核心 `homeNumbers`（`numbers.inbox`、`numbers.lastRound.startedAt`）；`problem` 三选一或 null，按这个顺序：`missing`（文件夹不在或读不出）· `sources`（来源出问题：`numbers.sources.level` 为 `warning` 或 `blocked`）· `no-output`（连续 `NO_OUTPUT_ROUNDS` 轮没有产出） | 包 F 左栏的待看数与琥珀点、库架 |
| `getLibrarySchedule(id)` | 登记表里的 id | 那个库的定时，形状同 `getSchedule`；不认识 → `bad_arguments`；文件夹不在 → `open_failed` | 包 F 库页、设置一览 |
| `setLibrarySchedule(id, schedule)` | id + 同 `setSchedule` | 写那个库的 `streams.json`；同 `setSchedule` | 同上 |
| `getUsageTotal()` | 无 | 全部库本月用量合计（维护者 11-05）：核心 `usageTotal`，`{ month, calls, inputTokens, outputTokens, costUsd, byKind: { <连接>: 次数 }, libraries: [{ id, name, calls, missing }], agent: { calls, inputTokens, outputTokens, costUsd } }`；`month` 是主进程时钟的 UTC 月；文件夹不在的库 `calls: 0, missing: true`，不报错；**v2 包 C**：`agent` 是主 Agent 本月的用量（`<appData>\agent\usage.jsonl`，单列「主 Agent」），也算进 `calls` / 各个合计与 `byKind`，不算进 `libraries` | 包 F / I 的设置页 |
| `getLibraryRoot()` | 无 | **v2 包 I**：「新建库默认放在」`{ path, isDefault }`：`settings.json` 的 `libraryRoot`，没设时是应用的默认位置（`isDefault: true`；装好的流息 = `%USERPROFILE%\Documents\Streams`，开发运行 = `STREAMS_DEV_LIBRARY_ROOT` 或它自己应用数据里的 `libraries`） | 设置「库」 |
| `chooseLibraryRoot()` | 无 | **v2 包 I**：开系统的选文件夹对话框（开发与测试：`STREAMS_DEV_CHOOSE_FOLDER` 代替，同 `chooseLibraryFolder`）；取消 → `null`；选了 → 同 `setLibraryRoot(那个路径)` 的检查与返回 | 设置「换一个文件夹…」 |
| `setLibraryRoot(path)` | 绝对路径字符串，或 `null`（= 恢复默认） | **v2 包 I**：写 `settings.json` 的 `libraryRoot`，返回同 `getLibraryRoot`，发 `settings-changed`；相对路径、应用数据文件夹本身或它里面的路径 → `bad_arguments`，什么都不写。提议卡建库（包 B）与「新建库」的选文件夹对话框（打开时停在这里，文件夹在的话）都用它 | 设置「恢复默认」 |
| `listProposals(filter)` | `null` 或 `{ status?, libraryId? }`：`status` ∈ `pending` · `confirmed` · `declined` · `revise` · `stale` · `failed`；`libraryId` 是登记 id，或 `null`（= 建库卡）；别的键 → `bad_arguments` | **v2 包 B**：提议卡，新的在前：`[card]`，卡的形状见 §4.5（核心 5.13）；不改任何东西 | 包 G 的卡片（「和主 Agent 聊」、库页） |
| `confirmProposal(id)` | 卡的 id（不认识 → `bad_arguments`） | **唯一会改东西的方法**：卡生效后的样子 `card`，`status` 是 `confirmed`（已生效，`result` 写了做了什么）· `stale`（出卡后相关配置变了 / 库不在了 / 新库的文件夹不空了：什么都没改，`reason`）· `failed`（中途出错：已做的回滚，或 `failure` 写明到哪一步）；卡不是 `pending`（已确认、已不要、已改一下、过期、失败）→ `bad_arguments`，什么都不做，不会重复生效。发 `proposals-changed`；生效的是当前库 → `library-changed`；定时卡再发 `settings-changed { libraryId }`；建库卡经包 A 登记、设为当前库（`libraries-changed`、`library-changed`）、把第一轮放进队列 | 包 G「确认」 |
| `declineProposal(id)` | 卡的 id | 「不要」：`status: 'declined'` 的卡；库一个字节都不变；不是 `pending` → `bad_arguments`；发 `proposals-changed` | 包 G「不要」 |
| `reviseProposal(id, text)` | 卡的 id；你的一句话（1–2000 字） | 「改一下」：`status: 'revise'`、`reviseText` 是你的话的卡（包 C 据此重出一张）；库不变；不是 `pending` → `bad_arguments`；发 `proposals-changed` | 包 G「改一下」 |
| `getWhoDecided()` | 无 | 当前库「谁定的」：核心 `whoDecided`，`{ brief, sources, topics, thresholds, schedule, cap }`，每项 `{ by: 'you' \| 'agent-confirmed', at, proposalId }` 或 `null`（没有记录）；`no_library` | 包 F 来源与要求页「谁定的」 |
| `agentSend(text, options?)` | `text` 1–4000 字（去首尾空白后）；`options` 可省、`null` 或 `{ libraryId? }`（这句话是从哪个库的对话框转来的；登记 id，不认识 → `bad_arguments`） | **v2 包 C**：主 Agent 跑一轮（§4.6）：`{ turn, reply, ask, proposalIds, notice? }`——`reply` 回复（连接失败时 `null`）；`ask` 最多一个问题 `{ question, options: 2–4 个 }` 或 `null`；`proposalIds` 这一轮出的提议卡（`pending`，经包 B 的 `createProposal`，`by: 'agent'`）；`notice` 可选，`[{ code, … }]`，`code` ∈ `not-understood`（回答两次不合格：只显示能取到的回复、不出卡不执行）· `proposals-dropped`（`count` 张不合格没出）· `connection`（`connection` 是连接的错误码）· `session-rebuilt`（会话接不上、开了新会话）。同一时间只跑一轮：前一轮没完就排队等。没选连接 → `no_connection`。发 `agent-changed` | 包 G「和主 Agent 聊」、包 E 分流 |
| `getAgentTranscript(query?)` | 可省、`null` 或 `{ limit?: 1–500（默认 100）, before?: 轮号 }` | 对话正本：`{ entries: [{ at, turn, role: 'you' \| 'agent' \| 'lookup' \| 'note' \| 'summary', text, data? }]（早的在前，`before` 给了就只要这轮之前的）, hasMore, total, skipped }`；不改任何东西 | 包 G 的对话流 |
| `getAgentStatus()` | 无 | `{ connection: 'claude-code' \| 'codex' \| 'api' \| 'fake' \| null, sessionful, session: { live, startedAt, turns }, entries（正本条数）, turns, lastSummaryAt, summarizedThrough, busy, waiting }` | 包 G、设置 |
| `listSuggestions(filter?)` | 可省、`null` 或 `{ libraryId? }` | **v2 包 C 接包 D 的建议卡**：打开着的建议卡 `[{ libraryId, key, kind, subject, otherLibraryId?, evidence, createdAt }]`（核心 `openSuggestions`，每个能读的库；给了 id 只要那个库的，不认识 → `bad_arguments`） | 包 G「等你定的事」、包 F 概览 |
| `dismissSuggestion(libraryId, key, reason?)` | 登记 id；建议卡的 key（≤ 300 字）；`reason` 可省或 ≤ 500 字 | 「不要」：库的 `_pipeline\suggestions.jsonl` 追加一行 `dismissed`（核心 `dismissSuggestion`），回那一行；卡没打开 → `bad_arguments`。别的什么都不改 | 同上 |
| `acceptSuggestion(libraryId, key)` | 登记 id；建议卡的 key | 「要」**只做两件事**：记一行 `accepted`，再把这张建议卡以 `note` 的形式交给主 Agent 跑一轮（由它决定出不出提议卡）：`{ accepted: 那一行, turn: agentSend 的同一形状 }`；不改库的任何配置。卡没打开 → `bad_arguments`；没选连接 → `no_connection`（什么都不记） | 同上 |
| `getLibrary(view, filter)` | `view` ∈ `kept` · `authored` · `caught` · `pending`；`filter = { topics: string[], days: number \| null }` | `{ counts: 核心 libraryCounts, view, items, total }`（核心 `listLibrary`） | S6 |
| `searchLibrary(q, filter)` | 字符串（≤ 200 字）；`filter = { view: 'kept' \| 'authored' \| 'all', topics, days }` | 核心 `search` 的结果数组 | S6 搜索框 |
| `readNote(id)` | id 必须在索引里，否则 `bad_arguments` | 核心 `readNote` | S6 正文与右栏 |
| `editNote(id, changes)` | `changes` 只能有 `title` / `topics` / `body` | `{ id, file, entry }`；核心 `bad-edit` / `invalid-note` → `bad_arguments`；发 `library-changed` | S7 |
| `openInObsidian(id)` | id 在索引里 | `null`；`shell.openExternal('obsidian://open?path=<绝对路径>')`，打不开时 `shell.openPath(路径)`（测试只记日志） | S6「用 Obsidian 打开」（v2 包 H 起在「更多」里，只对有文件的条目） |
| `showNoteInFolder(id)` | id 在索引里（路径同 `openInObsidian` 的核法：核心 `notePath`，必须是笔记文件夹里的 `.md`） | `null`；`shell.showItemInFolder(路径)`（测试只记日志 `not opened in a test run: folder <路径>`） | P5「更多」→「在资源管理器中显示」（v2 包 H，§4.9） |
| `openReader(url, how)` | `url` 是 http(s)，且是当前库记录里的条目（`replayLedger` 的 states 里，抓到的、待看的都算）或索引里某条的 `source`，否则 `bad_arguments`；`how` ∈ `reader` · `browser` | `reader`：在隔离的阅读窗口里打开（§4.9），等抽正文结束后回 `{ mode: 'reading' \| 'original', fallback }`；`browser`：`null`，系统浏览器打开（测试只记日志）。不写盘 | P5「打开原文」「更多」→「在浏览器里打开」（v2 包 H） |
| `applyHeader(file, header)` | `file` 是核心 `listPending` 里的文件名（否则 `bad_arguments`）；`header` 是对象（页面上改过的文件头，与拟好的合并、用户给的键优先）或 `null`（用拟好的） | 核心 `applyProposedHeader` 的返回 `{ id, file, entry }`；`not-proposable` / `bad-file-name` / `already-conforming` / `bad-id` / `invalid-note` → `bad_arguments`；发 `library-changed` | S8「写入这一个」 |
| `applyAllHeaders()` | 无 | `{ written: [file…], skipped: [{ file, code }] }`：对每个文件名能当 id、拟得出文件头的待规范文件按拟的写入；文件名不能当 id 的 `code: 'bad-file-name'`，拟不出的 `'not-proposable'`，核心拒绝的是核心的错误码；写了至少一个才发 `library-changed` | S8「全部按拟的写入」 |
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
| `getBrief()` | 无 | **v2 包 F**：当前库的「要求」`{ brief }`（核心 `readBrief`，没有 → `null`）；`no_library` | 来源与要求「要求」 |
| `setBrief(text)` | 字符串（≤ 8000 字；核心去掉首尾空白后要 1–2000 字，空的或太长 → `bad_arguments`，什么都不写） | 核心 `saveBrief` 的返回 `{ brief }`；变了就在 `changes.jsonl` 记一行 `by: 'you'`（`services/changes.mjs byYou`）；发 `library-changed` | 来源与要求「要求」的保存 |
| `getPipeline()` | 无 | `{ config: 核心 pipelineConfig, defaults: 同形状的默认配置（「恢复默认」用）, lastRound: 核心 roundLog 最近一行 \| null, dismissReasons: recentDismissReasons(10), verdictFailures: { [节点 id]: recentVerdictFailures(…, 5) } }` | S4 |
| `savePipeline(cfg)` | 整份 pipeline 配置 | `{ config }`；核心 `locked-node` / `bad-config` → `bad_arguments` | S4「保存」「恢复默认」 |
| `previewNode(nodeId, url, draft)` | `nodeId` 是配置里的关卡或摘要；url 必须在账本里；`draft` 是页面上正在改、还没保存的那个节点（`id` 必须等于 `nodeId`），或 `null` 用已保存的（方案 C3：改了要求先试一条再保存）；草稿不过核心的配置校验 → `bad_arguments` | 核心 `previewNode`（连接失败的 `{ ok: false, code }` 原样作 `data`）；不写账本 / inbox / verdicts；计入连接的用量（`purpose: preview:<节点 id>`）；没选连接 → `no_connection` | S4「试一条看结果」 |
| `getStatus()` | 无 | `{ ...核心 statusView, nextRun: 定时开着时 getSchedule().nextRunAt，否则 null, connections: getConnections() }` | S11 |
| `openLogsFolder()` | 无 | `null`；`shell.openPath(<库>/_pipeline/logs)`（测试只记日志） | S11「打开运行记录文件夹」 |
| `getGraph(filter)` | `{ days: number \| null, status: 'kept' \| 'all', topics: string[], links: boolean }` | 核心 `graph` | S9 |
| `askLibrary(question)` | 1–500 字（去掉首尾空白后） | 核心 `ask` 的返回（连接失败的 `{ ok: false, code }` 原样作 `data`）；一次只许一个问题在跑（第二个 → `bad_arguments`）；没选连接 → `no_connection`（新错误码） | S10 |
| `getDemands()` | 无 | 核心 `demands` | S10 右栏 |
| `addDemand(topic, question)` | 主题非空 | 核心 `addDemand` | S10「记到想补的主题」 |
| `answerFeedback(question, note)` | 两个非空字符串 | `{ ok: true }` | S10「这个回答哪里不对」 |
| `sendLibraryMessage(text)` | 1–500 字（去掉首尾空白后） | **v2 包 E**：库内对话框的一句话，作用于当前库。先分流（核心 `routeMessage`，§4.7）：`question` → 走 `askLibrary` 的同一条路径；`change` → 主 Agent `agentSend(text, { libraryId: 当前库 })`；`unsure` → 谁都不问。返回 `{ route, by, confidence, result }`（`result` 是核心 `ask` 或 `agentSend` 的返回，原样）；`unsure` 时是 `{ route: 'unsure', by, confidence, text }`（没有 `result`）。每次在库的 `_pipeline/routes.jsonl` 记一行。与 `askLibrary` 共用「一次只许一句」（第二句 → `bad_arguments`）；去问库或主 Agent 时没选连接 → `no_connection`；`no_library` | 问库页（包 G） |
| `resolveLibraryMessage(text, route)` | `text` 同上；`route` ∈ `'question'` · `'change'`（别的 → `bad_arguments`） | **v2 包 E**：你在「这是要改这个库吗？」里选了以后调：照选的走、不再分流；返回 `{ route, by: 'you', confidence: 1, result }`；`routes.jsonl` 记一行（`by: 'you'`、`resolvedBy: 'you'`）；一次只许一句、`no_connection`、`no_library` 同上 | 问库页（包 G）拿不准时的两个按钮 |
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
  "numbers": 核心 homeNumbers(),            // caught · inbox · inboxOldestDays · kept · dismissed · lastRound · noOutputStreak · sources{level, lines}
  "noOutputRounds": 3,                      // 核心 NO_OUTPUT_ROUNDS（11-04）：numbers.noOutputStreak 到这个数，页面出「连续 N 轮没有产出」
  "lastRound": 核心 roundLog 的一行 | null,
  "roundState": getRoundState(),
  "recentKept": [{ "id", "title", "source_name", "date", "kept" }],   // 索引里 status kept 按 kept 日期倒序 3 条
  "connection": { "kind", "model" } | null,
  "nextRun": null,                            // 定时 11-06
  "problem": { "code": "connection" | "not-writable" | "index", "connectionCode": "login-expired" | …, "kind": "claude-code", "caughtKept": 34 } | null }   // 上一次 startRound 的自检失败 → S13
```

**事件**（下表加四个）：`library-changed`（payload `{ path, name } | null`）、`connections-changed`（`null`）、`round-progress`（`{ roundId, phase: 'self-check' | 'fetch' | 'gate:<id>' | 'summary' | 'done', counts, calls, cap, done: boolean, result?, problems? }`）、`inbox-changed`（`{ count }`）。v2 包 A 起和某个库有关的都多一个 `libraryId`（见下面的事件表与 §4.4）。

**开发与测试的钩子**（打包后的应用不认）：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>`（代替选文件夹对话框）、`STREAMS_DEV_CONNECTION=fake | login-expired | bad-format-once`（三种连接全部换成核心的假连接器 / 脚本连接器，`detect` 回「已装已登录」，probe 与一轮都走它；`login-expired` 让自检失败，演 S13）、`STREAMS_DEV_LIBRARY`（已有）。

**实做差别**（11-03 主进程建方，以代码为准；契约原文不改）：

- `getConnections().kinds.*.code`：三种都带（没问题是 null）；`api` 没存 key 时是 `bad-key`（核心 `detect` 的码）。`claude-code` / `codex` 的检测在第一次 `getConnections` 时做一次并记住，之后只有 `detectConnections` 重做；`setApiVendor` / `setApiKey` / `removeApiKey` 会让 `api` 这一项重新判。`codex` 多一个 `source`（核心给的 `command | path | desktop-app`）。
- `probes[kind]` 失败时带 `code` 与 `detail`（核心已把 key 抹掉）。页面发起的 `probeConnection` 在打开库时记进库的 `_pipeline/usage.jsonl`（`purpose: probe`）。
- `getHome().problem.caughtKept` = `numbers.caught`（还停在「抓到的」、没丢的条目数）；`kind` 是出错时选定的连接，没选连接时为 null。`getHome().connection.model` 是解析后的主模型（Claude Code / Codex 没填型号时为 null = 工具自己的默认）。
- `round-progress`：`phase` 为 `self-check`（`startRound` 一进来）→ `fetch`（自检过了、后台开始）→ 每条打完 `gate:<id>` / `summary` → `done`。`counts` 在 `fetch` 阶段为 null；`cap` 是这一轮用的上限。后台抛了异常也发 `done`，`result: null`、`problems: [{ code: 'internal', detail }]`，并进 `getRoundState().lastProblems`。
- `getRoundState().roundId`：在跑时是当前这轮的，否则是上一轮的（没跑过为 null）；`progress` 是最后一条 `round-progress` 的 payload。
- `applyStarterPack` 整体替换 `streams.json` 的 `topics` / `sources`（首次设置只做一次），其余键（`name`、`pipeline`、页面写的 `setup`）原样保留；坏的 `edits`（不是 http(s) 地址、重名）→ `bad_arguments`，什么都不写。来源名重复 → `bad_arguments`。
- `rebuildIndex()` 也发一次 `library-changed`；`useChosenFolder` / `openRecentLibrary` 打开时顺手重建一次索引（失败只记日志），并额外发 `settings-changed`（当前库变了；v2 包 A 起写的是登记表，不是 `libraryPath`）。
- 开发钩子 `STREAMS_DEV_CONNECTION` 下 `api` 的 `hasKey` / `keyHint` 仍看真的密钥仓，`loggedIn` 看假连接器。

**首次设置**（S1，`screens/first-run.js`）：没打开库时 `app.js` 显示它（代替侧栏九入口），四步在自己的侧栏里：库放哪 → 连接方式 → 主题与来源 → 试跑一轮；每步的「谁定的」（用户选的 / 接受默认 / 跳过）记进 `streams.json` 的 `setup`（核心不读它）。连接步可跳过。做完 → `today`。**v2 包 I 起改了**：首次打开只剩「连接方式」一步 + 和主 Agent 聊，其余几步是「新建库」，见 §4.10。

**首次设置记「谁定的」**（11-04 实装，方案 A1 / 4.10）：每一步走完时页面调 `recordSetupStep(step, { by, detail? })`（核心 `recordSetupStep`，写进打开的库的 `streams.json` 的 `setup`，键是六步，值 `{ by, at, detail? }`），写不进去不挡向导。对应：
- `library`：第一步选了文件夹、「下一步」开好了库 → `chose`，`detail` = 文件夹的状态（`empty` · `library` · `importable`）；
- `connection`：「用这一条」后「下一步」→ `chose`，`detail` = 那种的 kind；「这一步先跳过」→ `skipped`；
- `pack` 与 `sources`：起步包那一步「继续」时一起记：`pack` = `chose`，`detail` = 起步包 id（含 `blank`）；`sources` = 起步包的来源一个没删、一个没加 → `default`，删了或加了 → `wrote`，`detail` = `{ removed, added }` 个数；
- `trial`：跑完点「下一步」→ `chose`（没连接时也能跑，只抓不打分，跑了就是 `chose`）；没跑就点「先不跑，往下走」（`[data-action="skip-trial"]`，11-04 加的按钮，开跑前才有）→ `skipped`；
- `schedule`：「完成，去待看 / 去今日」照显示的（每天 08:30、开着）`setSchedule` 之后 → `default`，`detail` = `{ enabled, time }`；
- 往回退再走一遍：那一步的记录被新的替换，别的步不动（核心按步整条替换）。
设置「库」一节多一行「首次设置」（**v2 包 I 起在来源与要求的「这个库」里**，§4.10；`getSetup`，`[data-part="setup"][data-setup=none|recorded]`）：六步各写「你选的 / 你写的 / 接受了默认 / 跳过了」（`[data-setup-step][data-by]`），某步没有记录写「没有记录」；整个库没有记录（导入的、或这次之前建的）→ 一句「没有记录」。

**今日「连续三轮没有产出」**（11-04 实装，方案 C8）：`getHome().numbers.noOutputStreak`（核心：从 rounds.jsonl 最新一轮往回数 `counts.inbox` 为 0 或缺的连续轮数）≥ `getHome().noOutputRounds`（核心 `NO_OUTPUT_ROUNDS` = 3，页面不自己定阈值）时，今日在来源横幅下面多一条琥珀横幅 `[data-part="no-output"][data-streak]`：「连续 N 轮没有产出：这几轮都没有一条进待看。」+ 往哪看（来源是不是都没抓到新东西、过关线是不是太高）+ 链接「看运行状态」（`[data-action="go-status"]` → `status`）。不到三轮不显示；中间有一轮有产出就从头数。

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
- 核心错误码 → 桥：`bad-argument` · `bad-edit` · `invalid-note` · `not-editable` · `bad-source` · `bad-topic` · `bad-input` · `bad-url` · `bad-feedback` · `bad-question` · `bad-view` · `locked-node` · `bad-config` · `not-found`（v2 包 A 加 `unknown-library`：登记表里没有的 id）与一切 `duplicate-*` → `bad_arguments`（`bridge-methods.mjs CORE_BAD_ARGUMENT_CODES`）；其余 → `internal`。核心还没有的函数（W5 未落地时）→ `internal`，日志写函数名。
- 「库里已有」的核法：`readNote` / `editNote` / `openInObsidian` 的 id 在 `readIndex` 里；`previewNode` / `getVerdicts` 的 url 在 `replayLedger` 的 states 里；`updateSource` / `removeSource` / `setSourcePaused` 与 `updateTopic` / `removeTopic` 的名字先在 `streams.json` 里查一遍，没有 → `bad_arguments`。
- `openInObsidian`：核心 `notePath` 给的路径必须在 `<库>/notes/` 之内（按文字核），否则 `internal`；`openExternal` 失败才 `openPath`，`openPath` 也失败 → `open_failed`。`openLogsFolder`：文件夹不在或 `openPath` 失败 → `open_failed`。hidden 下两者都只记日志、回 `null`。
- `trySource`：只取来源对象里抓取器读的键（`name` `kind` `url` `query` `topic` `min_points` `max_results`）；`kind` 不在核心 `SOURCE_KINDS`、rss 没有 http(s) 地址、arXiv / HN 没有检索词 → `bad_arguments`，不发请求。`sample` 每项 `{ title, date }`，`http` 没有时为 `null`。
- `searchLibrary`、`getLibrary`、`getGraph`、`getStatus`、`addDemand`、`answerFeedback` 把主进程的时钟（`now` 函数）传给核心。
- `askLibrary` 的模型调用经 `createUsageCounter(库).wrap(连接器, 'ask')` 记进 `usage.jsonl`。v2 包 E 起问库页的一句话先分流（`sendLibraryMessage`，§4.7）：提问才走这条路径，改动要求交主 Agent。
- `savePipeline` 返回的 `config` 是保存后重读的 `pipelineConfig`（带底线项）。`getPipeline().verdictFailures` 的键是配置里全部关卡与摘要节点的 id。
- 发 `library-changed`（payload 同 §4.1）的：`editNote`、`addSource`、`updateSource`、`removeSource`、`setSourcePaused`、`addTopic`、`updateTopic`、`removeTopic`、`savePipeline`，以及真登记了的 `addManualLink`。
- 没选连接时 `startRound` 跑一轮**不打分**的（方案 S1「没有连接也能抓，只是不打分，全部进待看」）：`selfCheck(dir, { connector: null, scoreless: true })` 与 `runRound(dir, { connector: null, scoreless: true, … })`，抓到的全部进待看、0 次模型调用；`round-progress` 的 `result` 与 `getHome().lastRound` 里带 `scoreless: true`；这种轮写待看时核心报的 `inbox` 阶段在事件里仍记 `phase: 'fetch'`（页面的阶段词表没有 `inbox`），不出现 `gate:*` / `summary`。选了连接时照旧（连接器坏 → `started: false` 与 S13）。

**新错误码** `no_connection`：要调模型的方法（`askLibrary`、`previewNode`；v2 包 E 起还有 `sendLibraryMessage` / `resolveLibraryMessage` 去问库或主 Agent 时）在没选连接时回它；页面说「还没选连接方式」并给「去设置」。

**侧栏**：九个入口都成真屏（界面 B 后 `placeholder.js` 只剩不用的工厂，可删）。v2 包 F 起这九个入口收进库页的五个标签，见 §五「界面结构」。

**回答一律是信封**，不抛异常：`{ ok: true, data }` 或 `{ ok: false, error: { code } }`。`code` 只有 `bridge-methods.mjs ERROR_CODES` 里的几个：`refused`（不是本应用页面的主框架发来的）、`bad_arguments`、`no_library`、`open_failed`、`no_connection`、`internal`。细节只进 `logs\main.log`，不给页面。

**页面里怎么调**：`import { call } from '../lib/bridge.js'` → `const data = await call('getAppState')`；失败时抛 `BridgeError`，`err.code` 是上面的代码之一。

**加一个方法**：1. `src/main/bridge-methods.mjs` 的 `BRIDGE_METHODS` 加一项（`args` 个数、可选 `check`）；2. 处理函数放进 `main.mjs` 的 `registerBridge({ handlers })`（业务放 `src/main/services/` 或自己的 wiring）；3. `src/preload/preload.cjs` 的 `METHODS` 加同名；4. 本节上表加一行。少一处 `npm test` 就红；主进程启动时也核「处理函数 = 表」。规矩：参数在主进程里核；页面给的路径不直接进文件系统；不返回任何 key。

**事件：主进程推给页面**。一条通道 `streams:event`，消息是 `{ topic, payload }`：主进程里 `emit(topic, payload)`（`events.mjs createEmitter`），只发给还开着、地址是 `app://ui/` 的窗口，主题不在 `EVENT_TOPICS` 里就抛错；页面里 `onEvent('<主题>', payload => …)`，返回的函数就是 effect 的清理。

<!-- events:begin -->
| 主题 | `payload` | 什么时候发 | 谁在听 |
|---|---|---|---|
| `settings-changed` | `null`；某个库的定时变了时 `{ libraryId }` | 设置变了（语言、库、开关、定时） | `app.js`：重读应用状态 |
| `open-screen` | `{ screen }` | 页面该去某一屏：点了应用的 Windows 通知（`services/notify.mjs`） | `app.js` |
| `update` | `getUpdateState()` 的同一份数据 | 更新有了新东西：开始检查、检查完、下载进度、下完 / 失败 / 校验不过、开始启动安装 | 设置页「关于」（`lib/use-update.js`） |
| `library-changed` | `{ libraryId, path, name } \| null`（当前库） | 打开 / 新建 / 切换 / 改名了当前库，或它的内容变了（索引重建、收藏、来源…） | `app.js`：重读应用状态；今日 |
| `libraries-changed` | `{ libraryId }`（涉及的那个库） | **v2 包 A**：登记表变了（登记、移除、切换、改名字图标颜色） | 包 F 的左栏、库架；主进程自己：重设定时器 |
| `connections-changed` | `null` | 连接的设置变了（选定、模型槽、key 存了或删了） | 设置、S1 |
| `round-progress` | `{ roundId, libraryId, phase, counts, calls, cap, done, result?, problems? }` | 一轮的每个阶段开始、每条打完分、跑完或停下（哪个库的一轮都发，带它的 `libraryId`） | 概览（v1.0 今日；只认当前库的）、S12 |
| `inbox-changed` | `{ libraryId, count }` | 某个库的待看变了（一轮写入、收藏、放弃） | 侧栏角标（只认当前库的 `count`）、待看、今日 |
| `proposals-changed` | `{ libraryId, id, status }`（建库卡 `libraryId` 为 null） | **v2 包 B**：出了一张提议卡，或一张卡被确认 / 不要 / 改一下 / 过期 / 失败 | 包 G 的卡片、「等你定的事」角标 |
| `agent-changed` | `{ phase: 'started' \| 'done', turn, libraryId }` | **v2 包 C**：主 Agent 的一轮开始了 / 结束了（`agentSend`、`acceptSuggestion` 都会发） | 包 G 的对话流（重读 `getAgentTranscript` / `getAgentStatus`） |
<!-- events:end -->

**加一个主题**：`src/main/events.mjs` 的 `EVENT_TOPICS` 加一项、`src/preload/preload.cjs` 的 `EVENT_TOPICS` 加同名、上表加一行；少一处 `npm test` 就红。

### 4.3 §四补：托盘、定时、补跑、导入（11-04 定稿）

**托盘与定时（A2）**：
- 应用启动后在系统托盘放一个图标（`assets/icon` 的那个），提示文字「流息 · n 条待看」（随 `inbox-changed` 更新），菜单：「打开流息」「现在跑一轮」「退出」（字放 `src/main/texts/app.js` 与 `texts-en/app.js`）。
- **关窗口不退出**：`schedule.enabled` 为真时（v2 包 A：**任一个**能读的库的定时开着），点窗口的关闭按钮是把窗口藏起来、留在托盘；只有托盘菜单的「退出」或所有库的定时都关着时才真正退出（方案「想关就关软件」）。测试世界（hidden）里照这个规则走，但不建真托盘图标，改记日志（`tray: …`）。
- **定时**：主进程按核心 `nextRunAt` 设一个定时器；到点时若打开着库、没有一轮在跑，就 `startRound()`；系统从睡眠醒来（`powerMonitor` 的 `resume`）时重算。v2 包 A 起逐库、经队列，见 §4.4。
- **补跑**：启动时（库打开之后）与醒来时，核心 `missedRun(schedule, {lastRoundAt: rounds.jsonl 最后一行的 startedAt, now})` 为真就跑**一轮**，不堆积。v2 包 A 起逐库适用，见 §4.4。
- **一轮跑完的提示**：`services/notify.mjs` 发一条「这一轮进来 n 条待看」（n = 这一轮写进待看的条数，0 条不发），点了打开待看。v2 包 A 起前面带库名：「<库名>：这一轮进来 n 条待看」（`texts/notify.js` / `texts-en/notify.js` 的 `newItems`）。
- 开发与测试钩子：`STREAMS_DEV_NOW=<ISO 时间>` 代替「现在」（定时与补跑测试用）。

| 桥方法（加进 §四表） | 参数 | 返回 | 谁用 |
|---|---|---|---|
| `getSchedule()` | 无 | `{ enabled, time, nextRunAt: ISO \| null, lastRoundAt: ISO \| null, missed: boolean }` | 设置「运行」、今日顶栏「下次运行」 |
| `setSchedule(schedule)` | `{ enabled: boolean, time: 'HH:MM' }`（00:00–23:59） | 同上；写 `settings.json`（v2 包 A 起写当前库的 `streams.json`，§4.4）；发 `settings-changed` | 设置「运行」、首次设置最后一步 |
| `applyHeader(file, header)` | `file` 在待规范里；`header` 是对象或 `null`（用拟好的） | 核心 `applyProposedHeader` 的返回；`not-proposable` / `bad-file-name` / `already-conforming` → `bad_arguments`；发 `library-changed` | S8 |
| `applyAllHeaders()` | 无 | `{ written: [file…], skipped: [{file, code}] }`：对每个拟得出文件头的待规范文件按拟的写入 | S8「全部按拟的写入」 |

`getHome().nextRun` 从 `null` 改成 `getSchedule().nextRunAt`。`chooseLibraryFolder` 的 `state` 多一个值 `importable`（没有 `streams.json`、第一层有 `.md`）；`useChosenFolder` 对它调核心 `importFolder`，然后打开。

**界面**：
- 设置「运行」块：定时开关 + 时刻（`input type=time`）+ 「错过了：下次打开补跑一轮，不会堆积」+ 「关窗口时：收进托盘（定时开着时）」。
- 首次设置第 4 步跑完后多一屏「定时」（方案 A1 走一遍的最后一步）：默认每天 08:30、软件在托盘时运行、错过了下次打开补跑一轮；「完成」= `setSchedule` 接受默认（记「接受默认」）。
- 今日顶栏「下次运行 明天 08:30」（`nextRunAt`；关着时「定时没开」）。v2 包 F 起在库页头，按库各显示各的。
- 资料库「待规范」分页（S8）：每个文件一张卡：问题（缺文件头 / 缺 source 和 date / …）、「流息拟的文件头（可改）」textarea（YAML，预填 `proposedHeader`）、「写入这一个」「跳过」；顶上「全部按拟的写入」；说明「这些文件已经在你的文件夹里，流息没有动它们。给它们加上文件头后才会进库。正文一个字不改。」；拟不出的、文件名不能当 id 的如实说明怎么办；`skippedDirs` 非空时说明子文件夹这一版不读。
- 待看：J / K 移动时把**键盘焦点**也移到当前卡片（`card.focus()`），读屏跟得上（Richard 11-03 的观察）。

### 4.4 §四补：库登记、每库定时、排队（v2 包 A，11-05）

契约 `docs/checks/2026-11-05-wp-a/contract.md`；为什么是「当前库」而不是每个方法多一个 `libraryId`：`docs/design/v2/architecture.md` 第三节「桥」一行。

**登记表与当前库**（`services/library.mjs`，核心 `registry`，`docs/core-api.md` 5.12）：
- `<appData>\libraries.json`（`layout.librariesFile`）：`{ schema: 'streams.libraries/1', active, libraries: [{ id, path, name, icon, color, addedAt }] }`。读整份、逐字段核（坏字段 = 默认，坏的一行丢掉并记日志），写整份（临时文件 + rename）。
- **当前库** = 登记表的 `active`。桥上原有的库相关方法签名不变，都作用于当前库；跨库的事用 §四表里的新方法、显式带 id。主进程自己（定时，以后的主 Agent 与提议卡）按库的文件夹直接调核心，不经桥。
- 打开 / 新建 / 导入（`useChosenFolder`、`openRecentLibrary`、`addLibrary`）= 登记（已登记就不重复）并设为当前库。移除登记只是不再登记，绝不删文件夹里的任何东西。
- **迁移**：启动时没有 `libraries.json`，就用 v1.0 `settings.json` 的 `libraryPath`（排第一、设为当前库）与 `recentLibraries`（其余按最近顺序）建一份；不存在的文件夹不登记（记日志）。`settings.json` 的这两个字段之后只读不写（留作迁移来源，不删）。已有 `libraries.json` 就不再迁移。
- 开发钩子 `STREAMS_DEV_LIBRARY` 仍然优先：它指的文件夹登记过就是那个库；没登记就临时当作当前库（id `dev`，`listLibraries` 里 `temporary: true`），不写进登记表；打开或切到别的库后它就结束。
- 和某个库有关的事件都带 `libraryId`：`round-progress`、`inbox-changed`、`library-changed`；登记表变了发新事件 `libraries-changed`。v1.0 的页面据此只认当前库的：侧栏角标（`lib/use-events.js useInboxCount`）与今日的进度框（`screens/today.js`）不理别的库的事件；页面结构不变。

**每库定时**（`services/schedule.mjs`，核心 `src/library/schedule.mjs`）：
- 定时在每个库的 `streams.json`：`schedule: { enabled, time }`（规则同 v1.0，坏值 = 默认 `{ enabled: true, time: '08:30' }`）。**迁移**：库的 `streams.json` 没有 `schedule` 时，第一次被定时读到（排定时器、补跑、`getSchedule`）就把 v1.0 `settings.json` 的 `schedule`（没有就是默认）写进去（核心 `ensureLibrarySchedule`，整份原子写法，其余字段原样）；已有就照读。
- 每轮上限仍是库的 `pipeline.cap`（v1.0 `pipelineConfig`），桥上原有的方法照旧作用于当前库。
- 定时对所有登记了、文件夹在、`streams.json` 读得出的库生效（开发钩子的临时库也算），各按自己的 `schedule`；读不了的库跳过，记一行日志（同一个库只记一次，好了再坏再记），别的库照跑。
- 计时器规则照旧（一次最多等 `MAX_WAIT_MS`、每次重看时钟、触发过的时刻不再触发），逐库记；一个定时器等所有库里最早的那个时刻。登记表变了（`libraries-changed`）就重排。

**排队**：
- **同一时间只跑一轮**：一个全局队列，按到点先后；同一个库已在队列里或正在跑 → 不重复入队（记日志）。前一轮跑完（`onRoundDone`）才开下一个；没开起来的（自检失败）让下一个接着开。
- **手动「现在跑一轮」（页面的 `startRound`、托盘菜单）也走这个队列，选的是「回『正在跑』的错误」**：队列空闲 → 当前库的一轮马上开（占住队列，期间到点的库排在它后面）；队列忙（任何库的一轮在跑、在开、或有库在排队）→ 页面的 `startRound` 照 v1.0 的规矩回 `bad_arguments`（「一轮在跑」），托盘只记一行日志；手动的从不排进队列。理由：v1.0 的页面已经会处理这个错误，排队则要页面能显示「排在第几」（包 F 的事）。
- **补跑**（启动与睡醒时）：每个库按自己的 `schedule` 与自己 `rounds.jsonl` 最后一轮看欠不欠，欠就补**一轮**（三天没开也只补一轮）；几个库都欠就按各自欠的那个时刻先后依次排队。
- **关窗口进托盘**：任一库的定时开着（v1.0 是「定时开着」）。
- **通知**：一轮写进待看 n 条 → 「<库名>：这一轮进来 n 条待看」（`newItems`，中英两张表都有）；0 条不发。
- 测试：`test/services-schedule.test.mjs`（v1.0 的单库规则）、`test/services-queue.test.mjs`（多库、队列、补跑、跳过、迁移、托盘条件、手动）、`test/services-registry.test.mjs`（登记表、迁移、新桥方法）。

### 4.5 §四补：提议卡、「谁定的」（v2 包 B，11-05）

契约 `docs/checks/2026-11-05-wp-b/contract.md`；核心 `docs/core-api.md` 5.13；`services/proposals.mjs`。本包只有后台，卡片组件在包 G。

**谁出卡、谁让它生效**：主 Agent（包 C）以后经主进程的 `createProposal(kind, params, why, { by })` 出卡——这个函数**不上桥**，页面不能出卡；今天只有开发钩子出卡。卡只经 `confirmProposal` 生效，「不要」「改一下」只记一笔。只有 `pending` 的卡能被确认 / 不要 / 改一下，别的状态 → `bad_arguments`、什么都不做（守卫在核心 `assertPending`，一处）。

**卡的形状**（核心 `draftProposal` 出、`confirmProposal` 等改）：`{ id, kind, libraryId, params, why, before, after, trial?, status, createdAt, decidedAt?, by: 'agent' | 'dev', baseHash, reason?, reviseText?, result?, failure? }`。
- `kind` 十种：`create_library` · `add_source` · `remove_source` · `pause_source` · `edit_topics` · `edit_brief` · `edit_thresholds` · `edit_schedule` · `edit_cap` · `run_round`；`params` 逐种校验（核心 5.13），不合格 → `createProposal` 抛 `bad-proposal`。建库卡之外都用登记 id 指库（不认识 / 读不出的库 → `bad-proposal`，`reason: 'unknown-library'`）。
- `before` / `after` 由代码算：出卡时核心在临时文件夹里拿 `streams.json` 的副本用确认时同一组函数真跑一遍，读出改后；出卡方给的改前改后一律不读。改了等于没改 → `bad-proposal`（`no-change`）。
- `trial`：`add_source` 一个、`create_library` 每个来源一个——出卡时用 v1.0 试抓的同一个函数（核心 `fetchSource`）试抓一次，`{ status（五种之一）, hint, http, message, count, sample, include }`；建库卡里 `blocked` / `gap` 的来源 `include: false`（确认时不加）。
- `baseHash`：这张卡自己会改的那部分配置的哈希（核心 `HASH_FIELDS`，11-09 起：加来源 / 删来源 / 暂停来源 = 来源列表；改主题 = 主题；改要求 = `brief`；过关线 / 定时 / 上限各自那一项；跑一轮不算配置；建库 = 文件夹与它空不空）；确认时重算，不一样 → `stale`。同一轮的「加来源」与「加关键词」两张卡因此都能确认（UC3）。
- 建库卡的位置：`params.folder` 给了就用它（绝对路径），没给 = `libraryRoot\<库名>`（库名里不能做文件夹名的字符换成 `-`，核心 `libraryFolderName`），完整路径写在卡的 `params.folder` 与 `after.folder` 上；文件夹在且不空 → 出卡时 `bad-proposal`（`reason: 'folder_not_empty'`），确认时才不空 → `stale`（`reason: 'folder_not_empty'`）。`libraryRoot` = `settings.json` 的 `libraryRoot`，没有就是默认位置：打包后的应用 `%USERPROFILE%\Documents\Streams`；开发与测试 `STREAMS_DEV_LIBRARY_ROOT`，没给就是 `<appData>\libraries`（开发运行从不落到真的「文档」文件夹，同 §三 的规矩）。今天没有桥方法改 `libraryRoot`（设置页在包 I）。

**确认时做什么**（核心 5.13 的表；写 `streams.json` 一律整份、临时文件 + rename）：来源 / 主题用 v1.0 的 `addSource` · `removeSource` · `setSourcePaused` · `addTopic` · `removeTopic` · `updateTopic`；要求 `saveBrief`；过关线、上限走 v1.0 `savePipeline` / `setRoundCap` 的同一个核心函数 `savePipelineConfig`；定时走包 A 的 `saveLibrarySchedule`（再重排定时器、发 `settings-changed { libraryId }`）；`run_round` 经包 A 的队列（`services/schedule.mjs queueRound`，同一个库在跑或在排就不重复）。建库：`createLibrary` → 要求、主题、勾上的来源、过关线（给了才写）、定时（没给 = `settings.json` 的 `schedule`）→ 包 A 登记并设为当前库（`services/library.mjs adopt`）→ 第一轮进队列。中途一步出错：库的配置卡 → `streams.json` 按字节放回；建库卡在登记之前 → 撤回登记、把这一次在文件夹里建的东西拿掉（原来没有文件夹就连文件夹一起；原来是空文件夹就留下空文件夹），`failure: { step, done, rolledBack: true }`；登记之后（进队列失败）→ 库留着，`failure: { step: 'queue', rolledBack: false }`、`result: { libraryId, folder }`。

**记录**：每张卡出卡时、每次状态变化，各追加一行整张卡到 `<appData>\proposals.jsonl`；与库有关的同时追加到那个库的 `_pipeline\proposals.jsonl`（建库卡：确认后追加到新库的）。启动时从 `<appData>\proposals.jsonl` 重建：每个 id 取最后一行，坏行跳过（记一行日志）；`pending` 的卡重启后还是 `pending`。

**「谁定的」**：库的 `_pipeline\changes.jsonl`，只追加，每次改动一行 `{ at, field, by, proposalId?, before, after }`（`field` ∈ `brief` · `sources` · `topics` · `thresholds` · `schedule` · `cap`）。卡生效 → `by: 'agent-confirmed'`、带卡的 id（核心写）；你在界面上直接改——`addSource` · `updateSource` · `removeSource` · `setSourcePaused` · `addTopic` · `updateTopic` · `removeTopic` · `savePipeline`（过关线、上限）· `setRoundCap` · `setSchedule` · `setLibrarySchedule` · `applyStarterPack`（来源、主题）· `setBrief`（包 F，来源与要求的「要求」）——→ `by: 'you'`（`services/changes.mjs byYou`：改前改后各读一次，变了的字段各一行；改动失败不记；记不下来只记日志，改动照算）。`getWhoDecided()` 给当前库每个字段最近一次是谁定的。

**开发钩子** `STREAMS_DEV_PROPOSALS=<json 文件的绝对路径>`（只在非打包时生效，`main.mjs` 判 `app.isPackaged`）：启动时把文件里的 `[{ kind, params, why }]`（或 `{ proposals: [...] }`）按 `by: 'dev'` 出成 `pending` 卡；库的卡没给 `params.libraryId` 就用当前库的；出不了的卡记一行日志、跳过。给界面测试与包 G 用。

测试：`test/services-proposals.test.mjs`（十种卡经主进程生效、N1、stale、建库与回滚、记录、「谁定的」、开发钩子）、`test/proposals-app.test.mjs`（真应用：开发钩子出的卡经桥列出、确认、不要）。

### 4.6 §四补：主 Agent、建议卡接线（v2 包 C，11-05）

契约 `docs/checks/2026-11-05-wp-c/contract.md`；核心 `docs/core-api.md` 5.15；`services/agent.mjs`。本包只有后台，对话页在包 G。

**一轮怎么跑**（`agentSend(text, { libraryId? })` → 核心 `agentTurn`）：
- **同一时间只有一轮**：服务里一个队列，后来的一句等前一轮跑完再跑（按先后）；每轮开始、结束各发一次 `agent-changed { phase, turn, libraryId }`。没选连接 → `no_connection`（什么都不写）；`libraryId` 不认识 → `bad_arguments`。
- 连接：设置里选定的那条（`services/connections.mjs sessionConnector`，核心 `createSessionConnector`）。Claude Code 与 Codex 在系统临时目录下专门的空文件夹 `%TEMP%\streams-agent-cwd` 里跑（不在应用数据里；契约 C3 写的是 `agent\cwd\`；**实做改为临时目录**（玄翎 11-09），理由：保持 `layout.mjs` 的受保护目录约定——模型子进程碰不到应用数据）、留会话（`session.json` 记 id）：Claude Code 是 v1.0 零工具那组参数去掉 `--no-session-persistence`、第一次 `--session-id <新 uuid>`、之后 `--resume <id>`；Codex 第一次是 v1.0 的 `exec`（`--sandbox read-only`）去掉 `--ephemeral`、会话 id 取 `thread.started` 的 `thread_id`，之后 `exec resume … -c sandbox_mode="read-only" … <id> -`。API key 连接没有服务端会话，每次重放「摘要 + 最近几轮」。库 Agent、问库照旧一问一答、不留会话（v1.0 原样）。
- 主 Agent **不能动手**：它回的 JSON 里只有 `proposals` 能带来改动，每张交给包 B 的 `createProposal(kind, params, why, { by: 'agent' })` 出成 `pending` 卡（§4.5），只有你点「确认」（`confirmProposal`）才生效。它的 `note` 记在 `agent\notes.jsonl`；`lookups` 由代码只读地查（某库的配置与概况、某来源的抓取记录、提议卡、建议卡、已收藏条目的标题），每轮最多 3 次。
- 回答不合格（不是 JSON、两个 `ask`、键不认识…）→ 重试一次；还不行 → 只回能取到的 `reply`（取不到是固定的一句「这次没有听懂模型的回答」/ 英文同义句），**不出卡、不查、不记笔记**，`notice: [{ code: 'not-understood' }]`。连接出错 → `reply: null`、`notice: [{ code: 'connection', connection }]`。
- 会话缓存丢了（删掉 `session.json`）、坏了、或 resume 报「找不到会话」（11-05 实测的两种原话见 `docs/design/v2/agent-trial-2026-11-05.md`）→ 开新会话，从正本取「最新的摘要 + 最近 6 轮」重建上下文（N5），`notice` 带 `session-rebuilt`。
- 长对话：正本自上次摘要以来超过 40000 字 → 这一轮结束时让模型（一次不留会话的调用）缩成一条 ≤ 2000 字的 `summary` 行，`session.json` 的 `summarizedThrough` 前移、会话放掉（下一轮开新会话，只带摘要 + 最近几轮）。
- 用量：Claude Code 会话模式下 `total_cost_usd` 是单次还是会话累计未核实；用量合计以调用次数为准，`costUsd` 可能多算。主 Agent 每次调用记一行 `agent\usage.jsonl`（与库的 `usage.jsonl` 同格式，`purpose` 是 `agent` / `agent-summary`），`getUsageTotal().agent` 单列、并算进合计。

**建议卡接线**（包 D 的规则与记录，architecture 2.4「规则型建议检查」）：
- 每轮流水线跑完（`services/pipeline.mjs` 的 `afterRound`，在 `inbox-changed` 之前；跑成跑不成都查）→ `recordSuggestions(dir, suggestFor(dir, { otherLibraries }))`，`otherLibraries` = 别的、读得出的登记库。
- `listSuggestions({ libraryId? })` 列打开着的卡；`dismissSuggestion(libraryId, key, reason?)` = 库里记一行 `dismissed`，别的不动；`acceptSuggestion(libraryId, key)` **只做两件事**：记一行 `accepted`，再把这张卡写成一段话（核心 `acceptedSuggestionNote`，按界面语言中 / 英）、以 `note` 行交给主 Agent 跑一轮（由它决定出不出提议卡）。库的配置一个字节都不变（测试按字节比对）；没选连接 → `no_connection`，什么都不记。

**开发钩子**（只在非打包时生效，`main.mjs` 判 `app.isPackaged`）：`STREAMS_DEV_CONNECTION=fake` 时主 Agent 用核心的脚本化假连接（`scriptedAgentConnector`），不管选的是哪条连接；`STREAMS_DEV_AGENT_SCRIPT=<json 文件的绝对路径>` 给出一串回答：`[answer, …]` 或 `{ answers: [...] }`，每个是模型的 JSON 回答（对象）、`{ "$text": "…" }`（模型回了这段原文）、`{ "$fail": "<错误码>" }`（连接失败）或 `{ "$lost": true }`（resume 接不上）；用完了回一句固定的「(the script has no more answers)」。`STREAMS_DEV_CONNECTION=login-expired` / `bad-format-once` 时主 Agent 同样失败（每次 / 第一次）。给界面测试与包 G 用。

测试：`test/services-agent.test.mjs`（桥参数、出卡经包 B、一次一轮、正本与状态、开发钩子与打包判断、流水线后记录建议卡、不要 / 要的字节对比、用量）；核心 `core/test/agent.test.mjs`、`core/test/connect-session.test.mjs`。

### 4.7 §四补：问库的对话分流（v2 包 E，11-09）

契约 `docs/checks/2026-11-09-wp-e/contract.md`；核心 `docs/core-api.md` 5.16；`services/ask.mjs`。本包只有后台，问库页上的显示（「这句转给主 Agent」、内联提议卡、拿不准时的两个按钮）在包 G。`askLibrary` 保留不变；包 G 的问库页改用 `sendLibraryMessage`。

**一句话怎么走**（`sendLibraryMessage(text)`，当前库）：
1. **分流**：核心 `routeMessage(text, { connector })`，规则表见 core-api 5.16（只有改动信号 → `change` 0.8；只有提问信号 → `question` 0.8；都有或都没有 → 模型兜底）。模型兜底用设置里选定的连接（`connections.active().connector`，v1.0 的一问一答：无工具、不留会话，与问库同一组参数），经 `createUsageCounter(库).wrap(连接器, 'route')` 记进库的 `usage.jsonl`（`purpose: 'route'`）。没选连接 → 规则判不了的就是 `unsure`（`by: 'none'`）。分流只判断，不改任何东西。
2. **记一行**：库的 `_pipeline/routes.jsonl`（核心 `appendRouteLine`，只追加）`{ at, text: 前 200 字, route, by, confidence }`。
3. **去向**：
   - `question` → 与 `askLibrary` 同一条路径（核心 `ask`，连接器按 `ask` 记用量），`result` = `ask` 的返回原样（连接失败的 `{ ok: false, code }` 也原样）。
   - `change` → 主 Agent：`agentSend(text, { libraryId: 当前库的登记 id })`（包 C，§4.6；排在主 Agent 的队列里），`result` = 它的返回原样（`{ turn, reply, ask, proposalIds, notice? }`，提议卡由包 B 出成 `pending`）。
   - `unsure` → 问库和主 Agent 都不调，返回 `{ route: 'unsure', by, confidence, text }`，由页面问你「这是要改这个库吗？」。
4. 返回 `{ route, by, confidence, result }`。

**你的回答**（`resolveLibraryMessage(text, route)`，`route` ∈ `question` · `change`）：照选的走第 3 步（不再分流、不调分流模型），`routes.jsonl` 记 `{ at, text, route, by: 'you', confidence: 1, resolvedBy: 'you' }`，返回 `{ route, by: 'you', confidence: 1, result }`。

**一次只许一句**：`askLibrary`、`sendLibraryMessage`、`resolveLibraryMessage` 共用一个「正在处理」的位置（从分流开始，到问库或主 Agent 的一轮结束）；这时再来一句 → `bad_arguments`（与问库原来的规矩相同）。跑完或出错都放开。

测试：`test/services-route.test.mjs`（桥参数、三种去向用假连接与包 C 的脚本化假主 Agent 核、`resolveLibraryMessage` 照选的走、`routes.jsonl` 只追加、一次一句、`main.mjs` 接线）；核心 `core/test/route.test.mjs`。

### 4.8 §四补：和主 Agent 聊、提议卡与建议卡组件、问库的分流显示（v2 包 G，11-09）

契约 `docs/checks/2026-11-09-wp-g/contract.md`；设计稿 P2、P6、P8、UC1、UC2 第 4 步、UC3。本包只有界面（renderer + 字典），**没有新的桥方法、没有改主进程**；用的是包 B（§4.5）、C（§4.6）、E（§4.7）已有的方法与事件。字：`texts/agent.js AGENT`（中）/ `texts-en/agent.js`（英），问库新加的几句在 `texts/ask.js ASK`（`inputHint`、`route.*`）。

**提议卡**（`screens/proposal-card.js ProposalCard`，P8；「和主 Agent 聊」与问库共用）：
- 卡头「提议卡 · 你确认后才生效」（定了以后只写「提议卡」）+ 按 kind 的标题（`cardTitle`：建库：<库名>；改「<库名>」：加 N 个来源 / 删来源「x」/ 暂停（恢复）来源「x」/ 改主题 / 改要求 / 改过关线 / 改定时 / 改每轮上限 / 跑一轮；库名取 `useApp().libraries`，取不到写「这个库」）。
- 卡身：为什么（`why`）；**改前 / 改后两栏**直接画卡上的 `before` / `after`（核心在副本上算好的；页面不算，只在每一栏里标出另一栏没有的：改后新加的加粗、改前去掉的划线）——来源 `{ count, names, paused }`、主题 `{ topics }`（关键词逐个）、要求、过关线、定时、上限、跑一轮（上一轮 → 排进队列）；**建库卡**不画两栏，画要求、主题与关键词、来源（每个来源一行：勾 / 不勾、名字、试抓结果「<五种状态之一> · N 条」或「被拒绝 · HTTP 403」；`include: false` 的写「没勾」）、过关线、定时、位置（完整路径）；**加来源卡**另有「试抓结果」一行（状态 · 条数 · 最新一条）。
- 按钮（只在 `pending`）：**确认**（建库卡写「建库」）→ `confirmProposal(id)`；**改一下** → 展开一行输入框（1–2000 字，空的在页面就拒）→「发给主 Agent」= `reviseProposal(id, text)`，再把这句话交给所在页面发给主 Agent（「和主 Agent 聊」：`agentSend(text)`，排在主 Agent 的队列里；问库：`agentSend(text, { libraryId: 当前库 })`），新卡由那一轮出，旧卡显示「已改」；**不要** → `declineProposal(id)`。点了以后到桥回话之前三个按钮都禁用、再点也不发（`useRef` 守着，不靠下一次重画）。
- 状态：`confirmed`「已生效 · 时间」（建库「已建库 · 时间」，旁边「主 Agent 提的 · 你确认的 · 日期」，建库卡另写第一轮排上没有）· `declined`「没要」· `revise`「已改」· `stale`「库在这之后改过，这张卡不再生效」（`library-gone` / `folder_not_empty` 各有一句）· `failed`「没生效：<哪一步>」（步骤名逐个有字，`op:N` = 第 N 处主题改动）+ 撤回了没有。定了的卡收成一行（标题 + 状态），「看卡上写的」展开。
- **没有「以后这类直接做」**，也没有任何开关（维护者 11-05「先不放权」）：卡上的按钮只有上面三个（定了以后只有「看卡上写的」）；测试搜 DOM 里的复选框 / 开关与两张字典。

**建议卡**（`screens/suggestion-card.js SuggestionCard`）：一句话（`source-failing`「来源「x」连续 N 轮没抓到」· `no-output`「这个库连续 N 轮没有产出」· `ai-instruction`「来源「x」的文章里出现过写给 AI 的话」· `topic-overlap`「和「<另一个库>」的主题重合很多」）+ 证据一行（失败 / 被拒绝次数与最近一次；从何时起；几处与一句例子；重合百分比与共同的词）+ **交给主 Agent**（`acceptSuggestion(libraryId, key)`：记一笔、主 Agent 跑一轮）/ **不要**（`dismissSuggestion(libraryId, key)`）。按了以后到桥回话之前禁用；处理过的卡在这一页上留着、写「已交给主 Agent」/「没要」（概览上另有「去和主 Agent 聊」）。处理完发页面自己的 DOM 事件 `streams-suggestions-changed`（`lib/agent.js suggestionsChanged`；不是主进程的主题），左栏角标与各处列表重读。概览里那块（`LibrarySuggestions`）= `listSuggestions({ libraryId: 当前库 })`，没有就写「主 Agent 暂时没有给这个库的建议。」；「等你定的事」= 全部库的，卡上带库名。

**和主 Agent 聊**（`screens/chat.js ChatScreen`，P2）：
- 顶上「等你定的事 · N」`[data-part="waiting"]`（`[data-waiting]` = 待定提议卡 `listProposals` 里 `pending` 的 + 打开着的建议卡 `listSuggestions(null)`，与左栏角标同一个数；没有就「等你定的事 · 没有」）：建议卡、待定的提议卡（已经在下面对话里的那张只写一行「提议卡：<标题>（在下面的对话里）」+「看这张卡」滚过去）；可折叠（「收起 / 展开」）；最高占页面四成，多了自己滚。在这里定了的卡留着显示结果，不再算进 N。
- 对话流 `[data-part="conversation"]`：打开时 `getAgentTranscript({ limit: 100 })`，`hasMore` 时顶上「加载更早的对话」（`before` = 最早一轮 + 1，重复的行按「轮号 + 角色 + 时间 + 长度」去掉，滚动位置不跳）；到了记录的开头才显示主 Agent 的第一句话（界面文字，不在正本里）。`you` 行右侧气泡（从问库转来的带「从「<库名>」的问库转来」）；`agent` 行左侧带「主」圆标，下面是它的问题（`data.ask`：只有最新、后面还没有你的话的那个问题画 2–4 个快捷回答，点了 = 把那一项原样作为你的话 `agentSend`）和这一轮出的提议卡（`data.proposalIds` → `listProposals(null)` 里的卡，`proposals-changed` 时重读）；`lookup` / `note` / `summary` 行只显示一行淡色小字、不显示原文：「查了：<库名> 的概况」（按 `data.request.what`：概况 / 某来源的抓取记录 / 提议卡 / 建议卡 / 已收藏条目的标题）、「记了一笔」（一轮以 note 开头 = 「流息把一张建议卡交给了主 Agent」）、「较早的对话已缩成摘要」。
- `notice`：`agentSend` 的返回里有的、和正本里同样能读出的（`agent` 行 `data.fallback` → `not-understood`；`note` 行 `data.dropped` → `proposals-dropped`、`data.session: 'lost'` → `session-rebuilt`、`data.error` → `connection`）各一句：「这次没有听懂模型的回答」「有 N 张提议没出（格式不对）」「会话接不上，已从记录里接着」「这一轮没有回答：<连接的错误>」+「去设置」；同一轮同一种只说一次。
- 输入框 `textarea[data-field="message"]`（1–4000 字）+「发送」；一轮进行中（本页发出的、或 `agent-changed` 说别处开始了一轮：问库的改动、交给主 Agent；开页时看 `getAgentStatus().busy`）显示「主 Agent 在想…」`[data-part="thinking"]`，输入框、发送、快捷回答都禁用，发送函数本身也拒（`useRef`）；`agent-changed` 的 `done` → 重读正本。没选连接（`agentSend` 回 `no_connection`，或 `getAgentStatus().connection` 是 null）→ v1.0 同一句「还没选连接方式，这一步要用模型。」+「去设置」`[data-part="no-connection"]`。
- 库架的「新建库 · 和主 Agent 聊着建」、库架空状态的「和主 Agent 聊」进这里（包 F 已接）。

**问库的分流显示**（`screens/ask.js`，P6、UC3）：输入框改调 `sendLibraryMessage`；占位「问这个库，或者说说想怎么改它…」，下方小字「只用这个库的条目回答 · 想改来源、主题、要求，直接说：会转给主 Agent，出一张提议卡」`[data-part="input-hint"]`。`[data-turn][data-route][data-by]`：
- `question` → v1.0 的问库回答原样（出处编号可点、库里没有、想补的主题、哪里不对；右栏只看问题那几轮）；
- `change` → 你的话旁「这句转给主 Agent」`[data-part="routed"]`，下面主 Agent 的回复（与「和主 Agent 聊」同一个气泡组件 `AgentBubble`）、它的问题与快捷回答、提议卡（同一个 `ProposalCard`）、notice；快捷回答与「改一下」的话用 `agentSend(text, { libraryId: 当前库 })` 发；
- `unsure` →「这是要改这个库吗？」`[data-part="unsure"]` + 「是，改这个库」`[data-action="route-change"]` /「不是，问问题」`[data-action="route-question"]` → `resolveLibraryMessage(text, 'change' | 'question')`，只认第一次点。
- 这个库的问答记录照 v1.0 留在这一页上；转给主 Agent 的那几轮在正本里，所以「和主 Agent 聊」也看得到。

**开发钩子造场景**（截图与界面测试的做法，钩子本身是 §4.5 / §4.6 的）：`STREAMS_DEV_CONNECTION=fake` + `STREAMS_DEV_AGENT_SCRIPT=<json>`（一串回答，按调用的顺序用：带 `ask` 的出问题、带 `proposals` 的出卡——建库卡的来源名要是 `[a-z0-9-]`、地址指本机的 feed 服务器，试抓就不出本机；`{ "$text": … }` 两次 = not-understood；`{ "$lost": true }` 紧跟一次成功的回答 = session-rebuilt；`{ "$fail": "login-expired" }` = 连接问题）+ `STREAMS_DEV_PROPOSALS=<json>`（启动时出的待定卡）+ `STREAMS_DEV_LIBRARY_ROOT`（建库卡的文件夹落在测试目录）；建议卡用核心 `recordSuggestions` 先写进库的 `suggestions.jsonl`；较早的对话用核心 `appendTranscript` 先写进 `<appData>\agent\transcript.jsonl`。stale：出卡之后经桥改那一项（如 `setRoundCap`）再点确认；failed：把那个库的 `streams.json` 设成只读再点确认（写不进 → `failed`，库原样）。见 `test/ui-agent.test.mjs` 与 `scripts/shots-agent.mjs`。

测试：`test/ui-agent.test.mjs`（真应用）。

### 4.9 §四补：资料库阅读器、阅读窗口与阅读模式、待看的「写给 AI 的话」标记（v2 包 H，11-09）

契约 `docs/checks/2026-11-09-wp-h/contract.md`；设计稿 P5、UC4、UC5 第 3 步。代码：`screens/library.js`、`src/main/reader.mjs`、`src/main/services/reader.mjs`、`services/browse.mjs showNoteInFolder`、`screens/inbox.js`、`screens/verdict-dialog.js`、`styles/reader.css`。不改核心。

**资料库页（P5）**：
- 打开时哪个分页：路由点名了就用它；否则先读一次计数（`getLibrary('kept')`），**已收藏为 0 → 「抓到的」**，否则「已收藏」（每次重读都这样定，直到你点了某个分页；已收藏从 0 变 1 只会是一次收藏，而在本页收藏会自己切到「已收藏」）。读到计数之前没有哪个分页是当前的。
- **没选条目时顶上没有任何按钮**，右侧只有「在左边选一条来读」（`[data-part="pick-one"]`）。「已收藏」「我写的」照 v1.0 自动打开第一条；「抓到的」「待规范」不自动选。
- 选中**有文件的条目**（已收藏、我写的、搜索结果）：「编辑」「打开原文」（来源是 http(s) 才有）「更多」；「更多」菜单（`kit/menu.js`）= 「用 Obsidian 打开」（`openInObsidian`）、「在资源管理器中显示」（`showNoteInFolder`）、「在浏览器里打开」（来源是 http(s) 才有；`openReader(url, 'browser')`）。
- 选中**抓到的条目**（还没有文件）：「收藏」「打开原文」「更多」；「更多」只有「在浏览器里打开」，**不出现**「用 Obsidian 打开」「在资源管理器中显示」。「收藏」走待看那条现成的路：`keepItem(url)` → 核心 `keep` → `writeNoteFile(by: 'keep')`（V2）。核心只收「在待看里等你拍板」的条目（stage `inbox`），所以停在半路的条目（没过关、排队）「收藏」是灰的，正文下写一句「只有在待看里等你拍板的条目能收藏；这一条停在了半路」。在待看里的条目，右侧多显示它的摘要（`getInbox` 里同一张卡的「这是什么」与要点）。
- 收藏之后：页面切到「已收藏」并打开刚写的那条，标记写「已收藏 · 进了 notes/」（`[data-kept-now="true"]`），「更多」里这时才有 Obsidian 与资源管理器两项；`keepItem` 发 `inbox-changed { libraryId, count }` 与 `library-changed`，标签与左栏的待看数照事件更新。
- 「打开原文」= `openReader(url, 'reader')`（下面的阅读窗口）；v1.0 的 `openItemUrl` 仍是待看卡片标题的「打开原文」（系统浏览器），没改。

**阅读窗口**（`reader.mjs createReader`；一次一个，再开另一条就在同一个窗口里换）：
- 创建参数：`BrowserWindow`（窗口本身的 web contents = 顶栏）+ 一个 `WebContentsView`（正文），两者 `webPreferences` 都是 `READER_WEB_PREFERENCES`：`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`nodeIntegrationInWorker: false`、`nodeIntegrationInSubFrames: false`、`webviewTag: false`、`webSecurity: true`、`allowRunningInsecureContent: false`、`partition: 'streams-reader'`，**没有 `preload` 这个键**（页面里没有 `window.streams`）。分区不带 `persist:`：内存里的会话，关了就没，和应用的默认会话分开。
- 会话（`hardenReaderSession`）：`onBeforeRequest` 只放 http(s) 与 `data:`（`file:`、`app:`、`ws:` 等一律取消）；权限请求、权限检查、设备权限一律拒；`will-download` 一律取消并记日志。
- 每个 web contents（`guardReaderContents`）：`setWindowOpenHandler` 一律 `deny`（想在新标签页开的链接交系统浏览器，弹窗什么都不开）；`will-attach-webview` 拒；WebRTC 不走自己的 UDP；`will-redirect` 与子框架导航只许 http(s)。顶栏 `will-navigate` 一律拒，只认 `https://streams-reader.invalid/<back|reading|original|browser>` 这四个动作（顶栏是主进程写的静态页，没有脚本、没有桥，按钮就是指向这四个地址的链接）。正文 `will-navigate` 一律拒在窗口里，是 http(s) 才交 `shell.openExternal`（测试只记日志 `not opened in a test run: <url>`）；页面还在加载、加载完不到 1 秒、或离上次交出不到 1 秒的，当作脚本跳转、只记日志不打开（避免原网页的脚本替你开浏览器）。
- 应用自己那道锁（`security.mjs guardContents`，只许 `app://ui/`）对这两个分区的 web contents 不套（`main.mjs` 用 `isReaderSession` 判），由上面这套接手；判错的话是套上应用那道锁——什么外部页面都开不了，不会放宽。
- 顶栏：「回到条目」（关掉阅读窗口、应用窗口到前面）、地址、抽不出正文时的那句提示、「阅读模式 | 原网页」、「在浏览器里打开」。字体与颜色用应用的 `tokens.css` + `styles/reader.css`，`<html data-theme>` 是当前主题；词在 `src/main/texts/app.js` / `texts-en/app.js` 的 `reader`。

**阅读模式怎么抽正文**：
1. 主进程经阅读分区的 `session.fetch` 取原网页（只 http(s)、跟随重定向、20 秒、最多 5 MB、只收 `text/html` / `application/xhtml+xml`），按 `Content-Type` 或前 2 KB 里的 `<meta charset>` 解码（GBK 等也认，不认识的按 UTF-8）。
2. 开一个**隐藏窗口**（`EXTRACT_WEB_PREFERENCES`：同上的隔离、不加载图片，分区 `streams-reader-extract`，这个分区的所有请求一律取消），载入 `about:blank`，把 `@mozilla/readability` 自己的 `Readability.js`（原样，包在函数里不留全局）和原网页的 HTML 字符串一起交给 `executeJavaScript`：用 `DOMParser` 解析（这样得到的文档**不跑任何脚本、不加载任何东西**），补上 `<base>`，跑 `new Readability(doc).parse()`。
3. 结果再清一遍：去掉 script / style / iframe / form / embed / svg 等元素、`on*` / `style` / `srcset` / `target` 属性，链接与图片只留 http(s)（图片另许 `data:image/`），相对地址改成绝对地址。
4. 抽出的字少于 200 个、或一半以上是链接文字 → 算「抽不出」：正文里直接加载原网页，顶栏写「这一页抽不出正文，显示的是原网页」，「阅读模式」灰掉。抽得出 → 主进程写一张阅读页（标题、来源 · 作者 · 「阅读模式：只留正文，去掉了导航和广告」、正文），CSP `default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'`，以 `data:` 地址载入（超过 2 MB 也退回原网页）。隐藏窗口用完就关。
5. 只读：网页内容不写进库，不写盘。

**待看的「写给 AI 的话」标记**（UC5 第 3 步）：卡片的 `aiInstruction === true`（包 D，核心 `listInbox`）→ 卡片右上一条琥珀小标「这一条里有写给 AI 的话，已忽略」（`[data-ai-instruction]`）；悬停（`title`）是命中的原句（卡片的 `verification.aiInstruction`：规则命中的 `matches[].phrase`，或判定的 `evidence`），没有就说原句在「这一条的记录」里。「这一条的记录」（`VerdictDialog`）顶上多一块 `[data-part="ai-instruction"]`，列核验记录里（`verdictsFor` 各组的 `aiInstruction`）规则命中的原句与判定找到的说法（`[data-ai-phrase]`）。收藏 / 放弃 / 稍后不受影响。

测试：`test/reader.test.mjs`（纯 Node：参数、会话锁、各 web contents 的锁、两张页、字符集与大小上限、`openReader` 的核法）、`test/ui-reader.test.mjs`（真窗口：创建参数逐项、阅读模式内容与主题字体、页面脚本没跑、原网页切换、链接交系统浏览器、新窗口 / 非 http(s) / 下载被拒、抽不出退回并有那句提示、不认识的地址被拒、回到条目）、`test/ui-library-reader.test.mjs`（空收藏默认抓到的、没选条目没有按钮、抓到的「更多」里没有 Obsidian、待看标记有 / 没有、收藏后 notes/ 里的文件与菜单变化与待看数）、`test/ui-library.test.mjs`（有收藏默认已收藏）、`test/services-browse.test.mjs`（`showNoteInFolder`）。全部用本机的假站（`test/support/reader-site.mjs`），不上外网。截图：`docs/shots/2026-11-09-*.png`（`npm run shots -- --screen <id>`，见 `scripts/screenshot.mjs` 的 v2 包 H 一组）。

### 4.10 §四补：首次打开、新建库、设置页（v2 包 I，11-09）

契约 `docs/checks/2026-11-09-wp-i/contract.md`；设计稿 P9、UC1。新桥方法只有三个：`getLibraryRoot` · `chooseLibraryRoot` · `setLibraryRoot`（§四表）；`getAppState` 多两个字段 `libraryCount`、`activeConnection`，`recordSetupStep` 在没有库时可以记连接那一步。

- **首次打开的触发**（`app.js`）：应用状态第一次回来时 `libraryCount === 0`（登记表一个库都没有，也没有开发钩子的临时库）才进首次打开；不是 v1.0 的「没打开库」。登记表里有库就不进：有当前库 → 它的概览；有库但没有当前库 → 库架。（核心 registry 读的时候把 `active: null` 当成第一个库，所以主进程自己给不出「有库、没当前库」；测试在主进程里替换 `getAppState` 的回答造这个场景，核的是页面的规则。）只在启动时判一次：之后把库全移除了也不回首次打开（库架说「还没有库」）。
- **首次打开**（`screens/first-run.js`）：自己的侧栏两步「连接方式 · 想追踪什么」。第 1 步是 v1.0 的连接一步原样（检测、推荐、登录回路、key 对话框、「用这一条」= `setActiveConnection` + `probeConnection`、「这一步先跳过」），没有「上一步」。走完 → `recordSetupStep('connection', { by: 'chose', detail: <kind> })` 或 `{ by: 'skipped' }`——这时没有库，主进程写进 `settings.json` 的 `setupConnection: { by, at, detail? }`——然后 `onDone` 进「和主 Agent 聊」（第 2 步就是那一页）。
- **第 2 步：和主 Agent 聊的引导**（`screens/chat.js FirstGuide`，`[data-part="first-guide"]`）：应用一个库都没有时（`useApp().libraries` 是空列表）显示在对话上方：「想追踪什么？」+「告诉主 Agent 你想持续跟踪什么，它会帮你拟一个库：主题、来源、过关线，你确认后才建。」+ 三个示例句子（`[data-action="example"][data-example=0..2]`，点了只填进输入框并把光标放进去，**不发送**）+「也可以手动新建」（`[data-action="manual-new"]` → 新建库）。`getAppState().activeConnection` 为 null（跳过了连接）时多一行「还没有连接，主 Agent 用不了。」+「去设置」（`[data-part="guide-no-connection"]`），输入框自己那行 v1.0 的「还没选连接方式」这时不再画第二遍。有了库，引导就不显示。
- **新建库 = 手动新建**（`screens/new-library.js NewLibraryScreen`，路由 `new-library`）：左栏「+ 新建库」、库架「新建库」与空库架的「手动新建」、引导的「也可以手动新建」都走 `useApp().newLibrary()` → 这个路由（`params.back` = 从哪来）。v1.0 首次设置去掉连接那一步，四步原样：库放在哪（`chooseLibraryFolder` → `useChosenFolder('')`；只有第一步有「取消」`[data-action="cancel-new"]`，回到来的那一屏）→ 主题与来源 → 试跑一轮 → 定时（`setSchedule`，作用于刚建好、已是当前库的那个库）→「完成，去待看 / 去概览」。空文件夹建库、只有 .md 的文件夹导入，都往下走；**选的文件夹里已经有库：打开它、流程就此结束、去它的待看**（v1.0 的字「这里已经有一个库：会直接打开它。」本来就这么说；不再往下给它套起步包、也不记任何一步）。建好即登记并成为当前库（包 A）。`setup` 照 v1.0 / 包 A 的规矩记：`library`（chose + 文件夹状态）· `pack` · `sources` · `trial` · `schedule`；`connection` 由主进程在 `useChosenFolder` 新建 / 导入时从 `settings.json` 的 `setupConnection` 抄进去（`at` 照原样，那个库已有连接记录就不动；打开已有的库不抄）——合起来仍是 v1.0 的六条。v1.0 的「新建库」对话框（`NewLibraryDialog`，库名 + 两个按钮）没有了：库名默认用文件夹名，改名在别处（`setLibraryMeta`）。
- **设置页**（`screens/settings.js`，P9）自上而下五组 `[data-group=connection|agent|library|look|software]`，组名 `.settings__group-name`：
  - 连接 `[data-group="connection"]`：v1.0 的三条连接与每条两个模型槽原样，下面多一行「主 Agent 用这条连接的主模型。」`[data-part="agent-uses"]`。
  - 主 Agent `[data-part="agent"]`：`getAgentStatus` 写成字——连接 `[data-agent-connection]`（没有 →「还没选连接，主 Agent 用不了」）、会话 `[data-session=live|none|api]`（接着上一次的会话（N 轮）/ 没有接着的会话 / API key 不留会话）、对话 `[data-turns]`「N 轮 · M 条记录」、上次缩写 `[data-summary]`；按钮「打开和主 Agent 聊」`[data-action="open-chat"]`。没有清空对话。`agent-changed` 的 done 与 `connections-changed` 时重读。
  - 库：**新建库默认放在** `[data-part="library-root"][data-root-default=true|false]`：路径 `[data-root-path]`（`getLibraryRoot`；没设时是实际的默认位置并标「默认位置」），「换一个文件夹…」`[data-action="change-root"]` = `chooseLibraryRoot()`（系统选文件夹对话框，开发钩子 `STREAMS_DEV_CHOOSE_FOLDER` 同 v1.0 用法），「恢复默认」`[data-action="reset-root"]` = `setLibraryRoot(null)`（已是默认时不可点）；结果一行 `[data-root-note=saved|bad|failed]`，被拒（相对路径、应用数据文件夹本身或里面）说「这个文件夹不能用：要一个完整的路径，而且不能在流息自己的应用数据文件夹里。」。下面是包 F 的「定时一览」「全部库本月用量合计」原样。
  - 外观与语言：主题、语言原样。
  - 软件：关于（版本与检查更新、由 Starry Digital 开发、许可证与致谢）、高级（开发者信息、复制诊断信息）原样。**契约写的「开机启动」v1.0 就没有这一项**（没有桥方法；本包只许加三个新桥方法），所以没有。
  - 去掉的：v1.0 的「库」一节（当前库的路径、其他库的列表、「新建库」「打开已有文件夹」「重建索引」「首次设置」记录）。页面上不再有 `[data-part="library"]`。
- **来源与要求底部「这个库」**（`screens/sources.js ThisLibraryPart`，`[data-part="this-library"]`）：文件夹路径 `[data-library-path]` + 「在资源管理器中显示」`[data-action="reveal-library"]`（`revealLibrary`，测试只记日志）；首次设置的记录（`getSetup`，`settings.js SetupRecord`，`[data-part="setup"]`）；「重建索引」`[data-action="rebuild"]`（`[data-rebuilt=<count>]`）；「移除这个库」`[data-action="remove-library"]` → 先问 `[data-dialog="remove-library"]`（「只去掉登记…文件夹和里面的文件一个都不删」，`[data-action=cancel-remove|confirm-remove]`）→ `removeLibrary(id)`（只去掉登记，绝不删文件）→ 去库架。
- **新建库默认放在的规矩**（`services/library.mjs`）：`libraryRoot` 没设 → 默认位置（装好的流息 `%USERPROFILE%\Documents\Streams`；开发运行 `STREAMS_DEV_LIBRARY_ROOT`，没给就是它自己应用数据里的 `libraries`，所以开发运行从不写真的 Documents）。**v2 包 J2**：默认位置由 `src/main/library-root.mjs` 在第一次用到时才算（不在启动时）；装好的流息拿不到 Documents（`app.getPath('documents')` 抛错）时退到 `<用户主目录>\Streams`，再不行退到 `<应用数据>\libraries`，`main.log` 记一行，应用照常启动（原来整个起不来）；`createLibraryService` 的 `defaultLibraryRoot` 因此也可以是函数。测试：`test/library-root.test.mjs`、installer 的 `packaged.test.mjs` 第 4b 步。设的值必须是绝对路径、不能是 `layout.protectedDirs`（应用数据文件夹）本身或在它里面（大小写不论），否则 `bad_arguments`、`settings.json` 一个字节都不变。提议卡建库（包 B）读它；新建库的选文件夹对话框打开时停在那里。
- 字：`texts/first-run.js`（`title` 改「流息首次打开」、`steps.track`、定时一步「以后在这个库的『来源与要求』里改」）、`texts/agent.js AGENT.guide`、`texts/shell.js` 的 `newLibrary`（只剩标题与「取消」）与 `thisLibrary`、`texts/settings.js` 的 `groups` · `conn.agentUses` · `agent` · `root`（去掉了 v1.0「库」一节的字）；英文表同键。

## 五、界面写法

**选型：Preact 10 + htm，原生 ES 模块，不构建**（理由照云织：离线、合严格 CSP、小、局部更新）。

```
src/renderer/
  index.html        CSP <meta>、import map（preact、preact/hooks、htm）、styles/app.css、app.js
  app.js            App：当前路由、navigate()（v1.0 的 id 经 `ALIASES` 换成现在的地方）、应用状态、库的列表（`useLibraries`）与「等你定的事」（`useWaiting`）、每个库记住的页面与滚动（`memory`）、切库（`openLibrary`）、「新建库」对话框；显示当前屏幕；没打开库时显示首次设置（screens/first-run.js），做完才回到入口
  lib/              html.js · bridge.js（call、onEvent）· use-load.js · use-update.js · format.js（fmt、日期）· app-context.js（useApp）· use-events.js（useEvent、isOfLibrary；`useInboxCount` 留着、v2 不再用）· agent.js（v2 包 G：useProposals、useSuggestions、useAgentBusy、suggestionsChanged）· libraries.js（v2 包 F：useLibraries、useWaiting、tracking「在追」、firstSentence）· action.js（Act：带 data-action 的按钮）· markdown.js（renderMarkdown：笔记的 Markdown 切成 Preact 元素，不经 HTML 字符串）
  kit/              组件（下表），从 kit/index.js 引
  screens/          index.js（SCREENS：id → 组件；ALIASES；FIRST_SCREEN；LIBRARY_FIRST_SCREEN）· first-run.js（S1 四步）· shelf.js（P1 库架）· chat.js（P2 和主 Agent 聊，v2 包 G：等你定的事、对话流、输入框；AgentBubble、Notice、Compose）· proposal-card.js（P8 提议卡，包 G）· suggestion-card.js（建议卡、概览那一块，包 G）· new-library.js（「新建库」对话框）· library-frame.js（库页外壳：库头 + 五个标签 + 屏；ViewSwitch）· overview.js（P3 概览 = v1.0 今日 S2 + S13 出错卡片 + 运行状态）· status.js（概览里「运行状态」那一块 RunStatus）· run-dialog.js（S12，概览上的对话框）· inbox.js（S3 / P4）· library.js（S6 / P5）· graph.js（S9，资料库的图谱视图）· edit-dialog.js（S7）· verdict-dialog.js（S15）· ask.js（S10 / P6）· sources.js（S5 + 要求 + 本库定时与上限 + 谁定的 = P7 来源与要求）· pipeline.js（S4 的部件 = 来源与要求里的「关卡」GatesSection）· settings.js（S14 / P9；连接行的零件也从这里导出）· settings-update.js · placeholder.js（没人用的占位工厂）· kit.js（开发时）
  texts/            页面自己写的所有字：common.js（品牌、侧栏的两个入口与「设置」、五种状态、日期、三种连接与登录回路的词、节点名、阶段名）· shell.js（v2 包 F：我的库、角标、五个标签、库头、库架、新建库、谁定的、要求、关卡、定时一览、用量合计）· first-run.js · today.js（概览）· inbox.js · run.js · settings.js · library.js（含编辑与核验记录两个对话框的字）· sources.js · pipeline.js · status.js · ask.js · graph.js · screens.js（占位页）· kit.js；common.js 末尾加了界面 B 共用的：五态的「怎么办」句 `FETCH_HINTS`、`SOURCE_STATES`（已暂停 / 还没抓过）、`SOURCE_KINDS`、`NOTE_STATUS`、`NO_CONNECTION`
  texts-en/         英文字典，与 texts/ 同名同键（§六）
  styles/           app.css（@import 列表）· tokens.css（token 名单，docs/tokens.md）· base.css · kit.css · menu.css · screens/<屏幕>.css
```

**界面结构（v2 包 F，11-05：方案 B；设计稿 `docs/design/v2/streams-v2-design.html` 的导航、P1、P3–P7、P9）**

- **左栏不随库变**（`kit/sidebar.js AppSidebar`）：品牌「流 · 流息 · STREAMS」→「库架」`a[data-nav="shelf"]` →「和主 Agent 聊」`a[data-nav="chat"]`（角标 `[data-badge="chat"]` = 待定的提议卡数 `listProposals({ status: 'pending' })` + 未处理的建议卡数——桥上有 `listSuggestions` 才数，包 C / G 接线前是 0；两者都 0 不画；`proposals-changed`、主 Agent 一轮结束（`agent-changed` done）与页面上处理了建议卡（`streams-suggestions-changed`，§4.8）时重读：`lib/libraries.js useWaiting`）→ 小标题「我的库」→ 每个登记的库一行 `a[data-library-row=<id>]`（库的图标方块 `LibraryMark`、名字、待看数 `[data-library-badge]`、有问题时一个琥珀小点 `[data-problem=missing|sources|no-output]`；`data-active` = 是不是当前库；在它的库页上时 `aria-current="page"`，画成白卡片）→「+ 新建库」`[data-action="add-library"]` → 底部「设置」。v1.0 的九个入口（今日、待看、资料库、图谱、问库、流水线、来源与主题、运行状态）没有了，全在库页里。
- **库的列表**（`lib/libraries.js useLibraries`，`app.js` 放进 `useApp().libraries`）：`listLibraries` 与 `getLibrariesOverview` 按 id 合成一行；`libraries-changed`、`library-changed` 与一轮结束（`round-progress` 带 `done: true`，哪个库的都算；包 J1 补：否则库架卡片的「上次更新」与琥珀小点要等别的事件才变，`test/ui-shelf-after-round.test.mjs`）时整份重读；`inbox-changed { libraryId, count }` **只改那一行的 `inbox`**（别的库的事件不碰这一行；没带 libraryId 的事件 → 整份重读）。左栏、库架、库头都读它。
- **点一个库**（`app.js openLibrary`）：不是当前库 → `setActiveLibrary(id)`（失败 = 文件夹不在：留在原处、列表重读）→ 回到这个库上次停的那一页；第一次开 → 它的「待看」（`LIBRARY_FIRST_SCREEN`，设计稿 UC2）。应用启动停在当前库的「概览」（`FIRST_SCREEN`；v1.0 启动在今日）。
- **每个库各自记住**（内存，`app.js memory`）：`routes`：库 id → 最后停的路由（标签与参数，例如资料库的图谱视图）；`scroll`：「库 id:屏」→ 主体（`.st-main__body`）滚到哪。回到那一屏、它有了数据之后放回去；之后才长出来的部分（来源与要求的「要求」「关卡」各自读数据）每 100 ms 再放一次，直到放到、且主体里没有 `data-state="loading"` 的部分（最多 3 秒），这期间的滚动不算你的。换库时库页整个重新挂（`key` 带库 id），上一个库的东西不会留在页面上。
- **库页**（`screens/library-frame.js LibraryFrame`）：一张卡片——库头 `[data-part="library-head"]`（图标方块、名字 `h1#lib-head-name`、「在追：…」`[data-part="tracking"]` = 要求的第一句，没有要求就是主题名，都没有就「还没写要求，也还没有主题」；右边是这一屏的按钮，如概览的「下次运行 · 连接」与「现在跑一轮」、来源与要求的「贴一个链接进待看」「加来源」、资料库的「编辑」「用 Obsidian 打开」「打开原文」）→ 五个标签（`kit/library-sections.js LibrarySections layout="tabs"`：`nav.st-lib-tabs button[data-tab=<id>][aria-current]`，待看带这个库的数 `[data-tab-badge="inbox"]`，问库是对话气泡图标）→ 屏本身（`Main` 照旧带 `data-screen` / `data-state`；有右栏的屏右栏在卡片里）。各屏原来的顶栏留作库页里的一行小标题（`h2`），按钮挪到库头。
- **组件的 A / B 两种排法**（方案 A 保留）：`LibrarySections` 的 `layout` 是 `'tabs'`（方案 B：库页顶部的标签）或 `'sidebar'`（方案 A：同五项画成左栏入口 `a[data-nav=<id>]`，用侧栏零件 `SidebarNav`）；`current` 认路由 id（图谱算资料库，`TAB_OF`）、`badges` 给角标、`onSelect(id)`。换方案 A = 进库后左栏用 `Sidebar` + 「‹ 库架」+ `LibrarySections layout="sidebar"`，库页不画标签；屏本身不用改。本包只用 B。
- **各标签的数据**（都作用于当前库，包 A 的「当前库」）：
  - 概览 `overview`（`screens/overview.js`，P3）：v1.0 今日的全部（`getHome`：横幅——来源出问题、连续 N 轮没有产出、上一次「现在跑一轮」的问题卡含登录过期；四个数；上一轮各步的数 = 流水线的「上一轮」；正在跑的进度；最近收藏）+「现在跑一轮」与下次定时（库头）+「运行状态」一块（`screens/status.js RunStatus`，`getStatus`：上次运行 · 上次你拍板 · 本月调用次数 `[data-stat]`，来源状态一览 `[data-part="source-status"] [data-row]`，「复制诊断信息」「打开运行记录文件夹」）+「主 Agent 给这个库的建议」（桥上有 `listSuggestions` 才列标题，否则不画；卡片是包 G 的）。v1.0 运行状态里的三条连接不再在库页里（连接不是哪个库的），在设置。
  - 待看 `inbox`、问库 `ask`：v1.0 的屏原样搬进库页（`getInbox` … / 问库自包 G 起经 `sendLibraryMessage` 分流，§4.8）。待看右栏的「去调提示词」到来源与要求的「关卡」。
  - 资料库 `library` 与它的图谱视图 `graph`：v1.0 两屏，小标题行右边「列表 / 图谱」切换（`ViewSwitch`，`[data-mode=list|graph][aria-pressed]`）；图谱的 `Main` 仍是 `data-screen="graph"`，标签算资料库。
  - 来源与要求 `sources`（`screens/sources.js`，P7）：左列「要求」`[data-part="brief"]`（`getBrief`；「改要求」→ 文本框 → 「保存」`setBrief`：streams.json 的 `brief`、`changes.jsonl` 记 `by: 'you'`；空的或过 2000 字在页面就拒）、主题、本库的「定时与每轮上限」`[data-part="run"]`（`getLibrarySchedule` / `setLibrarySchedule` 用当前库的 id，开关与时刻改了就存；上限 `getPipelineSettings` / `setRoundCap`）；右列来源（v1.0 来源与主题的行与对话框）；下面「关卡」`[data-part="gates"]`（`screens/pipeline.js GatesSection`：v1.0 流水线的节点条、关卡的要求、过关线、材料、核对单、试一条、保存 / 恢复默认，右边是上一轮各节点、最近的放弃理由、没通过核验的原因）。每块旁边「谁定的」`[data-who=brief|topics|sources|schedule|cap|thresholds][data-by=you|agent-confirmed|setup]`（`getWhoDecided`：你改的 · 日期 / 主 Agent 提的 · 你确认的 · 日期 / 没有记录 =「首次设置」）。
- **库架** `shelf`（`screens/shelf.js`，P1）：每个库一张卡 `[data-shelf-card=<id>]`（图标、名字、「在追」、上次更新 `lastRoundAt` · 来源数、待看数大字、问题一行：文件夹不在 / 来源出问题 / 连续 N 轮没有产出，或「来源都正常」）；最后一张「+ 新建库 · 和主 Agent 聊着建」`[data-action="new-card"]` → 和主 Agent 聊；点卡片 = 点左栏那一行。一个库都没有：一句引导 + 「和主 Agent 聊」「手动新建」两个按钮 `[data-part="shelf-empty"]`。
- **和主 Agent 聊** `chat`（`screens/chat.js`）：v2 包 G，见 §4.8（等你定的事、对话流、提议卡与建议卡、输入框）。
- **新建库**（**v2 包 I 起**是 `screens/new-library.js NewLibraryScreen`，路由 `new-library`，见 §4.10；包 F 时是对话框 `NewLibraryDialog`：库名 + 「选一个空文件夹新建」/「打开已有文件夹」）：左栏「+ 新建库」、库架「新建库」「手动新建」、首次打开引导的「也可以手动新建」。
- **设置**（P9 的最小改动，包 I 再改）：定时与每轮上限不在设置里改了；「定时一览」`[data-part="schedules"]`（每个库一行 `[data-schedule-row=<id>][data-schedule=on|off]`：名字、每天几点或「关」、下次运行；只读；点名字 `[data-action="go-library"]` → 切到那个库的来源与要求、滚到「定时与每轮上限」）与「全部库本月用量合计」`[data-part="usage"]`（`getUsageTotal`：调用次数、输入 / 输出 token、每个库各几次）。其余设置项不动。**v2 包 I 起**分五组（连接 · 主 Agent · 库 · 外观与语言 · 软件），加主 Agent 状态与「新建库默认放在」，当前库的项搬到来源与要求的「这个库」，见 §4.10。
- v1.0 的 id 仍然能用（`screens/index.js ALIASES`：`today` → 概览、`status` → 概览并滚到「运行状态」、`pipeline` → 来源与要求并滚到「关卡」），所以开发钩子 `--screen today`、通知的 `open-screen`、首次设置的「去今日」都有去处。

**加一屏**：1. `screens/<id>.js` 导出组件；库外的屏外面套 `AppFrame`（`sidebar=${html\`<${AppSidebar} current=${id} />\`}`）、`Main screen=${id} state=${…}`，库页的一个标签套 `LibraryFrame tab=<标签> state=${…} actions=${…} panel=${…}`（再在 `kit/library-sections.js` 的 `LIBRARY_SECTIONS` / `TAB_OF` 加一行）；2. `screens/index.js` 的 `SCREENS` 加它；3. 字写进 `texts/<id>.js` 并给 `texts-en/<id>.js`；4. 样式写进 `styles/screens/<id>.css`（类名用屏幕前缀），在 `styles/app.css` 加 `@import`；5. 数据走 §四 的桥。

**主题**（11-04，方案 5.6 D5；`docs/tokens.md`）：三套——河蓝 `river`（原来那套）、素灰 `paper`（浅色侧栏）、夜间 `night`（暗色）。`settings.json` 的 `theme` 是三个 id 之一，别的值 = 默认；默认只在 `src/main/theme.mjs` 的 `DEFAULT_THEME` 一处（现在 `river`，维护者 周五选完只改这一行）。三套的 id、窗口底色（各套的 `--st-page`）、明暗在 `src/shared/themes.mjs`（主进程和设置页都读）。
- **第一帧就是选定的那套**：主进程开窗口时 `backgroundColor` 取那一套的 `--st-page`（`windowColour`）；`app://ui/index.html` 由 `protocol.mjs` 每次按设置在 `<html>` 上加 `data-theme="<id>"` 再发出（`theme.mjs withTheme`，id 先过 `THEME_IDS`，别的写不进页面），所以样式在任何脚本跑之前就是那一套；`nativeTheme.themeSource` 在开窗口前就设好（night → `dark`，另两套 → `light`：标题栏、原生滚动条、下拉菜单跟着）。
- **换**：设置「主题」一节的下拉（`[data-part="theme"] select[data-field="theme"]`，三项「河蓝 / 素灰 / 夜间」）→ `setTheme(id)` 写设置、主进程改 `nativeTheme.themeSource` 和每个窗口的底色、发 `settings-changed`；页面拿到回答马上把 `<html data-theme>` 换掉，`app.js` 之后按 `getAppState().theme` 保持一致。重启（或页面重新载入）时 index.html 又按设置发出，还是它。
- 样式只用 token：`tokens.css` 的 `:root` 是河蓝，`:root[data-theme="paper"]`、`:root[data-theme="night"]` 只覆写不同的值，各写 `color-scheme`；首次设置、对话框、图谱、问库都只用 token，跟着换。11-04 加了一个 token `--st-on-accent`（强调色底上的字）。
- 并排截图：`npm run shots:themes`（`scripts/theme-shots.mjs`：每套一个新的播种世界、主题先写进 settings.json 再起真窗口，拍同一组十个画面）→ `docs/shots/themes/<id>/<画面>.png` 与 `docs/shots/themes/index.html`（每个画面一行、三套三列）。

**首次设置**（`screens/first-run.js`，S1；**v2 包 I 起是「首次打开」**：触发改为 `libraryCount === 0`，只有连接一步，然后进和主 Agent 聊；下面库放哪 / 主题与来源 / 试跑 / 定时几步现在是新建库 `screens/new-library.js` 的，见 §4.10）：不是入口里的一屏，`app.js` 在应用状态第一次回来、`library` 为 null 时显示它（`setup` 状态），直到它调 `onDone(screen)`；开发时也可以按 id 打开（`npm start -- --screen first-run`）。它用侧栏零件（`Sidebar`）自己摆四步（`[data-step][data-step-state=current|done|todo]`），每步一个组件：库放哪（`chooseLibraryFolder` → `useChosenFolder('')`）、连接方式（三张卡 `[data-connection][data-selected]`，「用这一条」= `setActiveConnection` + `probeConnection`，未登录的卡带登录回路，可跳过）、主题与来源（`getStarterPacks` → 删来源 / 加 RSS → `applyStarterPack`，每个来源的试抓状态用 `st-fetch`）、试跑一轮（`estimateRound` → `startRound`，`round-progress` 画在 `[data-part="round-progress"][data-phase][data-done]`，跑完「去待看」「去今日」）。「谁定的」11-04 起每步走完写进库的 `streams.json` 的 `setup`（`recordSetupStep`，见 §4.1「首次设置记『谁定的』」）。连接行的零件（检测词 `detectWords`、`connectionState`、登录回路 `LoginLoop`、试调结果 `ProbeLine`、key 对话框 `ApiKeyDialog`）在 `screens/settings.js` 里，首次设置和今日的出错卡片共用。

**界面 B 的屏**（11-03，§4.2 的要点；数据一律经桥，改了库之后听 `library-changed` 重读；页面不算数字，条数、状态、分数都是桥给的）：
- `library`（S6）：主区里两栏（列表 300px · 正文），右栏 `Panel` 是「这一条」。列表：搜索框（停 250 ms 后 `searchLibrary`，≤ 200 字）、四个分页（`getLibrary(view, filter).counts`，`[data-view][data-count]`）、主题与「最近 30 天」筛选（`[data-filter-topic]` `[data-filter-days]`，主题名来自 `getSources().topics`）、行 `[data-row=<id | url | 文件名>]`。正文：`lib/markdown.js` 画，`[[链接]]` 按核心的规则（先 id、再标题）在已收藏 + 我写的里找，找到的可点（`[data-wiki-id]`）、找不到的只画成灰字（`[data-wiki-missing]`）；正文里的普通网址只显示、不跳（页面离不开 `app://ui/`）。右栏：主题、来源、各关分数、文件名、「这一条的核验记录」、链到这里的、同一来源的。「抓到的」行带各关分数与停在哪一步（`[data-stopped]`，词在 `texts/library.js`），点开可看核验记录；「待规范」只读列出文件与问题码的说法。顶栏「编辑」「用 Obsidian 打开」（`openInObsidian`）「打开原文」（`openItemUrl`，只给 http(s) 来源）——**v2 包 H 起改了**：按钮只对选中的条目出现，「用 Obsidian 打开」进了「更多」、只对有文件的条目，「打开原文」开阅读窗口（`openReader`），见 §4.9。`navigate('library', { id })` 直接打开那一条（图谱、问库的出处用它）。
- `edit-dialog`（S7）：`Dialog name="edit"`，只有标题、主题（标签 × 去掉；「+ 加主题」选项来自 streams.json 的主题）、正文三个字段；「插入 [[链接]]…」用 `searchLibrary` 找一条，把 `[[标题]]` 插在光标处；没有主题时「保存」不能按；保存只送改了的键（`editNote`），`bad_arguments` 说「这样改不合规范，文件没有动」。
- `verdict-dialog`（S15）：`Dialog name="verdicts"`，导出 `VerdictDialog({ url, title, onClose })`；按核心 `verdictsFor` 的组（同一步再跑一次是新的一组，按写入顺序）逐轮列每项：过 / 没过、规则 / 判定、证据；`claimedNotDone` 单独一行「说做了其实没做」；核对项的说法取 `getPipeline` 的核对单 `desc`，没有就显示 id；结果行 = 这一步最后一组全过与否 + 轮数。待看卡片的入口由 PM 集成时接。
- `sources`（S5；v2 包 F 起是「来源与要求」的来源与主题两块，见上「界面结构」）：来源行 `[data-row=<name>][data-state]`（五态 / `paused` / `never`）、`[data-hint]`（`FETCH_HINTS`）、「试抓」（`trySource`，结果 `[data-tried]`）、「暂停 / 恢复」、「改地址 / 改检索词」（`[data-dialog="edit-source"]`）、「删除」（`[data-dialog="remove-source"]` 先问）。「加来源」（`[data-dialog="add-source"]`）：识别（`guessSource`）→ 可改种类、地址、名字（核心建议的 `name` 预填）、默认主题 →「试抓」→ 只有对现在这份填写试抓过、且结果是正常 / 没新内容 / 暂时失败时「加入」才能按（改了地址要重试）。「贴一个链接进待看」（`[data-dialog="add-link"]`，`addManualLink`，见过的说「已经见过」）。主题表 `[data-topic-row]`：关键词可改（逗号或顿号隔开）、加、删（先问）。
- `pipeline`（S4；v2 包 F 起不是一屏，是来源与要求里的「关卡」`[data-part="gates"]`，右栏挪到编辑区右边）：节点条 `[data-flow-node][data-kind][data-locked]`；选中模型关卡或摘要：要求、输出格式（只读，`JSON.stringify(output)`）、过关线（0–1 之外在页面就拒、不发送）、材料、工具（没有）、核对单（`origin: 'streams'` 标「底线」、没有删除钮；自己的项至少 6 个字才加）、「试一条看结果」（从 `getLibrary('caught')` 选一条 → `previewNode`；没选连接 → `NO_CONNECTION` +「去设置」）。保存把 `getPipeline().config` 改过的整份交给 `savePipeline`。右栏：上一轮各节点（`lastRound`）、最近的放弃理由、各步最近没通过核验的原因。
- `status`（S11；v2 包 F 起不是一屏，是概览里的「运行状态」`[data-part="run"]`：三格 `[data-stat]`、来源 `[data-part="source-status"]`，连接三行留在设置；下面是 v1.0 的写法）：四格 `[data-num=last-run|last-decision|month-calls|next-run][data-value]`（`statusView` 的 `lastRound.startedAt` · `lastDecisionAt` · `monthUsage.calls` · 定时未接时 `none`）；连接三行用设置页导出的零件拼（`connectionState` · `detectWords` · `LoginLoop` · `ProbeLine` · `probeView`），未登录的行是第四处「去登录」+ 副句 +「我登录好了，再试一次」；来源行五态词 + 连续轮数 + 「软件已经做了什么 / 需要你做什么」，地址有问题 / 被拒绝的行有「去处理」→ 来源与主题。顶栏「复制诊断信息」「打开运行记录文件夹」。
- `ask`（S10）：顶栏范围（`getLibrary` 的 `counts`）；每轮问答 `[data-turn][data-state]`，每句后面的出处编号 `[data-cite]` 可点、在下方出处表 `[data-source-n][data-highlight]` 里标出，「打开」→ 资料库那一条；`removedCites` / `removedSentences` 非零各一行提示；`notInLibrary` 画成正式答案「库里没有。」；有 `notInLibrary` 或 `missing` 时给「记到想补的主题」（预填 `missing`）；「这个回答哪里不对」。问着时输入框禁用、显示「正在查库……」；`no_connection` →「去设置」。右栏：这次用了什么（命中 / 用了 / 调用 / 连接名 / 没给工具不联网 / 核对几轮）、想补的主题（`getDemands`，`suggest` 标「建议加成主题」）。`Answer` 组件导出给页面内的测试画一条给定的答案。
- `graph`（S9）：节点位置 = `PAD_X + col × COL_GAP`、`PAD_Y + row × ROW_GAP`（`screens/graph.js` 导出这几个常数与 `place`），大小随 `count`；实线 topic / source → item，虚线（弧线）link；`svg[data-part="graph"]` 带着这份数据的 `data-days` / `data-status` / `data-links`（核心回显的 `filters`），测试据此等新数据画好。点条目开右下的框（`readNote` 补来源、日期、状态）。多于 60 条只画日期最近的 60 条（日期从 `getLibrary` 的条目取：图谱的节点不带日期），保持核心的列序。

**设置的「软件」部分**（S14 的「软件」一块拆成几节：语言 · 主题 · 高级 · 关于）：「主题」一节见上；「关于」一节在「由 Starry Digital 开发」下面加按钮「许可证与致谢」（`[data-action="licenses"]`）→ 对话框 `[data-dialog="licenses"]`（`getLicenses`）：流息本身（`[data-part="own"][data-license]`，MIT，`LICENSE` 全文在可滚动的 `[data-part="license-text"]` 里，下面「由 Starry Digital 开发」= `openMakerPage`）；随软件带的组件表（`[data-part="components"]`，每行 `[data-component]`：名字、版本、许可证——Electron · Chromium · Node.js 的版本取运行时，Preact · htm · @mozilla/readability 取应用里的 `package.json`）；「打开完整的第三方声明」（`[data-action="open-notices"]` → `openNotices`）：装好的应用里可点、打开安装目录的 `THIRD-PARTY-NOTICES.txt`；开发时这个文件没有，按钮不可点，旁边一句为什么（`[data-notices-why]`）。组件名、版本、许可证、LICENSE 全文是数据，不在字典里；对话框自己的字在 `texts/settings.js` 的 `licenses`。

**规矩**（测试会核）：页面写的每一个字都在 `texts/` 里（别处的字符串里出现汉字就红，`test/wording.test.mjs`）；`texts/` 里的每个字串过用词扫描器 0 命中（V7 禁词：Bronze / Silver / Gold / judge / keeper / gate / Medallion / pending / ledger；品牌词只许在「连接你电脑上的 …」里，`wording/banned-terms.json`）；汉字旁一律全角标点；英文表与中文表键一一对应、没有汉字、没有禁词（`test/texts-en.test.mjs`）；**颜色只用 `tokens.css` 的变量**，别的样式文件里写 `#xxxxxx`、`rgb()` 就红，每个 token 都在 `docs/tokens.md` 的名单里（`test/kit.test.mjs`）；不用行内样式字符串、不用 `innerHTML`；源文件只用 LF、不放看不见的字符。测试用的挂钩：`main[data-screen][data-state]`（`ready` 表示数据到了）、`[data-nav=<id>]`、`[data-part=<id>]`、`[data-action=<id>]`（按钮外的一层，`lib/action.js Act`）、`[data-num=inbox|caught|passed|kept][data-value]`（概览的四个数字，v1.0 的今日）、`[data-dialog=run|dismiss|api-key]`、`[data-card][data-url][data-current]`（待看的卡）、`[data-connection=<kind>][data-conn-state]`（连接行）。页面不算数字：概览（v1.0 今日）的四个数字直接是 `getHome` 的 `numbers.inbox` · `numbers.caught` · `lastRound.counts.inbox` · `numbers.kept`。

**组件**（`kit/index.js`；`npm start -- --screen kit` 看全部）：`AppFrame` / `Main` / `Panel`（232 · 主区 · 404，间距 12）、`AppSidebar` 与侧栏零件（v2 加 `SidebarLibraryItem`、`SidebarAdd`）、`LibrarySections`（库的五个分区，`layout` = `tabs` | `sidebar`）/ `LibraryMark`（库的图标方块，颜色 `--st-lib-<名>`）、`TopBar`、`Button` / `LinkButton`、`PanelTabs`、`CardFrame`（`waiting` · `answered` · `plain`）、`Steps` / `StageProgress` / `stepClass`（小方块）、`Tag` / `Notice`（`wait` · `done` · `recommend` / `plain`）、`Icon`（线条图标；新增 `inbox` · `graph` · `flow` · `rss`；v2 加 `chat` · `chart` · `gear` · `play`）、`Popover`、`Menu`、`Dialog`；五种抓取状态的小标签是 CSS 类 `st-fetch st-fetch--<state>`（`kit.css`，颜色 `--st-fetch-*`）。文字样式类 `st-t-heading` · `st-t-title` · `st-t-body` · `st-t-small` · `st-t-tiny` · `st-t-sub` · `st-t-muted` · `st-t-strong` · `st-t-wait` · `st-t-done` · `st-t-num`。

## 六、语言

照云织：`settings.json` 的 `language`（`auto` · `zh-CN` · `en`，`locale.mjs`），`auto` 跟系统（系统显示语言里有中文就是中文）；页面在英文下由 `app://ui/` 用 `texts-en/<name>.js` 代替同名 `texts/<name>.js` 发出，`<html lang>` 与窗口标题跟着 `BRAND`；设置页切换后页面自己重新载入。开发时 `npm start -- --lang en`，测试钉中文（`STREAMS_DEV_SYSTEM_LANGUAGES=zh-CN`）。英文版叫 Streams，侧栏（v2）：Shelf · Chat with the main Agent · My libraries · New library · Settings；库页五个标签：Overview · Inbox · Library · Ask · Sources & Brief。

## 七、测试

`npm test`（node:test，`--test-concurrency=1`）。带 Electron 的测试每个文件起一次应用：系统临时目录下一个空世界（`scripts/lib/world.mjs`）、Playwright 启动钉死的 Electron 44.0.0、窗口不显示，跑完关应用（超时就结束整棵进程树，`scripts/lib/close-app.mjs`）再删文件夹。

| 文件 | 核什么 | 起 Electron |
|---|---|---|
| `security.test.mjs` | 页面里没有 Node；外部地址在页面里被 CSP 拒、在会话里被拒（本机测试服务器一个请求也没收到）；桥只回应本应用的页面；权限一律拒；下载被拒；WebRTC 不发 UDP；CSP 头与 `<meta>`；不能写 HTML、不能 eval；`app://` 不越界；桥上恰好是 §四 的方法；Electron 自己的数据在受保护目录、本地数据在外面、真的 `%APPDATA%\Streams` 没被建 | 是 |
| `events.test.mjs` | `emit` 只发表里的主题、只发给开着的本应用页面；`onEvent` 只收表里的主题与函数、只交 `payload`、能取消；`setShowDeveloperInfo` → `settings-changed` → 页面重读状态、不重载；`open-screen` 让页面去那一屏；侧栏 232px、主区从 244 起、页面不横向溢出 | 是 |
| `language.test.mjs` | 英文界面：侧栏九个词、窗口标题、`<html lang>`；设置页切中文重载、切跟随系统不重载；没设置时系统无中文 → 英文 | 是 |
| `single-instance.test.mjs` | 第二次启动立刻退出、第一个把窗口提到前面 | 是 |
| `tray.test.mjs` · `ui-schedule.test.mjs` | 定时开时关窗口进程还在、关时退出；`STREAMS_DEV_NOW` 下错过 → 启动补跑一轮且只一轮、`notifications.jsonl` 一条，没错过 → 不补；设置「运行」改时刻 / 关定时写 settings.json、25:00 被拒；今日顶栏；首次设置「定时」屏。测试世界的 `settings.json` 默认 `schedule.enabled: false`（`test/support/app.mjs`），要定时的测试自己打开 | 是 |
| `services-schedule.test.mjs` | 假时钟下补跑判定、只补一轮、定时器到点只跑一次、提示 0 条不发、托盘菜单 | 否 |
| `services-route.test.mjs`（v2 包 E） | 库内对话分流（§4.7）：`question` 只调问库、`change` 只调主 Agent 且带当前库 id、`unsure` 两个都不调；`resolveLibraryMessage` 照选的走、不调分流模型；`routes.jsonl` 只追加；一次一句（与 `askLibrary` 共用）；三张方法表；`main.mjs` 接线 | 否 |
| `protocol.test.mjs` | 不起 Electron：页面文件 200；指向别的机器的写法 1 秒内 404；路径规则逐条；中文文件名；英文下 `texts/` 换 `texts-en/`；组件一览只在开发时发 | 否 |
| `bridge.test.mjs` | 预加载、主进程表、本文 §四 表三者一致；事件主题三处一致；预加载只交出一个对象；信封与错误码 | 否 |
| `layout.test.mjs` · `settings.test.mjs` · `locale.test.mjs` | 布局；settings.json 的每个字段；语言的判定与状态 | 否 |
| `kit.test.mjs` | tokens.css 与 docs/tokens.md 名单一致；三套主题的块（`:root` 定义全部、另两套只覆写 `:root` 有的名字）；别处不写颜色；五种状态各有一对 token；字体与主色是 维护者 定的 | 否 |
| `theme.test.mjs` · `licenses.test.mjs` | 三个主题 id、`DEFAULT_THEME` 只定义一处；三套的 `color-scheme`、窗口底色与 `--st-page` 一致；契约的十二组字 / 底对比度（素灰、夜间 ≥ 4.5；河蓝两组照旧不到，列在 `RIVER_BELOW`）；index.html 发出时带 `data-theme`；docs/tokens.md 三栏值与 tokens.css 一致。许可证：开发时读仓库的 LICENSE、装好的布局读应用里那份、五个组件、第三方声明只在装好的应用里有 | 否 |
| `ui-theme.test.mjs` | 设置里是夜间时第一帧：发出的 index.html 带 `data-theme="night"`、页面底色、窗口底色、`nativeTheme`；选素灰马上换、写进设置、原生一侧跟着；不认识的 id → `bad_arguments` 不写盘；关掉再开还是素灰 | 是 |
| `ui-setup-record.test.mjs` · `ui-first-run.test.mjs` | 首次设置六步的记录（读 `streams.json`）：选的 / 写的（删了来源、加了 RSS）/ 默认（空白包原样、定时照显示）/ 跳过（连接、试跑）；往回退再走只替换那一步；没有记录的库「没有记录」。**v2 包 I 起**：首次打开 = 登记表空才进（两步侧栏）；连接一步记进 `settings.json` 的 `setupConnection` → 和主 Agent 聊的引导（三个示例只填不发：正本没多一行；跳过连接时「还没有连接」+「去设置」只说一次）→「也可以手动新建」→ 新建库四步，库登记且成为当前库，`setup` 六条、连接那条从 `setupConnection` 抄来（时间不变）；反向：有库但没有当前库（在主进程里替换 `getAppState` 的回答）→ 库架、不是首次打开；记录显示在来源与要求的「这个库」 | 是 |
| `services-library-root.test.mjs` · `ui-settings-i.test.mjs`（v2 包 I） | 不起 Electron：`getLibraryRoot` 默认 / 设过；`setLibraryRoot` 拒相对路径、应用数据文件夹本身与里面（大小写不论）、不写盘；`chooseLibraryRoot` 取消 = null、钩子代替对话框；没有库时 `recordSetupStep('connection')` 写 `setupConnection`、别的步 `no_library`、坏的 `bad_arguments`；新建库抄 `setupConnection`、打开已有的库不抄。真窗口：设置五组的顺序与各自的部分、没有当前库的项；主 Agent 状态（一轮之后变 1 轮）、打开和主 Agent 聊；新建库默认放在：默认 → 换 → 写进设置 → 恢复默认；桥上拒的路径不写盘、对话框选了应用数据里的文件夹页面说「不能用」；来源与要求「这个库」：路径、首次设置记录、重建索引、在资源管理器中显示（只记日志）、移除先问、取消不动、确认后登记没了而文件夹每个文件逐字节还在、去库架 | 部分 |
| `ui-today.test.mjs` | （加）rounds.jsonl 末尾两轮没有产出不出横幅、三轮出琥珀横幅带「看运行状态」、中间有产出就从头数 | 是 |
| `ui-shell.test.mjs`（v2 包 F） | 三个登记的库（`seedShelf`）+ 一张待定的提议卡：左栏方案 B 的结构、每行的图标 / 名字 / 待看数（核心 `homeNumbers` 重算）/ 问题小点 / 当前库高亮、和主 Agent 聊的角标；`inbox-changed` 带 libraryId 只改那一行（另两行不动）；点库 → `libraries.json` 的当前库变、进它的待看、库头「在追」是要求的第一句；五个标签都在当前库上、资料库的图谱视图；切库再切回标签与滚动各自记住、第一次开的库停在待看；库架的卡片（与 `getLibrariesOverview` 对照）、问题一行、点卡片进库、新建卡进和主 Agent 聊、一个库都没有时的空状态（登记移除、文件不动）；来源与要求：确认提议卡后「谁定的」= 主 Agent 提的 · 你确认的，自己保存要求 → `streams.json` 与 `changes.jsonl`（`you`）、空的要求在页面就拒；本库定时与上限在这里改（`streams.json`、谁定的 = 你）、关卡在这一页；设置没有定时与上限的编辑、定时一览三行、用量合计等于核心 `usageTotal`、点名字进那个库的来源与要求 | 是 |
| `ui-agent.test.mjs`（v2 包 G） | 三个库 + 五张开发钩子出的卡 + 两张建议卡 + 113 行的旧对话 + 脚本化的主 Agent：等你定的事的数与左栏角标一致、可折叠；正本一页 100 行、加载更早的，lookup / note / summary 只一行淡字不露原文；UC1 一个问题带快捷回答（发出的是选项原文）→ 建库卡（试抓、没勾）→ 建库后左栏多一个库；四种 notice 各一句、连接问题带去设置；一轮进行中不可再发（主进程那一个方法加延迟）；建议卡交给主 Agent / 不要；提议卡不要 = declineProposal、确认连点只调一次、stale、failed、改一下；卡上没有任何开关；问库 unsure 两个按钮带对的 route、change 的「这句转给主 Agent」+ 卡 → 确认后「谁定的」、question 的回答；在页面里画出每种状态与四种建议卡 | 是 |
| `ui-licenses.test.mjs` | 许可证与致谢：全文与仓库 LICENSE 逐字一致、「由 Starry Digital 开发」、五个组件的版本、开发时「打开完整的第三方声明」不可点并写原因、桥回 `open_failed` | 是 |
| `wording.test.mjs` · `texts-en.test.mjs` | 字典过扫描器 0 命中、全角标点、别处无汉字、LF；英文表与中文表对齐、无禁词 | 否 |
| `app-id.test.mjs` · `icon.test.mjs` · `deps.test.mjs` · `start.test.mjs` | 身份值；streams.ico 的五个尺寸（重建对比要 sharp，没有就跳过并说明）；依赖钉死；`npm start` 的文件夹规矩 | 否 |

**每项检查都能失败**：`npm run mutants` 在临时副本上逐个故意改坏、跑对应的那条测试，要求「没改坏的副本通过、改坏的副本失败」，并核原文件字节没变：`no-node` · `csp-off` · `session-open` · `bridge-extra` · `banned-word` · `d2-unc` · `d3-emit-any-topic` · `d3-any-topic` · `d4-any-sender` · `d4-permissions-open` · `d10-any-root` · `tokens-undocumented` · `colour-outside-tokens` · `en-missing-key`。11-02 首跑：14 项里 13 项 CAUGHT；`d2-unc` 只在「冷」的时候抓得到——Windows 会把连不上的 SMB 主机 `\\192.0.2.1` 记进否定缓存几分钟，缓存热时 realpath 2 毫秒就回来，改坏的副本也过了「1 秒内 404」这条（冷时 21 秒，抓到）。这是测试判据的盲区，不是改坏项的问题；跑它前别碰那个地址。v2 包 F 加五项（11-09 跑：5 / 5 CAUGHT，原文件字节没变）：`f-sidebar-any-library`（inbox-changed 不看 libraryId，每一行都改）· `f-brief-not-yours` 与 `f-brief-not-yours-ui`（保存要求不记 you：服务层测试与界面测试各抓一次）· `f-tabs-one-memory`（停在哪个标签不按库记）· `f-scroll-one-memory`（滚动不按库记）。v2 包 G 加四项（11-09 跑：4 / 4 CAUGHT，原文件字节没变）：`g-decline-confirms`（提议卡的「不要」调 confirmProposal）· `g-send-while-busy`（一轮进行中仍可发送）· `g-unsure-yes-question`（「是，改这个库」传 question）· `g-card-press-twice`（卡上的按钮到桥回话前还能再按）；都跑 `test/ui-agent.test.mjs` 的对应一条（这几条单独跑也成立，不靠前面几条用掉的脚本回答）。副本里另加了 `core` 的联接（`scripts/lib/mirror.mjs`：主进程与测试都从仓库引核心，没有它副本起不来）。

**每项检查都能失败**：`npm run mutants` 在临时副本上逐个故意改坏、跑对应的那条测试，要求「没改坏的副本通过、改坏的副本失败」，并核原文件字节没变：`no-node` · `csp-off` · `session-open` · `bridge-extra` · `banned-word` · `d2-unc` · `d3-emit-any-topic` · `d3-any-topic` · `d4-any-sender` · `d4-permissions-open` · `d10-any-root` · `tokens-undocumented` · `colour-outside-tokens` · `en-missing-key`。11-02 首跑：14 项里 13 项 CAUGHT；`d2-unc` 只在「冷」的时候抓得到——Windows 会把连不上的 SMB 主机 `\\192.0.2.1` 记进否定缓存几分钟，缓存热时 realpath 2 毫秒就回来，改坏的副本也过了「1 秒内 404」这条（冷时 21 秒，抓到）。这是测试判据的盲区，不是改坏项的问题；跑它前别碰那个地址。v2 包 F 加五项（11-09 跑：5 / 5 CAUGHT，原文件字节没变）：`f-sidebar-any-library`（inbox-changed 不看 libraryId，每一行都改）· `f-brief-not-yours` 与 `f-brief-not-yours-ui`（保存要求不记 you：服务层测试与界面测试各抓一次）· `f-tabs-one-memory`（停在哪个标签不按库记）· `f-scroll-one-memory`（滚动不按库记）。副本里另加了 `core` 的联接（`scripts/lib/mirror.mjs`：主进程与测试都从仓库引核心，没有它副本起不来）。v2 包 H 加六项（11-09 跑：6 / 6 CAUGHT，原文件字节没变；副本的 `node_modules` 多联一个 `@mozilla/readability`）：`h-obsidian-for-caught`（抓到的条目「更多」里也有用 Obsidian 打开）· `h-default-kept`（空收藏也默认已收藏）· `h-reader-preload`（阅读窗口的正文加上应用的 preload）· `h-reader-node`（阅读窗口开 `nodeIntegration`）· `h-no-fallback`（抽不出正文时不退回原网页）· `h-ai-mark-on-all`（每张待看卡片都带「写给 AI 的话」标记）。

## 八、从云织拿了什么、没拿什么、改了什么

**拿了（改名后）**：主进程 `main.mjs` 骨架、`layout`（改成 appData + localData 两个目录）、`security`（去掉 `app://draft/` 那一道）、`protocol`、`safe-path`、`bridge` + `bridge-methods`（表只剩外壳的 10 个方法）+ `preload.cjs`、`events`（三个主题）、`secrets`（名字改成 `key-<厂商>`，加 `list()`）、`services/update` + `update-wiring`（`RELEASES_REPO` = `AsuraNale/streams`，`/STRELAUNCH`）、`services/env-proxy-fetch`、`services/notify`（改成通用的「说一句、点了去某屏」）、`diagnostics`、`log`、`quit`、`icon`、`locale`、`version`、`settings`（只剩 language / libraryPath / showDeveloperInfo）、`app-id`（`StarryDigital.Streams`，新 CLSID）；`app-services` 自己写了个最小的。页面 kit 的 frame / sidebar（重写）/ topbar / button / tabs / card / progress（去掉 core-words）/ tag / icons（加四个）/ popover / menu / dialog / index；lib 的 html / bridge / use-load / use-update / format / app-context；styles 的 base / kit（去掉研究流程、余额）/ menu / screens/settings；`screens/settings-update.js`；`index.html`、`app.js`（去掉研究屏路由与余额）。脚本 start（重写）、screenshot（重写：一张真窗口）、run-tests（无夹具）、csp、mutation-check（14 个改坏项）、build-icon 与 lib 的 paths / dev-root / temp（mkdirSync）/ close-app / remove-tree / viewer / icon（sharp 的位置可配）/ mirror（只拷 desktop/）/ world（空世界）。测试 security / protocol / layout / locale / language / app-id / icon / start / single-instance / bridge / events / deps / wording / texts-en 改到能跑，`settings-model` 换成 `settings.test`，新加 `kit.test`。

**没拿**：services/engine、registry、workbench、reading、draft、milestones、projects、new-project、project-admin、balance、usage-ledger、conversation、keycheck、signing、sandbox-check、各 wiring、home-model、reading-model、workbench-model、page-frames、folders、resources、texts 里的研究词、`data/deepseek-prices.json`；页面的研究屏、`kit/balance.js`、`kit/project-menu.js`、`kit/pipeline.js`（引用不存在的研究词与 `shared/pipelines.mjs`，删掉）、`lib/money.js`、`use-balance.js`、`cn-numerals.js`、`core-words.js`、`limit.js`、`first-run` 屏（连接流程是方案 C2，不在今天）；`scripts/test-head.mjs` 与 `lib/mirror.mjs` 的 git HEAD 镜像（它镜像的是云织的 app-core）；按工单编号命名的截图与变异脚本；研究相关的测试；`src/shared/` 里的研究模块（换成 `fetch-states.mjs`）。

**没拿**：`installer/test/`（装、升级、卸载的测试）引用云织的引擎替身、Python 与余额替身，改名后也跑不起来，11-02 验方核出 57 行源产品残留，当天删掉；安装包那一轮（11-06）按流息的安装包重写。

## 九、已知缺口与要定的事

1. 11-03 界面 A 落地：首次设置、今日（含 S13 出错卡片与 S12 对话框）、待看、设置的连接方式 / 运行 / 库三块。同日界面 B 的六屏与两个对话框落地（§五「界面 B 的屏」），九个入口没有占位页了；待看的「去调提示词」落到流水线；待看卡片「这一条的记录」（`VerdictDialog`）由 PM 集成时接。
2. `release.json` 的 `version` 写成 `1.0.0`、`pre_release: dev.0`、`app_ver_name: 流息 1.0.0-dev.0`：`version.mjs` / 更新比较只认 `major.minor.patch` 数字，`1.0.0-dev.0` 填进 `version` 会让应用显示 0.0.0、安装包构建拒绝。要不要改 `VERSION_RE` 以认预发布号，归 PM。
3. 图标是 15 分钟内的记号（三条白色波浪 + river 圆角方块，`assets/icon/README.md`）；小尺寸由大图缩下来，没有像素级手画版；重建要 sharp（不是本仓依赖）。
4. `services/update.mjs` 的更新状态里还有 `turnRunning`（云织的「研究回合在跑」）：现在永远是 false，以后由流水线的「这一轮在跑」接上。
5. ~~`services/notify.mjs` 建了没用~~ 11-04 接上：每一轮跑完、写进待看的条数 n > 0 时，`services/schedule.mjs` 经它发「这一轮进来 n 条待看」（窗口在最前面时不发；测试世界写 `logs/notifications.jsonl`）。
6. 侧栏底色选了 river（方案主色）而不是 ink，理由在 `docs/tokens.md`；要改只动 `--st-sidebar` 一行。
7. ~~托盘与定时 11-06~~ 11-04 落地（§4.3）：`services/schedule.mjs`（定时器、补跑、跑完的提示）、`tray.mjs`、设置「运行」、首次设置第 5 屏「定时」、今日顶栏。运行状态页（S11）的「下次运行」11-04 集成时也接上了：`getStatus().nextRun`（定时开着时 = 下一个定时时刻）。
8. 安装包 11-06 按流息的安装包重写（§八）；界面 A 的六张截图在 `docs/shots/2026-11-03-<screen>.png`，由 `npm run shots -- --world seeded --screen <id>` 在播种世界上拍。
9. ~~`getAppState` 没有 `recentLibraries`~~ 已解决（11-03 PM 集成）：`getAppState().recentLibraries = [{ path, name }]`，设置「库 · 其他」就用它。~~首次设置每步「谁定的」没有桥方法~~ 11-04 已实装：`recordSetupStep` / `getSetup`（§4.1「首次设置记『谁定的』」）。
10. ~~「没有连接也能抓」做不到~~ 已解决（11-03 PM 集成）：核心 `runRound({ scoreless: true })`，主进程没选连接时走它（见 §4.2「实做差别（界面 B 主进程）」）；待看卡片对这种条目标「没有打分」并显示来源自带的摘要。
11. 界面 B 的取舍与缺口（11-03）：
    - ~~资料库右栏只有分数没有理由~~ 已解决（11-03 PM 集成）：核心 `readNote` 多返回 `scores`（文件头里的分数与理由），页面右栏照它显示。
    - ~~「试一条看结果」只能试已保存的配置~~ 已解决（11-03 PM 集成）：桥 `previewNode(nodeId, url, draft)`，页面有未保存改动时把正在改的节点作 `draft` 传过去，核心按保存时同一套校验检查后只用这一次、不写盘（方案 C3「改要求 → 试一条 → 保存」）。
    - ~~「恢复默认」没有默认配置~~ 已解决（11-03 PM 集成）：`getPipeline().defaults`。样机的「加一个关卡」「删除这个关卡」不在 §4.2 要点里，这次没做（v1.1）。
    - 图谱的条目节点不带日期，「只画最近的 60 条」靠 `getLibrary` 的条目日期挑；三行直线布局下，主题 → 条目的线可能正好穿过中间那行的某个来源点（样机同样），没另走线。
    - 核验记录的「n 次调用」：`verdictsFor` 不给调用次数，结果行只写「通过 / 未通过 · n 轮」。
    - 正文里的普通网址 `[字](地址)` 只显示、不能点（页面不能导航；`openItemUrl` 只认库里条目的来源）。
    - 界面 B 的七张截图在 `docs/shots/2026-11-03-{library,edit,sources,pipeline,status,ask,graph}.png`：`npm run shots -- --world seeded --screen <id>`（播种世界 + `test/support/seed.mjs seedPlanB`，假连接）。
12. 11-04 三套主题、首次设置的记录、今日「连续三轮没有产出」、许可证与致谢落地（§4.1、§五「主题」「设置的『软件』部分」）。拿不准的：河蓝原来的琥珀 / 绿在各自浅底上是 4.42 / 4.45 : 1，不到契约要的 4.5，而契约又要河蓝「值一个不改」——素灰用加深一档的两个值过线；维护者 11-04 定河蓝保持原样，这两组列为已知例外（`docs/tokens.md`「对比度」）。新画面的截图：`docs/shots/2026-11-04-{settings-theme,settings-setup,no-output,licenses}.png`（`npm run shots -- --world seeded --screen <id>`），三套并排：`docs/shots/themes/index.html`。
