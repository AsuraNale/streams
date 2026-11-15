// Words the page writes itself that more than one screen uses. Every user-visible word the page writes lives
// in src/renderer/texts/ — test/wording.test.mjs scans all of it (banned terms: 0 hits; full-width punctuation
// next to Chinese) and fails when Chinese text appears in a string anywhere else in src/renderer/ or src/shared/.
// Placeholders are {name}, filled by fmt() (lib/format.js). Wording follows the product plan (方案 §1.7 对照表).

export const BRAND = Object.freeze({
  mark: '流',
  name: '流息',
  // redesign R1: the line under the name in the sidebar's brand (the template's brand small)
  tagline: '个人资料库',
  // <html lang> (app.js sets it from here; the English table says 'en', and the dates follow it: lib/format.js)
  htmlLang: 'zh-CN',
})

// the sidebar (v2 package F, plan B: the same whatever library is open): its two entries above 「我的库」 (their screens:
// screens/index.js), the settings button; the rest of its words (我的库, 新建库, the badges): texts/shell.js SHELL.sidebar.
// v1.0's nine entries are the five tabs of a library's page now (SHELL.tabs).
export const SIDEBAR = Object.freeze({
  label: '导航',
  entries: Object.freeze({
    shelf: '库架',
    // redesign R1 (05-措辞规范): 「和主 Agent 聊」 → 「主 Agent」
    chat: '主 Agent',
  }),
  settings: '设置',
  // the library the app has open: its folder name, or this while none is
  noLibrary: '未打开库',
  libraryLabel: '当前的库',
  // the badge after 待看: how many items wait (kit/sidebar.js, from getHome / inbox-changed)
  inboxBadge: '{n} 条待看',
})

export const SEP = ' · '

// a moment with its time (lib/format.js whenText) and just the day (dayText)
export const WHEN = Object.freeze({ today: '今天 {hm}', yesterday: '昨天 {hm}', date: '{m}-{d} {hm}' })
export const DAY = Object.freeze({ today: '今天', yesterday: '昨天', date: '{m}-{d}' })
// a moment still ahead (lib/format.js nextText): the next timed round
export const NEXT_WHEN = Object.freeze({ today: '今天 {hm}', tomorrow: '明天 {hm}', date: '{m}-{d} {hm}' })

// what the page says when a bridge call fails (codes: src/main/bridge-methods.mjs ERROR_CODES)
export const ERRORS = Object.freeze({
  retry: '重试',
  failed: '操作未成功，请重试。',
  noLibrary: '尚未打开库。',
})

// the five fetch states of a source (src/shared/fetch-states.mjs; redesign R6b-1: 05 第三节's words, the same in the core's
// STATE_WORDS and wording/glossary.json)
export const FETCH_STATES = Object.freeze({
  ok: '正常',
  empty: '无更新',
  gap: '地址无效',
  failed: '暂时失败',
  blocked: '访问被拒',
})

// the three ways to connect a model (plan C2; getConnections().kinds), the words S1 / S13 / S14 share. The brand words
// appear only in the fixed phrase V7 allows; model and vendor names come from the bridge's tables, never from here.
export const CONNECTIONS = Object.freeze({
  names: Object.freeze({
    'claude-code': '连接你电脑上的 Claude Code',
    codex: '连接你电脑上的 Codex',
    api: '输入 API key',
  }),
  // what the detection found
  found: '已找到',
  notFound: '没找到',
  version: '版本 {version}',
  loggedIn: '已登录',
  notLoggedIn: '未登录',
  keySet: '已设置 key（末四位 {hint}）',
  keyNone: '未设置',
  inUse: '当前使用',
  usable: '可用',
  recommended: '推荐',
  // the login loop (plan v2.3, Phrolova's wording): the button, the line under it, the control that detects again
  login: Object.freeze({
    go: '前往登录',
    note: '将打开终端窗口，由该工具自行完成登录；流息不接触账号密码',
    again: '已登录，重新检测',
    failed: '未能打开登录窗口。',
  }),
  // a real call tried once (probeConnection)
  probe: Object.freeze({
    trying: '正在测试连接……',
    ok: '测试结果：可用 · 用时 {seconds} 秒 · 计入套餐用量',
    failed: '测试结果：未成功 · {reason}',
  }),
  // the model slots: null means the connection's own default / the same as the main model
  defaultModel: '默认',
  sameAsMain: '同主模型',
  // a connection's error codes (core connect; docs/core-api.md 三) in words
  codes: Object.freeze({
    'not-installed': '未找到该工具',
    'not-logged-in': '未登录',
    'login-expired': '登录已过期',
    'bad-key': 'key 无效',
    'bad-model': '型号无效',
    'rate-limited': '请求过于频繁',
    network: '网络无法连接',
    timeout: '响应超时',
    'bad-format': '回答格式不符',
    refused: '请求被拒',
    unknown: '未知错误',
  }),
})

// the scoring steps by id (streams.json pipeline nodes): what each is called on the page; an unknown id shows as it is
export const NODE_NAMES = Object.freeze({
  relevance: '相关度',
  substance: '实质',
  freshness: '新鲜度',
  summary: '摘要',
})

// the phases of a round (round-progress events)
export const ROUND_PHASES = Object.freeze({
  'self-check': '运行前自检',
  fetch: '抓取',
  gate: '评分',
  summary: '摘要',
  done: '已完成',
})

// ---- 11-03 界面 B: words more than one of its screens use (资料库 · 来源与主题 · 流水线 · 运行状态 · 问库 · 图谱) ----

// what to do about a source's fetch state: the core's hint code (core fetch/states.mjs HINTS) in words
export const FETCH_HINTS = Object.freeze({
  none: '无需处理。',
  'fix-address-or-remove': '该地址无效，重试无法解决。请修改地址，或移除该来源。',
  'retry-next-round': '下次运行时将自动重试，无需修改地址。',
  'blocked-remove-source': '该网站拒绝程序访问，重试无法解决。请改用其他来源。',
})

// a source that is not in one of the five states: paused by the user, or never fetched yet
export const SOURCE_STATES = Object.freeze({
  paused: '已暂停',
  never: '尚未抓取',
})

// the three kinds of source (streams.json sources[].kind)
export const SOURCE_KINDS = Object.freeze({
  rss: 'RSS',
  arxiv: 'arXiv',
  hn: 'Hacker News',
})

// a note's status in the index (spec v0: kept · authored · archived)
export const NOTE_STATUS = Object.freeze({
  kept: '已收藏',
  authored: '我的笔记',
  archived: '已归档',
})

// the bridge's error code no_connection (askLibrary, previewNode): no connection chosen yet
export const NO_CONNECTION = Object.freeze({
  text: '尚未选择连接方式，该操作需要调用模型。',
  go: '前往设置',
})

/**
 * Redesign R6b-3: the punctuation the screens put between pieces of text themselves (a bracket round a note, a colon
 * after a label, the mark between the names of a list). Chinese uses the full-width marks; the English table has the
 * half-width ones with their spaces, so no full-width mark reaches an English screen.
 */
export const PUNCT = Object.freeze({
  open: '（',
  close: '）',
  colon: '：',
  list: '、',
  semi: '；',
  comma: '，',
})
