// 图谱 (screens/graph.js, mockup S9): three fixed rows (topics · sources · items), the filters, the box of an item clicked.
// Node labels are the library's data. The statuses: texts/common.js NOTE_STATUS.

export const GRAPH = Object.freeze({
  title: '图谱',
  subtitle: '主题 → 来源 → 条目',
  loadFailed: '没能画出图谱。',
  filtersLabel: '筛选',
  days: Object.freeze({ recent: '最近 30 天', all: '全部' }),
  status: Object.freeze({ kept: '只看已收藏', all: '全部条目' }),
  links: '显示 [[链接]]',
  rows: Object.freeze({ topic: '主题', source: '来源', item: '条目' }),
  nodeLabel: '{label} · {n}',
  unknownTopic: '{label}（库里没有这个主题）',
  limited: '只画了最近的 {n} 条（一共 {total} 条）。',
  empty: '这个筛选下没有条目。',
  legend: '节点大小 = 条数；实线是主题和来源到条目，虚线是条目之间的 [[链接]]。全部从索引算，没有第二份数据。',
  graphLabel: '主题、来源和条目的图',
  detail: Object.freeze({
    meta: '{source} · {date} · {status}',
    links: '链到：{titles}',
    linksNone: '没有链到别的条目',
    joiner: '、',
    open: '打开',
    close: '关上',
  }),
})
