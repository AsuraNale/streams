// English (docs/desktop.md §六) for src/renderer/texts/agent.js: the same exports and keys.

export const AGENT = Object.freeze({
  name: 'Main agent',
  role: 'Looks after all libraries',

  chat: Object.freeze({
    title: 'Main agent',
    subtitle: 'Create libraries, change their settings, ask how each is doing. Every change comes as a proposal and takes effect once confirmed.',
    intro: 'The main agent looks after all libraries: it creates libraries, changes their settings and says how each is doing. Every change comes as a proposal; Streams carries it out once you confirm.',
    dateLine: 'Main agent · {day}',
    inputLabel: 'Describe what you need to the main agent',
    placeholder: 'Describe what you need: create a library, change settings, ask how libraries are doing',
    who: 'Main agent',
    newline: 'Shift + Enter for a new line',
    calls: 'Usually {lo}–{hi} model calls per message; more when an answer is retried or the conversation record is tidied, at most {max} model calls',
    send: 'Send',
    thinking: 'The main agent is thinking…',
    tooLong: 'At most 4000 characters per message.',
    failed: 'The message was not sent. Try again.',
    busy: 'The main agent is still answering the last message; send once it has.',
    loadMore: 'Load earlier messages',
    loadingMore: 'Loading…',
    loadFailed: 'The conversation could not be read.',
    retry: 'Try again',
    fromLibrary: 'Passed on from Ask in “{name}”',
  }),

  guide: Object.freeze({
    title: 'What do you want to track?',
    text: 'Describe what you want to keep track of. The main agent drafts a library proposal (topics, sources and strictness); the library is created only once you confirm.',
    examplesLabel: 'You could say (a click puts it in the box; change it, then send):',
    examples: Object.freeze([
      'Make me a library on the Chinese electric car industry: car sales, batteries and charging.',
      'I want to follow new AI agent tools and evaluations, no marketing pieces.',
      'Keep an eye on the results and new products of a few listed Chinese fashion companies.',
    ]),
    manual: 'Set up manually',
    manualHint: 'Fill in one form yourself (brief, sources, location), without the main agent',
    noConnection: 'No model is connected yet, so the main agent is not available.',
    goSettings: 'Go to Settings',
  }),

  rows: Object.freeze({
    lookup: Object.freeze({
      library: 'Looked up: how {name} is doing',
      source_log: 'Looked up: what the source “{source}” of {name} fetched',
      proposals: 'Looked up: the proposals',
      proposalsOf: 'Looked up: the proposals for {name}',
      suggestions: 'Looked up: what Streams detected',
      suggestionsOf: 'Looked up: what Streams detected in {name}',
      notes_search: 'Looked up: the titles kept in {name}',
      other: 'Looked something up',
    }),
    note: 'Made a note',
    handed: 'Streams asked the main agent to review something it detected',
    summary: 'The earlier conversation was condensed into a summary',
    unknownLibrary: 'a library',
  }),

  notices: Object.freeze({
    'not-understood': 'The model’s answer could not be read.',
    'proposals-dropped': '{n} proposal{n?|s} could not be drafted.',
    'session-rebuilt': 'The session was interrupted; it went on from the conversation record.',
    connection: 'This message got no answer: {reason}',
    connectionOther: 'This message got no answer: the connection had a problem',
  }),
})
