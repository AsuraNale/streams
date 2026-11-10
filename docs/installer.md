# Windows 安装包与自动更新（installer/）

> 2026-11-04 · 本文：一条命令怎么构建；用什么工具、为什么；构建做了什么；装好后是什么样；怎么安装、卸载（含给测试员的 SmartScreen 两步）；怎么测；自动更新怎么走；第三方许可；已知限制。
> 这套工程 11-02 从云织桌面版（`C:\Users\you\dev\yunzhi-desktop`，它的 `docs/installer.md`）复制改名而来，11-04 第一次在流息上跑通；云织那边的引擎、自带 Python、dsh、DeepSeek 余额等部分全部去掉。
> 依赖的接口：`docs/desktop.md`（§三 应用数据布局；更新服务 `desktop/src/main/services/update.mjs` 的文件头）。

## 〇、一条命令

```
node installer/build-installer.mjs
```

在仓库根目录、Windows、Node 24 下运行。产物在 `installer/dist/`（不进 git：`.gitignore` 的 `dist/`）：

| 文件 | 是什么 |
|---|---|
| `Streams-<版本>-setup.exe` | 安装包。版本取 `installer/setup/release.json` 的 `version`（现在 1.0.0），名字是它的 `output_base_filename` |
| `release-notes-<版本>.md` | 发布说明：文件名、大小、sha256（构建对刚出的文件现算）、未签名与 SmartScreen 两步、怎么核 sha256、怎么卸载。验收 V1 的自动化前置（`tests/acceptance/v01-clean-install.test.mjs`）读它 |
| `build-record.json` | 输入（Electron、Inno Setup、rcedit 的版本与 SHA256）、每项核对的结果、Streams.exe 的节对比 / 图标 / 版本信息 / fuse、安装包的大小与 SHA256 与读回的版本信息、扫描结果、发布说明的 SHA256、与上一次构建比是否逐字节相同（`previous`） |
| `stage-manifest.json` | 装进去的每个文件与它的 SHA256，以及整棵树的 `tree_sha256` |
| `stage/` | 就是安装后的文件夹 |
| `install-delete.iss` | 更新时先清掉旧版文件的清单（§七） |

第一次跑会按 manifest 下载 Inno Setup（约 14 MB，§一）、按 lock 装 rcedit；Electron 用 `installer/electron` 已核过的那份（`node installer/electron/setup_electron.mjs verify`；不在就先跑它的 `build`）。打包前可以把自己不许出现在安装包里的邮箱放进环境变量 `STREAMS_SCAN_EMAILS`（逗号分隔），扫描会一并查（§二 6）。

测试（§五；装进临时文件夹、走一遍用例 A、卸载干净；再装旧版走一遍真更新）：

```
node --test --test-concurrency=1 "installer/test/*.test.mjs"
```

## 一、工具：Inno Setup 7.1.0 + rcedit（不用 electron-builder）

| | Inno Setup 7.1.0 | electron-builder（NSIS） |
|---|---|---|
| 要下载的东西 | **一个文件** `innosetup-7.1.0-x64.exe`：GitHub 上 jrsoftware/issrc 的正式发布。核：SHA256 = GitHub 给这个发布文件的摘要；Authenticode 签名 Valid、签名者 Pyrsys B.V.（jrsoftware.org/isdl-verify.php 写明）。装好后再核 13 个编译器文件的 SHA256 | npm 上几百个包，构建时它自己再从 GitHub 下 NSIS 等 |
| 装在哪 | 便携模式装进 `installer/downloads/innosetup/7.1.0/`（git 忽略）：不写卸载项、不建开始菜单 | 仓库的 node_modules |
| 布局 | 构建脚本自己把安装后的文件夹原样摆好（stage），Inno Setup 只管压缩、安装、卸载；哪些文件进去全由脚本决定、逐个核对；不打 asar | 它接管依赖收集、裁剪、asar |
| 按用户安装 | `PrivilegesRequired=lowest`：`%LOCALAPPDATA%\Programs\Streams`、用户自己的开始菜单与桌面、`HKCU` 的卸载项 | 支持 |
| 通知要的 AppUserModelID | 快捷方式上直接写 | 自动 |
| 卸载时问「是否删除应用数据」、默认不删 | `[Code]` 十几行；`DelTree` 删链接不跟进（§四，`deltree.test.mjs` 实测） | 只有「总删 / 总不删」 |
| 中文界面 | 官方简体中文翻译，随 Inno Setup 自带 | 支持 |
| 可复现 | `[Files]` 的 `notimestamp`：同样的文件压出同样的字节（§二.1 实测两次相同） | 要另外处理时间戳 |
| 许可 | Inno Setup License（BSD 式，可商用）：`installer/downloads/innosetup/7.1.0/license.txt` | MIT |

`installer/innosetup/manifest.json` 记版本、地址、SHA256、签名者与装好后 13 个文件的 SHA256；`node installer/innosetup/setup_innosetup.mjs build | verify | lock`，`build` 遇到不一致就停，下载只认 `https://github.com/jrsoftware/issrc/releases/download/`。

**rcedit 5.0.2**：给 `Streams.exe` 换图标与版本信息（electron-packager、electron-builder 底下也是它）。npm 包 `rcedit` 只当运输工具：钉在 `installer/rcedit/package.json`（精确版本）与 `package-lock.json`，`node installer/rcedit/setup_rcedit.mjs build | verify | lock` 用 `npm ci --ignore-scripts`（只认 registry.npmjs.org、不读任何 npmrc、缓存在 `installer/downloads/npm-cache`）。只用包里的 `bin/rcedit-x64.exe`（自报 `Rcedit v2.0.0`），它**没有签名**，所以 `installer/rcedit/manifest.json` 记的 SHA256（`3e7801db…`，1,360,384 字节）连同 11 个 tarball 的 SHA256 就是钉它的东西。npm 把这个包所有版本都标成了 deprecated，二进制照常能用。

## 二、构建做了什么（`installer/build-installer.mjs`）

任何一步不过就停（退出码 1，最后一行 `STOP: …`）。

1. **Electron 44.0.0**：`setup_electron.mjs verify`（zip、`electron.exe`、`dist/` 的 73 个文件与 manifest 一致）。
2. **Inno Setup**：`setup_innosetup.mjs` 的 `ensureInnoSetup`（不在就下载、核 SHA256 与签名、便携安装；在就核 13 个文件）。
3. **rcedit**：`setup_rcedit.mjs` 的 `ensureRcedit`（不在就 `npm ci`；核 exe 的 SHA256、大小、自报版本与 11 个 tarball）。
4. **stage**（`installer/dist/stage/`，就是装好后的文件夹，§三）。只拿 git 知道的文件（已跟踪的，或新加而未忽略的）：
   - Electron 的 `dist/`，除 `resources/default_app.asar`；`electron.exe` 改名 `Streams.exe`；
   - `resources/app/`：`desktop/src`（去掉组件一览的三个文件，名单从 `desktop/src/main/protocol.mjs` 的 `DEV_ONLY` 现读）、`desktop/assets/icon/streams.ico`（只这一个，放在与开发时相对 `desktop/` 相同的位置）、仓库根的 `LICENSE`（流息自己的 MIT）、`package.json`（只留运行要的字段，`version` 写成 `release.json` 的）；`node_modules` 里只有 desktop 的依赖（先核与 `desktop/package-lock.json` 一致再拷）：v1.0 是 preact、htm 两个，v2 加了 `@mozilla/readability`（阅读模式抽正文，v2 包 H；`resources/app/node_modules/@mozilla/readability`，14 个文件）；
   - `resources/core/`：`core/src`（核心，纯 Node，无依赖；`core/package.json` 有依赖就停）与精简的 `package.json`。放在这里是因为桌面端用相对路径找核心：`desktop/src/main/core.mjs` 写的是 `../../../core/src/index.mjs`，从 `resources/app/src/main/` 往上三层正是 `resources/`。这样不用改桌面端的代码；
   - 最后 **rcedit 改 `Streams.exe` 的资源**：`--set-icon` 换成那个 `.ico`；版本字符串 CompanyName = `release.json` 的 `publisher`（Starry Data & Technology Inc.）、ProductName 与 FileDescription = `app_name`（流息）、LegalCopyright = `copyright`（`Copyright (C) 2026 Starry Data & Technology Inc.`）、OriginalFilename = `Streams.exe`、InternalName = `Streams`；FileVersion 与 ProductVersion = `version`。
5. **THIRD-PARTY-NOTICES.txt**（§六），从 stage 里的文件现生成。
6. **对 stage 的核对**（链接、相对 import、遗留物三项的函数在 `installer/stage-check.mjs`，`installer/test/stage-check.test.mjs` 用同一批函数在 stage 的副本上做反向核对）：
   - 没有任何链接（`linksIn`）；记下文件数、字节数、最长路径；
   - **我们自己的代码里每个相对 `import` 都能在 stage 里找到文件**（`relativeImportProblems`：`resources/app/src` 与 `resources/core/src` 两处；组件一览那一处除外）。核心没打进去、或少了一个文件，这一条就报出来（反向测试：删掉核心的 `errors.mjs` → 报出所有引用它的地方；删掉整个 `resources/core` → 报 `resources/core/src` 缺、`core.mjs → ../../../core/src/index.mjs` 找不到）；`resources/core/src/index.mjs` 必须在；
   - 组件一览的三个文件不在；`resources/app`、`resources/core` 里没有测试、样例、fixtures、开发脚本（`developmentLeftovers`）；
   - **`Streams.exe` 是钉死的 `electron.exe` 只改了资源节**：先核 `electron.exe` 本身的 SHA256 与 manifest 一致，再读两边的 PE 节表（`installer/exe-resources.mjs`），15 个节里除 `.rsrc` 外 14 个逐字节相同；`.rsrc` 里只有一个图标组、解出来与 `.ico` 的五张图（16、24、32、48、256）逐字节对上；版本信息按 Windows 的读法（PowerShell `FileVersionInfo`）与写进去的八项逐项相同；fuse 表原样记进记录；Electron 其余 71 个文件与 dist 逐字节相同；
   - `resources/app/package.json` 的版本是 `release.json` 的；
   - **扫描**（`installer/scan.mjs`）：API key 的样子（`sk-` 加 32 位十六进制，或本仓库测试 key 的写法）、本机的用户文件夹名与计算机名、git 的提交邮箱（仓库与全局）与 `STREAMS_SCAN_EMAILS` 里的地址、开发数据文件夹的名字、开发用的文件，一处也不许有。放行名单 `ALLOWED_HITS` 现在是空的。
7. **stage 的文件清单** `stage-manifest.json`（上一次的在时打印两次之间变了哪些文件）；更新用的清理清单 `install-delete.iss`（§七）。
8. **ISCC** 编译 `installer/setup/streams.iss`（脚本经标准输入给 ISCC，按 UTF-8 读；所有值由构建以 `-D` 传入：版本、名字、发布者、版权行、GUID、AppUserModelID、通知激活器 CLSID、图标、清理清单，来源是 `release.json`、`desktop/src/main/app-id.mjs`、`icon.mjs`）。`lzma2/max`、整体压缩。编译完**读回安装程序自己的版本信息核一遍**：CompanyName、ProductName、FileDescription = `app_ver_name`、ProductVersion `1.0.0`、FileVersion `1.0.0.0`、LegalCopyright（Inno Setup 把 `(C)` 写成 `©`，按它的写法比）。
9. **记录**：`build-record.json`；**发布说明** `release-notes-<版本>.md`，写完再读一遍、核里面有这个 sha256。

只给更新测试用的两个构建变量（应用从不读它们）：`STREAMS_INSTALLER_VERSION=<x.y.z>` 用同一份源码、同一个脚本构建另一个版本号（`release.json` 本身不改：`version`、`output_base_filename`、`app_ver_name` 只在这一次替换），`STREAMS_INSTALLER_OUT=<绝对路径>` 让这次构建写的所有东西都去那里而不是 `installer/dist`。`upgrade.test.mjs` 用它们造 0.9.0。**v2 包 J2** 加第三个：`STREAMS_INSTALLER_APP_REF=<提交>` 让应用的源码（`desktop/src`、`desktop/package.json` 与它的 lock、图标、`LICENSE`、`core/src`、`core/package.json`）取那个提交里 git 存的样子（`git ls-tree` / `git cat-file`），不取工作区；npm 包仍从 `desktop/node_modules` 拷，版本必须是那个提交的 lock 写的；Electron、rcedit、Inno Setup、`streams.iss` 都是当前的。只许与前两个一起用（不给就停：`installer/dist` 永远是工作区的应用），`build-record.json` 的 `from.app_ref` 记下是哪个提交。`upgrade.test.mjs` 用它把 0.9.0 造成 **v1.0 自己的应用**（v2 包 A 之前那个提交），这样更新测的是 v1.0 → v2，旧版留下的是 v1.0 的数据（§七）。

### 2.1 结果

见 §十（每次构建与测试的数字）。

## 三、装好后是什么样

```
%LOCALAPPDATA%\Programs\Streams\        （默认；用户可改）
  Streams.exe                           Electron 44.0.0 的 electron.exe，改了名字（app.isPackaged 由此为真），rcedit 换上流息的图标与版本信息（只有 .rsrc 节不同）
  *.dll *.pak *.bin *.dat locales\ …    Electron 的其余文件（不含 resources\default_app.asar）
  LICENSE  LICENSES.chromium.html       Electron 与 Chromium 的许可
  THIRD-PARTY-NOTICES.txt               §六
  unins000.exe  unins000.dat            卸载程序（安装时生成）
  resources\
    app\                                桌面端：package.json（1.0.0）、LICENSE（流息的 MIT）、src\、assets\icon\streams.ico、node_modules\{preact, htm, @mozilla\readability}
    core\                               核心：package.json、src\（desktop 的 src\main\core.mjs 经 ../../../core/src/ 找到它）
```

- **路径怎么取**：桌面端没有为打包改代码。`main.mjs` 的页面、预加载、图标都按自己所在的文件夹算（`resources\app\src\…`）；核心按相对路径（上面）；preact、htm 由 `protocol.mjs` 从 `resources\app\node_modules` 发给页面；`@mozilla/readability` 的 `Readability.js` 由主进程（`src/main/reader.mjs`）从同一个 `node_modules` 读，交给阅读窗口的隐藏抽取窗口（docs/desktop.md §4.9）。
- **数据放哪**（`desktop/src/main/layout.mjs`，没改）：应用数据 `%APPDATA%\Streams`（设置、加密的 API key、日志、Chromium 的数据、`updates\`；v2 起还有库登记表 `libraries.json`、提议卡记录、主 Agent 的 `agent\`），本地数据 `%LOCALAPPDATA%\Streams`（缓存）；库在用户选的文件夹里，登记在 `libraries.json`（v1.0 是 `settings.json` 的 `libraryPath`；v2 第一次启动时从它迁移，docs/desktop.md §4.4）。
- **开发用的开关**：打包态一律不认（`STREAMS_*` 全部由 `app.isPackaged` 挡住；安装测试里每个都设成陷阱、一个也没生效，§五）。开发者工具关着（`devTools: !app.isPackaged`），菜单为空，组件一览的文件不在。
- **AppUserModelID 与通知激活器 CLSID**：`StarryDigital.Streams` 与 `{10309C50-6EBE-4E03-AB99-FF685983103D}`（`desktop/src/main/app-id.mjs`，与安装包写进两个快捷方式的是同一对）。安装程序装完把快捷方式上的 ID 改写成 Electron 认的 VT_LPWSTR 型（Inno Setup 写的是 VT_BSTR），另在 `HKCU\Software\Classes\CLSID\{10309C50-…}` 写下与 Electron 同键同值的通知激活器注册，卸载时整个键删掉。为什么要这样：Electron 44 在一次运行里第一次用到通知时，会核开始菜单里以产品名命名的快捷方式，有一样不对就整个重写（不带图标），并每次写这个注册表键（云织 `docs/installer.md` §九 12 查过源码与实测）。
- **图标**：一个文件 `resources\app\assets\icon\streams.ico`，用在窗口与任务栏（`main.mjs`）、托盘、`Streams.exe` 自己的资源、安装程序（`SetupIconFile`）、卸载项与两个快捷方式。
- **fuses**：一个都没动（`Streams.exe` 与 `electron.exe` 除 `.rsrc` 外逐节相同）。`RunAsNode` 开着（流息不用它，但关掉要改 exe 的字节、引入 `@electron/fuses`）；`EnableNodeCliInspectArguments` 开着，打包后的测试要用 `--inspect-brk`（§五）。
- **发布者与版权行**：发布者 `Starry Data & Technology Inc.`；版权行只写在 `release.json` 的 `copyright` 一处，`Streams.exe` 与安装程序都取它。仓库代码的许可是根目录 `LICENSE`（MIT）。

## 四、安装与卸载

**给测试员**：双击 `Streams-1.0.0-setup.exe`。这一版**未签名**，Windows 会弹蓝色的「Windows 已保护你的电脑」（SmartScreen，「未知发布者」）：

1. 点「**更多信息**」；
2. 再点「**仍要运行**」。

安装不要管理员权限，安装本身不联网。装完开始菜单和桌面上有「流息」。卸载：「设置 → 应用 → 已安装的应用」里找「流息 1.0.0-dev.0」（`release.json` 的 `app_ver_name`）→ 卸载。下载后可以先核 sha256（发布说明里有）：`Get-FileHash .\Streams-1.0.0-setup.exe -Algorithm SHA256`。

- 安装：按用户装，默认 `%LOCALAPPDATA%\Programs\Streams`，可以改；开始菜单「流息」，桌面「流息」（可以不勾）；装完可以直接打开。只装 x64（Windows 10 1809 及以上）。
- 卸载：只删安装时放进去的文件、两个快捷方式、卸载项、通知激活器的注册表键。**不删库**。最后问一句「是否同时删除流息的应用数据？」（API key、设置、缓存），**默认「否」**；选「是」才删 `%APPDATA%\Streams` 与 `%LOCALAPPDATA%\Streams`（`DelTree`：遇到链接只删链接本身，不跟进 —— `installer/test/deltree.test.mjs` 用钉死的 Inno Setup 实测）。应用开着时，安装 / 卸载程序会提示先关（Restart Manager）。
- 静默（测试 / 管理员）：`Streams-1.0.0-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART [/DIR=…] [/MERGETASKS="!desktopicon"]`；卸载 `"%LOCALAPPDATA%\Programs\Streams\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`（静默卸载取默认：保留应用数据；卸载程序先把自己拷到 TEMP 再运行，命令会先返回）。

## 五、怎么测（`installer/test/`）

`node --test --test-concurrency=1 "installer/test/*.test.mjs"`，构建之后跑。七个测试文件、五个共用模块：

| 文件 | 核什么 | 会安装吗 |
|---|---|---|
| `packaged.test.mjs` | 真安装包：装、用例 A、退出、卸载（下表） | 是（流息的身份） |
| `upgrade.test.mjs` | 真更新：装 0.9.0（v1.0 的应用）、应用里检查 → 下载 → 更新到 1.0.0（当前构建）；v1.0 的数据被 v2 迁移（§七） | 是（流息的身份） |
| `stage-check.test.mjs` | 构建的 stage 核对函数与扫描在 stage 的副本上：原样通过；删掉核心的一个文件、删掉整个核心、放进测试文件 / fixtures / 开发脚本、放一个链接、放本机用户路径 / key / 提交邮箱，各自被报出 | 否 |
| `install-delete.test.mjs` | 更新时的清理 `[InstallDelete]`：真的 `streams.iss` 与真的清单生成器，对着六个文件的小 stage 编译，用**测试自己的身份**真装三次（第一次装不删；装在自己的旧版上删旧版文件、留用户的文件；装进别人的文件夹不删） | 是（测试身份） |
| `uninstall-entry.test.mjs` | 更新后卸载项的版本号：9.0.0 → 9.0.1 → 9.1.0（其中一个故意不写卸载项）依次覆盖，卸载项总是最后那一版；另一个文件夹的不碰 | 是（测试身份） |
| `wait-pid.test.mjs` | 更新的握手：`/STWAITPID` 给了、没给、不合法、进程已不在、超时，安装日志里各一行（§七） | 是（测试身份） |
| `deltree.test.mjs` | 卸载时删应用数据用的 `DelTree` 不跟进链接 | 否（一次性安装程序，什么也不装） |
| `harness.mjs` · `machine.mjs` · `world.mjs` · `github-standin.mjs` · `use-case-a.mjs` | 共用：起装好的应用；读注册表、快捷方式、进程；测试的世界（本机假 RSS —— v2 包 J2 起每条的页面是一篇够长的文章，带菜单与一段脚本，给阅读窗口用 —— 代理陷阱、应用的环境）；GitHub 的替身；用例 A 的几步（`firstRunToInbox` 是 v2 的路，`v1FirstRunToInbox` 是 v1.0 的首次设置，只给更新测试的 0.9.0 用） | — |

**打包后的应用不认任何开发开关**，所以不能像桌面端的测试那样用环境变量指挥它。`harness.mjs` 用 `--inspect-brk` 起 `Streams.exe`，停在应用第一行之前，只改**周围的环境**，全经 Electron 与 Node 的公开对象，应用的代码一行不改：

- 用户数据放哪：`app.setPath('appData')` 与 `LOCALAPPDATA` 指到测试自己的文件夹；应用的 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`TEMP` 也都在测试文件夹里（**真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` 一律不碰**，测试前后拍照核）；系统语言答中文；
- 窗口从不显示；选文件夹的对话框答测试的空文件夹；`shell.openPath` / `openExternal` / `showItemInFolder` 只记下；
- **通知与托盘图标**换成只记录的替身：Electron 的 `Notification` 一被用到就会在开始菜单建或重写快捷方式、在 `HKCU\Software\Classes\CLSID` 注册；真的托盘图标 Windows 会记在通知区域的设置里。替身装在 Electron 取这两个类的地方（`process._linkedBinding('electron_browser_notification')` 与 `('electron_browser_tray')`），钩子随即读一次 `require('electron').Notification` / `.Tray`，不是替身就报错并结束还停在第一行的应用；
- **网络全记下**：主进程的每个请求 —— `globalThis.fetch`（核心的抓取）、`http/https.request`、`http/https.get`（更新）—— 发出前记下地址与方法，原样放行；只有更新的两个 GitHub 地址交给测试的替身（§七）；应用启动 `…\updates\Streams-<版本>-setup.exe` 时记下参数与启动方式，测试说 `run` 才真启动（这时在应用的五个参数后面加 `/LOG=…`）；
- 记下 `app.setAppUserModelId`、`app.setToastActivatorCLSID` 的参数与退出各阶段；测试碰一个文件，应用就 `app.quit()`；测试给 `slowExitMs` 时，把应用第一次的 `will-quit` 扣住那么久再 `app.quit()`（慢退出，§七）。

页面用 Playwright 经 Chromium 的远程调试口驱动（`chromium.connectOverCDP`）。**出路的陷阱**（`world.mjs` 的 `startTrap`）：应用的环境里 `HTTP_PROXY` / `HTTPS_PROXY` 指向一个什么都拒、全记下的本机代理，加 `NODE_USE_ENV_PROXY=1`（Node 自己的 fetch 也走代理），Chromium 以 `--proxy-server` 指向它；回环不走代理。漏过 harness 记录的请求会落到这里，也不会再往外走。应用的 `PATH` 只有 System32（没有 Node、Python、git、Claude Code、Codex）。**每个 `STREAMS_*` 开关都设成陷阱**（`world.mjs` 的 `trapSwitches`：数据文件夹、库、选文件夹、更新地址、更新记录文件指向空的陷阱文件夹或陷阱代理，`STREAMS_WINDOW=hidden`、`STREAMS_START_SCREEN=settings`、`STREAMS_DEV_SYSTEM_LANGUAGES=en`、`STREAMS_DEV_CONNECTION=fake`、`STREAMS_DEV_NOW=2001-02-03…`），测试逐个核没生效。

`packaged.test.mjs` 一次走完（任何一步失败，`after` 照样结束安装目录里的进程、本轮的安装还在就静默卸载、删临时文件夹，先解链接）：

| 步 | 核什么 |
|---|---|
| 0 | 守门：这台机器上没有流息的卸载项（`HKCU\…\Uninstall\{DF025A05-…}_is1`）、没有开始菜单或桌面上的「流息.lnk」、没有通知激活器的键，有一样就停（不碰真的安装）；拍下真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams`（只看名字、大小、时间） |
| 1 | 静默安装到临时文件夹：卸载项（名字 `app_ver_name`、版本、发布者、位置、图标 = 装上的 `.ico`），名字以「流息」开头的卸载项只有这一条；开始菜单与桌面两个快捷方式（目标、起始位置、图标、AppUserModelID、通知激活器 CLSID，并按 Electron 读快捷方式的方式核 VT_LPWSTR / VT_CLSID 两个类型）；通知激活器的键；装上的 `Streams.exe` 的图标组与 `.ico` 五张图逐字节对上、版本信息是 `release.json` 的且与 `build-record.json` 记的相同；安装程序的版本信息也是；**装上的每个文件与 stage 逐字节相同**（另外只有 `unins000.exe/.dat`）；没有链接；核心在；没有 `default_app.asar`、组件一览；`LICENSE`、`LICENSES.chromium.html`、`THIRD-PARTY-NOTICES.txt`、`resources\app\LICENSE`（与仓库根的逐字相同）都在 |
| 2 | 扫描安装目录与安装包本身：没有 key、提交邮箱、本机路径与计算机名、开发内容（卸载日志 `unins000.dat` 写着装到了哪里 —— 那是安装时在本机写的，只放过它的「本机路径」一类）；对照：同一扫描找得到故意放进去的 key、路径、邮箱、内容（UTF-8 与 UTF-16 各一） |
| 3 | **用例 A（v2 的路，v2 包 J2 改；docs/desktop.md §4.10）**：打包态、版本 1.0.0、资源在安装目录、没有菜单、开发者工具打不开、窗口没显示过、通知激活器 CLSID 是固定的那个；开关陷阱没生效（首屏是**首次打开**第 1 步「连接方式」、自己的侧栏两步「连接方式 · 想追踪什么」—— 不是陷阱库的概览、不是设置；中文；托盘图标经替身建了 —— `STREAMS_WINDOW=hidden` 会不建）；`getAppState().libraryCount` 是 0、`libraries.json` 里没有库。**首次打开 1 · 连接方式**：先等主进程把两种工具都探测完，三张卡都不可用（本机没有工具也没有 key；`STREAMS_DEV_CONNECTION=fake` 会让两张可用）；对照：走过这一步之前 `settings.json` 没有 `setupConnection` → 跳过 → 「和主 Agent 聊」，`setupConnection` 记 `skipped`（没有 `detail`），仍没有库。**首次打开 2 · 和主 Agent 聊的引导**：引导的话、三个示例句子与字表一致，「还没有连接，主 Agent 用不了。」在（跳过了连接），「也可以手动新建」→ **新建库**，侧栏四步「库放哪 · 主题与来源 · 试跑一轮 · 定时」。**新建库 1**：「选文件夹」→ 对话框答测试的空文件夹 →「空的」；对照：下一步之前文件夹里没有 `streams.json` → 下一步，库建在那里、**登记进 `libraries.json` 且是当前库**。**2**：选空白、加一个本机假 RSS（测试起的 `127.0.0.1` 服务器）→ 试抓 `ok`、`streams.json` 的来源正是它。**3**：页面写着没有连接 → 开始 → 跑完，三条全部进待看（不打分）。**4**：定时那屏「完成，去待看」→ 待看；定时在**库自己的 `streams.json`**（`{ enabled: true, time: '08:30' }`），`settings.json` 里没有 v1.0 的 `libraryPath` / `recentLibraries` / `schedule`；`streams.json` 的 `setup` 六条（库 chose/empty、连接 skipped —— 从 `setupConnection` 抄来、时间不变、空白包、来源 +1、试跑、定时 default）；许可证与致谢：MIT 全文与仓库的 `LICENSE` 逐字相同，部件表是 Electron、Chromium、Node.js（运行时的版本）与 Preact、htm、**`@mozilla/readability`**（版本取装好的 `resources\app\node_modules\…\package.json`），`THIRD-PARTY-NOTICES.txt` 列着 `@mozilla/readability@<那个版本>`。待看按 **C** → 库的 `notes\` 里出现一个 `.md`，**核心自己的 `validateNote` 没有问题**、来源是那张卡、`status: kept`、收藏日期是今天（不是 `STREAMS_DEV_NOW` 那天）。**左栏方案 B 与库架**：侧栏上面恰好是「库架」「和主 Agent 聊」两项，下面一行就是这个库（名字是文件夹名、当前）；点库架 → 一张卡，是这个库、当前、待看剩 2。**阅读窗口**：库架的卡 → 这个库 →「资料库」标签（已收藏，自动打开刚收藏的那条）→「打开原文」→ 阅读窗口出来、`阅读模式`（正文是那条在本机假站上的文章，载入的是阅读器自己写的 `data:` 页，没有菜单、没有 `<script>`，页面里那段脚本要请求的 `/script-ran` 假站从没收到）；两个 web contents 的参数逐项是隔离的（`sandbox`、`contextIsolation`、不开 Node 的三项、`webviewTag: false`、`webSecurity`、没有 `preload` 这个键），会话是阅读器自己的、不是应用的、不落盘，两页里都没有 `window.streams`、`require`、`process`；假站收到了这条的页面请求；`main.log` 有 `reader: <地址>: reading`；顶栏「回到条目」→ 窗口关了。**harness 记下的请求全部是去本机假 RSS 的**，代理陷阱为空，陷阱文件夹全空，没往外开任何东西。对照（同一步里、用例走完之后）：从主进程发一个 Node 的 `fetch`、一个 `https.request`、一个应用自己会话里的 `net.fetch`、一个另开的内存会话里的 `net.fetch`（地址都在 `.invalid` 下）—— 前两个 harness 记下、陷阱收到，第三个被应用的会话拒绝并记进 `main.log`，第四个陷阱收到：记录与陷阱都抓得到东西 |
| 4 | 退出（调试器全部断开，碰退出文件）：进程结束，3 秒后安装目录里没有任何进程 |
| 4b | **v2 包 J2，`Documents` 的反向**：把测试用户的 `Documents`（空的）删掉再起装好的应用：对照先核 `getPath('documents')` 在这个用户下确实抛 `Failed to get 'documents' path`；页面照样起来（库已登记：它的概览），`getLibraryRoot` 是 `{ path: <home>\Streams, isDefault: true }`，`main.log` 有 `library: the default place for a new library is … (no documents folder: …)`、没有 `start failed`；退出后安装目录里没有进程，`Documents` 再建回来 |
| 5 | 静默卸载（默认：保留应用数据）：卸载项、两个快捷方式、通知激活器的键、程序目录整个没了；测试的应用数据与库（连同那条笔记）还在；真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` 与测试前**完全一样**；再按第 0 步查一遍：没有任何流息的痕迹 |

结果写进 `installer/dist/packaged-test-result.json`（含收藏下来的那条笔记的路径与全文、harness 记下的每个请求、对照的结果）。

## 六、第三方许可

`THIRD-PARTY-NOTICES.txt` 在安装目录根上，由构建从 stage 里的文件现生成（`installer/notices.mjs`），列的正是装进去的东西：

1. MPL-2.0 与 LGPL 组件的源码在哪里（这一版没有）。
2. Electron 44.0.0（MIT 全文；Chromium 及其组件见同目录的 `LICENSES.chromium.html`）。
3. 3 个 npm 包：`@mozilla/readability` 0.6.0（Apache-2.0，v2 包 H 加的）、htm 3.1.1（Apache-2.0）、preact 10.29.8（MIT）—— 名字、版本、许可、仓库。
4. 它们自带的 LICENSE 原文。
5. 流息自己的部分：`resources\app` 与 `resources\core` 是流息的代码，MIT，`LICENSE` 全文（另见 `resources\app\LICENSE`）；由 Starry Digital 开发。

## 七、自动更新是怎么走的

应用这一半（`desktop/src/main/services/update.mjs`，文件头写全了）：

1. 用户在「设置 → 关于」点「检查更新」：一次匿名 `GET https://api.github.com/repos/AsuraNale/streams/releases/latest`（`Accept: application/vnd.github+json`、`User-Agent: Streams/<版本>`；只在用户点时问）。比 `tag_name` 与自己的版本，新的才提示；附件必须恰好叫 `Streams-<版本>-setup.exe`、带 GitHub 给的 `digest`（`sha256:…`）与 `size`，地址在 `https://github.com/AsuraNale/streams/releases/download/` 下。缺一样就只让用户去发布页手动下载。
2. 「下载」：下到 `<应用数据>\updates\`（不是程序目录），边下边算 SHA-256；大小或 SHA-256 与发布不符 → 删掉、什么也不运行（`verify_failed`）。
3. 「开始更新」：运行前再核一次大小与 SHA-256，然后以 `/SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /STRELAUNCH=1 /STWAITPID=<主进程的进程号>` 分离启动（`detached`、不接标准输入输出、不开控制台窗口），应用照常退出（约 0.3 秒后 `app.quit()`）。参数由 `setupArgs(pid)` 组：前五个不变，最后一个是握手用的 `/STWAITPID=`，值是 `process.pid`（`createUpdateService` 的 `pid` 选项，测试可给别的值）；`desktop/test/services-update.test.mjs` 逐个核参数的形状与值。
4. 下一次启动时清掉 `updates\` 里的东西。

安装程序这一半（`installer/setup/streams.iss`）：

- **握手：先等应用退出**（`[Code] WaitForTheApp`，由 `PrepareToInstall` 调用 —— 「准备安装」这一步的第一件事，早于 Restart Manager 找占着我们文件的程序（日志里的 `Calling RestartManager's RmGetList`），也早于 `[InstallDelete]` 与复制文件）：读 `/STWAITPID`，以 `SYNCHRONIZE` 打开那个进程（kernel32 的 `OpenProcess`），每 250 毫秒 `WaitForSingleObject` 一次，最多 60 秒（`#define WaitPidTimeoutMs 60000`，构建不改它）。日志里每种情况一行，都以 `Wait for the app to exit:` 开头：
  - 没有这个参数（手动双击、管理员的静默安装、旧版应用发起的更新）：`no /STWAITPID given, nothing to wait for`，什么也不等，与握手之前完全一样；
  - 值不是进程号（不是 1–10 位、不以 0 开头的数字，或大于 4294967295）：`/STWAITPID=<值> is not a process id; not waiting`；
  - 那个进程已经不在：`process <pid> is not running (it has exited already)`；
  - 等到了：`process <pid> exited after <n> ms`；
  - 超时：`process <pid> still running after <n> ms (limit 60000 ms); going on, the Restart Manager closes it` —— 安装照常往下走，由 `/CLOSEAPPLICATIONS` 的 Restart Manager 去关它，与握手之前一样。
  为什么要等：应用启动安装程序后约 0.3 秒才 `app.quit()`，退出本身（关窗口、结束 Chromium 的子进程）在忙的机器上要更久；握手之前安装程序一起来就让 Restart Manager 去关一个正在自己退出的 `Streams.exe`，11-04 审核时机器忙，更新测试就卡在这一步约 13 分钟后失败。现在 Restart Manager 动手时旧版通常已经退了，它找不到要关的程序（日志 `RestartManager found no applications using one of our files.`）。
- **同一个 AppId 覆盖安装**（`release.json` 的 `app_guid`，发出去后不能改）：沿用上次的位置与附加任务，卸载项还是那一条（值按新版本重写），快捷方式与通知激活器的键同样重写；应用数据与库不碰。
- **`[InstallDelete]` 先清掉旧版的程序文件**：构建从 stage 的顶层现生成清单（`installer/install-delete.mjs` → `installer/dist/install-delete.iss`，`#include` 进来）：顶层每个文件 `Type: files`、每个文件夹 `Type: filesandordirs`。只有当这个文件夹里有 `Streams.exe`、而且正是本应用的卸载项记的安装位置时才删（`[Code] OldCopyHere`，答案在 `ssInstall` 定一次 —— 云织当年按项现问，删到 `Yunzhi.exe` 之后后面的项全答「否」）；不碰卸载程序、不出 `{app}`、不碰用户自己放的名字。
- **`[Run]` 装完重新打开**：只在静默且带 `/STRELAUNCH=1`（应用自己发起的更新）时。
- **卸载项的版本号**：装完再读一次卸载项，指向本文件夹却不是本版本号时照 Inno Setup 的写法补写（`[Code] UninstallEntryVersion`，`uninstall-entry.test.mjs`）。

**测试 `upgrade.test.mjs`**（真更新，约 5–8 分钟）：

- 旧版本由测试自己造：`node installer/build-installer.mjs`，带 `STREAMS_INSTALLER_VERSION=0.9.0` 与 `STREAMS_INSTALLER_OUT=<本轮文件夹>`，同一个脚本，`release.json` 不改。**v2 包 J2**：再带 `STREAMS_INSTALLER_APP_REF=b3b5512…`（v2 包 A `fe66f16` 的前一个提交；`desktop/`、`core/` 与 v1.0 最后一个提交 `4d4dd53` 相同），所以 0.9.0 是 **v1.0 自己的应用**（测试核 `build-record.json` 的 `from.app_ref`，对照：0.9.0 的 stage 里没有 `@mozilla/readability`）。为什么不再用同一份源码：v1.0 → v2 的升级要看的是 v1.0 留下的数据（`settings.json` 的 `libraryPath` / `recentLibraries` / `schedule`，没有 `libraries.json`）有没有被 v2 包 A 迁移；同一份源码造的 0.9.0 一开始就写登记表，迁移就测不到了。
- 安装程序、应用、被安装程序重新打开的应用都在一个**测试自己的用户文件夹**里（`USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`TEMP`）：开跑前先问 Windows（带这几个变量）「程序」「桌面」与两个应用数据文件夹在哪，有一个不在测试文件夹里就不跑。挪不动的是 `HKCU`（卸载项与通知激活器的键是真的那两个），所以守门与 `packaged.test.mjs` 相同。
- GitHub 由 `github-standin.mjs` 扮演（本机 `127.0.0.1`）：harness 把应用对那两个地址的请求原样带路径转给它，并记下应用问的是什么 —— 打包后的应用不认 `STREAMS_DEV_UPDATE_URL`（它被设成指向代理陷阱），只能这样从环境里接管。

| 步 | 核什么 |
|---|---|
| 0 | 守门；造 0.9.0（记下 SHA256，与 1.0.0 的不同）；测试用户的文件夹解析在测试文件夹里 |
| 1 | 0.9.0 静默装进临时文件夹：卸载项 0.9.0、名字以「流息」开头的只一条；测试用户的开始菜单与桌面上有快捷方式；真的开始菜单与桌面上没有 |
| 2 | 0.9.0 第一次打开（harness）：版本 0.9.0；用例 A（v1.0 的首次设置：文件夹 → 跳过连接 → 空白包 + 本机 RSS → 试跑 → 定时）走到收藏一条；「设置 → 关于」写「流息 0.9.0（Windows 版）」，没有「开发版」；**v2 包 J2**：同一页的「定时」改成离现在 12 小时的一个时刻（不是默认的 08:30，迁移若不管它就看得出来；12 小时后也保证测试期间两个版本都不会到点跑一轮）；之后 `settings.json` 有 v1.0 的 `libraryPath`（这个库）、`recentLibraries`（含它）与 `schedule`（刚改的），对照：没有 `libraries.json`，库的 `streams.json` 里没有 `schedule` |
| 3 | **反向在前**：替身给错的 sha256 →「检查更新」→「有新版本：1.0.0」→「下载」→ `verify_failed`，`updates\` 是空的，没有启动任何东西，`main.log` 写着「did not pass the check (sha256); deleted, nothing runs」；替身改回对的 → 再检查 → 下载 → `ready`，`updates\Streams-1.0.0-setup.exe` 与 1.0.0 安装包逐字节相同；应用问的恰好是 GitHub 的两个真地址各两次（`Accept`、`User-Agent: Streams/0.9.0`），替身收到的正是这四次；除了替身与本机假 RSS 没有别的请求；代理陷阱为空（`STREAMS_DEV_UPDATE_URL` 没生效）；陷阱文件夹全空（`STREAMS_DEV_UPDATE_SETUP_RECORD` 没生效） |
| 4 | **慢退出**：harness 在这一次运行里把应用的第一次 `will-quit` 扣住 8 秒（`slowExitMs`，应用代码不改；窗口已关、`Streams.exe` 还活着、占着程序文件 —— 忙的机器上旧版退得慢的样子）。「开始更新」→ 应用启动的正是下好的那个文件，参数恰好是那五个加 `/STWAITPID=<这个 Streams.exe 的进程号>`，`detached` / `stdio: 'ignore'` / `windowsHide`；之后有 `before-quit`、`will-quit`、`exit`，进程在启动安装程序之后至少 7 秒才结束。安装程序跑完、卸载项变成 1.0.0、流息从安装目录重新起来（它的 `main.log` 有起动时看 `updates\` 的那一行），随即被结束（它没有 harness，窗口在屏幕上）；从「开始更新」到这里不到 2 分钟 |
| 5 | 程序目录与 1.0.0 的 stage 逐个文件对上（另外只有 `unins000.*`）；名字以「流息」开头的卸载项只一条，`DisplayVersion` 1.0.0、`MajorVersion` 1；两个快捷方式还指向 `Streams.exe`；安装日志：恰好一行 `Wait for the app to exit: process <那个进程号> exited after <n> ms`，n 至少 4 秒，在 `Calling RestartManager's RmGetList` 与 `Starting the installation process` 之前，没有 `RestartManager found an application using one of our files`；旧版文件先删了（答案 1）、装完重新打开了（1）、卸载项是这一版 |
| 6 | 再起一次（harness）：打包态、1.0.0；**v2 包 J2，v1.0 数据的迁移**（迁移发生在安装程序重新打开的那个 1.0.0 —— v2 的第一次启动）：`libraries.json` 建出来了（`streams.libraries/1`），里面恰好是 v1.0 那个库（路径、名字「我的库」）且是当前库，`main.log` 有 `library: the registry made from settings.json: 1 libraries, current …`；首屏是这个库的**概览**、侧栏（方案 B）那一行就是它且是当前的；库架上一张卡，是它、当前；定时**搬进了库的 `streams.json`**（正是第 2 步改的那个时刻），`getSchedule` 答的也是它；`settings.json` 的 `libraryPath`、`recentLibraries`、`schedule` 与 0.9.0 留下的完全相同（只读未写）；「关于」写 1.0.0；那条笔记逐字节还在、库的索引里有它；`updates\` 空了；起动时没有问 GitHub；整轮代理陷阱为空、陷阱文件夹全空 |
| 7 | 静默卸载：卸载项、程序文件、快捷方式、通知激活器的键都没了；应用数据与库还在；真的机器上没有任何流息的痕迹，真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` 与测试前相同 |

结果写进 `installer/dist/upgrade-test-result.json`。

**握手的各种情况 `wait-pid.test.mjs`**（约 20 秒，任何机器）：真的 `streams.iss` 对着一个小 stage 编译（测试自己的身份，与 `install-delete.test.mjs` 同一套隔离与清理；另编一份 `WaitPidTimeoutMs=2000` 的看超时），每次带应用的开关（`/SILENT` 换成 `/VERYSILENT`、不带 `/STRELAUNCH`）静默装进本轮文件夹，用测试自己起的、会多活几秒的进程（`node -e "setTimeout(…)"`）：A 给它的进程号 → `exited after <n> ms`、n ≥ 3 秒、在开始安装之前，装好了；B **反向**：同样一个活着的慢进程、不给参数 → 只有 `no /STWAITPID given`，没有 `exited after`，安装程序跑完时那个进程还活着（没等它）；C `/STWAITPID=12ab`、`/STWAITPID=0` → `is not a process id`；D 一个已经退出的进程号 → `is not running`；E 2 秒上限、活 8 秒的进程 → `still running after <n> ms (limit 2000 ms)`，安装照常完成。收尾卸载。

## 八、已知限制

1. **没有签名**：安装包与 `Streams.exe` 都是「未知发布者」，SmartScreen 会拦（§四 的两步）。应用自己下载的更新包没有「来自网络」标记、经 `CreateProcess` 启动，SmartScreen 不拦；用户从浏览器下载时照旧会拦。没有签名也意味着：更新包是否可信全靠 GitHub API 经 HTTPS 给的 `digest`（能改发布的人也能改 digest）。
2. **只有 Windows x64**。安装包约 111 MiB，装好约 368 MiB、449 个文件（另加卸载程序的 2 个），几乎全是 Electron。
3. **会安装的两个测试要一台没有真安装的机器（或 Windows 用户）**：守门见到流息的卸载项、快捷方式或通知激活器的键就拒跑，也不许为了跑测试去动真安装。`install-delete`、`uninstall-entry`、`wait-pid` 用测试自己的身份，不受这一条限制。
4. **测试写真 `HKCU`**：卸载项与通知激活器的键是真的两个（Windows 不让环境变量挪 `HKCU`）；每个会安装的测试结束时卸载、`after` 里无论成败再补一次。测试被强行中断在收尾之前，这两个键可能留下：下一次守门会因此拒跑；跑那一轮临时文件夹里的 `unins000.exe`，或手动删这两个键。另：从某些桌面应用（如 Claude 桌面版）的工具 shell 里跑时，进程可能看到的是该应用的私有注册表视图（云织 `docs/installer.md` 11.6 查到过）—— 测试的写与读在同一个视图里，自身一致；要确认真注册表要从资源管理器起的进程去读。
5. **真更新测试里，被安装程序重新打开的流息没有 harness**：它的窗口与托盘图标会出现在屏幕上几秒（测试随即结束它）；Windows 可能把这个托盘图标记在通知区域的设置里（`HKCU\Control Panel\NotifyIconSettings`，按程序路径，指向已删的测试文件夹）。
6. **packaged 测试的安装用的是真的用户文件夹**（为了核开始菜单与桌面上的真快捷方式）：测试期间约一两分钟，真的开始菜单与桌面上有「流息」，卸载时删掉；测试结束后再查一遍没有。
7. 打包测试要 `--inspect-brk`（`EnableNodeCliInspectArguments` fuse 开着）。
8. `[InstallDelete]` 只认**新版** stage 顶层的名字：旧版独有、新版已经不发的顶层文件会留在程序目录里（云织 `docs/installer.md` 11.5 第 6 条）。
9. **握手只有一个方向、有上限**（11-04 补）：应用把自己的进程号交给安装程序，安装程序在 Restart Manager 动手之前最多等 60 秒；超过 60 秒还没退（机器极忙、进程挂住），安装照常往下走，仍由 Restart Manager 去关它 —— 那时的行为与握手之前一样，可能再卡在关程序那一步。等待的这段时间里安装程序的界面不处理消息（`/SILENT` 的进度窗口可能显示「未响应」，最多 60 秒）。进程号在应用退出后可能被系统分给别的进程：极少见的情况下安装程序会等一个无关的进程，最多 60 秒。安装程序不回报应用：安装中途失败（用户取消、磁盘满）时旧版本仍在，不会自动重新打开。
10. **（11-09 v2 包 J2 查出并修了）打包后的 v2 曾在 Windows 给不出「文档」文件夹时起不来**：`desktop/src/main/main.mjs` 原来在启动时就算 `join(app.getPath('documents'), 'Streams')`（新建库的默认位置），`getPath` 抛错 → `start failed`，应用退出、没有窗口。安装测试的用户文件夹原来没有 `Documents`，v2 第一次在装好的样子下跑就撞上了。玄翎 11-09 定修法，现在：默认位置由 `desktop/src/main/library-root.mjs` 在**第一次用到时**才算，`documents` 取不到退到 `<用户主目录>Streams`（`getPath('home')`），再取不到退到 `<应用数据>libraries`，退的时候 `main.log` 记一行 `library: the default place for a new library is … (no documents folder: …)`，应用照常启动；什么文件夹都不建。核法：`desktop/test/library-root.test.mjs`（`getPath` 换成替身：`documents` 抛错 → 主目录；两个都不行 → 应用数据；建服务时不问；开发运行不问；`main.mjs` 里不再有自己的 `getPath('documents')` —— 旧代码下这几条是红的）与 `packaged.test.mjs` 第 4b 步（装好的应用、测试用户的 `Documents` 删掉再起：对照先核 `getPath('documents')` 在这里确实抛错，应用照样起来，默认位置是 `<home>Streams`，`main.log` 有那一行、没有 `start failed`）。测试用户平时仍有 `Documents`（`world.mjs appEnv`，真的用户文件夹都有）。
11. **（v2 包 J2）stage 与安装目录的大小**：v2 的 stage 是 512 个文件、386,899,036 字节（多了 `@mozilla/readability` 14 个文件与 v2 的源码）；上面第 2 条的数字是 11-04 的。

## 九、改了哪些文件（11-04）

- `installer/build-installer.mjs`：核心打进 `resources/core/`；流息的 `LICENSE` 进 `resources/app/`；相对 import 的核对扩到核心并移到 `installer/stage-check.mjs`；遗留物核对；发布说明；`STREAMS_INSTALLER_VERSION` / `STREAMS_INSTALLER_OUT` 两个构建变量；扫描的开发文件名单补上 desktop 的两个脚本。
- `installer/stage-check.mjs`（新）：构建与测试共用的三项 stage 核对。
- `installer/notices.mjs`：「流息自己的部分」写上 `resources\core` 并附 `LICENSE` 全文。
- `installer/test/*`（重写）：`harness.mjs`、`machine.mjs`、`world.mjs`、`github-standin.mjs`、`use-case-a.mjs`、`packaged.test.mjs`、`upgrade.test.mjs`、`stage-check.test.mjs`（新）；`install-delete.test.mjs`、`uninstall-entry.test.mjs`、`deltree.test.mjs` 从云织改名（测试身份换成新的 GUID）。
- `docs/installer.md`（本文）。
- 桌面端（`desktop/src`）**没有改**：打包后的路径本来就对（§三）。
- 11-04 握手：`desktop/src/main/services/update.mjs`（`/STWAITPID=<pid>`：`WAIT_PID_SWITCH`、`setupArgs`、`pid` 选项）与新的 `desktop/test/services-update.test.mjs`；`installer/setup/streams.iss`（`WaitPidTimeoutMs`、`[Code] WaitForTheApp` / `PrepareToInstall`）；`installer/test/harness.mjs`（`slowExitMs`）、`upgrade.test.mjs`（慢退出、日志里的握手）、新的 `wait-pid.test.mjs`。
- **11-09 v2 包 J2**（安装测试跟上 v2；每处在文件里注明「v2 package J2」）：
  - `installer/build-installer.mjs`：`STREAMS_INSTALLER_APP_REF`（§二末，只给更新测试造 v1.0 的 0.9.0）；发布说明「安装与卸载」两行改成 v2 的说法（应用数据里多了库登记与主 Agent 的对话记录；装过 v1.0 测试版直接装、库与定时怎么迁移），「未在干净机器上验过」一节原字不动；文件头写上 `@mozilla/readability`。readability 本来就随 `desktop/package.json` 的 `dependencies` 进 stage、进 `THIRD-PARTY-NOTICES.txt`，构建的这一部分没改。
  - `installer/test/use-case-a.mjs`：`firstRunToInbox` 改成 v2 的路（首次打开 → 跳过连接 → 和主 Agent 聊 →「也可以手动新建」→ 新建库四步 → 待看）；v1.0 的首次设置留作 `v1FirstRunToInbox`，只给更新测试的 0.9.0 用。现在两个测试里只有 `upgrade.test.mjs` 用这个模块（`v1FirstRunToInbox`、`keepCurrent`、`openAbout`、`updateState`）；`packaged.test.mjs` 自己逐步走 v2 的路、每步有检查，`firstRunToInbox` 没有测试在调用。
  - `installer/test/packaged.test.mjs`：第 3 步改成 v2 的用例 A，加库架 / 左栏方案 B、阅读窗口、新建库默认位置在测试用户的 Documents 下、许可证部件表加 `@mozilla/readability`（§五表）。
  - `installer/test/upgrade.test.mjs`：0.9.0 是 v1.0 的应用；第 2 步改定时、记下 v1.0 的数据；第 6 步核迁移、概览、方案 B 侧栏、库架（§七表）。
  - `installer/test/world.mjs`：假 RSS 每条的页面换成够长的文章（带菜单与一段脚本，`SCRIPT_RAN`、`articleLine`）；`appEnv` 给测试用户建 `Documents`（真的用户文件夹都有；新建库的默认位置 `DocumentsStreams` 由此落在测试文件夹里，不是真的 Documents）。
  - 桌面端（玄翎 11-09 要求的最小改动，§八 第 10 条）：`desktop/src/main/library-root.mjs`（新）、`desktop/src/main/main.mjs`（用它、用到时才算）、`desktop/src/main/services/library.mjs`（`defaultLibraryRoot` 也可以是函数，每次要默认值时问它）、`desktop/test/library-root.test.mjs`（新，6 条）；`packaged.test.mjs` 第 4b 步。
  - `docs/installer.md`（本文）、`docs/desktop.md`（§一 一句：readability 的部件表核对已由本包同步）。

## 十、构建与测试的记录

### 10.1 2026-11-04（从 `048413a` 加本轮未提交的改动；`desktop/src`、`core/src` 本轮没改）

- **构建**：先删掉 `installer/dist`，`node installer/build-installer.mjs` 连跑两次（`STREAMS_SCAN_EMAILS` 设了打包人的邮箱）：两次都是 `installer/dist/Streams-1.0.0-setup.exe` **116,014,411 字节（110.6 MiB），SHA256 `6897811ebafbe2fffcfee9d14237257adfaa60cae5a51389c58cce1a3c9ec571`**，第二次的 `build-record.json` 记 `previous.same_installer: true`、stage 没有一个文件变（`tree_sha256` `0dcb2a7d…`）。一次约 75 秒，其中 ISCC 约 50 秒。当天更早的第一次构建（改测试之前）也是这个 SHA256。
- **stage**：449 个文件、386,221,644 字节；拷进去的：Electron 72（`electron.exe` 改名）、desktop 122、核心 78、preact 131、htm 41、图标 1、LICENSE 1；最长路径 75 个字符；我们自己的代码 182 个文件里 576 个相对 import 都找得到；扫描 0 处。`Streams.exe` 244,428,288 字节、SHA256 `8d5a0c9f…`，15 个 PE 节里 14 个与 `electron.exe` 逐字节相同、只有 `.rsrc` 不同，图标组 = `.ico` 的五张图；Electron 其余 71 个文件逐字节相同。
- **版本信息**（PowerShell `VersionInfo` 读）：`Streams.exe` —— Starry Data & Technology Inc. / 流息 / 流息 / 1.0.0 / 1.0.0 / `Copyright (C) 2026 Starry Data & Technology Inc.`；安装程序 —— 同一发布者 / 流息 / 流息 1.0.0-dev.0 / 1.0.0.0 / 1.0.0 / `Copyright © 2026 Starry Data & Technology Inc.`。`Get-AuthenticodeSignature`：两个都是 `NotSigned`。
- **发布说明** `installer/dist/release-notes-1.0.0.md`（SHA256 `f5f06c15…`）；`node --test tests/acceptance/v01-clean-install.test.mjs` 2/2 通过；把发布说明里的 sha256 改掉一位再跑：失败（「发布说明里没有这个安装包的 sha256 …（写的是 …）」），改回原字节后又通过。
- **测试** `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：**22 条：22 过、0 失败、0 跳过**，368 秒。`packaged`：安装 12 秒、卸载 1.5 秒；装上的 449 个文件与 stage 逐字节相同；用例 A 里 harness 记下的请求只有两次 `GET http://127.0.0.1:<端口>/feed`（第 3 步的试抓与第 4 步的一轮），代理陷阱为空；收藏下来的是 `notes\2026-11-04-streams-installer-check-the-first-item.md`，`validateNote` 没有问题（一条提醒：话题「未分类」不在 `streams.json` 里 —— 空白包没有话题，核心给的兜底话题）；一轮跑完经通知替身发了一条通知；对照的四个请求都在该在的地方（Node 的两个：harness 记下、陷阱收到；应用会话里的：被拒并记进 `main.log`；另开会话里的：陷阱收到）。`upgrade`：造 0.9.0 约 80 秒（两次运行造出的 0.9.0 安装包 SHA256 都是 `c77d7b6d…`）；从「开始更新」到安装程序跑完、流息重新起来约 25 秒；重新起来的流息在 `main.log` 写了「update: the updates folder: 1 file(s) removed」。
- 跑完之后查过：没有流息的卸载项、通知激活器的键，真的开始菜单与桌面上没有「流息.lnk」，系统临时文件夹里没有测试留下的文件夹。
- **对测试的反向核对**（不在测试里，在 stage 的副本上手动做）：把副本里 `main.mjs` 的 `STREAMS_DEV_LIBRARY`、`STREAMS_DEV_CONNECTION`、`STREAMS_DEV_SYSTEM_LANGUAGES` 三处的 `!app.isPackaged &&` 各去掉一个，用同样的 harness 与陷阱环境起：三个都被 `packaged.test.mjs` 用的同一批判据抓到（首屏变成今日；两个工具被「找到」；界面不是中文）；没改的副本通过。第一次做时 `STREAMS_DEV_CONNECTION` 那个没抓到 —— 原判据只看卡片上的状态，而探测还没回来时卡片也显示「没找到」；判据改成先等主进程的探测结果、再核两个工具 `installed: false`，之后抓到。
- 本机：`core` 458/458、`wording` 18/18、`desktop` 231 条 230 过、1 跳过（图标重建对比要 sharp）；`node tests/acceptance/run.mjs` **12 / 12 通过**（V1 变绿：安装包在、发布说明里有它的 sha256）。

### 10.2 2026-11-04 握手（从 `f3c916b` 加本轮未提交的改动）

- **构建**：先删 `installer/dist`，连跑两次：两次都是 `Streams-1.0.0-setup.exe` **116,015,299 字节，SHA256 `37210b332d3f0d35aa2f4df6bda86a541de45b02455fe567a5dfadb40d90139f`**，第二次记 `previous.same_installer: true`、`same_stage: true`；stage `tree_sha256` `736eba2a…`（与 10.1 比变的是 `resources/app/src/main/services/update.mjs`）；发布说明里写的就是这个 sha256（发布说明自己的 SHA256 `46e357ae…`）。10.1 的安装包（`6897811e…`）作废。
- **测试** `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：**27 条：27 过、0 失败、0 跳过**，312 秒。`upgrade` 第 4 步：应用退出被扣住 8 秒，`Streams.exe`（进程号 35348）在启动安装程序 8,772 毫秒后结束；安装日志 `Wait for the app to exit: process 35348 exited after 8000 ms`，随后 12 毫秒 `Found 14 files to register with RestartManager.`、`Calling RestartManager's RmGetList.`、`RestartManager found no applications using one of our files.`；从「开始更新」到新版起来 29 秒。`wait-pid` 五种情况都过。
- `desktop` 新的 `services-update.test.mjs` 4 条；把副本里 `install` 的参数改回 `[...SETUP_ARGS]`（`STREAMS_UPDATE_MODULE` 指向副本）再跑：参数那两条失败、另两条通过。
- 本机：`desktop` 235 条 234 过、1 跳过（sharp）；`core` 458/458；`wording` 18/18；`node tests/acceptance/run.mjs` **12 / 12 通过**。跑完查过：流息的卸载项、测试身份的卸载项都不在，系统临时文件夹里没有测试留下的文件夹。

### 10.3 2026-11-09 v2 包 J2（从 `4643e1c` 加本轮未提交的改动）

- **构建**：连跑两次 `node installer/build-installer.mjs`：两次都是 `Streams-1.0.0-setup.exe` **116,163,537 字节，SHA256 `907836b442bbd8f698ef9e37c3ccac161e8f88ce09f9b961e34a0ffa1d79118a`**（`certutil` 实算，与 `build-record.json`、发布说明里写的相同；第二次「previous build: byte-identical」）。stage 512 个文件、386,899,036 字节；拷进去的：Electron 72、desktop 147（多了 `library-root.mjs`）、核心 102、`@mozilla/readability` 14、preact 131、htm 41、图标 1、LICENSE 1；`THIRD-PARTY-NOTICES.txt` 列 3 个 npm 包（含 `@mozilla/readability@0.6.0 — Apache-2.0` 与它的 `LICENSE.md`）。发布说明 `release-notes-1.0.0.md` 的 SHA256 `b9498b2b…`。版本号与 `pre_release` 没改。
- **测试** `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：**28 条：28 过、0 失败、0 跳过**，447 秒（多了第 4b 步：测试用户没有 `Documents` 时 `getPath('documents')` 确实抛错、应用照样起来，默认位置 `<home>Streams` —— 这台机器上 `getPath('home')` 给的是真的用户主目录，只算出路径、没有建）。`packaged`：用例 A 走的是 v2 的路；收藏的是 `item/1`，阅读窗口以 `reading` 打开，两个 web contents 的参数逐项隔离、会话不落盘；库架一张卡、待看剩 2；部件表 Electron 44.0.0 · Chromium 152.0.7977.54 · Node.js 24.18.1 · Preact 10.29.8 · htm 3.1.1 · @mozilla/readability 0.6.0；harness 记下的请求只有两次去本机假 RSS 的 `GET /feed`，代理陷阱为空；真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` 前后拍照（名字、大小、时间）相同。`upgrade`：0.9.0 由 `b3b5512` 的应用造（两次造出的 0.9.0 安装包都是 `03f552ad…`，116,022,686 字节）；v1.0 的数据（`libraryPath`、`recentLibraries` 都是那个库，定时改成离开跑时 12 小时的一个时刻，这一轮是 06:51）更新后被迁移：`libraries.json` 里恰好是「我的库」且是当前库，定时 06:51 进了库的 `streams.json`，`settings.json` 那三个字段原样。
- **过程中查出并处理的**：第一次跑，装好的 v2 在第 3 步一启动就退出（DevTools 连不上），更新测试里被安装程序重新打开的 v2 也没起来 —— `main.log`：`start failed: Error: Failed to get 'documents' path`。先给测试用户补上 `Documents`，两边都起来了；随后按玄翎的决定把桌面端改成用到时才算、取不到就退（§八 第 10 条），并加了反向（第 4b 步）。下面的数字是改完后的。
- 本机：`desktop` 400 条 399 过、1 跳过（sharp；多了 `library-root.test.mjs` 6 条）；`core` 571/571；`wording` 18/18；`node tests/acceptance/run.mjs` **12 / 12**（改完后重跑）；`node tests/acceptance/v2-draft/run-draft.mjs` **6 / 6**（桌面端改动之前跑的；它的 N6 会重拍 `docs/shots/acceptance-v2/`，那批截图已按玄翎的话 `git checkout` 还原）。跑完查过：流息的卸载项、两个快捷方式、通知激活器的键、`%LOCALAPPDATA%\Programs\Streams`、测试的临时文件夹（`st-installer-*`、`st-upgrade-*`、`is-*-uninstall.tmp`）都不在，没有 `Streams.exe` 在跑；通知区域的记录里只有一条指向 `%LOCALAPPDATA%\Programs\Streams\Streams.exe`（真的安装位置，是之前那次真安装留下的，不是测试的路径，没碰）。
