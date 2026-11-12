// English (docs/desktop.md §六) for src/renderer/texts/inbox.js: the same keys.

export const INBOX = Object.freeze({
  title: 'Inbox',
  count: 'Inbox · {n} item{n?|s}',
  sorted: 'By score',
  keys: 'J / K to move · C Keep · D Discard · L Later',
  addLink: 'Add a link',
  loadFailed: 'The inbox could not be read.',
  failed: 'That did not work; please try again.',

  card: Object.freeze({
    label: 'An item to review',
    meta: '{source} · {date}',
    score: '{name} {score}',
    freshness: Object.freeze({ new: 'new', followup: 'follow-up', duplicate: 'duplicate' }),
    what: 'Summary: ',
    excerpt: "The source's own excerpt: ",
    keep: 'Keep',
    dismiss: 'Discard',
    later: 'Later',
    waiting: 'Waited {n} day{n?|s}',
    unverified: 'Not verified',
    scoreless: 'Not scored',
    scorelessNote: 'This run had no model connection: no score and no summary. Once connected in Settings, newly fetched items are scored.',
    maybeDuplicate: 'Possible duplicate',
    moved: 'Filtered out · moved in by hand',
    movedNote: 'This item was filtered out and you moved it in: no summary was written and it was not verified.',
    aiInstruction: 'Instructions aimed at AI were found and ignored',
    aiInstructionHint: 'The sentences found: {phrases}',
    aiInstructionPhrase: '“{phrase}”',
    aiInstructionNoPhrase: 'The sentences found are in the verification record under Details on the right.',
  }),

  bar: Object.freeze({
    text: 'Discarded “{title}”. Reason (optional):',
    label: 'Reason for discarding',
    quick: Object.freeze({ marketing: 'Marketing', irrelevant: 'Not relevant', shallow: 'Too shallow', duplicate: 'Duplicate' }),
    other: 'Other reason…',
    otherPlaceholder: 'Write a reason',
    otherSave: 'Save reason',
    undo: 'Undo',
    close: 'Close',
  }),

  later: Object.freeze({
    title: 'Later',
    count: '{n} item{n?|s} (back in the inbox after the next run)',
    line: '{source} · {date}',
  }),

  rejected: Object.freeze({
    title: 'Filtered out',
    count: '{n} item{n?|s} (not added to the library)',
    shown: 'Only the newest {n} are listed.',
    below: 'Below the {name} threshold {score}',
    move: 'Move to Inbox',
    none: 'Nothing was filtered out.',
  }),

  manual: Object.freeze({
    tag: 'Awaiting scoring',
    note: 'Added manually · Will be scored on the next run',
  }),
  link: Object.freeze({
    title: 'Add a link',
    urlLabel: 'Address',
    urlPlaceholder: 'https://…',
    titleLabel: 'Title (optional)',
    confirm: 'Add',
    cancel: 'Cancel',
    bad: 'Enter an address that starts with http:// or https://.',
    seen: 'This address is already in the library; it was not added again.',
    added: 'Added; it will be scored on the next run.',
  }),

  empty: Object.freeze({
    title: 'Nothing to review',
    next: 'Next run: {when}.',
    nextNone: 'No scheduled run.',
    caughtTitle: '{n} item{n?|s} fetched, not scored yet',
    caughtNote: 'They are processed after a retry.',
    recent: 'Recently kept',
    recentNone: 'Nothing kept yet.',
    recentLine: '{source} · kept {when}',
  }),

  running: Object.freeze({
    title: 'This run has not finished',
    note: 'Items that pass the filters appear here when the run is done. You can close the window; the run goes on in the background.',
  }),
})
