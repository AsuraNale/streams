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
    back: 'Back to the item',
    reading: 'Reading view',
    original: 'Original page',
    browser: 'Open in the browser',
    modes: 'Reading view or the original page',
    loading: 'Taking out the text…',
    fallback: 'No article text could be taken from this page, so it shows the original page',
    readingNote: 'Reading view: only the text, without the navigation and ads',
  }),
})
