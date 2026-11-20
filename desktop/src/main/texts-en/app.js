// English (docs/desktop.md §六) for src/main/texts/app.js: the same keys.

export const APP = Object.freeze({
  loginWindowTitle: 'Streams',
  tray: Object.freeze({
    tooltip: 'Streams · {n} in the Inbox',
    open: 'Open Streams',
    runNow: 'Run now',
    quit: 'Quit',
  }),
  reader: Object.freeze({
    windowTitle: 'Streams · Reading',
    lang: 'en',
    back: 'Back to item',
    address: 'Address',
    reading: 'Reading view',
    original: 'Original page',
    browser: 'Open in browser',
    modes: 'View',
    loading: 'Extracting the article…',
    fallback: 'No article could be extracted from this page; showing the original page.',
    readingNote: 'Reading view: article only, navigation and ads removed',
  }),
  startupBroken: Object.freeze({
    title: 'Streams cannot start',
    body: 'Files that come with Streams are missing or damaged, so it cannot start. Please reinstall Streams.\n\nDetails:\n{problems}',
  }),
})
