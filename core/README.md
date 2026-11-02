# @streams/core

流息 Streams 的核心层：纯 Node（≥ 24，ESM），无界面，零第三方依赖（`dependencies` 与 `devDependencies` 都为空）。今天（W1）只有「库」这一块：文件头解析与校验、索引重建、账本重放、待规范清单、建库、唯一的写 notes/ 入口。

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
```

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
| `src/library/write-note.mjs` | `writeNoteFile(libraryDir,{id,header,body},{by})` | **唯一**写 notes/ 的地方（V2）。`by` 只收 `'keep'` / `'import-header'`；`wx` 独占创建，已存在抛 `id-conflict`；写前先过校验，不合规范抛 `invalid-note` |
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
   ├─ fetch_log.jsonl  （今天只建空文件）
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
