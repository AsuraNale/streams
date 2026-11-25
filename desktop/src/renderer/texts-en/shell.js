// English (docs/desktop.md §六) for src/renderer/texts/shell.js: the same exports and keys.

export const SHELL = Object.freeze({
  sidebar: Object.freeze({
    mine: 'My libraries',
    newLibrary: 'New library',
    problem: 'This library has a problem',
    inboxBadge: '{n} item{n?|s} in the Inbox',
    inboxLine: '{n} to review',
    idle: 'Nothing to review',
    problems: Object.freeze({
      missing: 'Folder cannot be read',
      sources: 'Source issues',
      'no-output': 'No new items in {n} runs',
    }),
    // v2 package M: the corner above Settings
    quota: Object.freeze({
      label: 'Remaining',
      plan: 'Plan usage',
      balance: 'API balance',
      window: '{span}: {pct}% used · resets {when}',
      resets: Object.freeze({ today: '{hm}', tomorrow: 'tomorrow {hm}', date: '{m}/{d} {hm}' }),
      hours: '{n} hour{n?|s}',
      days: '{n} day{n?|s}',
      minutes: '{n} min',
      amount: '{amount} {currency}',
      asOf: 'As of {when}',
      resetsAt: 'resets {when}',
    }),
  }),

  tabs: Object.freeze({
    label: 'Library navigation',
    inbox: 'Inbox',
    library: 'Library',
    ask: 'Ask',
    sources: 'Sources & Brief',
  }),
  head: Object.freeze({
    tracking: 'Tracking: {what}',
    trackingNone: 'No brief or topics yet',
    loadFailed: 'Couldn\'t read this library.',
    run: Object.freeze({
      now: 'Run now',
      running: 'Stop run',
      stopping: 'Stopping',
      queued: 'Queued · position {n}',
      next: 'Next run {when}',
      nextNone: 'No scheduled run',
      failed: 'Couldn\'t start the run. Try again.',
      stopFailed: 'Couldn\'t stop the run. Try again.',
    }),
  }),
  view: Object.freeze({ label: 'View', list: 'List', graph: 'Graph' }),

  shelf: Object.freeze({
    title: 'Shelf',
    subtitle: '{n} librar{n?y|ies} · each runs on its own schedule',
    lead: 'Review what\'s new each day and keep what matters.',
    text: 'Each library follows a set of sources and runs on its own schedule. Items that pass the filters go to the Inbox, where you decide what to keep.',
    search: 'Search libraries',
    searchNone: 'No library has “{q}” in its name or brief.',
    newButton: 'New library',
    newCard: 'New library · drafted by the main agent',
    inboxLabel: 'in the Inbox',
    inboxLine: '{n} to review',
    enter: 'Open Inbox',
    updated: 'Last run {when}',
    updatedNever: 'Not run yet',
    sources: '{n} source{n?|s}',
    fine: 'Sources OK',
    problems: Object.freeze({
      missing: 'Folder cannot be read',
      sources: 'Source issues',
      'no-output': 'No new items in {n} runs',
    }),
    emptyText: 'No libraries yet. Describe a topic to track, and the main agent will draft a library card for you to confirm.',
    emptyChat: 'Drafted by the main agent',
    emptyManual: 'Set up manually',
    loadFailed: 'Couldn\'t load the libraries.',
    more: Object.freeze({ button: 'More', label: 'More actions for this library', reveal: 'Show in File Explorer', scheduleOff: 'Turn off schedule', scheduleOn: 'Turn on schedule', remove: 'Remove this library', failed: 'Something went wrong. Try again.' }),
  }),

  found: Object.freeze({
    title: 'Found {n} existing librar{n?y|ies}',
    lead: 'These libraries are in the default location for new libraries. Once added back, they appear under My libraries; their files aren\'t changed.',
    addAll: 'Add them all back',
    add: 'Add back',
    failed: 'Couldn\'t add them back. Try again.',
  }),

  openExisting: Object.freeze({
    button: 'Open an existing library',
    notLibrary: 'This folder isn\'t a Streams library. Choose the library folder that contains a notes folder.',
    failed: 'Couldn\'t open this library.',
  }),




  // who changed a setting is 高级设置's 变更记录 (texts/sources.js ADVANCED.log)


  // redesign R4b: 「这个库」 (thisLibrary), 来源与要求's v2 words (sources) and 设置's 定时一览 / 用量 (settings) went with their
  // parts: texts/sources.js and texts/settings.js have the new pages' words
})
