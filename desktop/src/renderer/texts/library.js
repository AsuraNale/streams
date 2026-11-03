// 资料库 (screens/library.js, mockup S6), 编辑一条 (screens/edit-dialog.js, S7) and 核验记录 (screens/verdict-dialog.js, S15).
// Titles, topics, sources and bodies are the library's own data and never come from here. The statuses of a note:
// texts/common.js NOTE_STATUS; the scores' names: NODE_NAMES.

export const LIBRARY = Object.freeze({
  title: '资料库',
  loadFailed: '没能读出库里的条目。',
  searchLabel: '搜索库',
  searchPlaceholder: '搜索标题、主题、正文…',
  searchCount: '找到 {n} 条',
  searchNone: '没有找到。换个词试试。',
  searching: '正在找……',
  // the four tabs and their counts (core libraryCounts)
  views: Object.freeze({
    kept: '已收藏',
    authored: '我写的',
    caught: '抓到的',
    pending: '待规范',
  }),
  viewCount: '{name} {n}',
  viewsLabel: '分页',
  filtersLabel: '筛选',
  recent: '最近 30 天',
  empty: Object.freeze({
    kept: '还没有收藏。在待看里点「收藏」，条目就会进到这里。',
    authored: '还没有你自己写的条目。',
    caught: '没有停在半路的条目。',
    pending: '库里的文件都合规范。',
  }),
  filteredEmpty: '这个筛选下没有条目。',

  row: Object.freeze({
    meta: '{date} · {source}',
    authoredMeta: '{date} · 我写的',
  }),

  // 「抓到的」: everything not kept and not let go — stopped at a step, or not decided yet
  caught: Object.freeze({
    firstSeen: '首次见到 {date}',
    score: '{name} {score}',
    stopped: Object.freeze({
      relevance: '停在相关度：没过关',
      substance: '停在实质：没过关',
      unscored: '没打成分，下一轮再试',
      queued: '排队等打分',
      inbox: '在待看里等你拍板',
    }),
    stoppedOther: '停在 {step}',
    title: '抓到的这一条',
    note: '没过关的留在这里，随时能捞回：调过关线或要求后，下一轮会重新打分。',
    source: '来源 {source} · 发布 {date}',
  }),

  // 「待规范」: files in the folder that are not in the index yet (read-only today)
  pending: Object.freeze({
    note: '这些文件已经在你的文件夹里，流息没有动它们。给它们加上文件头后才会进库；加文件头的功能还没做好，现在只列出来。',
    codes: Object.freeze({
      'no-frontmatter': '没有文件头',
      'bad-frontmatter': '文件头读不出来',
      'id-mismatch': '文件名和 id 不一致',
      'bad-status': 'status 不对',
      'bad-topics': '主题写法不对',
      'bad-scores': '分数写法不对',
    }),
    missing: '缺 {field}',
    badDate: '{field} 不是日期',
    other: '不合规范（{code}）',
  }),

  reader: Object.freeze({
    label: '正文',
    none: '在左边选一条来读。',
    loadFailed: '没能读出这一条。',
    source: '来源 {source}',
    date: '发布 {date}',
    kept: '收藏 {date}',
    missingLink: '库里没有这一条',
  }),

  actions: Object.freeze({
    edit: '编辑',
    obsidian: '用 Obsidian 打开',
    source: '打开原文',
    failed: '没有成功，可以再试一次。',
  }),

  // the right panel: this note
  panel: Object.freeze({
    title: '这一条',
    topics: '主题',
    source: '来源',
    sourceLine: '{name}',
    file: '文件',
    status: '状态',
    score: '{score} · {reason}',
    freshness: Object.freeze({ new: '新', followup: '后续进展', duplicate: '重复' }),
    verdicts: '这一条的核验记录',
    backlinks: '链到这里的',
    backlinksNone: '还没有别的条目链到这里。',
    sameSource: '同一来源的',
    sameSourceNone: '同一来源没有别的条目。',
    sameSourceLine: '{title}（{date}）',
    none: '选一条后，这里是它的主题、来源、分数和文件。',
  }),
})

// 编辑一条 (S7): only the title, the topics and the body ([[links]] live in the body)
export const EDIT = Object.freeze({
  heading: '编辑 · 只改四样',
  titleLabel: '标题',
  topicsLabel: '主题',
  removeTopic: '去掉主题 {name}',
  addTopic: '+ 加主题',
  noTopic: '至少留一个主题。',
  bodyLabel: '正文（Markdown）',
  insertLink: '插入 [[链接]]…',
  linkSearch: '搜一条来链接',
  linkPlaceholder: '标题里的词',
  linkNone: '没有找到。',
  linkPick: '插入 [[{title}]]',
  record: '来源、日期、分数不能在这里改，它们是记录。',
  cancel: '取消',
  save: '保存',
  saving: '正在保存……',
  failed: '没能保存：这样改不合规范，文件没有动。',
  failedOther: '没能保存，文件没有动。可以再试一次。',
})

// 核验记录 (S15): what each check found, round by round
export const VERDICTS = Object.freeze({
  title: '核验记录',
  subtitle: '{node} · {title}',
  loading: '正在读记录……',
  none: '这一条没有核验记录。',
  failed: '没能读出这一条的记录。',
  nodes: Object.freeze({ ask: '问库' }),
  round: '第 {n} 轮 · {rules} 项规则 + {checks} 项判定',
  passed: '过',
  notPassed: '没过',
  kinds: Object.freeze({ rule: '规则', judge: '判定 · 独立调用' }),
  saidNotDone: '自报做到了，实查没有 → 记为「说做了其实没做」',
  sentBack: '退回第 {n} 轮没过的 {k} 项，模型只改这几处，不重写。',
  result: '结果：{passed} · {rounds} 轮',
  resultCalls: '结果：{passed} · {rounds} 轮 · {calls} 次调用',
  resultPassed: '通过',
  resultFailed: '未通过',
  close: '关闭',
  open: '这一条的记录',
})
