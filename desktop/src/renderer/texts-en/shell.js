// English (docs/desktop.md §六) for src/renderer/texts/shell.js: the same exports and keys.

export const SHELL = Object.freeze({
  sidebar: Object.freeze({
    chatBadge: '{n} thing{n?|s} for you to decide',
    mine: 'My libraries',
    newLibrary: 'New library',
    problem: 'Something is wrong with this library',
    inboxBadge: '{n} item{n?|s} in the inbox',
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

  chat: Object.freeze({
    title: 'Chat with the main Agent',
    subtitle: 'Anything about any library can be said here',
    waiting: 'For you to decide: {n}',
    shell: 'This page is still being made: next, the main Agent talks with you here and puts its suggested changes here for you to confirm.',
  }),

  newLibrary: Object.freeze({
    title: 'New library',
    text: 'Choose an empty folder for a new library, or open a folder that already holds one (or your own .md notes). It then shows under My libraries.',
    name: 'Name',
    namePlaceholder: 'Empty: the folder\'s name',
    chooseEmpty: 'Choose an empty folder',
    chooseExisting: 'Open a folder',
    chosen: 'The folder: {path}',
    importable: 'This folder holds {n} .md file{n?|s}. Streams opens it as a library and does not move or change your files.',
    importNow: 'Open as a library',
    other: 'This folder holds other things; choose another.',
    notEmpty: 'A new library needs an empty folder.',
    failed: 'This folder could not be opened.',
    cancel: 'Cancel',
  }),

  who: Object.freeze({
    label: 'Who decided',
    you: 'Changed by you · {date}',
    agent: 'Suggested by the main Agent · confirmed by you · {date}',
    setup: 'First-time setup',
  }),

  overview: Object.freeze({
    title: 'Overview',
    suggestions: 'Suggestions from the main Agent for this library',
    suggestionKinds: Object.freeze({
      'source-failing': 'The source "{subject}" has failed several rounds in a row',
      'no-output': 'This library had nothing new several rounds in a row',
      'ai-instruction': 'Articles of the source "{subject}" hold words written to an AI',
      'topic-overlap': 'Its topics overlap a lot with another library',
    }),
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
