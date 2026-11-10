// English (docs/desktop.md §六) for src/renderer/texts/shell.js: the same exports and keys.

export const SHELL = Object.freeze({
  sidebar: Object.freeze({
    chatBadge: '{n} thing{n?|s} for you to decide',
    mine: 'My libraries',
    newLibrary: 'New library',
    problem: 'Something is wrong with this library',
    inboxBadge: '{n} item{n?|s} in the inbox',
    // v2 package M: the corner above Settings
    quota: Object.freeze({
      label: 'What is left',
      // v2 package L: the K1 draft's title (the used per cent)
      plan: 'Plan used',
      balance: 'API balance',
      window: '{span}: {pct}% used · resets {when}',
      resets: Object.freeze({ today: '{hm}', tomorrow: 'tomorrow {hm}', date: '{m}/{d} {hm}' }),
      hours: '{n} hour{n?|s}',
      days: '{n} day{n?|s}',
      minutes: '{n} min',
      amount: '{amount} {currency}',
      asOf: 'As of {when}',
      // v2 package K2: the corner drawn as the K1 draft has it — under each window's bar, when it resets
      resetsAt: 'resets {when}',
    }),
  }),

  tabs: Object.freeze({
    label: 'Parts of the library',
    overview: 'Overview',
    inbox: 'Inbox',
    library: 'Library',
    ask: 'Ask',
    sources: 'Sources & Brief',
  }),
  head: Object.freeze({
    tracking: 'Following: {what}',
    trackingNone: 'No brief and no topics yet',
    loadFailed: 'This library could not be read.',
  }),
  view: Object.freeze({ label: 'View', list: 'List', graph: 'Graph' }),

  shelf: Object.freeze({
    title: 'Shelf',
    subtitle: '{n} librar{n?y|ies} · each runs on its own time',
    newButton: 'New library',
    newCard: 'New library · build it with the main Agent',
    inboxLabel: 'in the inbox',
    updated: 'Last updated {when}',
    updatedNever: 'Not run yet',
    sources: '{n} source{n?|s}',
    fine: 'All sources are fine',
    problems: Object.freeze({
      missing: 'The folder is gone or cannot be read',
      sources: 'A source has a problem',
      'no-output': '{n} rounds in a row with nothing new',
    }),
    emptyText: 'No library yet. Tell the main Agent what you want to follow and it builds one with you, or make one yourself.',
    emptyChat: 'Chat with the main Agent',
    emptyManual: 'Make one myself',
    loadFailed: 'The list of libraries could not be read.',
  }),


  newLibrary: Object.freeze({
    title: 'New library',
    cancel: 'Cancel',
  }),

  thisLibrary: Object.freeze({
    title: 'This library',
    hint: 'Its folder, its index, its place in the list',
    folder: 'Folder',
    reveal: 'Show in File Explorer',
    revealFailed: 'The folder could not be opened.',
    remove: 'Remove this library',
    removeHint: 'Only takes it off the list in Streams; the folder and its files stay as they are.',
    removeDialog: Object.freeze({
      title: 'Remove “{name}”?',
      text: 'It only leaves the list: it no longer shows under My libraries and no longer runs on a schedule. Not one file is deleted. Choose this folder under New library to open it again.',
      confirm: 'Remove',
      cancel: 'Cancel',
    }),
  }),

  who: Object.freeze({
    label: 'Who decided',
    you: 'Changed by you · {date}',
    agent: 'Suggested by the main Agent · confirmed by you · {date}',
    setup: 'First-time setup',
  }),

  overview: Object.freeze({
    title: 'Overview',
    run: 'Run status',
  }),

  sources: Object.freeze({
    title: 'Sources & Brief',
    brief: 'Brief (one paragraph: what to follow, what not)',
    briefNone: 'No brief yet. Write a paragraph on what this library follows and what it leaves out.',
    briefEdit: 'Edit the brief',
    briefSave: 'Save',
    briefCancel: 'Cancel',
    briefSaved: 'Saved.',
    briefBad: 'The brief is 1 to 2000 characters.',
    briefFailed: 'The brief could not be saved.',
    briefLabel: 'This library\'s brief',
    gates: 'Scoring steps',
    gatesHint: 'Each step\'s requirement and pass line; after a change, try one item and see before you save',
    run: 'Schedule and the cap per round',
    runHint: 'This library only',
    thresholds: 'Pass lines',
  }),

  settings: Object.freeze({
    schedules: 'Schedules',
    schedulesHint: 'Each library runs on its own time; click a name to change it on its Sources & Brief',
    schedulesNone: 'No library yet.',
    schedulesFailed: 'This library\'s schedule could not be read.',
    library: 'Library',
    on: 'Every day',
    off: 'Off',
    next: 'Next',
    usage: 'This month, every library',
    usageHint: 'All libraries together, by month',
    usageLine: '{calls} model call{calls?|s} · {input} in · {output} out',
    usageLibrary: '{name}: {calls}',
    usageMissing: '{name}: the folder is gone',
    usageFailed: 'The use could not be read.',
  }),
})
