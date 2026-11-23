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
  steps: Object.freeze({
    // 1.1 W7a: an update is one step — the agent reads, keeps the originals, picks and writes by the card
    update: '读来源、存原文，更新 Agent 按建库卡挑选、写摘要',
  }),
  stepsDone: '{done} / {total} 个环节已完成',
  stepNow: '当前步骤：{step}',
  stop: '停止',
  stopping: '正在停止',
  // the head's chip while this library runs
  chipNoCap: '运行中：{phase} · 模型调用 {calls}',
})
