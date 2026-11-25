// English (docs/desktop.md §六) for src/renderer/texts/inbox.js: the same keys.

export const INBOX = Object.freeze({
  title: 'Inbox',
  count: 'Inbox · {n} item{n?|s}',
  sorted: 'Newest first',
  keys: 'J / K to move · C Keep · D Discard · L Later',
  loadFailed: 'The Inbox could not be read.',
  failed: 'Something went wrong. Try again.',

  card: Object.freeze({
    label: 'Inbox item',
    meta: '{source} · {date}',
    what: 'Overview: ',
    keep: 'Keep',
    dismiss: 'Discard',
    later: 'Later',
    waiting: 'Waiting {n} day{n?|s}',
    unverified: 'Verification failed',
    titleOnly: 'Title only',
    titleOnlyHint: 'This source provides titles only, so the overview is based on the title alone. Open the original to verify.',
    aiInstruction: 'Instructions aimed at AI were detected and ignored',
    aiInstructionHint: 'Matched sentences: {phrases}',
    aiInstructionPhrase: '“{phrase}”',
    aiInstructionNoPhrase: 'The matched sentences are in the verification record under Details.',
    // 1.1 W6a (A3, A4)
    saved: 'original stored',
    published: 'published {date}',
    pointLink: 'Paragraph {n} · View source text',
    opening: 'Beginning of the original',
    openingMeta: '{method} · stored {when}',
    openStored: 'Open stored original',
    openWeb: 'Original page',
    missing: 'Original not stored',
    missingNote: 'Couldn\'t read this page ({why}), so no summary was generated. Select the title to open the original page.',
    missingWhy: Object.freeze({ login: 'sign-in required', check: 'the site requires a human check', blocked: 'the site blocks automated access', dead: 'the address no longer exists', failed: 'the site is temporarily unavailable', 'no-article': 'no article text found' }),
    needsContact: 'This site requires a contact email. Add one in Settings.',
    needsContactGo: 'Add in Settings',
    summaryMissing: 'No summary',
    summaryMissingNote: 'The original is stored, but no summary was generated this time. Open the stored original to read it.',
    methods: Object.freeze({ direct: 'fetched directly', render: 'fetched after rendering', pdf: 'extracted from PDF' }),
  }),

  bar: Object.freeze({
    text: 'Discarded “{title}”. Add a reason (optional):',
    label: 'Reason for discarding',
    quick: Object.freeze({ marketing: 'Marketing', irrelevant: 'Not relevant', shallow: 'Too shallow', duplicate: 'Duplicate' }),
    other: 'Other…',
    otherPlaceholder: 'Enter a reason',
    otherSave: 'Save reason',
    undo: 'Undo',
    close: 'Close',
  }),

  // 1.1.1 P8 (A12)
  due: Object.freeze({
    title: 'Due soon',
    count: '{n} item{n?|s}',
    note: 'Items due within 30 days, in the Inbox or kept. You\'re notified 7 days and 1 day before.',
    today: 'Due today',
    tomorrow: 'Due tomorrow',
    days: 'Due in {n} days',
    date: '{m}/{d}',
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
    loginExpired: 'Your connection\'s sign-in has expired, so this library wasn\'t updated. Originals already fetched are retained. Sign in again in Settings, then run it again.',
    toSettings: 'Go to Settings',
  }),
  running: Object.freeze({
    title: 'This run has not finished',
    note: 'Selected items appear here when the run finishes. You can close the window; the run continues in the background.',
  }),
})

export const UPDATE_NOTE = Object.freeze({
  line: 'Last update {when}: {read} source{read?|s} read{bad}, {n} new',
  bad: ' ({n} unreadable)',
  nothingNew: 'Last update {when}: no new links on the sources; the update agent wasn\'t run',
  failed: 'Last update ({when}) didn\'t finish',
  notes: 'Card suggestions',
  notesN: '{n}',
  more: 'Show all {n}',
  hide: 'Show less',
  toCard: 'Send to main agent',
})
