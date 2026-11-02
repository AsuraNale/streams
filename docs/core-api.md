# 核心层函数签名（core-api）· 草稿 v0

> 2026-11-02 晚起草，11-03 晚定稿（方案 5.2：周三起核心与界面两条线并行，接口就是这份）。
> 原则：界面不直接读写库文件，一切经核心（方案 4.1）。核心是纯 Node、无界面、零依赖的 `@streams/core`，桌面主进程 `import` 它，经预加载桥暴露给页面。
> 状态列：**有** = 已落地有测试；**建** = 正在建（签名已定，建方按此做）；**定** = 签名定了，周三起做。

每个函数都是同步或返回 Promise；错误统一抛 `StreamsError`（带 `code`），或在返回值里用 `{ ok:false, code, detail }`（下面标明哪种）。所有路径参数都是库文件夹的绝对路径 `libraryDir`。

## 一、库（`src/library/`）· W1 · 有

| 函数 | 作用 | 返回 |
|---|---|---|
| `createLibrary(libraryDir, {name})` | 建一个空库：`streams.json`、`notes/`、`_pipeline/{inbox,cache,logs}`、空账本 | 抛 `exists` |
| `readConfig(libraryDir)` | 读 `streams.json` | `{ok, config}` / `{ok:false, code: missing \| invalid-json \| invalid-shape}` |
| `rebuildIndex(libraryDir)` | 全量重建 `index.jsonl` + `index.meta.json`；不碰 notes/ | `{entries, pending, meta}` |
| `readIndex(libraryDir)` | 只读索引（列表、搜索、图谱、问库候选都从这读） | `entries[]` |
| `listPending(libraryDir)` | 待规范清单，附拟好的文件头（不写盘） | `[{file, codes, messages, proposedHeader?}]` |
| `validateNote({fileName, text, config})` | 规范 v0 校验 | `{ok, meta, body, problems, warnings}` |
| `parseFrontmatter(text)` / `serializeFrontmatter(meta)` | 文件头读写（固定键序） | |
| `writeNoteFile(libraryDir, {id, header, body}, {by})` | **唯一写 notes/ 的函数**；`by` 只收 `'keep'` / `'import-header'`（V2） | 抛 `bad-by` / `id-conflict` / `invalid-note` |
| `appendEvent(libraryDir, ev)` / `replayLedger(libraryDir)` / `recordSeen(libraryDir, item)` / `isSeen(libraryDir, url)` | 账本只追加；重放得到每个 url 的当前状态 | |

## 二、抓取（`src/fetch/`）· W2 · 建

| 函数 | 作用 | 返回 |
|---|---|---|
| `fetchSource(source, ctx)` | 试抓一个来源，不写盘（S5「试抓」、加来源前的预览） | `{status: ok\|empty\|gap\|failed\|blocked, http?, message, retryAfterSeconds?, items[]}` |
| `fetchRound(libraryDir, {ctx})` | 一轮抓取：每个来源独立、写 `fetch_log.jsonl`、新条目经账本登记（第一层去重）、标题近似标 `maybe_duplicate_of`。抓到了但全是见过的 → 记 `empty`（count 记解析数、new 记 0）；账本写不进 → 记 `failed`，绝不记 empty；解析出块但 0 条可用 → `gap` | `{round, perSource[], newItems[], maybeDuplicates[]}` |
| `makeContext(opts)` | 一轮共用的上下文（fetchImpl、超时、时钟、sleep、arXiv 上次请求时间）。循环调 `fetchSource` 要先 `makeContext()` 一次再传同一个 ctx，否则 arXiv 间隔不共享 | ctx |
| `addManual(libraryDir, {url, title?, topic?})` | 手动投入一个链接 | `{added, url}`；抛 `bad-url` |
| `lastRoundStatus(libraryDir)` | 每个来源最近一轮状态与连续轮数（运行状态页 S11） | `{[name]: {status, consecutive, lastOkAt}}` |
| `sourceHealth(status)` | 首页横幅用的健康级别 | `{level: quiet\|warning\|blocked, lines[]}` |

五态内部码 → 界面词：ok 正常 · empty 没新内容 · gap 地址有问题 · failed 暂时失败 · blocked 被拒绝（翻译在 desktop 字典，核心只给码）。

## 三、连接（`src/connect/`）· W3 · 建

| 函数 | 作用 | 返回 |
|---|---|---|
| `createConnector(connection, deps)` | `connection = {kind: claude-code\|codex\|api, model, verifyModel?, api?}`；`deps.getKey(keyRef)` 由桌面的 safeStorage 提供 | 连接器对象 |
| `connector.detect()` | 只读检测（装没装、登没登录、有没有 key）。Codex 查找顺序：`connection.command` > PATH > 桌面版自带路径（`%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`、`~/.codex/.sandbox-bin`），多个取版本最高 | `{installed, loggedIn, version?, source?: command\|path\|desktop-app, path?, code?}` |
| `connector.probe()` | 一次最小真调用（S1「试了一次：可用」、S11「现在试一次」、每轮第 0 步自检） | `{ok, latencyMs, code?, detail?}` |
| `connector.complete({system?, prompt, format:'json', model?: 'main'\|'verify'})` | 单轮、无工具、拿回 JSON 与用量 | `{ok, json, text, usage, model}` / `{ok:false, code, detail}` |
| `completeJson(connector, req, {retries:1})` | 坏格式重试一次，再坏 `bad-format`（V5） | 同上，`attempts` |
| `connector.models()` / `resolveModel(connection, slot)` | 型号表；核验槽默认同主模型 | |
| `fakeConnector({mode})` | 假连接器：fixed / bad-format-once / bad-format-always / login-expired / counting / slow | |
| `readUsage(libraryDir, {month})` | 本月调用次数与 token | |

错误码：`not-installed` · `not-logged-in` · `login-expired` · `bad-key` · `bad-model` · `rate-limited` · `network` · `timeout` · `bad-format` · `refused` · `unknown`。

## 四、流水线与核验（`src/pipeline/`、`src/verify/`）· W4 · 定（11-04）

| 函数 | 作用 | 返回 |
|---|---|---|
| `selfCheck(libraryDir, connector)` | 第 0 步：库可写、索引校验、连接试调；任一失败本轮不开始（V6） | `{ok, problems[]}` |
| `estimateRound(libraryDir)` | 跑一轮前的用量预估（S12）：来源数、预计条目、预计调用、上限 | `{sources, paused, expectedItems:[lo,hi], expectedCalls:[lo,hi], cap}` |
| `runRound(libraryDir, {connector, cap, onProgress, signal})` | 抓取 → 去重 → 关卡① → 取正文 → 关卡② → 摘要 → 写 inbox → 运行记录；到上限停、强杀可续（队列从账本状态重建） | `{round, counts: {fetched, deduped, gate1, gate2, summarized, inbox}, calls, stoppedAt?}` |
| `previewNode(libraryDir, {connector, nodeId, url \| item})` | 「试一条看结果」（S4） | `{score, reason, verdicts}` |
| `listInbox(libraryDir)` | 待看（按分数排，带等待天数） | `[{url, title, date, source, scores, summary, waitingDays, verification}]` |
| `keep(libraryDir, url, {topics?})` | 收藏：唯一调用 `writeNoteFile(…, {by:'keep'})` 的地方；账本 kept；重建索引 | `{id, file}` |
| `dismiss(libraryDir, url, reason)` | 放弃：理由必填；账本 dismissed | 抛 `reason-required` |
| `later(libraryDir, url)` | 稍后：不动 | |
| `recentDismissReasons(libraryDir, n)` | 最近 n 条放弃理由（显示在关卡设置旁） | |
| `pipelineConfig(libraryDir)` / `savePipelineConfig(libraryDir, cfg)` | 关卡：要求、输出格式、过关线、材料范围；固定节点与底线项不可删 | 抛 `locked-node` |
| `verify(output, checklist, {connector, material})` | 核验层：规则项先、判定项后，退回只带没过的项，最多两轮；记 `verdicts.jsonl` | `{passed, rounds, items[], calls}` |
| `recentVerdictFailures(libraryDir, nodeId, n)` | 「最近没通过核验的原因」 | |
| `roundLog(libraryDir, roundId)` / `listRounds(libraryDir)` | 运行记录（A7） | |
| `homeNumbers(libraryDir)` | 首页数字全部从账本与 fetch_log 算（S2） | |

## 五、图谱、问库、导入、搜索 · 定（11-05）

| 函数 | 作用 |
|---|---|
| `graph(libraryDir, {days?, status?, topics?})` | 主题 → 来源 → 条目三层 + `[[链接]]` 虚线，只读 index，布局固定排序 |
| `search(libraryDir, q, {status?, days?})` | 标题、主题、正文全文 |
| `ask(libraryDir, question, {connector, strict:false})` | 候选 9 条 → 编号交给模型 → 校验出处编号在候选集内（V9）；记 `demand.jsonl` |
| `demands(libraryDir)` / `addDemand(libraryDir, topic)` | 想补的主题 |
| `importFolder(libraryDir)` | 只建索引 + 待规范；`applyProposedHeader(libraryDir, file)` 用 `writeNoteFile(…, {by:'import-header'})` |
| `editNote(libraryDir, id, {title?, topics?, body?})` | 编辑只改四样；来源、日期、分数只读；保存后仍合规范 |
| `openInObsidian(libraryDir, id)` | 桌面层做（shell.openExternal），核心只给路径 |

## 六、桌面桥（desktop 主进程 → 页面）

页面唯一入口 `window.streams`；主进程把上面每个函数包成桥方法（名字同核心函数，加 `library:` / `fetch:` / `connect:` / `pipeline:` / `ask:` 前缀），事件：`round-progress`、`inbox-changed`、`status-changed`、`settings-changed`、`update`。桥方法表写在 `docs/desktop.md`。

*玄翎 · 2026-11-02*
