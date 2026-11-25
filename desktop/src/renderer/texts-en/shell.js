// English (docs/desktop.md §六) for src/renderer/texts/shell.js: the same exports and keys.

export const SHELL = Object.freeze({
  sidebar: Object.freeze({
    mine: 'My libraries',
    newLibrary: 'New library',
    problem: 'This library has an issue',
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
      label: 'What is left',
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
    trackingNone: 'No brief and no topics yet',
    loadFailed: 'This library could not be read.',
    run: Object.freeze({
      now: 'Run now',
      running: 'Running · Stop',
      stopping: 'Stopping',
      queued: 'Queued · position {n}',
      next: 'Next run {when}',
      nextNone: 'No scheduled run',
      failed: 'The run could not start. Try again.',
      stopFailed: 'The run could not be stopped. Try again.',
    }),
  }),
  view: Object.freeze({ label: 'View', list: 'List', graph: 'Graph' }),

  shelf: Object.freeze({
    title: 'Shelf',
    subtitle: '{n} librar{n?y|ies} · each runs on its own schedule',
    lead: 'See what is new every day. Keep what is worth keeping.',
    text: 'Each library follows a set of sources and runs on its own schedule. Items that pass the filters go to the Inbox, where you decide what to keep.',
    search: 'Search libraries',
    searchNone: 'No library has “{q}” in its name or tracking.',
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
    emptyText: 'No library yet. Describe what you want to track to the main agent; it writes a library card for you to confirm.',
    emptyChat: 'Drafted by the main agent',
    emptyManual: 'Set up manually',
    loadFailed: 'The list of libraries could not be read.',
    more: Object.freeze({ button: 'More', label: 'More for this library', reveal: 'Show in File Explorer', scheduleOff: 'Turn the schedule off', scheduleOn: 'Turn the schedule on', remove: 'Remove this library', failed: 'That did not work. Please try again.' }),
  }),

  found: Object.freeze({
    title: 'Found {n} existing librar{n?y|ies}',
    lead: 'These libraries are in the default place for new libraries. Added back, they show under My libraries; no file in them is changed.',
    addAll: 'Add them all back',
    add: 'Add back',
    failed: 'They could not be added back. Please try again.',
  }),

  openExisting: Object.freeze({
    button: 'Open an existing library',
    notLibrary: 'This folder is not a Streams library. Choose the folder the library was made in (the one with a notes folder inside).',
    failed: 'This library could not be opened.',
  }),




  // who changed a setting is 高级设置's 变更记录 (texts/sources.js ADVANCED.log)


  // redesign R4b: 「这个库」 (thisLibrary), 来源与要求's v2 words (sources) and 设置's 定时一览 / 用量 (settings) went with their
  // parts: texts/sources.js and texts/settings.js have the new pages' words
})
