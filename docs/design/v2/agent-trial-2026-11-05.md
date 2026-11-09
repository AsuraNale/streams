# 主 Agent 真调用试验（v2 包 C · C5 · 2026-11-05）

> 建方 · 2026-11-05 晚。问的是 architecture 第六节「主 Agent 用 JSON 动作的稳定性：未实测」：真的模型拿到 `AGENT_SYSTEM`（`core/src/agent/protocol.mjs`）和局面摘要，能不能稳定地回出一轮能用的 JSON？Claude Code 与 Codex 的会话模式（`core/src/connect/session.mjs`）在本机真的接得上吗？

## 结论

- **能用。** Claude Code 5 轮 6 次调用、Codex 2 轮 2 次调用，**8 次全是合格 JSON、全部一次过校验、没有一次重试**；4 张提议卡全部经包 B 的 `draftProposal` 出成 `pending` 卡（0 张不合格被丢）；查库状态那一轮用了 1 次 lookups（2 项），拿到结果后照实回答。
- **会话接得上。** Claude Code 第 1 轮 `--session-id` 开会话，第 2–5 轮 `--resume` 同一个 id，5 轮都在同一个会话里（第 2、3、5 轮的回复都引用了前几轮出的卡的 id）。Codex 第 1 轮 `exec` 拿到 `thread_id`，第 2 轮 `exec resume … -c sandbox_mode="read-only"` 接上（答得出「Simon Willison 的博客」和那张卡的状态）。
- **会话接不上时的样子也看了**：拿一个不存在的会话 id 去 resume，两边都在本机 1–2 秒内拒绝、退出码 1，被归为 `sessionLost`（开新会话重建上下文），原话见下。
- 主 Agent 的工作目录（这次试验时还是契约原定的 `<临时应用数据>\agent\cwd`、`agent-codex\cwd`；11-09 起产品与试验脚本都改到应用数据之外的临时目录，见 `docs/desktop.md` §三）试验后是空的；没有写到任何库文件夹以外的地方，也没碰真的 `%APPDATA%\Streams`。

## 怎么做的

- 脚本：`core/scripts/agent-trial.mjs`（仓库里）。`node core/scripts/agent-trial.mjs --claude-only`、`--codex-only`、`--lost`；`--dry` 用脚本化的假连接把同一套跑一遍（不调模型，先核脚本本身）。
- 所有东西都在一个新的临时文件夹里（`fs.mkdirSync`，`%TEMP%\streams-agent-trial-<时间>`）：应用数据（`appData\agent\…`、`appData\proposals.jsonl`）、两个库（「AI 工具」：一个来源 `feed-a` 连续 3 轮 503、一个 `hn-agents` 正常，包 D 的建议卡 `source-failing:feed-a` 已记；「读书」）、主 Agent 的工作目录。脚本开头核对这个文件夹不在 `%APPDATA%\Streams` 里面，在就拒绝跑。
- 连接：本机 `claude`（Claude Code 2.1.287，claude.ai 登录，没指定模型 → 它自己的默认，用量里记的是 `claude-opus-5-5`）；Codex 桌面版自带的 `codex.exe`（`core/src/connect/codex.mjs` 的查找逻辑选到 `%LOCALAPPDATA%\OpenAI\Codex\bin\a159911ff70742e9\codex.exe`，0.166.0-alpha.6）。参数就是产品里的：Claude Code 零工具那组去掉 `--no-session-persistence` 加 `--session-id` / `--resume`；Codex `exec --sandbox read-only`（去掉 `--ephemeral`）/ `exec resume -c sandbox_mode="read-only"`。
- 出卡用真的包 B（`draftProposal` + `appendProposal`），只是把来源试抓的网络关掉（`fetchImpl` 直接抛错：试抓结果是 `failed`，卡照出），所以没有任何抓取请求离开本机。
- 调用上限：脚本里每次运行最多 15 次（超了不跑）。

## 统计

| 连接 | 轮 | 你说的 | 调用 | 第一次是 JSON | 一次过校验 | 重试 | lookups | 出卡 | 问题（ask） | 用时 |
|---|---|---|---|---|---|---|---|---|---|---|
| Claude Code | 1 建库请求 | 我想追踪 AI agent 的记忆机制…帮我建一个库 | 1（新会话） | 是 | 是 | 0 | 0 | 1（`create_library`） | 有（3 个选项） | 20.5 s |
| Claude Code | 2 追问 | 库名就叫「Agent 记忆」，来源用 arXiv 搜 agent memory，再加 HN… | 1（resume） | 是 | 是 | 0 | 0 | 1（`create_library`） | 无 | 15.5 s |
| Claude Code | 3 改来源 | 「AI 工具」库里的 feed-a 老是抓不到，先帮我暂停它 | 1（resume） | 是 | 是 | 0 | 0 | 1（`pause_source`） | 无 | 8.0 s |
| Claude Code | 4 查某库状态 | 「AI 工具」这个库最近几轮怎么样？hn-agents 抓得正常吗？ | 2（resume） | 是 | 是 | 0 | 1 轮（`library` + `source_log`） | 0 | 无 | 18.8 s |
| Claude Code | 5 闲聊 | 谢谢，今天先这样 | 1（resume） | 是 | 是 | 0 | 0 | 0 | 无 | 7.3 s |
| Codex | 1 加来源 | 帮我在「AI 工具」库加一个来源：Simon Willison 的博客… | 1（新会话） | 是 | 是 | 0 | 0 | 1（`add_source`） | 无 | 8.1 s |
| Codex | 2 接着问 | 我刚才让你加的是谁的博客？那张卡现在是什么状态？ | 1（resume） | 是 | 是 | 0 | 0 | 0 | 无 | 4.6 s |

| 次数 | 数 |
|---|---|
| 两条连接跑对话的调用 | **8**（Claude Code 6、Codex 2），全部合格 |
| 「接不上的会话」探针 | 4 次进程（Claude Code、Codex 各 2：一次是 scratchpad 里的同样逻辑，一次是仓库脚本的 `--lost`），都在本机被拒（没有回答） |
| 合计 | 12 次 CLI 调用，≤ 15 |

单次调用用时：Claude Code 5.3–17.4 s，Codex 4.6–8.0 s。用量（`agent\usage.jsonl`）：Claude Code 6 次输入 2442 → 9491 token（会话越长越多，含缓存读）、输出 122–1410；CLI 每次报的 `total_cost_usd` 在 0.048–0.158 美元之间、逐次增大（Claude Code 会话模式下 `total_cost_usd` 是单次还是会话累计未核实；用量合计以调用次数为准，`costUsd` 可能多算；走的是 维护者 的套餐）；Codex 2 次输入 28362 → 62752 token（Codex 自己的系统提示很大，会话第二轮翻倍）、输出 110 / 160。

## 真实输出摘录

Claude Code 第 1 轮（原样，截短）：

```json
{"reply":"我拟了一张新建库「Agent 记忆」的提议卡。只有你点「确认」，Streams 才会真正建库。\n\n库的设置：\n- 要求：追踪 AI agent 记忆机制（长期记忆、检索、遗忘）的新论文和技术博客，要一手研究或工程实践。\n- 主题（3 个）：长期记忆、记忆检索、遗忘与压缩，各带一组关键词。\n- 来源（3 个）：…\n博客方面我没有放具体的 RSS 地址，因为我无法核实哪些订阅源可用，不想编造。…",
 "ask":{"question":"要不要再加你常看的博客 RSS？","options":["我有几个，稍后发你","先这样就行","你推荐一些"]},
 "proposals":[{"kind":"create_library","params":{"name":"Agent 记忆","brief":"…","topics":[…],"sources":[…],"schedule":{"enabled":true,"time":"08:30"}},"why":"…"}],
 "note":"已提议新建「Agent 记忆」库（待确认）；博客 RSS 待用户提供。"}
```

Claude Code 第 4 轮先要查（中间回答），再照查到的回答：

```json
{"reply":"我去查一下「AI 工具」库的状态和 hn-agents 最近的抓取记录。","lookups":[{"what":"library","libraryId":"aitools1"},{"what":"source_log","libraryId":"aitools1","name":"hn-agents"}]}
```

> 查到的情况如下：**hn-agents 抓取正常。** 最近三次（11-02、11-03、11-04 的 08:30 前后）都成功，每次拿到 10 条，其中 2 条是新的。…**feed-a 出了问题。** 它已经连续 3 次失败，最近一次是 11-04，返回 HTTP 503…另外它的地址是 https://example.com/feed.xml，看起来像占位地址…暂停它的提议卡（p-20261105T203505Z-f5093a）还在等你确认。…我手上只有最近一轮的进待看数，更早几轮各进了多少条查不到。

Claude Code 第 3 轮出的卡（包 B 校验后的 `params`）：`{"libraryId":"aitools1","name":"feed-a","paused":true}`。

Codex 第 1 轮（原样）：

```json
{"reply":"已拟好添加来源的提议，等待你确认后生效。","proposals":[{"kind":"add_source","params":{"libraryId":"aitools1","source":{"name":"simon-willison","kind":"rss","url":"https://simonwillison.net/atom/everything/","topic":"agent 框架"}},"why":"将 Simon Willison 的博客归入「agent 框架」主题，按库的要求筛选一手资料。"}]}
```

Codex 第 2 轮（resume 后）：「你刚才让我添加的是 Simon Willison 的博客，归到「agent 框架」主题。那张添加来源卡目前仍是待定状态，等待你确认，还没有生效。」

接不上的会话（`--lost`，一个随机 uuid）：

| 连接 | 退出码 | 原话 | 归为 |
|---|---|---|---|
| Claude Code | 1 | `No conversation found with session ID: e7c6305e-…` | `unknown` → `sessionLost` |
| Codex | 1 | `Error: thread/resume: thread/resume failed: no rollout found for thread id 396e6490-… (code -32600)` | `unknown` → `sessionLost` |

## 看到的、要告诉后面的包

1. **「不能动手」的话术守住了**：每一轮都说「拟了 / 提议了，等你确认」，没有一次说「改了 / 建了」。第 1 轮还主动说不编 RSS 地址。
2. **改主意时它出了第二张建库卡**，并在回复里提醒「驳回旧卡，确认新卡」（第 2、3、5 轮都提）。包 G 的卡片可以考虑：同名的待定建库卡并排时提示一下；或者让主 Agent 用「改一下」的路子（现在它没有「撤回自己的卡」这个动作，只能请你点「不要」）。
3. **lookups 用得对**：只在需要时查，一次要两项；查到的结果照实复述，查不到的（更早几轮各进了多少条）明说查不到。`library` 查询目前只给最后一轮，要看多轮的趋势得再加一种查询（例如 `rounds`），留给后面定。
4. **Codex 的回答短**，会话第二轮输入 token 翻倍（它自己的系统提示）；长对话的用量会比 Claude Code 涨得快，压缩阈值（40000 字）对 Codex 可能偏大，要等真实长会话的数据再调。
5. 没有测：分叉（`--fork-session`，本包不用）、很长的会话、真的压缩调用（压缩用的是 v1.0 的一问一答 `complete`，假连接测过，真模型没调）、API key 连接（本机没配 key；它的重放逻辑与 CLI 新开会话时同一套，假连接测过）。
