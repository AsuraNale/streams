// The banner of a run that could not start (screens/problem-card.js; getHome().problem: a sign-in that expired, no connection
// chosen, …) — redesign R2 (P08, F20): one banner at most, on top of every tab of a library's page, only for a self-check that
// did not pass: what happened, that the fetched items are kept, what to do, at most three buttons. (Was 今日's words, mockup
// S13; the other parts of 今日 — the four numbers, the source and 「连续 N 轮」 banners, the last round — are gone: the funnel is
// texts/run.js, the source and no-output findings are cards in the right panel's 待确认.)
// The sentences keep the words V6's check reads (登录过期 · 这一轮没有打分 · 抓到的 n 条都在，没丢 · 去登录 · 重试打分): the
// design's new sentence for V6 waits for 维护者 (05-措辞规范 last line; R6). The buttons are the design's.

export const TODAY = Object.freeze({
  problem: Object.freeze({
    connection: Object.freeze({
      'login-expired': '{name} 登录过期，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'not-logged-in': '{name} 还没登录，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'not-installed': '{name}：没有找到它，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      'bad-key': 'API key 不对，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      network: '{name} 连不上，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      timeout: '{name} 等太久没回应，这一轮没有打分。抓到的 {n} 条都在，没丢。',
      other: '{name} 出错了（{code}），这一轮没有打分。抓到的 {n} 条都在，没丢。',
      none: '还没选连接方式，这一轮没有打分。抓到的 {n} 条都在，没丢。',
    }),
    fix: Object.freeze({
      login: '请点击「前往登录」去登录，在打开的窗口中完成登录后，点击「已登录，重试」重试打分。',
      'not-installed': '装好它后点击「重试」，或更换连接方式。',
      'bad-key': '到设置中重新输入 API key，再点击「重试」。',
      network: '网络恢复后点击「重试」。',
      timeout: '稍后点击「重试」。',
      other: '点击「重试」再试一次；仍不行请在「设置 → 关于 → 高级」中复制诊断信息发给我们。',
      none: '点击「更换连接方式」选择一种连接，再点击「重试」。',
    }),
    'not-writable': '库文件夹无法写入，本次运行未开始。请检查该文件夹是否为只读，或被其他程序占用。',
    index: '索引无法读取，本次运行未开始。请在「来源与要求 → 高级设置 → 库文件夹」中重建索引后重试。',
    config: '库的设置文件无法读取，本次运行未开始。',
    // the buttons (at most three): login · login again and retry · change the connection; otherwise retry · change (redesign R4b:
    // 复制诊断信息 is only in 设置 → 关于 → 高级)
    login: '前往登录',
    loginAgain: '已登录，重试',
    loginFailed: '未能打开登录窗口。',
    retry: '重试',
    change: '更换连接方式',
  }),
})
