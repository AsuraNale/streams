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
| `release-notes-<版本>.md` | 发布说明：文件名、大小（v2 包 N：另写 MB 数与字体文件的大小）、sha256（构建对刚出的文件现算）、「这一版有什么」（v2 包 N 加；重设计 R6c 按重设计后的样子重写，中英各一份，用设计 05-措辞规范的说法；大小那一行写上两款字体）、未签名与 SmartScreen 两步、怎么核 sha256、怎么卸载。验收 V1 的自动化前置（`tests/acceptance/v01-clean-install.test.mjs`）读它 |
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

安装不要管理员权限，安装本身不联网。装完开始菜单和桌面上有「流息」。卸载：「设置 → 应用 → 已安装的应用」里找「流息 1.0.0」（`release.json` 的 `app_ver_name`；发版 1.0.0 起不带开发轮次，维护者 11-16 定，§10.7；开发时的包叫「流息 1.0.0-dev.0 / dev.1」）→ 卸载。下载后可以先核 sha256（发布说明里有）：`Get-FileHash .\Streams-1.0.0-setup.exe -Algorithm SHA256`。

- 安装：按用户装，默认 `%LOCALAPPDATA%\Programs\Streams`，可以改；开始菜单「流息」，桌面「流息」（可以不勾）；装完可以直接打开。只装 x64（Windows 10 1809 及以上）。
- 卸载：只删安装时放进去的文件、两个快捷方式、卸载项、通知激活器的注册表键。**不删库**。最后问一句「是否同时删除流息的应用数据？」（API key、设置、库的登记、主 Agent 的对话记录、日志和缓存），**默认「否」**（这句话的全文在 `streams.iss` 的 `chs.DeleteAppData`。**重设计 R6c 对照设计 05-措辞规范核过并改了三处**：「应用数据包括你填的 API key、设置、缓存。」→「应用数据包括 API key、设置、库的登记、主 Agent 的对话记录、日志和缓存。」—— 第 6 条，人称能省则省；第 8 条，范围写全（选「是」删的是 `%APPDATA%\Streams` 与 `%LOCALAPPDATA%\Streams` 整个：设置、库的登记 `libraries.json`、主 Agent 的对话记录、加密的 key、日志、Chromium 自己的数据与缓存，`desktop/src/main/layout.mjs`；原句只列了三样，与发布说明的那一行也对不上）；「选「否」保留应用数据（以后重新安装流息可以接着用）。」→「选择「否」将保留应用数据，重新安装流息后可继续使用。」—— 第 5 条，提示先说结果、不用口头说法。第一句问句与「你的库（Markdown 文件夹）不会被删除。」没有冲突，没动。测试读的是 `.iss` 里的这句（`dialogs.mjs uninstallTexts`），跟着走）；选「是」才删 `%APPDATA%\Streams` 与 `%LOCALAPPDATA%\Streams`（`DelTree`：遇到链接只删链接本身，不跟进 —— `installer/test/deltree.test.mjs` 用钉死的 Inno Setup 实测）。应用开着时，安装 / 卸载程序会提示先关（Restart Manager）。
- 静默（测试 / 管理员）：`Streams-1.0.0-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART [/DIR=…] [/MERGETASKS="!desktopicon"]`；卸载 `"%LOCALAPPDATA%\Programs\Streams\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`（静默卸载取默认：保留应用数据；卸载程序先把自己拷到 TEMP 再运行，命令会先返回）。
- **有界面的卸载**（v2 包 N）：双击 `unins000.exe`，或「设置 → 应用」里点卸载 —— 三个对话框：「您确认要完全移除 流息 及其所有组件吗？」（是）→ 进度窗口 → 「是否同时删除流息的应用数据？…」（是 / 否，默认否）→「已顺利从您的计算机中移除 流息。」（确定）。卸载项在第一个「是」之后、问数据之前就删了（日志 `Deleting registry key: …\Uninstall\{DF025A05-…}_is1` 在 `User chose No.` 之前）。`packaged.test.mjs` 第 5 步与 `uninstall-ui.test.mjs` 照这样跑（§五「有界面的卸载」）。
- **给 维护者 装、卸，都要从资源管理器起**（v2 包 N，§十一）：Claude 桌面版的工具 shell（Bash、PowerShell）读写 `HKCU` 经的是 Claude 包的私有注册表视图；在那里 `Start-Process` 的安装包，卸载项只写进那个视图 ——「设置 → 应用」看不见它，维护者 双击 `unins000.exe` 卸完它也还在（2026-11-10 就是这样）。要给 维护者 装：让他自己双击安装包，或 `explorer.exe <安装包的完整路径>`（由资源管理器起，在包外）。要查真注册表里有没有流息：`node installer/real-registry.mjs`（同时报工具 shell 看到的与资源管理器起的进程看到的）。

## 五、怎么测（`installer/test/`）

`node --test --test-concurrency=1 "installer/test/*.test.mjs"`，构建之后跑。十个测试文件、六个共用模块（v2 包 N 加了 `uninstall-ui.test.mjs` 与 `dialogs.mjs`；重设计 R6a 加了不用构建的 `fonts.test.mjs`；**重设计 R6c** 加了不用构建的 `switches.test.mjs`，把 `packaged.test.mjs` 第 3 步、`upgrade.test.mjs` 第 6 步改成现在的界面，重打了安装包。R6a 没有重打安装包、没有跑会安装的测试，`packaged.test.mjs` 里 Noto Serif SC 的断言在 R6c 第一次真跑，§10.5）：

| 文件 | 核什么 | 会安装吗 |
|---|---|---|
| `packaged.test.mjs` | 真安装包：装、用例 A、退出、卸载（下表） | 是（流息的身份） |
| `upgrade.test.mjs` | 真更新：装 0.9.0（v1.0 的应用）、应用里检查 → 下载 → 更新到 1.0.0（当前构建）；v1.0 的数据被 v2 迁移（§七） | 是（流息的身份） |
| `fonts.test.mjs` | 重设计 R6a：随包字体的规则与通知的第 6 节，**不用先构建**（`node --test installer/test/fonts.test.mjs` 可单独跑）：`installer/fonts.mjs` 列的两款字体（界面字体 Noto Sans SC、研究对话主题的标题字体 Noto Serif SC）各带许可证文件；构建对应用文件的要求（工作区四个文件缺一不可，字体缺许可证 / 许可证缺字体 / 清单外的字体文件都停；旧提交的应用可以只有界面字体或没有字体）；`THIRD-PARTY-NOTICES.txt` 里每个字体文件一行带 sha256、每款字的 OFL 全文；反向：缺许可证、清单外字体、只有界面字体、没有字体 | 否 |
| `switches.test.mjs` | **重设计 R6c，开发开关与陷阱，不用先构建**（`node --test installer/test/switches.test.mjs`）：去掉注释后扫 `desktop/src/main` 代码里出现的每个 `STREAMS_*` 名字（不论写法：`process.env.STREAMS_X`、`process.env['STREAMS_X']`、``process.env[`STREAMS_X`]``、`env.STREAMS_X`、`const { STREAMS_X } = process.env`、带引号的 `'STREAMS_X'` —— `layout.mjs` 的两个是这样写的），与 `world.mjs trapSwitches` 返回的键比：读了却没设陷阱、设了陷阱却没人读，各报一条（报的路径相对于被扫的文件夹）；守卫：`main.mjs` 里每一行带开关名的代码，要么是 `const 名 = !app.isPackaged && …`，要么是接着这样一行往下写的续行（以 `?`、`:` 或 `&&` 开头），而且开关名不出现在守卫管不到的地方 —— 三元式 ` : ` 之后（或以 `:` 开头的续行：`A && B ? C : D` 的 `D` 正是打包态会算的那一支）、`||` 之后、`;` 之后（另一句）；`main.mjs` 以外没有哪个文件自己从对象上取 `STREAMS_*`（`process.env`、传进来的 `env`，或换个名字拿着的它们：`e.STREAMS_X`、`e['STREAMS_X']`、`const { STREAMS_X } = e`）；任何文件的代码里都没有单独的前缀字符串 `'STREAMS_'`（拼名字用的）；`layout.mjs` 的 `pick` 打包态一律返回 `null`。对照：在 `desktop/src/main` 的临时副本里多写一个读法（六种写法各一次，其中一次在 `services/` 下、副本路径比仓库长）→ 报出；只在注释里（整行注释、JSDoc 行、代码后的 ` // `）出现的名字不算；从陷阱表里拿掉一个 → 报出；去掉一处 `!app.isPackaged &&`、或在受守卫的一行下面插一个函数 / 解构 / 模板键的读法 → 报出；在 `services/quota.mjs` 里自己读 `STREAMS_DEV_QUOTA`（六种写法）→ 报出；`layout.mjs` 去掉打包态的拒绝 → 报出（11-14 晚（东部时间，下同）按第一轮预检修补这条之前，解构、`env.X`、模板键、守卫行下面的函数四种都漏过了，§10.5）；**11-15 按第二轮预检再补**：守卫行改成 `… && false ? null : process.env.STREAMS_DEV_DETECT`、或下一行以 `: process.env.…` 接上、或 `… && false || process.env.…`、或 `…; const D2 = process.env.…` → 报出（之前前两种漏过：只看了续行的开头）；`services/quota.mjs` 里经别名读（`e.X`、`e['X']`、`{ X } = e`、`(o.env).X`）→ 报出（之前 `const e = process.env; e.STREAMS_DEV_QUOTA` 漏过）；`'STREAMS_' + 'DEV_QUOTA'`、`const P = "STREAMS_"` → 报出。不在扫描之内（`desktop/src/main` 现在都没有，要靠评审）：名字放在变量里再拿变量去取（`const k = 'STREAMS_X'; e[k]` —— 名字本身仍被扫到、仍要有陷阱，只是「谁在取」看不出）、不经 `'STREAMS_'` 前缀拼出来的名字、守卫行里逗号后面的第二个声明。另核陷阱本身：文件型的陷阱文件在、不是 JSON（检测那个是「两种工具都已找到并已登录」）、文件夹型的是空的；`trapsUntouched` 与 `trapLogLines` 对被用上的开关会报、对应用平常的日志行不报 | 否 |
| `stage-check.test.mjs` | 构建的 stage 核对函数与扫描在 stage 的副本上：原样通过；删掉核心的一个文件、删掉整个核心、放进测试文件 / fixtures / 开发脚本、放一个链接、放本机用户路径 / key / 提交邮箱，各自被报出 | 否 |
| `install-delete.test.mjs` | 更新时的清理 `[InstallDelete]`：真的 `streams.iss` 与真的清单生成器，对着六个文件的小 stage 编译，用**测试自己的身份**真装三次（第一次装不删；装在自己的旧版上删旧版文件、留用户的文件；装进别人的文件夹不删） | 是（测试身份） |
| `uninstall-entry.test.mjs` | 更新后卸载项的版本号：9.0.0 → 9.0.1 → 9.1.0（其中一个故意不写卸载项）依次覆盖，卸载项总是最后那一版；另一个文件夹的不碰 | 是（测试身份） |
| `wait-pid.test.mjs` | 更新的握手：`/STWAITPID` 给了、没给、不合法、进程已不在、超时，安装日志里各一行（§七） | 是（测试身份） |
| `deltree.test.mjs` | 卸载时删应用数据用的 `DelTree` 不跟进链接 | 否（一次性安装程序，什么也不装） |
| `uninstall-ui.test.mjs` | **v2 包 N，有界面的卸载**（下面「有界面的卸载」）：真的 `streams.iss` 编成测试身份的小安装包，装好后不带任何开关（只带 `/LOG`）跑 `unins000.exe`、三个对话框照用户的答法答：答「否」、答「是」各一遍；再模拟 维护者 的残留（程序文件与快捷方式没了、卸载项与通知键还在）→ 守门认作残留、不是安装 → 同一 AppId 再装再卸，残留没了 | 是（测试身份） |
| `harness.mjs` · `machine.mjs` · `world.mjs` · `github-standin.mjs` · `use-case-a.mjs` · `dialogs.mjs` | 共用：起装好的应用；读注册表、快捷方式、进程；测试的世界（本机假 RSS —— v2 包 J2 起每条的页面是一篇够长的文章，带菜单与一段脚本，给阅读窗口用 —— 代理陷阱、应用的环境）；GitHub 的替身；`use-case-a.mjs`（**重设计 R6c**：没人调的旧 v2 路 `firstRunToInbox` 删了 —— 现在的用例 A 由 `packaged.test.mjs` 第 3 步自己逐步走、每步有检查；新加 `appWords(appDir)`：从装好的 `resources\app` 读应用自己的中文字典 `src\renderer\texts\*.js`、`fmt`，与外观的默认值和迁移 `src\main\theme.mjs`、`src\shared\themes.mjs`，两个安装测试拿页面上的字与它们比，测试里不写死中文；`v1FirstRunToInbox` 是 v1.0 的首次设置，只给更新测试的 0.9.0 用，一字没改，`packRoundSchedule` 现在只有它在用所以留着；`keepCurrent`、`openAbout`、`updateState` 没改）；v2 包 N：`dialogs.mjs` 起卸载程序并答它的对话框（下面），`machine.mjs` 的 `deadLeftovers` / `liveInstallHere`（守门分清「真安装」与「安装已不在的残留」） | — |

**打包后的应用不认任何开发开关**，所以不能像桌面端的测试那样用环境变量指挥它。`harness.mjs` 用 `--inspect-brk` 起 `Streams.exe`，停在应用第一行之前，只改**周围的环境**，全经 Electron 与 Node 的公开对象，应用的代码一行不改：

- 用户数据放哪：`app.setPath('appData')` 与 `LOCALAPPDATA` 指到测试自己的文件夹；应用的 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`TEMP` 也都在测试文件夹里（**真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` 一律不碰**；v2 包 N 起连「拍照」—— 列名字、大小、时间 —— 也不做了：契约 N 说任何测试都不许读写它，玄翎在测试外前后核；卸载程序也以测试的用户跑，「是」要删的文件夹解析在测试文件夹里，开跑前先问 Windows 核过）；系统语言答中文；
- 窗口从不显示；选文件夹的对话框答测试的空文件夹；`shell.openPath` / `openExternal` / `showItemInFolder` 只记下；
- **通知与托盘图标**换成只记录的替身：Electron 的 `Notification` 一被用到就会在开始菜单建或重写快捷方式、在 `HKCU\Software\Classes\CLSID` 注册；真的托盘图标 Windows 会记在通知区域的设置里。替身装在 Electron 取这两个类的地方（`process._linkedBinding('electron_browser_notification')` 与 `('electron_browser_tray')`），钩子随即读一次 `require('electron').Notification` / `.Tray`，不是替身就报错并结束还停在第一行的应用；
- **网络全记下**：主进程的每个请求 —— `globalThis.fetch`（核心的抓取）、`http/https.request`、`http/https.get`（更新）—— 发出前记下地址与方法，原样放行；只有更新的两个 GitHub 地址交给测试的替身（§七）；应用启动 `…\updates\Streams-<版本>-setup.exe` 时记下参数与启动方式，测试说 `run` 才真启动（这时在应用的五个参数后面加 `/LOG=…`）；
- 记下 `app.setAppUserModelId`、`app.setToastActivatorCLSID` 的参数与退出各阶段；测试碰一个文件，应用就 `app.quit()`；测试给 `slowExitMs` 时，把应用第一次的 `will-quit` 扣住那么久再 `app.quit()`（慢退出，§七）。

页面用 Playwright 经 Chromium 的远程调试口驱动（`chromium.connectOverCDP`）。**出路的陷阱**（`world.mjs` 的 `startTrap`）：应用的环境里 `HTTP_PROXY` / `HTTPS_PROXY` 指向一个什么都拒、全记下的本机代理，加 `NODE_USE_ENV_PROXY=1`（Node 自己的 fetch 也走代理），Chromium 以 `--proxy-server` 指向它；回环不走代理。漏过 harness 记录的请求会落到这里，也不会再往外走。应用的 `PATH` 只有 System32（没有 Node、Python、git、Claude Code、Codex）。**每个 `STREAMS_*` 开关都设成陷阱**（`world.mjs` 的 `trapSwitches`：数据文件夹、库、选文件夹、更新地址、更新记录文件指向空的陷阱文件夹或陷阱代理，`STREAMS_WINDOW=hidden`、`STREAMS_START_SCREEN=settings`、`STREAMS_DEV_SYSTEM_LANGUAGES=en`、`STREAMS_DEV_CONNECTION=fake`、`STREAMS_DEV_NOW=2001-02-03…`；v2 包 N 加 `STREAMS_DEV_QUOTA`：指向一个不是 JSON 的陷阱文件，应用要是认了它，`main.log` 会有 `quota: development file not read`），测试逐个核没生效。**重设计 R6c**：到包 N 为止陷阱表只有 12 个开关，`desktop/src/main` 读的还有 5 个没设（`STREAMS_DEV_PROPOSALS`、`STREAMS_DEV_LIBRARY_ROOT`、`STREAMS_DEV_AGENT_SCRIPT`、`STREAMS_DEV_ASK_SCRIPT`、`STREAMS_DEV_DETECT`），上面「每个」那句当时与实际不符；现在 17 个全设了，`switches.test.mjs` 不用构建就拿源码里的读法与陷阱表比（少一个就红）。新加的五个陷阱与各自在 `packaged.test.mjs` 第 3 步里的核法：

| 开关 | 陷阱 | 被用上会怎样 | 第 3 步怎么核它没被用上 |
|---|---|---|---|
| `STREAMS_DEV_DETECT` | 一个 JSON 文件：两种工具都「已找到、已登录」，版本 `0.0.0-trap` | 首次打开不出连接选择，直接选用 Claude Code | `getConnections` 两种工具 `installed: false`、没有哪个是 `0.0.0-trap` 或已登录；页面是连接选择、三行都不可用 |
| `STREAMS_DEV_LIBRARY_ROOT` | 空文件夹 `traps\library-root` | 新建库的默认位置落在它下面 | `getLibraryRoot` 与表单的默认位置都是测试用户的 `Documents\Streams`；`trapsUntouched`（文件夹仍是空的） |
| `STREAMS_DEV_PROPOSALS` | 不是 JSON 的文件 | 起动时 `main.log` 有 `proposals: <文件> unreadable` | `trapLogLines` 为空（陷阱不是 JSON，应用认了它也造不出提议，所以只有日志这一行能看出来；第 3 步另核的 `listProposals` 0 张不是这个开关的核法，11-15 第二轮预检指出后把那句断言的说明改对了） |
| `STREAMS_DEV_AGENT_SCRIPT` | 不是 JSON 的文件 | 只在有开发连接（`STREAMS_DEV_CONNECTION`）时读；主 Agent 第一次回答时 `main.log` 有 `agent: <文件> unreadable` | `trapLogLines` 为空；`STREAMS_DEV_CONNECTION` 自己的核法（没有能用的连接、首次运行 0 次模型调用） |
| `STREAMS_DEV_ASK_SCRIPT` | 不是 JSON 的文件 | 只在 `STREAMS_DEV_CONNECTION=fake` 时读，起动时 `JSON.parse` 抛错，应用起不来 | 应用起来了；同上 |

这两个开关有**两道守卫**：`main.mjs` 的 `!app.isPackaged &&`，加上服务只在开发连接下才读那个文件（`services/connections.mjs`：`devConnection === 'fake' &&`；`services/agent.mjs`：只在 `connections.devConnection` 有值时）——而 `STREAMS_DEV_CONNECTION` 本身有守卫、有陷阱、有核法。所以单单去掉 `main.mjs` 那一道，打包态的应用什么也不会多做（等价变异，造不出能被抓的差别）；它们「单独被误用」在第 3 步里看不见，靠的是静态测试的守卫核对与 `STREAMS_DEV_CONNECTION` 的核法。为了证明陷阱本身在被读到时看得见，§10.5 的变异把两道都去掉：ASK → 应用起不来；AGENT（服务建好时就读脚本）→ `main.log` 的那一行被 `trapLogLines` 抓到。`STREAMS_DEV_UPDATE_URL`、`STREAMS_DEV_UPDATE_SETUP_RECORD` 只在检查更新、下载更新时才用，第 3 步不更新，它们由 `upgrade.test.mjs` 第 3–5 步核（只问 GitHub 的两个地址、代理陷阱为空、`trapsUntouched`），不在演练里变异（演练不做真更新）。

`trapLogLines(traps, main.log)`（`world.mjs`）= 日志里带有任何一个陷阱痕迹的行：额度那一行、提议文件与主 Agent 脚本的路径、`connections: STREAMS_DEV_DETECT`、`development cards made`、陷阱文件夹自己的路径；第 3 步在右栏之后与用例走完之后各核一次为空，`upgrade.test.mjs` 第 6 步核一次。

`packaged.test.mjs` 一次走完（任何一步失败，`after` 照样结束安装目录里的进程、本轮的安装还在就静默卸载、删临时文件夹，先解链接）：

| 步 | 核什么 |
|---|---|
| 0 | 守门：这台机器上没有流息的卸载项（`HKCU\…\Uninstall\{DF025A05-…}_is1`）、没有开始菜单或桌面上的「流息.lnk」、没有通知激活器的键，有一样就停（不碰真的安装）。**v2 包 N**：卸载项指的文件夹与 `unins000.exe` 都不在、通知键的 `LocalServer32` 指的 `Streams.exe` 不在、两个快捷方式都没有 —— 这是「安装已不在的残留」（`machine.mjs deadLeftovers`；2026-11-10 维护者 那条，§十一），不算安装：写一行到 stderr、记进结果的 `leftoversBefore`，本轮同一 AppId 的安装把它覆盖、第 5 步的卸载把它删掉（维护者 11-10 同意）；有一样还活着（快捷方式在、文件夹在）就照旧拒跑。卸载程序要用的测试用户（`UNINSTALL_ENV`）：先问 Windows 它的「应用数据」「本地应用数据」解析在哪，不在本轮文件夹里就不跑。不再拍真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams` |
| 1 | 静默安装到临时文件夹：卸载项（名字 `app_ver_name`、版本、发布者、位置、图标 = 装上的 `.ico`），名字以「流息」开头的卸载项只有这一条；开始菜单与桌面两个快捷方式（目标、起始位置、图标、AppUserModelID、通知激活器 CLSID，并按 Electron 读快捷方式的方式核 VT_LPWSTR / VT_CLSID 两个类型）；通知激活器的键；装上的 `Streams.exe` 的图标组与 `.ico` 五张图逐字节对上、版本信息是 `release.json` 的且与 `build-record.json` 记的相同；安装程序的版本信息也是；**装上的每个文件与 stage 逐字节相同**（另外只有 `unins000.exe/.dat`）；没有链接；核心在；没有 `default_app.asar`、组件一览；`LICENSE`、`LICENSES.chromium.html`、`THIRD-PARTY-NOTICES.txt`、`resources\app\LICENSE`（与仓库根的逐字相同）都在 |
| 2 | 扫描安装目录与安装包本身：没有 key、提交邮箱、本机路径与计算机名、开发内容（卸载日志 `unins000.dat` 写着装到了哪里 —— 那是安装时在本机写的，只放过它的「本机路径」一类）；对照：同一扫描找得到故意放进去的 key、路径、邮箱、内容（UTF-8 与 UTF-16 各一） |
| 3 | **用例 A（重设计 R6c 重写：R4a 之后的界面，docs/desktop.md §4.16；之前是 v2 包 J2 的旧路 —— 首次打开两步 → 和主 Agent 聊的引导 → 新建库四步，那些钩子在 R1–R5b 里都已删掉）**。页面上的字一律与**装好的应用自己的字典**比（`use-case-a.mjs appWords` 读 `resources\app\src\renderer\texts\*.js`），默认主题与外观读装好的 `src\main\theme.mjs`、主题表（各主题浅深的页面底色与模板 body）读装好的 `src\shared\themes.mjs`（对照：它们与仓库的相同 —— 只改装好的那份会与自己一致；字典读到的是中文的）；测试里的中文只剩用户自己填的内容（库名 = 文件夹名「安装测试库」、追踪要求）与注释；库名不是应用的任何一个字（`use-case-a.mjs isAppWord`，对照：左栏分组的字「我的库」是 —— 到 11-14 为止测试库就叫「我的库」，左栏一行或库架一张卡错画成分组的字也照样绿，11-15 第二轮预检指出后改名，变异 `row-name-group-word` 见 §10.5）。① **打包态**：版本 1.0.0、资源在安装目录、没有菜单、开发者工具打不开、窗口没显示过、通知激活器 CLSID 是固定的那个；托盘图标经替身建了（`STREAMS_WINDOW=hidden` 会不建）。② **首次起的外观**（对照：还没有 `settings.json`）：`getAppState` 是默认主题（现在是研究对话 `research`）+ `system`、`scheme` = Windows 此刻的深浅；`nativeTheme.themeSource` 是 `system`；窗口建时的底色 = `THEME_PAGE[默认主题][深浅]`；经 `net.fetch` 取回的 `index.html` 的 `<html>` 上带 `data-theme`、`data-appearance`；页面 `<html>` 两个属性、`<body>` 的模板 class 与 `data-theme`（`THEME_TEMPLATE`）、`body` 的底色同样。③ **首次打开一屏**：`libraryCount` 0、`libraries.json` 没有库；新建库默认位置是测试用户的 `Documents\Streams`；等主进程把两种工具都探测完 —— 都没找到、也没有 key，流息选不出连接，所以页面是**连接选择**（`[data-part="first-run"][data-view="pick"]`）：标题与小标题、三行（名字、状态 `not-installed` / `no-key`、小字「推荐 · 未找到 · 用量计入你的套餐」等）、底部「重新检测 · 暂时跳过，稍后在设置中连接」都是字典的字；左栏已在：新建库 · 库架 0 · 主 Agent · 我的库（空）· 设置。④ **字体**（模板的族名，不写死）：两个字体文件在 stage 清单里、装上了（第 1 步已逐字节核）；页面自己的 `@font-face` 规则里，指向 `NotoSansSC-VF.ttf` 与 `NotoSerifSC-VF.ttf` 的各恰好一条，由此得到界面字体与标题字体的族名；`body` 的字体里有界面字体的族名，第一个族是模板的数字字体（一条只有 `local()` 的规则，已 `loaded`）；界面字体按页面的要法 `document.fonts.load` 之后 `loaded`、`check` 为真（研究对话把系统字体排在它前面，平时不会去取）；标题 `#fr-title` 的字体里标题字体的族名排在界面字体之前，这个字体面 `loaded`、`check` 为真，Chromium 实际画标题用的是这个族的网页字体（`CSS.getPlatformFontsForNode`：`isCustomFont`）；主进程经 `net.fetch` 取两条规则的地址，拿到的字节数与 sha256 就是装上的那两个文件。⑤ **跳过连接**：对照 `settings.json` 还没有 `setupConnection` →「暂时跳过」→ 回到一屏：`setupConnection` 记 `skipped`（没有 `detail`）、没选连接、仍没有库；页面写「未连接」与那一句、「你想追踪什么内容？」、三个示例、「选择连接 · 发送 · 手动创建 · 暂不创建，先进入应用」；输入框里有字「发送」也不可点。⑥ **手动创建 → 新建库一页表单**（没有向导步骤、没有起步包那一步）：填库名称 → 存储位置是测试用户的 `Documents\Streams\<库名>`、「空文件夹，将在此创建库」（不是 `STREAMS_DEV_LIBRARY_ROOT` 的陷阱）；追踪要求空着时两个创建按钮不可点、写着「必填…」，填了才可点；来源框贴本机假 RSS 的地址回车 → 就地试抓一行：`ok`、「正常 · 3 条」、「最新：「…」」，假站只被问了一次 `/feed`；「更改…」→ 选文件夹对话框（harness 答测试的空文件夹；记录里恰好一次）→ 位置是它、`chosen`、「空文件夹…」；定时与上限照表单显示的（应用的默认）、预计调用数那句；对照：创建前文件夹里没有 `streams.json`。⑦ **创建并运行**：到该库待看、三张卡；核心读到待看 3 条、运行记录恰好一条、**0 次模型调用**（没有连接：只抓取不评分，全部进待看；`STREAMS_DEV_CONNECTION=fake` 会评分）；`libraries.json` 登记了它（名字是填的库名）且是当前库；`streams.json`：追踪要求、来源正是那一个、定时与上限 = 表单显示的、严格程度标准；`settings.json` 里 v1.0 的 `libraryPath` / `recentLibraries` 没写；`setup` 六条按 §4.16 的记法：library chose/empty、connection skipped（从 `setupConnection` 抄来、时间不变）、pack skipped、sources wrote（+1）、trial chose、schedule default。⑧ **许可证与致谢**：MIT 全文与仓库的 `LICENSE` 逐字相同；部件表是 Electron、Chromium、Node.js（运行时的版本）、Preact、htm、`@mozilla/readability`（装好的 `package.json` 的版本）、Noto Sans SC 2.04、**Noto Serif SC 2.003**；`THIRD-PARTY-NOTICES.txt` 列着 readability，两款字体各有自己那一行（`installer/fonts.mjs` 的名字与用途）紧跟装上的字体文件的 sha256、各自的 OFL 全文；许可证页两款字体的许可全文 = 装上的 `OFL-*.txt`（R6a 加的 Serif 断言在这里第一次真跑）。⑨ **右栏**（待看页上）：四个标签依次 progress · decide · detail · files、字是字典 `PANEL.tabs` 的（现在是「进度 · 待确认 · 详情 · 文件」）、详情是当前；点进度 → 换过去、`settings.json` 的 `panel` 记成 `{ open: true, tab: 'progress' }`，再点回详情。**左下角余量**：没有连接 → `getQuota()` 是 `null`、页面上没有 `[data-part="quota"]`（对照：左栏与「设置」按钮在）。**开关陷阱的日志**：`trapLogLines` 为空（对照：日志里有应用自己的行）；`listProposals` 0 张（此刻没有提议，不是 `STREAMS_DEV_PROPOSALS` 的核法，见上面的陷阱表）。⑩ 待看按 **C** → 库的 `notes\` 里出现一个 `.md`，核心自己的 `validateNote` 没有问题、来源是那张卡、`status: kept`、收藏日期是今天（不是 `STREAMS_DEV_NOW` 那天）。⑪ **左栏与库架**：新建库 · 库架 1 · 主 Agent · 我的库下面一行就是这个库（当前）· 设置；点库架 → 一张卡，是这个库、当前、待看剩 2。⑫ **阅读窗口**：库架的卡 → 这个库 →「资料库」标签（自动打开刚收藏的那条，动作区 `[data-part="item-actions"][data-id]`）→「查看原文」（字典的字）→ 阅读窗口出来、`阅读模式`（正文是那条在本机假站上的文章，载入的是阅读器自己写的 `data:` 页，没有菜单、没有 `<script>`，页面里那段脚本要请求的 `/script-ran` 假站从没收到）；两个 web contents 的参数逐项是隔离的，会话是阅读器自己的、不落盘，两页里都没有 `window.streams`、`require`、`process`；假站收到了这条的页面请求；`main.log` 有 `reader: <地址>: reading`；顶栏「返回条目」→ 窗口关了。⑬ **harness 记下的请求全部是去本机假 RSS 的**，代理陷阱为空，陷阱文件夹全空，`trapLogLines` 仍为空，没往外开任何东西。对照（用例走完之后）：从主进程发一个 Node 的 `fetch`、一个 `https.request`、一个应用自己会话里的 `net.fetch`、一个另开的内存会话里的 `net.fetch`（地址都在 `.invalid` 下）—— 前两个 harness 记下、陷阱收到，第三个被应用的会话拒绝并记进 `main.log`，第四个陷阱收到 |
| 4 | 退出（调试器全部断开，碰退出文件）：进程结束，3 秒后安装目录里没有任何进程 |
| 4b | **v2 包 J2，`Documents` 的反向**：把测试用户的 `Documents`（空的）删掉再起装好的应用：对照先核 `getPath('documents')` 在这个用户下确实抛 `Failed to get 'documents' path`；页面照样起来（库已登记：它的待看），`getLibraryRoot` 是 `{ path: <home>\Streams, isDefault: true }`，`main.log` 有 `library: the default place for a new library is … (no documents folder: …)`、没有 `start failed`；退出后安装目录里没有进程，`Documents` 再建回来 |
| 5 | **v2 包 N 改：有界面的卸载，照 维护者 11-10 的走法**（原来是 `/VERYSILENT /SUPPRESSMSGBOXES` 的静默卸载，用户从不这样卸）：`unins000.exe` 只带 `/LOG`、以测试用户（`UNINSTALL_ENV`）起，`dialogs.mjs` 答三个框 —— 文字与 Inno Setup 7.1.0 的 `ChineseSimplified.isl`（`ConfirmUninstall`、`UninstalledAll`，`%1` = 流息）和 `streams.iss` 的 `chs.DeleteAppData` 逐字相同，依次答「是」「否」「确定」；日志里有 `Deleting registry key: HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\{DF025A05-…}_is1`、`Uninstallation process succeeded.`、`Removed all? Yes`，三次选择依次是 Yes、No、OK。之后：卸载项、两个快捷方式、通知激活器的键、程序目录整个没了，名字含「流息」或「Streams」的卸载项一条都没有；测试的应用数据与库（连同那条笔记）还在；再按第 0 步查一遍：没有任何流息的痕迹（第 0 步见到的残留也没了） |

结果写进 `installer/dist/packaged-test-result.json`（含收藏下来的那条笔记的路径与全文、harness 记下的每个请求、对照的结果；v2 包 N 加：外观与字体的读数、右栏与左下角、卸载的三个对话框与日志行、`leftoversBefore`；重设计 R6c：`fonts`（页面的字体规则、各字体面的状态、实际画标题的字体、`app://` 发回的两个文件的 sha256）、`firstRun`、`newLibraryForm`、连接选择的三行）。

### 有界面的卸载（v2 包 N，`installer/test/dialogs.mjs`、`uninstall-ui.test.mjs`）

- **怎么驱动对话框**：`uninstallWithDialogs` 用 `spawn` 起 `unins000.exe`（可见，只带 `/LOG`），同时起一个 Windows PowerShell 5.1 进程，里面 `Add-Type` 编一小段 C#：按 Toolhelp 的父进程号跟住卸载程序的整棵进程树（第一阶段把自己拷成 `%TEMP%\is-…-uninstall.tmp\_unins.tmp`、交给它 —— 那是它的子进程），每 200 毫秒枚举这棵树里进程的顶层窗口，`#32770` 就是消息框：文字取静态控件 `0xFFFF`（`MessageBox` 自己的），按钮看 1 / 2 / 6 / 7 这几个控件在不在，答的时候往框上 `PostMessage(WM_COMMAND, 按钮号)`（不要焦点、不动鼠标）。每个框只答一次、全记下（标题、文字、按钮、按了哪个）；整棵树结束 2 秒后收工。
- **答法**（只对认得的字答「是」）：文字逐字等于 `ConfirmUninstall` 的 → 是；逐字等于 `DeleteAppData` 的 → 测试要的答案；别的有是 / 否的框 → **否**（什么都不删的那个）；只有一个按钮的 → 确定。测试再逐字核三个框的顺序与文字：多出一个框（比如报错）就是红的，不会被悄悄点掉。
- `uninstall-ui.test.mjs`（测试身份 `{6E2C4A91-…}`、通知 CLSID `{B4D17E52-…}`、名字 `st-uninstall-ui-test`、文件夹名 `StUninstallUiTest`；用户文件夹挪进本轮的临时文件夹，先问 Windows「程序」「桌面」「应用数据」「本地应用数据」都解析在里面才跑；约 30 秒，三个对话框会在屏幕上出现几秒）：
  1. **答「否」**：装（静默、默认任务，桌面快捷方式也建）→ 在测试用户的 `{userappdata}\StUninstallUiTest`、`{localappdata}\StUninstallUiTest` 里放三份「应用数据」→ 有界面的卸载答否：退出码 0；三个框、依次是 / 否 / 确定；日志：删了卸载项那一行、成功、全删了、三次选择 Yes / No / OK、问数据在成功之后；卸载项、通知键、程序目录、两个快捷方式都不在；三份数据原样在。
  2. **答「是」**：同上，另在旁边放一个别的名字的文件夹（`StUninstallUiTest-neighbour`）；答是：两个数据文件夹都没了，旁边那个还在。
  3. **维护者 的残留**：装好 → 对照：完整的安装 `deadLeftovers` 是空的、`liveInstallHere` 报四样；再像另一个注册表视图里的卸载那样只删掉程序目录与两个快捷方式 → 卸载项与通知键还在、`deadLeftovers` 报这两样（各写明指向的已不在的路径）、`liveInstallHere` 为空（守门放行）；对照：把桌面快捷方式放回去 → 不算残留；再用同一 AppId 装进另一个文件夹（日志 `Writing uninstall key values.`）→ 有界面的卸载答否 → 卸载项与通知键都没了。
- **能失败**（2026-11-10 做过，`installer/setup/streams.iss` 改完用 `git checkout` 还原、核了字节）：见 §十一「核法」。

## 六、第三方许可

`THIRD-PARTY-NOTICES.txt` 在安装目录根上，由构建从 stage 里的文件现生成（`installer/notices.mjs`），列的正是装进去的东西：

1. MPL-2.0 与 LGPL 组件的源码在哪里（这一版没有）。
2. Electron 44.0.0（MIT 全文；Chromium 及其组件见同目录的 `LICENSES.chromium.html`）。
3. 3 个 npm 包：`@mozilla/readability` 0.6.0（Apache-2.0，v2 包 H 加的）、htm 3.1.1（Apache-2.0）、preact 10.29.8（MIT）—— 名字、版本、许可、仓库。
4. 它们自带的 LICENSE 原文。
5. 流息自己的部分：`resources\app` 与 `resources\core` 是流息的代码，MIT，`LICENSE` 全文（另见 `resources\app\LICENSE`）；由 Starry Digital 开发。
6. **随包字体**（v2 包 K2 起有界面字体；重设计 R6a 加标题字体；名单在 `installer/fonts.mjs` 的 `BUNDLED_FONTS`，构建按它核、`fonts.test.mjs` 不用构建就核这一节）：每个字体文件一行 —— 文件名、字体名、用途、未修改、SIL Open Font License 1.1、装在 `resources\app\src\renderer\fonts\` 的哪个文件 —— 下面一行是它的 sha256；然后每款字的 OFL 全文（随包的 `OFL-NotoSansSC.txt`、`OFL-NotoSerifSC.txt` 原文）。
   - `NotoSansSC-VF.ttf`：Noto Sans SC 2.04，界面字体，17,773,244 字节（模板的样式表以 `Yunzhi Noto` 这个族名声明它）；
   - `NotoSerifSC-VF.ttf`：Noto Serif SC 2.003，研究对话主题的标题字体，25,125,232 字节，sha256 `5326cfb0…`，取自 notofonts/noto-cjk 官方发布 Serif2.003（来源清单 `docs/design/fonts/noto-serif-sc/`）。
   应用里「设置 → 许可证与致谢」的部件表有这两行，并显示两份 OFL 全文；`packaged.test.mjs` 第 3 步在装好的应用里核（§五）。

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
| 0 | 守门（v2 包 N：安装已不在的残留不算安装，同 `packaged.test.mjs` 第 0 步）；造 0.9.0（记下 SHA256，与 1.0.0 的不同）；测试用户的文件夹解析在测试文件夹里。**v2 包 N 修**：K2 起构建要求 `desktop/src/renderer/fonts/` 的字体与它的 OFL，而 0.9.0 是 v1.0 的应用、没有字体 —— 造 0.9.0 这一步就 `STOP`（`…NotoSansSC-VF.ttf is not a file git knows`），整个更新测试 7 条全红；现在构建只对「样式里加载这个字体」的应用（有 `styles/fonts.css`）要求字体与通知里的字体那一节，工作区的应用没有 `fonts.css` 照样停 |
| 1 | 0.9.0 静默装进临时文件夹：卸载项 0.9.0、名字以「流息」开头的只一条；测试用户的开始菜单与桌面上有快捷方式；真的开始菜单与桌面上没有 |
| 2 | 0.9.0 第一次打开（harness）：版本 0.9.0；用例 A（v1.0 的首次设置：文件夹 → 跳过连接 → 空白包 + 本机 RSS → 试跑 → 定时）走到收藏一条；「设置 → 关于」写「流息 0.9.0（Windows 版）」，没有「开发版」；**v2 包 J2**：同一页的「定时」改成离现在 12 小时的一个时刻（不是默认的 08:30，迁移若不管它就看得出来；12 小时后也保证测试期间两个版本都不会到点跑一轮）；之后 `settings.json` 有 v1.0 的 `libraryPath`（这个库）、`recentLibraries`（含它）与 `schedule`（刚改的），对照：没有 `libraries.json`，库的 `streams.json` 里没有 `schedule`；**v2 包 N**：同一页的「主题」从默认的河蓝（对照：`settings.json` 里还是 `river` 或没有）改成**夜间**（`night`：唯一一个迁移时连外观一起变的），`settings.json` 存了、页面画的是它 |
| 3 | **反向在前**：替身给错的 sha256 →「检查更新」→「有新版本：1.0.0」→「下载」→ `verify_failed`，`updates\` 是空的，没有启动任何东西，`main.log` 写着「did not pass the check (sha256); deleted, nothing runs」；替身改回对的 → 再检查 → 下载 → `ready`，`updates\Streams-1.0.0-setup.exe` 与 1.0.0 安装包逐字节相同；应用问的恰好是 GitHub 的两个真地址各两次（`Accept`、`User-Agent: Streams/0.9.0`），替身收到的正是这四次；除了替身与本机假 RSS 没有别的请求；代理陷阱为空（`STREAMS_DEV_UPDATE_URL` 没生效）；陷阱文件夹全空（`STREAMS_DEV_UPDATE_SETUP_RECORD` 没生效） |
| 4 | **慢退出**：harness 在这一次运行里把应用的第一次 `will-quit` 扣住 8 秒（`slowExitMs`，应用代码不改；窗口已关、`Streams.exe` 还活着、占着程序文件 —— 忙的机器上旧版退得慢的样子）。「开始更新」→ 应用启动的正是下好的那个文件，参数恰好是那五个加 `/STWAITPID=<这个 Streams.exe 的进程号>`，`detached` / `stdio: 'ignore'` / `windowsHide`；之后有 `before-quit`、`will-quit`、`exit`，进程在启动安装程序之后至少 7 秒才结束。安装程序跑完、卸载项变成 1.0.0、流息从安装目录重新起来（它的 `main.log` 有起动时看 `updates\` 的那一行），随即被结束（它没有 harness，窗口在屏幕上）；从「开始更新」到这里不到 2 分钟 |
| 5 | 程序目录与 1.0.0 的 stage 逐个文件对上（另外只有 `unins000.*`）；名字以「流息」开头的卸载项只一条，`DisplayVersion` 1.0.0、`MajorVersion` 1；两个快捷方式还指向 `Streams.exe`；安装日志：恰好一行 `Wait for the app to exit: process <那个进程号> exited after <n> ms`，n 至少 4 秒，在 `Calling RestartManager's RmGetList` 与 `Starting the installation process` 之前，没有 `RestartManager found an application using one of our files`；旧版文件先删了（答案 1）、装完重新打开了（1）、卸载项是这一版 |
| 6 | 再起一次（harness）：打包态、1.0.0；**v2 包 J2，v1.0 数据的迁移**（迁移发生在安装程序重新打开的那个 1.0.0 —— 新版的第一次启动）：`libraries.json` 建出来了（`streams.libraries/1`），里面恰好是 v1.0 那个库（路径、名字 = 文件夹名「安装测试库」—— 11-15 前叫「我的库」，与左栏分组的字重名，改了；第 6 步另核这个名字不是应用的字）且是当前库，`main.log` 有 `library: the registry made from settings.json: 1 libraries, current …`；**重设计 R6c**：首屏是这个库的**待看**（`main[data-screen="inbox"]`；概览在 R1 去掉了，原来这里找 `overview`），左栏那一行就是它且是当前的；库架上一张卡，是它、当前；定时**搬进了库的 `streams.json`**（正是第 2 步改的那个时刻），`getSchedule` 答的也是它；`settings.json` 的 `libraryPath`、`recentLibraries`、`schedule` 与 0.9.0 留下的完全相同（只读未写）；**主题迁移（v2 包 N 加；重设计 R6c 换成现在的表，维护者 11-11、R1 契约）**：三个 v1.0 的 id 都变成**默认主题**（现在是研究对话）—— 主题从装好的 `src\main\theme.mjs` 读（`appWords`），测试里不写 —— 外观是 river → 默认外观（跟随系统）、paper → 浅色、night → 深色（测试里只写这张「哪个 id 变哪种外观」的表 `V1_APPEARANCE`）；对照：装好的默认值与仓库的相同、装好的 `migrateLook` 对三个 id 的回答与这张表逐个相同（`theme.mjs` 的迁移与表不一致就红）；v1.0 的夜间 → `getAppState` 是默认主题 + `dark`（scheme `dark`），页面 `<html>` 的 `data-theme` / `data-appearance`、`<body>` 的模板 class 与 `data-appearance` 同样，窗口底色 = `THEME_PAGE[默认主题].dark`；`settings.json` 里除 `theme` 以外 v1.0 写的每个字段原样（`theme` 要么还是 `night`、要么已是默认主题 + `appearance: dark`）；再把测试用户的 `settings.json` 依次写成 v1.0 的 `river` / `paper` / `night`（其余照 v1.0 留下的），问装好的应用，逐个对上表，问完原样写回；**「关于」**：版本那一行在设置页的 `[data-part="about"]` 里，文字 = 装好的字典 `SETTINGS.version` 填上 1.0.0（现在是「流息 1.0.0（Windows 版）」；对照：不是开发版那一句），页头的版本标 `[data-part="version-chip"]` 同一句；那条笔记逐字节还在、库的索引里有它；`updates\` 空了；起动时没有问 GitHub；整轮代理陷阱为空、陷阱文件夹全空、`main.log` 里没有任何开关陷阱的痕迹（`trapLogLines`） |
| 7 | 静默卸载：卸载项、程序文件、快捷方式、通知激活器的键都没了；应用数据与库还在；真的机器上没有任何流息的痕迹（v2 包 N：不再拍、不再比真的 `%APPDATA%\Streams`、`%LOCALAPPDATA%\Streams`；有界面的卸载由 `packaged.test.mjs` 第 5 步与 `uninstall-ui.test.mjs` 核） |

结果写进 `installer/dist/upgrade-test-result.json`。

**握手的各种情况 `wait-pid.test.mjs`**（约 20 秒，任何机器）：真的 `streams.iss` 对着一个小 stage 编译（测试自己的身份，与 `install-delete.test.mjs` 同一套隔离与清理；另编一份 `WaitPidTimeoutMs=2000` 的看超时），每次带应用的开关（`/SILENT` 换成 `/VERYSILENT`、不带 `/STRELAUNCH`）静默装进本轮文件夹，用测试自己起的、会多活几秒的进程（`node -e "setTimeout(…)"`）：A 给它的进程号 → `exited after <n> ms`、n ≥ 3 秒、在开始安装之前，装好了；B **反向**：同样一个活着的慢进程、不给参数 → 只有 `no /STWAITPID given`，没有 `exited after`，安装程序跑完时那个进程还活着（没等它）；C `/STWAITPID=12ab`、`/STWAITPID=0` → `is not a process id`；D 一个已经退出的进程号 → `is not running`；E 2 秒上限、活 8 秒的进程 → `still running after <n> ms (limit 2000 ms)`，安装照常完成。收尾卸载。

## 八、已知限制

1. **没有签名**：安装包与 `Streams.exe` 都是「未知发布者」，SmartScreen 会拦（§四 的两步）。应用自己下载的更新包没有「来自网络」标记、经 `CreateProcess` 启动，SmartScreen 不拦；用户从浏览器下载时照旧会拦。没有签名也意味着：更新包是否可信全靠 GitHub API 经 HTTPS 给的 `digest`（能改发布的人也能改 digest）。
2. **只有 Windows x64**。现在（发版 1.0.0，2026-11-16 实测，§10.7）：安装包 136,173,094 字节（约 136.2 MB / 129.9 MiB），装好 550 个文件、430,314,990 字节（约 410.4 MiB；另加卸载程序的 2 个文件），其中 Electron 的 72 个文件与通知文件共 383,551,001 字节，两款字体 42,898,476 字节。历次的数字见第 11 条。
3. **会安装的两个测试要一台没有真安装的机器（或 Windows 用户）**：守门见到流息的卸载项、快捷方式或通知激活器的键就拒跑，也不许为了跑测试去动真安装。`install-delete`、`uninstall-entry`、`wait-pid` 用测试自己的身份，不受这一条限制。
4. **测试写真 `HKCU`**：卸载项与通知激活器的键是真的两个（Windows 不让环境变量挪 `HKCU`）；每个会安装的测试结束时卸载、`after` 里无论成败再补一次。测试被强行中断在收尾之前，这两个键可能留下：下一次守门会因此拒跑；跑那一轮临时文件夹里的 `unins000.exe`，或手动删这两个键（v2 包 N 起：中断时安装目录还在，所以守门照旧拒跑；目录也没了的话，守门认作残留、下一轮的装卸会清掉）。另：从某些桌面应用（如 Claude 桌面版）的工具 shell 里跑时，进程看到的是该应用的私有注册表视图（云织 `docs/installer.md` 11.6 查到过；流息 11-10 又查到一次，§十一）—— 测试的写与读在同一个视图里，自身一致；要确认真注册表要从资源管理器起的进程去读（`node installer/real-registry.mjs`）。**这也是给 维护者 装的时候要避开的**：§四最后一条。
5. **真更新测试里，被安装程序重新打开的流息没有 harness**：它的窗口与托盘图标会出现在屏幕上几秒（测试随即结束它）；Windows 可能把这个托盘图标记在通知区域的设置里（`HKCU\Control Panel\NotifyIconSettings`，按程序路径，指向已删的测试文件夹）。
6. **packaged 测试的安装用的是真的用户文件夹**（为了核开始菜单与桌面上的真快捷方式）：测试期间约一两分钟，真的开始菜单与桌面上有「流息」，卸载时删掉；测试结束后再查一遍没有。
7. 打包测试要 `--inspect-brk`（`EnableNodeCliInspectArguments` fuse 开着）。
8. `[InstallDelete]` 只认**新版** stage 顶层的名字：旧版独有、新版已经不发的顶层文件会留在程序目录里（云织 `docs/installer.md` 11.5 第 6 条）。
9. **握手只有一个方向、有上限**（11-04 补）：应用把自己的进程号交给安装程序，安装程序在 Restart Manager 动手之前最多等 60 秒；超过 60 秒还没退（机器极忙、进程挂住），安装照常往下走，仍由 Restart Manager 去关它 —— 那时的行为与握手之前一样，可能再卡在关程序那一步。等待的这段时间里安装程序的界面不处理消息（`/SILENT` 的进度窗口可能显示「未响应」，最多 60 秒）。进程号在应用退出后可能被系统分给别的进程：极少见的情况下安装程序会等一个无关的进程，最多 60 秒。安装程序不回报应用：安装中途失败（用户取消、磁盘满）时旧版本仍在，不会自动重新打开。
10. **（11-09 v2 包 J2 查出并修了）打包后的 v2 曾在 Windows 给不出「文档」文件夹时起不来**：`desktop/src/main/main.mjs` 原来在启动时就算 `join(app.getPath('documents'), 'Streams')`（新建库的默认位置），`getPath` 抛错 → `start failed`，应用退出、没有窗口。安装测试的用户文件夹原来没有 `Documents`，v2 第一次在装好的样子下跑就撞上了。玄翎 11-09 定修法，现在：默认位置由 `desktop/src/main/library-root.mjs` 在**第一次用到时**才算，`documents` 取不到退到 `<用户主目录>Streams`（`getPath('home')`），再取不到退到 `<应用数据>libraries`，退的时候 `main.log` 记一行 `library: the default place for a new library is … (no documents folder: …)`，应用照常启动；什么文件夹都不建。核法：`desktop/test/library-root.test.mjs`（`getPath` 换成替身：`documents` 抛错 → 主目录；两个都不行 → 应用数据；建服务时不问；开发运行不问；`main.mjs` 里不再有自己的 `getPath('documents')` —— 旧代码下这几条是红的）与 `packaged.test.mjs` 第 4b 步（装好的应用、测试用户的 `Documents` 删掉再起：对照先核 `getPath('documents')` 在这里确实抛错，应用照样起来，默认位置是 `<home>Streams`，`main.log` 有那一行、没有 `start failed`）。测试用户平时仍有 `Documents`（`world.mjs appEnv`，真的用户文件夹都有）。
11. **（v2 包 J2）stage 与安装目录的大小**：v2 的 stage 是 512 个文件、386,899,036 字节（多了 `@mozilla/readability` 14 个文件与 v2 的源码）；上面第 2 条的数字是 11-04 的。**v2 包 N（下一版）**：stage 525 个文件、404,855,643 字节，其中界面字体 `NotoSansSC-VF.ttf` 17,773,244 字节（加它的 OFL 4,434 字节）；安装包 124,407,717 字节（约 124.4 MB / 118.6 MiB），比 J2 的 116,163,537 字节大约 8.2 MB —— 字体压缩后的大小。 **重设计 R6c（现在，合并 R6b 之后）**：stage 550 个文件、430,300,381 字节 —— 比包 N 多 25 个文件、25,444,738 字节：标题字体 `NotoSerifSC-VF.ttf` 25,125,232 字节与它的 OFL 4,301 字节，模板 `renderer/template/` 24 个文件 156,523 字节，其余是 R1–R6b 的源码增减（R6b 删了占位屏 4 个文件；拷进去的：Electron 72、desktop 175（其中 4 个是两款字体与各自的 OFL —— 构建记录的 `copied.font: 4` 是这 4 个再数一次，不另加）、核心 112、`@mozilla/readability` 14、preact 131、htm 41、图标 1、LICENSE 1，共 547 个；构建自己写的 3 个：`resources\app\package.json`、`resources\core\package.json`、`THIRD-PARTY-NOTICES.txt`；合计 550。合并 R6b 之前那一版是 554 个文件、430,296,707 字节、安装包 136,167,840 字节，作废）；安装包 136,169,338 字节，比包 N 的 124,407,717 字节大 11,761,621 字节（约 11.8 MB），几乎都是 Serif 字体压缩后的大小。发布说明的大小那一行写着两款字体各自的字节数。**重设计 R6d**：stage 仍是 550 个文件（各类拷进去的个数与 R6c 相同），430,314,974 字节，比 R6c 多 14,593 字节，都是 R6d 改的源码；安装包 136,172,747 字节（§10.6）。**发版 1.0.0（现在）**：stage 550 个文件、430,314,990 字节（版本号字符串多 16 字节）；安装包 136,173,094 字节（§10.7）。
12. **（v2 包 N）有界面的卸载测试会在屏幕上弹框**：`packaged.test.mjs` 第 5 步与 `uninstall-ui.test.mjs` 起的卸载程序是可见的（与用户双击一样），三个对话框各停约 0.3–1 秒、由测试点掉；跑测试时别去点它们（点了「是」的话 —— 只会删测试自己用户文件夹里的数据，测试随即因对话框的答案不对而红）。
13. **（v2 包 N）工具 shell 的注册表视图**：从 Claude 桌面版的工具 shell 里装的东西，卸载项只在那个视图里（§十一）。测试自身一致（同一视图里装、同一视图里卸），但给 维护者 的安装不能这样起（§四最后一条）。
14. **（重设计 R6c）不安装的演练不是安装测试**：`docs/checks/2026-11-13-r6c/rehearsal/rehearse.mjs` 把构建的 stage 拷到临时文件夹、用同一个 harness 起那份 `Streams.exe`，原样跑 `packaged.test.mjs` 的第 3、4、4b 步或 `upgrade.test.mjs` 的第 6 步（不装、不卸、不写注册表与快捷方式；本机装着流息、守门拒跑时也能跑），并能先在副本里做一处变异。它核的是页面那几步与变异能不能被抓到；安装、快捷方式、卸载、真更新（第 1、2、5 步，更新测试的第 1–5、7 步）只有真的测试文件核。更新那一步的演练里，「v1.0 留下的数据」是由现在的应用建库后改写出来的，不是真的 v1.0 写的。

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
- **11-10 v2 包 N**（安装包与安装测试跟上下一版 K2 / L / M，查清卸载登记残留；每处在文件里注明「v2 package N」）：
  - `installer/setup/streams.iss`：**没有改**（残留的原因不在安装包，§十一）。
  - `installer/build-installer.mjs`：发布说明加「这一版有什么」（新主题与外观、旧主题的换算、Noto Sans SC、右栏四个标签、排队、左下角「套餐已用」/「API 余额」）与安装包的 MB 数、字体文件的大小；版本号、`pre_release` 与发版日期一字没写成已定。字体的要求只对样式里加载字体的应用（有 `styles/fonts.css`）—— K2 起它让更新测试造 0.9.0（v1.0 的应用，没有字体）那一步 `STOP`，`upgrade.test.mjs` 7 条全红；工作区的应用没有 `fonts.css` 照样停。
  - `installer/real-registry.mjs`（新）：从资源管理器起的进程读真注册表里流息的卸载项与通知键，与本进程看到的并排报（§十一）。
  - `installer/test/dialogs.mjs`（新）：有界面的卸载与它的三个对话框（§五「有界面的卸载」）。
  - `installer/test/uninstall-ui.test.mjs`（新，3 条）。
  - `installer/test/machine.mjs`：`deadLeftovers`、`liveInstallHere`（守门分清真安装与残留）。
  - `installer/test/packaged.test.mjs`：第 0 步守门用 `liveInstallHere`、不再拍真的应用数据、核卸载程序的用户文件夹；第 3 步加外观（首帧颜色）、字体、许可证里的字体、右栏、左下角；第 5 步改成有界面的卸载（答否）；`after` 的补卸也以测试用户跑。
  - `installer/test/upgrade.test.mjs`：守门同上、不再拍真的应用数据；第 2 步 v1.0 主题改夜间；第 6 步核迁移与整张表。
  - `installer/test/world.mjs`：`STREAMS_DEV_QUOTA` 的陷阱（`QUOTA_TRAP_LINE`）。
  - `docs/installer.md`（本文：§四、§五、§七表、§八、§九、§10.4、§十一）。

- **11-13 重设计 R6c**（安装包与安装测试跟上重设计 R1–R6a；契约 `docs/checks/2026-11-13-r6c/contract.md`；每处在文件里注明「redesign R6c」）：
  - `installer/setup/release.json`：`pre_release` `dev.0` → `dev.1`、`app_ver_name`「流息 1.0.0-dev.1」（维护者 11-13 定；`version`、`output_base_filename`、`app_guid` 没动）。根、`desktop`、`core`、`wording` 四个 `package.json` 的 `version` 跟成 `1.0.0-dev.1`（npm 自己的，应用不读；`desktop/package-lock.json` 里记的同一个版本号跟着改了两处，没有测试写死它）。`desktop/src/main/version.mjs` 的一行注释（说 desktop/package.json 是 `0.2.0-dev.0`）改对 —— 本包在 `desktop/src` 里只改了这一行注释。
  - `installer/setup/streams.iss`：`chs.DeleteAppData` 对照 05-措辞规范改了三处（§四）。别的没动。
  - `installer/build-installer.mjs`：发布说明「这一版有什么」重写成重设计后的样子（四套主题、左栏与库架、库页四个标签、右栏四个标签、一种提议与主 Agent、首次打开与新建库、新应用图标与衬线字体），中英各一份；大小那一行写上两款字体各自的字节数；「安装与卸载」三行换成 05 的说法（卸载那句列全应用数据、与对话框一致，并写明两种选择下库都不删）。**「界面文字已按统一措辞改写」一条没有写**（11-14 晚第一轮预检查出：装进去的字典还没经过 R6b，`texts/inbox.js` 仍有「没有打分」、`texts/settings.js` 仍有「流水线正在跑：等这一轮跑完再更新。」；合并 R6b 后重打时再加）。「未在干净机器上验过」一节原字不动；版本号与发版日期仍没有写成已定。
  - `installer/test/world.mjs`：`trapSwitches` 补上 5 个开关（17 个全了）；`DETECT_TRAP_VERSION`、`trapLogLines`；陷阱文件夹多一个 `library-root`。
  - `installer/test/switches.test.mjs`（新，3 条，不用构建；11-14 晚按第一轮预检改成去掉注释后扫名字、守卫只认续行，加 `main.mjs` 以外的读法核对与 `layout.mjs` 的拒绝核对，路径改用 `path.relative`）。
  - `docs/checks/2026-11-13-r6c/rehearsal/`（新）：`rehearse.mjs`（不安装的演练，§八 第 14 条）、`mutants.mjs`（变异体）、`run-all.mjs`（逐个跑、汇总）、`results-*.json` 与 `runs/*.txt`（§10.5 的变异表就是它们）。
  - `installer/test/use-case-a.mjs`：删 `firstRunToInbox`，加 `appWords`；`v1FirstRunToInbox`、`packRoundSchedule`、`keepCurrent`、`openAbout`、`updateState` 没改。
  - `installer/test/packaged.test.mjs`：第 3 步重写（§五表）；仓库的字典不再读（只留仓库的默认外观与主题表作对照 —— 主题表的对照是 11-14 晚按第一轮预检加的）；文件头、第 4b 步的一句注释跟上。第 0、1、2、4、5 步与 `after` 没改。
  - `installer/test/upgrade.test.mjs`：第 6 步（§七表）与只有它用的常量（迁移表换成 `V1_APPEARANCE`，主题与底色从装好的代码读）、文件头第 6 步的说明。守门、第 0–5 步、第 7 步没改。
  - `docs/installer.md`（本文：§〇、§四、§五（含开关陷阱表与两道守卫那一段）、§六 第 6 条、§七表第 6 行、§八 第 2 / 11 / 14 条、§九、§10.5）。
  - 桌面端、核心、措辞表、验收测试都没改（除上面那一行注释）。
  - **11-15 按第二轮预检修补**（两份预检报告：一致性与对抗；都不动会进安装包的文件，所以安装包没有重打，仍是 §10.5 的 `b283f6ac…`）：
    - `switches.test.mjs`：守卫管不到的地方（三元式的 ` : ` 之后、以 `:` 开头的续行、`||`、`;`）、`main.mjs` 以外经别名取开关（`e.X`、`e['X']`、`{ X } = e`）、单独的 `'STREAMS_'` 前缀，各自报出，各带对照（§五表）。
    - `use-case-a.mjs`：加 `isAppWord`。`packaged.test.mjs` / `upgrade.test.mjs`：测试库的文件夹名「我的库」→「安装测试库」（「我的库」是左栏分组的字），第 3 步 / 第 6 步先核它不是应用的字（对照：「我的库」是）；`upgrade.test.mjs` 只改了这个常量与第 6 步，第 2–5 步的代码一字没动（0.9.0 那一轮建库用的文件夹名跟着变了）。`packaged.test.mjs` 第 3 步 `listProposals` 那句断言的说明改对（它核不到 `STREAMS_DEV_PROPOSALS`：陷阱不是 JSON，应用认了也造不出提议；核这个开关的是上一句 `trapLogLines`）。
    - 演练：`mutants.mjs` 加变异 `row-name-group-word`（左栏一行画成分组的字）与反向对照 `CONTROLS.words-changed`（只改装上的字典里五处字，第 3、6 步应照样过 —— 证明 R6b 改字后测试不用改）；`rehearse.mjs` 认对照；`run-all.mjs` 的说明改成与代码一致（它只判「有测试红了」，红在哪一句由 `runs/*.txt` 读、写在 §10.5），等待超时被抓的行标 `timeout`，`as-built` 可以单独点名重跑，对照必须过。
    - 日期一律写东部时间（之前几处写的是 UTC 日期 11-15，实际是东部时间 11-14 晚）。

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

### 10.4 2026-11-10 v2 包 N（从 `748bc0c` 加本轮未提交的改动）

- **构建**：变异核对做完、源文件逐字节还原之后，连跑两次 `node installer/build-installer.mjs`：两次都是 `Streams-1.0.0-setup.exe` **124,407,717 字节（约 124.4 MB / 118.6 MiB），SHA256 `4c4f4b123f596d6efcce7831c540d08d0903bdfa912ab2afa4854ce11bdb2c3e`**（`certutil` 实算；第二次「previous build: byte-identical」；与本轮最早一次构建也是这个值）；`build-record.json` 的 `installer.sha256` / `bytes`、发布说明里写的 sha256 与字节数都是它，`release_notes.sha256` 与发布说明文件实算相同。stage 525 个文件、404,855,643 字节（`tree_sha256` `0a6c95d2…`）；拷进去的：Electron 72、desktop 157、字体 2、核心 105、`@mozilla/readability` 14、preact 131、htm 41、图标 1、LICENSE 1。版本号、`pre_release` 没改。
- **测试** `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：**31 条：31 过、0 失败、0 跳过、0 todo**，373 秒（多了 `uninstall-ui` 3 条）。`packaged`：安装 8.5 秒、有界面的卸载 5.4 秒（三个框依次是 / 否 / 确定）；首次起：`precision` + `system`，Windows 此刻浅色，窗口底色 `#F6F6F3`，served `<html lang="zh-CN" data-theme="precision" data-appearance="light">`；Noto Sans SC `loaded`；右栏四个标签、「详情」当前；左下角没有。部件表：Electron 44.0.0 · Chromium 152.0.7977.54 · Node.js 24.18.1 · Preact 10.29.8 · htm 3.1.1 · @mozilla/readability 0.6.0 · Noto Sans SC 2.04（OFL-1.1）。`upgrade`：0.9.0（`b3b5512` 的应用）造了 43 秒、116,022,124 字节；更新 25 秒；夜间 → `precision` + `dark`、窗口 `#151515`，三个旧 id 逐个对上表。本轮第一次跑 `packaged` 时守门报了 维护者 的残留（§11.4 那一行），那一轮之后工具 shell 里再也读不到它。
- **能失败**（变异体 13 个、跑了 14 次（「不看文件夹与卸载程序」改测试前后各一次），每次改一个文件、跑对应测试、写回原字节并核 sha256，14 次都「restored byte for byte: true」；会进安装包的那几个先用改过的源码重新构建）：
  - `uninstall-ui`：`usPostUninstall` 往卸载键写值 → 3 条全红；「是」不删 → 第 2 条红；「否」也删 → 第 1 条红；`deadLeftovers` 总返回空 → 第 3 条红；`deadLeftovers` 不看文件夹与卸载程序 / 只不看文件夹 / 不看通知键的 `Streams.exe` → 第 3 条红（第一次做时「不看文件夹与卸载程序」那个**活下来了**：完整安装的对照有快捷方式，`deadLeftovers` 第一行就返回空，碰不到文件夹那一段；对照改成把快捷方式拿掉、只留一样再问，并删掉 `unins000.exe` 再问一次，之后三个都红）。
  - `packaged`（重新构建后跑）：默认外观改成浅色 → 第 3 步红；`fonts.css` 指向不存在的字体文件 → 第 3 步红（字体面不是 `loaded`）；右栏标签换顺序 → 第 3 步红；左下角在什么都没读到时也显示 → 第 3 步红。（第 3 步红了，第 5 步跟着在「应用数据还在」那一句红 —— 第 3 步没走到写设置；卸载本身照样做完。）
  - `upgrade`（重新构建后跑）：迁移表 `night → light` → 第 6 步红（「v1.0's night migrated」）；`paper → system` → 第 6 步红（「v1.0's paper → precision + light」）。
- **复现脚本** `node installer/test/registry-view-repro.mjs`（17:20 再跑一次）：装完「this process sees the entry: true; a process Explorer starts: gone」；资源管理器起的卸载程序三个框是 / 否 / 确定；卸完「the program folder there: false; this process sees the entry: true; a process Explorer starts: gone」；最后清掉。
- **其余各套**（一套一套跑）：`core` 585/585；`wording` 18/18；`desktop` 432 条 431 过、1 跳过（sharp，照旧）；`node tests/acceptance/run.mjs` **12 / 12**（V1 读的是上面这个 `4c4f4b12…` 的安装包与它的发布说明）；`node tests/acceptance/v2-draft/run-draft.mjs` **6 / 6**（N6 重拍的 `docs/shots/acceptance-v2/` 已 `git checkout` 还原）。
- **跑完查过**：工具 shell 的视图里，名字含「流息」「Streams」或 `st-` 的卸载项一条都没有，流息与三个测试身份的卸载项、通知键都不在；`node installer/real-registry.mjs`：`thisProcess` 与 `startedByExplorer` 两个键都是 `false`、退出码 0（真注册表里也没有）；真开始菜单、真桌面没有流息的 `.lnk`；`%LOCALAPPDATA%\Programs\Streams` 不在；系统临时文件夹里没有 `st-installer-*`、`st-upgrade-*`、`st-uninstall-*`、`st-install-delete-*`、`st-probe-*`、`is-*-uninstall.tmp`；没有 `Streams.exe` 在跑。通知区域的记录（`HKCU\Control Panel\NotifyIconSettings`）里与流息有关的三条都不是本轮测试的：一条指向 `%LOCALAPPDATA%\Programs\Streams\Streams.exe`（之前那次真安装）、两条指向开发用的 `electron.exe`（仓库与一个 worktree 里的）—— 清不清是 维护者 的事，没碰。测试没有读写真的 `%APPDATA%\Streams`（`installer/test` 里不再有 `process.env.APPDATA` 的用法；卸载程序与应用都以测试用户跑）。

### 10.5 2026-11-14 / 11-15 重设计 R6c（工作区 `.claude/worktrees/r6c`，分支 `redesign-r6c`，从 `8ced533` 加本包未提交的改动；时间都是东部时间 EST）

- **本包没有提交**（施工方不提交）：`build-record.json` 的 `from.head` 是 `8ced533`、`from.uncommitted` 列着本包改动的 16 项。stage 里没有任何东西取自提交号，同样的源码出同样的安装包；PM 提交后要再连打两次、全套安装测试再跑一遍，记录里的 HEAD 才是本包的提交（契约 R6c-5）。11-13 那一轮的安装包（`40d28738…`、136,167,820 字节）与 11-10 包 N 的（`4c4f4b12…`）都作废。
- **版本号**：`release.json` `pre_release: dev.1`、`app_ver_name: 流息 1.0.0-dev.1`，`version` 1.0.0、`output_base_filename` `Streams-1.0.0-setup`、`app_guid` 没动；根、`desktop`、`core`、`wording` 四个 `package.json` 都是 `1.0.0-dev.1`（`desktop/package-lock.json` 里记的同一个版本号跟着改了两处 —— 本包在 `desktop/` 下改的只有它、`desktop/package.json` 与 `version.mjs` 那行注释，§九）。装上之后：卸载项 `DisplayName`「流息 1.0.0-dev.1」、`DisplayVersion` 1.0.0；安装程序的版本信息 FileDescription「流息 1.0.0-dev.1」、FileVersion 1.0.0.0、ProductVersion 1.0.0；**`Streams.exe` 的版本信息里没有 dev.1**：FileDescription「流息」、FileVersion / ProductVersion 1.0.0 —— 这是包 N 起的设计：`release.json` 的 `about` 写明 `pre_release` 只进 `app_ver_name`，`Streams.exe` 的版本号与应用显示、更新比较的是同一个 `version`（`desktop/src/main/version.mjs VERSION_RE` 只认数字）。即带 dev.1 的说法只在卸载项的名字与安装程序的说明里，两处与 `release.json` 一致（`packaged-test-result.json` 的 `entry`、`versionInfo`，与 `build-record.json` 记的相同）。
- **构建**（11-14 21:42–21:46）：`node installer/build-installer.mjs` 连跑两次（111 秒、99 秒；ISCC 各 70 秒；`dist` 没有先清：第一次与它之前那次构建比是「stage 相同、安装包不同」—— 那次在 21:38 最后一次改 `streams.iss` / `build-installer.mjs` 之前，作废）：两次都是 `installer/dist/Streams-1.0.0-setup.exe` **136,167,840 字节（约 136.2 MB / 129.9 MiB），SHA256 `b283f6ac2066d8e990528cf2a4ca8e23d1b95488384e6c312b2b53a1c072a0c8`**（每次构建后 `sha256sum` 实算，两次相同；第二次 `build-record.json` 记 `previous.same_installer: true`、`same_stage: true`，stage 没有一个文件变）；11-15 再算一次 `dist` 里的安装包仍是它。发布说明 `release-notes-1.0.0.md` 的 SHA256 `554c586b…`，里面写的 sha256 与字节数就是上面的。11-15 按第二轮预检改的都是测试、演练与本文，不进安装包，所以**没有重打**。
- **stage**（合并 R6b 之前的这一版；现在的数字见本节末「合并 R6b 之后」一条）：554 个文件、430,296,707 字节（`tree_sha256` `d9c65ca8…`）；拷进去的：Electron 72、desktop 179（含两款字体与各自的 OFL 4 个）、核心 112、`@mozilla/readability` 14、preact 131、htm 41、图标 1、LICENSE 1，构建写的 3 个（§八 第 11 条）。`resources/app/src/renderer/template/` 24 个文件 156,523 字节在；`fonts/NotoSerifSC-VF.ttf` 25,125,232 字节、`NotoSansSC-VF.ttf` 17,773,244 字节在；`resources/app/assets/icon/streams.ico` 的 SHA256 `684cdbf2…` 与 `desktop/assets/icon/streams.ico` 相同（新图标）；组件一览的三个 DEV_ONLY 文件（`screens/kit.js`、`texts/kit.js`、`styles/screens/kit.css`）不在 —— 清单里名字带 kit 的只有应用自己的部件库 `renderer/kit/*.js` 14 个与 `styles/kit.css`。
- **卸载对话框那句**（`chs.DeleteAppData`）：对照 05-措辞规范改了三处（§四），装好后有界面的卸载三个框的字与 `.iss` 逐字相同（第 5 步、`uninstall-ui`）。
- **本机流息**：维护者 11-13 约 19:05 自己卸了（他的应用数据留着）；PM 查过 `real-registry.mjs` 退出码 0、`%LOCALAPPDATA%\Programs\Streams` 与两个「流息.lnk」都不在。他的 `%APPDATA%\Streams` 留着，本包的测试与脚本都没有读写它（应用与卸载程序都以测试用户跑，§五）。
- **测试**（11-15 11:49–11:57，安装包仍是上面的 `b283f6ac…`，测试文件是 11-15 修补后的）：`node installer/real-registry.mjs` 退出码 0（`thisProcess`、`startedByExplorer` 两个视图里卸载项与通知键都是 `false`）→ `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：**38 条：38 过、0 失败、0 跳过、0 todo**，375 秒（`packaged` 6、`upgrade` 7、`stage-check` 6、`wait-pid` 5、`fonts` 4、`switches` 3、`uninstall-ui` 3、`install-delete` 2、`deltree` 1、`uninstall-entry` 1）→ `node tests/acceptance/run.mjs` **12 / 12 通过**（2026-11-15T16:56:35Z；哨兵按预期红；V1 的自动化前置读的是上面这个安装包与它的发布说明）→ `real-registry.mjs` 退出码 0（两个视图都没有）。11-14 21:46–21:55 同一个安装包、修补前的测试文件已经跑过一遍：38 / 38、471 秒，验收 12 / 12，注册表前后都是 0。
  - `packaged`（各步：装 13.8 秒、扫描 9.0、用例 A 25.9、退出 3.7、4b 5.4、有界面的卸载 7.8；`installSeconds` 9.5、`uninstallSeconds` 5.5）：卸载项「流息 1.0.0-dev.1」；装上的 554 个文件与 stage 逐字节相同；首次起：`research` + `system`，Windows 此刻浅色，窗口底色 `#F7F7F3`，served `<html lang="zh-CN" data-theme="research" data-appearance="light">`，`<body class="theme-research r9 r9-research r11 r11-research">`；字体规则：`Yunzhi Noto` → `app://ui/template/shared/fonts/NotoSansSC-VF.ttf`、`Workbench Numerals`（只有 `local()`）、`Noto Serif SC` → `app://ui/fonts/NotoSerifSC-VF.ttf`；三个字体面都 `loaded`，两次 `check` 为真；画标题「连接模型」的是 `Noto Serif SC`（`isCustomFont: true`）；`app://` 发回的两个文件 17,773,244 与 25,125,232 字节、sha256 与装上的相同。部件表：Electron 44.0.0 · Chromium 152.0.7977.54 · Node.js 24.18.1 · Preact 10.29.8 · htm 3.1.1 · @mozilla/readability 0.6.0 · Noto Sans SC 2.04 · **Noto Serif SC 2.003**（OFL-1.1），两款字体的通知行与 OFL 全文都过了（R6a 的 Serif 断言第一次真跑是 11-13 19:27 那一轮，对着当时的安装包 `40d28738…`）。harness 记下的请求只有两次去本机假 RSS 的 `GET /feed`（表单里的就地试抓与创建并运行），代理陷阱为空；收藏的是 `安装测试库\notes\2026-11-15-streams-installer-check-the-first-item.md`，`validateNote` 没有问题，一条提醒 `unknown-topic:未分类`（用表单建的库没有主题，核心给的兜底主题，与 10.1 起一样）。
  - `upgrade`：0.9.0（`b3b5512` 的应用）造了 47 秒、116,022,165 字节；更新 25 秒（安装日志 `Wait for the app to exit: process 29048 exited after 8016 ms`）；`libraries.json` 恰好是「安装测试库」且是当前库；v1.0 的夜间 → `research` + `dark`、窗口 `#161A19`；三个旧 id 逐个对上表（river → research + system，paper → + light，night → + dark），表由装上的 `theme.mjs` 的 `migrateLook` 核过；关于的版本行 = 字典 `SETTINGS.version` 填 1.0.0。
- **不用安装的演练**（`docs/checks/2026-11-13-r6c/rehearsal/`，§八 第 14 条）：本机装着流息时先用它把第 3 步、第 6 步对着真的打包应用走通（11-13），之后用它做变异。照原样跑：`packaged` 4 条全过（stage 副本 + 第 3、4、4b 步原文，11-15 11:31–11:33，93 秒）、`upgrade6` 2 条全过（造数据 + 第 6 步原文，11-15 11:44–11:45，82 秒）。
- **能失败**（变异与对照都改在 stage 的临时副本里，源码与安装包一个字节不动；`node docs/checks/2026-11-13-r6c/rehearsal/run-all.mjs packaged|upgrade6 [名字…]`，每次的报告在 `rehearsal/runs/<哪个>-<名字>.txt`，汇总在 `rehearsal/results-packaged.json`、`results-upgrade6.json`。下表由这两个文件生成，「第一处失败」是报告里第一条失败的说明，泛泛的 `Expected values to be strictly equal` 换成了报告里 actual / expected 说的事）。`packaged` 的变异 11-14 21:57–22:40 全部跑过一遍；11-15 第二轮预检之后，照原样那次、反向对照、新加的 `row-name-group-word`，以及被改到的断言所在的 `sidebar-word`、`switch-STREAMS_DEV_LIBRARY`、`switch-STREAMS_DEV_PROPOSALS` 重跑（11:31–11:44）。**30 个变异全被抓到、0 个活着**；其中 3 个是靠等待 120 秒超时抓到的（页面一直没到测试等的那一步：`item-actions-hook`、`switch-STREAMS_START_SCREEN`、`switch-STREAMS_DEV_LIBRARY`，结果文件里标 `timeout: true`），1 个是应用起不来（`switch-STREAMS_DEV_ASK_SCRIPT`）；`run-all.mjs` 只判「这一轮有测试红了」，红在哪一句是读报告逐个核的，写在表里。反向对照 `words-changed`（只改装上的字典里五处字：右栏四个标签、左栏「设置」、分组「我的库」、「暂时跳过…」、关于的版本行）第 3、4、4b 步**照样全过** —— R6b 改字后测试不用改。

| 变异 | 类 | 改了什么（stage 副本里） | 红的测试 | 第一处失败 | 怎么被抓 | 秒 |
|---|---|---|---|---|---|---|
| `default-theme` | 外观 | 默认主题与仓库的不同 | 3、4 | `the installed code's default look is the repository's` | 断言 | 66 |
| `default-appearance` | 外观 | 默认外观与仓库的不同 | 3、4 | `the installed code's default look is the repository's` | 断言 | 66 |
| `first-start-theme` | 外观 | 首次起画的不是默认主题 | 3 | `the default theme, following Windows (which is light now)` | 断言 | 71 |
| `theme-page-colour` | 外观 | 主题表的底色与仓库的不同 | 3、4 | `the installed theme table is the repository's` | 断言 | 65 |
| `word-skip` | 界面字 | 「暂时跳过」画成别的字 | 3 | 连接选择底部两个按钮的字：画出来是 [重新检测, 重新检测]，字典是 [重新检测, 暂时跳过…] | 断言 | 71 |
| `panel-tabs-order` | 界面字 | 右栏标签换顺序 | 3 | `the right panel: four tabs, the detail tab current` | 断言 | 80 |
| `hook-skip` | 钩子 | 跳过按钮的 data-action 改名 | 3 | 同一句：找不到 [data-action=skip-connection]，第二个按钮是 null | 断言 | 74 |
| `brief-not-required` | 钩子 | 追踪要求不再必填 | 3 | 追踪要求空着时「必填…」那行（字典 NEW_LIBRARY.briefRequired）没出现 | 断言 | 77 |
| `serif-file-gone` | 字体 | Serif 字体文件拿掉 | 3 | `NotoSerifSC-VF.ttf is in the stage and installed` | 断言 | 72 |
| `sans-file-gone` | 字体 | Sans 字体文件拿掉 | 3 | `NotoSansSC-VF.ttf is in the stage and installed` | 断言 | 72 |
| `serif-file-broken` | 字体 | Serif 字体文件截断 | 3 | `the heading font's face is loaded: [["Yunzhi Noto","loaded"],["Workbench Numerals","loaded"],["Noto Serif SC",` | 断言 | 72 |
| `sans-file-broken` | 字体 | Sans 字体文件截断 | 3 | `the interface font loads from its file: "error: A network error occurred."` | 断言 | 72 |
| `serif-family` | 字体 | Serif 的族名改掉 | 3 | `the title's font names the heading font's family (Noto Serif XX) before the interface font's: Workbench Numera` | 断言 | 75 |
| `item-actions-hook` | 钩子 | 条目动作区的 data-id 去掉 | 3 | 等资料库标签打开刚收藏那条、带查看原文的动作区 120 秒没等到 | 等待超时 | 210 |
| `switch-STREAMS_WINDOW` | 开关 | `STREAMS_WINDOW` 打包态被认 | 3 | `a tray icon was made (through the stand-in): the window is not hidden by a switch` | 断言 | 71 |
| `switch-STREAMS_START_SCREEN` | 开关 | `STREAMS_START_SCREEN` 打包态被认 | 3 | 等首次打开一屏（main[data-screen=first-run]）120 秒没等到（陷阱的值是 settings：首屏被换掉） | 等待超时 | 190 |
| `switch-STREAMS_DEV_SYSTEM_LANGUAGES` | 开关 | `STREAMS_DEV_SYSTEM_LANGUAGES` 打包态被认 | 3 | `the connection choice's title and heading, the installed words` | 断言 | 71 |
| `switch-STREAMS_DEV_CHOOSE_FOLDER` | 开关 | `STREAMS_DEV_CHOOSE_FOLDER` 打包态被认 | 3 | `the dialog's folder: C:\Users\you\AppData\Local\Temp\st-installer-16956-b37f5b18\traps\choose-folder` | 断言 | 77 |
| `switch-STREAMS_DEV_CONNECTION` | 开关 | `STREAMS_DEV_CONNECTION` 打包态被认 | 3 | 对照「首次起、还没有 settings.json」：开发连接让应用一起来就选了连接、写了设置 | 断言 | 72 |
| `switch-STREAMS_DEV_NOW` | 开关 | `STREAMS_DEV_NOW` 打包态被认 | 3 | `kept today (not STREAMS_DEV_NOW's day)` | 断言 | 83 |
| `switch-STREAMS_DEV_QUOTA` | 开关 | `STREAMS_DEV_QUOTA` 打包态被认 | 3 | `no development switch left a line in main.log` | 断言 | 82 |
| `switch-STREAMS_DEV_LIBRARY_ROOT` | 开关 | `STREAMS_DEV_LIBRARY_ROOT` 打包态被认 | 3、4b | `the default place for a new library: C:\Users\you\AppData\Local\Temp\st-installer-37444-1f92dc59\traps\libra` | 断言 | 71 |
| `switch-STREAMS_DEV_DETECT` | 开关 | `STREAMS_DEV_DETECT` 打包态被认 | 3 | 同上：陷阱说两种工具都已登录，应用一起来就选了连接、写了设置 | 断言 | 71 |
| `switch-STREAMS_APP_DATA` | 开关 | `STREAMS_APP_DATA` 打包态被认 | 3、4b | 测试用户的 settings.json 里没有 setupConnection: skipped —— 设置写进了陷阱文件夹 | 断言 | 73 |
| `switch-STREAMS_DEV_ASK_SCRIPT` | 开关 | `STREAMS_DEV_ASK_SCRIPT` 打包态被认 | 3、4、4b | 应用起来就退出（解析不是 JSON 的陷阱抛错），调试口连不上 | 应用起不来 | 66 |
| `switch-STREAMS_DEV_AGENT_SCRIPT` | 开关 | `STREAMS_DEV_AGENT_SCRIPT` 打包态被认 | 3 | `no development switch left a line in main.log` | 断言 | 83 |
| `words-changed` | 反向对照 | 只改装上的字典（应照样过） | 无（全过） | — | 过了（对） | 93 |
| `row-name-group-word` | 界面字 | 左栏库的一行画成分组的字 | 3 | `the sidebar: the new library is the one row, current` | 断言 | 84 |
| `sidebar-word` | 界面字 | 左栏「设置」画成「库架」 | 3 | `the sidebar of the first run: new library, the shelf with 0, the main agent, no library row, settings` | 断言 | 72 |
| `switch-STREAMS_DEV_LIBRARY` | 开关 | `STREAMS_DEV_LIBRARY` 打包态被认 | 3、4b | 同一处等待超时（陷阱把一个空文件夹当作开着的库，不出首次打开）；4b 也红 | 等待超时 | 310 |
| `switch-STREAMS_DEV_PROPOSALS` | 开关 | `STREAMS_DEV_PROPOSALS` 打包态被认 | 3 | `no development switch left a line in main.log` | 断言 | 84 |

`upgrade6`：11-14 22:41–22:50 照原样与 5 个变异跑过；11-15 11:45–11:49 照原样、反向对照、新加的 `row-name-group-word` 重跑，`default-theme` 单独重跑（11-14 那次它的造数据一步先因 harness 的 `Debugger.disable` 120 秒没应答而失败，环境不干净；这次造数据一步过了，第 6 步红在默认外观那一句）。**6 个变异全被抓到**，对照照样过：

| 变异 | 类 | 改了什么（stage 副本里） | 红的测试 | 第一处失败 | 怎么被抓 | 秒 |
|---|---|---|---|---|---|---|
| `first-start-theme` | 外观 | 首次起画的不是默认主题 | 6 | `theme.mjs migrateLook: v1.0's river → research + system` | 断言 | 81 |
| `migrate-night-light` | 迁移 | night → 浅色 | 6 | `theme.mjs migrateLook: v1.0's night → research + dark` | 断言 | 77 |
| `migrate-paper-system` | 迁移 | paper 不在表里 | 6 | `theme.mjs migrateLook: v1.0's paper → research + light` | 断言 | 76 |
| `about-dev-line` | 关于 | 关于里的版本行总是开发版那句 | 6 | 关于的版本行画成「流息 1.0.0 开发版（Windows 版）」，字典 SETTINGS.version 是「流息 1.0.0（Windows 版）」 | 断言 | 80 |
| `words-changed` | 反向对照 | 只改装上的字典（应照样过） | 无（全过） | — | 过了（对） | 82 |
| `row-name-group-word` | 界面字 | 左栏库的一行画成分组的字 | 6 | `the sidebar's one library row, current` | 断言 | 77 |
| `default-theme` | 外观 | 默认主题与仓库的不同 | 6 | `the installed code's default look is the repository's` | 断言 | 75 |

静态测试 `switches.test.mjs` 的对照在测试里自带（§五表）；另用第二轮预检的变异脚本（17 项：一项照原样、一项 `read-in-preload` 的文件不在被复制的范围里跑不起来、其余 15 个变异）对 11-15 修补后的测试跑过：照原样 0 红，13 个红：此前活下来的 `ternary-colon-escape`（`… && false ? null` 换行 `: process.env.STREAMS_DEV_DETECT`）与 `alias-env-in-service`（`const e = process.env; e.STREAMS_DEV_QUOTA`）都红了；`traplog-drop-proposals-mark`、`traplog-drop-agent-mark`（从 `trapLogLines` 拿掉提议文件、主 Agent 脚本两个记号）不红 —— 等价变异：这两个陷阱文件在陷阱文件夹里，那一行带着文件夹的路径，`trapLogLines` 本来就按文件夹路径也认，那两个记号是重复的。`STREAMS_DEV_UPDATE_URL`、`STREAMS_DEV_UPDATE_SETUP_RECORD` 不在演练里变异（演练不做真更新），由 `upgrade` 第 3–5 步核（§五）。
- **PM 提交后重打与重测**（11-15 约 15:30–15:43，东部时间；契约 R6c-5）：本包提交为 `aeca771`（分支 `redesign-r6c`）。在这个提交上 `node installer/build-installer.mjs` 连跑两次（90 秒、82 秒），两次都是 136,167,840 字节、SHA256 `b283f6ac2066d8e990528cf2a4ca8e23d1b95488384e6c312b2b53a1c072a0c8`（每次构建后 `sha256sum` 实算），与上面未提交时那两次逐字节相同；`build-record.json` 记 `from.head: aeca771`、`from.uncommitted: []`、`previous.same_installer: true`、`same_stage: true`。随后 `node installer/real-registry.mjs` 退出码 0（两个视图里卸载项与通知键都是 `false`）→ `node --test --test-concurrency=1 "installer/test/*.test.mjs"`（15:33:57–15:42:02）**38 条：38 过、0 失败、0 跳过**，485 秒 → `node tests/acceptance/run.mjs` **12 / 12 通过**（2026-11-15T20:42:58Z，V1 读的是这个安装包）→ `real-registry.mjs` 退出码 0。上面「本包没有提交」「HEAD 是 8ced533」两句说的是提交之前；记这一段的提交只改本文，不进 stage。
- **合并 R6b 之后重打与重测**（11-15 17:2x–18:03，东部时间）：main（R6b `9214797`、权限规则 `98dae44`）合进 `redesign-r6c`，没有冲突（`8091484`）；发布说明「这一版有什么」中英加「界面文字统一」一条（`69847db`，五种状态用 R6b 的词）。在 `69847db` 上：核心 642 / 642、措辞表 19 / 19、桌面端 566 / 566（设了 `STREAMS_SHARP_DIR`）；`node installer/build-installer.mjs` 连跑两次（90 秒、83 秒），两次都是 **136,169,338 字节、SHA256 `4c5fb66656f3d900a3c9bc96d407079a59b1e29c78eb2213f7a164a93fc8030f`**（`sha256sum` 实算；第一次比上一个包「stage 不同」——R6b 改了字典、删了占位屏 4 个文件，第二次 byte-identical）；`build-record.json` 记 `from.head: 69847db`、`from.uncommitted: []`；stage 550 个文件、430,300,381 字节（`tree_sha256` `fe0dd5ff…`）；发布说明 SHA256 `2763d376…`。随后 `real-registry.mjs` 退出码 0 → 全套安装测试（17:54:42–18:02:18）**38 条：38 过、0 失败、0 跳过**，456 秒 → 验收 **12 / 12 通过**（2026-11-15T23:03:10Z，V1 读的是这个安装包）→ `real-registry.mjs` 退出码 0。上面 `b283f6ac…` 那个包（R6b 之前）作废，给 维护者 的是这一个。演练变异没有重跑：它们改的是 stage 副本里 R6c 自己的断言，R6b 只改字典，反向对照 `words-changed` 已证明改字典字测试照样过。记这一段的提交只改本文，不进 stage。
- **本包没跑的**：桌面端、核心、措辞表的整套（本包没改它们的代码，只改了 `version.mjs` 一行注释与四个 `package.json` 的版本号）。合并 R6b 之后在 main 上各套重跑、重打一次安装包（那时发布说明加「界面文字已按统一措辞改写」一条，§九）、全套安装测试再跑一遍，记在这里之后。
- **测试里看到的应用自身的问题**（不归本包，没改应用，记给 PM；R6d 已修，见 §10.6）：收藏的笔记文件头里 `collected` 取的是 UTC 的日期（`core/src/pipeline/decide.mjs` 用 `firstSeen.slice(0, 10)`），`date` / `kept` 是本地日期，东部时间晚上收藏两者差一天（第二轮预检读 11-14 晚那一轮的结果：`collected: 2026-11-15`、`kept: 2026-11-14`；11-15 上午这一轮两者同一天，看不出来）；用新建库表单建的库没有主题，笔记带 `topics: [未分类]`，`validateNote` 给提醒 `unknown-topic:未分类`。

### 10.6 2026-11-16 重设计 R6d（主工作区 main，在 R6d 的提交 `f50d282` 上；时间都是东部时间 EST）

- **构建**（15:59–16:05）：在 `f50d282` 上 `node installer/build-installer.mjs` 连跑两次（97 秒、100 秒）。两次都是 `installer/dist/Streams-1.0.0-setup.exe` **136,172,747 字节（约 136.2 MB / 129.9 MiB），SHA256 `386bf77abe9d515f5cc7e45b84bc9a0ef70eee8b5a84d819ec9446772bc1bdff`**，每次构建后都用 `sha256sum` 实算。
  - 第一次构建的 `previous` 是主工作区 `dist` 里留着的 11-10 包 N 的 `4c4f4b12…`（R6c 是在它自己的工作区里打的），所以记「stage 不同、安装包不同」。
  - 第二次 `previous.same_installer: true`、`same_stage: true`，stage 一个文件都没变。
  - `build-record.json` 记 `from.head: f50d282`。`from.uncommitted` 只有两项未跟踪的：`.claude/worktrees/` 与 `rel.json`，都不进 stage（`stage-manifest.json` 里两个名字都是 0 处）。
  - stage 550 个文件、430,314,974 字节（`tree_sha256` `ad63d0c4…`）；拷进去的各类个数与 §10.5 相同（Electron 72、desktop 175、核心 112、@mozilla/readability 14、preact 131、htm 41、图标 1、LICENSE 1，构建写的 3 个）。
  - 发布说明 `release-notes-1.0.0.md` 的 SHA256 是 `6bb6a95f…`，里面写的大小与 sha256 就是上面这两个数。
  - R6c 的 `4c5fb666…` 作废，给 维护者 的是这一个。
- **测试**（16:41–16:51）：
  1. `node installer/real-registry.mjs`：退出码 0（`thisProcess`、`startedByExplorer` 两个视图里，卸载项与通知键都是 `false`）。
  2. `node --test --test-concurrency=1 "installer/test/*.test.mjs"`（16:41:08–16:50:20）：**38 条：38 过、0 失败、0 跳过、0 todo**，552 秒。
  3. `node tests/acceptance/run.mjs`：**12 / 12 通过**（2026-11-16T21:51:16Z）；哨兵按预期红；V1 的自动化前置读的是这个安装包与它的发布说明。
  4. `real-registry.mjs`：退出码 0（两个视图都没有）。
- **R6d 修的两处，在装好的应用里核过**：`packaged-test-result.json` 记的那条收藏的笔记：
  - `collected: 2026-11-16`、`kept: 2026-11-16`，是同一天；
  - `topics: [未分类]`，`validateNote` 的 `problems` 与 `warnings` 都是空的。§10.5 末记的 `unknown-topic:未分类` 提醒没有了。
- **装好的样子**：装上 552 个文件、437,357,597 字节（stage 的 550 个，加卸载程序的 2 个）；卸载项「流息 1.0.0-dev.1」、`DisplayVersion` 1.0.0。
- **同一提交上的其他套**（不进安装包，记在这里方便对照）：
  - 核心 645 / 645、措辞表 19 / 19；
  - 变异体：核心 58 / 58；桌面端 227 / 227，按 维护者 11-16 定的分三批同时跑，其中 `r4a-raw-fetch-message` 改成了两处都退回，见 `docs/checks/2026-11-15-r6d/总验收.md`「PM 提交后的复核」；
  - v2 草案 6 / 6（2026-11-16T21:52:13Z；它重拍的 `docs/shots/acceptance-v2/` 只差画面上的时间，已还原成提交里的那一版）。
  - 桌面端全套是总验收在同一份代码上跑的（596 / 596）。
- **本机流息**：没有装（两个视图里卸载项都是 `false`）。本次没有读写 维护者 的 `%APPDATA%\Streams`；应用与卸载程序都以测试用户跑（§五）。

### 10.7 2026-11-16 发版 1.0.0（主工作区 main，在发版提交 `0e40900` 上；时间都是东部时间 EST）

- **版本号**：维护者 11-16 定，今天以正式 1.0.0 发，不带 dev.1。
  - `installer/setup/release.json` 去掉 `pre_release`，`app_ver_name` 改为「流息 1.0.0」，说明里那句跟着改；`version` 1.0.0、`app_guid`、`output_base_filename` 都没动。
  - 根、`core`、`desktop`、`wording` 四个 `package.json` 与 `desktop/package-lock.json` 的两处改为 `1.0.0`；`desktop/src/main/version.mjs` 的注释跟着改。
  - 发布用的代码与配置里不再有 `dev.1`（历史记录除外）。应用显示的版本不变（一直只认数字 1.0.0）；变的是卸载项的名字与安装程序的说明，都从「流息 1.0.0-dev.1」变成「流息 1.0.0」。
- **构建**（18:07–18:09）：在 `0e40900` 上 `node installer/build-installer.mjs` 连跑两次（86 秒、79 秒）。
  - 两次都是 `installer/dist/Streams-1.0.0-setup.exe` **136,173,094 字节（约 136.2 MB / 129.9 MiB），SHA256 `2c1049172a9085eb1b067c7495908ae4fad2324de3894936c9ca102e4c78f416`**（每次构建后 `sha256sum` 实算）。
  - 第二次记 `previous.same_installer: true`、`same_stage: true`。
  - `build-record.json` 记 `from.head: 0e40900`，`from.uncommitted` 只有两项未跟踪的：`.claude/worktrees/` 与 `rel.json`，不进 stage。
  - stage 550 个文件、430,314,990 字节（`tree_sha256` `5af09039…`），比 R6d 的多 16 字节，都是版本号字符串。
  - 安装程序的版本信息：FileDescription「流息 1.0.0」、ProductVersion 1.0.0；构建传给 ISCC 的 `AppVerName=流息 1.0.0`（即卸载项名字）。
  - 发布说明 `release-notes-1.0.0.md` 的 SHA256 是 `b69866e2…`，里面的大小与 sha256 就是上面这两个数，并写着未签名、未在干净机器上验过。
  - R6d 的 `386bf77a…` 作废，发出去的是这一个。
- **同一提交上的其他套**：
  - 核心 645 / 645、措辞表 19 / 19；
  - 桌面端全套 596 / 596（设了 `STREAMS_SHARP_DIR`，18:09:48–18:36:51，1,623 秒）。
- **安装测试**（20:23–20:29）：**本机此时装着流息**，是 维护者 今天下午从资源管理器自己装的 R6d 包 `386bf77a…`，卸载项「流息 1.0.0-dev.1」，`real-registry.mjs` 的 `startedByExplorer` 视图里卸载项与通知键都在，退出码 1。所以要真装真卸的测试按守门拒跑（§八 3）。维护者 当次定不卸，用不安装的演练代替。
  - `node --test --test-concurrency=1 "installer/test/*.test.mjs"`：38 条中 **25 过、13 条被守门拒跑**。拒跑的是 `packaged` 第 1–5 步 6 条、`upgrade` 第 1–7 步 7 条，拒跑的原话是「Streams looks installed on this machine (…流息.lnk…): this test installs and uninstalls, so it does not run here」。过的 25 条：`stage-check` 6、`wait-pid` 5、`fonts` 4、`switches` 3、`uninstall-ui` 3、`install-delete` 2、`deltree` 1、`uninstall-entry` 1。
  - 不安装的演练（§八 14，`docs/checks/2026-11-13-r6c/rehearsal/rehearse.mjs`，直接用它，不经 `run-all.mjs`，所以不写 R6c 的记录）：`packaged`（stage 副本 + 第 3、4、4b 步原文）**4 / 4**，94 秒；`upgrade6`（造数据 + 第 6 步原文，「关于 says 1.0.0」）**2 / 2**，83 秒。stage 里 `resources/app/package.json` 的版本是 1.0.0。
  - `node tests/acceptance/run.mjs`：**12 / 12 通过**（2026-11-17T01:25:38Z），V1 读的是这个安装包与它的发布说明。
- **这一次没有实测的**：真装、快捷方式、有界面的卸载、真更新（`packaged` 1、2、5，`upgrade` 1–5、7）。
  - 理由：这几步只有真的测试文件核，而它们要一台没装流息的机器。
  - 上一次全过是 §10.6 的 R6d 包（38 / 38），两次的代码只差版本号字符串。
  - `installer/dist/packaged-test-result.json` 与 `upgrade-test-result.json` 仍是 §10.6 那一轮写的（卸载项名字还是「流息 1.0.0-dev.1」），这一轮没有重写它们。
  - 维护者 卸掉本机的 R6d 包之后，可以照 §〇 再跑全套补上。
- **本机流息**：维护者 装的那份没有被测试或演练读写、启动或卸载；演练的 harness 把应用数据挪到临时文件夹（§八 14）。

## 十一、卸载后留下的卸载登记（v2 包 N，2026-11-10）

### 11.1 现象

维护者 11-10：双击 `%LOCALAPPDATA%\Programs\Streams\unins000.exe`，跑完，问删数据时选「否」。程序文件夹与两个快捷方式都没了，但 `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{DF025A05-FA12-4432-B947-B637FA08A8F1}_is1` 还在 —— `DisplayName` 流息 1.0.0-dev.0、`DisplayVersion` 1.0.0、`InstallDate` 20261109、`Inno Setup: Selected Tasks` desktopicon、`Inno Setup: App Path` / `UninstallString` 指向已不存在的 `…\Programs\Streams\unins000.exe`。另外（本包查到）通知激活器的键 `HKCU\Software\Classes\CLSID\{10309C50-…}` 也在，`LocalServer32` 指向已不存在的 `…\Programs\Streams\Streams.exe`。现有安装测试都用 `/VERYSILENT /SUPPRESSMSGBOXES` 卸载，没有覆盖有界面的卸载。

### 11.2 查到的（证据）

1. **那条卸载项只在 Claude 工具 shell 的注册表视图里，真注册表里没有。** 11-10 16:09 从工具 shell（PowerShell）读：键在，值如上。同一时刻经资源管理器起的 `.cmd`（`explorer.exe C:\Users\Public\st-real-reg.cmd`：在包外运行，`reg query` 的结果写进文件）读同样两个键：`ERROR: The system was unable to find the specified registry key or value.`（卸载项与通知键都是），`dir %LOCALAPPDATA%\Programs\Streams`：`File Not Found`。
2. **工具 shell 是在 Claude 包的私有视图里**：工具 shell 的进程 `GetCurrentPackageFullName` 返回 15700（`APPMODEL_ERROR_NO_PACKAGE`：没有包身份），但 `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\SystemAppData\Helium\User.dat`（包的私有 `HKCU`）存在，最后写入 **2026-11-09 22:23:02** —— 与那条卸载项的 `InstallDate` 20261109 同一个晚上（云织 `docs/installer.md` 11.6 查到的同一种视图）。
3. **11-09 的那次安装是从工具 shell 起的**：玄翎会话的记录里，2026-11-10T03:07:31Z（11-09 22:07 EST）执行了 `Start-Process -FilePath "C:\Users\you\dev\streams\installer\dist\Streams-1.0.0-setup.exe"`，随后进程表里是 `Streams-1.0.0-setup` 与 `Streams-1.0.0-setup.tmp`（没带静默开关：向导在屏幕上，由人点完）。这样起的安装程序在 Claude 包的视图里写注册表 —— 卸载项与 `[Registry]` 的通知键都写进了私有视图；文件（程序目录、开始菜单、桌面）是真的。所以「设置 → 应用」里本来就看不见这一条（它读真注册表），维护者 也就只能双击 `unins000.exe` 卸。
4. **维护者 的卸载在包外跑，删的是真注册表里的（不存在的）那条。** 照他的路完整复现了一遍（测试身份 `st-probe-ui`、`{3C1B6F0E-…}`，同一份 `streams.iss` 编的小安装包）：从工具 shell 静默装 → 工具 shell 看得见卸载项、资源管理器起的进程看不见（`gone`）；再经资源管理器起 `unins000.exe`（不带任何开关，只有 `/LOG`；三个对话框由 `dialogs.mjs` 的 `watchDialogs` 答：是 → 否 → 确定），卸载日志：

   ```
   16:18:02.630   Current Uninstall EXE: C:\Users\you\AppData\Local\Temp\is-DKUG5XI1UB-uninstall.tmp\_unins.tmp
   16:18:02.636   Message box (Yes/No):
                  您确认要完全移除 st-probe-ui 及其所有组件吗？
   16:18:03.609   User chose Yes.
   16:18:03.679   Deleting registry key: HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\{3C1B6F0E-2D4A-4E7B-9A51-6B0D8E2F4C17}_is1
   16:18:03.679   Deleting registry key: HKEY_CURRENT_USER\Software\Classes\CLSID\{5E7A9C3B-1F2D-4B6E-8A0C-9D3E5F7B1A24}
   16:18:04.331   Uninstallation process succeeded.
   16:18:04.331   Removed all? Yes
   16:18:04.697   Message box (Yes/No):
                  是否同时删除流息的应用数据？ …
   16:18:05.048   User chose No.
   16:18:05.048   Message box (OK):
                  已顺利从您的计算机中移除 st-probe-ui。
   16:18:05.581   User chose OK.
   ```

   之后：程序目录没了；**工具 shell 仍看得见卸载项**，资源管理器起的进程看不见 —— 与 维护者 看到的一模一样。卸载程序自己认为删了（两行 `Deleting registry key` 之后没有关于注册表的失败；日志里的失败只有删程序目录时的两行 `Failed to delete directory (145). Will retry later.` —— 目录还没空，随后重试删掉了 —— 然后 `Removed all? Yes`）：它在真注册表里删一个本来就不在的键。复现脚本：`node installer/test/registry-view-repro.mjs`（测试身份，自己清理；只在 Claude 工具 shell 这类有私有视图的地方复现得出，在普通终端里两边是同一个视图、卸完两边都没有）。
5. **同一个有界面的卸载在同一个视图里跑，卸载项就没了**：同一时刻在工具 shell 里装、在工具 shell 里起卸载程序（16:16，日志行与上面相同：`Deleting registry key: …_is1`、`Uninstallation process succeeded.`、`Removed all? Yes`、`User chose No.`）→ 卸载项与通知键都没了。`uninstall-ui.test.mjs` 答否、答是各一遍，都是这样。
6. **不是 `[Code]` 写进卸载键的值**（`UninstallEntryVersion`）：它只在安装的 `ssPostInstall` 写，卸载时 Inno Setup 删的是**整个键**（`Deleting registry key`，不是逐个值）；测试身份的安装日志里它照样写了一行（`The uninstall entry shows this version: 9.0.0`），之后有界面的卸载照样把键删光。也不是卸载顺序或自我复制到临时目录：第一阶段的退出码 0，第二阶段（`_unins.tmp`）删键在问数据之前。
7. **残留的值也对得上 11-09 的那次**：`InstallDate` 20261109、`Selected Tasks` desktopicon（向导里桌面快捷方式默认勾着）、`App Path` 是默认的 `%LOCALAPPDATA%\Programs\Streams`（测试都装在临时文件夹里）。

### 11.3 原因

**不在安装包。** 11-09 那次安装是从 Claude 桌面版的工具 shell 里 `Start-Process` 起的：安装程序继承了工具 shell 的注册表视图，卸载项（与通知激活器的键）写进了 Claude 包的私有 `HKCU`（`Helium\User.dat`），文件写在真的磁盘上。维护者 11-10 从资源管理器双击 `unins000.exe`：卸载程序在包外，删了真文件、真快捷方式，删真注册表里的卸载项时那里本来就没有；私有视图里那一条（和通知键）没人删，工具 shell 一直看得见它。

### 11.4 修法与核法

- **安装包不改**（`installer/setup/streams.iss` 本包没动）：卸载的顺序、`[Code]`、自我复制都没有问题（上面 4–6）。
- **给 维护者 装、卸都从资源管理器起**（§四最后一条）：不在工具 shell 里 `Start-Process` / `spawn` 安装包；让 维护者 自己双击，或 `explorer.exe <安装包的完整路径>`。查真注册表：`node installer/real-registry.mjs`（新）—— 11-10 16:4x 更新测试装着的时候跑过一次，正好是反例：`thisProcess` 两个键都在、`startedByExplorer` 两个都不在、退出码 1；本轮全部测完后两边都不在（§10.4）。
- **测试顺带清掉那条残留**（维护者 11-10 同意）：守门原来见到卸载项或通知键就拒跑，那条残留会让 `packaged` / `upgrade` 永远跑不了。现在 `machine.mjs deadLeftovers`：卸载项指的文件夹与卸载程序都不在、通知键指的 `Streams.exe` 不在、两个快捷方式都没有 —— 是残留，不算安装（有一样还活着就照旧拒跑）。11-10 第一次跑 `packaged.test.mjs`：`before: leftovers of an install that is gone, removed by this run's install and uninstall: its uninstall entry (names C:\Users\you\AppData\Local\Programs\Streams\, gone); its toast activator key (names C:\Users\you\AppData\Local\Programs\Streams\Streams.exe, gone)`；它的安装（同一 AppId，`/DIR` 到临时文件夹）把卸载项与通知键重写，第 5 步的有界面卸载把两个都删了。之后工具 shell 里再也读不到它们。
- **有界面的卸载进了测试**：`packaged.test.mjs` 第 5 步（真安装包、真 AppId，答否）与 `uninstall-ui.test.mjs`（答否、答是、残留，§五「有界面的卸载」）。
- **能失败**（2026-11-10，`mutants.mjs` 在临时目录里，改一个文件、跑对应的测试、按原字节写回并核 sha256）：
  - `streams.iss` 在 `usPostUninstall` 里往卸载键写一个值（卸载完又把键建出来 —— 就是「卸完还在」的样子）→ `uninstall-ui` 3 条全红（「the uninstall entry is gone」）；
  - 「是」什么都不删（`= IDYES` 改成永不成立）→ 第 2 条红；「否」也删数据（改成总成立）→ 第 1 条红；
  - `deadLeftovers` 总返回空（守门回到包 N 之前）→ 第 3 条红；`deadLeftovers` 不看文件夹在不在（把活的安装当残留）→ 第 3 条红（对照那一句）。
  - 结果逐条见 §10.4。
- 若残留出在别的路径（例如测试被强行中断、安装目录还在）：守门照旧拒跑 —— 那是活的安装，按 §八 第 4 条处理。
