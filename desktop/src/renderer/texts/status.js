// 运行状态 (screens/status.js, mockup S11): is this library healthy — four numbers, the three connections (the fourth
// place with 「去登录」: its words are texts/common.js CONNECTIONS.login), the sources of the last round with what the
// software already did and what you need to do. The five states: FETCH_STATES; the connection words: CONNECTIONS.

export const STATUS = Object.freeze({
  title: '这个库现在健康吗',
  loadFailed: '没能读出运行状态。',
  copy: '复制诊断信息',
  copied: '已复制。',
  logs: '打开运行记录文件夹',
  failed: '没有成功，可以再试一次。',

  // the four numbers
  numbers: Object.freeze({
    lastRun: '上次运行 · 产出 {n} 条',
    lastRunLabel: '上次运行',
    lastRunNone: '还没跑过',
    lastDecision: '上次你拍板',
    lastDecisionNone: '还没拍板过',
    monthCalls: '本月调用次数',
    nextRun: '下次运行',
    nextRunNone: '还没设定时',
  }),

  // the connections
  connections: Object.freeze({
    heading: '连接',
    active: '当前使用',
    spare: '备用',
    models: '{model} / 核验 {verify}',
    probedAt: '{when} 试过一次',
    probe: '现在试一次',
    apiNone: '在设置里输入 key',
    goSettings: '去设置',
    notInstalled: '没找到它；装好后点「重新检测」。',
    redetect: '重新检测',
    loadFailed: '没能读出连接。',
  }),

  // the sources of the last round: what the software already did / what you need to do
  sources: Object.freeze({
    heading: '来源（最近一轮）',
    none: '还没有来源。',
    state: '{state} · {n} 条',
    streak: '{state} · HTTP {http} · 连续 {n} 轮',
    streakNoHttp: '{state} · 连续 {n} 轮',
    ok: '连续正常 {n} 轮',
    empty: '上次抓成功：{date}；没有新的不算故障。',
    emptyNoDate: '抓成功了，只是没有新的；不算故障。',
    failed: '下一轮会自动再试；连续失败会提醒你暂停它。',
    gap: '重试没用：要你改地址或删除。',
    blocked: '对方不让程序抓，重试没用：换一个来源或删除。',
    paused: '你暂停了它，恢复之前不会抓。',
    never: '下一轮会第一次抓它。',
    fix: '去处理',
  }),
})
