// A library's runs in words — redesign R2 (design P06 · P07 · P08 · P16; 05-措辞规范): the last run in one line (screens/run-steps.js
// LastRun: an empty 待看, the right panel's 进度), the run in progress (screens/run-steps.js RunSteps: 待看 while this library runs;
// the head's chip), why a run started (texts/panel.js QUEUE.why). Every number comes from the main process (getHome().lastRound,
// getQueue, round-progress); these are only the words around them. 1.1 W7b: v1.0's funnel and its six steps are gone — an
// update is one step.

export const RUN = Object.freeze({
  // the last run, one line: when it ended, how many it put into 待看
  last: '上次运行 · {when} · 新增 {n} 条进入待看',
  lastStopped: '上次运行 · {when} · 未完成 · 新增 {n} 条进入待看',
  // the same, in the right panel's 进度 (P16): it names the library
  lastHere: '该库上次运行 · {when} · 新增 {n} 条进入待看',
  lastHereStopped: '该库上次运行 · {when} · 未完成 · 新增 {n} 条进入待看',
  none: '尚未运行。点击页头的「立即运行」开始。',
  lastHereNone: '该库尚未运行',

  // the run in progress (P07)
  current: '本次运行 · {when} 开始 · {why}',
  // 1.1.1 P10 (A8): the four steps of an update, each with its numbers as they happen
  steps: Object.freeze({
    sources: '读来源',
    originals: '取回新文章的原文',
    agent: '更新 Agent 按建库卡挑选、写摘要',
    check: '核对摘要',
  }),
  live: Object.freeze({
    sources: '{done} / {total} 个',
    originals: '{done} / {total} 篇，已保存 {kept} 篇',
    agent: '已搜索 {searches} 次、已读 {reads} 页',
    check: '{done} / {total} 条',
  }),
  // the first update's range: the 12 updates with tools of 11-24 took 115 to 319 seconds (plan 场景一②)
  // 1.1.1 B26: an API key connection with no search
  noSearch: '本次无法搜索：未配置搜索服务。更新 Agent 仅读取来源内容和已打开的网页。如需搜索，请在设置中添加 DeepSeek 搜索 key。',
  usuallyFirst: '首次更新通常需要 2–6 分钟。离开此页面不影响运行，结束后会通知你。',
  usuallyLast: '此库上次更新用时 {min} 分钟。离开此页面不影响运行，结束后会通知你。',
  stepsDone: '{done} / {total} 个环节已完成',
  stepNow: '当前步骤：{step}',
  stop: '停止',
  stopping: '正在停止',
  // the head's chip while this library runs
  chipNoCap: '运行中：{phase} · 模型调用 {calls}',
})
