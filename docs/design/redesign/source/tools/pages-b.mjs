import { B, A, I, TA, SEL, RADIO, CHK, rail, libHead, RUN_IDLE, rp, frame, dialog } from './kit.mjs';

const T1 = '长期运行的 agent 怎么记住用户：三种记忆方案的对比评测';
const T2 = 'MemBench 第二轮结果：开源 agent 记忆方案在「隔天回来」上普遍失分';

const srcRow = (name, kind, st, how, topic, menu = false) => `<tr><td><b>${name}</b><div class="meta">${kind}</div></td><td>${st}<div class="sub">${how}</div></td><td><span class="chip">${topic}</span></td>
  <td style="position:relative;text-align:right">${B('F48', '⋯', 'sm')}${menu ? `<span class="menu">${B('F48', '测试抓取')}${B('F48', '暂停')}${B('F48', '修改地址')}${B('F48', '删除')}</span>` : ''}</td></tr>`;

const advanced = `<div class="row" style="margin-bottom:10px">${A('F13', '← 返回来源与要求', 'lnk', 'P14-来源与要求.html')}</div>
  <h2>高级设置</h2><p class="sub" style="margin:4px 0 14px">通常无需修改。此处包含各评分环节的配置、设置的变更记录和库文件夹。</p>
  <div class="sec"><button class="sum" data-f="F51">▾ <b>评分环节</b>　各环节的提示词、通过阈值与校验规则</button>
    <div class="funnel" style="margin-top:12px"><div><span>固定</span><b style="font-size:14px">抓取</b></div><div><span>脚本</span><b style="font-size:14px">去重</b></div>
      <a href="#" class="hit" data-f="F51"><span>评分环节 ①</span><b style="font-size:14px">相关度 · 0.5</b></a><a href="#" data-f="F51"><span>评分环节 ②</span><b style="font-size:14px">实质 · 0.6</b></a><a href="#" data-f="F51"><span>模型</span><b style="font-size:14px">摘要</b></a>
      <div><span>固定</span><b style="font-size:14px">人工确认</b></div><div><span>固定</span><b style="font-size:14px">入库</b></div></div>
    <p class="sub">固定节点不可删除或修改；评分环节不向模型提供任何工具。</p>
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px;margin-top:10px">
      <div><h3>环节 ① 相关度 · 提示词（可编辑）</h3>${TA('F51', '', '判断这条资料和这个库的要求有多相关，给 0 到 1 的分数。\n1. 看实质，不看关键词：它是不是真的在讲这个库关心的东西。\n2. 拿不准就打低分（不超过 0.5）。', 5)}
        <p class="sub" style="margin-top:4px">提示词是发送给模型的具体指令，库的「追踪要求」会自动附带。通常只需修改追踪要求。</p>
        <div class="row" style="margin-top:10px"><span>通过阈值</span>${I('F51', '', '0.5', '', 'style="width:60px"')}<span class="sub">手动修改后，「严格程度」将显示为「自定义」</span></div>
        <div class="row" style="margin-top:8px"><span>材料</span>${RADIO('F51', 'mat', ['仅标题、来源、摘要', '读取正文'])}</div>
        <h3>校验规则</h3><p class="sub">🔒 理由所引用的原文必须出自材料（内置规则，不可删除）　🔒 输出格式固定</p><div class="row" style="margin-top:6px">${I('F51', '添加自定义校验规则', '')}${B('F51', '添加', 'sm')}</div>
        <div class="row" style="margin-top:12px">${B('F51', '恢复默认', 'ghost')}${B('F51', '保存', 'pri')}</div>
        <h3>单条测试</h3><div class="row">${SEL('F52', ['双十一大促：向量数据库五折', '向量库还是摘要链？'])}${B('F52', '开始测试（1 次模型调用）')}</div><p class="sub" data-f="F52" style="margin-top:6px">相关度 0.05 · 理由：该内容为促销广告 · 校验：全部通过 · 测试结果不写入任何记录</p></div>
      <div data-f="F53"><h3>上次运行各环节数据</h3><dl class="kv"><dt>抓取</dt><dd>1 个来源：1 正常</dd><dt>去重</dt><dd>5 → 5</dd><dt>相关度</dt><dd>3 通过 · 2 未通过</dd><dt>实质</dt><dd>2 通过 · 1 未通过</dd><dt>摘要</dt><dd>2 条</dd></dl>
        <h3>近期放弃原因</h3><p class="sub">今天 · 营销内容（1 次）</p><h3>近期未通过核验的原因</h3><p class="sub">近期无未通过记录。</p></div>
    </div></div>
  <div class="sec"><button class="sum" data-f="F54">▾ <b>变更记录</b>　该库各项设置的修改时间与操作来源</button>
    <table class="t" style="margin-top:10px"><tr><th>时间</th><th>变更内容</th><th>操作来源</th></tr>
      <tr><td class="meta">今天 20:52</td><td>主题：为「记忆评测」添加 2 个关键词</td><td>手动修改</td></tr>
      <tr><td class="meta">今天 20:44</td><td>单次运行上限 120 → 30</td><td>主 Agent 提议 · 已确认</td></tr>
      <tr><td class="meta">今天 20:39</td><td>追踪要求：仅保留评测与对比数据</td><td>主 Agent 提议 · 已确认</td></tr>
      <tr><td class="meta">今天 20:35</td><td>创建库：追踪要求、2 个主题、1 个来源、定时 08:00</td><td>主 Agent 提议 · 已确认</td></tr>
      <tr><td class="meta">今天 20:35</td><td>评分环节：默认提示词与校验规则</td><td>初始设置</td></tr></table></div>
  <div class="sec"><button class="sum" data-f="F55">▾ <b>库文件夹</b></button>
    <p class="meta" style="margin:10px 0">C:\\Users\\you\\Documents\\流息\\AI Agent 长期记忆</p>
    <div class="row">${B('F55 F37', '在资源管理器中显示')}${B('F55', '重建索引')}<span class="sp"></span>${B('F55', '移除该库', 'ghost')}</div>
    <p class="sub" style="margin-top:6px">移除后，该库不再显示在「我的库」中，也不再定时运行；文件夹及其中的文件不会被删除。</p></div>`;

const fileTree = `<div class="rph"><small>文件 · 库的文件结构</small><b>AI Agent 长期记忆</b></div>
  <div class="row" style="margin-bottom:8px">${B('F61 F37', '在资源管理器中显示', 'sm')}</div>
  <div class="fold"><button class="sum" data-f="F61">▾ 笔记（3）· 按主题</button><p style="margin:6px 0 0 14px">记忆评测（2）<br>${A('F61 F35', T1)}<br>${A('F61 F35', '关于「隔天回来」的几点想法')}</p><p style="margin:6px 0 0 14px">未分类（1）<br>${A('F61 F35', T2)}</p></div>
  <div class="fold"><button class="sum" data-f="F61">▸ 待看（2）· 尚未生成文件</button></div>
  <div class="fold"><button class="sum" data-f="F61">▸ 该库的来源与要求</button></div>
  <div class="fold"><button class="sum" data-f="F61">▸ 程序记录（无需修改）</button></div>`;

export const pagesB = [
  {
    id: 'P13', name: '问库', file: 'P13-问库.html',
    note: `<b>F41–F44 保留（V9 没碰）。</b>只用库里收藏的和你写的回答，每句带出处；库里没有就说「库里没有。」<ul><li>在这里说「想怎么改这个库」照旧转给主 Agent，卡出现在这段对话里，也进右栏「待确认」——所以改库不用离开这个库。</li><li>「记到想补的主题」点过以后变成「已记下」（O14）。</li><li>右栏详情：答案引用的笔记、这次用了什么、想补的主题（不变）。</li></ul>`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '问库', RUN_IDLE, 0)}
    <div class="body">
      <h2>仅基于库内内容回答</h2><p class="sub" style="margin-bottom:14px">范围：已收藏 2 条 · 我的笔记 1 条 · 不联网</p>
      <div data-f="F41">
        <div class="bub">用户隔天回来继续任务时，哪种记忆方案表现最好？代价是什么？</div>
        <p>库里的对比评测没有直接给出「隔天回来」情形下三种方案的排名。<sup>2</sup> 摘要链在 200 个任务里有 31 个在第二天回来时用了已经作废的偏好；<sup>2</sup> 分块记忆作废的偏好只出现了 4 次，代价是总成本为摘要链的 1.6 倍。<sup>2</sup> MemBench 第二轮「隔天回来」组，12 个开源方案只有 3 个超过 60 分。<sup>1</sup></p>
        <table class="t" style="margin:10px 0"><tr><td class="meta">1</td><td>${T2}</td><td>${A('F41 F35', '打开')}</td></tr><tr><td class="meta">2</td><td>${T1}</td><td>${A('F41 F35', '打开')}</td></tr></table>
        <div class="row"><span class="sub">库内缺少：「隔天回来」情形下三种方案的直接排名</span>${B('F42', '已加入待补充主题 ✓', 'sm ghost')}${A('F43', '反馈回答问题')}</div>
      </div>
      <div style="margin-top:22px" data-f="F44">
        <div class="bub">这个库单次运行最多调用 30 次就够了，帮我把上限改成 30。</div>
        <p class="faint">已转交主 Agent</p>
        <div class="card" data-f="F16"><span class="from">主 Agent 提议 · 确认后生效</span><h4 style="margin:4px 0 8px">修改「AI Agent 长期记忆」：单次运行上限</h4>
          <dl class="kv"><dt>修改前</dt><dd>单次运行最多 120 次模型调用</dd><dt>修改后</dt><dd>单次运行最多 30 次模型调用</dd></dl>
          <div class="row" style="margin-top:10px">${B('F16', '确认', 'pri')}${B('F16', '提出修改')}${B('F16', '拒绝')}</div></div>
      </div>
      <div class="sec" style="margin-top:18px">${TA('F41 F44', '提问，或描述希望对该库做出的调整', '', 2)}<div class="row" style="margin-top:8px"><span class="sub">每次提问约 4 次模型调用 · 如需调整来源、主题或要求，可直接描述</span><span class="sp"></span>${B('F41', '发送', 'pri')}</div></div>
    </div></main>
    ${rp('详情', `<div class="rph"><small>详情 · 问库 · 当前回答</small><b>引用了 2 篇笔记</b></div>
      <div data-f="F60"><h3>本次回答依据</h3><p class="sub">命中 3 条 · 引用 2 条 · 模型调用 4 次 · 核验 2 轮均通过 · 模型未获得任何工具权限，未联网</p>
      <h3>待补充主题（1）</h3><p class="sub" data-f="F42">「隔天回来」情形下三种方案的直接排名 · 已提问 1 次</p><p class="sub">提问达 3 次的内容将建议添加为主题。</p></div>`, 1)}`),
  },
  {
    id: 'P14', name: '来源与要求', file: 'P14-来源与要求.html',
    note: `<b>改 F45–F50、F54；F51–F55 收进「高级」（P15）。</b>现在这一页有七块、约 3.5 屏；新稿只留四块、一屏多一点（O18）：<ul><li><b>要求</b>：文本框常开，改了点保存。旁边是「严格程度」三档（N01）——只有这里叫「要求」，关卡里那一大段改叫「提示词」并收进高级（O8）。库名也在这里改（N08）。</li><li><b>来源</b>：加来源不弹对话框，贴了回车，就地认种类、试抓；每行写状态和「怎么办」（五种状态不变，V3）；四个操作收进「⋯」。</li><li><b>主题</b>：一排标签，点一个才看到它的关键词。</li><li><b>定时与上限</b>：一行。</li><li>「谁定的」不再每块旁边标，改成高级里的一张改动记录。「贴一个链接进待看」搬去了待看页；「现在跑一轮」在页头（O20）。</li></ul>`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '来源与要求', RUN_IDLE, 0)}
    <div class="body">
      <div class="sec"><div class="row"><h3 style="margin:0">追踪要求</h3><span class="sp"></span><span>库名称</span>${I('N08', '', 'AI Agent 长期记忆', '', 'style="width:220px"')}</div>
        <div style="margin-top:8px">${TA('F45', '描述需要追踪的内容与需要排除的内容', '追踪 AI agent 长期记忆的评测与对比数据：基准与评测方法、实验结果与消融、不同记忆方案的对比。框架作者的工程笔记、经验谈不要；营销稿、产品通稿不要。', 3)}</div>
        <div class="row" style="margin-top:10px" data-f="N01"><span>严格程度</span>${RADIO('N01', 'st', ['宽松', '标准', '严格'], 1)}<span class="sub">标准：相关度 ≥ 0.5 且实质 ≥ 0.6 视为通过</span><span class="sp"></span>${B('F45', '保存', 'pri')}</div></div>
      <div class="sec"><h3>来源 · 2 个</h3>
        <div class="row">${I('F49', '输入 RSS 地址、arXiv 检索词或 Hacker News 关键词，按回车添加', 'agent memory benchmark', 'blk', 'style="width:520px"')}</div>
        <div class="banner row" style="margin:8px 0;padding:8px 12px;flex-wrap:nowrap" data-f="F49"><span>已识别为 <b>Hacker News 关键词</b> · 试抓结果 <span class="ok">正常 · 1 条</span> 最新：「Launch HN: …」</span><span class="sp"></span>${B('F49', '添加', 'pri sm')}${B('F49', '取消', 'sm')}</div>
        <table class="t" data-f="F48"><tr><th>来源</th><th>状态与处理建议</th><th>主题</th><th></th></tr>
          ${srcRow('my-feed', 'RSS · http://127.0.0.1:47831/feed.xml', '<span class="ok">正常 · 5 条</span>', '上次成功抓取：今天 20:35', '记忆评测', true)}
          ${srcRow('arxiv-agent-memory', 'arXiv · "agent memory" evaluation', '<span class="chip">无更新</span>', '非故障：本次运行无新内容。', '记忆方案')}
        </table></div>
      <div class="sec"><h3>主题 · 2 个</h3><div class="row">${B('F46', '记忆方案 · 0 篇', 'chip')}${B('F46', '记忆评测 · 2 篇', 'chip on')}${I('F46', '输入主题名称，按回车添加', '')}</div>
        <div class="row" style="margin-top:10px" data-f="F46"><span class="sub">「记忆评测」的关键词（固定，系统不会自动修改）：</span><span class="chip">benchmark</span><span class="chip">evaluation</span><span class="chip">LoCoMo</span><span class="chip">评测</span>${B('F46', '编辑关键词', 'sm')}${B('F46', '删除主题', 'sm ghost')}</div></div>
      <div class="sec"><h3>定时与上限</h3><div class="row">${CHK('F47', '每天')}${I('F47', '', '08:00', '', 'style="width:70px"')}<span>自动运行　·　单次运行最多</span>${I('F47', '', '30', '', 'style="width:60px"')}<span>次模型调用</span><span class="sp"></span>${B('F47', '保存')}</div>
        <p class="sub" style="margin-top:6px">下次运行：明天 08:00。需保持流息运行（窗口或托盘）；错过的运行将在下次启动时补上一次，不累加。达到上限后停止，剩余内容留待下次运行处理。</p></div>
      <div class="row">${A('F51 F54 F55', '高级设置：评分环节与提示词 · 变更记录 · 库文件夹 →', 'lnk', 'P15-来源与要求-高级.html')}</div>
    </div></main>
    ${rp('文件', fileTree)}`),
  },
  {
    id: 'P15', name: '来源与要求 · 高级', file: 'P15-来源与要求-高级.html',
    note: `<b>F51（硬约束原样）、F52、F53、F55 保留，F54 改。</b>从「来源与要求」最底下一行进来。三块都可以折叠：<ul><li><b>关卡</b>：七个节点、提示词、过关线、材料、核对单、试一条——功能一样，只是不再占着主页面。固定节点不能删、模型关卡不给工具、底线项删不掉，都不变。</li><li><b>改动记录</b>：代替每一块旁边的「谁定的」。</li><li><b>库文件夹</b>：在资源管理器中显示、重建索引、移除这个库（确认框见 P21）。</li></ul>`,
    html: frame(`${rail('a', { a: { n: 0 } })}
    <main>${libHead('a', '来源与要求', RUN_IDLE, 0)}<div class="body">${advanced}</div></main>
    ${rp('详情', '<div class="rph"><small>详情</small><b>当前页面未选中任何内容</b></div>')}`),
  },
  {
    id: 'P16', name: '右栏四个标签', file: 'P16-右栏四个标签.html',
    note: `<b>四个标签都在（维护者 11-10 定），各管一件事：改 F58、F59、F60，F61、F62 保留。</b>这张稿把四个标签的内容并排画出来。<ul><li><b>进度</b>：在跑 / 排队 / 下次运行时间的唯一明细处，外加当前库的上一轮小结。</li><li><b>待确认</b>：所有库里要你点头的事的唯一清单，就地能点，不用跳页。主 Agent 提议和流息按规则发现的是同一种卡，只在小字上写来处（合并 F17，针对 O17）；规则卡自带具体动作（N05）；放弃理由攒够了也出一张卡（N04）。新卡一出现，这里和标签上的数字马上跟上（O5）。</li><li><b>详情</b>：跟着选中的东西变，只放主区没有的。</li><li><b>文件</b>：不变。</li></ul>`,
    html: frame(`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;min-height:960px">
      ${rp('进度', `<div class="rph"><small>全部库 · 20:56</small><b>1 个运行中 · 1 个排队中</b></div>
        <div class="card" data-f="F58"><div class="row"><span class="ico z">中</span><b>中国电动车 · 运行中</b></div><p class="sub">手动触发 · 20:56 开始 · 当前步骤：相关度</p><div class="row"><span class="sub">模型调用</span><div class="meter" style="flex:1"><i style="width:3%"></i></div><span class="meta">3 / 120</span></div><div class="row" style="margin-top:6px">${B('F19', '停止', 'sm')}</div></div>
        <h3>队列顺序</h3><div class="card" data-f="F58 F23"><div class="row"><span class="chip">2</span><span class="ico">A</span><b>AI Agent 长期记忆</b></div><p class="sub">定时触发 · 前一任务完成后自动开始</p></div>
        <h3>下次运行时间</h3><p class="row" data-f="F58"><span class="ico">A</span> AI Agent 长期记忆<span class="sp"></span><span class="meta">明天 08:00</span></p><p class="row" data-f="F58"><span class="ico z">中</span> 中国电动车<span class="sp"></span><span class="meta">明天 08:30</span></p>
        <h3>该库上次运行 · 今天 20:35</h3><p class="sub" data-f="F58 F18 N10">抓取 5 → 新增 5 → 通过相关度 3 → 通过实质 2 → 进入待看 2<br>模型调用 13 次（含运行前自检 1 次）</p>`)}
      ${rp('待确认', `<div class="rph"><small>全部库 · 待确认</small><b>4 项</b><span class="sub">以下事项均需确认后才会执行。</span></div>
        <div class="card" data-f="F59 F16"><span class="from">主 Agent 提议 · AI Agent 长期记忆</span><p><b>修改追踪要求</b></p><p class="sub">修改后：仅保留评测与对比数据；排除工程笔记与经验分享。${A('F59', '查看修改前后对比')}</p><div class="row" style="margin-top:8px">${B('F59 F16', '确认', 'pri sm')}${B('F59 F16', '提出修改', 'sm')}${B('F59 F16', '拒绝', 'sm')}</div></div>
        <div class="card" data-f="F59 F16 N05"><span class="from">系统检测 · 中国电动车</span><p><b>来源「maker-notices」连续 3 次运行抓取失败</b></p><p class="sub">暂时失败 ×3（对方服务器未响应）。</p><div class="row" style="margin-top:8px">${B('F59 F48 N05', '暂停该来源', 'pri sm')}${B('F59 F48 N05', '修改地址', 'sm')}${B('F59 N05', '暂不处理', 'sm')}</div></div>
        <div class="card" data-f="F59 F16 N04"><span class="from">系统检测 · AI Agent 长期记忆</span><p><b>近 3 次放弃的原因均为「营销内容」</b></p><p class="sub">是否将其加入该库的追踪要求？主 Agent 将生成修改提议供确认。</p><div class="row" style="margin-top:8px">${B('F59 F14 N04', '生成修改提议', 'pri sm')}${B('F59 N04', '暂不需要', 'sm')}</div></div>
        <div class="card" data-f="F59 F16 N05"><span class="from">系统检测 · AI Agent 长期记忆</span><p><b>来源「my-feed」的内容中检测到 1 处面向 AI 的指令</b></p><p class="sub">（此处显示原句。）流息已忽略该指令，未执行，设置未被更改。</p><div class="row" style="margin-top:8px">${B('F59 N05', '知道了', 'pri sm')}${B('F59 F48 N05', '暂停该来源', 'sm')}</div></div>`, 4)}
      ${rp('详情', `<div class="rph"><small>详情 · 待看 · 当前条目</small><b>${T2}</b></div>
        <h3>推荐理由</h3><dl class="kv" data-f="F60"><dt>相关度 0.85</dt><dd>公开评测的第二轮结果，与「记忆评测」高度相关。</dd><dt>实质 0.80</dt><dd>包含分数、调用次数等具体数据。</dd><dt>新鲜度</dt><dd>后续：库内已有第一轮结果的内容。</dd></dl>
        <h3>核验</h3><p><span class="ok">核验通过</span> <span class="flag" data-f="F31">检测到面向 AI 的指令，已忽略</span></p>
        <div class="fold"><button class="sum" data-f="F30">▾ 核验记录</button>
          <p class="sub" style="margin-top:6px">命中原句：（此处显示原文）</p>
          <table class="t"><tr><td>相关度</td><td>4 项规则 · 全部通过</td></tr><tr><td>实质</td><td>5 项规则 · 全部通过</td></tr><tr><td>摘要</td><td>5 项规则 + 1 项独立核对 · 全部通过</td></tr></table></div>
        <h3>来源</h3><p class="meta">my-feed · 发布 2026-11-09</p>`)}
      ${rp('文件', fileTree)}
    </div>`, 'solo'),
  },
  {
    id: 'P17', name: '设置', file: 'P17-设置.html',
    note: `<b>F63、F66–F69、F02 保留；改 F65；砍 F64。</b>四块，顶上四个跳转：<ul><li><b>连接</b>：三种连接、每条两个模型槽、「现在试一次」，原样（硬约束）。「主 Agent 用当前这条连接的主模型」一句话留在这里，原来单独的「主 Agent」一块（会话轮数、缩写次数）是程序内部状态，去掉。</li><li><b>外观与语言</b>：三套主题、浅色 / 深色 / 跟随系统、语言，原样。</li><li><b>库与用量</b>：新建库默认放在哪；全部库本月用量合计（仍在设置里，维护者 11-05），并写明构成：各库 + 主 Agent，和别处的数对得上。「定时一览」去掉——右栏「进度」已经列了每个库的下次运行时间。</li><li><b>关于</b>：版本、检查更新、由 Starry Digital 开发、许可证与致谢；高级里是「复制诊断信息」的唯一入口。</li></ul>`,
    html: frame(`${rail('set', { a: { n: 0 } })}
    <main><div class="body">
      <h2 style="font-size:23px">设置</h2><p class="sub">以下设置对本机的流息及全部库生效。各库的来源、要求与定时，请在该库的「来源与要求」中设置。</p>
      <div class="row" style="margin:12px 0 16px">${A('F63', '连接', 'chip')}${A('F66 F67', '外观与语言', 'chip')}${A('F65', '库与用量', 'chip')}${A('F68', '关于', 'chip')}</div>
      <div class="sec"><h3>连接</h3>
        <table class="t" data-f="F63">
          <tr><td><b>连接你电脑上的 Claude Code</b><div class="sub">已找到 2.1.287 · 已登录 · <span class="ok">当前使用</span></div></td><td>主模型 ${SEL('F63', ['默认', 'claude-opus-5-5', 'claude-sonnet-5-5'])}<br>核验模型 ${SEL('F63', ['同主模型', 'claude-haiku-5-5'])}</td><td>${B('F63', '测试连接', 'sm')}</td></tr>
          <tr><td><b>连接你电脑上的 Codex</b><div class="sub">已找到 0.44 · 已登录 · 可用</div></td><td>主模型 ${SEL('F63', ['默认'])}<br>核验模型 ${SEL('F63', ['同主模型'])}</td><td>${B('F63', '设为当前连接', 'sm')} ${B('F63', '测试连接', 'sm')}</td></tr>
          <tr><td><b>输入 API key</b><div class="sub">未配置 · 按量计费</div></td><td class="sub">支持任意厂商；厂商与接口地址在「配置」中设置</td><td>${B('F63', '配置', 'sm')}</td></tr>
        </table><p class="sub" style="margin-top:8px">评分、摘要、问库与主 Agent 均使用当前连接的主模型；核验使用核验模型。</p></div>
      <div class="sec"><h3>外观与语言</h3>
        <div class="row" data-f="F66">${B('F66', '精密国际主义（默认）', 'on ghost')}${B('F66', '澄明玻璃', 'ghost')}${B('F66', '研究对话', 'ghost')}</div>
        <div class="row" style="margin-top:10px"><span>外观</span>${RADIO('F66', 'ap', ['浅色', '深色', '跟随系统'], 2)}</div>
        <div class="row" style="margin-top:10px"><span>语言</span>${RADIO('F67', 'lg', ['跟随系统（当前：中文）', '中文', 'English'], 0)}</div></div>
      <div class="sec"><h3>库与用量</h3>
        <div class="row"><span>新建库默认存储位置</span><span class="meta">C:\\Users\\you\\Documents\\流息</span><span class="sp"></span>${B('F65', '更改…', 'sm')}${B('F65', '恢复默认', 'sm ghost')}</div>
        <div style="margin-top:12px" data-f="F65 N10"><b>本月用量合计：23 次模型调用</b><span class="sub">　输入 86,713 · 输出 9,800</span>
          <p class="sub">= AI Agent 长期记忆 18（含运行前自检 2）+ 中国电动车 0 + 主 Agent 5</p></div></div>
      <div class="sec"><h3>关于</h3>
        <div class="row" data-f="F68"><b>流息 1.0.0（Windows 版）</b>${B('F02', '检查更新', 'sm')}<span class="sp"></span>${A('F68', '由 Starry Digital 开发')}${B('F68', '许可证与致谢', 'sm')}</div>
        <div class="banner row" style="margin:10px 0 0;padding:8px 12px" data-f="F02"><span>发现新版本 1.0.1（2026-11-12）。将在当前运行结束后更新。</span><span class="sp"></span>${B('F02', '下载并更新', 'pri sm')}${B('F02', '稍后提醒', 'sm')}</div>
        <div class="fold" style="margin-top:12px"><button class="sum" data-f="F69">▾ 高级</button><div class="row" style="margin-top:8px">${CHK('F69', '显示开发者信息', false)}<span class="sp"></span>${B('F69', '复制诊断信息', 'sm')}${B('F69', '打开运行记录文件夹', 'sm')}</div></div></div>
    </div></main>
    ${rp('进度', `<div class="rph"><small>全部库 · 20:50</small><b>当前无运行任务</b></div><h3>下次运行时间</h3><p class="row" data-f="F58"><span class="ico">A</span> AI Agent 长期记忆<span class="sp"></span><span class="meta">明天 08:00</span></p><p class="row" data-f="F58"><span class="ico z">中</span> 中国电动车<span class="sp"></span><span class="meta">明天 08:30</span></p>`)}`),
  },
  {
    id: 'P18', name: '设置 · 输入 API key', file: 'P18-设置-输入API-key.html',
    note: `<b>F63 保留（硬约束：key 只进系统凭据保护，不进库文件夹、不进页面）。</b>对话框不变：厂商、接口地址、key、保存、删除。`,
    html: frame(`${rail('set', { a: { n: 0 } })}<main><div class="body"><h2 style="font-size:23px">设置</h2></div></main>${rp('进度', '<div class="rph"><small>全部库</small><b>当前无运行任务</b></div>')}
    ${dialog(`<h2>输入 API key</h2>
      <h3>厂商</h3>${SEL('F63', ['选择预设…', '自定义接口地址'])}
      <h3>接口地址</h3>${I('F63', 'https://…', '', 'blk')}
      <h3>key</h3>${I('F63', '请输入 API key', '', 'blk', 'type="password"')}
      <p class="sub" style="margin-top:8px">API key 仅保存在本机的系统凭据保护中，不会写入任何库文件夹。费用按量计入对应账户。</p>
      <div class="row">${B('F63', '删除 API key', 'ghost')}<span class="sp"></span>${B('F63', '取消')}${B('F63', '保存', 'pri')}</div>`)}`),
  },
  {
    id: 'P19', name: '许可证与致谢', file: 'P19-许可证与致谢.html',
    note: `<b>F68 保留（V11、MIT、Noto Sans SC 与 Noto Serif SC 的 OFL）。</b>对话框多一条标题字体，其余不变。品牌词只出现在连接名、型号表和这一页。`,
    html: frame(`${rail('set', { a: { n: 0 } })}<main><div class="body"><h2 style="font-size:23px">设置</h2></div></main>${rp('进度', '<div class="rph"><small>全部库</small><b>当前无运行任务</b></div>')}
    ${dialog(`<h2>许可证与致谢</h2>
      <h3>流息本身 · MIT</h3><p class="sub">Copyright (c) 2026 Starry Digital。Permission is hereby granted, free of charge, to any person obtaining a copy of this software……</p>
      <h3>界面字体 · Noto Sans SC（SIL Open Font License 1.1）</h3>
      <h3>标题字体 · Noto Serif SC（SIL Open Font License 1.1）</h3>
      <h3>随附的第三方组件</h3><table class="t"><tr><td>Electron</td><td>MIT</td></tr><tr><td>better-sqlite3</td><td>MIT</td></tr><tr><td>fast-xml-parser</td><td>MIT</td></tr></table>
      <div class="row">${B('F68', '查看完整第三方声明')}<span class="sp"></span>${B('F68', '关闭', 'pri')}</div>`, 620)}`),
  },
  {
    id: 'P20', name: '阅读窗口', file: 'P20-阅读窗口.html',
    note: `<b>F38 保留，F29 并进来。</b>另开的隔离窗口（1100×860）。现在所有「打开原文」（待看卡的标题、资料库页头）都开这个窗口，默认阅读模式；要用系统浏览器看，点这里的「在浏览器中打开」（O10）。`,
    html: frame(`<div class="row" style="padding:10px 14px;background:#f1f0ea;border-bottom:1px solid #dcdad2">${B('F38', '← 返回条目', 'sm')}${I('F38', '', 'http://127.0.0.1:47831/posts/memory-three-ways.html', '', 'readonly style="width:520px"')}<div class="seg">${B('F38', '阅读模式', 'sm on')}${B('F38', '原网页', 'sm')}</div><span class="sp"></span>${B('F38 F37', '在浏览器中打开', 'sm')}</div>
      <div style="max-width:680px;margin:36px auto;padding:0 20px"><p class="sub">阅读模式：仅保留正文，已移除导航与广告</p>
      <h2 style="font-size:26px;line-height:1.4;margin:10px 0 14px">${T1}</h2>
      <p style="font-size:16px;line-height:1.9">我们用同一组 200 个多轮任务（平均 14 轮），在用户改口、隔天回来继续、同时开两件事三种情形下，比较了摘要链、向量检索、分块记忆三种 agent 记忆方案……</p></div>`, 'w1100'),
  },
  {
    id: 'P21', name: '移除这个库', file: 'P21-移除这个库.html',
    note: `<b>F55 保留。</b>从「来源与要求 · 高级」最下面进来。只去掉登记，文件夹和文件一个都不删（文件是真相）。`,
    html: frame(`${rail('a', { a: { n: 0 } })}<main>${libHead('a', '来源与要求', RUN_IDLE, 0)}<div class="body"><h2>高级设置</h2></div></main>${rp('详情', '<div class="rph"><small>详情</small><b>当前页面未选中任何内容</b></div>')}
    ${dialog(`<h2>移除「AI Agent 长期记忆」？</h2>
      <p>仅取消登记：该库将不再显示在「我的库」中，也不再定时运行。</p><p style="margin-top:6px"><b>文件夹及其中的文件不会被删除。</b>如需恢复，可在「新建库 → 手动填写 → 存储位置」中选择该文件夹。</p>
      <p class="meta" style="margin-top:8px">C:\\Users\\you\\Documents\\流息\\AI Agent 长期记忆</p>
      <div class="row"><span class="sp"></span>${B('F55', '取消')}${B('F55', '移除', 'pri')}</div>`)}`),
  },
  {
    id: 'P22', name: '窗口外：托盘与通知', file: 'P22-窗口外-托盘与通知.html',
    note: `<b>F04、F05、F06 保留。</b>这三样是 Windows 原生的，不在流息的窗口里，这里只画示意。行为不变：有库开着定时，关窗口就收进托盘；托盘菜单三项；一轮跑完且窗口不在前面时弹通知，点了打开到那个库的待看。`,
    html: frame(`<div class="center" style="max-width:860px">
      <h2 style="margin-bottom:14px">窗口以外的界面（示意）</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div class="sec" data-f="F05"><h3>托盘图标与菜单</h3><p class="sub">悬停提示：流息 · 2 条待看</p>
          <div class="menu" style="position:static;margin-top:10px;width:180px">${B('F05', '打开流息')}${B('F05 F22', '立即运行')}${B('F05', '退出')}</div>
          <p class="sub" style="margin-top:10px">「立即运行」作用于当前库；其他库运行中时自动排队。</p></div>
        <div><div class="sec" data-f="F06"><h3>系统通知</h3><div class="card" style="background:#2b3035;color:#fff"><b>流息</b><p>AI Agent 长期记忆：本次运行新增 2 条待看。</p></div><p class="sub">点击通知，打开该库的「待看」。</p></div>
          <div class="sec" data-f="F04"><h3>关闭窗口</h3><p class="sub">有库启用定时：最小化到托盘，按时自动运行。全部定时关闭：直接退出。再次启动时仅将已打开的窗口置于前台。</p></div></div>
      </div></div>`, 'solo'),
  },
  {
    id: 'P23', name: '库架', file: 'P23-库架.html',
    note: `<b>F12 保留（维护者 11-11 定：留着）。</b>左栏第一项，所有库的卡片墙：图标、名字、在追什么、上次更新、来源数与状态、待看数；在跑 / 排队的说法和别处一样（排队中 · 第 n 位）。最后一张卡和页头的「新建库」都通到新建库那一页。打开流息仍然直接落到上次那个库的「待看」；库架是想看全局时点过来的。`,
    html: frame(`${rail('shelf', { a: { line: '排队中 · 第 2 位' }, z: { line: '运行中 · 抓取' } })}
    <main><div class="body">
      <div class="row"><div><h2 style="font-size:23px">库架</h2><p class="sub">共 2 个库 · 各库按各自的定时运行</p></div><span class="sp"></span>${A('F12 F56', '＋ 新建库', 'btn', 'P04-新建库-自己填.html')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px">
        <a href="P05-待看.html" class="card" style="display:block" data-f="F12"><div class="row"><span class="ico big">A</span><h4>AI Agent 长期记忆</h4><span class="sp"></span><b style="font:600 20px Consolas,monospace;color:#8a5a12">2</b><span class="sub">条待看</span></div>
          <p class="sub" style="margin-top:8px">在追：追踪 AI agent 长期记忆的评测与对比数据。</p><p class="meta">上次更新 今天 20:35 · 2 个来源</p><p><span class="ok">来源正常</span> <span class="chip">排队中 · 第 2 位</span></p></a>
        <a href="P07-待看-正在跑与排队.html" class="card" style="display:block" data-f="F12"><div class="row"><span class="ico big z">中</span><h4>中国电动车</h4><span class="sp"></span><b style="font:600 20px Consolas,monospace;color:#5d6368">0</b><span class="sub">条待看</span></div>
          <p class="sub" style="margin-top:8px">在追：追踪中国新能源车的月度数据：乘用车零售与批发、渗透率、动力电池装车量与技术路线。</p><p class="meta">上次更新 今天 20:58 · 2 个来源</p><p><span class="flag">来源异常</span> <span class="chip">运行中 · 抓取</span></p></a>
        <a href="P04-新建库-自己填.html" class="card" style="display:grid;place-items:center;min-height:130px;background:transparent;border:1px dashed #b9b6ab;box-shadow:none" data-f="F12 F56">＋ 新建库</a>
      </div>
    </div></main>
    ${rp('进度', `<div class="rph"><small>全部库 · 20:56</small><b>1 个运行中 · 1 个排队中</b></div>
      <div class="card" data-f="F58"><div class="row"><span class="ico z">中</span><b>中国电动车 · 运行中</b></div><p class="sub">手动触发 · 20:56 开始 · 当前步骤：抓取</p></div>
      <h3>队列顺序</h3><div class="card" data-f="F58 F23"><div class="row"><span class="chip">2</span><span class="ico">A</span><b>AI Agent 长期记忆</b></div><p class="sub">手动触发 · 前一任务完成后自动开始</p></div>`)}`),
  },
];
