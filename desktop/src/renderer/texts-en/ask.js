// English (docs/desktop.md §六) for src/renderer/texts/ask.js: the same exports and keys.

export const ASK = Object.freeze({
  title: 'Answers from the library only',
  scope: 'Over: {kept} kept · {authored} yours',
  empty: 'Ask something about what is in the library. Every sentence of the answer carries numbers; press one to see which item it came from.',
  inputLabel: 'Ask the library',
  inputPlaceholder: 'Ask the library…',
  send: 'Send',
  asking: 'Looking through the library…',
  you: 'You asked',
  tooLong: 'At most 500 characters at a time.',
  busy: 'The last question is still running; ask again once it is answered.',
  failed: 'Not answered: {reason}',
  failedOther: 'Not answered. You can ask again.',

  answer: Object.freeze({
    citeLabel: 'Source {n}',
    sources: 'Sources',
    open: 'Open',
    removedCites: '{n} source{n?|s} not in the library {n?was|were} taken out.',
    removedSentences: '{n} sentence{n?|s} without a source {n?was|were} taken out.',
    notInLibrary: 'Not in the library.',
    notInLibraryText: 'The items in the library cannot answer this, so no answer was made up.',
    missing: 'What the library lacks: {missing}',
    unverified: 'Not every check passed: {n}',
  }),

  demand: Object.freeze({
    add: 'Note it as a topic to add',
    label: 'Topic to add',
    added: 'Noted: {topic}',
    failed: 'Not noted: the topic cannot be empty.',
  }),

  feedback: Object.freeze({
    open: 'What is wrong with this answer',
    label: 'What is wrong (kept on record, to tune how the library is asked)',
    placeholder: 'One sentence',
    send: 'Send',
    cancel: 'Cancel',
    sent: 'Thank you, it is on record.',
    failed: 'Not recorded; write a sentence and send it again.',
  }),

  panel: Object.freeze({
    used: 'What this answer used',
    how: 'Up to 9 candidates are picked from the library by topic and keyword; their text goes to the model, and the model can cite only those.',
    hits: '{candidates} found · {used} used',
    calls: '{n} call{n?|s} · {name}',
    callsNoName: '{n} call{n?|s}',
    noTools: 'The model got no tools and no network',
    check: 'Checks: {rounds} round{rounds?|s} · {passed}',
    checkPassed: 'all passed',
    checkFailed: 'not all passed',
    none: 'After a question, this says how many items were found, how many used, and how many calls it took.',
    demands: 'Topics to add ({n})',
    demandsNone: 'No topics noted yet.',
    demandLine: '{topic} · asked {n} time{n?|s}',
    suggest: 'Make it a topic',
    demandsHint: 'Asked 3 times or more: you are told to make it a topic.',
  }),
})
