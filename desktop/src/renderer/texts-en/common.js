// English (docs/desktop.md §六) for src/renderer/texts/common.js: the same export names and keys, served in its place by
// app://ui/ while the app runs in English (test/texts-en.test.mjs keeps the two tables parallel). No Chinese character in
// this folder. Plurals: '{n} item{n?|s}' (lib/format.js).

export const BRAND = Object.freeze({
  mark: 'S',
  name: 'Streams',
  tagline: '',
  htmlLang: 'en',
})

export const SIDEBAR = Object.freeze({
  label: 'Navigation',
  entries: Object.freeze({
    today: 'Today',
    inbox: 'Inbox',
    library: 'Library',
    graph: 'Graph',
    ask: 'Ask',
    pipeline: 'Pipeline',
    sources: 'Sources & Topics',
    status: 'Status',
  }),
  settings: 'Settings',
  noLibrary: 'No library open',
  libraryLabel: 'Current library',
  inboxBadge: '{n} item{n?|s} waiting for you',
})

export const SEP = ' · '

// a moment with its time (lib/format.js whenText) and just the day (dayText); {mon} is the month's short name (Oct)
export const WHEN = Object.freeze({ today: 'Today {hm}', yesterday: 'Yesterday {hm}', date: '{mon} {d} {hm}' })
export const DAY = Object.freeze({ today: 'Today', yesterday: 'Yesterday', date: '{mon} {d}' })

export const ERRORS = Object.freeze({
  retry: 'Retry',
  failed: 'That did not work. You can try again.',
  noLibrary: 'No library is open yet.',
})

export const FETCH_STATES = Object.freeze({
  ok: 'OK',
  empty: 'Nothing new',
  gap: 'Address problem',
  failed: 'Failed for now',
  blocked: 'Blocked by the site',
})

export const CONNECTIONS = Object.freeze({
  names: Object.freeze({
    'claude-code': 'Connect the Claude Code on this computer',
    codex: 'Connect the Codex on this computer',
    api: 'Enter an API key',
  }),
  found: 'Found',
  notFound: 'Not found',
  version: 'version {version}',
  loggedIn: 'signed in',
  notLoggedIn: 'not signed in',
  keySet: 'Key set (ends in {hint})',
  keyNone: 'Not set',
  inUse: 'in use',
  usable: 'usable',
  recommended: 'Recommended',
  login: Object.freeze({
    go: 'Sign in',
    note: 'A terminal window opens and does the sign-in by itself; Streams never touches any credential',
    again: 'I am signed in, try again',
    failed: 'The sign-in window could not be opened.',
  }),
  probe: Object.freeze({
    trying: 'Trying once…',
    ok: 'Tried once: usable · {seconds} s · counted against your own plan',
    failed: 'Tried once: did not work · {reason}',
  }),
  defaultModel: 'Default',
  sameAsMain: 'Same as the main model',
  codes: Object.freeze({
    'not-installed': 'it was not found',
    'not-logged-in': 'not signed in yet',
    'login-expired': 'the sign-in has expired',
    'bad-key': 'the key is wrong',
    'bad-model': 'the model name is wrong',
    'rate-limited': 'the service asked to slow down',
    network: 'the network is unreachable',
    timeout: 'no answer in time',
    'bad-format': 'the answer was not in the expected form',
    refused: 'the request was declined',
    unknown: 'an unexpected error',
  }),
})

export const NODE_NAMES = Object.freeze({
  relevance: 'Relevance',
  substance: 'Substance',
  freshness: 'Freshness',
  summary: 'Summary',
})

export const ROUND_PHASES = Object.freeze({
  'self-check': 'checking',
  fetch: 'fetching',
  gate: 'scoring',
  summary: 'summarizing',
  done: 'done',
})

// ---- 11-03 plan B ----

export const FETCH_HINTS = Object.freeze({
  none: 'Nothing for you to do.',
  'fix-address-or-remove': 'This is not a passing fault and retrying will not help: change the address, or remove this source.',
  'retry-next-round': 'It is tried again next round by itself; no need to change the address.',
  'blocked-remove-source': 'The site does not let programs read it, and retrying will not help; use another source.',
})

export const SOURCE_STATES = Object.freeze({
  paused: 'Paused',
  never: 'Not fetched yet',
})

export const SOURCE_KINDS = Object.freeze({
  rss: 'RSS',
  arxiv: 'arXiv',
  hn: 'Hacker News',
})

export const NOTE_STATUS = Object.freeze({
  kept: 'Kept',
  authored: 'Written by you',
  archived: 'Archived',
})

export const NO_CONNECTION = Object.freeze({
  text: 'No connection is chosen yet, and this step needs a model.',
  go: 'Go to Settings',
})
