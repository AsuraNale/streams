// 跑一轮 (screens/run-dialog.js, mockup S12): the dialog 今日 opens before a round — what it is going to do, from
// estimateRound — with 「开始」「取消」「改上限」.

export const RUN = Object.freeze({
  title: '跑一轮',
  heading: '预计要做的事',
  loadFailed: '没能算出预计。',
  rows: Object.freeze({
    fetch: '抓取',
    fetchValue: '{n} 个来源（{paused} 个已暂停）',
    items: '预计新条目',
    itemsValue: '约 {lo}–{hi} 条（按最近 {rounds} 轮）',
    itemsNone: '还没跑过，没法预计',
    calls: '模型调用',
    callsValue: '约 {lo}–{hi} 次：相关度每条 1 次，实质和摘要只对过关的',
    using: '用的是',
    usingValue: '{name} · 主模型 {model} · 核验 {verify} · 算在你的套餐里',
    usingNone: '没有连接：只抓不打分，全部进待看',
    cap: '每轮上限',
    capValue: '{cap} 次调用，到了就停，剩下的下次',
  }),
  start: '开始',
  cancel: '取消',
  changeCap: '改上限',
  capLabel: '每轮上限（次调用）',
  saveCap: '保存',
  capBad: '上限要是一个正整数。',
  note: '开始后可以关窗口，进度在「今日」里；中途失败的条目会留在队列里下次接着跑。',
  failed: '没能开始。',
})
