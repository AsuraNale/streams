// English (docs/desktop.md��) for src/main/texts/notify.js: the same keys. The toast's app name is the shortcut's
// (installer) or Electron's (development), not ours.

export const NOTIFY = Object.freeze({
  title: 'Streams',
  kinds: Object.freeze({
    newItems: '{library}: this run added {n} to the Inbox.',
    dueDays: '{library}: "{title}" is due in {n} days.',
    dueTomorrow: '{library}: "{title}" is due tomorrow.',
    dueToday: '{library}: "{title}" is due today.',
    dueMany: '{library}: {count} items are due soon; the nearest is "{title}".',
  }),
})
