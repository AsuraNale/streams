// English (docs/desktop.md §六) for src/renderer/texts/common.js: the same export names and keys, served in its place by
// app://ui/ while the app runs in English (test/texts-en.test.mjs keeps the two tables parallel). No Chinese character in
// this folder. Plurals: '{n} item{n?|s}' (lib/format.js).

export const BRAND = Object.freeze({
  mark: 'S',
  name: 'Streams',
  tagline: 'Personal library',
  htmlLang: 'en',
})

export const SIDEBAR = Object.freeze({
  label: 'Navigation',
  entries: Object.freeze({
    shelf: 'Shelf',
    chat: 'Main agent',
  }),
  settings: 'Settings',
  noLibrary: 'No library open',
  libraryLabel: 'Current library',
  inboxBadge: '{n} item{n?|s} to review',
})

export const SEP = ' · '

// a moment with its time (lib/format.js whenText) and just the day (dayText); {mon} is the month's short name (Oct)
export const WHEN = Object.freeze({ today: 'Today {hm}', yesterday: 'Yesterday {hm}', date: '{mon} {d} {hm}' })
export const DAY = Object.freeze({ today: 'Today', yesterday: 'Yesterday', date: '{mon} {d}' })
export const NEXT_WHEN = Object.freeze({ today: 'today {hm}', tomorrow: 'tomorrow {hm}', date: '{mon} {d} {hm}' })

export const ERRORS = Object.freeze({
  retry: 'Retry',
  failed: 'Something went wrong. Try again.',
  noLibrary: 'No library is open.',
})

export const FETCH_STATES = Object.freeze({
  ok: 'OK',
  empty: 'No updates',
  gap: 'Invalid address',
  failed: 'Temporary failure',
  blocked: 'Access denied',
  // 1.1 W2 (B8)
  login: 'Sign-in required',
})

export const CONNECTIONS = Object.freeze({
  names: Object.freeze({
    'claude-code': 'Connect the Claude Code on this computer',
    codex: 'Connect the Codex on this computer',
    api: 'Enter API key',
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
    note: 'A terminal window opens and the tool signs in by itself; Streams never handles your account or password',
    again: 'Signed in? Check again',
    failed: 'The sign-in window could not be opened.',
  }),
  probe: Object.freeze({
    trying: 'Testing the connection…',
    ok: 'Test result: usable · {seconds} s · counted against your plan',
    failed: 'Test result: failed · {reason}',
  }),
  defaultModel: 'Default',
  sameAsMain: 'Same as the main model',
  codes: Object.freeze({
    'not-installed': 'tool not found',
    'not-logged-in': 'not signed in',
    'login-expired': 'sign-in expired',
    'bad-key': 'invalid key',
    'bad-model': 'invalid model name',
    'rate-limited': 'too many requests',
    network: 'network unavailable',
    timeout: 'timed out',
    'bad-format': 'unexpected response format',
    refused: 'request declined',
    unknown: 'unknown error',
  }),
})

export const ROUND_PHASES = Object.freeze({
  done: 'done',
  update: 'updating',
})

// ---- 11-03 plan B ----

export const FETCH_HINTS = Object.freeze({
  none: 'No action needed.',
  'fix-address-or-remove': 'This address is not valid, so retrying will not help. Change the address or remove this source.',
  'retry-next-round': 'Streams tries again on the next run. There is no need to change the address.',
  'blocked-remove-source': 'This site does not allow programs to read it, so retrying will not help. Use a different source.',
  'login-not-supported': 'This site needs you to sign in before it can be read, and this version of Streams cannot read such sites. Use a different source.',
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
  authored: 'My notes',
  archived: 'Archived',
})

export const NO_CONNECTION = Object.freeze({
  text: 'No connection is selected. This action requires a model.',
  go: 'Go to Settings',
})

/** Redesign R6b-3: the punctuation the screens put between pieces of text themselves (see texts/common.js PUNCT). */
export const PUNCT = Object.freeze({
  open: ' (',
  close: ')',
  colon: ': ',
  list: ', ',
  semi: '; ',
  comma: ', ',
})

export const SCHEDULE = Object.freeze({
  every: Object.freeze({ day: 'Every day', weekdays: 'Weekdays', week: 'Every week', month: 'Every month' }),
  weekdays: Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']),
  week: 'Every {days}',
  daysSep: ', ',
  month: 'Monthly on day {n}',
  tagOn: '{when} at {time}',
  tagOff: 'No schedule',
})
