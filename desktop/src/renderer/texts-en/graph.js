// English (docs/desktop.md §六) for src/renderer/texts/graph.js: the same exports and keys.

export const GRAPH = Object.freeze({
  title: 'Graph',
  subtitle: 'Topics → sources → items',
  loadFailed: 'The graph could not be drawn.',
  filtersLabel: 'Filters',
  days: Object.freeze({ recent: 'Last 30 days', all: 'All' }),
  status: Object.freeze({ kept: 'Kept only', all: 'All items' }),
  links: 'Show [[links]]',
  rows: Object.freeze({ topic: 'Topics', source: 'Sources', item: 'Items' }),
  nodeLabel: '{label} · {n}',
  unknownTopic: '{label} (not a topic of the library)',
  limited: 'Only the {n} most recent are drawn ({total} in all).',
  empty: 'Nothing under this filter.',
  legend: 'Node size = how many items; solid lines join topics and sources to items, dashed lines are [[links]] between items. All drawn from the index, no second copy of the data.',
  graphLabel: 'A graph of topics, sources and items',
  detail: Object.freeze({
    meta: '{source} · {date} · {status}',
    links: 'Links to: {titles}',
    linksNone: 'Links to no other item',
    joiner: ', ',
    open: 'Open',
    close: 'Close',
  }),
})
