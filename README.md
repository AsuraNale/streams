# 流息 · Streams

**流息**（英文名 **Streams**）是一个装在 Windows 上的本地资料库软件：你告诉它盯哪个领域、从哪些来源抓；它每天去抓，让模型按你定的关卡打分，把过关的放进「待看」；你花几分钟看一遍，点收藏或放弃；收藏的变成一个 Markdown 文件进库。库里的东西能读、能改、能画成图、能拿来问。

- 库是一个 Markdown 文件夹，文件是真相，索引是生成物；卸了软件库还在，Obsidian 能开，git 能管。
- 机器推荐，人拍板：没有任何条目不经你点「收藏」进库。
- 模型用你自己的账号：连接你电脑上的 Claude Code / Codex，或输入任一厂商的 API key。软件不经手凭证。
- 开源、本地运行、第一版只做 Windows。

**Streams** is a local, open-source Windows app for people who track a field every day: it fetches from your sources, lets a model score each item at the gates you define, and nothing enters your library until you keep it. The library is a plain Markdown folder.

## 结构

| 目录 | 内容 |
|---|---|
| `core/` | 纯 Node 的核心：库（解析 / 校验 / 索引 / 账本）、抓取、流水线、连接器、核验层。无界面，有自己的测试。 |
| `desktop/` | Electron 外壳与页面（Preact）。 |
| `installer/` | 安装包：Electron 下载校验、Inno Setup。 |
| `wording/` | 界面用词：词表、禁用词、扫描器。 |
| `docs/` | 开发说明。 |
| `tests/acceptance/` | 发版验收 V1–V12。 |

## 下载与安装

第一版只做 Windows。公开仓 `AsuraNale/streams` 发布后，从它的 Releases 页面下载安装包（`Streams-<版本号>-setup.exe`）。

- 每个版本的安装包的 sha256 写在那个版本的发布说明里。下载后可以自己核对，例如在 PowerShell 里：`Get-FileHash .\Streams-1.0.0-setup.exe -Algorithm SHA256`，算出来的值应当和发布说明里的一致。
- 第一版的安装包**未签名**（没有代码签名证书）。所以运行它时，Windows 会弹出 SmartScreen 提示「Windows 已保护你的电脑」：点「更多信息」，再点「仍要运行」，就会开始安装。

**Download and install.** Windows only for now. Once the public repository `AsuraNale/streams` is up, download the installer from its Releases page. The SHA-256 of each installer is in that release's notes. The first release's installer is **not code-signed**, so Windows SmartScreen shows "Windows protected your PC": click "More info", then "Run anyway".

## 开发

需要 Node ≥ 24。各目录有自己的 `package.json`；核心无第三方依赖。

```
cd core && npm test
```

## 许可证

MIT，见 `LICENSE`。发布者 Starry Data & Technology Inc.

---

由 [Starry Digital](https://starrydigital.ca) 开发 · Developed by [Starry Digital](https://starrydigital.ca)
