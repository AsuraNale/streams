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

方案 §1.7 的对照表：Bronze / Silver / Gold → 抓到的 / 待看 / 已收藏；judge / relevance / threshold → 打分 / 相关度 / 过关线；promote / dismiss → 收藏 / 放弃；fetch status ok / empty / gap / failed / blocked → 正常 / 没新内容 / 地址有问题 / 暂时失败 / 被拒绝；one_line → 这是什么；keeper、Intake Gate、Preflight、selftest、pending.json、judgments.json、ledger → 不出现（`hide`）。`fetch_states` 与 `desktop/src/shared/fetch-states.mjs` 的五个键、`desktop/src/renderer/texts/common.js FETCH_STATES` 的词由测试核对一致。

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

- 英文界面的「relevance」「keep」是日常词，不在禁词里；英文界面禁词由 `desktop/test/texts-en.test.mjs` 的 `BANNED` 再核一遍（V7 九个词）。
- 云织的 skill 相关部分（skill-notes.json、sync-skills、skill-section）没拿：流息没有 skill。
