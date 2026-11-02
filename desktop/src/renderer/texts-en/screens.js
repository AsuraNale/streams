// English (docs/desktop.md §十六) for src/renderer/texts/screens.js: the same keys.

export const SCREENS = Object.freeze({
  placeholder: 'This page is built from tomorrow on.',
  titles: Object.freeze({
    today: 'Today',
    inbox: 'Inbox',
    library: 'Library',
    graph: 'Graph',
    ask: 'Ask',
    pipeline: 'Pipeline',
    sources: 'Sources & Topics',
    status: 'Status',
  }),
  about: Object.freeze({
    today: 'What came in today, how much passed, and how many items wait for you.',
    inbox: 'Items that passed wait here: keep them in the library, or let them go.',
    library: 'The files in your library: read, edit, find.',
    graph: 'How the items in the library connect.',
    ask: 'Ask a question of your library; the answer cites its sources.',
    pipeline: 'Progress of each step: fetching, scoring, filing.',
    sources: 'Which sources to watch, which topics matter, and the state of each source.',
    status: 'Connections, the last round, the next round, the log.',
  }),
})
