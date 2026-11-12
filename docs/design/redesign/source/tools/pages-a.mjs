import { B, A, I, TA, SEL, RADIO, CHK, rail, libHead, RUN_IDLE, rp, frame, dialog } from './kit.mjs';

const T1 = '长期运行的 agent 怎么记住用户：三种记忆方案的对比评测';
const T2 = 'MemBench 第二轮结果：开源 agent 记忆方案在「隔天回来」上普遍失分';

// 右栏 · 详情（待看里选中的一条）：只放主区没有的东西
const detailInbox = `<div class="rph"><small>详情 · 待看 · 当前条目</small><b>${T1}</b></div>
<h3>推荐理由</h3>
<dl class="kv" data-f="F60"><dt>相关度 0.90</dt><dd>一篇评测文章：用同一组 200 个多轮任务对比摘要链、向量检索、分块记忆三种方案的召回率、成本和出错方式，与「记忆方案与评测」高度相关。</dd>
<dt>实质 0.85</dt><dd>有具体数字：摘要链 31 个任务用了作废偏好，向量检索偏好题答对 87%，分块记忆成本为 1.6 倍。</dd>
<dt>新鲜度</dt><dd>新：库内没有同一实验的内容。</dd></dl>
<h3>核验</h3><p><span class="ok">核验通过</span> 未检测到面向 AI 的指令</p>
<div class="fold"><button class="sum" data-f="F30">▸ 核验记录（相关度 4 项 · 实质 5 项 · 摘要 6 项）</button></div>
<h3>来源</h3><p class="meta">my-feed · 发布 2026-11-10 · 首次抓取 今天 20:35</p>`;

const inboxCard = (sel, title, meta, flag, what, pts) => `<div class="card ${sel ? 'sel' : ''}" data-f="F24">
  <div class="row"><h4>${A('F38', title, '')}</h4><span class="sp"></span>${flag}</div>
  <p class="meta">${meta}</p>
  <p><b>内容概述：</b>${what}</p><ul class="pt">${pts.map(x => `<li>${x}</li>`).join('')}</ul>
  <div class="row">${B('F25', '收藏', 'pri')}${B('F26 N03', '放弃')}${B('F27', '稍后处理')}</div></div>`;

export const pagesA = [
  {
    id: 'P01', name: '首次打开', file: 'P01-首次打开.html',
    note: `<b>改 F08、合并 F09。</b>现在是两步（先选连接、再说想追什么），新稿并成一屏：流息自己检测，找到已登录的就先用推荐的那一条，并把「用的是哪条、算在谁头上」写在最上面一行；第一次真调用并进第一句话里，不再单独「试一次」。<ul><li>没找到 / 没登录 / 想换：见 P02。</li><li>例句点一下只填进输入框，不发（不变）。</li></ul>`,
    html: frame(`<div class="center">
      <div class="logo" style="border:0"><i>流</i><div><b>流息</b><small>STREAMS</small></div></div>
      <div class="sec row" data-f="F08"><span class="ok">已连接</span><span>当前连接：<b>连接你电脑上的 Claude Code</b> · 版本 2.1.287 · 已登录 · 用量计入你的套餐</span><span class="sp"></span>${A('F08', '更换连接', 'lnk', 'P02-首次打开-连接要看一眼.html')}</div>
      <h2 style="font-size:26px;margin:26px 0 6px">你想追踪什么内容？</h2>
      <p class="sub" style="font-size:14px">用一句话描述需求，主 Agent 将据此生成建库提议（来源、主题、严格程度），确认后才会创建。</p>
      <p class="sub" style="margin-top:16px">示例（点击填入输入框，可修改后发送）：</p>
      <div style="display:grid;gap:8px;margin:8px 0 18px;justify-items:start">
        ${B('F09', '帮我建个库，追踪中国电动车行业，重点是整车销量、电池和充电。')}
        ${B('F09', '我想跟踪 AI agent 的新工具和评测，不要营销稿。')}
        ${B('F09', '帮我盯着几家中国时尚上市公司的财报和新品。')}
      </div>
      ${TA('F14', '描述想追踪的内容、需要排除的内容，以及常用的来源地址', '', 3)}
      <div class="row" style="margin-top:10px">${A('F56', '手动创建', 'lnk', 'P04-新建库-自己填.html')}${A('F08', '暂不创建，先进入应用')}<span class="sp"></span>${B('F14', '发送', 'pri')}</div>
    </div>`, 'solo'),
  },
  {
    id: 'P02', name: '首次打开 · 连接要看一眼', file: 'P02-首次打开-连接要看一眼.html',
    note: `<b>F08（硬约束原样保留）。</b>只有三种情况才出现这一屏：一条可用的连接都没找到、找到了但没登录、用户点了「换一种连接」。三种连接的说法、「去登录」开可见终端由 CLI 自己登录，都不动。`,
    html: frame(`<div class="center">
      <h2 style="font-size:24px;margin-bottom:6px">连接模型</h2>
      <p class="sub" style="font-size:14px;margin-bottom:16px">流息通过该连接完成评分、摘要与问答。请选择一种连接方式，之后可在设置中更改。</p>
      <div class="sec" data-f="F08"><div class="row"><b>连接你电脑上的 Claude Code</b><span class="chip">推荐</span><span class="sp"></span><span class="flag">已找到 2.1.287 · 未登录</span></div>
        <p class="sub">用量计入你的套餐。点击「前往登录」将打开终端窗口，由该工具自行完成登录，流息不接触账号密码。</p>
        <div class="row" style="margin-top:8px">${B('F08', '前往登录', 'pri')}${B('F08', '已登录，重新检测')}</div></div>
      <div class="sec" data-f="F08"><div class="row"><b>连接你电脑上的 Codex</b><span class="sp"></span><span class="ok">已找到 0.44 · 已登录</span></div>
        <p class="sub">用量计入你的套餐。</p><div class="row" style="margin-top:8px">${B('F08', '使用此连接')}</div></div>
      <div class="sec" data-f="F08"><div class="row"><b>输入 API key</b><span class="sp"></span><span class="sub">按量计费</span></div>
        <div class="row" style="margin-top:8px">${B('F08 F63', '输入 API key')}</div></div>
      <div class="row">${B('F08', '重新检测', 'ghost')}<span class="sp"></span>${A('F08', '暂时跳过，稍后在设置中连接')}</div>
    </div>`, 'solo'),
  },
  {
    id: 'P03', name: '和主 Agent 聊', file: 'P03-和主Agent聊.html',
    note: `<b>F14 保留，F16 改，F15 砍。</b>一张卡只在两处：它出生的那段对话里，和右栏「待确认」（唯一的清单，可就地点）。对话顶上的「等你定的事」条、右栏详情里的「提的卡」、左栏「和主 Agent 聊」后面的数字都去掉（O1）。<ul><li>主 Agent 的回复只用界面上的词：提议卡、主题、严格程度、定时、流息（N11，针对 O6）。</li><li>点「建库」后直接落到新库的「待看」，第一轮自动开始（见 P07）。</li></ul>`,
    html: frame(`${rail('agent', {}, [])}
    <main><div class="body">
      <h2 style="font-size:23px">主 Agent</h2><p class="sub">创建库、调整库设置、查询各库情况。所有改动均以提议形式提交，确认后生效。</p>
      <div style="margin-top:18px" data-f="F14">
        <div class="bub">我想追 AI agent 的长期记忆方案和评测，不要营销稿。来源先只用我常看的这个订阅：http://127.0.0.1:47831/feed.xml</div>
        <p class="faint">已查询：该订阅地址（试抓结果：正常 · 5 条）</p>
        <p style="margin-bottom:12px">已生成建库提议。来源仅包含你提供的这一个；严格程度暂定为「标准」，营销内容主要由「实质」环节过滤。点击「创建」后由流息创建该库，并立即开始首次运行。</p>
        <div class="card" data-f="F16"><div class="row"><span class="from">主 Agent 提议 · 确认后生效</span></div>
          <h4 style="margin:4px 0 10px">创建库：AI Agent 长期记忆</h4>
          <dl class="kv"><dt>要求</dt><dd>追踪 AI agent 的长期记忆方案与评测。只要有技术细节或数据的内容：记忆架构、检索与写入策略、压缩/遗忘、基准与评测方法、实验结果。不要营销稿、产品通稿、无数据的观点。</dd>
          <dt>严格程度</dt><dd>标准</dd>
          <dt>主题</dt><dd><span class="chip">记忆方案</span> <span class="chip">记忆评测</span></dd>
          <dt>来源</dt><dd>my-feed <span class="ok">正常 · 5 条</span></dd>
          <dt>定时</dt><dd>每天 08:00 · 单次运行最多 120 次模型调用</dd>
          <dt>存储位置</dt><dd class="meta">文档\\流息\\AI Agent 长期记忆</dd></dl>
          <div class="row" style="margin-top:12px">${B('F16', '创建', 'pri')}${B('F16', '提出修改')}${B('F16', '拒绝')}</div></div>
      </div>
      <div class="sec" style="margin-top:22px">${TA('F14', '向主 Agent 描述需求：创建库、调整设置、查询各库情况', '', 2)}<div class="row" style="margin-top:8px"><span class="sub">每条消息消耗 1–2 次模型调用</span><span class="sp"></span>${B('F14', '发送', 'pri')}</div></div>
    </div></main>
    ${rp('待确认', `<div class="rph"><small>全部库 · 待确认</small><b>1 项</b></div>
      <div class="card" data-f="F59 F16"><span class="from">主 Agent 提议 · 来自主 Agent 对话</span><p><b>创建库：AI Agent 长期记忆</b></p><p class="sub">1 个来源 · 2 个主题 · 每天 08:00</p>
      <div class="row" style="margin-top:8px">${B('F59 F16', '创建', 'pri sm')}${B('F59 F16', '提出修改', 'sm')}${B('F59 F16', '拒绝', 'sm')}</div></div>`, 1)}`),
  },
  {
    id: 'P04', name: '新建库 · 自己填', file: 'P04-新建库-自己填.html',
    note: `<b>改 F56（四步向导 → 一页），F57 保留。</b>针对 O16：<ul><li>「追什么、不要什么」是必填的第一项，所以第一轮就按要求打分（现在的向导里没有这一步，试跑 0 条过关）。</li><li>来源：一个输入框，贴了回车，流息自己认种类、就地试抓，结果一行写清（不再漏出原始报错，O9）。</li><li>放在哪、定时都有默认值，可以就地改；没有「只显示不能改」的一步。</li><li>左栏和右栏都在，不把人关在向导里。建完和主 Agent 建的一样：直接跑第一轮、落到待看；默认值也一样（O15）。</li><li>起步包不再是一步，留成来源那块的一行「用现成的一套」；按钮旁留「只建不跑」（维护者 11-11 定）。</li></ul>`,
    html: frame(`${rail('new', { a: { n: 0 } }, ['a'])}
    <main><div class="body" style="max-width:760px">
      <h2 style="font-size:23px">新建库</h2>
      <div class="seg" style="margin:12px 0 18px">${B('F09 F56', '由主 Agent 生成')}${B('F56', '手动填写', 'on')}</div>
      <div class="sec"><h3>库名称</h3>${I('F56', '例如：中国电动车', '中国电动车', 'blk')}
        <h3>追踪要求</h3>${TA('F45 F56', '描述需要追踪的内容与需要排除的内容', '追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量与技术路线。不要车型评测、促销和软文。', 3)}
        <h3>严格程度</h3><div data-f="N01">${RADIO('N01', 'strict', ['宽松（收录更多）', '标准', '严格（仅收录高度相关）'], 1)}</div></div>
      <div class="sec"><h3>来源</h3>${I('F49', '输入 RSS 地址、arXiv 检索词或 Hacker News 关键词，按回车添加', '', 'blk')}
        <p class="sub" style="margin-top:6px">或 ${A('F56', '使用预设来源包：AI Agent 工具（3 个主题 · 9 个来源）')}，添加后可逐个移除</p>
        <table class="t" style="margin-top:8px" data-f="F48">
          <tr><td><b>ev-news</b><div class="meta">RSS · http://127.0.0.1:47831/ev.xml</div></td><td><span class="ok">正常 · 2 条</span><div class="sub">最新：「10 月乘用车零售数据」</div></td><td>${B('F48', '移除', 'sm ghost')}</td></tr>
          <tr><td><b>maker-notices</b><div class="meta">RSS · http://127.0.0.1:47832/notices.xml</div></td><td><span class="flag">暂时失败</span><div class="sub">对方服务器未响应。可先添加，下次运行时将自动重试，无需修改地址。</div></td><td>${B('F48', '移除', 'sm ghost')}</td></tr>
        </table></div>
      <div class="sec"><h3>主题（选填）</h3><div class="row"><span class="chip">月度数据</span>${I('F46', '输入主题名称，按回车添加', '')}</div>
        <h3>存储位置</h3><div class="row" data-f="F57"><span class="meta">文档\\流息\\中国电动车</span><span class="sub">空文件夹，将在此创建库</span><span class="sp"></span>${B('F56 F57', '更改…', 'sm')}</div>
        <p class="sub">也可选择已包含 .md 文件的文件夹：流息会将其作为库打开，不移动、不修改原有文件。</p>
        <h3>定时</h3><div class="row">${CHK('F47', '每天')}${I('F47', '', '08:00', '', 'style="width:70px"')}<span>自动运行 · 单次运行最多</span>${I('F47', '', '120', '', 'style="width:60px"')}<span>次模型调用</span></div></div>
      <div class="row">${B('F56', '取消', 'ghost')}<span class="sp"></span><span class="sub">创建后立即开始首次运行，预计 3–9 次模型调用</span>${B('F56', '仅创建')}${B('F56', '创建并运行', 'pri')}</div>
    </div></main>
    ${rp('进度', `<div class="rph"><small>全部库 · 20:50</small><b>当前无运行任务</b></div><h3>下次运行时间</h3><p class="row" data-f="F58"><span class="ico">A</span> AI Agent 长期记忆<span class="sp"></span><span class="meta">明天 08:00</span></p>`)}`),
  },
  {
    id: 'P05', name: '待看', file: 'P05-待看.html',
    note: `<b>库的落地页（概览砍掉了）。改 F13、F24、F26、F27、F33、F50。</b><ul><li>页头常驻运行状态和「现在跑一轮」，四个标签都看得见（N06，针对 O20）；点了直接开始，不弹对话框（改 F22）。</li><li>卡上只留一行分数，理由只在右栏详情（O4）；标记（写给 AI 的话、未通过核验、没有打分）原样留在卡上。</li><li>标题一律开流息的阅读窗口（O10）。</li><li>「放弃」直接生效，随后一条可撤销的小条让你点一个理由（N03）；「稍后」的条目收进一行，下一轮回来（O11）。</li><li>「没过关的」从资料库搬到这里，能真的「放进待看」（N02，针对 O13）；要求改过以后可以给旧分数重新打分（N07，针对 O8）。</li><li>「贴一个链接」搬到这里，贴完立刻占一行「等打分」（N09，针对 O12）。</li></ul>`,
    html: frame(`${rail('a', { a: { n: 2 } })}
    <main>${libHead('a', '待看', RUN_IDLE)}
    <div class="body">
      <div class="row" style="margin-bottom:12px"><h2>待看 · 2 条</h2><span class="sub">按评分排序</span><span class="sp"></span><span class="sub" data-f="F28">J / K 切换 · C 收藏 · D 放弃 · L 稍后处理</span>${B('F50', '＋ 添加链接', 'sm')}</div>
      ${inboxCard(true, T1, 'my-feed · 2026-11-10 · 相关度 0.90 · 实质 0.85 · 新', '', '记忆工程周刊的一篇对比评测：用同一组 200 个多轮任务，在用户改口、隔天回来继续、同时开两件事三种情形下比较三种 agent 记忆方案。', ['摘要链每 6 轮压缩一次，平均每个任务多花 9% 的 token，但 200 个任务里有 31 个在第二天回来时用了已经作废的偏好。', '向量检索召回率最高，偏好类问题答对 87%，但不懂时间先后。', '分块记忆作废的偏好只出现了 4 次，总成本是摘要链的 1.6 倍。'])}
      ${inboxCard(false, T2, 'my-feed · 2026-11-09 · 相关度 0.85 · 实质 0.80 · 后续', '<span class="flag" data-f="F31">检测到面向 AI 的指令，已忽略</span>', '公开 agent 记忆评测 MemBench 第二轮结果的报道，新增的「隔天回来」测试组暴露了开源方案的短板。', ['12 个参评开源方案里只有 3 个超过 60 分。', '成本和分数不成正比：分数最高的方案每个任务平均调用模型 22 次，第二名只要 9 次。'])}
      <div class="card row" data-f="F50 N09"><span class="chip">待评分</span><span>https://example.org/agent-memory-survey</span><span class="sp"></span><span class="sub">手动添加 · 将在下次运行时评分</span></div>
      <div class="banner row" data-f="N03"><span>已放弃「双十一大促：向量数据库五折」。可选择原因：</span>${B('N03', '营销内容', 'sm')}${B('N03', '不相关', 'sm')}${B('N03', '内容过浅', 'sm')}${B('N03', '重复', 'sm')}${B('N03', '其他原因…', 'sm')}<span class="sp"></span>${B('N03', '撤销', 'sm ghost')}</div>
      <div class="fold"><button class="sum" data-f="F27">▸ 稍后处理 · 1 条（下次运行后重新列入待看）</button></div>
      <div class="fold"><button class="sum" data-f="F33">▾ 未通过筛选 · 3 条（不会入库）</button>
        <div class="banner row" style="margin-top:10px" data-f="N07"><span>追踪要求已于今天 20:39 更新，以下 2 条按旧要求评分。</span><span class="sp"></span>${B('N07', '重新评分（约 2 次模型调用）', 'sm')}</div>
        <table class="t">
          <tr><td>向量库还是摘要链？一线团队的选型经验谈</td><td class="meta">未通过实质 0.40</td><td class="sub">经验分享，缺少可核对的数据</td><td>${B('N02', '移入待看', 'sm')}</td></tr>
          <tr><td>双十一大促：向量数据库五折</td><td class="meta">未通过相关度 0.05</td><td class="sub">促销广告</td><td>${B('N02', '移入待看', 'sm')}</td></tr>
          <tr><td>周末菜谱：十五分钟番茄牛腩</td><td class="meta">未通过相关度 0.02</td><td class="sub">与该库无关</td><td>${B('N02', '移入待看', 'sm')}</td></tr>
        </table></div>
    </div></main>
    ${rp('详情', detailInbox)}`),
  },
  {
    id: 'P06', name: '待看 · 空着时', file: 'P06-待看-空着时.html',
    note: `<b>改 F18（概览的内容搬到这里）。</b>待看清空以后，这一页就是「上一轮小结」：一条漏斗把抓到 → 进待看讲完，调用次数写明构成（含开头自检），和右栏、设置里的数是同一个口径（N10，针对 03 第五节的数字对不上）。四个数字方块、运行状态那一块都不再单独存在。`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '待看', RUN_IDLE, 0)}
    <div class="body">
      <h2>待看 · 0 条</h2><p class="sub" style="margin-bottom:16px">暂无待看内容。下次运行：明天 08:00。</p>
      <div class="sec" data-f="F18 N10"><h3>上次运行 · 今天 20:35</h3>
        <div class="funnel"><div><b>5</b><span>已抓取（1 个来源）</span></div><div><b>5</b><span>去重后新增</span></div><div><b>3</b><span>通过相关度</span></div><div><b>2</b><span>通过实质</span></div><div class="hit"><b>2</b><span>进入待看</span></div></div>
        <p class="sub">处理情况：收藏 2 · 放弃 0 · 稍后处理 0　｜　模型调用 13 次 = 运行前自检 1 + 相关度 5 + 实质 3 + 摘要 2 + 核验 2</p></div>
      <div class="sec" data-f="F18"><h3>最近收藏</h3>
        <table class="t"><tr><td>${A('F35', T1, '', 'P09-资料库.html')}</td><td class="meta">my-feed · 今天</td></tr><tr><td>${A('F35', T2, '', 'P09-资料库.html')}</td><td class="meta">my-feed · 今天</td></tr></table></div>
      <div class="fold"><button class="sum" data-f="F33">▸ 未通过筛选 · 3 条（不会入库）</button></div>
    </div></main>
    ${rp('进度', `<div class="rph"><small>全部库 · 20:50</small><b>当前无运行任务</b></div>
      <h3>下次运行时间</h3><p class="row" data-f="F58"><span class="ico">A</span> AI Agent 长期记忆<span class="sp"></span><span class="meta">明天 08:00</span></p><p class="row" data-f="F58"><span class="ico z">中</span> 中国电动车<span class="sp"></span><span class="meta">明天 08:30</span></p>
      <p class="sub" style="margin-top:10px">需保持流息运行（窗口或托盘）。错过的运行将在下次启动时补上一次。</p>`)}`),
  },
  {
    id: 'P07', name: '待看 · 正在跑与排队', file: 'P07-待看-正在跑与排队.html',
    note: `<b>改 F19、F22、F23。</b>运行和排队的状态只在三处，各管一件事（O2）：<ul><li>页头的按钮本身就是状态：「现在跑一轮」→「运行中 · 抓取 · 停下」或「排队中 · 第 2 位」。不再有对话框、横幅和「已排上」。</li><li>左栏库名下一行小字：一眼看到哪个在跑、哪个在排。</li><li>右栏「进度」：唯一写明细的地方（到了哪一步、调用几次、先后顺序、下次运行时间）。</li><li>开始的原因照实写：「建库后的第一轮」「手动触发」「定时」「补跑」（O7）。</li></ul>`,
    html: frame(`${rail('z', { a: { line: '排队中 · 第 2 位' }, z: { line: '运行中 · 抓取' } })}
    <main>${libHead('z', '待看', `<span data-f="F19">运行中：抓取<br>模型调用 0 / 上限 120</span>${B('F19', '运行中 · 停止', 'busy')}`, 0)}
    <div class="body">
      <h2>待看 · 0 条</h2><p class="sub" style="margin-bottom:16px">运行完成后，通过筛选的内容将显示在这里。运行期间可关闭窗口，任务会在后台继续。</p>
      <div class="sec" data-f="F19"><h3>本次运行 · 今天 20:56 开始 · 手动触发</h3>
        <div class="funnel"><div class="dn"><b>✓</b><span>自检</span></div><div class="hit"><b>…</b><span>抓取 2 个来源</span></div><div><b>–</b><span>去重</span></div><div><b>–</b><span>相关度</span></div><div><b>–</b><span>实质</span></div><div><b>–</b><span>摘要与核验</span></div></div></div>
    </div></main>
    ${rp('进度', `<div class="rph"><small>全部库 · 20:56</small><b>1 个运行中 · 1 个排队中</b><span class="sub">同一时间仅运行一个库，其余按顺序自动执行。</span></div>
      <div class="card" data-f="F58"><div class="row"><span class="ico z">中</span><b>中国电动车 · 运行中</b></div><p class="sub">手动触发 · 今天 20:56 开始 · 当前步骤：抓取</p><div class="row"><span class="sub">模型调用</span><div class="meter" style="flex:1"><i style="width:1%"></i></div><span class="meta">0 / 120</span></div></div>
      <h3>队列顺序</h3>
      <div class="card" data-f="F58 F23"><div class="row"><span class="chip">2</span><span class="ico">A</span><b>AI Agent 长期记忆</b></div><p class="sub">手动触发 · 20:56 加入队列 · 前一任务完成后自动开始</p></div>
      <h3>下次运行时间</h3><p class="row" data-f="F58"><span class="ico">A</span> AI Agent 长期记忆<span class="sp"></span><span class="meta">明天 08:00</span></p><p class="row" data-f="F58"><span class="ico z">中</span> 中国电动车<span class="sp"></span><span class="meta">明天 08:30</span></p>`)}`),
  },
  {
    id: 'P08', name: '待看 · 连接出问题', file: 'P08-待看-连接出问题.html',
    note: `<b>改 F20（碰 V6，见「要 维护者 定的事」第 1 条）。</b>库页顶上一次最多一条横幅，只留给「连接出问题」这一种——四个标签都看得见。按钮从 5 个减到 3 个（O19）。<ul><li>来源异常、连续几轮没产出不再叠横幅：需要你动手的成为右栏「待确认」里的一张卡，卡上直接带「怎么办」的按钮；不需要你动手的（暂时失败、无更新）只在「来源与要求」的来源行上写状态（五种状态的说法与「怎么办」不变，V3）。</li><li>抓到的条目照旧保留（V6）。</li></ul>`,
    html: frame(`${rail('z', { a: { n: 0 }, z: { dot: 1 } })}
    <main>${libHead('z', '待看', RUN_IDLE, 0)}
    <div class="body">
      <div class="banner" data-f="F20"><p><b>连接你电脑上的 Claude Code 登录已过期，本次运行未完成评分。</b>已抓取的 1 条内容已保留。</p>
        <p class="sub">请点击「前往登录」，在打开的窗口中完成登录后，点击「已登录，重试」。</p>
        <div class="row" style="margin-top:8px">${B('F20', '前往登录', 'pri')}${B('F20', '已登录，重试')}${A('F20 F63', '更换连接方式', 'lnk', 'P17-设置.html')}</div></div>
      <h2>待看 · 0 条</h2><p class="sub" style="margin-bottom:16px">有 1 条内容已抓取、尚未评分，重试后将继续处理。</p>
      <div class="sec" data-f="F18 N10"><h3>上次运行 · 今天 21:02 · 未完成</h3>
        <div class="funnel"><div><b>1</b><span>已抓取（3 个来源）</span></div><div><b>1</b><span>去重后新增</span></div><div class="hit"><b>停</b><span>自检未通过：登录过期</span></div><div><b>–</b><span>相关度</span></div><div><b>–</b><span>进入待看</span></div></div></div>
    </div></main>
    ${rp('待确认', `<div class="rph"><small>全部库 · 待确认</small><b>2 项</b><span class="sub">以下事项均需确认后才会执行。</span></div>
      <div class="card" data-f="F59 F16 N05"><span class="from">系统检测 · 中国电动车</span><p><b>来源「blog-x」地址无效</b></p><p class="sub">连续 2 次运行无法访问该地址（404）。建议：更新为当前可用的订阅地址，或暂停该来源。</p>
        <div class="row" style="margin-top:8px">${B('F59 F48 N05', '修改地址', 'pri sm')}${B('F59 F48 N05', '暂停该来源', 'sm')}${B('F59 N05', '忽略', 'sm')}</div></div>
      <div class="card" data-f="F59 F16 N05"><span class="from">系统检测 · 中国电动车</span><p><b>连续 3 次运行无内容进入待看</b></p><p class="sub">3 次运行共抓取 4 条，相关度最高 0.35（通过阈值 0.7）。</p>
        <div class="row" style="margin-top:8px">${B('F59 N01 N05', '将严格程度调整为「标准」', 'pri sm')}${B('F59 F14 N05', '交由主 Agent 分析', 'sm')}${B('F59 N05', '忽略', 'sm')}</div></div>`, 2)}`),
  },
  {
    id: 'P09', name: '资料库', file: 'P09-资料库.html',
    note: `<b>改 F33，F34–F38 保留。</b>资料库只放已经成了文件的东西：三个筛选（全部 / 收藏的 / 我写的）代替原来的四个视图。<ul><li>「抓到的」不是库里的东西，搬去了待看页的「没过关的」（P05）。</li><li>「待规范」不再常驻：有缺文件头的文件时，这里出现一条提示，点进去处理（P12）。</li><li>右栏详情只放阅读区没有的：分数的理由、核验记录、文件名、链到这里的、同一来源的（O4）。</li><li>「打开原文」都是流息的阅读窗口；「在浏览器中打开」只在「更多」和阅读窗口里（O10）。</li></ul>`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '资料库', RUN_IDLE, 0)}
    <div class="body" style="display:grid;grid-template-columns:270px 1fr;gap:16px">
      <div>
        <div class="row" style="margin-bottom:10px"><h2>资料库</h2><span class="sp"></span><div class="seg">${B('F35', '列表', 'sm on')}${B('F40', '图谱', 'sm')}</div></div>
        ${I('F34', '搜索标题、主题、正文…', '', 'blk')}
        <div class="row" style="margin:10px 0 6px">${B('F33', '全部 3', 'chip on')}${B('F33', '已收藏 2', 'chip')}${B('F33', '我的笔记 1', 'chip')}</div>
        <div class="row" style="margin-bottom:10px">${B('F33', '记忆方案', 'chip')}${B('F33', '记忆评测', 'chip')}${B('F33', '最近 30 天', 'chip')}</div>
        <div class="banner row" style="padding:8px 10px;font-size:12px" data-f="F39"><span>1 个文件缺少文件头，尚未入库</span><span class="sp"></span>${A('F39', '去处理', 'lnk', 'P12-资料库-缺文件头的文件.html')}</div>
        <a href="#" class="card sel" style="display:block" data-f="F35"><b>${T1}</b><div class="meta">2026-11-10 · my-feed</div></a>
        <a href="#" class="card" style="display:block" data-f="F35"><b>${T2}</b><div class="meta">2026-11-09 · my-feed</div></a>
        <a href="#" class="card" style="display:block" data-f="F35"><b>关于「隔天回来」的几点想法</b><div class="meta">2026-11-10 · 我的笔记</div></a>
      </div>
      <div class="sec" style="margin:0" data-f="F35">
        <div class="row"><span class="ok">已收藏</span><span class="sp"></span>${B('F36', '编辑', 'sm')}${B('F38', '查看原文', 'sm')}<span style="position:relative">${B('F37', '更多 ▾', 'sm')}<span class="menu">${B('F37', '在 Obsidian 中打开')}${B('F37', '在资源管理器中显示')}${B('F37', '在浏览器中打开')}</span></span></div>
        <h2 style="font-size:22px;line-height:1.4;margin:10px 0 6px">${T1}</h2>
        <p class="meta">my-feed · 发布 2026-11-10 · 收藏 2026-11-10 · 主题：记忆评测</p>
        <p style="margin-top:14px"><b>内容概述：</b>记忆工程周刊的一篇对比评测：用同一组 200 个多轮任务（平均 14 轮），在用户改口、隔天回来继续、同时开两件事三种情形下，比较了摘要链、向量检索、分块记忆三种 agent 记忆方案，并附评测脚本和全部任务可以复现。</p>
        <ul class="pt"><li>摘要链每 6 轮压缩一次，平均每个任务多花 9% 的 token，但 200 个任务里有 31 个在第二天回来时用了已经作废的偏好。</li><li>向量检索每次取最相近的 8 段，召回率在三种里最高，偏好类问题答对 87%，但它不懂时间先后。</li><li>分块记忆按身份、偏好、进行中的事分块，作废的偏好只出现了 4 次，代价是总成本为摘要链的 1.6 倍。</li></ul>
      </div>
    </div></main>
    ${rp('详情', `<div class="rph"><small>详情 · 资料库 · 当前笔记</small><b>${T1}</b></div>
      <h3>入选理由</h3><dl class="kv" data-f="F60"><dt>相关度 0.90</dt><dd>与「记忆方案与评测」高度相关。</dd><dt>实质 0.85</dt><dd>包含可核对的数据。</dd></dl>
      <div class="fold"><button class="sum" data-f="F30">▸ 核验记录</button></div>
      <h3>文件</h3><p class="meta">notes\\2026-11-10-长期运行的-agent-怎么记住用户.md</p>
      <h3>反向链接</h3><p>${A('F35', '关于「隔天回来」的几点想法')}</p>
      <h3>同来源内容</h3><p>${A('F35', T2)}</p>`)}`),
  },
  {
    id: 'P10', name: '资料库 · 图谱', file: 'P10-资料库-图谱.html',
    note: `<b>改 F40。</b>图谱还是资料库的一种视图：主题 → 来源 → 条目三行。筛选从三组减到一个时间范围；只画已成文件的条目，[[链接]] 一直显示（虚线）。点一个节点，右栏详情显示它。`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '资料库', RUN_IDLE, 0)}
    <div class="body">
      <div class="row" style="margin-bottom:10px"><h2>资料库 · 图谱</h2><span class="sp"></span>${B('F40', '最近 30 天', 'chip on')}${B('F40', '全部', 'chip')}<div class="seg">${B('F35', '列表', 'sm')}${B('F40', '图谱', 'sm on')}</div></div>
      <div class="sec" data-f="F40" style="height:560px;position:relative">
        <svg viewBox="0 0 760 520" width="100%" height="100%" style="position:absolute;inset:0">
          <g stroke="#8b9095" stroke-width="1.2" fill="none"><path d="M190 70 L380 250"/><path d="M570 70 L380 250"/><path d="M380 250 L160 440"/><path d="M380 250 L380 440"/><path d="M190 70 L600 440" stroke-dasharray="2 4"/><path d="M160 468 C 240 510, 520 510, 600 468" stroke-dasharray="5 4"/></g>
          <g font-size="12" fill="#5d6368"><text x="14" y="74">主题</text><text x="14" y="254">来源</text><text x="14" y="444">条目</text></g>
        </svg>
        ${[['记忆方案 · 0', 12, 8, ''], ['记忆评测 · 2', 62, 8, 'pri'], ['my-feed · 2', 38, 43, ''], ['三种记忆方案的对比评测', 6, 80, ''], ['MemBench 第二轮结果', 38, 80, ''], ['关于「隔天回来」的几点想法（我的笔记）', 64, 80, '']].map(([t, x, y, c]) => `<button class="btn ${c}" data-f="F40" style="position:absolute;left:${x}%;top:${y}%">${t}</button>`).join('')}
      </div>
    </div></main>
    ${rp('详情', `<div class="rph"><small>详情 · 图谱 · 当前节点</small><b>主题：记忆评测</b></div><p class="sub">2 篇 · 关键词 8 个</p><h3>该主题下的内容</h3><p>${A('F35', T1)}</p><p style="margin-top:6px">${A('F35', '关于「隔天回来」的几点想法')}</p>`)}`),
  },
  {
    id: 'P11', name: '资料库 · 编辑', file: 'P11-资料库-编辑.html',
    note: `<b>F36 保留（硬约束：只改四样、只能改已存在且合规范的文件、不能新建）。</b>和现在一样是一个对话框：标题、主题、正文、插入 [[链接]]；来源、日期、分数是记录，不能在这里改。`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '资料库', RUN_IDLE, 0)}<div class="body"><h2>资料库</h2></div></main>
    ${rp('详情', '<div class="rph"><small>详情 · 资料库 · 当前笔记</small><b>' + T2 + '</b></div>')}
    ${dialog(`<h2>编辑笔记</h2>
      <h3>标题</h3>${I('F36', '', T2, 'blk')}
      <h3>主题</h3><div class="row"><span class="chip">记忆评测 ✕</span>${SEL('F36', ['＋ 添加主题', '记忆方案', '记忆评测'])}</div>
      <h3>正文（Markdown）</h3>${TA('F36', '', '**这是什么：** 公开 agent 记忆评测 MemBench 第二轮结果的报道……\n\n我的看法：隔天回来这一组最接近真实使用。', 7)}
      <div class="row">${B('F36', '插入链接', 'sm')}<span class="sub">仅可修改标题、主题、正文和链接；来源、日期、评分为记录字段，不可修改。</span></div>
      <div class="row"><span class="sp"></span>${B('F36', '取消')}${B('F36', '保存', 'pri')}</div>`, 640)}`),
  },
  {
    id: 'P12', name: '资料库 · 缺文件头的文件', file: 'P12-资料库-缺文件头的文件.html',
    note: `<b>改 F39（入口变了，处理方式不变；V8、V2 没碰）。</b>原来叫「待规范」的常驻视图，现在只在有这种文件时从资料库的提示条进来。流息拟好文件头（可改），你点了才写；正文一个字不改；没写入的文件不进索引、图谱、问库。`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '资料库', RUN_IDLE, 0)}
    <div class="body" style="max-width:780px">
      <div class="row" style="margin-bottom:6px">${A('F33', '← 返回资料库', 'lnk', 'P09-资料库.html')}</div>
      <div class="row"><h2>1 个文件缺少文件头</h2><span class="sp"></span>${B('F39', '全部写入')}</div>
      <p class="sub" style="margin:6px 0 14px">这些文件已存在于库文件夹中（例如在 Obsidian 中创建的笔记），流息尚未对其做任何修改。写入文件头后方可入库，正文内容不会被改动。</p>
      <div class="sec" data-f="F39"><b>notes\\关于隔天回来的几点想法.md</b> <span class="flag">缺少文件头</span>
        <h3>建议的文件头（可编辑）</h3>${TA('F39', '', 'id: 2026-11-10-关于隔天回来的几点想法\ntitle: 关于「隔天回来」的几点想法\nsource: 我写的\ndate: 2026-11-10\nstatus: note\ntopics: [记忆评测]', 6)}
        <div class="row" style="margin-top:10px">${B('F39', '写入', 'pri')}${B('F39', '跳过')}</div></div>
    </div></main>
    ${rp('文件', `<div class="rph"><small>文件 · 库的文件结构</small><b>AI Agent 长期记忆</b></div><p class="sub">见 P16 的「文件」。</p>`)}`),
  },
];
