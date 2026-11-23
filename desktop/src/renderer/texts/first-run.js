// 首次打开 and 新建库 (redesign R4a; design 03-页面稿 P01, P02, P04, 07-模板版 首次打开 · 连接选择 · 新建库; words: 05-措辞规范).
//   FIRST_RUN    首次打开's one screen (P01) and 连接选择 (P02): screens/first-run.js
//   HOW_IT_WORKS the right panel's 「流息怎样工作」 beside it (the template's home-context)
// (1.1 W7b: v1.0's 新建库 form, NEW_LIBRARY, is gone; 新建库 is the build conversation, texts/build.js)
// The three connections' names are texts/common.js CONNECTIONS.names (V7: the brand words only there); the five fetch states and
// what to do about each are texts/common.js FETCH_STATES / FETCH_HINTS (V3).

export const FIRST_RUN = Object.freeze({
  // P01: the work-header and the form
  title: '欢迎使用流息',
  subtitle: '说一句想追踪的内容，主 Agent 会写一张建库卡，确认后才会创建。',
  headChip: '当前连接：{name}',
  headChipNone: '未连接',
  eyebrow: '首次打开 / WELCOME',
  heading: '你想追踪什么内容？',
  lead: '用一句话描述需求，主 Agent 将据此写一张建库卡（收什么、不收什么、看哪些来源），确认后才会创建。',
  connected: '已连接',
  current: '当前连接：{name}',
  version: '版本 {version}',
  loggedIn: '已登录',
  keySet: '已设置 key',
  billing: Object.freeze({
    'claude-code': '用量计入你的套餐',
    codex: '用量计入你的套餐',
    api: '按量计费',
  }),
  change: '更换连接',
  none: '未连接',
  noneLine: '主 Agent 需要一种连接才能写建库卡。',
  pick: '选择连接',
  detecting: '正在检测这台电脑上的连接……',
  detectFailed: '未能检测连接。',
  retry: '重试',
  examplesLabel: '示例（点击填入输入框，可修改后发送）',
  examples: Object.freeze([
    '帮我建个库，追踪中国电动车行业，重点是整车销量、电池和充电。',
    '我想跟踪 AI agent 的新工具和评测，不要营销稿。',
    '帮我盯着几家中国时尚上市公司的财报和新品。',
  ]),
  exampleHint: '点击填入',
  inputLabel: '想追踪的内容',
  placeholder: '描述想追踪的内容、需要排除的内容，以及常用的来源地址',
  send: '发送',
  manual: '手动创建',
  skip: '暂不创建，先进入应用',

  // P02: 连接选择 — only when no connection is usable, the one found is not logged in, or 更换连接 was pressed
  connect: Object.freeze({
    title: '连接模型',
    subtitle: '流息通过该连接建库、更新与问答。之后可在设置中更改。',
    eyebrow: '连接 / CONNECTION',
    heading: '选择一种连接方式',
    lead: '三种方式任选其一。点击「前往登录」将打开终端窗口，由该工具自行完成登录，流息不接触账号密码。',
    recommended: '推荐',
    found: '已找到',
    foundVersion: '已找到 {version}',
    notFound: '未找到',
    loggedIn: '已登录',
    notLoggedIn: '未登录',
    keySet: '已设置 key',
    keyNone: '未设置 key',
    anyVendor: '支持任意厂商',
    inUse: '当前连接',
    login: '前往登录',
    loginAgain: '已登录，重新检测',
    loginFailed: '未能打开登录窗口。',
    use: '使用此连接',
    setKey: '输入 API key',
    redetect: '重新检测',
    skip: '暂时跳过，稍后在设置中连接',
    failed: '未能完成，请重试。',
  }),
})

export const HOW_IT_WORKS = Object.freeze({
  eyebrow: '流息怎样工作',
  titleFirst: '从一句话开始',
  titleNew: '把要求写清楚',
  text: '每个库有一张建库卡，写明收什么、不收什么、看哪些来源、每条怎么写，按自己的定时更新。挑出的内容进入待看，由你决定是否收藏。',
  stepsLabel: '一次更新做什么',
  steps: Object.freeze([
    '取回来源上的新文章，存下原文',
    '更新 Agent 按建库卡挑选、写摘要',
    '另一次独立调用对着原文核验摘要',
    '进入待看，可收藏或放弃',
  ]),
  note: '只有收藏的内容会写成库文件夹里的笔记。所有改动均需确认后才会执行。',
  usageLabel: '用量',
  usage: '仅在调用模型时消耗用量；取回原文、排队不消耗。',
})
