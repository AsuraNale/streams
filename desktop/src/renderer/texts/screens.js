// The placeholder screens (screens/placeholder.js): each of the sidebar's entries has a page with its title and one line,
// until the page itself is built (plan 5.2: from 11-03 on). The titles are the sidebar's words (texts/common.js SIDEBAR),
// repeated here so a screen can rename itself later without touching the sidebar.

export const SCREENS = Object.freeze({
  // what every placeholder says under its title
  placeholder: '这一页明天起做。',
  titles: Object.freeze({
    today: '今日',
    inbox: '待看',
    library: '资料库',
    graph: '图谱',
    ask: '问库',
    pipeline: '流水线',
    sources: '来源与主题',
    status: '运行状态',
  }),
  // one line under each title saying what the page will be (plan C1–C9), so the empty window already reads as the product
  about: Object.freeze({
    today: '今天抓到了什么、过了多少、还有几条等你看。',
    inbox: '过关的条目在这里等你：收藏进库，或者放弃。',
    library: '库里的文件：读、改、找。',
    graph: '库里的条目怎么连在一起。',
    ask: '拿库里的东西问问题，答案带出处。',
    pipeline: '抓取、打分、入库每一步的进展。',
    sources: '盯哪些来源、关心哪些主题，以及每个来源的状态。',
    status: '连接、上一轮、下一轮、日志。',
  }),
})
