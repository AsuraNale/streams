// A library's runs in words — redesign R2 (design P06 · P07 · P08 · P16; 05-措辞规范): the last run as one funnel
// (screens/run-funnel.js: an empty 待看, the right panel's 进度 when nothing runs), the run in progress (screens/run-steps.js:
// 待看 while this library runs; the head's chip), why a run started (texts/panel.js QUEUE.why). Every number comes from the
// main process (getHome().lastRun, getQueue, round-progress); these are only the words around them.

export const RUN = Object.freeze({
  // the funnel of the last run
  last: '上次运行 · {when}',
  lastStopped: '上次运行 · {when} · 未完成',
  // the same, in the right panel's 进度 (P16): it names the library
  lastHere: '该库上次运行 · {when}',
  lastHereStopped: '该库上次运行 · {when} · 未完成',
  lastHereNone: '该库上次运行',
  none: '尚未运行。点击页头的「立即运行」开始。',
  cells: Object.freeze({
    fetched: '已抓取（{n} 个来源）',
    fetchedPlain: '已抓取',
    new: '去重后新增',
    gate: '通过{name}',
    inbox: '进入待看',
  }),
  empty: '—',
  skipped: '未评分（未连接模型）',
  stopCell: '停',
  stopWhy: Object.freeze({
    'self-check': '自检未通过：{what}',
    connection: '连接出错：{what}',
    cap: '达到单次运行上限，剩余内容留待下次运行',
    aborted: '已手动停止，剩余内容留待下次运行',
    // redesign R5b (precheck fix 5): a reason the page has no words for — never the reason's own word
    other: '运行未完成：{what}',
  }),
  // what failed, in a few words (a connection's code, or the self-check's own problem)
  what: Object.freeze({
    'login-expired': '登录过期',
    'not-logged-in': '未登录',
    'not-installed': '未找到连接的工具',
    'bad-key': 'API key 无效',
    network: '网络不通',
    timeout: '等待超时',
    none: '未选择连接方式',
    'not-writable': '库文件夹无法写入',
    index: '索引无法读取',
    config: '库的设置文件无法读取',
    // redesign R5b (O9): no code — the details are in 「复制诊断信息」
    other: '出现错误（详细信息见「复制诊断信息」）',
  }),
  outcome: '处理情况：收藏 {kept} · 放弃 {dismissed} · 稍后处理 {later}',
  calls: '模型调用 {n} 次 = {parts}',
  callsTotal: '模型调用 {n} 次',
  part: '{name} {n}',
  parts: Object.freeze({ 'self-check': '运行前自检', summary: '摘要', verify: '核验' }),
  plus: ' + ',
  sep: ' ｜ ',

  // the run in progress (P07)
  current: '本次运行 · {when} 开始 · {why}',
  steps: Object.freeze({
    'self-check': '运行前自检',
    fetch: '抓取 {n} 个来源',
    dedup: '去重',
    gate: '{name}评分',
    summary: '摘要与核验',
    // 1.1 W7a: an update is one step — the agent reads, keeps the originals, picks and writes by the card
    update: '读来源、存原文，更新 Agent 按建库卡挑选、写摘要',
  }),
  stepsDone: '{done} / {total} 个环节已完成',
  stepNow: '当前步骤：{step}',
  stop: '停止',
  stopping: '正在停止',
  // the head's chip while this library runs
  chip: '运行中：{phase} · 模型调用 {calls} / 上限 {cap}',
  chipNoCap: '运行中：{phase} · 模型调用 {calls}',
})
