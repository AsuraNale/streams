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
  assets/icon/       图标：icon-512/48/32/24/16.svg（新 logo「五流」定稿原样）→ png/ → streams.ico（README 在那里）
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
| `getAppState()` | 无 | `{ library: { libraryId, path, name } \| null, recentLibraries: [{ path, name }], showDeveloperInfo, language: { setting, resolved }, version, devBuild, theme, libraryCount, activeConnection }`；`library` 是当前库（侧栏显示 `name`，没有就是「未打开库」；v2 包 A 起带登记 id `libraryId`，`name` 是登记表的名字，默认文件夹名）；`recentLibraries` 是登记表里的库（v2 包 A 起不再读 `settings.json`）；`version` 是 `installer/setup/release.json` 的版本，`devBuild` 为真时是开发版；`theme` 是 `river` · `paper` · `night` 之一（§五「主题」）——**v2 包 K2** 起是 `precision` · `glass` · `research` 之一，另有 `appearance`（`light` · `dark` · `system`，设置）、`scheme`（现在生效的 `light` · `dark`：跟随系统时是 Windows 现在用的）、`defaultTheme`（`precision`，设置页给那张卡标「默认」；**重设计 R1** 起 `theme` 是 `precision` · `glass` · `research` · `monoline` 之一，`defaultTheme` 是 `research`，§4.13）；**v2 包 I**：`libraryCount` = 应用知道的库有几个（登记表的，加上开发钩子那个临时库），0 → 首次打开；`activeConnection` = `settings.json` 里选定的连接（`claude-code` · `codex` · `api` · `null`，只读设置、不检测），和主 Agent 聊的引导据此说「还没有连接」；**v2 包 L**：`panel` = `{ open, tab }`，右栏展开与否和当前标签（`settings.json`，§4.12） | `app.js`（每一屏经 `useApp().appState`）、设置页 |
| `onEvent(topic, callback)` | 下面事件表里的一个主题；一个函数 | 不是信封：返回取消订阅的函数；主题不在表里、`callback` 不是函数就抛错 | `app.js` |
| `setLanguage(language)` | `'auto'` · `'zh-CN'` · `'en'` | `{ setting, resolved, changed }`；写进设置并重新决定界面语言；`changed` 为真时页面自己重新载入（§六） | 设置页「语言」 |
| `setTheme(id)` | **重设计 R1**：`'precision'` · `'glass'` · `'research'` · `'monoline'`（v2 包 K2 是前三个）（别的 → `bad_arguments`，v1.0 的三个 id 也是） | `{ theme, appearance, scheme }`；写进 `settings.json` 的 `theme`，主进程跟着改每个窗口的底色（那一组的 `--st-page`）和阅读窗口；发 `settings-changed`。页面自己马上把 `<html data-theme>`、`data-appearance` 换掉（§五「主题」） | 设置页「主题」三张卡 |
| `setAppearance(appearance)` | **v2 包 K2**：`'light'` · `'dark'` · `'system'`（别的 → `bad_arguments`） | `{ theme, appearance, scheme }`；写进 `settings.json` 的 `appearance`，主进程改 `nativeTheme.themeSource`（同名；`system` 时 Electron 跟着 Windows）、窗口底色与阅读窗口；发 `settings-changed`；`scheme` 是现在生效的浅 / 深 | 设置页「外观」 |
| `setShowDeveloperInfo(on)` | 布尔 | `{ showDeveloperInfo }` | 设置页「显示开发者信息」 |
| `setPanel(patch)` | **v2 包 L**：`{ open?: boolean, tab?: 'progress' \| 'decide' \| 'detail' \| 'files' }`，至少一个字段（别的 → `bad_arguments`） | `{ open, tab }`：写进 `settings.json` 的 `panel`（只改给的字段），下次启动右栏照旧；不发事件（页面自己用这个回答） | 右栏的收起 / 展开按钮、四个标签（§4.12） |
| `copyDiagnostics()` | 无 | `{ ok: true }`；主进程把诊断信息写进剪贴板（不带 key；测试时写到 `logs\clipboard.txt`）；**重设计 R5a（O9）**：多一段「最近的原始报错」（`raw-errors.mjs`，最近 `RAW_ERRORS_MAX` = 50 条，§4.19），页面上不给的原文都在这里，仍不含 key | 设置页「复制诊断信息」 |
| `openMakerPage()` | 无 | `null`；在用户的浏览器里打开 `https://starrydigital.ca`（地址写死在主进程 `app-services.mjs MAKER_URL`，页面不给地址；测试时只记日志） | 设置页「关于」的「由 Starry Digital 开发」（V11，维护者 11-02 定「链 starrydigital.ca」） |
| `getLicenses()` | 无 | `{ own: { license: 'MIT', text }, components: [{ name, version, license }], notices: { available } }`：`text` 是流息 `LICENSE` 全文（装好的应用读 `resources\app\LICENSE`，构建把仓库根的 `LICENSE` 放在那里；开发时读仓库根那份）；`components` 依次是 Electron · Chromium · Node.js（版本取运行时 `process.versions`）、Preact · htm · @mozilla/readability（版本与许可证取应用里 `node_modules/<名>/package.json`；Readability 是阅读模式抽正文用的，v2 包 J1 加进表里）；`notices.available`：装好的应用安装目录里有 `THIRD-PARTY-NOTICES.txt` 时为真，开发时总为假（`app-services.mjs licensesView`） | 设置页「许可证与致谢」对话框 |
| `openNotices()` | 无 | `null`；用系统的查看程序打开安装目录里的 `THIRD-PARTY-NOTICES.txt`（文件名写死在主进程，页面不给路径；测试时只记日志）；没有这个文件（开发时）→ `open_failed` | 许可证与致谢「打开完整的第三方声明」 |
| `getUpdateState()` | 无 | 更新的数据：`{ state, current, dev, canUpdate, checkedAt, release, progress, reason, turnRunning }`（`state` 十二态之一：`idle` · `checking` · `up_to_date` · `available` · `manual` · `check_failed` · `downloading` · `download_failed` · `verify_failed` · `ready` · `launching` · `launch_failed`） | 设置页「关于」（`lib/use-update.js`） |
| `checkForUpdate()` | 无 | 同上；向 GitHub 问一次最新版（`AsuraNale/streams` 的 releases/latest） | 设置页「检查更新」 |
| `downloadUpdate()` | 无 | 同上（`downloading`，进度随 `update` 事件来）；开发版不下载 | 设置页「下载并更新」 |
| `cancelUpdateDownload()` | 无 | 同上；停下下载、删掉下了一半的文件 | 设置页下载中的「取消」 |
| `installUpdate()` | 无 | `{ ok: true }` 安装程序已启动、应用随即退出；或 `{ ok: false, reason }` | 设置页「开始更新」 |
| `openReleasePage()` | 无 | `null`；在用户的浏览器里打开这一版的发布页（测试时只记日志） | 设置页「打开发布页」 |
| `chooseLibraryFolder()` | 无 | 主进程开系统的选文件夹对话框（测试与开发：`STREAMS_DEV_CHOOSE_FOLDER=<绝对路径>` 代替对话框）；`{ path, name, state: 'empty' \| 'library' \| 'importable' \| 'other', mdCount? } \| null`（取消是 null；`importable` = 没有 `streams.json`、第一层有 `.md`，`mdCount` 是那一层 `.md` 的个数，11-04 加）。主进程记住这次选择，页面不回传路径 | **重设计 R4a**：新建库表单「存储位置」的「更改…」（v2 包 I：新建库第 1 步；v1.0：S1 第 1 步、设置「新建库」「打开已有文件夹」）；**v2 包 I**：对话框打开时停在「新建库默认放在」（那个文件夹在的话） |
| `useChosenFolder(name)` | 库名字符串（空串 = 用文件夹名） | 对上一次 `chooseLibraryFolder` 的选择：`empty` → `createLibrary` 建库；`library`（已有 `streams.json`）→ 打开；`importable` → 核心 `importFolder`（在旁边写 `streams.json` 与 `_pipeline/`，不碰已有文件，`notesDir: "."`）再打开；`other` → `open_failed`。登记进 `libraries.json`（已登记就不重复）并设为当前库（v2 包 A；不再写 `settings.json`）；发 `libraries-changed`、`library-changed`；**v2 包 I**：新建或导入出来的库（`empty` / `importable`），`settings.json` 有 `setupConnection` 且这个库还没有 `setup.connection` 时，把它抄进去（`at` 照原样）；返回 `{ libraryId, path, name }`（没选过文件夹 → `bad_arguments`） | v2 包 I 的新建库第 1 步（**重设计 R4a** 起页面不再用，表单走 `createNewLibrary`；桥上保留） |
| `openRecentLibrary(path)` | 必须是 `recentLibraries` 里的一条（= 登记表里某个库的路径，原样），否则 `bad_arguments` | 同上的打开；那个文件夹里的 `streams.json` 读不出 → `open_failed` | v1.0 设置「库 · 其他」（v2 包 I 起页面不再用，桥上保留） |
| `rebuildIndex()` | 无 | `{ count, pending: [{file, codes}] }`；`no_library` | 来源与要求「这个库」（v2 包 I；v1.0：设置「重建索引」） |
| `revealLibrary()` | 无 | `null`；在资源管理器里显示库文件夹（测试只记日志） | 来源与要求「这个库」的「在资源管理器中显示」（v2 包 I） |
| `recordSetupStep(step, entry)` | `step` ∈ `library` · `connection` · `pack` · `sources` · `trial` · `schedule`；`entry = { by, detail? }`，`by` ∈ `chose` · `wrote` · `default` · `skipped`（核心 `recordSetupStep` 判，不认识 → `bad_arguments`） | `{ step, by, at, detail? }`；写进打开的库的 `streams.json` 的 `setup`（那一步的记录被新的替换，别的步不动；经临时文件 + rename）；`no_library`。**v2 包 I**：没有当前库时 `step` 是 `connection` → 写进 `settings.json` 的 `setupConnection = { by, at, detail? }`（同样的检查：`by` 不认识、多了键、`detail` 不是 ≤ 100 字的字符串 → `bad_arguments`），别的步仍是 `no_library` | 首次打开的连接一步、新建库每一步走完时（§4.1、§4.10） |
| `getSetup()` | 无 | 核心 `readSetup`：`{ <step>: { by, at, detail? } }`，这个库没有记录（导入的、或这次之前建的）→ `{}`；`no_library` | 来源与要求「这个库 · 首次设置」（v2 包 I；v1.0：设置） |
| `getConnections()` | 无 | 见 §4.1「连接」；不含任何 key，API 只给 `keyHint` | S1 第 2 步、设置「连接方式」、S13 |
| `detectConnections()` | 无 | 重新检测三种连接（只读：`--version` / `auth status` / `login status` / 有没有 key），返回同 `getConnections` | S1「重新检测」、「我登录好了，再试一次」 |
| `probeConnection(kind)` | `'claude-code' \| 'codex' \| 'api'` | **一次真调用**；`{ ok, latencyMs, model, code? }`（**重设计 R5a（O9）**：不再带 `detail`，连接自己的原话进诊断信息，页面按 `code` 用 `CONNECTIONS.codes` 说），同时记进 `getConnections().probes[kind]` | S1「试了一次：可用」、设置「现在试一次」 |
| `openLogin(kind)` | `'claude-code' \| 'codex'` | 起 CLI 自己的登录窗口（核心 `connector.openLogin`，窗口标题 = 品牌名，`src/main/texts/app.js`）；`{ ok: true, pid } \| { ok: false, code }`；`api` → `bad_arguments`；假连接或测试（窗口隐藏）下只记日志、回 `{ ok: true, pid: 0 }` | S1 / S13 / S14 的「去登录」 |
| `setActiveConnection(kind)` | 三种之一或 `null` | `{ active }`；写设置；发 `connections-changed` | S1 第 2 步选定、设置 |
| `setConnectionModels(kind, models)` | `models = { model: string \| null, verifyModel: string \| null }`（null = 该连接的默认；核验 null = 同主模型） | `{ kind, model, verifyModel }` | 设置「主模型 / 核验模型」 |
| `setApiVendor(vendor, baseUrl)` | `vendor` 在核心 `VENDOR_IDS` 里；`baseUrl` 只有 `custom` 用，否则传 `null` | `{ vendor, baseUrl }` | 设置「输入 API key」对话框 |
| `setApiKey(vendor, key)` | key 字符串；**只往主进程走一次**，存 `secrets/key-<vendor>.bin`（safeStorage），从不返回 | `{ vendor, keyHint }`；safeStorage 不可用 → `internal` | 同上 |
| `removeApiKey(vendor)` | | `{ vendor, keyHint: null }` | 同上 |
| `applyStarterPack(packId, edits)` | `packId` 在核心 `STARTER_PACKS` 里或 `'blank'`；`edits = { removeSources: [name…], addRss: [{ name, url }] }` | 写 `streams.json` 的 `topics` / `sources`，并对每个来源试抓一次（不写盘）：`{ topics: [name…], sources: [{ name, kind, url, status, hint, count, message }] }`；**重设计 R5a（O9）**：每个来源的试抓不再带 `message` / `http` | S1 第 3 步 |
| `getStarterPacks()` | 无 | 核心 `STARTER_PACKS` 的 `[{ id, name, topics, sources: [{name, kind, url, query?, topic}] }]`（名字按界面语言；arXiv / HN 来源 `url` 为 null、带 `query`）；不需要打开库 | S1 第 3 步 |
| `getHome()` | 无 | 见 §4.1「今日」 | S2 |
| `estimateRound()` | 无 | 核心 `estimateRound` + `{ connection: { kind, model, verifyModel } }` | 库页头按钮旁的「预计 a–b 次模型调用」（重设计 R1；S12 的跑一轮对话框已删） |
| `setRoundCap(cap)` | 正整数 | `{ cap }`；写 `streams.json` 的 `pipeline.cap` | S12「改上限」、设置「每轮上限」 |
| `startRound()` | 无 | 当前库的一轮。`{ started: true, roundId } \| { started: false, problems }`（自检失败：S13；没选连接也算自检失败，`connectionCode: 'not-installed'`）；走全应用的队列（v2 包 A，§4.4）。**v2 包 L**：队列忙（别的库在跑或在排）时**不再回 `bad_arguments`**，而是把当前库排到队尾：`{ started: false, queued: true, position, runningLibraryId }`（`position` 1 = 在跑的那个，2 = 第一个在排的…）；这个库已在跑 → `{ started: false, already: 'running' }`，已在排 → `{ started: false, already: 'queued', position }`，不重复排（§4.12）。进度经 `round-progress` 事件；跑完发 `inbox-changed` 与最后一条 `round-progress { done: true, result }`。`roundId` 是主进程给这一轮的 id（`d-…`），核心自己的 round id 在 `result.round.id` | 库页头的「立即运行」（重设计 R1：直接调，不弹对话框，忙时排到队尾，§4.13）、本次运行未开始卡的「重试」、新建库的首轮 |
| `cancelRound()` | 无 | `{ cancelled }`；当前条目后停（核心 `signal`） | 库页头的「运行中 · 停止」（重设计 R1；原概览进度条旁）、右栏进度里「当前库 · 上次运行」的停止 |
| `getRoundState()` | 无 | `{ running, roundId, libraryId, progress, last: runRound 的返回 \| null, lastProblems }`（`libraryId`：那一轮是哪个库的，v2 包 A；全应用同一时间只有一轮）；**重设计 R5a（O9）**：`last` 与 `lastProblems` 的问题只有 `code` / `connectionCode` / `node`，没有 `detail` | S2 |
| `getInbox()` | 无 | **重设计 R2**：`{ items, later, rejected: { total, items }, manual, held, recentDismissReasons }`——`items` 是待拍板的卡（核心 listInbox 里不在「稍后处理」、不是挂起的那条）；`later` 是稍后处理的；`rejected` 是未通过筛选（核心 listRejected，最新在前、最多 50 条，`total` 是全部条数）；`manual` 是手动添加还没评分的（核心 listManualWaiting）；`held` 是挂起等小条关闭的放弃 `{ url, title }` 或 null；`recentDismissReasons: [{ts, reason, quick?, title, url}]`（没写理由的放弃不在里面）（§4.14） | S3 / 待看 |
| `keepItem(url)` | url 必须在 inbox 里 | `{ id, file }`（`file` = `notes/` 里的文件名）；发 `inbox-changed`、`library-changed`（索引重建了）；**重设计 R2**：先把挂起的另一条放弃写进账本 | S3「收藏」 |
| `dismissItem(url)` | url 必须在 inbox 里 | **重设计 R2**：`{ url, held: true }`——这条立刻从列表消失，**不写账本**，挂在主进程里等小条关闭（已有挂起的另一条先写进去，一次只有一条）；发 `inbox-changed`（数不含挂起的这条）（§4.14） | 待看「放弃」 |
| `settleDismiss(reason, quick)` | `reason`：null 或 ≤ 300 字；`quick`：null 或 `marketing` · `irrelevant` · `shallow` · `duplicate` | **重设计 R2**：小条关闭——挂起的放弃写进账本（核心 `dismiss`：有字才有 `reason` 字段，快选另记 `quick`）；`{ settled: true, url }`，没有挂起的 `{ settled: false }`；发 `inbox-changed` | 待看的小条 |
| `undoDismiss()` | 无 | **重设计 R2**：撤销——挂起的放弃作废，账本不写任何东西，卡回到原位；`{ undone: true, url }` 或 `{ undone: false }`；发 `inbox-changed` | 待看小条「撤销」 |
| `laterItem(url)` | | `{ url }`；**重设计 R2**：在待看里的条目记进库的 `_pipeline/later.json`（核心 later；不写账本、不碰 `notes/`），本库下一次运行结束后回到待看；先把挂起的另一条放弃写进去；发 `inbox-changed` | 待看「稍后处理」 |
| `moveToInbox(url)` | url 必须是没过某一关的条目，否则 `bad_arguments` | **重设计 R2**（N02）：核心 `moveToInbox`——这条进待看（卡上标「未通过筛选 · 手动移入」），**不写 `notes/`**；`{ url }`；发 `inbox-changed` | 待看「未通过筛选 · 移入待看」 |
| `openItemUrl(url)` | 必须是 inbox 里或索引里某条的 `source`，否则 `bad_arguments` | `null`；`shell.openExternal`（测试只记日志） | S3「打开原文」 |
| `getPipelineSettings()` | 无 | `{ cap, thresholds: { relevance, substance }, schedule }`；`schedule` = `getSchedule()` 的返回 | 设置「运行」 |
| `getSchedule()` | 无 | 当前库的定时：`{ libraryId, enabled, time, nextRunAt: ISO \| null, lastRoundAt: ISO \| null, missed: boolean }`（§4.3–4.4；没打开库时是 `settings.json` 的、`libraryId` / `lastRoundAt` 为 null、`missed` 为 false） | 库页头「下次运行」（v2 包 F；v1.0 的设置「运行」与今日顶栏已不在，设置里是只读的「定时一览」，见 §4.10） |
| `getQueue()` | 无 | **v2 包 L**：全应用的一个队列（§4.12）：`{ running: { libraryId, roundId, phase, calls, cap, startedAt, why } \| null, waiting: [{ libraryId, why, since }], next: [{ libraryId, at }] }`；`why` 是 `'schedule'`（到点）· `'catch-up'`（补跑错过的）· `'manual'`（页面或托盘的「开始」、确认了的开跑卡）；`phase` / `calls` / `cap` 是那一轮最后一条 `round-progress` 的；`next` 是每个开着定时的库的下一次，早的在前。只读 | 右栏「进度」、跑一轮对话框、概览横幅、库架卡片与左栏第二行（`lib/queue.js useQueue`） |
| `setSchedule(schedule)` | `{ enabled: boolean, time: 'HH:MM' }`（00:00–23:59，别的键 → `bad_arguments`） | 同上；写**当前库的 `streams.json`** 的 `schedule`（v2 包 A；v1.0 写 `settings.json`）、重设定时器；发 `settings-changed { libraryId }`；没打开库 → `no_library` | 设置「运行」、首次设置最后一步 |
| `listLibraries()` | 无 | **v2 包 A**：登记表的库，按登记顺序：`[{ id, path, name, icon, color, addedAt, temporary, active, exists }]`；`exists` = 文件夹在、`streams.json` 读得出；`temporary` 只有开发钩子 `STREAMS_DEV_LIBRARY` 指的、没登记的那个库（id `dev`，排第一，不写进登记表）；`active` = 当前库 | 包 F 的左栏、库架 |
| `setActiveLibrary(id)` | 登记表里的 id（不认识 → `bad_arguments`） | 换当前库，返回 `{ libraryId, path, name }`；文件夹不在或读不出 → `open_failed`，什么都不变；发 `libraries-changed`、`library-changed`、`settings-changed`。原有的库相关方法签名不变，都作用于当前库 | 包 F 切库 |
| `addLibrary(path)` | 必须是上一次 `chooseLibraryFolder` 给的那个路径（页面不另给路径），否则 `bad_arguments` | 「添加已有库」= 打开已有文件夹：那里没有库 → `open_failed`；登记（已登记就不重复）并设为当前库；返回同 `useChosenFolder` | 包 F「添加已有库」 |
| `removeLibrary(id)` | 登记表里的 id（不认识、或开发钩子那个临时库 → `bad_arguments`） | `{ removed, active }`：**只去掉登记，绝不删文件夹里的任何东西**；移除的是当前库时，当前库变成顶替它位置的那个（下一个；它是最后一个就是新的最后一个），一个不剩就是 null（之后库相关方法回 `no_library`）；发 `libraries-changed`（当前库变了再发 `library-changed`、`settings-changed`） | 包 F |
| `setLibraryMeta(id, meta)` | `meta = { name?, icon?, color? }`，至少一个；`name` 1–100 字、`icon` 1–2 字、`color` ∈ 核心 `LIBRARY_COLORS`（token 名）；不认识的 id、坏值 → `bad_arguments`，什么都不写 | `{ id, name, icon, color }`；**重设计 R4b**：给了 `name` 时先写进库的 streams.json `name`（核心 `saveLibraryName`）并在 `changes.jsonl` 记 `name` by `you`（写不进去 → 错误照旧往上、登记不改），再改登记；发 `libraries-changed`；改的是当前库再发 `library-changed`（侧栏的名字跟着变） | 包 F 库页；**R4b** 来源与要求「库名称」 |
| `getLibrariesOverview()` | 无 | 每个库一行：`[{ id, name, icon, color, inbox, lastRoundAt, problem, brief, topics, sources, noOutputStreak }]`；`brief` 是 `streams.json` 的要求（核心 `readBrief`，没有 → null）、`topics` 是主题名、`sources` 是来源个数、`noOutputStreak` 是连续没有产出的轮数（包 F 加：库架卡片与库头的「在追」、卡片的问题一行）；`inbox` / `lastRoundAt` 来自核心 `homeNumbers`（`numbers.inbox`、`numbers.lastRound.startedAt`）；`problem` 三选一或 null，按这个顺序：`missing`（文件夹不在或读不出）· `sources`（来源出问题：`numbers.sources.level` 为 `warning` 或 `blocked`）· `no-output`（连续 `NO_OUTPUT_ROUNDS` 轮没有产出） | 包 F 左栏的待看数与琥珀点、库架 |
| `getLibrarySchedule(id)` | 登记表里的 id | 那个库的定时，形状同 `getSchedule`；不认识 → `bad_arguments`；文件夹不在 → `open_failed` | 包 F 库页、设置一览 |
| `setLibrarySchedule(id, schedule)` | id + 同 `setSchedule` | 写那个库的 `streams.json`；同 `setSchedule` | 同上 |
| `getUsageTotal()` | 无 | 全部库本月用量合计（维护者 11-05）：核心 `usageTotal`，`{ month, calls, inputTokens, outputTokens, costUsd, byKind: { <连接>: 次数 }, libraries: [{ id, name, calls, missing }], agent: { calls, inputTokens, outputTokens, costUsd } }`；`month` 是主进程时钟的 UTC 月；文件夹不在的库 `calls: 0, missing: true`，不报错；**v2 包 C**：`agent` 是主 Agent 本月的用量（`<appData>\agent\usage.jsonl`，单列「主 Agent」），也算进 `calls` / 各个合计与 `byKind`，不算进 `libraries` | 包 F / I 的设置页 |
| `getLibraryRoot()` | 无 | **v2 包 I**：「新建库默认放在」`{ path, isDefault }`：`settings.json` 的 `libraryRoot`，没设时是应用的默认位置（`isDefault: true`；装好的流息 = `%USERPROFILE%\Documents\Streams`，开发运行 = `STREAMS_DEV_LIBRARY_ROOT` 或它自己应用数据里的 `libraries`） | 设置「库」 |
| `chooseLibraryRoot()` | 无 | **v2 包 I**：开系统的选文件夹对话框（开发与测试：`STREAMS_DEV_CHOOSE_FOLDER` 代替，同 `chooseLibraryFolder`）；取消 → `null`；选了 → 同 `setLibraryRoot(那个路径)` 的检查与返回 | 设置「换一个文件夹…」 |
| `setLibraryRoot(path)` | 绝对路径字符串，或 `null`（= 恢复默认） | **v2 包 I**：写 `settings.json` 的 `libraryRoot`，返回同 `getLibraryRoot`，发 `settings-changed`；相对路径、应用数据文件夹本身或它里面的路径 → `bad_arguments`，什么都不写。提议卡建库（包 B）与「新建库」的选文件夹对话框（打开时停在这里，文件夹在的话）都用它 | 设置「恢复默认」 |
| `getNewLibraryDefaults()` | 无 | **重设计 R4a**：新建库表单打开时的默认值 `{ strictness: 'standard', levels: { loose, standard, strict }（各 `{ relevance, substance }`）, schedule: { enabled, time }（`settings.json` 的定时，主 Agent 建库的卡没写定时时也用它）, cap（流水线默认 120）, root（新建库默认存储位置）, packs: [{ id, name, topics, sources }]（预设来源包，来源与核心存的一样） }`；同时忘掉之前「更改…」选过的文件夹 | 新建库表单（§4.16） |
| `newLibraryFolder(name)` | 库名字符串（≤ 100 字） | **重设计 R4a**：「创建」会用的文件夹 `{ path, state: 'empty' \| 'library' \| 'importable' \| 'other', mdCount?, chosen }`：用「更改…」（`chooseLibraryFolder`）选过的那个，否则 `<默认存储位置>\<库名作文件夹名>`；不存在的文件夹算 `empty` | 新建库表单「存储位置」 |
| `estimateNewLibrary(items, cap)` | 整数（各来源试抓到的条数之和）、整数上限 | **重设计 R4a**：核心 `estimateFirstRound` → `{ expectedCalls: [lo, hi], items, cap }`：运行前自检 1 次 + 每条 1–4 次，两头都不超过上限 | 新建库表单底部「预计 n–m 次模型调用」 |
| `createNewLibrary(form)` | `{ name, brief, strictness, topics: [名字], sources: [来源], packId, schedule, cap, run }` | **重设计 R4a**：按表单建库（§4.16）：先判（追踪要求空、核心不收的来源 → `bad_arguments`，什么都不建）；文件夹空 → 建库，有 .md 没有 `streams.json` → 当库打开（不动原有文件），已有库 → 原样打开（表单一样都不写、不运行），别的 → `open_failed`；再用核心 `fillNewLibrary` 写追踪要求、主题、来源、严格程度的两个阈值、定时、上限（与主 Agent 建库同一个函数）、首次设置记录，登记并设为当前库；`run` 为真时排进运行（原因「建库后的第一轮」）。返回 `{ library: { libraryId, path, name }, made: 'created' \| 'imported' \| 'opened', queued: { queued, position? } \| null }` | 新建库表单「仅创建」「创建并运行」 |
| `getStrictness()` | 无 | **重设计 R4b**：当前库的严格程度 `{ level: 'loose' \| 'standard' \| 'strict' \| 'custom', thresholds: { relevance, substance }, levels }`（核心 `readStrictness`；两个阈值正好是某一档才是那一档，否则 `custom`；`levels` 是三档的数，核心 `STRICTNESS`）；只读；`no_library` | 来源与要求「严格程度」 |
| `setStrictness(level)` | `'loose'` · `'standard'` · `'strict'`（别的 → `bad_arguments`） | **重设计 R4b**：写这一档的两个阈值（核心 `saveStrictness`，streams.json 别的键不动），`changes.jsonl` 记 `thresholds` by `you`；返回同 `getStrictness`；发 `library-changed` | 来源与要求「要求」的「保存」 |
| `getChangeLog()` | 无 | **重设计 R4b**：当前库的变更记录（核心 `changeLog`）：`{ rows: [{ at, kind: 'change', field, by: 'you' \| 'agent-confirmed', proposalId, before, after } \| { at, kind: 'setup', step, by: 'setup', setupBy, detail }], skipped }`，新的在前；只读；`no_library` | 高级设置「变更记录」 |
| `listProposals(filter)` | `null` 或 `{ status?, libraryId? }`：`status` ∈ `pending` · `confirmed` · `declined` · `revise` · `stale` · `failed`；`libraryId` 是登记 id，或 `null`（= 建库卡）；别的键 → `bad_arguments` | **v2 包 B**：提议卡，新的在前：`[card]`，卡的形状见 §4.5（核心 5.13）；不改任何东西；**重设计 R5a（O9）**：每张卡的试抓（`trial`）去掉 `message` / `http`，失败（`failure`）只给 `{ step, done, rolledBack, left?, category: refused \| error, advice }`（`advice` 是 `texts/proposals.js PROPOSALS.advice` 的键），不给异常原文；`confirmProposal` / `declineProposal` / `reviseProposal` 回的卡同样 | 包 G 的卡片（「和主 Agent 聊」、库页） |
| `confirmProposal(id)` | 卡的 id（不认识 → `bad_arguments`） | **唯一会改东西的方法**：卡生效后的样子 `card`，`status` 是 `confirmed`（已生效，`result` 写了做了什么）· `stale`（出卡后相关配置变了 / 库不在了 / 新库的文件夹不空了：什么都没改，`reason`）· `failed`（中途出错：已做的回滚，或 `failure` 写明到哪一步）；卡不是 `pending`（已确认、已不要、已改一下、过期、失败）→ `bad_arguments`，什么都不做，不会重复生效。发 `proposals-changed`；生效的是当前库 → `library-changed`；定时卡再发 `settings-changed { libraryId }`；建库卡经包 A 登记、设为当前库（`libraries-changed`、`library-changed`）、把第一轮放进队列 | 包 G「确认」 |
| `declineProposal(id)` | 卡的 id | 「不要」：`status: 'declined'` 的卡；库一个字节都不变；不是 `pending` → `bad_arguments`；发 `proposals-changed` | 包 G「不要」 |
| `reviseProposal(id, text)` | 卡的 id；你的一句话（1–2000 字） | 「改一下」：`status: 'revise'`、`reviseText` 是你的话的卡（包 C 据此重出一张）；库不变；不是 `pending` → `bad_arguments`；发 `proposals-changed` | 包 G「改一下」 |
| `getWhoDecided()` | 无 | 当前库「谁定的」：核心 `whoDecided`，`{ brief, sources, topics, thresholds, schedule, cap }`，每项 `{ by: 'you' \| 'agent-confirmed', at, proposalId }` 或 `null`（没有记录）；`no_library` | 包 F 来源与要求页「谁定的」 |
| `agentSend(text, options?)` | `text` 1–4000 字（去首尾空白后）；`options` 可省、`null` 或 `{ libraryId? }`（这句话是从哪个库的对话框转来的；登记 id，不认识 → `bad_arguments`） | **v2 包 C**：主 Agent 跑一轮（§4.6）：`{ turn, reply, ask, proposalIds, notice? }`——`reply` 回复（连接失败时 `null`）；`ask` 最多一个问题 `{ question, options: 2–4 个 }` 或 `null`；`proposalIds` 这一轮出的提议卡（`pending`，经包 B 的 `createProposal`，`by: 'agent'`）；`notice` 可选，`[{ code, … }]`，`code` ∈ `not-understood`（回答两次不合格：只显示能取到的回复、不出卡不执行）· `proposals-dropped`（`count` 张不合格没出）· `connection`（`connection` 是连接的错误码）· `session-rebuilt`（会话接不上、开了新会话）。同一时间只跑一轮：前一轮没完就排队等。没选连接 → `no_connection`。发 `agent-changed` | 包 G「和主 Agent 聊」、包 E 分流 |
| `getAgentTranscript(query?)` | 可省、`null` 或 `{ limit?: 1–500（默认 100）, before?: 轮号 }` | 对话正本：`{ entries: [{ at, turn, role: 'you' \| 'agent' \| 'lookup' \| 'note' \| 'summary', text, data? }]（早的在前，`before` 给了就只要这轮之前的）, hasMore, total, skipped }`；不改任何东西 | 包 G 的对话流 |
| `getAgentStatus()` | 无 | `{ connection: 'claude-code' \| 'codex' \| 'api' \| 'fake' \| null, sessionful, session: { live, startedAt, turns }, entries（正本条数）, turns, lastSummaryAt, summarizedThrough, busy, waiting }` | 包 G、设置 |
| `listSuggestions(filter?)` | 可省、`null` 或 `{ libraryId? }` | **v2 包 C 接包 D 的建议卡**：打开着的建议卡 `[{ libraryId, key, kind, subject, otherLibraryId?, evidence, createdAt }]`（核心 `openSuggestions`，每个能读的库；给了 id 只要那个库的，不认识 → `bad_arguments`）。**重设计 R5a**：`evidence` 是核心 `suggestionFacts`（没有抓取器原话与 HTTP 码）；列之前先查过时；新代码用 `listToConfirm` | 包 G「等你定的事」、包 F 概览 |
| `dismissSuggestion(libraryId, key, reason?)` | 登记 id；建议卡的 key（≤ 300 字）；`reason` 可省或 ≤ 500 字 | 「不要」：库的 `_pipeline\suggestions.jsonl` 追加一行 `dismissed`（核心 `dismissSuggestion`），回那一行；卡没打开 → `bad_arguments`。别的什么都不改 | 同上 |
| `acceptSuggestion(libraryId, key)` | 登记 id；建议卡的 key | 「要」**只做两件事**：记一行 `accepted`，再把这张建议卡以 `note` 的形式交给主 Agent 跑一轮（由它决定出不出提议卡）：`{ accepted: 那一行, turn: agentSend 的同一形状 }`；不改库的任何配置。卡没打开 → `bad_arguments`；没选连接 → `no_connection`（什么都不记）。**重设计 R5a**：「要」= 「交由主 Agent 分析」（⑤ = 「生成修改提议」）：记一行 `accepted`（带 `action`），交给主 Agent 的是核心 `handoffText` 的界面词（不再是 kind · subject 与证据 JSON）；卡已过时 → 记一行失效、`bad_arguments` | 同上 |
| `listToConfirm()` | 无 | **重设计 R5a**：一种提议的统一视图（§4.19）：`{ items, handled, count }`——`items` = 全部库待确认的：主 Agent 提议（`from: 'agent'`，`proposalId`、`card` 去掉原始报错的提议本身）与系统检测（`from: 'system'`，`key`、`subject`、`otherLibraryId?` / `otherLibraryName?`、`evidence` 界面化的证据：状态与处理建议的键，没有抓取器原话与 HTTP 码），每条都有 `id`、`libraryId`、`libraryName`、`kind`、`status`、`createdAt`、`actions: [{ id, label（`texts/proposals.js PROPOSALS` 的键）, values?, level?, primary, callsModel }]`（照 维护者 过目的动作表，主动作在前）；`handled` = 最近处理过的 ≤ 50 张（主 Agent 提议的状态、系统检测的 `dismissed` · `accepted` · `acted` · `expired` 与动作 / 失效原因），新的在前；`count` = `items` 条数。列之前先查一遍过时：不再适用的系统检测记一行失效、不列；系统检测另带 `summary`（一句界面词，当前界面语言，核心 `suggestionText`）与 `words: { title, evidence }`（`PROPOSALS.kinds.*` / `PROPOSALS.evidence.*` 的键；地址无效用 `source-failing-gap`） | R5b 的右栏待确认、主 Agent 页 |
| `actOnSuggestion(libraryId, key, action)` | 登记 id（**不限当前库**）；系统检测的 key；`action` ∈ `pause-source` · `edit-address` · `set-strictness` · `forward` · `draft-proposal` · `dismiss` | **重设计 R5a**：由核心 `runSuggestionAction` 执行：暂停该来源 / 将严格程度调整为目标档 = 写那个库的 `streams.json`、变更记录记「手动修改」（`by: 'you'`）、0 次模型调用 → `{ done: true, status: 'acted', action, level?, changed }`；忽略 → `{ done: true, status: 'dismissed' }`；修改地址 → `{ done: false, navigate: { screen: 'sources', libraryId, source, dialog: 'edit-address' } }`（不写盘；改地址本身走 `updateSource`）；交由主 Agent 分析 / 生成修改提议 → 记「已转交主 Agent」，把这张提议写成界面词的一段话交主 Agent 跑一回：`{ done: true, status: 'accepted', action, line, turn }`（没选连接 → `no_connection`，什么都不记）。卡不是打开着的、动作不在这张卡的动作表里、卡已过时（记一行失效、不执行）→ `bad_arguments`。发 `suggestions-changed` | 同上 |
| `getRescore(libraryId)` | 登记 id | **重设计 R5a**（N07）：那个库按旧标准评过的「未通过筛选」：`{ total, items, changedAt, expectedCalls: [lo, hi], cap }`（核心 `rescoreInfo`）；只读 | R5b 的未通过筛选 |
| `startRescore(libraryId)` | 登记 id | **重设计 R5a**：重新评分进全应用那一条队列（同一时间只运行一个库）：空闲 → 马上开始 `{ started: true, roundId, rescore: true }`；忙 → 排到队尾 `{ started: false, queued: true, position, rescore: true }`，或 `{ started: false, already }`；没有旧标准的条目 → `{ started: false, nothing: true }`；没选连接 → `no_connection`。进度经 `round-progress { rescore: true }`，结束发 `inbox-changed` | 同上 |
| `getLibrary(view, filter)` | `view` ∈ `kept` · `authored` · `caught` · `pending` · `all`（**重设计 R3**：资料库「全部」= 索引里的每个文件；`caught` 只剩来源与要求的单条测试在用）；`filter = { topics: string[], days: number \| null }` | `{ counts: 核心 libraryCounts（R3 起多 `all`）, view, items, total }`（核心 `listLibrary`）；**R3**：`pending` 的每条多 `path`（在库文件夹里的相对路径，如 `notes\x.md`） | S6 · 资料库 · 缺少文件头 |
| `searchLibrary(q, filter)` | 字符串（≤ 200 字）；`filter = { view: 'kept' \| 'authored' \| 'all', topics, days }` | 核心 `search` 的结果数组 | S6 搜索框 |
| `readNote(id)` | id 必须在索引里，否则 `bad_arguments` | 核心 `readNote`；**重设计 R3** 多 `path`：文件在库文件夹里的相对路径（右栏详情「文件」） | S6 正文与右栏 |
| `editNote(id, changes)` | `changes` 只能有 `title` / `topics` / `body` | `{ id, file, entry }`；核心 `bad-edit` / `invalid-note` → `bad_arguments`；发 `library-changed` | S7 |
| `openInObsidian(id)` | id 在索引里 | `null`；`shell.openExternal('obsidian://open?path=<绝对路径>')`，打不开时 `shell.openPath(路径)`（测试只记日志） | S6「用 Obsidian 打开」（v2 包 H 起在「更多」里，只对有文件的条目） |
| `showNoteInFolder(id)` | id 在索引里（路径同 `openInObsidian` 的核法：核心 `notePath`，必须是笔记文件夹里的 `.md`） | `null`；`shell.showItemInFolder(路径)`（测试只记日志 `not opened in a test run: folder <路径>`） | P5「更多」→「在资源管理器中显示」（v2 包 H，§4.9） |
| `getLibraryOutline()` | 无 | **v2 包 L**：当前库「讲给人听的结构」，只读不写盘：`{ libraryId, name, notes: { count, groups: [{ topic: string \| null, count, notes: [{ id, title, status, date }] }] }, inbox: { count }, requirements: { sources, topics } }`——笔记（已收藏与我写的，索引里的）按笔记头的 `topics` 分组（一篇两个主题就在两组里；没有主题的在 `topic: null` 组，界面叫「未分主题」），篇数多的组在前；**不给任何程序文件的名字或路径** | 右栏「文件」（§4.12） |
| `revealProgramRecords()` | 无 | **v2 包 L**：`null`；当前库的程序记录文件夹在资源管理器里选中（`shell.showItemInFolder`；测试只记日志 `not opened in a test run: folder <路径>`）；不列、不打开里面的任何文件 | 右栏「文件」→「程序记录（不用动）」展开后的「在资源管理器中显示」 |
| `openReader(url, how)` | `url` 是 http(s)，且是当前库记录里的条目（`replayLedger` 的 states 里，抓到的、待看的都算）或索引里某条的 `source`，否则 `bad_arguments`；`how` ∈ `reader` · `browser` | `reader`：在隔离的阅读窗口里打开（§4.9），等抽正文结束后回 `{ mode: 'reading' \| 'original', fallback }`；`browser`：`null`，系统浏览器打开（测试只记日志）。不写盘 | P5「打开原文」「更多」→「在浏览器里打开」（v2 包 H） |
| `applyHeader(file, header)` | `file` 是核心 `listPending` 里的文件名（否则 `bad_arguments`）；`header` 是对象（页面上改过的文件头，与拟好的合并、用户给的键优先）或 `null`（用拟好的） | 核心 `applyProposedHeader` 的返回 `{ id, file, entry }`；`not-proposable` / `bad-file-name` / `already-conforming` / `bad-id` / `invalid-note` → `bad_arguments`；发 `library-changed` | S8「写入这一个」 |
| `applyAllHeaders()` | 无 | `{ written: [file…], skipped: [{ file, code }] }`：对每个文件名能当 id、拟得出文件头的待规范文件按拟的写入；文件名不能当 id 的 `code: 'bad-file-name'`，拟不出的 `'not-proposable'`，核心拒绝的是核心的错误码；写了至少一个才发 `library-changed` | S8「全部按拟的写入」 |
| `getSources()` | 无 | 核心 `sourcesView`；**重设计 R5a（O9）**：每个来源行去掉 `message` 与 `http`（状态 `status`、处理建议 `hint`、连续次数照旧），原文进诊断信息 | S5 |
| `guessSource(input)` | 字符串 | 核心 `guessSource` | S5「加来源」第一步 |
| `trySource(source)` | 来源对象（形状同 streams.json 的一项） | 核心 `fetchSource` 的结果，只回 `{ status, hint, http, message, count, sample: [前 3 条的 {title, date}] }`；不写盘。**重设计 R5a（O9）**：只回 `{ status, hint, count, sample }`——不再有 `http` 与 `message`，原文进日志与诊断信息 | S5「试抓」 |
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
| `getStatus()` | 无 | `{ ...核心 statusView, nextRun: 定时开着时 getSchedule().nextRunAt，否则 null, connections: getConnections() }`；**重设计 R5a（O9）**：`sources` 每行去掉 `message` / `http`，`lastRound` 的问题去掉 `detail` | S11 |
| `openLogsFolder()` | 无 | `null`；`shell.openPath(<库>/_pipeline/logs)`（测试只记日志） | S11「打开运行记录文件夹」 |
| `getGraph(filter)` | **重设计 R3**：`{ days: number \| null }` 或 null——只剩时间范围一个筛选；`status` / `topics` / `links` 一律 `bad_arguments` | 核心 `graph`（主进程固定 `status: 'all'`、`links: true`：每个文件都画，[[链接]] 一直画） | 图谱 |
| `askLibrary(question)` | 1–500 字（去掉首尾空白后） | 核心 `ask` 的返回（连接失败的 `{ ok: false, code }` 原样作 `data`）；一次只许一个问题在跑（第二个 → `bad_arguments`）；没选连接 → `no_connection`（新错误码） | S10 |
| `getDemands()` | 无 | 核心 `demands`，**重设计 R3** 每个主题多 `added`：你为哪些问题点过「记到想补的主题」（核心 `demandsAdded`，没有问题的是 null）——问库据此画「已加入待补充主题」，重开页面仍在 | 问库右栏与回答 |
| `addDemand(topic, question)` | 主题非空 | 核心 `addDemand` | S10「记到想补的主题」 |
| `answerFeedback(question, note)` | 两个非空字符串 | `{ ok: true }` | S10「这个回答哪里不对」 |
| `sendLibraryMessage(text)` | 1–500 字（去掉首尾空白后） | **v2 包 E**：库内对话框的一句话，作用于当前库。先分流（核心 `routeMessage`，§4.7）：`question` → 走 `askLibrary` 的同一条路径；`change` → 主 Agent `agentSend(text, { libraryId: 当前库 })`；`unsure` → 谁都不问。返回 `{ route, by, confidence, result }`（`result` 是核心 `ask` 或 `agentSend` 的返回，原样）；`unsure` 时是 `{ route: 'unsure', by, confidence, text }`（没有 `result`）。每次在库的 `_pipeline/routes.jsonl` 记一行。与 `askLibrary` 共用「一次只许一句」（第二句 → `bad_arguments`）；去问库或主 Agent 时没选连接 → `no_connection`；`no_library` | 问库页（包 G） |
| `resolveLibraryMessage(text, route)` | `text` 同上；`route` ∈ `'question'` · `'change'`（别的 → `bad_arguments`） | **v2 包 E**：你在「这是要改这个库吗？」里选了以后调：照选的走、不再分流；返回 `{ route, by: 'you', confidence: 1, result }`；`routes.jsonl` 记一行（`by: 'you'`、`resolvedBy: 'you'`）；一次只许一句、`no_connection`、`no_library` 同上 | 问库页（包 G）拿不准时的两个按钮 |
| `getQuota()` | — | **v2 包 M**：当前连接的套餐余量或 API 余额（§4.11）：`{ source, at, windows[] }` · `{ source: 'api', at, vendor, balance[], available? }` 或 `null`（没选连接、没读到、读失败、厂商没有余额接口）；只读内存，不调模型、不写盘 | 左栏左下角（`kit/sidebar.js SidebarQuota`） |
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
- `probes[kind]` 失败时带 `code`（重设计 R5a 起不带 `detail`：原话进「复制诊断信息」，§4.19）。页面发起的 `probeConnection` 在打开库时记进库的 `_pipeline/usage.jsonl`（`purpose: probe`）。
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
| `quota-changed` | `{ kind }`（哪种连接的；当前连接换了时是新的当前连接） | **v2 包 M**：某种连接的套餐余量 / API 余额读到了、随一次调用来了、读不到了，或当前连接换了（§4.11） | 左栏左下角（重读 `getQuota`） |
| `queue-changed` | `{ running, waiting }`（库的 id；没有在跑的时 `running` 为 null） | **v2 包 L**：有库排进队列、队列里的一轮开始或结束（§4.12） | 应用（`lib/queue.js useQueue` 重读 `getQueue`：右栏「进度」、左栏第二行、库架、概览） |
| `suggestions-changed` | `{ libraryId, key, status }`（`status` ∈ `open` · `dismissed` · `accepted` · `acted` · `expired`） | **重设计 R5a**：某个库的系统检测新出、被忽略、转交主 Agent、被执行、或失效（§4.19；运行结束后、放弃落账后、库的配置改了、确认了一张主 Agent 提议后都会查；规则 ④ 查一个库时两边都记，对方库那张也发一次，precheck fix 3） | R5b 的待确认（重读 `listToConfirm`） |
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
- **（v2 包 L 起改了，见 §4.12：手动的一轮排到队尾。下面是包 A 当时的规则，留作记录。）** **手动「现在跑一轮」（页面的 `startRound`、托盘菜单）也走这个队列，选的是「回『正在跑』的错误」**：队列空闲 → 当前库的一轮马上开（占住队列，期间到点的库排在它后面）；队列忙（任何库的一轮在跑、在开、或有库在排队）→ 页面的 `startRound` 照 v1.0 的规矩回 `bad_arguments`（「一轮在跑」），托盘只记一行日志；手动的从不排进队列。理由：v1.0 的页面已经会处理这个错误，排队则要页面能显示「排在第几」（包 F 的事）。
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
- 顶栏：「回到条目」（关掉阅读窗口、应用窗口到前面）、地址、抽不出正文时的那句提示、「阅读模式 | 原网页」、「在浏览器里打开」。字体与颜色用应用的 `tokens.css` + `styles/reader.css`，`<html data-theme>` 是当前主题（v2 包 K2：另有 `data-appearance`，换主题、换外观、Windows 换深浅色时主进程重画这两张页；字体退到系统的无衬线字，见 §五「主题」）；词在 `src/main/texts/app.js` / `texts-en/app.js` 的 `reader`。

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

### 4.11 §四补：左下角的套餐余量与 API 余额（v2 包 M，11-10）

<!-- v2 package M: 维护者 11-10「套餐余额和API余额都放在左下角setting上面吧」；契约 docs/checks/2026-11-10-wp-m/contract.md M4 -->

- **服务** `src/main/services/quota.mjs`：每种连接在内存里留最后一次的余量（**不写盘**：不进 `%APPDATA%\Streams` 的任何文件，重开应用重新读）。
  - Claude Code：每次调用（库的关卡、缩写、核验、问库、分流、主 Agent 的每一轮、测试连接）的 stream-json 里带的 `rate_limit_event`（核心 `quota`，docs/core-api.md 5.17），连接服务把它交给 `record('claude-code', quota)`（`createConnectionsService({ onQuota })` → 核心 `deps.onQuota`）。是「上次调用时」的数，不另调。
  - Codex：核心 `readCodexQuota`（`codex app-server`，只发三条，不调模型）——启动时、每 10 分钟（`CODEX_EVERY_MS`）、每轮结束（`round-progress` 的 `done`）与主 Agent 每轮结束（`agent-changed` 的 `done`）后读。**只在 Codex 是当前连接时读**（不为没在用的连接起进程）。
  - API：核心 `readApiBalance`（只 DeepSeek、Moonshot 有官方余额接口），启动时、每轮结束与主 Agent 每轮结束后读，只在 API 是当前连接时读；key 从安全存储（safeStorage）在主进程里取，只进请求头，不写日志、不给页面。
  - 连接设置变了（`connections-changed`：换了当前连接、厂商、key）→ 发一次 `quota-changed` 并照新的当前连接重读。
  - 读失败（没装、超时、格式不对、key 不对）→ 那一种清成没有并发 `quota-changed`；日志只记错误码，不记服务器回的原文。
- **桥** `getQuota()` → 当前连接的余量或 `null`：Claude Code `{ source: 'claude-code', at, windows: [{ id: 'five_hour' | 'seven_day', usedPercent, resetsAt }] }`；Codex `{ source: 'codex', at, plan?, windows: [{ id: 'primary' | 'secondary', usedPercent, windowMins, resetsAt }] }`；API `{ source: 'api', at, vendor, balance: [{ currency, amount }], available? }`（`resetsAt` 是 Unix 秒）。没选连接、还没读到、读失败、厂商没有余额接口、缓存的是另一个厂商的 → `null`。再过一遍核心 `checkQuota` 白名单：账户 id、credits、重置券之类一个字段都到不了页面。
- **事件** `quota-changed` `{ kind }`：页面重读 `getQuota`。
- **左下角**（`kit/sidebar.js SidebarQuota`，`lib/quota.js quotaView / useQuota`）：在「+ 新建库」下面的空白之后、「设置」上面；`[data-part="quota"][data-quota-kind=plan|balance]`，小标题「套餐余量」/「API 余额」，每个窗口一行 `[data-quota-row=<id>]`「5 小时 已用 5% · 14:30 重置」（今天只写时刻、明天「明天 14:30」、再往后「11-13 16:00」；Codex 的窗口按长度写「7 天」「5 小时」），余额一行「110.00 CNY」；悬停「截至 今天 10:16」。`getQuota` 是 `null` → **整块不画**（读不到、没有接口都一样）。字全在 `texts/shell.js SHELL.sidebar.quota`（英文 `texts-en/shell.js` 同键）；不写品牌词，也不写是哪条连接。样式用现有 kit 的安静小字（`.st-sidebar__quota`，同 `.st-sidebar__note`），新主题的样式在 K2 统一换——**v2 包 K2 已换**：照 K1 画成小卡（标题与「截至 …」、每个窗口一行带进度条，`aria-label` 是整句），见 §五「主题」。
- **开发与测试**（装好的流息不认）：`STREAMS_DEV_QUOTA=<绝对路径的 JSON>` `{ "claude-code"?, "codex"?, "api"? }` 启动时当作读到的（每个过 `checkQuota`）；有它或有 `STREAMS_DEV_CONNECTION` 时不做任何真的读（不起 codex、不发请求）。

### 4.12 §四补：右栏四个标签、排队、资料库两栏（v2 包 L，11-10）

<!-- v2 package L: 维护者 11-10 「右栏定四个标签…资料库标签页保留瘦成两栏」「『没能开始』那条照建议改」；契约 docs/checks/2026-11-10-wp-l/contract.md -->

**排队规则改了（反馈 #1「没能开始」）**（`services/schedule.mjs startCurrent`，经 `services/pipeline.mjs roundGate`）：
- 页面的「开始」（跑一轮对话框）与托盘的「现在跑一轮」：没有在跑、也没有在排的 → 当前库马上开（照旧）。**有别的库在跑或在排 → 当前库排到队尾**，回答 `{ started: false, queued: true, position, runningLibraryId }`，不再是 `bad_arguments`；这个库已在跑 → `{ started: false, already: 'running' }`，已在排 → `{ started: false, already: 'queued', position }`，不重复排。托盘与页面同一个回答（托盘只记日志）。
- 照旧：**同一时间只跑一轮**；同一个库不会在队列里出现两次；补跑每库最多一轮、不叠加（N4）。
- 队列里每个库带 `why`（`schedule` · `catch-up` · `manual`）与 `since`；确认了的「开跑一轮」卡也算 `manual`。
- `getQueue()` 与事件 `queue-changed`（§四表）：在跑的那一轮（库、为什么、阶段、调用数 / 上限、开始时间）、排队的先后、每个库的下一次定时。
- 说法（`texts/panel.js QUEUE`，中英两张）：跑一轮对话框被排上 →「「中国电动车行业」正在补跑错过的那一轮；这个库排在第 3 位，轮到了会自动开始。」+「前面 · 这个库」两行 +「看进度」「知道了」；原来笼统的「没能开始。」只留给真正的出错。概览：在排时琥珀横幅「排队中 · 第 n 位」+ 前面是谁在跑什么 +「看进度」，库头按钮变「已排上」不可点；在跑时按钮「正在跑」不可点。库架卡片与左栏库列表的第二行：「在跑」/「排队中 · 第 n 位」。

**右栏**（`screens/right-panel.js RightPanel`，样式 `styles/screens/panel.css`）：
- 主窗口三栏：左栏 232 · 主区 · 右栏 380（窗口窄于 1360 时 352）；右上角按钮收起成 52px 的一条（四个图标，「等你决定」带数，点哪个就展开到哪个标签）。窗口最小 1280×800 时三栏都放得下。**收起 / 展开与当前标签记在 `settings.json` 的 `panel`**（`setPanel`，`getAppState().panel`；默认展开、「详情」），下次打开照旧。首次打开、新建库的向导没有右栏。
- **进度**：全部库——在跑的那个（库名、为什么、开始时间、到了哪一步、调用数 / 上限）、排队的先后（1 = 在跑的，「这个库」标出当前库）、各库下一次定时。读 `getQueue`（`app.js useQueue`：`queue-changed` 与一轮结束时重读；跑的过程中阶段与调用数跟 `round-progress` 走，不每步重读）。
- **等你决定**：全部库待确认的提议卡与没处理的建议卡，每条写库名与一句话；**和左栏「和主 Agent 聊」旁的数同一个来源**（`lib/libraries.js useWaitingItems`：`listProposals({ status: 'pending' })` + `listSuggestions(null)` 里没处理的；左栏的数就是它的 `count`）。点提议卡 → 和主 Agent 聊并滚到那张卡（路由参数 `card`）；点建议卡 → 那个库的概览、滚到「主 Agent 给这个库的建议」（`openLibrary(id, route)`）。
- **详情**（随主区变；屏把内容经 `LibraryFrame` / `AppFrame` 的 `detail` 交给右栏）：待看 → 当前那张卡每道关的分数（数字带条）与理由、核验通过与否、「写给 AI 的话」标记、来源、「这一条的记录」，下面照旧是「最近的放弃理由」；资料库 → 原第三栏（`NotePanel`：主题、来源、分数理由、文件、链到这里的、同一来源的、「这一条的核验记录」，钩子照旧 `[data-part=note-panel|backlinks|same-source]`）；问库 → 最近一问的答案引用的笔记（编号、标题、引它的那句，点了在资料库打开），下面照旧是「这次用了什么」「想补的主题」；和主 Agent 聊 → 最近一轮它查过的东西与提的卡（点卡滚到它）；其他页面 → 一句说明。
- **文件**（当前库；库架、和主 Agent 聊、设置 →「先选一个库」）：`getLibraryOutline` 画「讲给人听的结构」——库名 +「在资源管理器中显示」（`revealLibrary`）；**笔记（n）按笔记头的主题分组**（第一组展开），点一篇 = 在资料库标签里打开它，右键或「更多」：用 Obsidian 打开（`openInObsidian`）· 在资源管理器中显示（`showNoteInFolder`）；**待看（n）** 点了去待看；**这个库的要求与来源** 点了去「来源与要求」（**不提供直接打开那个配置文件**）；**程序记录（不用动）默认折叠**，展开只有一句说明与「在资源管理器中显示」（`revealProgramRecords`）。界面上不出现任何程序文件名（V7）。

**资料库两栏**：资料库标签只剩「列表 + 阅读」两栏（`.lib-body` 的两个子块 `[data-part=list|reader]`），原第三栏只在右栏「详情」里；搜索、四个视图、主题与「最近 30 天」筛选、列表 / 图谱切换、待规范流程照旧。

**测试**：`test/services-queue.test.mjs`（排到队尾、已在排不重复、托盘与页面同答、维护者 的原场景——在旧行为下是 `bad_arguments`，红；`getQueue` 与 `queue-changed`）、`tests/acceptance/v2-draft` 的 N4（第 4 段改成「忙时排上、不叠加」）、`test/settings.test.mjs`（`panel` 字段）、`test/ui-panel.test.mjs`（真窗口：三处排队说法、四个标签、收起与标签记住、等你决定与左栏同数、详情随四个主区变、文件树与笔记头一致且程序记录默认折叠、资料库两栏；世界见 `test/support/queue-world.mjs`：本机假源把补跑的那一轮卡在抓取里）。变异（`npm run mutants -- l-refuse l-panel-not-saved l-records-open`）：改回拒绝、收起状态不写盘、程序记录默认展开，各自变红。截图：`node scripts/shots-l.mjs` → `docs/shots/2026-11-10-l/`。

### 4.13 §四补：重设计 R1——模板主题、外壳、立即运行与排队（11-11）

<!-- redesign R1: 维护者 11-11「可以开始重新施工了」；契约 docs/checks/2026-11-11-r1/contract.md；设计依据 docs/design/redesign/source/（赞妮的设计目录原样副本，来源与 sha256 见 docs/design/redesign/来源.md） -->

本节取代 §五「主题」（K2 的三套 token）、§4.12 里「概览」「跑一轮对话框」「已排上」的说法，以及 §五「界面结构」里左栏、库页头、五个标签的写法；其余照旧。

**主题直接用模板**（维护者 11-11，04 第 19–21 题）：
- 主题四选一：`precision` 精密国际主义 · `glass` 澄明玻璃 · `research` 研究对话（**默认**）· `monoline` 单线黑白；外观 `system`（默认）· `light` · `dark`。`src/shared/themes.mjs THEME_TEMPLATE` 写每套加载哪些样式表（按顺序）、`<body>` 的 class 与 `data-theme`，与设计目录 `07-模板版/templates/<主题>/index.html` 一致（`test/theme.test.mjs` 逐套读那四个文件比对）。深色是模板自带的 `<body data-appearance="dark">`。
- 模板文件**原样**放在 `src/renderer/template/`（23 个：四套用到的样式表、`streams/streams.css`、五个图标数据 `edition.js`、`round12/brand/streams.svg`），每个文件的 sha256 与设计目录相同，清单 `template/manifest.json`（`node scripts/template-manifest.mjs` 生成，逐字节核对后才写）。唯一的不同是一个文件夹名：设计的 `templates/精密国际主义-精修/` 在应用里叫 `templates/precision-detail/`（应用代码里不写中文路径），里面两个文件不变。设计里的 `streams/app.js`（演示用的渲染脚本）、`round11/interactions.js`（给演示条加「深色」按钮、把深色记在 localStorage）、`round12/brand.js`（演示条的产品切换）**不进应用**：演示条「视觉 / 画面 / 下一个画面 / 深色」不出现。
- 模板的 `design.css` 要 `../fonts/NotoSansSC-VF.ttf`（即 `template/shared/fonts/…`）：`app://` 用 `fonts/NotoSansSC-VF.ttf` 回答这一个路径（`main/protocol.mjs FILE_ALIASES`，同一份字节），17.8 MB 的字体不放两份。K2 自己的 `styles/fonts.css` 删了（模板声明的是 `Yunzhi Noto`，同一个文件）。
- **CSP 照旧**（只允许 `app://` 自身）：模板的样式表与脚本都从 `app://ui/template/…` 读；模板里没有外部网络资源——字体只有 `design.css` 的 `url('../fonts/NotoSansSC-VF.ttf')`（本地，见上）与数字用的 `local('Cascadia Mono')` 等系统字体，图只有 `round12/line.css` 的 `url(brand/streams.svg)`（本地，随模板放进来；它的 `yunzhi.svg` 只在 `data-product` 不是 `streams` 时用到，应用始终是 `streams`，不带）。`index.html` 的 CSP 没改一个字。
- **首帧**：`main/theme.mjs withTheme` 在送出 `index.html` 时把那套的样式表插到 `<!--theme-sheets-->` 处，`<body>` 写上 class、`data-theme`（如 `research11`）、`data-appearance`、`data-product="streams"`，`<html>` 照旧写 `data-theme` / `data-appearance`（应用自己的钩子）；窗口用 `THEME_PAGE` 的底色建（八种组合的页面底色从真窗口读出：`node scripts/theme-colours.mjs` 打印并比对，`test/ui-theme.test.mjs` 同样核）。
- **换**：设置「外观与语言」一节——四个主题（模板的 `.filters` / `.filter`，各带一个 radio：`[data-part="theme"] [data-theme-card=<id>][data-checked]`，「默认」标在研究对话上）；外观是模板的 `.field` 下拉 `select[data-field="appearance"]`（跟随系统 · 浅色 · 深色）。选了立刻 `setTheme` / `setAppearance`，页面用 `lib/theme.js applyLook` 换样式表（新的先载入、再去掉旧的）与 `<body>`，阅读窗口跟着重画，写进 `settings.json`。跟随系统时 Windows 换深浅，主进程 `nativeTheme` 的 `updated` → `settings-changed` → 页面照新的 `scheme` 换。
- **迁移**（读 `settings.json` 时，`migrateLook`，只动这两个字段）：没有主题、`river` 或别的值 → `research` + `system`；`paper` → `research` + `light`；`night` → `research` + `dark`；四个现行 id 原样（外观经校验）。
- **移除**：`styles/tokens.css`、`scripts/gen-tokens.mjs`、`test/support/tokens.mjs`、`test/support/contrast-pairs.mjs`、kit.css 里按 `[data-theme]` 写的每套小记号、`styles/fonts.css`；`docs/tokens.md` 作废。
- **过渡**：还没换到模板部件的页面（待看的卡、资料库、问库、来源与要求、主 Agent 的对话、设置的其余各节、首次打开、新建库、对话框与菜单）仍写 `var(--st-…)`；`styles/interim.css` 把这些名字一律指到模板自己的变量（`--bench --panel --paper --well --ink11 --sub11 --accent11 --pick --inverse11 --rule11 --float11`），不定义任何颜色（`test/kit.test.mjs` 核），R2–R4 换完即删（**重设计 R4b**：来源与要求、高级设置、设置换完后仍删不掉——主 Agent 的对话与卡〔R5〕、kit 的对话框 / 按钮 / 菜单、占位屏、右栏与左栏的 R1 遗留还在用，见 §4.17 与该文件开头）。应用自己的一层覆盖 `styles/template-app.css`（`.app` 占满窗口——模板减去了演示条的 34px；右栏收起成 52px；没有右栏时两栏；库页的头、标签、横幅；模板没有的几个小零件），也只用模板的变量。

**外壳**（照设计目录 `streams/app.js` 的搭法，部件对应见 `07-模板版/说明.md`「用了模板的哪些部件」）：
- **左栏**（`kit/sidebar.js`）：`brand`（流息的标、流息、个人资料库）→「新建库」（`navitem.new`，`[data-action="add-library"]`）→「库架」（后面是库的个数）→「主 Agent」（**不带数字**：待确认的数只在右栏，F10）→「我的库」→ 每个库一行 `project-item`：图标、名字、待看数（或琥珀点 `[data-problem]`）、一行小字——运行中 · <当前环节> / 排队中 · 第 n 位 / 来源异常（等问题）/ n 条待看 / 暂无待看（`[data-library-line]`，排队时 `[data-library-queue][data-position]`）→ 底部 `side-footer`：套餐用量（`st-quota` + `mini-chart`，读不到整块不显示）、设置。`st-sidebar` 等旧 class 只作测试钩子留在元素上，没有样式。
- **右栏外框**（`screens/right-panel.js`）：模板的 `context-panel`、`panel-tabs`：**进度 · 待确认 · 详情 · 文件**（「等你决定」改名「待确认」，维护者 定第 13 题）；待确认的数用 `st-count`，与清单同源（`useWaitingItems`）；标签行末一个收起按钮，收起成 52px 的竖条（四个图标）；收起与当前标签照旧记在 `settings.json panel`。进度：`panel-summary`（1 个运行中 · 1 个排队中 / 当前无运行任务）、每个库一张 `phase-row`（在跑的展开：为什么、当前步骤、开始时间，下面 `mini-chart` 是模型调用 / 上限；排队的：手动触发 · 何时加入队列、前一任务完成后自动开始）、`activity-row` 的下次运行时间；在库页上，下面是该库的「上次运行」（原概览的数字、上一轮、最近收藏、运行状态、来源横幅、连续无产出：`screens/last-run.js`，R2 搬到新家）。待确认：小确认卡（主 Agent 提议 / 系统检测 + 库名 + 一句话，点了去处理处）；在库页上，下面是该库的系统检测卡，就地可点（R5 并成一种卡）。文件：`panel-summary` + 按主题分组的 `file-row`、待看、来源与要求、程序记录（无需修改，默认收起）。详情：照旧由各屏给（R2、R5 再改）。
- **库页**（`screens/library-frame.js`）：`work-header`——库名 `h1#lib-head-name`、一行概况（追踪范围：… · n 个来源）、屏自己的按钮、`status-chip`「下次运行 明天 08:00 · 预计 2–8 次模型调用」（`getHome().nextRun`、`estimateRound().expectedCalls`）、**运行按钮**；然后四个标签 **待看 · 资料库 · 问库 ｜ 来源与要求**（`nav.panel-tabs.st-libtabs`，待看的数 `st-count`）；然后「本次运行未开始」的卡（`[data-part="problem"]`，原概览的 S13 卡，四个标签都看得见，V6；措辞与新家在 R2）；然后屏本身。**概览去掉了**（路由、屏、样式都删），进库落在待看；v1.0 的 `today` / `status` 也到待看。
- **库架**（`screens/shelf.js`，维护者 定第 2 题 B：留着，左栏第一项）：`home-content`（eyebrow、大标题、说明、搜索库、新建库）+ 每个库一张 `project-tile`（上次运行 · n 个来源、状态 chip「运行中 · 抓取」/「排队中 · 第 n 位」/ 问题、库名、追踪范围、底部「n 条待看 · 来源正常 / 来源异常」与「进入待看」）+ 一行「新建库 · 由主 Agent 生成」。

**立即运行**（维护者 定第 6 题、N06、F22、F23）：
- 页头按钮**本身就是状态**：「立即运行」（点了直接 `startRound`，**不弹对话框**；没有别的库在跑 → 马上开始；有别的库在跑或在排 → 排到队尾）·「运行中 · 停止」（点了 `cancelRound`；停的过程中「正在停止」）·「排队中 · 第 n 位」（不可点）。按钮旁的小字是下次运行与预计模型调用次数。钩子：`[data-part="run-button"][data-run-state=idle|running|queued|stopping][data-position]`。
- 托盘「立即运行」（原「现在跑一轮」）同一规则：`scheduler.startOne` → `startCurrent`，忙时排到队尾，从不弹框。
- 排队只在三处显示：页头按钮、左栏库行的小字、右栏进度（唯一写明细的地方）；库架卡片上的 chip 与左栏同一个说法。**跑一轮对话框（`screens/run-dialog.js`）及其排队说法、「已排上」「看进度」、概览的排队横幅都删了**；改上限只在来源与要求（R4 换样子）。

**测试**：`test/theme.test.mjs`（四套 × 设计页的样式表与 class、模板文件的 sha256、迁移表与变异、首帧底色表）、`test/ui-theme.test.mjs`（真窗口：首帧、八种组合的底色与表一致、跟随系统、设置里的四个主题与外观、阅读窗口跟着变）、`test/ui-shell.test.mjs`（左栏、四个标签、进库落在待看、没有概览、库架）、`test/ui-run.test.mjs`（立即运行不弹框、忙时排队、按钮三态、托盘同一规则）、`test/ui-panel.test.mjs`（右栏四个标签、收起记忆、待确认的数）。截图：`node scripts/shots-r1.mjs` → `docs/shots/2026-11-11-r1/`。变异（`npm run mutants -- <id>`，在 `desktop/` 的临时副本里改坏、对应测试必须红）：`r1-default-precision`（默认改回精密国际主义）· `r1-night-light`（night 迁移成浅色）· `r1-first-frame-wrong`（首帧底色表错一格）· `r1-sheets-out-of-order`（研究对话的样式表换了顺序）· `r1-run-does-nothing`（立即运行不调 startRound）· `r1-refuse-when-busy`（忙时拒绝而不排队）· `r1-overview-back`（进库不落在待看）· `colour-in-app-styles`（应用样式里写了颜色），以及原有的 `l-panel-not-saved`（右栏状态不存）。

### 4.14 §四补：重设计 R2——待看与运行（11-11）

<!-- redesign R2: 契约 docs/checks/2026-11-11-r2/contract.md；设计依据 03-页面稿 P05–P08、P16 的进度与详情，07-模板版 streams/app.js 的待看、待看空着时、运行与排队、连接出问题 -->

本节取代 §4.13 里「上次运行（R1 暂放在右栏进度）」「本次运行未开始的卡（措辞与新家在 R2）」两处，以及 §4.12「详情 · 待看」的写法；其余照旧。页面全部用模板部件搭（`confirmation`、`section-label`、`file-row`、`phase-row`、`progress-alert`、`filters`、`empty-state`、`mini-chart`、`progress-line`、`step-line`、`step-dots`），覆盖层 `styles/template-app.css` 第 6 段只写尺寸与间距、颜色只用模板变量；R1 过渡用的 `styles/screens/inbox.css`、`last-run.css`、`status.css` 与 `screens/last-run.js`、`screens/status.js`（四个数字方块、运行状态块）删了。

**待看**（`screens/inbox.js`，P05，F24–F28、F31、F38）：
- 列表头（`section-label`）：「待看 · n 条 · 按评分排序」、键盘提示「J / K 切换 · C 收藏 · D 放弃 · L 稍后处理」、「＋ 添加链接」。n 是要拍板的卡（不含稍后处理的、不含挂起的放弃）；库页标签与左栏的待看数同一口径（核心 `homeNumbers.inbox` 不含稍后处理；`getLibrariesOverview` 再减去挂起的那条）。
- 卡（`confirmation`）：标题（点了 `openReader(url, 'reader')`，流息的阅读窗口）；**一行**「来源 · 日期 · 相关度 0.90 · 实质 0.85 · 新 / 后续」；右上是标记（`status-chip`）：检测到面向 AI 的指令，已忽略 · 未通过核验 · 可能重复 · 没有打分 · 未通过筛选 · 手动移入 · 等了 n 天（≥ 14 天；不到 14 天写在卡脚）；内容概述与要点（`decision-points`）；按钮 **稍后处理 · 放弃 · 收藏**。**理由不在卡上**，只在右栏「详情」。点卡（不是按钮）就是选中它，选中的就是「详情」显示的那条；键盘 J K C D L 照旧（打字时、有修饰键、开着对话框时不算）。
- 「详情」（F30）：当前条目——「推荐理由」三段（相关度 分数 + 理由、实质 分数 + 理由、新鲜度 新 / 后续 + 理由）、「核验」（核验通过 / 未通过核验 / 未核验；面向 AI 的指令有无）、「▸ 核验记录（相关度 n 项 · 实质 n 项 · 摘要 n 项）」默认收起，展开是原来核验记录对话框的内容（`verdict-dialog.js VerdictBody`，同一份 `getVerdicts`）；「来源 · 发布 日期 · 首次抓取 时间」（`listInbox` 卡上的 `firstSeen`）；下面是最近填了原因的放弃。**待看不再弹核验记录对话框**（资料库的那个照旧，R3 再改）。

**放弃即生效 + 理由快选与撤销**（N03，F26）：点「放弃」或 D → 这条立刻从列表消失（`dismissItem(url)`），**主进程挂起、不写账本**；列表下出一条小条（`progress-alert`）：「已放弃「标题」。可选择原因：营销内容 · 不相关 · 内容过浅 · 重复 · 其他原因… · 撤销」，右边一个关闭。
- 点一个理由 → `settleDismiss(那几个字, quick)` 写进账本（`reason` 是那几个字，`quick` 是 `marketing` · `irrelevant` · `shallow` · `duplicate`，R5 的 N04 读它）；「其他原因…」展开一个输入框，回车或「保存原因」写一句；关闭 → 写进账本**没有理由字段**。
- 撤销 → `undoDismiss()`：挂起作废，卡回到原位，账本一个字不写。
- 一次只有一条小条：对下一条动手（收藏 / 放弃 / 稍后处理 / 移入待看）先把挂起的写进去（没有理由）；离开这一页（换标签、换屏）页面调 `settleDismiss(null, null)`；换库（`library-changed` 后当前库不是挂起的那个库，或另一个库的 `getInbox`）主进程写进去；**退出应用**（任何退出：托盘「退出」、更新、关最后一个窗口）`main.mjs` 的 `before-quit` 调 `pipeline.settlePending('the app quits')`。重启后小条不会再出现，因为它已写进账本。
- 账本 `kept` / `dismissed` 终态的规矩没放松：挂起期间账本里这条仍是 `inbox`，写进去的只有一次 `dismissed`。

**稍后处理**（F27）：点「稍后处理」或 L → 这条收进列表下「▸ 稍后处理 · n 条（下次运行后重新列入待看）」一行（`phase-row`，可展开看，点一条开阅读窗口）。记录在库的 `_pipeline/later.json`（核心 `later` / `markLater`；不写账本、不碰 `notes/`），重启应用仍在。**本库**下一次运行结束（这一轮开始了，不管停没停）后主进程调核心 `releaseLater` 把它们放回待看；别的库运行不影响。待看可以因此清空。

**未通过筛选与「移入待看」**（N02，F33 的一半）：待看页底部「▾ 未通过筛选 · n 条（不会入库）」（有才显示），默认收起；每行（`file-row`）标题、「未通过相关度 0.30」（哪一关与分数）、一句原因、「移入待看」。按最新判定在前，最多 50 条（核心 `listRejected`；超过时一句「仅列出最新的 50 条」）。「移入待看」→ `moveToInbox(url)`（核心 `moveToInbox`）：这条进待看，卡上标「未通过筛选 · 手动移入」（没有摘要、没有核验，内容概述位置是来源自带的摘要），**不写 `notes/`**；之后点收藏照常 `keep` → `writeNoteFile(by:'keep')`，写出的文件头合规范、过索引。重新评分（N07）在 R5。

**添加链接**（N09，F50）：列表头「＋ 添加链接」开一个对话框（网址、标题选填），走原有的 `addManualLink` → 核心 `addManual`；加上后待看里立刻多一行「网址 · 标题 · 手动添加 · 将在下次运行时评分」+「待评分」（`getInbox().manual` = 核心 `listManualWaiting`）。坏网址：「请输入以 http:// 或 https:// 开头的网址。」；已在库里：「这个网址已在该库中，未重复添加。」。下次运行评完分照正常规矩走（过了进待看，不过进未通过筛选）。资料库那个入口（来源与要求的「贴一个链接进待看」）R3 再去。

**待看空着时 = 上次运行小结**（N10，F18；`screens/run-funnel.js RunFunnel`）：「待看 · 0 条」、`empty-state`「暂无待看内容 / 下次运行：明天 08:00。」（没开定时：「未开启定时运行。」），下面：
- 「上次运行 · 时间」一条漏斗（模板的 `mini-chart`）：**已抓取（n 个来源）→ 去重后新增 → 通过相关度 → 通过实质 → 进入待看**，每格是那一行运行记录的数（`counts.fetched` · `counts.new` · `gates.<关>.passed` · `counts.inbox`），条的长短是占已抓取的比例。没完成的运行（`stoppedAt`）停在出事那格（`stoppedNode`：某一关 → 那一关的格；摘要 → 进入待看），那格写「停」，之后写「—」，下面一行原因：「停 · 达到单次运行上限…」「停 · 已手动停止…」「停 · 连接出错：登录过期」。**自检没过**的那次（核心那时什么都不写）：主进程记下时间与原因（内存里，重启即忘），漏斗标题「上次运行 · 时间 · 未完成」、第一格「停」，下面「停 · 自检未通过：登录过期」；此时有尚未评分的条目，待看的 `empty-state` 写「有 n 条内容已抓取、尚未评分 / 重试后将继续处理。」（`getHome().toScore`：在流水线某一步排着的条目数）。
- 「处理情况：收藏 a · 放弃 b · 稍后处理 c ｜ 模型调用 N 次 = 运行前自检 1 + 相关度 x + 实质 y + 摘要 z + 核验 w」：处理情况是那一轮放进待看的条目后来的去向（核心 `roundOutcome`）；**N 与分项都是运行记录的**（核心 `callsBy`：运行前自检的那次试调 + 各关自己的调用 + 摘要自己的调用 + 所有核验判定的调用），等号两边相等（核心 `runFunnel` 算，页面不算数）。**口径**：N 包含运行前自检，和 `usage.jsonl`（设置「全部库本月用量合计」里本库的数）一样——自检的试调经用量计数器记一行 `probe`，这一轮的记录里 `callsBy.selfCheck` 就是那一次（`withFirstProbe` 把那次的真实次数交给核心）；所以一个只跑过一轮的库，漏斗的 N = 设置里本库的数（`test/services-r2.test.mjs` 核）。运行中的「模型调用 n / 上限 m」是上限看的那个数（自检之后的调用），P07 的设计也是这样（自检已过时显示 0 / 120）。R2 之前的运行记录没有 `callsBy`：只写「模型调用 N 次」（N = 记录的 `calls`），不编分项。
- 「最近收藏」最多 5 条（`file-row`），点了开阅读窗口；「▸ 未通过筛选」同上。
- 四个数字方块、运行状态块不再存在；右栏进度里 R1 的「当前库 · 上次运行」也换成这同一个漏斗（`here`：标题「该库上次运行 · 时间」，不写处理情况）。来源的状态在来源与要求的来源行（R4 换样子）。

**运行中与排队**（P07，F19、F23、N06）：
- 正在跑的库，待看页（`screens/run-steps.js RunSteps`）：「本次运行 · 今天 20:56 开始 · 手动触发」+ 停止，模板的 `progress-line` 六段与说明（「1 / 6 个环节已完成」「当前步骤：抓取 2 个来源」），六步 `step-line`：运行前自检 · 抓取 n 个来源 · 去重 · 相关度评分 · 实质评分 · 摘要与核验，到哪一步亮到哪一步（`getQueue().running.phase`，`round-progress` 推）；还没有卡时上面是 `empty-state`「本次运行尚未完成 / 运行完成后，通过筛选的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。」。页头的小字换成「运行中：抓取 · 模型调用 0 / 上限 120」（`[data-part="running-chip"]`）。
- **开始的原因照实写四种**（O7）：`建库后的第一轮`（`first`：从没跑过的库被要求跑——确认了的新建库卡、新建库的开始、新库上点立即运行；`services/schedule.mjs whyOf`）· `手动触发`（`manual`）· `定时`（`schedule`）· `补跑`（`catch-up`）；`QUEUE_WHY` 多了 `first`，说法在 `texts/panel.js QUEUE.why`（中英两张）。排队里每个库也带原因与加入时间。
- 右栏「进度」（照 P16 / P07）：全部库 · 时间、「n 个运行中 · m 个排队中」/「当前无运行任务」、正在跑的那个（`phase-row` 展开：`step-dots`、「手动触发 · 今天 20:56 开始 · 当前步骤：抓取」、模型调用 n / 上限、停止）、「队列顺序」（第几位、原因 · 加入时间 · 前一任务完成后自动开始）、「下次运行时间」、「需保持流息运行（窗口或托盘）。错过的运行将在下次启动时补上一次。」；在库页上最后是该库上次运行的漏斗。排队仍只在三处（页头按钮、左栏库行小字、右栏进度）。

**连接出问题的横幅**（P08，F20，V6；`screens/problem-card.js`）：库页顶上（四个标签都看得见），**一次最多一条，只给自检没过**（`getHome().problem.code` 是 `connection` · `not-writable` · `index` · `config`；跑到一半的内部错误不出横幅）：一句发生了什么（含「抓到的 n 条都在，没丢」= `homeNumbers.caught`）+ 一句怎么办 + **最多 3 个按钮**——登录过期 / 未登录（Claude Code、Codex）：**前往登录**（`openLogin`）· **已登录，重试**（`detectConnections` 再 `startRound`）· **更换连接方式**（去设置）；别的连接问题：重试 · 更换连接方式 · 复制诊断信息。重试成功或换了连接后横幅消失（`getHome().problem` 变回 null）。句子仍带 V6 读的那几个词（登录过期 · 这一轮没有打分 · 抓到的 n 条都在，没丢 · 去登录 · 重试打分）：设计的新句子要先给 维护者 看（`05-措辞规范` 最后一条），R6 改。**来源异常、连续几轮没产出不再是横幅**：只在右栏「待确认」里成卡（R1 已在那里，卡的新动作在 R5）。

**桥**（§四表）：`getInbox` 的新形状、`dismissItem(url)` 只挂起、新的 `settleDismiss(reason, quick)` · `undoDismiss()` · `moveToInbox(url)`、`laterItem` 写 `later.json`；`getHome()` 多了 `lastRun: { funnel, outcome } | null`（核心 `runFunnel` / `failedStart`、`roundOutcome`）、`toScore`、`problem.at`，`recentKept` 最多 5 条且带 `source`。核心的改动见 `core/README.md`「流水线与核验」与 `docs/core-api.md` 4.2。

**测试**：核心 `core/test/r2-inbox.test.mjs`（放弃不写理由时没有理由字段、快选理由、终态；later 文件、放回；未通过筛选与移入不写 `notes/`、再收藏合规；待评分；`callsBy` 分项相加 = 连接器收到的全部调用 = 用量文件；漏斗的五格、停的那格、没连接、旧记录只有合计、自检没过；处理情况）；桌面 `test/services-r2.test.mjs`（挂起 / 撤销 / 关闭 / 快选 / 下一条 / 退出 / 换库；本库运行放回、别的库不放回；未通过筛选与移入；漏斗 N = 分项 = 设置里本库的数；四种原因）、`test/ui-inbox.test.mjs`（真窗口：卡、详情与核验记录、J K、放弃与小条、稍后、空着时的漏斗、未通过筛选与移入再收藏、添加链接；退出时写进账本；重启后稍后仍在、本库运行结束后回到待看）、`test/ui-error.test.mjs`（横幅三个按钮、四个标签都在；来源异常没有横幅、在待确认）、`test/ui-panel.test.mjs`（运行中的待看六步与原因、页头小字、右栏进度）。变异（`npm run mutants -- <id>`；核心的在 `node core/scripts/mutation-check.mjs <id>`）：桌面 `r2-undo-writes` · `r2-no-write-at-quit` · `r2-placeholder-reason` · `r2-later-not-back` · `r2-later-any-library` · `r2-move-writes-notes` · `r2-calls-part-off` · `r2-reason-on-card` · `r2-no-unverified-mark` · `r2-no-manual-row` · `r2-catch-up-said-scheduled` · `r2-source-banner`；核心 `r2-dismiss-placeholder` · `r2-move-writes-notes` · `r2-calls-part-off` · `r2-later-kept`。截图：`node scripts/shots-r2.mjs` → `docs/shots/2026-11-11-r2/`。

### 4.15 §四补：重设计 R3——资料库、图谱、编辑、缺少文件头、问库、阅读窗口（11-11）

<!-- redesign R3: 契约 docs/checks/2026-11-11-r3/contract.md；设计依据 03-页面稿 P09–P13、P16 的详情、P20，07-模板版 streams/app.js 的资料库、图谱、编辑笔记、缺少文件头、问库、阅读窗口 -->

本节取代 §4.9「资料库页（P5）」与「阅读窗口」的顶栏与版式写法、§4.12「资料库两栏」、§4.2 里资料库的四个分页、图谱的三组筛选与右下角小框、问库的版式；其余照旧（阅读窗口的隔离、会话锁、抽正文的做法一字未改）。页面全部用模板部件搭（`st-split` / `st-list`、`search-field`、`filters` / `filter`、`source-card`、`progress-alert`、`reader` / `reader-header` / `reader-scroll` / `reader-paper` / `readable`、`confirmation`、`field`、`form-footer`、`dialog` / `dialog-head` / `dialog-body`、`st-graph` / `st-node`、`thread`、`date-line`、`user-message`、`assistant-message`、`speaker`、`cite`、`file-row`、`after-card`、`composer`、`compose-help`、`panel-summary`、`decision-points`、`phase-row`、`activity-row`），覆盖层 `styles/template-app.css` 第 7 段只写尺寸与间距、颜色只用模板变量（kit.test 核）。R1 过渡用的 `styles/screens/library.css`、`graph.css`、`ask.css` 删了；笔记正文（`lib/markdown.js` 的 `.md*`）与核验记录（`.vd*`）的样式搬进第 7 段、换成模板变量；`interim.css` 去掉了只有这几页用的 13 个名字（剩下的由来源与要求、主 Agent 的对话与卡、设置、首次打开 / 新建库、kit 的对话框与菜单、右栏 R1 部件在用，见该文件开头）。

**资料库**（`screens/library.js`，P09，F33–F35、F37、F38；维护者 11-11 第 9 题）：
- 只放已成文件的东西（索引）。左列（`st-list`）：「资料库」+ 视图切换「列表 · 图谱」（`ViewSwitch`，模板的 `filters`）；搜索（`search-field`；片段是正文的纯文本，见下「核心」）；筛选 **全部 n · 已收藏 n · 我的笔记 n**（`getLibrary` 的 counts：核心 `libraryCounts` 的 `all` · `kept` · `authored`）；主题与「最近 30 天」；然后**只在有缺少文件头的文件时**一条 `progress-alert`「n 个文件缺少文件头，尚未入库。 去处理」（`counts.pending > 0`）；然后条目（`source-card`：日期 · 来源——你自己的笔记写「我的笔记」——、标题、一行摘要或搜索片段）。进来自动打开第一条；路由点名的（图谱、问库引用、文件标签）打开那条。
- 「抓到的」「待规范」两个分页、资料库里的「添加链接」入口都没有了（R2 已把没过关的搬到待看的「未通过筛选」、把添加链接放在待看页头）。
- 右列阅读区（`reader`）：顶上 `reader-header`——已收藏 / 我的笔记 标记（`status-chip`）、**编辑 · 查看原文 · 更多 ▾**（在 Obsidian 中打开 · 在资源管理器中显示 · 在浏览器中打开；来源不是 http(s) 时没有查看原文与在浏览器中打开）；「查看原文」= `openReader(url, 'reader')`（流息的阅读窗口），系统浏览器只在「更多」与阅读窗口里。下面 `reader-paper`：来源 / 主题（`eyebrow`）、标题、发布 · 收藏、正文（Markdown 切成元素；「内容概述」是正文自己的第一段；`[[链接]]` 指向库里的笔记就能点开）。
- 右栏「详情」（`NoteDetail`）只放阅读区没有的：**入选理由**（每个分数一句理由，`decision-points`）、**核验**里折叠的**核验记录**（`verdict-dialog.js VerdictFold`，与待看共用一个组件；资料库不再弹核验记录对话框，`VerdictDialog` 删了）、**文件**（`readNote().path`，如 `notes\<id>.md`）、**反向链接**、**同来源内容**（`file-row`，点了在资料库里选中那条）。钩子 `[data-part="note-panel"][data-id]` 照旧。

**缺少文件头**（同一屏，路由 `library` + `params.view = 'pending'`；P12，F39，V8、V2）：「← 返回资料库」、标题「n 个文件缺少文件头」+「全部写入」、一段说明（已在库文件夹里、流息尚未修改、写入后方可入库、正文不会改动）；每个文件一张 `confirmation`：文件名、所在文件夹与「缺少文件头」、「尚未入库」、「建议的文件头（可编辑）」文本框、底部「只写入文件头，正文不变」+ **跳过 · 写入**。规矩一字未动：点了才写（`applyHeader` / `applyAllHeaders` → 核心 `applyProposedHeader` → `writeNoteFile(by: 'import-header')`，正文逐字节不变）；跳过不写、页面再打开还在；拟不出的文件说明原因、没有写入按钮；没写入的文件不进索引、图谱、问库、资料库列表。V8 的标准原文没改（R6 改字）。

**图谱**（`screens/graph.js`，P10，F40）：仍是资料库的一种视图（页头同一个「列表 · 图谱」）。三行 **主题 → 来源 → 条目**，节点是模板的 `filter` 放在 `st-graph` 上（`st-node`），每行按核心的 `col` 顺序在宽度上均分（同样的数据画出同样的图）；线：主题 → 它的条目所在的来源、来源 → 条目（实线），没有来源的条目（你自己的笔记）从主题直连（实线），`[[链接]]` 一直画、是唯一的虚线。筛选只剩时间范围（最近 30 天 · 全部）：「只看已收藏 / 全部条目」「显示 [[链接]]」从页面、桥（`getGraph` 只收 `days`）、字典里都去掉了；主进程固定 `status: 'all'`、`links: true`。数据仍是核心 `graph`（只读索引 = 只画已成文件的条目）。点节点：节点高亮，右栏详情显示它——主题：篇数、关键词数、该主题下的内容；来源：篇数、该来源的内容；条目：来源 · 日期、链接到的笔记、反向链接、「在资料库中打开」。右下角小框没有了。超过 60 条只画最近 60 条照旧。

**编辑笔记**（`screens/edit-dialog.js`，P11，F36）：模板的 `<dialog class="dialog">`（`showModal`：模板自带的遮罩、焦点留在里面、Esc 关）：标题（`field`）、主题（`filters`：每个带 ✕；「＋ 添加主题」展开一个输入框，可输入新主题或从库里已有的主题里选——`datalist`——回车加上）、正文（Markdown）、底部 **保存 · 插入链接 · 取消** 与说明「仅可修改标题、主题、正文和链接；来源、日期、评分为记录字段，不可修改。」。插入链接照旧搜库、在光标处插 `[[标题]]`。规矩一字未动：只发 `title` / `topics` / `body` 里改了的（`editNote`），桥拒其他键，核心只改已存在且合规范的文件、不新建（`writeNoteFile(by: 'edit')`，V2）。

**问库**（`screens/ask.js`，P13，F41–F44）：模板的对话部件。顶上一行（`date-line`）「仅基于库内内容回答 · 范围：已收藏 n 条 · 我的笔记 n 条 · 不联网」。你的话是 `user-message`；回答（`assistant-message` + `speaker`「问库 · 库内问答」）每句带引用编号（`cite`，点了标出下面那条），下面列引用的笔记（`file-row`：编号、标题、日期，**打开** → 资料库里那条；来源是网址的多一个**查看原文** → 阅读窗口）；核验删掉的引用 / 句子照旧说一句；「库里没有。」照旧（V9 的原文，维护者 第 16 题的新句子 R6 与标准一起改）。`after-card` 一行：「库内缺少：…」·「记到想补的主题」·「反馈回答问题」；点过「记到想补的主题」变成「已加入待补充主题」，**这个状态来自核心的记录**（`getDemands` 的 `added`），所以换个标签再回来（对话按库留在应用内存里，退出即忘）仍是「已加入」；回答没点名缺什么时，照旧给一个输入框写主题。说要改这个库的话照旧转给主 Agent：对话里「主 Agent · 已转交主 Agent」+ 它的话与提议卡（`proposal-card.js`；按钮字改成 **确认 · 提出修改 · 拒绝**，新库的确认是「创建」，05-措辞规范；卡的其余样子是 R5 的事）；同一张卡在右栏「待确认」，那里的小卡多了 **拒绝 · 提出修改 · 确认**（`right-panel.js ProposalActions`：与对话里的卡调同样的 `declineProposal` / `confirmProposal`，`proposals-changed` 让两处都重读——在哪边点都一样；「提出修改」要写一句：本页上有这张卡就展开它的那一行，否则去主 Agent 并滚到卡）。输入框是模板的 `composer`，下面一行「每次提问约 2–5 次模型调用 · 如需调整来源、主题或要求，可直接描述」（`ASK_CALLS`：分流 0–1 次 + 回答与核验各 1 次，至多两轮）。右栏「详情」（`AnswerDetail`）：「引用了 n 篇笔记」、一行「命中 n 条 · 引用 n 条 · 模型调用 n 次 · 核验 n 轮均通过 · 模型未获得任何工具权限，未联网」、**本次回答依据**（引用的笔记，点了在资料库打开）、**待补充主题（n）**（每条「已提问 n 次」，到 3 次加「建议添加为主题」；下面「提问达 3 次的内容将建议添加为主题。」）。

**阅读窗口**（`src/main/reader.mjs`，P20，F29、F38）：两张页都换成模板的部件与该主题自己的样式表（`readerCss(rendererDir)` 现在是 主题 → css：`THEME_TEMPLATE` 那套表按顺序 + `styles/reader.css` 一层只管位置的覆盖；`@font-face` 与 `url(…)` 先去掉——data: 页、CSP 什么都不让载）。顶栏（60px，`BAR_HEIGHT`）是 `reader-header`：**← 返回条目**（`btn quiet`）· 地址（`search-field`）· **阅读模式 | 原网页**（`filters`）· **在浏览器中打开**；`<body>` 带主窗口那套主题的 class、`data-theme`、`data-appearance`，换主题 / 外观 / Windows 深浅时照旧重画。阅读页是 `reader-scroll` › `reader-paper`：第一行 `eyebrow`「阅读模式：仅保留正文，已移除导航与广告」、`reader-title`、`reader-meta`（站点 · 作者）、正文在 `readable` 里。抽不出正文时顶栏那句改成「无法从该网页提取正文，已显示原网页。」。隔离一项没动：`READER_WEB_PREFERENCES`、两个分区、会话锁、web contents 的锁、CSP（`READER_PAGE_CSP`）逐字照旧，`test/reader.test.mjs` 与 `test/ui-reader.test.mjs` 的安全检查照旧绿。所有「查看原文」都开它：待看卡标题（R2）、资料库阅读区、问库引用。

**核心**（`docs/core-api.md` 5.1、5.3、5.5）：`listLibrary` 多一个视图 `all`（索引的每一行，按日期新在前；**从不含账本里没有文件的条目**）、`libraryCounts` 多 `all`；`search` 的片段取自正文的纯文本（每行去掉标题记号与 `plainText` 去掉的记号，同摘要的做法），片段里不再有 `**` `[[ ]]` `#` 等；新函数 `demandsAdded(dir)`：「记到想补的主题」的每一次点击 `{ topic, question }`。

**开发钩子**（只在非打包时生效）：`STREAMS_DEV_ASK_SCRIPT=<json 文件的绝对路径>`，配 `STREAMS_DEV_CONNECTION=fake`：假连接对问库的提示（以核心 `ASK_PREAMBLE` 开头）回这个 JSON（核心 ask 的回答形状 `{ answer: [{ text, cites }], notInLibrary, missing, claimed }`），其余提示照旧（`services/connections.mjs withAskAnswer`）。给界面测试与截图用。

**测试**：核心 `core/test/r3-library.test.mjs`（`all` 只列文件、计数；图谱只画索引；写文件头正文逐字节不变、写入前不进索引 / 图谱 / 搜索；编辑只改三样、不新建、不改不合规范的；`demandsAdded`；搜索片段无记号）；桌面 `test/ui-library.test.mjs`（三个筛选与核心计数、全部不含抓取条目、没有抓到的 / 待规范 / 添加链接、阅读纸面、详情五块与核验记录、搜索与筛选、编辑对话框只有四样且记录字段不变、桥拒来源字段、缺文件头的提示与去处理）、`test/ui-library-reader.test.mjs`（什么都没收藏时三个 0、不列抓取条目、没有缺文件头的文件就没有提示；待看收藏后进资料库、更多三项、查看原文开阅读窗口）、`test/ui-import.test.mjs`（缺文件头的页：卡、写入、跳过、全部写入、正文逐字节、写入前不在资料库）、`test/ui-graph.test.mjs`（只画文件、行与顺序、线由核心的边来、只有 [[链接]] 是虚线、同样的图、只有时间范围、桥拒旧筛选、点节点右栏详情变）、`test/ui-ask.test.mjs`（范围一行、没连接、库里没有、写主题记到想补的主题到 3 次、反馈、V9 的页面一半）、`test/ui-ask-r3.test.mjs`（脚本化回答：引用编号都在候选集内、打开与查看原文；已加入待补充主题重开仍在；详情三块；转交主 Agent 的卡在对话与待确认是同一张、两处确认互相反映、库的上限只改一次）、`test/ui-reader.test.mjs`（从待看卡标题打开；模板顶栏的四个动作与地址、阅读纸面与那行说明、跟主题；安全检查照旧）、`test/reader.test.mjs`（顶栏与阅读页的部件与字、每套主题的样式表、去掉会加载的东西）。变异（`npm run mutants -- <id>`；核心的 `node core/scripts/mutation-check.mjs <id>`）：桌面 `r3-all-lists-caught` · `r3-graph-caught` · `r3-header-hint-always` · `r3-demand-forgotten` · `r3-card-not-shared` · `r3-source-opens-browser` · `r3-graph-filters-back` · `r3-reader-not-template`；核心 `r3-all-lists-caught` · `r3-graph-caught` · `r3-header-changes-body` · `r3-snippet-marks` · `r3-edit-source`；`h-obsidian-for-caught`、`h-default-kept` 随「抓到的」分页一起退役，`h-ai-mark-on-all` 改指 R2 的标记写法。截图：`node scripts/shots-r3.mjs` → `docs/shots/2026-11-11-r3/`。

**验收草案 N6 的 UC4**（玄翎 11-12 定，依据 N6「怎么核」的「已知差别按产品决定核」与 维护者 第 9 题）：UC4「在流息里读一条，不用 Obsidian」改走待看——进没收藏过的库落在待看、资料库「全部 0」、没有「抓到的」；选一张卡，详情有来源、日期、两道关的分数与理由；点卡标题在阅读窗口里用阅读模式打开、可切原网页；收藏 → notes/ 里多一个文件，到资料库选中它，「更多」里才有在 Obsidian 中打开、在资源管理器中显示。只改了 `tests/acceptance/v2-draft/n06-use-cases.test.mjs` 的 UC4 四步，`standards-draft.mjs` 未动。

**深色下的提示条**：模板的 `progress-alert` 在深色外观下底色仍是浅色、字变浅，看不清；库页（R2 的待看：放弃后的小条、横幅、运行说明；R3 的各页）与右栏里的 `progress-alert` 在深色下改用 `--well` 底、`--ink11` 字（`template-app.css` 第 7 段末，只用模板变量）。

### 4.16 §四补：重设计 R4a——首次打开、连接选择、新建库表单、严格程度（11-12）

<!-- redesign R4a: 契约 docs/checks/2026-11-12-r4a/contract.md；设计依据 03-页面稿 P01、P02、P04，07-模板版 streams/app.js 的首次打开、连接选择、新建库；功能地图 F08、F09、F45–F49、F56、F57、N01；维护者 11-11 第 4、5、8、15、17、18 题 -->

本节取代 §4.10 里「首次打开的触发」之后关于首次打开两步、和主 Agent 聊的引导作为第 2 步、新建库四步的写法（触发规则本身没变：应用一个库都不知道才进），以及 §4.3 / §4.1 里首次设置各步的界面写法。页面全部用模板部件搭（`work-header`、`status-chip`、`thread-scroll`、`new-content`、`eyebrow`、`file-row`、`after-card`、`section-label`、`field`、`filters` / `filter`、`search-field`、`document-link`、`form-footer`、`progress-alert`、`limit-note`；右栏「详情」是模板的 `home-context`），覆盖层 `styles/template-app.css` 第 8 段只写尺寸与间距、颜色只用模板变量（kit.test 核）。R1 过渡用的 `styles/screens/first-run.css` 与 `kit.css` 的向导步骤删了，`interim.css` 去掉了只有它们用的 `--st-sidebar-selected-sub`。

**首次打开**（`screens/first-run.js`，路由 `first-run`；P01，F08、F09；维护者 第 4 题「并成一屏，流息先选好连接」）：
- `app.js`：应用状态第一次回来、`libraryCount === 0`（且开发时没指定别的屏）→ 路由 `first-run`。**它是普通的一屏**：左栏（新建库 · 库架 0 · 主 Agent · 我的库 · 设置）、右栏都在；右栏「详情」是「流息怎样工作」（`HowItWorks`，`[data-part="how-it-works"]`）。v2 包 I 自己的两步侧栏（`WizardSidebar`）、`FIRST_RUN_STEPS` 删了。
- **流息自己选连接**：先 `getConnections`（检测）；`settings.json` 已有一条能用的就用它；否则按 Claude Code → Codex → API key 的顺序取**第一条能用的**（已登录；API 是存了 key）`setActiveConnection`，并 `recordSetupStep('connection', { by: 'default', detail })`（没有库时写进 `settings.json` 的 `setupConnection`，第一个库建出来时抄进去，§4.10）；一条都不能用 → 连接选择（下）。**不再单独「试一次」**：首次打开不调 `probeConnection`，连接的第一次真调用就是发出去的第一句话。
- 一屏（`[data-part="first-run"][data-view="home"]`）：页头「欢迎使用流息」+ 一句说明 +「当前连接：…」chip；然后 `eyebrow`「首次打开 / WELCOME」、「你想追踪什么内容？」与一句说明；`file-row`「当前连接：连接你电脑上的 Claude Code」+「版本 x · 已登录 · 用量计入你的套餐」（API：「已设置 key · 按量计费」）+「已连接」+「更换连接」（`[data-part="current-connection"][data-kind]`；没有连接时 `[data-part="no-connection"]`「未连接」+ 一句 +「选择连接」）；「示例（点击填入输入框，可修改后发送）」三行（`file-row`，`[data-action="example"][data-example]`：**只填进输入框、把光标放进去，不发**）；输入框（`field`，`textarea[data-field="track"]`）；`form-footer`：**发送**（没有连接或没写字时不可点）· **手动创建**（→ 新建库）· **暂不创建，先进入应用**（→ 库架）。
- **发送** = 去主 Agent 并把这句发出去（路由 `chat` 带 `params.send`；`screens/chat.js` 打开时发一次，和在那里打字发出一样）。主 Agent 页本身是 R5 的事；它在应用没有库时的引导（`FirstGuide`）现在只在你还没说过话时显示（发出这句后不再在上面重复三个示例）。

**连接选择**（同一屏，`[data-view="pick"]`；P02，F08）：
- 只在三种情况出现：一条能用的都没找到、找到了但没登录、点了「更换连接」（「选择连接」同）。
- 页头「连接模型」+ 一句；`eyebrow`「连接 / CONNECTION」、「选择一种连接方式」、一句（「前往登录」开终端窗口由该工具自行登录，流息不接触账号密码）；三行 `file-row`（`[data-connection][data-conn-state][data-recommended][data-selected]`）：连接你电脑上的 Claude Code · 连接你电脑上的 Codex · 输入 API key（名字照旧，V7），小字「推荐 · 已找到 2.1.287 · 未登录 · 用量计入你的套餐」（推荐 = 第一条能用的，没有能用的就是 Claude Code；没找到「未找到」；API「支持任意厂商 · 按量计费」或「已设置 key」）；行尾：没登录的 **前往登录**（`openLogin`：可见终端，由 CLI 自己登录；测试运行不开窗口、只记日志）且下面一行 `after-card`「已登录，重新检测」（`detectConnections`）；能用的 **使用此连接**（`setActiveConnection` + 记 `chose`，回到一屏）；正在用的标「当前连接」；API 没 key 的 **输入 API key**（开设置里现有的 key 对话框 `ApiKeyDialog`，样子是 R4b 的事）。`form-footer`：**重新检测** · **暂时跳过，稍后在设置中连接**（有能用的当前连接时 = 回去不改；没有时 = 不选、记 `skipped`，回到一屏显示「未连接」；同一次运行里再回首次打开不再自动弹连接选择）。
- 开发与测试钩子 `STREAMS_DEV_DETECT=<json 文件>`（只在非打包时生效，`services/connections.mjs`）：盖在检测结果上——`{ "claude-code": { installed, loggedIn, version }, "codex": {…} }`，每次检测重读（测试改了文件再点「已登录，重新检测」）。

**新建库**（`screens/new-library.js`，路由 `new-library`；P04，F56、F57、F45–F49；维护者 第 5 题「一页表单，留起步包和只建不跑」）：
- **一页表单**，左栏右栏都在（右栏「详情」是「流息怎样工作 · 把要求写清楚」）。v2 包 I 的四步（库放在哪 → 主题与来源 → 试跑一轮 → 定时）、起步包那一步、`WizardSidebar` 都删了。入口照旧：左栏「新建库」、库架、首次打开的「手动创建」（`useApp().newLibrary()`，`params.back` = 从哪来，「取消」回去）。
- 页头「新建库」+「由主 Agent 生成，或手动填写。两种方式的默认值相同。」+ 当前连接 chip；表单从上到下：「由主 Agent 生成 · 手动填写」（`filters`，前者去主 Agent）· **库名称** · **追踪要求**（必填：空着或全是空格时「仅创建」「创建并运行」都不可点，下面一行「必填：创建前请填写追踪要求。」；主进程也拒）· **严格程度**三档（`filters`：宽松（收录更多）· 标准 · 严格（仅收录高度相关），默认标准；标签行右边「标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过」随选的变）· **来源**：一个 `search-field`，贴了回车 → `guessSource`（认种类、取名字，重名加 -2）→ 就地 `trySource`（一次抓取，什么都不写）→ 一行 `file-row`：名字、「RSS · 地址」、状态（`FETCH_STATES`，正常带条数）与下面一句——正常是「最新：「标题」」，其余是 V3 的「怎么办」（`FETCH_HINTS`，没新内容也说「不需要你做什么。」），**不显示抓取器自己的报错**；每行「移除」。同一地址再贴：「该来源已在列表中。」· 下面一行 `document-link`「或 使用预设来源包：AI Agent 工具」+「3 个主题 · 9 个来源 · 添加后可逐个移除」（预设包 = 核心现有的起步包，来源与核心存的一样，含 `min_points`）：点了把它的来源加成行（**不自动抓**：标「尚未测试抓取」，每行有「测试抓取」与「移除」）、把它的主题加进主题；加过后这一行不可再点 · **主题（选填）**（`filters` 每个带 ✕，输入框回车加；被某个来源用着的主题不能单独移除）· **存储位置**（`newLibraryFolder`：默认 `<新建库默认存储位置>\<库名作文件夹名>`，装好的流息即 `文档\Streams\<库名>`；「更改…」= `chooseLibraryFolder` 选一个；一行说那个文件夹：空文件夹将在此创建库 / 包含 n 个 .md 文件将作为库打开、不移动不修改原有文件（F57）/ 已有一个库将直接打开它、本表单不写入 / 有别的文件请换一个——这时两个创建按钮不可点）· **定时**：「每天 [时刻] 自动运行 · 单次运行最多 [n] 次模型调用」（默认 = 应用的定时 `settings.json` 与流水线上限 120，和主 Agent 建库时卡没写的一样）。
- `form-footer`：**取消** · 小字「创建后立即开始首次运行，预计 n–m 次模型调用」（`estimateNewLibrary`：运行前自检 1 次 + 各行试抓到的条数 × 1–4，两头不超过上限；有没抓过的行时加「（未测试抓取的来源不计入）」）· **仅创建** · **创建并运行**（主色，最右）。两者都是 `createNewLibrary(form)`，`run` 一假一真：主进程按表单建库并登记、设为当前库（§四表、`services/new-library.mjs`），**仅创建**什么都不排；**创建并运行**排进运行（`queueRound`，照 R1 / R2 的排队规矩：没别的在跑就马上开始，否则排到队尾；原因「建库后的第一轮」= `first`）。然后去这个库的待看。
- **默认值与主 Agent 建的一样（O15）**：两条路都由核心 `fillNewLibrary` 写设置（`docs/core-api.md` 5.18）：阈值（严格程度那一档的两个数；主 Agent 的卡没写 = 标准）、定时（没写 = 应用的）、上限（没改 = 流水线默认）。表单写的每样都是你的（`changes.jsonl` 记 `you`）。首次设置的记录照旧六条：library（更改…选的 = chose，默认位置 = default，带文件夹状态）· connection（首次打开的，抄来）· pack（用了预设包 = chose + id，否则 skipped）· sources（预设包原样、没加 = default，否则 wrote + 删了几个加了几个）· trial（创建并运行 = chose，仅创建 = skipped）· schedule（照默认 = default，否则 wrote）。

**严格程度**（N01，维护者 第 8 题；核心 `docs/core-api.md` 5.18）：宽松 0.4 / 0.5 · 标准 0.5 / 0.6 · 严格 0.7 / 0.7（相关度 / 实质）。选一档就写这两个阈值；读的时候两个数正好是某一档才显示那一档，否则「自定义」。新建的库（手动或主 Agent 建）默认标准；**已有的库阈值一个不改**（流水线读的时候的默认仍是 0.7 / 0.6，按规则显示「自定义」）。本包只在新建库表单上用它；来源与要求页的开关是 R4b，用同一套核心函数（`readStrictness` / `saveStrictness`）。

**桥**（§四表）：新加 `getNewLibraryDefaults` · `newLibraryFolder` · `estimateNewLibrary` · `createNewLibrary`。`chooseLibraryFolder` 现在由表单的「更改…」用；`useChosenFolder`、`applyStarterPack`、`getStarterPacks`、`estimateRound`、`startRound` 桥上照旧（服务测试与别处在用），新建库页面不再调。

**顺手修（R3 审核扣分的两处）**：
- 编辑笔记（`screens/edit-dialog.js`）的按钮次序照 P11：正文下面一行「插入链接」+ 那句记录字段的说明，底部「取消 · 保存」，保存在最右（`template-app.css` 第 7 段 `st-edit__tools` / `st-edit__footer`）。
- 精密国际主义浅色下库页标签行当前标签（如「资料库」）看着发白：量了 R3 截图与 `07-模板版/截图/精密国际主义/资料库.png` 同一块——字是 `--ink11`（灰度最暗值两边相同），**发白的是图标**：模板自己的 `shared/round9/precision.css` 第 35 行 `.r9-precision .tab.active .ico { color: #fff; }`（第九轮的当前标签是深底，第十一轮改成了 `--pick` 浅底，这条没跟着改）。应用里用的就是模板的 `panel-tabs` / `tab` 部件、覆盖层没有给它写颜色，和模板截图一致；模板文件按约定不改，所以本包没有改它（若要改，是在覆盖层给 `.r11-precision .tab.active .ico` 换成 `--ink11`，那就和模板截图不一致了，待定）。

**测试**：`test/services-new-library.test.mjs`（不起 Electron：默认值、文件夹、空要求被拒（服务与桥两层）且什么都没建、仅创建什么都不排没有运行、创建并运行排一次且原因 first、三档写对、选 .md 文件夹逐字节不变、已有库原样打开、别的东西拒、与确认的建库卡同一份 `pipeline` / 定时 / 上限、六条记录）；`test/ui-new-library.test.mjs`（真窗口：一页、左右栏、没有向导；顺序与默认值；追踪要求必填；五种状态的字与「怎么办」、不漏原始报错、预估随试抓变、重复地址、移除；预设来源包一行、加进来不抓、逐个移除；严格程度切换；仅创建；创建并运行真的跑了一轮；更改…选 .md 文件夹逐字节不变；有别的东西的文件夹不可建）；`test/ui-first-run.test.mjs` 重写（已登录 → 一屏、自动选好、没有试一次与 probe；示例只填不发；更换连接 → 使用此连接；发送 → 主 Agent 那一句发了；没登录 → 连接选择、前往登录、改检测后已登录重新检测、使用此连接；没找到 → 跳过 → 未连接、发送不可点；三个出口；有库没当前库 → 库架）；`ui-setup-record`、`ui-import`、`ui-schedule`、`ui-settings`、`ui-shell`、`ui-library` 改了走到新建库 / 编辑对话框的那几步（文件里注明 redesign R4a）。核心见 `docs/core-api.md` 5.18。变异（`npm run mutants -- <id>`）：`r4a-pick-when-signed-in`（已登录也先出连接选择）· `r4a-no-pick-when-none`（没有能用的也不出连接选择）· `r4a-example-sends`（示例点了直接发）· `r4a-create-only-runs`（仅创建也排进运行）· `r4a-empty-brief-creates`（主进程给空要求补一句、照建）· `r4a-empty-brief-page`（页面不要求追踪要求）· `r4a-raw-fetch-message`（来源行显示抓取器自己的报错）· `r4a-edit-order-back`（编辑笔记底部又成了保存 · 取消）；核心的 `r4a-standard-0707` · `r4a-read-rewrites` · `r4a-card-old-default`。截图：`node scripts/shots-r4a.mjs` → `docs/shots/2026-11-12-r4a/`。

### 4.17 §四补：重设计 R4b——来源与要求、高级设置、变更记录、移除该库、设置、输入 API key、许可证与致谢、右栏文件（11-12）

<!-- redesign R4b: 契约 docs/checks/2026-11-12-r4b/contract.md；设计依据 03-页面稿 P14、P15、P16、P17、P18、P19、P21，07-模板版 streams/app.js 的来源与要求、高级设置、移除该库、设置、输入 API key、许可证与致谢；功能地图 F45–F55、F63–F69、N01、N08；维护者 11-11 第 8、10、14、15、17、18、19 题 -->

本节取代 §4.2 / §4.5 / §4.10 / §4.12 / §五 里来源与要求（两列、「关卡」、「这个库」、每块旁的「谁定的」）、设置（五组、主 Agent、定时一览）、许可证对话框、右栏「文件」的写法；其余照旧。页面全部用模板部件搭（`new-content`、`eyebrow`、`field` / `form-row`、`section-label`、`filters` / `filter`、`search-field`、`file-row`、`status-chip`、`document-link`、`after-card`、`phase-row`、`step-line`、`activity-row`、`form-footer`、`limit-note`、`progress-alert`、`dialog` / `dialog-head` / `dialog-body`），覆盖层 `styles/template-app.css` 第 9 段只写尺寸与位置、颜色只用模板变量（kit.test 核）。R1 过渡用的 `styles/screens/sources.css`、`pipeline.css`、`settings.css` 删了（`shell.css` 里给它们的几行也删了），`interim.css` 去掉了只有它们用的九个名字。**`interim.css` 还删不掉**：剩下的名字由主 Agent 的对话与提议卡、建议卡（`styles/screens/agent.css`，R5 的事）、kit 的对话框 / 按钮 / 标签 / 五种抓取状态（`kit.css`，开发用的组件展柜 `screens/kit.css`）、kit 的菜单（`menu.css`：右栏笔记的「更多」）、占位屏（`placeholder.css`）与右栏、左栏的 R1 遗留（`panel.css`、`shell.css`）在用，见该文件开头。

**模板对话框**（`screens/t-dialog.js TDialog`）：`<dialog class="dialog">` 用 `showModal` 打开（模板自带遮罩、焦点留在里面、Esc 即取消），`dialog-head`（标题 + 关闭）+ `dialog-body`（`new-content` 表单 + `form-footer`）。修改地址、删除来源、删除主题、移除该库、恢复默认、输入 API key、许可证与致谢都用它。钩子 `dialog[data-dialog=<名>]`、`[data-action="close-dialog"]`。

**来源与要求**（`screens/sources.js`，路由 `sources`；P14，F45–F50、F54，N01、N08）——四块，一屏多一点（`[data-view="main"]`，`main .st-src > [data-part]` 依次 `brief · sources · topics · run`）：
- **要求** `[data-part="brief"]`：库名称 `input[data-field="library-name"]`（N08）、追踪要求 `textarea[data-field="brief"]`（常开，不再先点「改要求」）、严格程度三档 `[data-part="strictness"] [data-level=loose|standard|strict]`（`getStrictness`；两个阈值不是任一档时多一个「自定义」`[data-level="custom"]` 并亮着，下面一行说明在高级里手动改过）、标签行右边一行「标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过」`[data-part="level-note"][data-level]`；**一个「保存」** `[data-action="save-brief"]`：改了的才写——库名 `setLibraryMeta(id, { name })`（登记与库自己的 `streams.json` 的 `name`，左栏与页头跟着变）、追踪要求 `setBrief`、严格程度 `setStrictness(level)`（那一档的两个阈值）；每样在 `changes.jsonl` 记一行 by `you`。空的追踪要求、空的或过长的库名在页面就拒，什么都不写。说明行 `[data-part="brief-note"][data-kind=saved|error]`。
- **来源 · n 个** `[data-part="sources"]`：**就地加来源，不弹对话框**——`search-field` `input[data-field="source"]` 贴了回车 → `guessSource`（认种类、取名字，重名加 -2）→ `trySource`（一次抓取，什么都不写）→ 一行，用的是**新建库表单同一个组件**（`screens/new-library.js SourceRow`，多了 `lead`「已识别为 RSS」与可替换的按钮）：名字、「已识别为 … · 地址」、状态（`FETCH_STATES`，正常带条数）与下面一句（正常：最新一条的标题；其余：V3 的「怎么办」`FETCH_HINTS`，**从不显示抓取器自己的报错**）+ **添加 · 取消**（`[data-part="adding"]`、`[data-action=add-source|cancel-add]`）。「添加」只在试抓到达来源之后可点（正常、没新内容、暂时失败；地址有问题、被拒绝不可点并说一句），`addSource`；同一地址再贴：「该来源已在列表中。」。来源表三列（`.st-src-table`）：**来源**（名字、种类 · 地址）· **状态与处理建议**（`status-chip` `[data-fetch-word]`：正常 · n 条 / 地址有问题 · HTTP 404 · 连续 n 次运行 / …；`[data-hint]` V3 的怎么办；不是正常时「上次成功抓取：…」）· **主题**；每行 `[data-row][data-state][data-paused][data-consecutive]` 末尾一个「⋯」`[data-action="row-more"]`，点开 `[data-part="row-menu"]` 四项：**测试抓取**（结果写在这一行下 `[data-tried]`，什么都不写）· **暂停 / 恢复**（`setSourcePaused`）· **修改地址**（模板对话框 `edit-source`：`updateSource`）· **删除**（模板对话框 `remove-source`，取消什么都不变）。点了任一项菜单收起；点别处、Esc 也收起。
- **主题 · n 个** `[data-part="topics"]`：一排标签 `[data-topic-row][data-kept]`「名字 · n 篇」；点一个才显示 `[data-part="topic-detail"]`：「「名字」的关键词（固定，系统不会自动修改）：」+ 关键词标签 `[data-keywords]` + **编辑关键词**（`updateTopic`）· **删除主题**（模板对话框 `remove-topic`）；加主题只要名字（输入框 `[data-field="topic-name"]` 回车，`addTopic` 不带关键词，关键词以后补）。
- **定时与上限** `[data-part="run"]`：一行「☐ 每天 [08:30] 自动运行 · 单次运行最多 [120] 次模型调用 ［保存］」（`setLibrarySchedule`、`setRoundCap`，一个 `[data-action="save-run"]`，改了的才写，各记一行 by `you`；时刻、上限不对在页面就说 `[data-part="run-note"][data-kind=saved|bad]`），下面一行：下次运行：… / 未开启定时运行。+「需保持流息运行（窗口或托盘）；错过的运行将在下次启动时补上一次，不累加。达到上限后停止，剩余内容留待下次运行处理。」（`[data-next-run]`）。
- 最底下 `document-link`「高级设置：评分环节与提示词 · 变更记录 · 库文件夹 →」`[data-action="go-advanced"]` → 路由 `sources` + `params.view = 'advanced'`。
- **去掉的**：每块旁的「谁定的」`[data-who]`（改进高级的变更记录）；「贴一个链接进待看」（R2 起在待看页头）；「加来源」对话框、v1.0 来源与主题的表格与按钮列。

**高级设置**（同一屏 `[data-view="advanced"]`；P15，F51–F55）：「← 返回来源与要求」`[data-action="back-sources"]`、`eyebrow`、标题「高级设置」、一句说明；三块都是 `phase-row`（`details`，默认展开）：
- **01 评分环节** `[data-part="gates-fold"]`（`screens/pipeline.js GatesSection`，v1.0 的流水线 / v2 的「关卡」原样挪进来，只换部件与说法）：七个节点一行（`filters`，每个上面一行种类：固定 · 脚本 · 评分环节 ① · 评分环节 ② · 模型 · 固定 · 固定，下面名字，评分环节带阈值「相关度 · 0.5」；`[data-flow-node][data-kind][data-locked]`）、一句「固定节点不可删除或修改；评分环节不向模型提供任何工具。」；两列：左边选中的环节——「环节 ① 相关度 · 提示词（可编辑）」（原「给模型的要求」）、输出格式（固定，只读）、**通过阈值**（0 到 1，别的在页面和核心都拒；下面一句「手动修改后，『严格程度』将显示为『自定义』」）、**材料**（仅标题、来源、摘要 / 读取正文）、「模型可用的工具：无」`[data-part="tools"][data-tools="none"]`、**校验规则**（内置规则带「（内置规则，不可删除）」、没有删除按钮；自己加的可删）+ **恢复默认 · 保存**（恢复默认先问，模板对话框 `reset-pipeline`）+ **单条测试**（选一条近期抓取的内容、「开始测试（1 次模型调用）」、结果一行、「测试结果不写入任何记录」——账本、核验记录、待看逐字节不变）；右边：上次运行各环节数据、近期放弃原因、近期未通过核验的原因。规矩一个没动：固定节点删不掉（核心 `locked-node` → `bad_arguments`）、评分环节不给模型任何工具（核心的环节配置不带 `tools`，手写进去也读不回来）、底线校验规则删不掉（核心拒）。保存时提示词 / 材料 / 自定义规则变了记一行 `prompts`、阈值变了记 `thresholds`、上限记 `cap`，都是 by `you`。
- **02 变更记录** `[data-part="changes"]`（`getChangeLog` = 核心 `changeLog`，新的在前）：表格 **时间 · 变更内容 · 操作来源**，每行 `[data-change-row][data-kind=change|setup][data-field][data-by=you|agent-confirmed|setup]`。操作来源：**手动修改**（by `you`：来源与要求、高级设置里经 `byYou` 记下的改动）、**主 Agent 提议 · 已确认**（确认的提议卡）、**初始设置**（首次设置的六条记录 `streams.json setup`，「创建库 · 存储位置：已选择」）。变更内容由页面按前后值说成一句（库名称：A → B、追踪要求：前 60 字、通过阈值：相关度 0.7 → 0.5，实质 …、单次运行上限：120 → 30、定时：每天 08:30 → 关闭、来源：添加 / 删除 / 暂停 / 恢复 / 修改 名字、主题：添加 / 删除「名字」/ 修改「名字」的关键词、评分环节：修改「相关度」的提示词、材料或校验规则），不显示原始 JSON。**统一的记录**：就是 v2 包 B 的 `changes.jsonl`（字段多了 `name`、`prompts`，`docs/core-api.md` 5.19）加首次设置记录；包 B 之前改过的、旧库没有记录的，**没有行**，不编。坏行不显示，计数一句。
- **03 库文件夹** `[data-part="folder-fold"]`（标题下一行是路径 `[data-library-path]`）：**在资源管理器中显示**（`revealLibrary`）· **重建索引**（`rebuildIndex`）· **移除该库**，下面一行「移除后，该库不再显示在『我的库』中，也不再定时运行；文件夹及其中的文件不会被删除。」。

**移除该库**（P21，F55）：模板对话框 `remove-library`：「移除「库名」？」、「仅取消登记：该库将不再显示在『我的库』中，也不再定时运行。」、**「文件夹及其中的文件不会被删除。」**「如需恢复，可在『新建库 → 手动填写 → 存储位置』中选择该文件夹。」、路径；**取消 · 移除**。移除 = `removeLibrary(id)`：只去掉登记，文件夹里一个文件都不动（规矩照旧），然后去库架。

**设置**（`screens/settings.js`；P17，F63–F69）：页头「设置」+「以下设置对本机的流息及全部库生效。各库的来源、要求与定时，请在该库的『来源与要求』中设置。」+ 版本 chip；四个跳转 `[data-part="jumps"] [data-jump=connection|look|library|about]`（点了滚到那一块），四块 `[data-group=…]`：
- **连接**：三种连接各一行（`file-row`，`[data-connection][data-conn-state][data-active]`；名字照旧，V7）：检测一句（已找到 · 版本 · 已登录 …）、**两个模型槽**（主模型 / 核验模型，核验默认「同主模型」，`setConnectionModels`）、当前那条「当前使用」chip `[data-part="in-use"]`，别的「设为当前连接」`[data-action="use-connection"]`（`setActiveConnection`；原单选「打分用这一条」）、「测试连接」`[data-action="probe"]`（原「现在试一次」）、API 那行「配置」`[data-action="setup-key"]`；没登录的工具照旧有「前往登录 · 已登录，重新检测」。下面一句「评分、摘要、问库与主 Agent 均使用当前连接的主模型；核验使用核验模型。」`[data-part="agent-uses"]`。**原来单独的「主 Agent」一块（会话、轮数、缩写）去掉了**（维护者 第 10 题）。
- **外观与语言**：R1 的四套主题（`filters`，各带一个 radio）、外观（跟随系统 · 浅色 · 深色，`field` 的下拉）、语言（`filters`，radio 的 id 照旧 `settings-language-<值>`）。
- **库与用量**：新建库默认存储位置（`file-row`：路径 · 默认位置、**更改…** · **恢复默认**，`getLibraryRoot` / `chooseLibraryRoot` / `setLibraryRoot`，照旧拒应用数据里的文件夹）；**本月用量合计**「n 次模型调用 输入 … · 输出 …」与构成一行「= 库 A n（含运行前自检 n）+ 库 B n + … + 主 Agent n」（`[data-part="usage"][data-calls]`、`[data-usage-library][data-calls][data-self-check]`、`[data-usage-agent][data-calls]`、`[data-part="usage-sum"][data-sum]`）。数都来自主进程 `getUsageTotal`：合计 = 各库的 `usage.jsonl` 本月调用 + 主 Agent 的 `usage.jsonl`，等号两边相等（测试核）；各库的数就是 R2 漏斗 / 右栏的口径（同一个用量文件；「运行前自检」是其中 `purpose: 'probe'` 的行，`getUsageTotal().libraries[].selfCheck`）。**「定时一览」去掉了**：每个库的下次运行在右栏「进度」的「下次运行时间」（`getQueue().next`，那一栏照旧在 `queue-changed` 时重读：在来源与要求改了定时后，要等下一次队列变化才更新）。
- **关于**：「流息 x（Windows 版）」+ 检查更新（`screens/settings-update.js`，有新版本时的提示照旧；按钮换成模板的 `btn`）、「由 Starry Digital 开发」（打开 starrydigital.ca，V11）、「许可证与致谢」；**▾ 高级**（`details`，默认收起）：显示开发者信息 · **复制诊断信息**（`[data-action="copy-diagnostics"]`；**整个应用只有这一处**——库页横幅上的「复制诊断信息」去掉了，横幅照旧最多 3 个按钮：登录过期 / 未登录是前往登录 · 已登录，重试 · 更换连接方式，别的连接问题是重试 · 更换连接方式；横幅里说「仍不行…」的那句改成指向「设置 → 关于 → 高级」）· **打开运行记录文件夹**（`openLogsFolder`）。

**输入 API key**（P18）：模板对话框 `api-key`：厂商（「选择预设…」+ 预设 + 自定义接口地址；没存过 key 时停在「选择预设…」，保存不可点）、接口地址（预设时只读）、key（`password`）、一句「API key 仅保存在本机的系统凭据保护中，不会写入任何库文件夹。费用按量计入对应账户。」、**删除 API key**（有 key 时）· 取消 · 保存。key 照旧只经 `setApiKey` 进主进程的 safeStorage（`secrets/key-<厂商>.bin`），页面只回末四位，不进日志、不进任何库文件夹（`test/security.test.mjs`、`ui-settings.test.mjs` 照旧）。

**许可证与致谢**（P19，V11）：模板对话框 `licenses`：「流息本身 · MIT」+ 全文、「由 Starry Digital 开发」、「界面字体 · Noto Sans SC（SIL Open Font License 1.1）」（许可证全文收在「查看字体许可证全文」下）、「随附的第三方组件」表（名称 · 版本 · 许可证；字体不再重复列在表里）、**查看完整第三方声明**（开发版不可点并说明）· **关闭**。P19 的「标题字体 · Noto Serif SC」一条是 R6 随包字体时加，本包没有加。

**右栏「文件」**（`screens/right-panel.js FilesPane`；P14 右栏、P16）：`panel-summary`「文件 · 库的文件结构」、库名、路径；「在资源管理器中显示」；然后四个 `section-label` 头：**▾ 笔记（n）· 按主题**（展开是按主题分组的笔记，点一篇在资料库读，右键 /「更多」在 Obsidian 中打开 · 在资源管理器中显示）· **▸ 待看（n）· 尚未生成文件**（→ 待看）· **▸ 该库的来源与要求**（→ 来源与要求，从不打开 `streams.json`）· **▸ 程序记录（无需修改）**（默认收起，展开只有一句与「在资源管理器中显示」）。程序文件的名字一个都不显示（`ui-panel` 核）。

**桥**（§四表）：新加 `getStrictness` · `setStrictness(level)` · `getChangeLog`；`setLibraryMeta` 给了 `name` 时先写库自己的 `streams.json` 并记 `name`；`getUsageTotal().libraries[]` 多了 `selfCheck`。核心见 `docs/core-api.md` 5.19。

**测试**：核心 `core/test/r4b-sources.test.mjs`；桌面 `test/ui-sources.test.mjs`（重写：四块与顺序、没有谁定的 / 贴链接；来源行 = `sourcesView`；「⋯」四项、测试抓取不写、暂停恢复与修改地址进 `streams.json` 且记 you、删除先问；就地加来源五种状态的字与怎么办、不漏原始报错、添加只在到达之后、重复地址；主题标签、关键词、只要名字、删除先问；要求三样一个保存进 `streams.json` 与登记、各记一行、空要求拒；定时与上限）、`test/ui-advanced.test.mjs`（新：三块折叠；七个节点与种类、工具为空、固定节点与内置规则桥拒且不写；手动改阈值 → 来源与要求显示自定义、变更记录多一行手动修改，再选一档就不是自定义；变更记录 = 核心 `changeLog`、三种操作来源；库文件夹；移除该库取消不变、移除只去登记、文件夹逐字节不变）、`test/ui-settings-i.test.mjs`（重写：四块与跳转、主 Agent 与定时一览不在、连接行的按钮；用量合计 = 各库 + 主 Agent、等号两边相等、各库数 = 各自用量文件；关于与高级、复制诊断信息只在这里；默认存储位置照旧）；改了走法的旧测试（文件里注明 redesign R4b 与原因）：`ui-pipeline`（右栏数字的元素与措辞）、`ui-settings`（设为当前连接按钮、key 对话框先选厂商、上限用一个保存、阈值在高级里读）、`ui-licenses`（对话框标题、字体单列一行）、`ui-schedule`（一个保存、说明行的字）、`ui-setup-record`（首次设置在变更记录里，没记录的步骤没有行）、`ui-shell`（谁定的 → 变更记录、定时一览 → 右栏进度、等待条件不再等关卡）、`ui-agent`（谁定的 → 变更记录）；验收草案 `tests/acceptance/v2-draft/n06-use-cases.test.mjs` UC3 第 4 步只改了读的地方（谁定的 → 变更记录的行，`standards-draft.mjs` 未动）。变异（`npm run mutants -- <id>`）：`r4b-name-not-saved`（改库名不写进 `streams.json`）· `r4b-manual-not-recorded`（变更记录漏记手动修改）· `r4b-who-back`（谁定的回来）· `r4b-baseline-removable`（内置规则可删）· `r4b-preview-writes`（单条测试写进账本）· `r4b-remove-deletes-file`（移除删掉文件夹里一个文件）· `r4b-total-without-agent`（合计少算主 Agent）· `r4b-custom-not-shown`（手动改阈值不显示自定义）· `r4b-copy-in-banner`（复制诊断信息回到横幅）· `r4b-agent-part-back`（设置的主 Agent 一块回来）· `r4b-draft-overwritten`（定时与上限：输入了还没保存时，一次重新读取把保存过的值盖回输入框）；核心的见 5.19。参数可以写成前缀加 `*`（`npm run mutants -- "r4b-*"`、`node core/scripts/mutation-check.mjs "r4b-*"`），跑这一包的全部变异体。定时与上限一行（以及每轮上限）把用户输入了还没保存的值当作草稿：保存之前，`settings-changed` / `library-changed` 引起的重新读取不覆盖它；保存成功或换库后草稿结束。截图：`node scripts/shots-r4b.mjs` → `docs/shots/2026-11-12-r4b/`。

### 4.18 §四补：新 logo「五流」——应用图标与品牌记号（11-12）

> 截图 `docs/shots/2026-11-12-logo/titlebar*.png` 里标题栏的图标带红蓝边：这台机器的显示缩放大于 100%，Windows 取 24 / 32 那一项缩小来画；`streams.ico` 的 16 px 一项本身只有黑白（`compare-icon.mjs` 逐像素核过）。仓库 `README.md` 用 `docs/brand/lockup-on-white.png`：定稿 `lockup.png` 加 48 px 白边铺白底（定稿是白底黑标、透明底在 GitHub 深色模式下看不见），`lockup.png` 本身与定稿逐字节相同、留着。

> 契约 `docs/checks/2026-11-12-logo/contract.md`。维护者 11-12 让把赞妮的定稿（`Logo设计\定稿\流息\`，维护者 11-10 选的 B 五流）换进流息；定稿原样复制在 `docs/design/logo/source/`（来源与 sha256：`docs/design/logo/来源.md`，核：`node docs/design/logo/check-source.mjs`）。

- **应用图标**：`assets/icon/icon-512/48/32/24/16.svg` 是定稿的同名文件，逐字节相同；`node scripts/build-icon.mjs` 由它们渲染 `png/` 与 `streams.ico`（小尺寸各自 1:1 渲染手对过像素的 SVG，256 由 512 缩）。窗口标题栏、任务栏、托盘都读这一个 `streams.ico`（`src/main/icon.mjs`：`main.mjs` 的窗口与阅读窗口、`tray.mjs`）。本仓渲染的五张与定稿 `png/` 逐像素相同（`node scripts/compare-icon.mjs`；小尺寸的 PNG 文件字节不同，只差 pHYs 一块里记的分辨率）。安装包里的图标等 R6 重打安装包时带上，已安装的那份到 维护者 装新包时才换。
- **品牌记号**（左栏顶上的 `brand`，`kit/sidebar.js`；首次打开、新建库用的是同一个左栏；问库里流息那一方的头像 `screens/ask.js Speaker`）：`lib/brand-mark.js BrandMark`，画的是 `mark-black.svg` 的那一条路径——viewBox、transform、路径数据都照文件，只把 fill 从黑色换成 `currentColor`。覆盖层（`styles/template-app.css` 第 10 节）把左栏记号的颜色定为当前主题的墨色 `--ink11`（正文的颜色），去掉模板在品牌后面的底块、渐变、倾斜和单线黑白放的那张红蓝 3D 图，记号 39 × 27（13 × 9 格，每格 3 像素）；头像保留模板的小框，只去掉单线黑白的图。模板原来当品牌用的 `weave` 图标不再出现；模板里的 `round12/brand/streams.svg` 仍在 `template/`（模板文件原样、清单不动），应用不再显示它。
- **为什么单色、跟主题**：定稿只有白底上的黑标与红蓝 3D 两种，**没有深色底版本**（`设计说明.md` 第六节「没做的」）。把黑标直接放进深色主题会看不见；红蓝 3D 在深底上也没设计过。单色记号用主题自己的墨色，四套主题 × 浅 / 深色都和正文一样清楚，而且不用写任何新颜色（覆盖层只用模板变量，`kit.test` 核）。红蓝 3D 只留在应用图标上——那里永远是白色圆角底，正是定稿画的样子。
- 品牌词规矩（V7）不变：品牌那里只出现「流息 / Streams」。
- **测试**：`test/ui-brand.test.mjs`（新）；`test/icon.test.mjs`（加：五个来源逐字节等于定稿；设了 `STREAMS_SHARP_DIR` 时重建不跳过）；`test/ui-first-run.test.mjs`（加：首次打开的左栏记号）；`test/ui-ask-r3.test.mjs`（加：问库头像是记号、单线黑白深色下也画出来）；`scripts/lib/mirror.mjs` 的镜像多链一个 `docs/design/logo/source`。变异（`npm run mutants -- "logo-*"`）：`logo-mark-black`（记号写死 #000 → 深色四条红）· `logo-weave-back`（左栏换回 weave）· `logo-path-changed`（路径一个数不同）· `logo-overlay-gone`（覆盖层那条规则没了 → 八条红）· `logo-avatar-weave`（头像换回 weave）· `logo-icon-source`（icon-16.svg 改一个字节）。截图：`node scripts/shots-logo.mjs` → `docs/shots/2026-11-12-logo/`。

### 4.19 §四补：重设计 R5a——一种提议的后台、规则动作、追踪要求进评分与重新评分（11-13）

契约 `docs/checks/2026-11-12-r5a/contract.md`；维护者 11-11 动作表、11-12 三问（施工计划末尾）。本包只给数据与桥，**界面是 R5b 的**：旧的提议卡 / 建议卡组件照旧显示（建议卡的「要」现在等于「交由主 Agent 分析」，⑤ 等于「生成修改提议」），不因本包坏。

**一种提议、两个来处**（`services/agent.mjs`）：主 Agent 提议照旧在 `<appData>\proposals.jsonl`，系统检测照旧在每个库的 `_pipeline\suggestions.jsonl`，存储不合并；主进程给页面一个统一视图 `listToConfirm()`（§四表）：全部库（**不限当前库**）待确认的，每条带 `from: 'agent' | 'system'`、库 id 与库名、kind、按动作表算好的动作（`{ id, label, values?, level?, primary, callsModel }`，`label` 是 `texts/proposals.js PROPOSALS` 的键，中英两张字典都有；`callsModel` 为真的两种——交由主 Agent 分析、生成修改提议——R5b 要在按钮下写明「由主 Agent 处理，将消耗模型调用」`PROPOSALS.callsModel`），以及最近处理过的 ≤ 50 张的状态（主 Agent 提议：已确认 / 已拒绝 / 已提出修改 / 已失效 / 未能执行；系统检测：`dismissed` 已忽略 · `accepted` 已转交主 Agent（带 `action`）· `acted` 已执行（带 `action`、`level`）· `expired` 已失效（带 `reason`，`PROPOSALS.expired` 的键））。

**过时**：列之前、每次运行结束后（`afterRound`）、每次放弃落账之后（`afterDismiss`：规则 ⑤ 这时就查，不等运行结束）、当前库发 `library-changed` 时（`main.mjs` → `checkLibrary`）、确认一张主 Agent 提议之后（`services/proposals.mjs` 的 `afterConfirmed` → `afterProposal`）都跑一遍核心 `checkSuggestions`（给它的「其他库」是**全部登记的**库，读得出读不出都算：对方库暂时读不出——移动盘拔了——它的 ④ 留着，只有从库列表里移除了才失效，precheck fix 8；① 的情况变了——暂时失败 ↔ 地址无效——旧卡失效、同一次检查出对的那张，precheck fix 7）：来源已暂停 / 移除 / 改了地址、严格程度已不是记卡时那档、对方库已移除或不再重合、追踪要求已改的系统检测记一行失效、从列表里消失、不能再执行。所以**确认一张「暂停该来源」的主 Agent 提议，同一来源的 ① ③ 立刻一并收起**（发 `suggestions-changed { status: 'expired' }`）。

**新事件** `suggestions-changed { libraryId, key, status }`（§四事件表；`events.mjs`、`preload.cjs` 的 `EVENT_TOPICS` 同名）：系统检测新出（`open`）、忽略、转交、执行、失效时都发；连同 `proposals-changed`，页面重读 `listToConfirm` 即可，不靠执行的先后（O5）。

**动作**（`actOnSuggestion(libraryId, key, action)`，库 id 不限当前库；由核心 `runSuggestionAction` 做，core-api 5.14.6）：

| 动作 | 主进程做什么 | 变更记录 | 模型调用 |
|---|---|---|---|
| 暂停该来源 `pause-source` | 那个库的 `streams.json` 里该来源 `paused: true`；记「已执行」；同来源的 ③（或 ①）因此失效 | `sources` 一行 `by: 'you'`（手动修改） | 0 |
| 将严格程度调整为「…」 `set-strictness` | R4a 的 `saveStrictness` 调到目标档（两道过关线都不高于当前、至少一道更低的最严一档；自定义也照此算）；不触发自动重评（下面「重新评分」） | `thresholds` 一行 `by: 'you'` | 0 |
| 修改地址 `edit-address` | 不写盘：回 `{ navigate: { screen: 'sources', libraryId, source, dialog: 'edit-address' } }`，R5b 跳到那个库的「来源与要求」并打开那一行的修改地址对话框；改地址本身走 `updateSource`（照旧记手动修改），改完卡因地址已改失效 | 由 `updateSource` 记 | 0 |
| 忽略 `dismiss` | 记一行「已忽略」，收起 | 无 | 0 |
| 交由主 Agent 分析 `forward` | 先查过时（不适用 → 记失效、`bad_arguments`），再把这张提议写成**界面词**的一段话（核心 `handoffText`：不含 kind 名、JSON、原始报错）交主 Agent 跑一回（`as: 'note'`），回复与它出的主 Agent 提议出现在主 Agent 的对话里；**那一回有回答了才记「已转交主 Agent」**（precheck fix 6）。连接失败 → 回 `{ done: false, status: 'open', failure: { category: 'connection', code } }`（`code` 页面用 `CONNECTIONS.codes` 说），提议仍待确认、可以再点；没选连接 → `no_connection`，什么都不记 | 无 | 主 Agent 一回 |
| 生成修改提议 `draft-proposal`（⑤） | 同上，那段话要主 Agent 出一张「修改追踪要求」的主 Agent 提议（修改前 / 修改后，附当前追踪要求）；用户确认前追踪要求不变 | 确认时由那张提议记 | 主 Agent 一回 |

卡不是打开着的、动作不在这张卡的动作表里、卡已过时（记一行失效，不执行）→ `bad_arguments`。改的是当前库时另发一次 `library-changed`。没有任何动作写 `notes\`（`writeNoteFile` 仍是唯一入口）。

**追踪要求进评分**：相关度关卡的提示词带「这个资料库的追踪要求（用户写的，原样照录）：…」，追踪要求算进相关度的 cfg（core-api 4.0）；改追踪要求 = 评分标准变了。

**重新评分**（N07，core-api 4.1 / 4.6）：评分标准（追踪要求、严格程度 / 过关线、评分环节的提示词与材料）改了以后，下一次运行**不再**重评已评过的条目：待看的留在待看，未通过筛选的留在未通过筛选、标着按旧标准评分；新抓到的照常按新标准评。数据：`getInbox().rejected` 每条多 `old`、顶层多 `old`；`getInbox().rescore` 与 `getRescore(libraryId)` = `{ total, changedAt, expectedCalls: [lo, hi], cap }`（后者另带 `items`）。`startRescore(libraryId)` 进全应用那一条队列（`services/schedule.mjs startRescore`：空闲马上开始，忙就排到队尾，`getQueue().waiting` 那一项带 `job: 'rescore'`），后台跑核心 `rescoreRejected`：只评旧标准的条目，调用记进那个库的用量文件、算进单次运行上限；通过的进待看（标记照 R2），没通过的留在未通过筛选、不再标旧；不写 `notes\`、不写运行记录、不发「本次运行新增」的通知。进度经 `round-progress { rescore: true, phase: 'self-check' | 'rescore:<节点>' | 'done' }`，结束发 `inbox-changed`。到上限停下：还没评到的条目保留旧判定，等下一次点「重新评分」接着评（不进下次运行）；停在半路的那一条（某一道已按新标准重评、下一道还没评，结束时 `result.counts.partial` = 1，它花的调用在 `calls` 里）已不算旧，它的下一道由下一次运行接着评（precheck fix 9）。**已有库升级后**：写过追踪要求的库，旧判定全部变成按旧标准评分，留在原处，不自动重评（预期如此）。

**原始报错只进诊断信息**（O9，后台这一半；`public-data.mjs`、`raw-errors.mjs`）：桥给页面的数据里不带原始报错文字与 HTTP 码——

| 数据 | 页面拿到的 | 原文去哪 |
|---|---|---|
| 主 Agent 提议的失败（`listProposals`、`listToConfirm`、确认 / 拒绝 / 提出修改回的卡） | `failure: { step, done, rolledBack, left?, category: 'refused' \| 'error', advice }`；试抓 `trial` 只有状态、处理建议、条数 | `raw-errors` |
| 试抓（`trySource`、`applyStarterPack`） | `status`（五种状态）、`hint`（处理建议的键）、条数、样例 | 同上 |
| 来源行（`getSources`、`getStatus`） | 状态、处理建议、连续次数（没有 `message` / `http`） | 同上 |
| 系统检测的证据（`listToConfirm`、旧的 `listSuggestions`） | 核心 `suggestionFacts`：状态与处理建议的键、次数、原句、比例 | 记卡时写进 `raw-errors` |
| 运行的问题（`round-progress`、`getRoundState`、`getHome().lastRound`、`getPipeline().lastRound`、`getStatus().lastRound`；**`startRound` 的回答**——自检没过时 `{ started: false, problems }`，不论直接开始还是经队列 `schedule.mjs startCurrent`，以及队列自己开始的 `startRoundIn`（precheck fix 1）） | `{ code, connectionCode?, node? }` | 同上 |
| 测试连接（`probeConnection`、`getConnections().probes`） | `{ ok, latencyMs, model, code? }`：失败只给 `code`（页面用 `CONNECTIONS.codes` 说），不带 `detail`（precheck fix 11） | 同上 |
| 主 Agent 的对话记录（`getAgentTranscript`；`agentSend` 的回答） | 没能生成的提议、连接失败、会话接不上的那几行是界面词（核心 `publicRow`：动作名 · 失败类别，「连接出了问题：网络连不上…」）；`data` 只有页面要说的键（`dropped: [{ index, category }]`、`error` = 连接的 code、`session`），没有 kind 名与原文（precheck fix 2） | 同上（核心 `agentTurn` 的 `ctx.rawError`） |
| 交由主 Agent 分析 / 生成修改提议（`actOnSuggestion`、`acceptSuggestion`） | 那一回有回答了才记「已转交」；连接失败 → `{ done: false, status: 'open', failure: { category: 'connection', code } }`，提议仍待确认、可再点（precheck fix 6） | 同上 |

`raw-errors.mjs createRawErrors`：每条原文一行进应用日志（`raw error: <时间> <哪儿>: code … · HTTP … · 原文`），最近 `RAW_ERRORS_MAX` = 50 条留在内存里，「复制诊断信息」（设置 → 关于 → 高级）多一段「the last n raw errors」把它们列出（同一条不重复）；整段诊断信息照旧去掉 key（`diagnostics.mjs`），所以即使原文里混进了 key 也带不出去。页面上的 `({code})` 三处（问题卡、运行漏斗、资料库）属 R5b；本包保证数据层给得出界面化的说法。

**主 Agent 只用界面词**（N11，core-api 5.15.3 / 5.15.9）：系统提示带统一用词表与按钮原文；局面摘要、只读查询、转交的那段话全是界面词，不再交原始报错。

**测试**：核心 `core/test/r5a.test.mjs`；桌面 `test/services-r5a.test.mjs`（真库、真的 proposals / agent / pipeline / schedule 服务，核心的脚本连接，本机假服务器）；`r5a-*` 变异体在两个 `scripts/mutation-check.mjs`。因本包改的旧测试都注明「redesign R5a」与原因。

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
  styles/           app.css（@import 列表）· interim.css（重设计 R1：旧 --st- 名指到模板变量，过渡）· base.css · kit.css · menu.css · screens/<屏幕>.css · template-app.css（应用对模板的一层覆盖）
  template/         重设计 R1：设计目录里模板的样式表、图标数据、流息的标，原样（manifest.json 是 sha256 清单）
```

> **重设计 R1（11-11）**：左栏、右栏、库页头与标签（四个，概览已删）、库架改用模板部件，见 §4.13；下面是 v2 包 F 的原写法。

**界面结构（v2 包 F，11-05：方案 B；设计稿 `docs/design/v2/streams-v2-design.html` 的导航、P1、P3–P7、P9）**

- **左栏不随库变**（`kit/sidebar.js AppSidebar`）：品牌「流 · 流息 · STREAMS」→「库架」`a[data-nav="shelf"]` →「和主 Agent 聊」`a[data-nav="chat"]`（角标 `[data-badge="chat"]` = 待定的提议卡数 `listProposals({ status: 'pending' })` + 未处理的建议卡数——桥上有 `listSuggestions` 才数，包 C / G 接线前是 0；两者都 0 不画；`proposals-changed`、主 Agent 一轮结束（`agent-changed` done）与页面上处理了建议卡（`streams-suggestions-changed`，§4.8）时重读：`lib/libraries.js useWaiting`）→ 小标题「我的库」→ 每个登记的库一行 `a[data-library-row=<id>]`（库的图标方块 `LibraryMark`、名字、待看数 `[data-library-badge]`、有问题时一个琥珀小点 `[data-problem=missing|sources|no-output]`；`data-active` = 是不是当前库；在它的库页上时 `aria-current="page"`，画成白卡片）→「+ 新建库」`[data-action="add-library"]` →（v2 包 M）当前连接的套餐余量或 API 余额 `[data-part="quota"]`（§4.11；没有就整块不画）→ 底部「设置」。v1.0 的九个入口（今日、待看、资料库、图谱、问库、流水线、来源与主题、运行状态）没有了，全在库页里。
- **库的列表**（`lib/libraries.js useLibraries`，`app.js` 放进 `useApp().libraries`）：`listLibraries` 与 `getLibrariesOverview` 按 id 合成一行；`libraries-changed`、`library-changed` 与一轮结束（`round-progress` 带 `done: true`，哪个库的都算；包 J1 补：否则库架卡片的「上次更新」与琥珀小点要等别的事件才变，`test/ui-shelf-after-round.test.mjs`）时整份重读；`inbox-changed { libraryId, count }` **只改那一行的 `inbox`**（别的库的事件不碰这一行；没带 libraryId 的事件 → 整份重读）。左栏、库架、库头都读它。
- **点一个库**（`app.js openLibrary`）：不是当前库 → `setActiveLibrary(id)`（失败 = 文件夹不在：留在原处、列表重读）→ 回到这个库上次停的那一页；第一次开 → 它的「待看」（`LIBRARY_FIRST_SCREEN`，设计稿 UC2）。应用启动停在当前库的「概览」（`FIRST_SCREEN`；v1.0 启动在今日）。
- **每个库各自记住**（内存，`app.js memory`）：`routes`：库 id → 最后停的路由（标签与参数，例如资料库的图谱视图）；`scroll`：「库 id:屏」→ 主体（`.st-main__body`）滚到哪。回到那一屏、它有了数据之后放回去；之后才长出来的部分（来源与要求的「要求」「关卡」各自读数据）每 100 ms 再放一次，直到放到、且主体里没有 `data-state="loading"` 的部分（最多 3 秒），这期间的滚动不算你的。换库时库页整个重新挂（`key` 带库 id），上一个库的东西不会留在页面上。
- **库页**（`screens/library-frame.js LibraryFrame`）：一张卡片——库头 `[data-part="library-head"]`（图标方块、名字 `h1#lib-head-name`、「在追：…」`[data-part="tracking"]` = 要求的第一句，没有要求就是主题名，都没有就「还没写要求，也还没有主题」；右边是这一屏的按钮，如概览的「下次运行 · 连接」与「现在跑一轮」、来源与要求的「贴一个链接进待看」「加来源」、资料库的「编辑」「用 Obsidian 打开」「打开原文」）→ 五个标签（`kit/library-sections.js LibrarySections layout="tabs"`：`nav.st-lib-tabs button[data-tab=<id>][aria-current]`，待看带这个库的数 `[data-tab-badge="inbox"]`，问库是对话气泡图标）→ 屏本身（`Main` 照旧带 `data-screen` / `data-state`）。**v2 包 L**：右栏不在卡片里了，是整个窗口的第三栏（四个标签，§4.12）；屏原来的右栏内容是它的「详情」。各屏原来的顶栏留作库页里的一行小标题（`h2`），按钮挪到库头。
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

> **重设计 R1（11-11）起，下面这段 K2 的主题写法已被取代**：主题直接用模板的样式表，四套、默认研究对话、tokens.css 已删，见 §4.13。

**主题**（**v2 包 K2，11-10 起**；维护者 11-10 #6「定」与「K1 设计稿的四件事」；契约 `docs/checks/2026-11-10-wp-k2/contract.md`；token 表 `docs/tokens.md`）：三套主题——**精密国际主义 `precision`（默认）· 澄明玻璃 `glass` · 研究对话 `research`**（英文版：Precision · Clear Glass · Research），每套有浅色、深色——加一个**外观**设置：浅色 `light` · 深色 `dark` · 跟随系统 `system`（默认）。v1.0 的河蓝 · 素灰 · 夜间换掉了。设计依据是 K1 设计稿 `docs/design/next/themes/`（第五节 token 映射、第六节对比度、第九节 K2 清单）；本包只换外观，界面的结构没动（右栏四个标签、资料库两栏、排队的说法是包 L）。
- **设置**：`settings.json` 的 `theme`（三个 id 之一，别的 = 默认）和 `appearance`（三个之一，别的 = 默认）；两个默认只在 `src/main/theme.mjs` 的 `DEFAULT_THEME` / `DEFAULT_APPEARANCE` 各一处。id、外观、六组的窗口底色（`THEME_PAGE`，= 各组 `--st-page`）在 `src/shared/themes.mjs`（主进程和设置页都读）。
- **旧设置的迁移**（维护者 定的表；读设置时做，`theme.mjs migrateLook`，`settings.mjs readSettings` 调它）：没有 `theme` / `river` / 别的值 → `precision` + `system`；`paper` → `precision` + `light`；`night` → `precision` + `dark`。只动这两个字段，别的设置原样；下一次写设置（任何一项）就把新的两个字段存进文件。新的 id 照读，外观照它写的（不对就默认）。
- **生效的那组** = 主题 + 现在的浅 / 深：外观选浅色、深色就是它；选跟随系统就是 Windows 现在用的（`nativeTheme.themeSource = 'system'` 后的 `nativeTheme.shouldUseDarkColors`；`theme.mjs resolveAppearance`）。主进程 `main.mjs currentLook()` 给出 `{ theme, appearance, scheme }`，主窗口、阅读窗口、发出的 index.html 都从它取。
- **第一帧就是生效的那组**：开窗口时 `backgroundColor` 取那一组的 `--st-page`（`windowColour(theme, scheme)`）；`app://ui/index.html` 由 `protocol.mjs` 每次在 `<html>` 上加 `data-theme="<id>" data-appearance="light|dark"` 再发出（`theme.mjs withTheme`，两个值都先过名单，别的写不进页面）；`nativeTheme.themeSource` 在开窗口前就设好（= 外观设置：`light` / `dark` / `system`）。阅读窗口的两张页（`reader.mjs`）也带这两个属性，窗口底色同理。
- **换**：设置「外观与语言」一组——「主题」三张卡（`[data-part="theme"] [data-theme-card=<id>][data-checked]`，卡里一张用那一套自己的 token 画的小缩略图——卡本身带 `data-theme` 和生效的 `data-appearance`；默认那张标「默认」，名字照字典）、「外观」三段（`[data-part="appearance"] [data-appearance-choice=light|dark|system][data-checked]`）。点了 → `setTheme(id)` / `setAppearance(a)` 写设置、主进程改 `themeSource`、每个窗口的底色、阅读窗口的页（`reader.restyle()`），发 `settings-changed`；回答是 `{ theme, appearance, scheme }`，页面马上把 `<html data-theme>`、`data-appearance` 换掉，`app.js` 之后按 `getAppState()` 的 `theme` / `scheme` 保持一致。
- **跟随系统实时变**：`main.mjs` 听 `nativeTheme` 的 `updated`：生效的浅 / 深变了 → 每个窗口的底色、阅读窗口的页重画，发 `settings-changed`（页面重读应用状态，`scheme` 变了，`<html data-appearance>` 跟着换）。外观固定为浅色 / 深色时这个信号不改任何东西。测试（`test/ui-theme.test.mjs`）不碰 Windows 的设置，在主进程里给 `shouldUseDarkColors` 一个值再发 `updated`，和 Electron 通知应用的方式一样。
- **样式**：`tokens.css` 由 `scripts/gen-tokens.mjs` 从 K1 的 `tools/tokens-data.mjs` **生成**（别手改；`--check` 核一致），七块：`:root` 是六组共用的值，然后每套主题的浅色 `[data-theme="<id>"]`（精密国际主义的也是 `:root`）与深色 `[data-theme="<id>"][data-appearance="dark"]`，每块写全、写 `color-scheme`。组件只有一套（`styles/kit.css` 与各屏的样式），照 K1 设计稿的 `css/app.css` 改：主区直接铺在 `--st-page` 上（不再有带边框的白框，左栏右边没有 12px 间距），卡片 = `--st-surface` + `--st-shadow-card`、不描边，按钮 = `--st-surface-2` 不描边、主按钮强调色，当前的东西 = `--st-selected`；三套的差别全在 token（颜色、圆角、阴影、字重、图标线头）上，只有各套自己的选中记号（精密国际主义左边 3px 定位条与虚线焦点框、澄明玻璃的渐变光与胶囊次要按钮、研究对话右上角的书签与下划线安静按钮）写在 `kit.css` 最后一节，颜色也只用 token。
- **字体**（维护者 11-10：Noto Sans SC，取代 11-02 的 Microsoft YaHei UI）：`src/renderer/fonts/NotoSansSC-VF.ttf`（可变字体 17.8 MB，从 K1 的原样副本复制、逐字节相同）+ `OFL-NotoSansSC.txt`；`styles/fonts.css` 的 `@font-face` 经 app://（`protocol.mjs` 发 `font/ttf`，CSP 的 `font-src 'self'`）加载，族名照 K1 叫 `'Streams Noto Sans SC'`；数字走本机等宽字（`'Streams Numerals'`，只 `local()`），`--st-font` 依次是这两个、`sans-serif`。许可证页多一行「Noto Sans SC · <版本，读字体文件自己的 name 表> · OFL-1.1」并在表下贴 OFL 全文（`licenses.mjs`）；安装包带字体与 OFL（`installer/build-installer.mjs` 核两个文件都在、`installer/notices.mjs` 的第 6 节写进 `THIRD-PARTY-NOTICES.txt`）。阅读窗口的页是不加载任何东西的 data: 页，字体退到系统的无衬线字。
- 左下角余量（包 M）照 K1 画成小卡：标题与「截至 …」、每个窗口一行（多长 · 一条进度 · 百分比，下面「… 重置」），余额一行大数字；读不到 / 没有接口都**整块不画**（维护者 11-10「K1 设计稿的四件事」4，包 M 本来就这样）。
- 截图：`node scripts/shots-k2.mjs`（真窗口，主题与外观先写进 settings.json 再起，拍库架、和主 Agent 聊（带提议卡）、待看、资料库、问库、设置六个画面与阅读窗口，每张都核字体已加载）→ `docs/shots/2026-11-10-k2/<画面>-<主题>-<外观>.png`（36 张）与 `reader-<主题>-<外观>.png`（6 张）。v1.0 的 `npm run shots:themes`（`docs/shots/themes/`）是旧三套的记录，不再更新。

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
| `services-quota.test.mjs`（v2 包 M） | 左下角余量服务（§4.11）：`getQuota` 只给当前连接的、过白名单；Claude Code 每次调用带来的（连接服务的 `onQuota`）记下并发 `quota-changed`；Codex 启动时、每 10 分钟、每轮后读，API 启动时与每轮后读，只在它是当前连接时读；没有余额接口的厂商、换了厂商 → `null`；读失败 → 清掉并发事件；开发文件；不写盘（服务里没有写文件的调用，跑完应用数据文件夹一个文件都没多）；`main.mjs` 接线、桥与事件表 | 否 |
| `ui-quota.test.mjs`（v2 包 M） | 真窗口里左下角「设置」上面那块：有数（Claude Code 两个窗口两行、Codex 一行；API 余额那一行在 `quotaView` 上核；字照中文表）、读不到（没选连接 / 没读到）与没有接口（API 选了 Anthropic）整块不画；`quota-changed` 后重读；可见字过 wording 的 `scanStrings`、没有品牌词；给了 `STREAMS_QUOTA_SHOTS=<绝对路径的文件夹>` 时窗口显示出来（隐藏的窗口不出帧），每种状态把左栏截一张图存在那里（平常跑测试不开窗口、不截图） | 是 |
| `protocol.test.mjs` | 不起 Electron：页面文件 200；指向别的机器的写法 1 秒内 404；路径规则逐条；中文文件名；英文下 `texts/` 换 `texts-en/`；组件一览只在开发时发 | 否 |
| `bridge.test.mjs` | 预加载、主进程表、本文 §四 表三者一致；事件主题三处一致；预加载只交出一个对象；信封与错误码 | 否 |
| `layout.test.mjs` · `settings.test.mjs` · `locale.test.mjs` | 布局；settings.json 的每个字段；语言的判定与状态 | 否 |
| `kit.test.mjs` | tokens.css 与 docs/tokens.md 名单一致；三套主题的块（`:root` 定义全部、另两套只覆写 `:root` 有的名字）；别处不写颜色；五种状态各有一对 token；字体与主色是 维护者 定的 | 否 |
| `theme.test.mjs` · `licenses.test.mjs` | 三个主题 id、`DEFAULT_THEME` 只定义一处；三套的 `color-scheme`、窗口底色与 `--st-page` 一致；契约的十二组字 / 底对比度（素灰、夜间 ≥ 4.5；河蓝两组照旧不到，列在 `RIVER_BELOW`）；index.html 发出时带 `data-theme`；docs/tokens.md 三栏值与 tokens.css 一致。许可证：开发时读仓库的 LICENSE、装好的布局读应用里那份、五个组件、第三方声明只在装好的应用里有 | 否 |
| `ui-theme.test.mjs` | 设置里是夜间时第一帧：发出的 index.html 带 `data-theme="night"`、页面底色、窗口底色、`nativeTheme`；选素灰马上换、写进设置、原生一侧跟着；不认识的 id → `bad_arguments` 不写盘；关掉再开还是素灰 | 是 |
| `ui-setup-record.test.mjs` · `ui-first-run.test.mjs` | 首次设置六步的记录（读 `streams.json`）：选的 / 写的（删了来源、加了 RSS）/ 默认（空白包原样、定时照显示）/ 跳过（连接、试跑）；往回退再走只替换那一步；没有记录的库「没有记录」。**v2 包 I 起**：首次打开 = 登记表空才进（两步侧栏）；连接一步记进 `settings.json` 的 `setupConnection` → 和主 Agent 聊的引导（三个示例只填不发：正本没多一行；跳过连接时「还没有连接」+「去设置」只说一次）→「也可以手动新建」→ 新建库四步，库登记且成为当前库，`setup` 六条、连接那条从 `setupConnection` 抄来（时间不变）；反向：有库但没有当前库（在主进程里替换 `getAppState` 的回答）→ 库架、不是首次打开；记录显示在来源与要求的「这个库」。**重设计 R4a**：首次打开是一屏、新建库是一页表单（§4.16）：两个文件按它们重写，首次打开两步、引导作第 2 步、新建库四步的检查随之去掉；记录在建库时写（不再有「往回退」） | 是 |
| `services-new-library.test.mjs` · `ui-new-library.test.mjs`（重设计 R4a） | 新建库表单（§4.16）：默认值、文件夹、追踪要求必填、仅创建不运行、创建并运行排进运行（原因 first）、三档阈值、.md 文件夹逐字节不变、已有库原样打开、与主 Agent 建库同一份设置、六条记录；真窗口：一页与左右栏、五种抓取状态的字与「怎么办」不漏原始报错、预设来源包逐个移除、创建后去待看 | 部分 |
| `services-library-root.test.mjs` · `ui-settings-i.test.mjs`（v2 包 I） | 不起 Electron：`getLibraryRoot` 默认 / 设过；`setLibraryRoot` 拒相对路径、应用数据文件夹本身与里面（大小写不论）、不写盘；`chooseLibraryRoot` 取消 = null、钩子代替对话框；没有库时 `recordSetupStep('connection')` 写 `setupConnection`、别的步 `no_library`、坏的 `bad_arguments`；新建库抄 `setupConnection`、打开已有的库不抄。真窗口：设置五组的顺序与各自的部分、没有当前库的项；主 Agent 状态（一轮之后变 1 轮）、打开和主 Agent 聊；新建库默认放在：默认 → 换 → 写进设置 → 恢复默认；桥上拒的路径不写盘、对话框选了应用数据里的文件夹页面说「不能用」；来源与要求「这个库」：路径、首次设置记录、重建索引、在资源管理器中显示（只记日志）、移除先问、取消不动、确认后登记没了而文件夹每个文件逐字节还在、去库架 | 部分 |
| `ui-today.test.mjs` | （加）rounds.jsonl 末尾两轮没有产出不出横幅、三轮出琥珀横幅带「看运行状态」、中间有产出就从头数 | 是（**重设计 R2 删了这个文件**：今日的四个数、来源横幅、连续无产出横幅都不存在了；漏斗与横幅的测试见 §4.14） |
| `ui-shell.test.mjs`（v2 包 F） | 三个登记的库（`seedShelf`）+ 一张待定的提议卡：左栏方案 B 的结构、每行的图标 / 名字 / 待看数（核心 `homeNumbers` 重算）/ 问题小点 / 当前库高亮、和主 Agent 聊的角标；`inbox-changed` 带 libraryId 只改那一行（另两行不动）；点库 → `libraries.json` 的当前库变、进它的待看、库头「在追」是要求的第一句；五个标签都在当前库上、资料库的图谱视图；切库再切回标签与滚动各自记住、第一次开的库停在待看；库架的卡片（与 `getLibrariesOverview` 对照）、问题一行、点卡片进库、新建卡进和主 Agent 聊、一个库都没有时的空状态（登记移除、文件不动）；来源与要求：确认提议卡后「谁定的」= 主 Agent 提的 · 你确认的，自己保存要求 → `streams.json` 与 `changes.jsonl`（`you`）、空的要求在页面就拒；本库定时与上限在这里改（`streams.json`、谁定的 = 你）、关卡在这一页；设置没有定时与上限的编辑、定时一览三行、用量合计等于核心 `usageTotal`、点名字进那个库的来源与要求 | 是 |
| `ui-agent.test.mjs`（v2 包 G） | 三个库 + 五张开发钩子出的卡 + 两张建议卡 + 113 行的旧对话 + 脚本化的主 Agent：等你定的事的数与左栏角标一致、可折叠；正本一页 100 行、加载更早的，lookup / note / summary 只一行淡字不露原文；UC1 一个问题带快捷回答（发出的是选项原文）→ 建库卡（试抓、没勾）→ 建库后左栏多一个库；四种 notice 各一句、连接问题带去设置；一轮进行中不可再发（主进程那一个方法加延迟）；建议卡交给主 Agent / 不要；提议卡不要 = declineProposal、确认连点只调一次、stale、failed、改一下；卡上没有任何开关；问库 unsure 两个按钮带对的 route、change 的「这句转给主 Agent」+ 卡 → 确认后「谁定的」、question 的回答；在页面里画出每种状态与四种建议卡 | 是 |
| `ui-licenses.test.mjs` | 许可证与致谢：全文与仓库 LICENSE 逐字一致、「由 Starry Digital 开发」、五个组件的版本、开发时「打开完整的第三方声明」不可点并写原因、桥回 `open_failed` | 是 |
| `wording.test.mjs` · `texts-en.test.mjs` | 字典过扫描器 0 命中、全角标点、别处无汉字、LF；英文表与中文表对齐、无禁词 | 否 |
| `app-id.test.mjs` · `icon.test.mjs` · `deps.test.mjs` · `start.test.mjs` | 身份值；streams.ico 的五个尺寸；五个 SVG 来源与 `docs/design/logo/source/流息/` 逐字节相同（新 logo）；重建对比要 sharp：没有就跳过并说明，**设了 `STREAMS_SHARP_DIR` 却找不到 sharp 就是失败、不跳过**；依赖钉死；`npm start` 的文件夹规矩 | 否 |
| `ui-brand.test.mjs`（新 logo） | 真窗口里左栏品牌记号的 viewBox、transform、路径数据与 `mark-black.svg` 一致、fill 是 `currentColor`、不是模板图标；四套主题 × 浅 / 深色：记号算出的 fill 与 color = 该主题的 `--ink11`（也是正文的颜色）、显示出来、13 : 9、后面没有底块 / 渐变 / 图片 / 倾斜、与左栏底色对比 ≥ 4.5 | 是 |

**每项检查都能失败**：`npm run mutants` 在临时副本上逐个故意改坏、跑对应的那条测试，要求「没改坏的副本通过、改坏的副本失败」，并核原文件字节没变：`no-node` · `csp-off` · `session-open` · `bridge-extra` · `banned-word` · `d2-unc` · `d3-emit-any-topic` · `d3-any-topic` · `d4-any-sender` · `d4-permissions-open` · `d10-any-root` · `tokens-undocumented` · `colour-outside-tokens` · `en-missing-key`。11-02 首跑：14 项里 13 项 CAUGHT；`d2-unc` 只在「冷」的时候抓得到——Windows 会把连不上的 SMB 主机 `\\192.0.2.1` 记进否定缓存几分钟，缓存热时 realpath 2 毫秒就回来，改坏的副本也过了「1 秒内 404」这条（冷时 21 秒，抓到）。这是测试判据的盲区，不是改坏项的问题；跑它前别碰那个地址。v2 包 F 加五项（11-09 跑：5 / 5 CAUGHT，原文件字节没变）：`f-sidebar-any-library`（inbox-changed 不看 libraryId，每一行都改）· `f-brief-not-yours` 与 `f-brief-not-yours-ui`（保存要求不记 you：服务层测试与界面测试各抓一次）· `f-tabs-one-memory`（停在哪个标签不按库记）· `f-scroll-one-memory`（滚动不按库记）。v2 包 G 加四项（11-09 跑：4 / 4 CAUGHT，原文件字节没变）：`g-decline-confirms`（提议卡的「不要」调 confirmProposal）· `g-send-while-busy`（一轮进行中仍可发送）· `g-unsure-yes-question`（「是，改这个库」传 question）· `g-card-press-twice`（卡上的按钮到桥回话前还能再按）；都跑 `test/ui-agent.test.mjs` 的对应一条（这几条单独跑也成立，不靠前面几条用掉的脚本回答）。副本里另加了 `core` 的联接（`scripts/lib/mirror.mjs`：主进程与测试都从仓库引核心，没有它副本起不来）。

**每项检查都能失败**：`npm run mutants` 在临时副本上逐个故意改坏、跑对应的那条测试，要求「没改坏的副本通过、改坏的副本失败」，并核原文件字节没变：`no-node` · `csp-off` · `session-open` · `bridge-extra` · `banned-word` · `d2-unc` · `d3-emit-any-topic` · `d3-any-topic` · `d4-any-sender` · `d4-permissions-open` · `d10-any-root` · `tokens-undocumented` · `colour-outside-tokens` · `en-missing-key`。11-02 首跑：14 项里 13 项 CAUGHT；`d2-unc` 只在「冷」的时候抓得到——Windows 会把连不上的 SMB 主机 `\\192.0.2.1` 记进否定缓存几分钟，缓存热时 realpath 2 毫秒就回来，改坏的副本也过了「1 秒内 404」这条（冷时 21 秒，抓到）。这是测试判据的盲区，不是改坏项的问题；跑它前别碰那个地址。v2 包 F 加五项（11-09 跑：5 / 5 CAUGHT，原文件字节没变）：`f-sidebar-any-library`（inbox-changed 不看 libraryId，每一行都改）· `f-brief-not-yours` 与 `f-brief-not-yours-ui`（保存要求不记 you：服务层测试与界面测试各抓一次）· `f-tabs-one-memory`（停在哪个标签不按库记）· `f-scroll-one-memory`（滚动不按库记）。副本里另加了 `core` 的联接（`scripts/lib/mirror.mjs`：主进程与测试都从仓库引核心，没有它副本起不来）。v2 包 H 加六项（11-09 跑：6 / 6 CAUGHT，原文件字节没变；副本的 `node_modules` 多联一个 `@mozilla/readability`）：`h-obsidian-for-caught`（抓到的条目「更多」里也有用 Obsidian 打开）· `h-default-kept`（空收藏也默认已收藏）· `h-reader-preload`（阅读窗口的正文加上应用的 preload）· `h-reader-node`（阅读窗口开 `nodeIntegration`）· `h-no-fallback`（抽不出正文时不退回原网页）· `h-ai-mark-on-all`（每张待看卡片都带「写给 AI 的话」标记）。

## 八、从云织拿了什么、没拿什么、改了什么

**拿了（改名后）**：主进程 `main.mjs` 骨架、`layout`（改成 appData + localData 两个目录）、`security`（去掉 `app://draft/` 那一道）、`protocol`、`safe-path`、`bridge` + `bridge-methods`（表只剩外壳的 10 个方法）+ `preload.cjs`、`events`（三个主题）、`secrets`（名字改成 `key-<厂商>`，加 `list()`）、`services/update` + `update-wiring`（`RELEASES_REPO` = `AsuraNale/streams`，`/STRELAUNCH`）、`services/env-proxy-fetch`、`services/notify`（改成通用的「说一句、点了去某屏」）、`diagnostics`、`log`、`quit`、`icon`、`locale`、`version`、`settings`（只剩 language / libraryPath / showDeveloperInfo）、`app-id`（`StarryDigital.Streams`，新 CLSID）；`app-services` 自己写了个最小的。页面 kit 的 frame / sidebar（重写）/ topbar / button / tabs / card / progress（去掉 core-words）/ tag / icons（加四个）/ popover / menu / dialog / index；lib 的 html / bridge / use-load / use-update / format / app-context；styles 的 base / kit（去掉研究流程、余额）/ menu / screens/settings；`screens/settings-update.js`；`index.html`、`app.js`（去掉研究屏路由与余额）。脚本 start（重写）、screenshot（重写：一张真窗口）、run-tests（无夹具）、csp、mutation-check（14 个改坏项）、build-icon 与 lib 的 paths / dev-root / temp（mkdirSync）/ close-app / remove-tree / viewer / icon（sharp 的位置可配）/ mirror（只拷 desktop/）/ world（空世界）。测试 security / protocol / layout / locale / language / app-id / icon / start / single-instance / bridge / events / deps / wording / texts-en 改到能跑，`settings-model` 换成 `settings.test`，新加 `kit.test`。

**没拿**：services/engine、registry、workbench、reading、draft、milestones、projects、new-project、project-admin、balance、usage-ledger、conversation、keycheck、signing、sandbox-check、各 wiring、home-model、reading-model、workbench-model、page-frames、folders、resources、texts 里的研究词、`data/deepseek-prices.json`；页面的研究屏、`kit/balance.js`、`kit/project-menu.js`、`kit/pipeline.js`（引用不存在的研究词与 `shared/pipelines.mjs`，删掉）、`lib/money.js`、`use-balance.js`、`cn-numerals.js`、`core-words.js`、`limit.js`、`first-run` 屏（连接流程是方案 C2，不在今天）；`scripts/test-head.mjs` 与 `lib/mirror.mjs` 的 git HEAD 镜像（它镜像的是云织的 app-core）；按工单编号命名的截图与变异脚本；研究相关的测试；`src/shared/` 里的研究模块（换成 `fetch-states.mjs`）。

**没拿**：`installer/test/`（装、升级、卸载的测试）引用云织的引擎替身、Python 与余额替身，改名后也跑不起来，11-02 验方核出 57 行源产品残留，当天删掉；安装包那一轮（11-06）按流息的安装包重写。

## 九、已知缺口与要定的事

1. 11-03 界面 A 落地：首次设置、今日（含 S13 出错卡片与 S12 对话框）、待看、设置的连接方式 / 运行 / 库三块。同日界面 B 的六屏与两个对话框落地（§五「界面 B 的屏」），九个入口没有占位页了；待看的「去调提示词」落到流水线；待看卡片「这一条的记录」（`VerdictDialog`）由 PM 集成时接。
2. `release.json` 的 `version` 写成 `1.0.0`、`pre_release: dev.0`、`app_ver_name: 流息 1.0.0-dev.0`：`version.mjs` / 更新比较只认 `major.minor.patch` 数字，`1.0.0-dev.0` 填进 `version` 会让应用显示 0.0.0、安装包构建拒绝。要不要改 `VERSION_RE` 以认预发布号，归 PM。
3. ~~图标是 15 分钟内的记号（三条白色波浪 + river 圆角方块）；小尺寸由大图缩下来，没有像素级手画版~~ 11-12 换成赞妮的定稿「五流」（§4.18、`assets/icon/README.md`）：16 / 24 / 32 / 48 是手调的 SVG 1:1 渲染，256 由 512 缩。重建仍要 sharp（不是本仓依赖）。
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
