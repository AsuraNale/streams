// 首次设置 (screens/first-run.js, mockup S1): the four steps the app walks through before a library is open —
// where the library goes, how a model is connected, topics and sources, a first round. The connection words
// (「连接你电脑上的 …」, the login loop) are shared: texts/common.js CONNECTIONS.

export const FIRST_RUN = Object.freeze({
  title: '流息首次设置',
  steps: Object.freeze({
    folder: '库放在哪',
    connection: '连接方式',
    pack: '主题与来源',
    trial: '试跑一轮',
  }),
  // under a finished step in the wizard's sidebar
  stepDone: Object.freeze({
    connection: '已连上',
    connectionSkipped: '先跳过了',
    pack: '{topics} 个主题 · {sources} 个来源',
  }),
  back: '上一步',
  next: '下一步',

  folder: Object.freeze({
    heading: '库放在哪',
    lead: '选一个文件夹，流息把你的库放在里面。',
    choose: '选文件夹…',
    change: '换一个…',
    note: '流息会在这里放 Markdown 文件和索引。这个文件夹你随时可以用 Obsidian 或资源管理器打开。',
    empty: '空文件夹：会在这里新建库。',
    library: '这里已经有一个库：会直接打开它。',
    other: '这个文件夹里有别的东西，换一个。',
    failed: '没能用这个文件夹。',
  }),

  connection: Object.freeze({
    heading: '选一种方式让模型帮你打分',
    lead: '流息只调用你电脑上已经登录的工具，不保存你的登录信息，用量按你自己的套餐或账户计算。三种都设了的话，可以在设置里换。',
    hints: Object.freeze({
      'claude-code': '流息会在打分时启动它，不改动它。模型先用它的默认，装好后在设置里选。',
      codex: '流息会在打分时启动它，不改动它。',
      api: '任一厂商的 key。只存在这台电脑的系统凭据保护里，按量计费到你的账户。',
    }),
    use: '用这一条',
    chosen: '已选定',
    setKey: '输入 key…',
    redetect: '重新检测',
    skip: '这一步先跳过，以后在设置里连',
  }),

  pack: Object.freeze({
    heading: '主题与来源',
    lead: '选一个起步包，或者从空白开始。主题和来源以后都能改。',
    blank: '空白',
    blankHint: '不带主题和来源，以后自己加。',
    packHint: '{topics} 个主题 · {sources} 个来源',
    topics: '主题',
    sources: '来源',
    noSources: '还没有来源。',
    remove: '删除',
    addRss: '加一条 RSS',
    rssName: '名字',
    rssUrl: '地址',
    add: '加上',
    applying: '正在写入，并对每个来源试抓一次……',
    tried: '每个来源试抓了一次：',
    count: '{n} 条',
    failed: '没能写入。',
    continue: '继续',
  }),

  trial: Object.freeze({
    heading: '试跑一轮',
    lead: '先看会做多少事，再开始。',
    sources: '抓取 {n} 个来源（{paused} 个已暂停）',
    items: '预计新条目 约 {lo}–{hi} 条',
    calls: '模型调用 约 {lo}–{hi} 次',
    cap: '每轮上限 {cap} 次调用，到了就停，剩下的下次',
    noConnection: '没有连接也能抓，只是不打分，全部进待看。',
    start: '开始',
    running: '正在跑：{phase}',
    calling: '调用 {calls} / {cap}',
    done: '这一轮跑完了',
    fetched: '抓到 {n} 条',
    fresh: '新的 {n} 条',
    passed: '{name} 过关 {n} 条',
    summarized: '摘要 {n} 条',
    inbox: '进入待看 {n} 条',
    notStarted: '这一轮没能开始：{reason}',
    failed: '没能开始。',
    goInbox: '去待看',
    goToday: '去今日',
  }),
})
