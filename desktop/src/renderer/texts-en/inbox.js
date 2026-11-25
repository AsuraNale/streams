// English (docs/desktop.md §六) for src/renderer/texts/inbox.js: the same keys.

export const INBOX = Object.freeze({
  title: 'Inbox',
  count: 'Inbox · {n} item{n?|s}',
  sorted: 'Newest first',
  keys: 'J / K to move · C Keep · D Discard · L Later',
  loadFailed: 'The Inbox could not be read.',
  failed: 'That did not work; please try again.',

  card: Object.freeze({
    label: 'An item to review',
    meta: '{source} · {date}',
    what: 'Overview: ',
    keep: 'Keep',
    dismiss: 'Discard',
    later: 'Later',
    waiting: 'Waited {n} day{n?|s}',
    unverified: 'Verification failed',
    titleOnly: 'Title only',
    titleOnlyHint: 'This source gives only titles and its body cannot be read: the overview rests on the title alone. Open the original to check.',
    aiInstruction: 'Instructions aimed at AI were detected and ignored',
    aiInstructionHint: 'The sentences found: {phrases}',
    aiInstructionPhrase: '“{phrase}”',
    aiInstructionNoPhrase: 'The sentences found are in the verification record under Details on the right.',
    // 1.1 W6a (A3, A4)
    saved: 'original kept',
    published: 'published {date}',
    pointLink: 'Paragraph {n} of the original · see the words',
    opening: 'Opening of the original',
    openingMeta: '{method} · kept {when}',
    openStored: 'Open the kept original',
    openWeb: 'Web page',
    missing: 'Original not kept',
    missingNote: 'Streams could not read this page ({why}), so there is no summary. Open the title to see the web page, or discard it.',
    missingWhy: Object.freeze({ login: 'it needs a sign-in', check: 'the site asks for a human check', blocked: 'the site does not let programs read it', dead: 'the address is gone', failed: 'the site could not be reached', 'no-article': 'no article text in it' }),
    needsContact: 'This site lets programs read it only when they leave a contact e-mail: fill one in Settings.',
    needsContactGo: 'Fill it in Settings',
    summaryMissing: 'No summary written',
    summaryMissingNote: 'The original is kept, but no summary was written for it this time. You can open the kept original.',
    methods: Object.freeze({ direct: 'read directly', render: 'read after rendering', pdf: 'text of a PDF' }),
  }),

  bar: Object.freeze({
    text: 'Discarded “{title}”. Reason (optional):',
    label: 'Reason for discarding',
    quick: Object.freeze({ marketing: 'Marketing', irrelevant: 'Not relevant', shallow: 'Too shallow', duplicate: 'Duplicate' }),
    other: 'Other…',
    otherPlaceholder: 'Write a reason',
    otherSave: 'Save reason',
    undo: 'Undo',
    close: 'Close',
  }),

  // 1.1.1 P8 (A12)
  due: Object.freeze({
    title: 'Due soon',
    count: '{n} item{n?|s}',
    note: 'Items due within 30 days, in the Inbox and kept; you are notified 7 days and 1 day before.',
    today: 'Due today',
    tomorrow: 'Due tomorrow',
    days: 'Due in {n} days',
    date: '{mon} {d}',
    inbox: 'In the Inbox',
    kept: 'Kept',
    line: '{when} ({date})',
  }),

  later: Object.freeze({
    title: 'Later',
    count: '{n} item{n?|s} (back in the Inbox after the next run)',
    line: '{source} · {date}',
  }),



  empty: Object.freeze({
    title: 'Nothing to review',
    next: 'Next run: {when}.',
    nextNone: 'No scheduled run.',
    recent: 'Recently kept',
    recentNone: 'Nothing kept yet.',
    recentLine: '{source} · kept {when}',
  }),

  // 1.1 W6a (B12)
  banner: Object.freeze({
    loginExpired: 'The connection’s sign-in has expired, so this library was not updated; the originals already fetched are all kept. Sign in again in Settings, then run it again.',
    toSettings: 'Go to Settings',
  }),
  running: Object.freeze({
    title: 'This run has not finished',
    note: 'The items picked appear here when the run is done. You can close the window; the run goes on in the background.',
  }),
})

export const UPDATE_NOTE = Object.freeze({
  line: 'Last update {when}: read {read} source{read?|s}{bad}, {n} new',
  bad: ' ({n} could not be read)',
  nothingNew: 'Last update {when}: no new links on the sources; the update agent was not called',
  failed: 'The last update ({when}) did not finish',
  notes: 'Notes from the update agent ({n})',
  hide: 'Hide',
  toCard: 'Change the card with this',
})
