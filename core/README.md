# @streams/core

流息 Streams 的核心层：纯 Node（≥ 24，ESM），无界面，零第三方依赖（`dependencies` 与 `devDependencies` 都为空）。W1 是「库」这一块：文件头解析与校验、索引重建、账本重放、待规范清单、建库、唯一的写 notes/ 入口。W2 是「抓取」：RSS / Atom、arXiv、Hacker News 三个抓取器、五态、礼貌规则、两层去重、手动投入、抓取日志与来源健康（见末尾「抓取」一节）。

## 跑测试

```
cd core
npm test            # = node --test "test/*.test.mjs"
```

- 测试框架：`node:test` + `node:assert/strict`。
- 临时目录：`os.tmpdir()/streams-core-tests/<用例名>`，用 `mkdirSync` 建（不用 `mkdtemp`，Windows ACL 不继承），每个用例开头清空自己的目录。
- 每个测试文件至少有一条 `sentinel:` 用例——一个必然要被拒绝的输入，证明测试在跑、断言在咬。
- 只有 `test/support/raw-notes.mjs` 会直接往 `notes/` 写字节，而且只给测试用（故意写坏文件、模拟 Obsidian 里手改）。

## 命令行

```
node bin/streams-core.mjs rebuild <libraryDir>   # 重建 index.jsonl + index.meta.json，列出被拒的文件
node bin/streams-core.mjs pending <libraryDir>   # 待规范清单（含拟定文件头）
node bin/streams-core.mjs replay  <libraryDir>   # 重放账本，输出每个 url 的当前状态
node bin/streams-core.mjs fetch   <libraryDir>   # 抓一轮（只抓取登记，不打分）；try-source <dir> <name> 试抓不写盘；status <dir> 来源状态
node bin/streams-core.mjs self-check <libraryDir> --connection <claude-code|codex|api|fake>      # 第 0 步自检
node bin/streams-core.mjs run        <libraryDir> --connection <…> [--model id] [--cap n]        # 完整一轮：抓取→关卡①→正文→关卡②→摘要→待看
node bin/streams-core.mjs estimate | inbox | rounds <libraryDir>                                   # 跑前预估 / 待看 / 运行记录
node bin/streams-core.mjs keep <libraryDir> <url>   ·   dismiss <libraryDir> <url> <reason>
```

`api` 的 key 只从环境变量 `STREAMS_API_KEY` 读（命令行开发用；桌面版走 safeStorage）。

输出 JSON 到 stdout；出错时 stderr 是 `{"error":{"code","message"}}`，退出码 1；用法错误退出码 2。

## 模块一览

| 文件 | 导出 | 作用 |
|---|---|---|
| `src/index.mjs` | 全部 | 统一出口 |
| `src/errors.mjs` | `StreamsError` | 带 `code` 的错误 |
| `src/library/frontmatter.mjs` | `parseFrontmatter(text)`, `serializeFrontmatter(meta)`, `KEY_ORDER` | 自写最小 YAML（标量、引号、行尾注释、`[a, b]`、块列表、两空格嵌套、`{ k: v }` 流式映射）。序列化固定键序 `id,title,source,source_name,date,collected,kept,status,topics,scores`，其余键按原顺序跟在后面；`scores` 写成「块映射 + 每关卡一个流式映射」，与规范样例逐字节一致 |
| `src/library/validate.mjs` | `validateNote({fileName,text,config})`, `NOTE_STATUSES`, `REQUIRED_FIELDS`, `isIsoDate` | 规范 v0 校验，纯函数，不碰磁盘 |
| `src/library/config.mjs` | `readConfig(libraryDir)`, `topicNames`, `nodeIds` | 读 `streams.json`；缺文件 / 非法 JSON / 形状不对分别报 `missing` / `invalid-json` / `invalid-shape` |
| `src/library/links.mjs` | `extractWikiLinks(body)`, `resolveLinks(targets,{byId,byTitle})` | `[[目标]]` / `[[目标\|显示]]` / `[[目标#节]]`；先按 id 精确匹配再按 title |
| `src/library/scan.mjs` | `scanLibrary(libraryDir)`, `listNoteFiles` | 索引与待规范共用的只读扫描：逐文件校验 + 重复 id 检查（两边永远不会对同一文件给出不同结论） |
| `src/library/index.mjs` | `rebuildIndex`, `readIndex`, `formatIndexLine`, `INDEX_KEYS` | 写 `index.jsonl` / `index.meta.json`，不碰 notes/ |
| `src/library/ledger.mjs` | `appendEvent`, `replayLedger`, `recordSeen`, `isSeen` | `_pipeline/ledger.jsonl`，只追加（`appendFileSync`） |
| `src/library/pending.mjs` | `listPending(libraryDir)` | 待规范清单 + `proposedHeader`（只是返回值，不写盘） |
| `src/library/write-note.mjs` | `writeNoteFile(libraryDir,{id,header,body},{by})` | **唯一**写 notes/ 的地方（V2）。`by` 只收 `'keep'` / `'import-header'` / `'edit'`；前两个 `wx` 独占创建，已存在抛 `id-conflict`；`edit` 只覆盖已存在且合规范的文件（临时文件 `<id>.md.<pid>.tmp` 再 rename），没有抛 `not-found`、不合规范抛 `not-editable`；写前先过校验，不合规范抛 `invalid-note` |
| `src/library/create.mjs` | `createLibrary(libraryDir,{name})` | 建 `notes/`、`_pipeline/{inbox,cache,logs}`、空 `ledger.jsonl` / `fetch_log.jsonl`、最小 `streams.json`（关卡默认 relevance / substance / freshness）；非空目录抛 `exists` |
| `bin/streams-core.mjs` | — | 最小命令行 |

## 库在磁盘上

```
<libraryDir>/
├─ streams.json        { name, topics:[{name,keywords}], sources:[], pipeline:{nodes:[{id}...]} }
├─ index.jsonl         生成物，可删，重建即得
├─ index.meta.json     { rebuilt_at, count, pending_count, warnings_count, problems:[{file,codes}] }
├─ notes/*.md          真相；文件名 = id
└─ _pipeline/
   ├─ ledger.jsonl     只追加
   ├─ fetch_log.jsonl  只追加，每来源每轮一行（见「抓取」）
   └─ inbox/ cache/ logs/
```

## 规范 v0 校验规则

**不合规范（problem）= 拒绝进索引，列入待规范，文件一个字节不改。**

| 代码 | 触发 |
|---|---|
| `no-frontmatter` | 第 1 行不是 `---`（带 `line: 1`） |
| `bad-frontmatter` | 文件头不闭合，或 YAML 解析失败（带行号与原因：重复键、tab 缩进、引号未闭合、`[` / `{` 未闭合、嵌套不支持……） |
| `missing:<field>` | `id` / `title` / `source` / `date` / `status` / `topics` 缺失、为空、为 null、为空列表 |
| `id-mismatch` | 头里的 `id` ≠ 文件名去 `.md` |
| `duplicate-id` | 两个文件头 id 相同（两个都不进索引）。同一文件夹内实际上由文件系统保证不会发生——Windows 文件名不分大小写，而 id 又必须等于文件名；代码仍保留检查以防大小写敏感的磁盘 |
| `bad-date:<field>` | `date` / `collected` / `kept` 不是 `YYYY-MM-DD` 或不是真实日期（`2026-02-30` 拒） |
| `bad-status` | 不在 `kept \| authored \| archived` |
| `bad-topics` | `topics` 不是列表，或含非字符串 / 空串 |
| `bad-scores` | `scores` 不是映射，或某关卡不是 `{ score: <数> }` / `{ value: <文> }`（二者取其一） |
| `bad-title` / `bad-source` / `bad-source_name` / `bad-id` | 文本字段给了列表或映射（纯数字会被转成字符串，不报） |

**警告（warning）= 仍进索引，但在 index 行的 `warnings` 和 meta 的 `warnings_count` 里标出。**

| 代码 | 触发 |
|---|---|
| `unknown-topic:<名>` | topics 里某项不在 `streams.json` 的 topics 里 |
| `unknown-score:<键>` | scores 的键不是 `pipeline.nodes` 里的关卡 id（方案原话：删了关卡，旧条目的分数保留，只是图谱和筛选不再用它） |

警告只在 `config` 给了时计算；没有 `config`（例如 `writeNoteFile` 写前自检）就不算警告。

### 警告 vs 不合规范的边界

- 不合规范 = 文件自身说不圆（缺字段、日期不存在、id 和文件名对不上、头解析不了）。无论 streams.json 怎么改，它都不合规范。
- 警告 = 文件自身完整，只是和**当前配置**对不上（主题改名了、关卡删了）。改配置就能消掉，不必动文件。

## index.jsonl 一行

键序固定：`id, title, source, source_name, date, collected, kept, status, topics, scores, links, links_unresolved, summary, words, mtime, warnings`。`JSON.stringify` 不加空格，每行 `\n` 结尾，按 id 排序（码元顺序）。

- `source_name` / `collected` / `kept` 没有就省略（不写 null）。
- `scores` 压平：`{score}` 取 score，`{value}` 取 value；没有 scores 写 `{}`。
- `links` = 正文 `[[…]]` 解析到的 id（去重、排序）；`links_unresolved` = 解析不到的原文（排序）。
- `summary` = 正文第一段纯文本（去 `**` `*` `_` `` ` `` `~`、`[[x|y]]`→y、`[t](u)`→t、行首 `>` / `-` / `1.`；标题行跳过），截 240 个码位。
- `words` = 中文字符数 + 拉丁单词数（`don't`、`split-this` 各算一个词；数字串算一个词）。
- `mtime` = 文件 mtime 的 UTC ISO 秒，无毫秒。
- `warnings` = 警告代码列表。

重建两次 `index.jsonl` 逐字节一致；`index.meta.json` 去掉 `rebuilt_at` 后一致（有测试）。重建前后 `notes/` 所有 `.md` 的 sha256 不变，包括坏文件（有测试）。

## 账本重放

事件：`seen | scored | unscored | inbox | kept | dismissed`。`appendEvent` 自动补 `ts`（ISO），缺 `ev` / `url`、未知 `ev`、`scored`/`unscored` 缺 `node`、`kept` 缺 `id` 都抛 `bad-event` 且不写盘。

重放得到 `{url, source, title, date, firstSeen, stage, scores:{node:{score|value, reason}}, unscored:{node:reason}, keptId?, dismissReason?, lastTs}`：

- 同一 url 第二次 `seen` 什么都不改（连 `lastTs` 也不动）。
- `kept` 与 `dismissed` 是终态：之后该 url 的任何事件都整条忽略（stage、scores、lastTs 都不动）。
- 没 `seen` 过的 url 收到别的事件也会建状态（`firstSeen` = 该事件的 ts），不丢信息。
- 坏行（非 JSON、不是对象、缺 ev/url、未知 ev、scored 缺 node）跳过并记 `skipped:[{line, reason}]`；空白行静默略过。
- `recordSeen` 对已见 url 返回 `{added:false}` 且不写行（V4 的账本一半）。

## 待规范清单

`listPending(libraryDir)` → `[{file, codes, messages, proposedHeader?}]`。`proposedHeader` 只在两种情况拟：

1. 没有文件头：`title` 取第一个 `# 标题`，否则取文件名；`source: file:<文件名>`；`date` 取文件 mtime 的**本地**日历日；`status: authored`；`topics: []`。
2. 有文件头、且问题**只有** `missing:source` / `missing:date`：原头照抄，只补缺的那一两项。

其他问题（缺 title、id 不符、日期坏、头解析不了）只给 codes/messages，不拟头。拟出来的头只是返回值，不写盘。

## 连接（W3，`src/connect/`）

三种连接对核心是同一个接口：给一段提示词和一个输出格式，拿回一个 JSON 和一个用量数。流水线和问库只认这个接口，连接器换了一行不改。

```js
import { createConnector, completeJson, fakeConnector, createUsageCounter, readUsage } from './src/connect/index.mjs';

const c = createConnector(
  { kind: 'claude-code' | 'codex' | 'api', model?, verifyModel?, command?, api?: { vendor, baseUrl?, keyRef } },
  { spawnImpl?, fetchImpl?, getKey?(keyRef), tmpRoot?, timeoutMs?, env?, platform? },
);
await c.detect();   // { installed, loggedIn: true|false|null, version?, code?, detail? }   只读：--version / auth status / login status；API 连接 = 有没有 key
await c.probe();    // { ok, latencyMs, code?, detail?, usage }                               一次最小调用，提示固定：只回 {"ok":true}
await c.openLogin({ title? }); // { ok: true, pid, command } | { ok: false, code: 'not-installed' | 'not-applicable' | 'unknown', detail }
//   在独立的可见终端窗口里起 CLI 自己的登录（claude auth login / codex login），stdio 全 ignore、起完放手；流息不经手凭据；登录完再 detect()。API 连接 → not-applicable
await c.complete({ system?, prompt, format: 'json', model?: 'main' | 'verify' | '具体 id' });
//   -> { ok: true, json, text, usage: { calls: 1, inputTokens?, outputTokens?, costUsd? }, model }
//   -> { ok: false, code, detail, text?, usage: { calls: 1 }, model }
c.models();         // 型号表；c.resolveModel(slot) -> 型号 id
```

- `verifyModel` 不填 = 同主模型；`model` 不填：Claude Code / Codex 不传 `--model`（用工具自己的默认），API 用该厂商表里的 recommended。
- key 只经 `deps.getKey(keyRef)` 在请求那一刻取（桌面层的 safeStorage 提供）；核心不存、不打印；`connection.api.key` 直接拒绝（`bad-connection`）；错误 detail 里出现的 key 会被 `scrub` 成 `<key>`（有测试：服务器把 key 回显进 401 / 400 的 body 也抓得住）。
- `completeJson(connector, req, { retries: 1, onRetry })`：坏格式时把固定提醒（`RETRY_SUFFIX`）接在提示词后再试一次；第二次还坏 → `{ ok:false, code:'bad-format', attempts: 2 }`，`usage.calls` 累计；别的失败（登录、网络）不重试。
- `fakeConnector({ mode })`：`fixed` / `bad-format-once` / `bad-format-always` / `login-expired` / `counting`（读 `connector.calls`）/ `slow`（`delayMs`）。
- `createUsageCounter(libraryDir).record(...)` / `.wrap(connector, purpose)` 往 `_pipeline/usage.jsonl` 追加 `{ts, kind, model, calls, inputTokens?, outputTokens?, costUsd?, purpose, ok?, code?}`；wrap 后的 `complete()` 记在 `purpose` 下，`probe()` 记在 `'probe'` 下；`readUsage(libraryDir, { month: 'YYYY-MM' })`（按 ts 的 UTC 月份，默认当月）→ `{ calls, inputTokens, outputTokens, costUsd, byKind, byPurpose, byModel, skipped }`。
- **`usage.calls` 只数真的发出去的调用**：找不到可执行文件、spawn ENOENT、没存 key、custom 厂商没填型号（本地直接报 `bad-model`）这些没发请求的失败 `usage.calls` 是 0；超时、登录过期、坏格式这些到了工具或服务器的失败是 1。
- Windows 上 `findExecutable` 只认 PATHEXT 里的扩展名（按 PATHEXT 顺序），无扩展名的 `codex` 文件（npm 的 sh 垫片）不算，旁边的 `codex.cmd` 才算。

### 错误码（内部码，界面文案归 desktop）

| 码 | 什么时候 |
|---|---|
| `not-installed` | 可执行文件哪里都找不到（command / PATH / 桌面版位置），或 spawn ENOENT，或 `--version` 非 0 |
| `not-logged-in` | Claude Code `auth status` 的 `loggedIn:false`；Codex `login status` 非 0 或输出含 "not logged in"；调用输出含 "Failed to authenticate"（无 expired 字样）|
| `login-expired` | Claude Code 输出 `OAuth session expired and could not be refreshed`（本机 2026-11-02 实录，见下）|
| `bad-key` | API 401 / 403；连接没存 key |
| `bad-model` | API 404；400 且报错提到 model；CLI 输出 "model … not found / unrecognized" |
| `rate-limited` | API 429；CLI 输出 rate limit / usage limit / 429 |
| `network` | API 5xx 或 fetch 抛错；CLI 输出 ECONNREFUSED / ENOTFOUND / fetch failed |
| `timeout` | 超过 `timeoutMs`（默认 120 s；检测 15 s），子进程被 kill |
| `bad-format` | 回答不是 JSON（含 max_tokens 截断）；`text` 带原文 |
| `refused` | Anthropic `stop_reason: refusal` / OpenAI 式 `finish_reason: content_filter` / CLI 输出 refused |
| `unknown` | 以上都对不上；`detail` 带退出码与前 300 字 |

### 三种连接实际发出去的东西

**Claude Code**（本机 2.1.287，参数名全部来自 `claude --help`）。提示词走 stdin，不进 argv；cwd 是 `os.tmpdir()/streams-connect/<随机>/cwd`，`mkdirSync` 新建、用完整个 `<随机>` 删掉：

```
claude -p --output-format stream-json --verbose --safe-mode --restricted --tools "" --strict-mcp-config
       --disable-slash-commands --no-session-persistence --permission-prompts none
       [--model <id>] [--system-prompt <text>]
```

- v2 package M（11-10）：`--output-format json` 换成 `stream-json --verbose`（别的不变）：stdout 每行一个 JSON，信封是最后一条 `type: result` 的行，其中一条 `rate_limit_event` 带套餐的 5 小时 / 7 天窗口（`docs/core-api.md` 5.17）。下面说的信封字段照旧。

- `--safe-mode`：CLAUDE.md、skills、plugins、hooks、MCP、自定义命令全关，登录与型号选择照常（不用 `--bare`：它只认 ANTHROPIC_API_KEY，会把 OAuth 登录拦掉）。
- `--restricted`：去掉 Bash 等执行类工具，并忽略 user / project / local 设置文件；`--tools ""` 再把全部内置工具去掉。
- 解析 stdout 的 result 信封：`result` 是回答文本，`is_error` 真则按 `result` 文案映射错误码，`usage.input_tokens + cache_creation_input_tokens + cache_read_input_tokens` → `inputTokens`，`usage.output_tokens` → `outputTokens`，`total_cost_usd` → `costUsd`，`modelUsage` 的第一个键 → `model`。
- 本机未登录时的实录（退出码 1，stderr 空，错误打在 stdout）：`{"type":"result","subtype":"success","is_error":true,"terminal_reason":"api_error","result":"Failed to authenticate: OAuth session expired and could not be refreshed", "usage":{…全 0}, "modelUsage":{}, …}`。
- 检测：`claude --version` → `2.1.287 (Claude Code)`；`claude auth status --json` → `{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty",…}`（未登录时退出码 1）。

**Codex**（本机 codex-cli 0.160.1 / 0.166.0-alpha.5.1，参数名来自 `codex exec --help`；整条 argv 加 `--help` 实跑 clap 解析退出码 0）。提示词走 stdin（`-`），system 拼在提示词前；`-o` 文件放在 cwd 旁边不放里面：

```
codex exec --json --sandbox read-only --skip-git-repo-check --ephemeral
           --ignore-user-config --ignore-rules --color never -C <cwd> -o <root>/last-message.txt [-m <id>] -
```

- `--ask-for-approval` 是顶层 `codex` 的参数，`codex exec` 不认（实证：`codex exec --ask-for-approval never --help` → `error: unexpected argument '--ask-for-approval' found`），所以不传；`--sandbox read-only` 已经让模型的命令写不了盘。`test/connect-codex.test.mjs` 里有一条对真 `codex exec --help` 核每个长参数名存在、`--ask-for-approval` 不存在的测试，找不到 codex 时 skip（不算绿）。
- **可执行文件查找顺序**（维护者 11-02 定）：`connection.command` 显式指定（`source: 'command'`）> PATH 上的 `codex`（`'path'`）> 桌面版自带的 `%LOCALAPPDATA%\OpenAI\Codex\bin\<任意子目录>\codex.exe` 与 `%USERPROFILE%\.codex\.sandbox-bin\codex.exe`（`'desktop-app'`）。多个候选各跑一次 `--version`（只读），取版本号最高的（`0.166.0-alpha.5.1` > `0.160.1`；同号正式版胜预发布；再同则按上面顺序先到先得）；跑不起来的候选跳过。`detect()` 返回里带 `source` 与 `path`；`complete()` 记住上次的选择，`detect()` 刷新。
- 回答 = `-o` 文件内容；没有就取 JSONL 里最后一条 `item.completed` 且 `item.type === 'agent_message'` 的 `text`；`turn.completed` 的 `usage.input_tokens + cached_input_tokens` / `output_tokens` 计入用量；`error` / `turn.failed` 的 message 映射错误码。**事件形状来自文档记忆，未经本机真调用核对**（规矩：Codex 只跑 `--version`、`login status`、带 `--help` 的解析）。
- 检测：`codex --version`；`codex login status` → 本机 `Logged in using ChatGPT`（退出码 0）。未登录的文案没见过，按「非 0 或含 not logged in」处理。

**API key**（无 SDK，`fetch`，单轮无工具，`timeoutMs` 用 AbortController）：

```
anthropic   POST {baseUrl}/v1/messages
            x-api-key: <key>   anthropic-version: 2023-06-01   content-type: application/json
            { "model", "max_tokens": 16000, "system"?, "messages": [{ "role": "user", "content": prompt }] }
            回答 content[].text 拼接；usage.input_tokens(+cache_*) / output_tokens

其余厂商  POST {baseUrl}/chat/completions
            authorization: Bearer <key>   content-type: application/json
            { "model", "messages": [{ "role": "system" }?, { "role": "user" }] }      （不传 max_tokens：各家参数名不一）
            回答 choices[0].message.content；usage.prompt_tokens / completion_tokens
```

### 型号表（`src/connect/models.mjs`）

| 连接 | 表 | 来源 |
|---|---|---|
| claude-code | `claude-fable-5-1`（recommended）, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`；不填 = 不传 `--model` | 产品方案给定 |
| codex | `gpt-6.1-sol`（recommended）, `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol` | 本机 `~/.codex/models_cache.json`（Codex 0.166.0 于 2026-11-02 拉取）里 `visibility: list` 的 slug，按其 priority 排序 |
| api · anthropic | `claude-opus-5-5`（recommended）, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` | `https://api.anthropic.com`；型号 id 来自 claude-api 参考表（2026-10） |
| api · openai | `gpt-6.1-sol`（recommended）, `gpt-6-luna` | `https://api.openai.com/v1`；id 照 Codex 缓存里 `supported_in_api: true` 的 slug，**未核**（`unverified: true`） |
| api · deepseek | `deepseek-chat` | `https://api.deepseek.com/v1`；未核 |
| api · moonshot | `kimi-k2-0905-preview` | `https://api.moonshot.cn/v1`；未核 |
| api · zhipu | `glm-4.6` | `https://open.bigmodel.cn/api/paas/v4`；未核 |
| api · gemini | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai`；未核 |
| api · custom | 空表，手填 `baseUrl` 与型号 | — |

`unverified: true` 的条目界面可以照样显示，但 PM 发版前要核一遍 id。任何型号都允许手填（`resolveModel` 不查表）。

### 测试怎么不联网、不调真工具

- 子进程连接器：`deps.spawnImpl` 注入 `test/support/fake-spawn.mjs`（假 ChildProcess，可指定 stdout / stderr / 退出码 / 延迟 / ENOENT），另有 `test/support/fake-cli.mjs` 用 `process.execPath` 真起一个子进程，回报它看到的 cwd、目录内容与 argv（证明空目录与隔离参数真的到了子进程）。
- API 连接器：`test/support/fake-api.mjs` 起本地 `node:http`，按型号名演各种 HTTP 结局（401 / 404 / 429 / 500 / 慢 / 散文 / 围栏 / 拒答 / 把 key 回显进报错）。
- 每个 `connect-*.test.mjs` 都有 `sentinel:` 用例；argv 隔离断言有反向用例（去掉任一参数就红）；key 泄漏断言有反向用例（故意拼进 key 的结果会被抓）。

## 抓取（W2）

`src/fetch/`。只写两个文件：`_pipeline/fetch_log.jsonl`（本模块）和 `_pipeline/ledger.jsonl`（经 `recordSeen` / `appendEvent`）。永远不碰 notes/（V2 的守卫测试覆盖 `src/` 全部文件）。测试不联网：`test/support/fake-server.mjs` 用 `node:http` 在 127.0.0.1 起假服务器，所有基址（feed url、`ctx.arxivBase`、`ctx.hnBase`）都指向它。

### 五态判定

内部码存 fetch_log；界面文案不在核心层。`hint` 是给界面的动作码。

| 状态 | 含义 | 触发 | hint |
|---|---|---|---|
| `ok` | 正常 | 解析成功且本轮有 ≥ 1 条**新**条目 | `none` |
| `empty` | 没新内容 | HTTP 2xx、解析成功，但新条目为 0（包括「抓到 10 条、全都见过」） | `none` |
| `gap` | 地址有问题 | 404 / 410 / 其他 4xx（403、407、451、408、429 除外）/ 3xx 没跟上 / 正文不是 XML / 不是 feed / **根认得、item/entry 块 ≥ 1 但可用 0 条**（message `parsed N, 0 usable`，含截断的 feed）/ HN 返回 400 或非 JSON / 未知 kind / URL 不是 http(s) / 缺 url 或 query | `fix-address-or-remove` |
| `failed` | 暂时失败 | 429 / 408 / 5xx / 超时 / DNS / 连接被拒 / 连接重置 / 读 source 对象或抓取器自己抛了异常 / **新条目写不进账本**（message `ledger write failed after N new item(s): …`，绝不记 empty） | `retry-next-round` |
| `blocked` | 被拒绝 | 403 / 451 / 407，或连接层的代理拒绝（`Tunnel connection failed`、`host_not_allowed`、`proxy authentication`、`forbidden by proxy`、`blocked by policy`、WinError 10013、`connect EACCES`） | `blocked-remove-source` |
| `paused` | （不是五态）来源 `paused: true`，本轮跳过，不发请求 | — | `none` |

- **「没新内容」和「没抓到」永远分开**：任何非 2xx、任何异常都不会落到 `empty`。
- 分类在两层都做（`classifyHttp` 看状态码，`classifyError` 看异常链 `err.cause`），同一个代理拒绝不会因为 http / https 落到不同状态。
- `-5` 这类不是秒数也不是 HTTP-date 的 `Retry-After` 忽略；HTTP-date 换算成相对秒数，过去的时间记 0。
- **407 的特殊之处**：WHATWG fetch 规定 407 响应变成一个裸的 network error（`TypeError: fetch failed`，cause 没有 message 也没有 code），状态码到不了我们手上。`classifyError` 把这个唯一的形状判为 `blocked`，fetch_log 行没有 `http` 字段。
- 普通的 `EACCES: permission denied`（不带 `connect`）仍是 `failed`，不过度匹配。

与工具包 `fetch_rss.py` 的差别：451 → `blocked`（原版落 `gap`）；3xx 没跟上 → `gap`（原版 urllib 自动跟随，不会出现）；HN 用 `search` 端点而非 `search_by_date`；`max_results` 默认两种都是 10（原版 arXiv 5 / HN 10）；摘要截 500 码位（原版 300）。

### 礼貌规则

- User-Agent 固定 `Streams/1.0 (+https://github.com/AsuraNale/streams)`，每个请求都带，被拒不换。
- 一次调用只发一个请求；429 / 503 的 `Retry-After` 记进 fetch_log（`retry_after_seconds`），本轮不重试。
- arXiv 两次请求间隔 ≥ 3 秒：`ctx.lastArxivAt` 在同一轮的 ctx 上共享，`fetchArxiv` 先 `await ctx.sleep(剩余毫秒)` 再请求，请求结束后更新 `lastArxivAt`；上一次 429 了也照样等。`ctx.now` / `ctx.sleep` 可注入，测试里不真等。
- 403 / 451 / 407 = 停，不绕。
- **循环调用 `fetchSource`（试抓多个来源）要自己 `makeContext()` 一次，再把同一个 ctx 传给每次调用**；每次传新对象（或 `undefined`）arXiv 的 `lastArxivAt` 不共享，间隔就不成立。`fetchRound` 内部已经这么做。

### 来源配置（`streams.json` 的 `sources[]`）

```
{ "name": "letta-blog", "kind": "rss",   "url": "https://…/feed.xml", "topic": "agent 记忆", "paused": false, "max_results": 10 }
{ "name": "arxiv-mem",  "kind": "arxiv", "query": "agent memory", "topic": "agent 记忆" }
{ "name": "hn-mem",     "kind": "hn",    "query": "agent memory", "min_points": 50 }
```

- `kind` 只认 `rss` / `arxiv` / `hn`，其他 → `gap`。`name` 缺了用 url / query 顶替。
- arXiv：裸短语自动变成 `all:"短语"`（整句匹配）；带字段前缀（`ti:` `abs:` `cat:` …）或 `AND` / `OR` 的高级查询原样送出。`sortBy=submittedDate&sortOrder=descending`。
- HN：Algolia `search?query=…&tags=story&hitsPerPage=max(4×max_results, 20)`，**不发 `numericFilters`**，`points >= min_points`（默认 50）在客户端过滤；没有 url 的故事用 `news.ycombinator.com/item?id=`。
- `interval_seconds` 核心层今天不读（排期归桌面层）。

### 条目

`{ url, title, date, summary, source, kind, topic? }`。`date` 是来源写的日历日（RFC 822 / ISO 都转成 `YYYY-MM-DD`，不做时区换算；不存在的日期如 `2026-02-30` 当没写），缺了用抓取日（本地日历日）。`summary` 去标签、解实体、压空白、截 500 码位。没有 title 或没有 link 的条目直接丢（`parseFeed` 同时报 `blocks` = 看到的 item/entry 开头数，截断没闭合的也算；来源层用它判 `parsed N, 0 usable` → gap）。RSS 的 link 缺时用 `guid`：`isPermaLink` 不是 `false`，或 guid 文本本身是 http(s) URL；Atom 取 `rel="alternate"`（或没 rel）的 link，否则第一个有 href 的 link，否则 `<id>`。

feed 读取器不是 XML parser，已处理的边角：根带命名空间前缀（`<atom:feed><atom:entry>`）先整篇剥前缀；entry / item 里内嵌的 `<source>…</source>` 先剥掉再读（它的 title / link 是出处的，不是条目的——否则聚合源所有条目 url 相同，被第一层去重折成一条）；属性值里带 `>`（引号内）不会截断标签。**已知限制**：CDATA 正文里出现 `<item` / `<entry` 会多算一个块；除 `<source>` 外的同名嵌套元素不懂；`stripHtml` 的去标签不认引号（`<a title="a>b">` 会留下 `b">`，只影响摘要文本）。

### 一轮（`fetchRound`）

```
fetchRound(libraryDir, { config?, ctx? })
  -> { round: { id, startedAt }, perSource: [{ name, kind, status, hint, count, newCount, message, http?, retryAfterSeconds? }],
       newItems: [条目 + maybeDuplicateOf?], maybeDuplicates: [{ url, of }] }
```

- 来源顺序执行，各自 try/catch；一个坏了不影响别的。`streams.json` 缺失 / 坏了才抛（`config-missing` / `config-invalid-json` / `config-invalid-shape`）。
- **第一层去重**：url 已在账本（任何阶段，包括 `dismissed` / `kept`）或本轮已登记 → 跳过，不写。
- **第二层去重**：`normalizeTitle`（NFKC 全角转半角、小写、只留字母数字）后与账本里已有条目或本轮更早条目相同 → 仍登记，但 seen 事件带 `maybe_duplicate_of: <那个 url>`；`replayLedger` 把它带进 state 的 `maybeDuplicateOf`。不丢、不自动合并，裁决归后面的关卡 / 用户。
- 账本只在新条目时写：`appendEvent` 一条 seen，`ts` 取 `ctx.now()`（与该来源的 fetch_log 行同一个 ts），带去重提示时多一个 `maybe_duplicate_of`。第一层去重靠轮开始时 `replayLedger` 得到的 url 集合 + 本轮已登记集合。
- 账本写不进（只读、磁盘满）：该来源停在那一条，记 `failed`，message 带账本错误，`new` 是已成功写入的条数；后面的来源照常跑。
- 读 `sources[]` 里某个对象本身就抛（getter、Proxy）：那个来源记 `failed`，轮不中断。

### fetch_log 一行

```
{"ts","round","source","kind","status","hint","http"?,"count","new","message","retry_after_seconds"?}
```

键序固定如上；`count` = 这次解析到的条目数（没抓到就是 0），`new` = 其中账本里没有的。`appendFetchLog` 拒绝 status 不在六个值里、`count` / `new` 不是非负整数的行。

**幂等判断（V4 的抓取一半）**：同一内容连跑两轮，第二轮 `ledger.jsonl` 字节不变，fetch_log 每来源多一行，status 为 `empty`，`count` 仍是解析数、`new` 为 0。规则：抓取器返回 `ok` 且 `new == 0` → 记 `empty`，message 为「N item(s), all already seen」。只有 `ok` 会被这样改写；`gap` / `failed` / `blocked` 原样记。

### 运行状态与健康

- `readFetchLog(dir)` → `{ entries, skipped }`，坏行跳过并记行号。
- `lastRoundStatus(dir)` → `{ [来源]: { status, hint, consecutive, lastTs, lastOkAt, kind, message, http?, retryAfterSeconds? } }`。`consecutive` = 末尾连续同状态的轮数；`lastOkAt` = 最近一次 `ok` 或 `empty` 的 ts（都是成功抓到），没有则 null。
- `sourceHealth(lastRoundStatus)` → `{ level: 'quiet' | 'warning' | 'blocked', counts, lines }`。`blocked` 单独成级，行里动作是 `blocked-remove-source`，不和 `failed` 同句；`failed` / `gap` 各自一行 → `warning`；全 `ok` / `empty` → `quiet`；没记录 → `['no-fetch-yet']`。行格式 `<state> <n>/<total> <name,name> hint=<code>`，`paused` 不计入 total。

### 手动投入

`addManual(dir, { url, title?, topic?, date? })` → `{ added, url, maybeDuplicateOf? }`。只认 http(s)，其他抛 `bad-url` 不写；账本 seen 事件 `source: 'manual'`，`date` 缺了用今天；重复 url 由账本去重 `added: false`；标题与已有条目规范化后相同时带 `maybe_duplicate_of`。

### 模块

| 文件 | 导出 |
|---|---|
| `src/fetch/states.mjs` | `FETCH_STATES`, `LOG_STATES`, `HINTS`, `hintOf`, `classifyHttp`, `classifyError`, `parseRetryAfter` |
| `src/fetch/http.mjs` | `getText`, `checkUrl`, `USER_AGENT` |
| `src/fetch/feed.mjs` | `parseFeed`, `detectRoot`, `elementText`, `atomLink`, `parseAttrs` |
| `src/fetch/html.mjs` | `stripHtml`, `decodeEntities`, `truncateText`, `normalizeTitle` |
| `src/fetch/dates.mjs` | `toIsoDate`, `localIsoDate`, `isRealDate` |
| `src/fetch/context.mjs` | `makeContext`, `isContext`, `ARXIV_BASE`, `HN_BASE`, `ARXIV_MIN_GAP_MS` |
| `src/fetch/sources/{rss,arxiv,hn}.mjs` | `fetchRss`, `fetchArxiv`（`arxivSearchQuery`, `waitForArxivSlot`）, `fetchHn`（`minPoints`） |
| `src/fetch/source.mjs` | `fetchSource`, `SOURCE_KINDS`, `sourceName` — 纯函数式，不写盘，给「试抓」用 |
| `src/fetch/round.mjs` | `fetchRound` |
| `src/fetch/manual.mjs` | `addManual`, `MANUAL_SOURCE` |
| `src/fetch/log.mjs` | `appendFetchLog`, `readFetchLog`, `lastRoundStatus`, `FETCH_LOG_FILE` |
| `src/fetch/health.mjs` | `sourceHealth` |

## 流水线与核验（W4，`src/pipeline/`、`src/verify/`）

签名、返回形状、错误码与实做取舍全部在 `docs/core-api.md` 第四节（4.0 配置 · 4.1 账本事件与队列 · 4.2 引擎函数 · 4.3 核验层 · 4.4 提示词 · 4.4b 差别 · 4.5 CLI）。要点：

- 一轮 = `selfCheck`（库可写、索引可读、连接试调；任一失败本轮不开始、什么都不写）→ `fetchRound` → 队列从账本状态重建 → 关卡①（材料：标题、来源、日期、摘要）→ 取正文入 `_pipeline/cache/` → 关卡② → 摘要（经核验循环）→ 写 `_pipeline/inbox/<sha1>.json` + 账本 `inbox` → `_pipeline/rounds.jsonl` 一行 + `_pipeline/logs/YYYY-MM-DD.md`。
- 每次模型调用计 1（关卡、摘要、判定都算）；`calls ≥ cap` → 当前条目后停（`stoppedAt:'cap'`）；`signal.aborted` → `'aborted'`；连接错误 → `'connection'`。剩余条目保持原状态，下一轮接着跑；同一 url 同一关卡同一 cfg 永不第二次调用。
- 关卡输出先过全规则核对单（JSON 键齐、分数 0–1、枚举在表内、理由 ≤120 字、`quote` 逐字在材料里）；没过带「你的输出不符合格式」重试一次；还没过 → 账本 `unscored`，条目留在「抓到的」，永不静默丢弃。
- 摘要走 `verifyLoop`：规则项先、判定项打包成一次独立调用（核验槽）；退回只带没过的项；两轮不过仍进待看并标 `verification.passed:false`。每项每轮一行 `_pipeline/verdicts.jsonl`。
- 拍板：`keep` 是全仓唯一调 `writeNoteFile(…,{by:'keep'})` 的地方；`dismiss` 理由必填且终态永不回流；`later` 零写盘。
- 假连接器：`src/connect/fakes.mjs`（固定 / 坏格式 / 登录过期 / 计数）与 `src/pipeline/fake.mjs`（按提示词形状应答的脚本连接器，`--connection fake`）。

本机实跑（11-03）：一条一项的库，Claude Code 与 Codex 各跑一轮，关卡①各 1 次真调用、`quote` 逐字命中、账本 `scored` 写入。

## 资料库、编辑、搜索、图谱、问库、来源与主题、运行状态（W5）

签名与返回形状在 `docs/core-api.md` 第五节（5.1–5.7）。要点：

| 文件 | 导出 | 作用 |
|---|---|---|
| `src/library/browse.mjs` | `libraryCounts`, `listLibrary`, `readNote`, `notePath`, `noteBodyOf` | 四个分页（已收藏 / 我写的 / 抓到的 / 待规范）。抓到的 = 账本里没到 kept / dismissed 的全部，`stoppedAt` 由流水线的 `nextStep` 算：低于某关 → 关卡 id，`unscored`（同 cfg 不再调用），`queued`（还要跑，含连接断的），`inbox`。只读 |
| `src/library/edit.mjs` | `editNote(libraryDir, id, {title?, topics?, body?})` | 只改这三样，别的键 `bad-edit`；其余文件头字段与键序原样；写盘只经 `writeNoteFile(…,{by:'edit'})`，本文件没有写调用；写完 `rebuildIndex` |
| `src/library/search.mjs` | `search`, `rankEntries`, `textTokens`, `queryTokens`, `scoreEntry`, `snippetOf` | 搜索框与问库候选共用的打分：英文按词（NFKC、小写、去标点），中文相邻二字；标题 ×3、主题 ×2、摘要 / 正文 ×1，数出现次数；同分按 date 倒序再按 id。比较一律按码点，不用 locale |
| `src/graph/graph.mjs` | `graph(libraryDir, {days, status, topics, links, now})` | 三行固定布局（主题 / 来源 / 条目），按条数倒序再按名字；条目落在第一个主题的列下、按 date 倒序。连线只连两端都画出来的节点。同一输入 `JSON.stringify` 逐字节相同 |
| `src/ask/ask.mjs` · `prompts.mjs` · `demand.mjs` | `ask`, `demands`, `addDemand`, `answerFeedback` | 问库：候选 = kept / authored 前 9 条（正文每条 1500 字、共 9000 字）；0 条不调模型；一次主模型生成 → `verifyLoop`（规则：`json_keys`、`ids_in_set`、「notInLibrary 为 false 时每句有出处」；判定：每句对得上它引的那条，核验槽打包一次）；两轮后越界编号与没出处的句子删掉并计数。`_pipeline/demand.jsonl` 每问一行，`verdicts.jsonl` 的 node 是 `ask`、url 是 `ask:<sha1(问题) 前 12 位>`；连接错误返回 `{ok:false, code}` 且什么都不写 |
| `src/library/sources.mjs` | `sourcesView`, `guessSource`, `addSource`, `updateSource`, `removeSource`, `setSourcePaused`, `addTopic`, `updateTopic`, `removeTopic` | 只写 `streams.json`：读 → 改 `sources` / `topics` → 临时文件 → rename，其余键与键序不动，2 空格缩进 + 末尾换行。删主题时引用它的来源 topic 置空，已收藏条目不改 |
| `src/pipeline/status.mjs` | `statusView(libraryDir, {now})` | 运行状态页：最近一轮、这一轮进待看的条数（账本 inbox 事件按 round 数）、上次拍板时间、本月用量、每个已配置来源的最近状态与健康级别；全部从 jsonl 现算 |
| `src/verify/verdicts.mjs` | `verdictsFor(libraryDir, url)` | 一条的全部核验记录按 node + round 分组，标出「说做了其实没做」 |

`ids_in_set` 读顶层字段，所以问库核验时在模型输出上加两个派生字段（`cites_all` 全部出处编号、`answer_problems` 答案问题数）给规则项读；这两个字段不给模型看（退回时的「上一次输出」去掉它们），也不进返回值。
