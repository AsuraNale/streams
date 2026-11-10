# Claude Code 改输出格式后的真调用试验（v2 包 M · M1 · 2026-11-10）

> 玄翎（工作包 M）· 2026-11-10 11:03（东部时间）。问的是：Claude Code 的参数把 `--output-format json` 换成 `--output-format stream-json --verbose`（其余「不能动手」的参数一个不改，`core/src/connect/claude-code.mjs` `CLAUDE_FIXED_ARGS`）之后，产品里三条真路径——主 Agent 会话（新开 + 接续）、问库、打分——还通不通？左下角要的套餐余量（`rate_limit_event`）是不是每次都跟着来？

## 结论

- **通。** 真调用 **5 次，5 次成功**、5 次都是合格 JSON（解析出的结果与改前同形：`ok / json / text / usage / model`，会话模式多 `sessionId / resumed`），0 次重试。
- **余量每次都拿到了。** 5 次的 stream 里都有一条 `rate_limit_event`，解析成 `quota: { source: 'claude-code', windows: [five_hour 16%, seven_day 13%] }`；重置时间 `1794339000`（11-10 14:30 东部时间）与 `1794603600`（11-13 16:00）与 维护者 上午手核的同一对窗口一致，已用从上午的 5% / 11% 涨到 16% / 13%。
- **会话接得上。** 第 1 轮 `--session-id` 新开，第 2 轮 `--resume` 同一个 id（`resumed: true`），模型答得出上一轮问的是什么。
- 主 Agent 的工作目录与一次性调用的临时目录试验后都是空的（`agentCwdEmpty: true`、`sideEmpty: true`）；没碰 `%APPDATA%\Streams`，没读 `~/.claude`。

| # | 路径 | 调用 | 成功 | JSON 合格 | 拿到 quota | 用时 | 输入 token（含缓存） | 输出 token |
|---|---|---|---|---|---|---|---|---|
| 1 | 主 Agent 第 1 轮（`--session-id` 新会话） | `send` | 是 | 是（`reply` + `ask`） | 是：5 小时 16% · 7 天 13% | 6.8 s | 2068 | 267 |
| 2 | 主 Agent 第 2 轮（`--resume`，接续） | `send` | 是 | 是（`reply`） | 是：同上 | 3.6 s | 2445 | 37 |
| 3 | 问库：作答 | `complete` | 是 | 是（`answer` + `cites`） | 是：同上 | 6.0 s | 2721 | 200 |
| 4 | 问库：核验（问库自带的第二次调用，查答案句有没有材料支撑） | `complete` | 是 | 是（`items`） | 是：同上 | 4.8 s | 2587 | 119 |
| 5 | 打分：相关度关卡（`previewNode`，`write: false`，不写盘、不联网） | `complete` | 是 | 是（`relevance` + `reason` + `quote`） | 是：同上 | 5.8 s | 2742 | 279 |

合计 5 次（脚本上限 8 次）；用时 3.6–6.8 s；`total_cost_usd` 每次 0.011–0.026 美元（走 维护者 的套餐）。

## 怎么做的

- 脚本：`core/scripts/quota-trial.mjs`（仓库里）。`node core/scripts/quota-trial.mjs --dry` 先在假 CLI（`core/test/support/fake-cli.mjs`，同样打 stream-json）上把整套跑一遍核脚本本身（不调模型）；然后 `node core/scripts/quota-trial.mjs` 跑真的。
- 连接：本机 PATH 上的 `claude`（Claude Code 2.1.287，claude.ai 登录，没指定模型 → 它自己的默认）。用的是产品自己的连接器（`createConnector` / `createSessionConnector`），所以参数就是产品里的：
  - 一次性调用：`-p --output-format stream-json --verbose --safe-mode --restricted --tools "" --strict-mcp-config --disable-slash-commands --no-session-persistence --permission-prompts none [--system-prompt …]`
  - 主 Agent：同一组去掉 `--no-session-persistence`，加 `--session-id <uuid>`（第 1 轮）/ `--resume <uuid>`（第 2 轮）。
- 目录：一个新的临时文件夹 `%TEMP%\streams-quota-trial-20261110T160254`（`fs.mkdirSync`，不用 mkdtemp）；脚本开头核对它不在 `%APPDATA%\Streams` 里面。里面：一个试验库（一条收藏的笔记，给问库和打分用）、主 Agent 的 `agent\` 与工作目录 `cwd-agent\`（每次调用前确认是空的）、一次性调用的临时目录 `side\`（每次调用一个新的空文件夹，用完删）。
- 打分时把网络关掉（`fetchImpl` 直接抛错）：相关度关卡只看标题与摘要（`material: 'meta'`），本来也不抓正文；没有任何抓取请求离开本机。
- 每次调用另外记下子进程 stdout 里各行的 `type`、`rate_limit_event` 那一行与 `result` 那一行（`result` 文字截到 300 字）。

## 原始输出摘录

stdout 各行的类型（每次都是 `system` 起头、`result` 收尾，`rate_limit_event` 在倒数第三行）：

```
#1 system,assistant,assistant,rate_limit_event,system,result
#2 system,assistant,rate_limit_event,system,result
#3 system,system,system,assistant,assistant,rate_limit_event,system,result
#4 system,assistant,assistant,rate_limit_event,system,result
#5 system,system,system,assistant,assistant,rate_limit_event,system,result
```

`rate_limit_event`（#1，原样；`uuid` / `session_id` 截短）：

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1794339000,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"out_of_credits","isUsingOverage":false,"unifiedWindows":{"five_hour":{"utilization":0.16,"resetsAt":1794339000},"seven_day":{"utilization":0.13,"resetsAt":1794603600}}},"uuid":"24c0060c-…","session_id":"279436fc-…"}
```

解析出来的（#1，产品的 `quotaFromClaudeStream`，白名单只取这几个字段；`status`、`overageStatus`、`overageDisabledReason` 等都没取）：

```json
{"source":"claude-code","at":"2026-11-10T16:03:01.724Z","windows":[{"id":"five_hour","usedPercent":16,"resetsAt":1794339000},{"id":"seven_day","usedPercent":13,"resetsAt":1794603600}]}
```

`result` 行的 `result` 字段（模型的回答，原样）：

- #1 主 Agent 第 1 轮：`{"reply":"你好！我能帮你建立和调整阅读库：按你关心的主题和要求，挑选 RSS/Atom、arXiv、Hacker News 来源，设置筛选门槛和抓取时间，并查看各库的运行情况。所有改动都会以提案卡片的形式给你，只有你点「确认」后，流息才会执行。你现在还没有库，告诉我你想追踪什么，我就可以提一个建库方案。","ask":{"question":"想先从哪类内容开始？","options":["学术论文（arXiv）","技术社区（Hacker News）","博客/新闻（RSS）","先随便看看"]}}`
- #2 主 Agent 第 2 轮（resume）：`{"reply":"你刚才问我：用一两句话说说我在流息里能帮你做什么。"}`
- #3 问库作答：`{"answer":[{"text":"记忆块超出大小上限时，先对其进行压缩，再进行淘汰。","cites":[1]}],"notInLibrary":false,"missing":"","claimed":["json-keys","cites-in-set","cited-sentences","claims-supported"]}`
- #4 问库核验：`{"items":[{"id":"claims-supported","passed":true,"evidence":"答案唯一断言「超出大小上限时先压缩再淘汰」与材料[1]要点「每块有大小上限；超限时先压缩再淘汰」一致。"}]}`
- #5 打分：`{"relevance": 0.3, "reason": "这是一篇工程笔记，讲长期运行的 agent 在记忆块满时先压缩再淘汰。库主题写的是「无」，无法确认角度；虽然已有相近条目，但拿不准，所以打低分。", "quote": "An engineering note on compressing then evicting memory blocks in long-running agents."}`

`result` 行的其余字段（#2，截短）：`{"type":"result","subtype":"success","is_error":false,"duration_api_ms":5291,"stop_reason":"end_turn","session_id":"279436fc-…","total_cost_usd":0.0260452,"usage":{"input_tokens":4,"cache_creation_input_tokens":375,"cache_read_input_tokens":2066,"output_tokens":37,…},…}`——`session_id` 与第 1 轮相同（接续成功）。

## 看到的、要告诉后面的

1. **stream 里 `rate_limit_event` 之后还有一行 `system`，`result` 在最后。** 解析按「最后一条 `type: result` 的行」取信封、按「最后一条合格的 `rate_limit_event`」取余量，不依赖行的位置；单个 JSON 信封（v1.0 的格式、出错时只打一行的情况）照旧能读。
2. **余量是「上次调用时」的数**：同一分钟里 5 次调用报的都是 16% / 13%；五小时窗口的已用比上午 维护者 手核时（5%）多了，说明数是真的在走。界面上的悬停写「截至 …」就是这个时间。
3. **`total_cost_usd` 在会话模式下像是累计的**：第 2 轮输出只有 37 token，报的 0.0260 反而比第 1 轮（267 token，0.0219）大；差约 0.004，像是「第 1 轮 + 第 2 轮」。architecture 第六节「单次还是会话累计未核实」这条多了一个证据，代码没改（用量合计以调用次数为准）。
4. 打分的 0.3 是因为试验库没有主题（库主题「无」），与本包无关。
