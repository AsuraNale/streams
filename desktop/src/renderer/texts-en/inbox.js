// English (docs/desktop.md §六) for src/renderer/texts/inbox.js: the same keys.

export const INBOX = Object.freeze({
  title: 'Inbox',
  subtitle: 'By score',
  count: '{n} item{n?|s}',
  keys: 'J K up and down · C keep · D let go · L later',
  empty: 'Nothing is waiting for you.',
  loadFailed: 'The inbox could not be read.',

  card: Object.freeze({
    label: 'An item in the inbox',
    what: 'What it is: ',
    meta: '{source} · {date}',
    score: '{name} {score}',
    freshness: Object.freeze({ new: 'new', followup: 'follow-up', duplicate: 'duplicate' }),
    waiting: 'Waited {n} day{n?|s}',
    unverified: 'Did not pass the check',
    scoreless: 'Not scored',
    excerpt: "The source's own excerpt: ",
    scorelessNote: 'This round had no model connected, so nothing was scored or summarised. Once you connect one in Settings, new items will be scored.',
    maybeDuplicate: 'May duplicate an item seen before',
    open: 'Open the original',
    keep: 'Keep',
    dismiss: 'Let go…',
    later: 'Later',
    record: 'The check record of this item',
    failed: 'That did not work. You can try again.',
    aiInstruction: 'Words for the AI in this item, ignored',
    aiInstructionHint: 'Found: {phrases}',
    aiInstructionPhrase: '"{phrase}"',
    aiInstructionNoPhrase: 'The sentences found are in the check record of this item.',
  }),

  dialog: Object.freeze({
    title: 'Let this one go',
    why: 'Why (it is recorded, and shown next to the relevance requirement)',
    placeholder: 'One line of reason',
    confirm: 'Let go and next',
    cancel: 'Cancel',
  }),

  panel: Object.freeze({
    title: 'Recent reasons',
    none: 'Nothing let go yet.',
    line: '{when} · {reason}',
    ask: 'Tell the scoring requirement about these reasons?',
    adjust: 'Adjust the requirement',
  }),
})
