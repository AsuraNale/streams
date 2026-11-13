// 资料库 (screens/library.js), 编辑笔记 (screens/edit-dialog.js) and 核验记录 (screens/verdict-dialog.js). Redesign R3
// (docs/checks/2026-11-11-r3/contract.md R3-1 … R3-4; design 03-页面稿 P09 · P11 · P12, the words of 05-措辞规范): 资料库 only
// holds what is a file of the library — 全部 · 已收藏 · 我的笔记 (no 「抓到的」, no 「待规范」 tab); files without a header are
// a line that leads to their page. Titles, topics, sources and bodies are the library's own data and never come from here.
// The scores' names: texts/common.js NODE_NAMES.

export const LIBRARY = Object.freeze({
  title: '资料库',
  loadFailed: '未能读取库内内容。',
  searchLabel: '搜索资料库',
  searchPlaceholder: '搜索标题、主题、正文…',
  searchCount: '找到 {n} 条',
  searchNone: '没有找到相关内容，请换个关键词。',
  searching: '正在搜索…',
  // the three filters and their counts (core libraryCounts: all · kept · authored)
  views: Object.freeze({
    all: '全部',
    kept: '已收藏',
    authored: '我的笔记',
  }),
  viewCount: '{name} {n}',
  viewsLabel: '资料库的筛选',
  filtersLabel: '主题与时间',
  recent: '最近 30 天',
  empty: Object.freeze({
    all: '暂无已入库的内容。在待看中点击「收藏」后，内容会写成笔记出现在这里。',
    kept: '暂无已收藏的内容。在待看中点击「收藏」后会出现在这里。',
    authored: '暂无你自己写的笔记。',
  }),
  filteredEmpty: '当前筛选下没有内容。',

  // a row of the list: the date and where it came from (an authored note: 我的笔记)
  row: Object.freeze({
    meta: '{date} · {source}',
    authoredMeta: '{date} · 我的笔记',
  }),

  // 缺少文件头 (P12, F39, V8): the line on 资料库 (only while there are such files) and the page it leads to
  pending: Object.freeze({
    hint: '{n} 个文件缺少文件头，尚未入库。',
    go: '去处理',
    back: '返回资料库',
    heading: '{n} 个文件缺少文件头',
    none: '库文件夹中的文件都有文件头。',
    note: '这些文件已存在于库文件夹中（例如在 Obsidian 中创建的笔记），流息尚未对其做任何修改。写入文件头后方可入库，正文内容不会被改动。',
    missingTag: '缺少文件头',
    notYet: '尚未入库',
    codes: Object.freeze({
      'no-frontmatter': '缺少文件头',
      'bad-frontmatter': '文件头无法读取',
      'id-mismatch': '文件名与 id 不一致',
      'bad-status': '状态字段有误',
      'bad-topics': '主题字段有误',
      'bad-scores': '评分字段有误',
    }),
    missing: '缺少 {field}',
    badDate: '{field} 不是日期',
    // redesign R5b (O9): no code — a rule of the file not met, in words
    other: '不符合文件规范',
    applyAll: '全部写入',
    applyingAll: '正在写入…',
    allWritten: '已写入 {n} 个文件。',
    allLeft: '{n} 个未写入：{files}。',
    headerLabel: '建议的文件头（可编辑）',
    dateComment: '取文件修改时间',
    footNote: '只写入文件头，正文不变',
    apply: '写入',
    applying: '正在写入…',
    skip: '跳过',
    written: '已写入 {file}，已在「{view}」中。',
    skippedLine: '已跳过 {n} 个：本次不写入，下次打开此页仍会列出。',
    showSkipped: '显示已跳过的文件',
    badName: '文件名「{name}」不能用作条目的 id：只能使用字母、数字、汉字、空格和 - _ .，并以字母、数字或汉字开头。流息不会修改文件名，请自行重命名后再回到此页。',
    notProposable: '该文件的文件头存在其他问题（{problems}），流息无法给出建议。请在 Obsidian 或文本编辑器中修正文件头，然后在设置中点击「重建索引」。',
    parseFailed: '第 {line} 行无法识别。请按建议的写法修改：键、冒号、空格、值；主题放在方括号中，用逗号分隔。',
    failed: '未能写入：该文件头不符合文件规范（需要标题、来源、日期、状态和主题，日期写作 2026-10-20）。文件未改动。',
    failedOther: '未能写入，文件未改动。请重试。',
    subfolders: '本版本不读取子文件夹中的文件：{dirs}。',
  }),

  // the reading area (P09): its marks, its line of facts, the text
  reader: Object.freeze({
    label: '正文',
    none: '在左侧选择一条内容。',
    loadFailed: '未能读取这一条。',
    status: Object.freeze({ kept: '已收藏', authored: '我的笔记', archived: '已归档' }),
    published: '发布 {date}',
    kept: '收藏 {date}',
    missingLink: '库内没有这一条',
  }),

  // the reading area's buttons: 编辑 · 查看原文 (Streams' reading window) · 更多 ▾
  actions: Object.freeze({
    edit: '编辑',
    source: '查看原文',
    more: '更多',
    moreLabel: '更多操作',
    obsidian: '在 Obsidian 中打开',
    folder: '在资源管理器中显示',
    browser: '在浏览器中打开',
    failed: '操作未成功，请重试。',
  }),

  // the right panel's 详情 of the note being read: only what the reading area does not show
  panel: Object.freeze({
    eyebrow: '当前笔记',
    reasons: '入选理由',
    reasonsNone: '这篇笔记没有评分记录（你自己写的笔记不经评分）。',
    score: '{name} {score}',
    freshness: Object.freeze({ new: '新', followup: '后续', duplicate: '重复' }),
    check: '核验',
    file: '文件',
    backlinks: '反向链接',
    backlinksNone: '暂无其他笔记链接到这里。',
    sameSource: '同来源内容',
    sameSourceNone: '同一来源暂无其他内容。',
    authored: '我的笔记',
    none: '在资料库中选择一条内容，这里显示它的入选理由、核验记录与文件。',
  }),
})

// 编辑笔记 (P11, F36): only the title, the topics and the body ([[links]] live in the body)
export const EDIT = Object.freeze({
  heading: '编辑笔记',
  close: '关闭',
  titleLabel: '标题',
  topicsLabel: '主题',
  removeTopic: '移除主题 {name}',
  addTopic: '＋ 添加主题',
  addTopicLabel: '添加主题（可从已有主题中选择）',
  addTopicPlaceholder: '输入或选择主题，按回车添加',
  noTopic: '至少保留一个主题。',
  bodyLabel: '正文（Markdown）',
  insertLink: '插入链接',
  linkSearch: '搜索要链接的笔记',
  linkPlaceholder: '输入标题中的词',
  linkNone: '没有找到。',
  linkPick: '插入 [[{title}]]',
  record: '仅可修改标题、主题、正文和链接；来源、日期、评分为记录字段，不可修改。',
  cancel: '取消',
  save: '保存',
  saving: '正在保存…',
  failed: '未能保存：修改后不符合文件规范，文件未改动。',
  failedOther: '未能保存，文件未改动。请重试。',
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
  // v2 package H: 「写给 AI 的话」 found in the material (core verify: the mark on the verdict lines)
  ai: Object.freeze({
    title: '这一条里有写给 AI 的话，已忽略',
    note: '材料里有写给 AI 的指令，没有照做：来源和库的设置都没有被改动。',
    rule: '规则命中的原句',
    judge: '判定找到的',
    none: '记录里没有留下原句。',
  }),
})
