// 图谱 (screens/graph.js; redesign R3: design 03-页面稿 P10, 07-模板版 「图谱」, F40): a view of 资料库 — three rows (主题 → 来源 →
// 条目), one filter (the time range), only what is a file of the library, the [[links]] always drawn (dashed). A node clicked:
// the right panel's 详情 says what it is. Node labels are the library's data.

export const GRAPH = Object.freeze({
  title: '图谱',
  loadFailed: '未能绘制图谱。',
  filtersLabel: '时间范围',
  days: Object.freeze({ recent: '最近 30 天', all: '全部' }),
  rows: Object.freeze({ topic: '主题', source: '来源', item: '条目' }),
  nodeLabel: '{label} · {n}',
  unknownTopic: '{label}（不是该库的主题）',
  authored: '{label}（我的笔记）',
  limited: '仅绘制最近的 {n} 条（共 {total} 条）。',
  empty: '当前时间范围内没有内容。',
  graphLabel: '主题、来源与条目的图谱',
  legend: '实线：主题、来源到条目；虚线：笔记之间的 [[链接]]。',
  // the right panel's 详情 of the node clicked
  detail: Object.freeze({
    eyebrow: '当前节点',
    none: '点击图谱中的一个节点，这里显示它的详情。',
    topic: '主题：{label}',
    source: '来源：{label}',
    topicMeta: '{n} 篇 · 关键词 {k} 个',
    sourceMeta: '{n} 篇',
    itemMeta: '{source} · {date}',
    topicItems: '该主题下的内容',
    sourceItems: '该来源的内容',
    links: '链接到的笔记',
    backlinks: '反向链接',
    linksNone: '无',
    authored: '我的笔记',
    itemsNone: '当前时间范围内没有内容。',
    open: '在资料库中打开',
  }),
})
