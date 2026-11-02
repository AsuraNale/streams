// English (docs/desktop.md §十六) for src/renderer/texts/common.js: the same export names and keys, served in its place by
// app://ui/ while the app runs in English (test/texts-en.test.mjs keeps the two tables parallel). No Chinese character in
// this folder. Plurals: '{n} item{n?|s}' (lib/format.js).

export const BRAND = Object.freeze({
  mark: 'S',
  name: 'Streams',
  tagline: '',
  htmlLang: 'en',
})

export const SIDEBAR = Object.freeze({
  label: 'Navigation',
  entries: Object.freeze({
    today: 'Today',
    inbox: 'Inbox',
    library: 'Library',
    graph: 'Graph',
    ask: 'Ask',
    pipeline: 'Pipeline',
    sources: 'Sources & Topics',
    status: 'Status',
  }),
  settings: 'Settings',
  noLibrary: 'No library open',
  libraryLabel: 'Current library',
})

export const SEP = ' · '

// a moment with its time (lib/format.js whenText) and just the day (dayText); {mon} is the month's short name (Oct)
export const WHEN = Object.freeze({ today: 'Today {hm}', yesterday: 'Yesterday {hm}', date: '{mon} {d} {hm}' })
export const DAY = Object.freeze({ today: 'Today', yesterday: 'Yesterday', date: '{mon} {d}' })

export const ERRORS = Object.freeze({
  retry: 'Retry',
  failed: 'That did not work. You can try again.',
})

export const FETCH_STATES = Object.freeze({
  ok: 'OK',
  empty: 'Nothing new',
  gap: 'Address problem',
  failed: 'Failed for now',
  blocked: 'Blocked by the site',
})
