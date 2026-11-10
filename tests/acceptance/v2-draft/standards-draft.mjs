// v2 验收标准 N1–N6 · 草案，待 维护者 定（docs/design/v2/architecture.md 第五节；只有 维护者 能定，定了之后并入
// tests/acceptance/standards.mjs，由 tests/acceptance/run.mjs 一起跑）。这里的 `standard` 是 architecture.md 第五节表里的原文，
// 一字不改；`how` 是这一版测试的核法（工作包 J1，玄翎 11-09 契约 J1.1）。跑：node tests/acceptance/v2-draft/run-draft.mjs
//
// V_SUGGESTIONS：v1.0 的 V1–V12 到了 v2 原文还对不对、建议怎么改字、为什么——只是建议，标准原文（standards.mjs）一字没动。
import { STANDARDS } from '../standards.mjs'

export const STATUS = '草案，待 维护者 定'

export const DRAFT = [
  { id: 'N1', file: 'n01-proposal-only-confirm.test.mjs',
    standard: '主 Agent 的任何改动都必须经一张你确认过的提议卡；变异测试：去掉「只认确认」的守卫，测试必须变红',
    how: '桌面主进程的库登记、提议卡、主 Agent 三个服务（main.mjs 的接法，纯 Node），主 Agent 用核心的脚本假连接：两轮出齐十种卡；确认前两个库、库登记、新库位置的每个文件哈希不变、没有排队；「不要」两张、「改一下」一张后仍不变；对已「不要 / 改一下」的卡点「确认」被拒、不变；其余七张逐张确认后各改各的、changes.jsonl 记 agent-confirmed + 卡 id、新库建好并登记、排队各一轮。反向：三个变异体（核心 assertPending 放过非待定的卡；「不要」执行了卡；主 Agent 出卡即确认）各在对应一步变红' },
  { id: 'N2', file: 'n02-cli-no-hands.test.mjs',
    standard: '库 Agent / 问库 / 主 Agent 的命令行调用一律「不能动手」（Claude Code 零工具；Codex 只读沙箱且不联网）；扫描所有调用参数',
    how: '（1）静态：core/src 与 desktop/src/main 里每一处能起进程的调用都在已知清单里（新地方红），快调用只许已知参数（--version、登录状态）；（2）运行时：真连接器接一个假 spawn（不跑 CLI、不调模型），把一轮库 Agent（自检、两道关、摘要、核验）、问库、分流的模型兜底、主 Agent 新开与接续会话，在 Claude Code 与 Codex 上各走一遍，每次调用的 argv 过白名单（Claude Code：--tools "" 等 v1.0 那组外加会话参数；Codex：exec 只读沙箱 / resume 用 -c sandbox_mode="read-only"，无联网、工具、目录、配置参数），工作目录是临时文件夹下的空目录。反向：白名单对植入的各种带工具 / 绕过权限 / 可写沙箱 / 联网参数逐条报出；四个核心变异体（一问一答给 Bash、主 Agent 加 --allowedTools、Codex 首次与接续改可写沙箱）在对应路径变红；植入一个起 claude 带工具的新地方，静态扫描报出' },
  { id: 'N3', file: 'n03-ai-instructions.test.mjs',
    standard: '一篇含「写给 AI 的指令」的材料：条目被标记、来源与库配置零改动（UC5）',
    how: '核心 runRound 跑一轮（脚本假连接、本机假源），四篇材料：中文指令、英文指令、措辞相近但不是指令、普通。两篇指令进待看带标记（卡片、核验、账本 inbox 事件）、ai-instructions.jsonl 各一行记来源；另两篇不标；streams.json 字节不变、没有 changes.jsonl / proposals.jsonl、来源都在且没暂停；规则型建议点名该来源且记录建议后配置仍不变。反向：只有无指令材料的库什么都不标、不记、不建议；变异体（规则找不到 → 不标；见标记就暂停来源 → streams.json 变）各自变红' },
  { id: 'N4', file: 'n04-schedules-one-round.test.mjs',
    standard: '三个库各自定时：错过补一轮不叠加；同一时间只跑一轮',
    how: '桌面定时服务（假时钟、假定时器），三个库各自的定时写在各自 streams.json；轮次用一个不拒绝第二轮的替身（单轮只能来自定时服务）。三个时刻各起各的库、后到的等前一个跑完、从不同时两轮；同一分钟两个库先后跑；关了三天后启动每库只补一轮（不是三轮）、最早的先、唤醒时再补不加、跑完后不再欠；忙时「现在跑一轮」不叠加：已在排的答「已排上」、不再排一次，每库只跑一轮（v2 包 L 起排到队尾，不再被拒）。反向：变异体（队列在有轮次运行时也启动下一个 → 同时两轮；已在队列的库再次入队 → 补跑叠加）各自变红' },
  { id: 'N5', file: 'n05-session-lost.test.mjs',
    standard: '主 Agent 会话缓存丢失（删掉 `session.json`）后，对话能从正本接着进行',
    how: '桌面主 Agent 服务 + 核心真会话连接器（Claude Code 与 Codex 各一遍）接假 spawn：六轮长对话触发压缩出摘要；之后新开会话的提示里带摘要、接续那轮不带（对照）；删 session.json 后下一轮开新会话（新 id）、提示里带摘要与上一轮的话、回答照常、轮次接着编号、session.json 重写；CLI 不认会话时也接得上并说一次。反向：变异体（新会话不带正本上下文）在「删 session.json 后提示里有摘要」变红' },
  { id: 'N6', file: 'n06-use-cases.test.mjs',
    standard: '设计稿五个 Use Case 在真窗口里逐步走通，截图与设计稿对照',
    how: '真应用（固定版本 Electron，测试自己的应用数据目录，测试运行不往外开东西，窗口无焦点显示以便截图），全部连接是核心假连接、主 Agent 走脚本、来源与文章在本机假站。按 docs/design/v2/brief.md 第五节 UC1–UC5 逐步：每步断言界面（必要时也核磁盘），截图存 docs/shots/acceptance-v2/uc<n>-<step>.png。与设计稿的已知差别按产品决定核（无「以后这类直接换」；第一次进库停在待看）。「截图与设计稿对照」由人看截图（本测试只保证每步有图、界面断言过）' },
]

/** V1–V12 到 v2 的建议改字（只是建议；原文在 ../standards.mjs，只有 维护者 能改）。 */
export const V_SUGGESTIONS = [
  { id: 'V1', suggest: '在本机（Windows 11 家庭版，不另装虚拟机）直接装安装包，从安装包到 UC1 走完（首次打开选连接 → 和主 Agent 聊着建库 → 第一轮跑完 → 待看里收藏一条，文件出现在这个库的 notes/）全程不敲命令，真连接一并测；发布说明写明本版未在干净机器上验过',
    why: '「用例 A 第 6 步」是 v1.0 首次设置的路径；v2 首次打开（包 I）只剩连接一步，然后进和主 Agent 聊建库（UC1），v1.0 的起步包流程成了「手动新建」。「v1.0 未在干净机器上验过」里的版本号随发版走，改成「本版」免得把版本号写死' },
  { id: 'V2', suggest: '没有任何条目不经用户点收藏进入 notes/；主 Agent 也不能（十种提议卡没有一种写 notes/，确认了也不写）',
    why: '原文仍对（writeNoteFile 唯一入口、by: keep / import-header / edit）。v2 多了能改库的主 Agent，维护者 11-05「Agent 不经点头写 notes/：先不能」值得写进标准，变异测试照旧' },
  { id: 'V3', suggest: '五种抓取状态各能触发，且界面文案和「怎么办」对应正确（概览的来源横幅与运行状态、来源与要求的来源行、提议卡的试抓结果三处）',
    why: '原文仍对。v2 里这几个字出现的地方变了：今日并进概览、运行状态并进概览、来源与主题改叫来源与要求，提议卡的试抓也用这五种状态' },
  { id: 'V4', suggest: '没有新数据连跑两轮，第二轮该库的账本、索引、inbox 零改动，其他库的文件也零改动',
    why: '原文按「一个库」写；v2 多库，补一句其他库不受影响（排队、定时按库）' },
  { id: 'V5', suggest: '模型输出坏格式时重试一次，再坏就标未评分，条目不丢；主 Agent 的回答坏格式重试一次，再坏只显示文字、不出卡、不执行',
    why: '库 Agent 部分原文仍对；主 Agent 的同一条规则（architecture 2.2）现在只有包 C 的分包测试在核，建议并入验收' },
  { id: 'V6', suggest: '登录过期时，当轮不开始，概览横幅说明，抓到的条目完整保留；主 Agent 那一轮在对话里说明并给「去设置」，不出卡',
    why: 'v2 没有「首页」：今日并进各库的概览（包 F）；主 Agent 的连接出问题时对话里一行说明（包 G 的 connection 提示）' },
  { id: 'V7', suggest: '原文不改；扫描范围写明含 v2 新界面（库架、和主 Agent 聊、提议卡 / 建议卡、阅读窗口顶栏、首次打开、新建库）',
    why: '禁词表与品牌词规则在 v2 仍对；许可证页多了 @mozilla/readability 一行（不是品牌词）。只是把新界面写进「全部界面文件」免得漏扫' },
  { id: 'V8', suggest: '原文不改（按库成立）',
    why: '待规范是每个库自己的，v2 多库不影响' },
  { id: 'V9', suggest: '问库答案的每个引用编号都在候选集内；库里没有的问题得到「库里没有」；问库对话框里判成改动要求的话转给主 Agent、不当问题回答',
    why: '前两句原文仍对；v2 问库前面加了分流（包 E），被判成改动要求的那句不进问库（UC3 第 3 步），建议写进标准' },
  { id: 'V10', suggest: '每个库的每轮上限各自生效：一个库上限设 5，第 6 条不调模型，剩余条目下一轮接着跑；另一个库的上限不受影响；设置里显示全部库本月用量合计',
    why: '维护者 11-05 定「每轮上限按库算 + 设置里显示全部库本月用量合计」；原文是一个全局上限' },
  { id: 'V11', suggest: '原文不改',
    why: 'v1.0 没有发（维护者 11-05），v2 仍是第一个公开的版本，「第一版未签名」仍对；README 与关于页仍写「由 Starry Digital 开发」（本包改 README 时保留了下载与安装一节）' },
  { id: 'V12', suggest: '原文不改；（可选）加一句：核验层的「写给 AI 的话」标记不改分数、不退回、不让条目消失',
    why: '核验三条原文仍对；「写给 AI 的话」是 v2 加在核验层的规则，标记的核法在 N3，是否也写进 V12 由 维护者 定' },
]

/** The V row a suggestion is about (its current text, from standards.mjs). */
export const currentV = id => STANDARDS.find(s => s.id === id)
