// 今日 (screens/today.js, mockup S2) and the card that says what went wrong (S13, `problem` in getHome). Every number
// on the page comes from getHome; these are only the words around them. The source lines come from the core as
// '<state> <n>/<total> <names> hint=<hint>' and are read into the sentences under `sources`.

export const TODAY = Object.freeze({
  title: '今日',
  nextRun: Object.freeze({
    none: '定时没开',
    at: '下次运行 {when}',
  }),
  connection: '连接：{name} · {model}',
  connectionDefault: '连接：{name} · 默认模型',
  noConnection: '没有连接：只抓不打分',
  loadFailed: '没能读出今天的数字。',
  // plan C8: from NO_OUTPUT_ROUNDS (the core's) rounds in a row that put nothing into 待看 (getHome().numbers.noOutputStreak)
  noOutput: Object.freeze({
    text: '连续 {n} 次运行无内容进入待看。',
    hint: '请检查来源是否均无更新，或通过阈值是否设置过高。',
    go: '查看运行状态',
  }),

  numbers: Object.freeze({
    inbox: '待看',
    inboxOld: '其中最久的等了 {n} 天',
    caught: '今天抓到',
    passed: '过关进入待看',
    kept: '已收藏',
  }),

  // the source banner: only the states that need a look (failed · gap · blocked); the names are the sources' own
  sources: Object.freeze({
    failed: '{n}/{total} 个来源暂时失败：{names}。下一轮会再试，不需要你改地址。',
    gap: '{n}/{total} 个来源地址有问题：{names}。改地址，或删掉这个来源。',
    blocked: '{n}/{total} 个来源被拒绝：{names}。换一个来源。',
    go: '看来源与要求',
  }),

  // S13: what broke, what is not lost, how to fix it (problem.code · problem.connectionCode)
  problem: Object.freeze({
    connection: Object.freeze({
      'login-expired': '{name} 的登录过期了，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'not-logged-in': '{name} 还没登录，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'not-installed': '{name}：没有找到它，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'bad-key': 'API key 不对，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      network: '{name} 连不上，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      timeout: '{name} 等太久没回应，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      other: '{name} 出错了（{code}），这一轮没有打分。抓到的 {n} 条都在，没丢。',
      none: '还没选连接方式，这一轮没有打分。抓到的 {n} 条都在，没丢。',
    }),
    fix: Object.freeze({
      login: '点「去登录」，在打开的窗口里登录好，再点「重试打分」。或者先换一种连接方式。',
      'not-installed': '装好它再点「重试打分」，或者换一种连接方式。',
      'bad-key': '到设置里重新输入 key，再点「重试打分」。',
      network: '网络通了再点「重试打分」。',
      timeout: '过一会儿再点「重试打分」。',
      other: '点「重试打分」再试一次；还不行就复制诊断信息发给我们。',
      none: '点「换连接方式」选一条，再点「重试打分」。',
    }),
    'not-writable': '库文件夹写不进去，这一轮没有开始。看看这个文件夹是不是只读，或者被别的程序占着。',
    index: '索引读不出来，这一轮没有开始。到设置里点「重建索引」再试。',
    config: '库的设置文件读不出来，这一轮没有开始。',
    retry: '重试打分',
    change: '换连接方式',
    copy: '复制诊断信息',
    copied: '已复制。',
  }),

  round: Object.freeze({
    title: '上次运行 · {when}',
    none: '尚未运行。点击页头的「立即运行」开始。',
    fetch: '抓取 {n} 个来源：{lines}',
    fetchLine: '{n} {state}',
    dedup: '已抓取 {fetched} 条，去重后新增 {new} 条',
    node: '{name}：通过 {passed} · 未通过 {failed}',
    nodeUnscored: ' · 未评分 {n}',
    summary: '摘要 {n} 条',
    inbox: '进入待看 {n} 条',
    calls: '模型调用 {n} 次',
    stopped: Object.freeze({
      cap: '达到单次运行上限后停止，剩余内容留待下次运行',
      aborted: '已手动停止，剩余内容留待下次运行',
      connection: '连接出错后停止，剩余内容留待下次运行',
    }),
  }),

  progress: Object.freeze({
    title: '本次运行进行中',
    phase: '{phase}',
    calls: '模型调用 {calls} / {cap}',
    stop: '停止',
    stopping: '处理完当前一条后停止…',
  }),

  recent: Object.freeze({
    title: '最近收藏',
    none: '还没有收藏。',
    line: '{source} · {date}',
  }),
})
