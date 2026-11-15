# 用词（wording/）

> 2026-11-02。外壳与扫描器来自云织桌面版的 `wording/`；词表内容是流息的（产品方案 §1.7、验收 V7）。

## 一、放在哪

```
wording/
  glossary.json         词表：内部词 → 对用户说（zh / en / gloss）；五种抓取状态的词
  banned-terms.json     禁用词表：硬名单（机器判定）、软名单（只提醒）、归一规则、品牌词的例外句
  src/normalize.mjs     扫描前的归一：全角、零宽字符、汉字间空白、繁体
  src/scanner.mjs       扫描器：scanText · scanCard · scanPayload · scanStrings · formatForAgent
  src/glossary.mjs      userTerm · entriesById · fetchStateWord
  scripts/scan.mjs      命令行
  test/                 glossary · scanner · source-hygiene（每条「过」都带一条会失败的对照）
```

## 二、词表 `glossary.json`

词表有三部分，各管一件事：

1. **内部词 → 对用户的说法**（`entries`，方案 §1.7 的对照表，维护者 11-02 定）：Bronze / Silver / Gold → 抓到的 / 待看 / 已收藏；judge / relevance / threshold → 打分 / 相关度 / 过关线；promote / dismiss → 收藏 / 放弃；one_line → 这是什么；keeper、Intake Gate、Preflight、selftest、pending.json、judgments.json、ledger → 不出现（`hide`）。扫描器命中禁词时从这里取建议。
2. **五种抓取状态**（`fetch_states`）：ok / empty / gap / failed / blocked → 正常 / 无更新 / 地址无效 / 暂时失败 / 访问被拒（英文 OK / No updates / Invalid address / Temporary failure / Access denied）。重设计 R6b-1 起照 05 第三节（维护者 11-11 过目第 1 条）；与 `desktop/src/shared/fetch-states.mjs` 的五个键、界面两套字典的 `FETCH_STATES`、core 给主 Agent 的 `STATE_WORDS` 逐字相同，由测试核对。四句处理建议不在词表里，在界面字典的 `FETCH_HINTS` 与 core 的 `ADVICE_WORDS`（两处逐字相同，句子见 `docs/desktop.md` §4.22）。
3. **英文用词表**（`english`，重设计 R6b-3）：见下一小节。

**第 1 部分与现在界面的对照**：重设计按 `05-措辞规范`（入库副本 `docs/design/redesign/source/05-措辞规范.md`）改了界面的说法，界面字典以 05 为准（逐行对照在 `docs/checks/2026-11-13-r6b/05-对照.md`）。§1.7 那张表里有四个说法在界面上已经换了，词表的 `entries` 还是 11-02 的原样（见 §六）：

| 内部词 | 词表 `entries`（§1.7） | 界面现在的说法（05） |
|---|---|---|
| judge | 打分 | 评分（待评分、重新评分、评分环节） |
| threshold | 过关线 | 通过阈值；三档合称严格程度 |
| one_line | 这是什么 | 内容概述 |
| Bronze | 抓到的 | 界面上不再有这个分页；未进入待看的在待看的「未通过筛选」与「待评分」里 |

其余（待看、已收藏、相关度、收藏、放弃）两边相同。

### 英文用词表（redesign R6b-3，2026-11-14）

英文界面（Streams）的用词定在 `glossary.json` 的 `english` 一节，下面三张表是它的内容（改词改那个文件，这里跟着改；`wording/test/glossary.test.mjs` 核这一节自己，`desktop/test/r6b-english.test.mjs` 按它核两套字典的全部中英对）。一个中文界面词对一个英文词，专名的大小写在这里定、处处一致。

| 中文 | 英文 | 怎么用 |
|---|---|---|
| 待看 | Inbox | 指这个地方时一律 Inbox，首字母大写，前面带 the（in the Inbox）；说一条内容的状态或数量时可以说 to review（{n} to review、Nothing to review）。不用 To read。 |
| 库架 | Shelf | 首字母大写。 |
| 资料库 | Library | 作标签名时首字母大写（the Library tab）；泛指一个库时小写 library。 |
| 问库 | Ask | 标签名与说话人都叫 Ask。 |
| 来源与要求 | Sources & Brief | 专名，两个词都大写，用 &；不写 Sources & brief、Sources and brief。 |
| 追踪要求 | Brief | 作标签时 Brief；句子里小写 the brief。 |
| 主 Agent | Main agent | 只有 M 大写；句子里 the main agent。不写 Main Agent。 |
| 收藏 | Keep | 动作 Keep，状态 Kept；不用 save（save 只指保存设置）。 |
| 放弃 | Discard | 不用 let go，也不用 dismiss（dismiss 是「忽略」）。 |
| 稍后处理 | Later | — |
| 忽略 | Dismiss | 只用于系统检测的「忽略」；状态 Dismissed。 |
| 待确认 | To confirm | — |
| 系统检测 | Detected by Streams | 动词用 detect（Streams detected …）。 |
| 运行 | run | 抓取 → 评分 → 摘要的一次完整过程叫 run（Run now、Last run、this run、per-run cap）；不用 round。 |
| 核验的第 n 轮 | round | 只有核验记录里的「第 n 轮」叫 round（Round 2、verified in 2 rounds）：它是一次运行内部核验与退回修改的回合，不是一次运行。只出现在 banned 里 round 一条的 allow_keys 列出的键里。 |
| 核验 | verification | 名词 verification，动词 verify，结果 Verified / Verification failed / Not verified；不与 check 混用（check 只用于「重新检测」「检查更新」这类普通动词，以及「判定」= model check）。 |
| 校验规则 | Validation rules | 评分环节的规则叫 rule（Built-in rule、Delete this rule），校验叫 validation；由模型判的一项叫 model check（判定）。 |
| 严格程度 | Strictness | 三档 Loose / Standard / Strict，另有 Custom。 |
| 单次运行上限 | Per-run cap | 05 第 152 行。不写 per-run limit。 |
| 缺少文件头 | Missing a header | — |
| 库内暂无相关内容。 | Nothing in this library on that. | V9 的句子（维护者 11-11 过目的中文；英文照 05 第 178 行）。 |
| 提示词 | Instructions | 有意偏离 05 第 145 行，见 deviations。 |
| 设为当前连接 | Set as current connection | 有意偏离 05 第 167 行，见 deviations。 |
| 评分 | scoring | 动词 score，重新评分 Re-score；评分环节 Scoring step。 |
| 内容概述 | Overview | 摘要是 Summary；「内容概述」一句是 Overview，两个词不混。 |
| 提议 | proposal | 主 Agent 提议 = Proposed by the main agent。 |

**核验的「第 n 轮」叫 round，运行不叫 round。** 一次运行（抓取 → 评分 → 摘要）一律是 run；核验记录里的「第 n 轮」是一次运行内部「核验 → 退回修改 → 再核验」的回合，另用 round，只出现在五个键里（见下表白名单），别处 round 零命中。

不再用的旧英文（字典里零命中，由测试核）：

| 旧说法 | 改说 | 白名单（仍可出现的键） |
|---|---|---|
| To read | Inbox | 无 |
| letting go | Discard | 无 |
| round | run | `ask.js:ASK.panel.check`、`library.js:VERDICTS.round`、`library.js:VERDICTS.sentBack`、`library.js:VERDICTS.result`、`library.js:VERDICTS.resultCalls`（这五个键说的是核验记录里的「第 n 轮」（verification-round 一条）） |
| Sources & brief | Sources & Brief | 无 |
| inbox | Inbox | 无 |
| Checks | Verification record / Validation rules / Verification model | 无 |
| Main Agent | Main agent | 无 |
| per-run limit | per-run cap | 无 |
| save or dismiss | Keep or Discard | 无 |

另有按「中文里有这个词，英文就必须是那个词」核的十三条（`english.pairs`）：核验 → verif…（不许出现 check）、收藏 → keep / kept（不许出现 save）、放弃 → discard、来源与要求 → Sources & Brief、待确认、系统检测、主 Agent、追踪要求、严格程度、单次运行上限、缺少文件头、提示词、待看。

对 05-措辞规范 英文建议稿的两处**有意偏离**（其余 13 处偏差的取舍见 `docs/checks/2026-11-13-r6b/05-对照.md`「英文列 15 处偏差」）：

| 05 行 | 中文 | 05 的建议稿 | 我们用 | 理由 |
|---|---|---|---|---|
| 145 | 提示词（可编辑） | Prompt (editable) | Instructions (editable) | desktop/test/texts-en.test.mjs 把 prompt 列为英文界面禁用的行话（同 json、yaml、hash 等），字典里八处「提示词」一直用 Instructions；保持，不改测试。 |
| 167 | 设为当前连接 | Use for scoring | Set as current connection | 中文已从「打分用这一条」改成「设为当前连接」（当前连接不只用于评分，摘要、问库、主 Agent 都用它），05 的英文建议稿没有跟上；英文跟中文。 |

屏幕自己拼在两段字之间的标点（括号、冒号、顿号、分号、逗号）也按语言取：`texts/common.js` 的 `PUNCT` 是全角，`texts-en/common.js` 的是半角带空格；代码里不再写全角标点（`desktop/test/r6b-english.test.mjs` 核）。

## 三、禁用词表 `banned-terms.json`

硬名单（命中即不过）：
- `tier-names`：Bronze · Silver · Gold · Medallion（英文、不分大小写、ASCII 词边界、认复数）
- `pipeline-words`：judge（含 judged / judging / judgment(s)）· keeper · gate（含 gating / gated / gatekeeper）· pending · ledger
- `brand-names`：Claude · Anthropic · OpenAI · ChatGPT；例外句（`except_re`）：`连接你电脑上的 Claude Code`、`Connect the Claude Code on this computer`。Codex 不是禁词。型号名（Claude Opus、Sonnet、Haiku、Fable、GPT-）以后放型号表里时再加例外。型号表与许可证页不经扫描器。
- `internal-files`：pending.json · judgments.json · Intake Gate · Preflight · selftest · 带下划线的字段名（`one_line` 这类）
- `env-files`：127.0.0.1 与本机链接

软名单（只在 `advise:true` 时列为提醒）：青铜 / 白银 / 黄金、账本、关卡 / 闸门、判定。

## 四、扫描器

扫什么：界面字典的每个值（`desktop/test/wording.test.mjs` 扫 `texts/`、`texts-en/`、`src/main/texts*`）；以后流水线把模型写的「这是什么」一句话扫过才显示（方案 C5）。不扫：条目本身的标题、正文与出处；《》里的标题（除标了 `in_titles` 的我们自己的文件名）；网址；与用户原话逐字相符的引文。

接口与命令行同云织（`scanText(text, opts, field)`、`scanCard(card, opts)`、`scanStrings(dict)`、`formatForAgent(result)`；`node scripts/scan.mjs --text "…"`）。

## 五、测试

`cd wording && npm test`。`glossary.test.mjs`：JSON 有效、每条合 schema、§1.7 的九个对照（`userTerm`）、七个不出现的都是 `hide`、五种抓取状态与外壳一致、V7 九个词都在硬名单并指向词表、词表里建议说的话自己不含禁词（带会失败的对照）。`scanner.test.mjs`：九个词任何大小写与复数都命中、不在别的词里面误命中、品牌词命中而允许句放行、旧条目卡每个字段都命中、改写后零命中且任一字段放回一个词就命中、写法变体归一、标题与网址不扫、用户原话放行、每条硬名单都能触发。`source-hygiene.test.mjs`：源文件没有裸的不可见字符。

## 六、已知缺口

- 词表 `entries` 里 §1.7 的四个说法（打分、过关线、这是什么、抓到的）没有跟着 05 改（§二 的对照表）：它们是 维护者 11-02 定的对照，`glossary.test.mjs` 逐个断言，扫描器的建议从这里取；重设计 R6b 只改了五种抓取状态并加了英文用词表。要不要把这四个改成 05 的说法，等 维护者 定。
- 英文用词表不管安装程序的界面（只有简体中文）。
- 英文界面的「relevance」「keep」是日常词，不在禁词里；英文界面禁词由 `desktop/test/texts-en.test.mjs` 的 `BANNED` 再核一遍（V7 九个词）。
- 云织的 skill 相关部分（skill-notes.json、sync-skills、skill-section）没拿：流息没有 skill。
