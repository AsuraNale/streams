// English (docs/desktop.md §六) for src/renderer/texts/status.js: the same exports and keys.

export const STATUS = Object.freeze({
  title: 'Is this library healthy',
  loadFailed: 'The status could not be read.',
  copy: 'Copy diagnostics',
  copied: 'Copied.',
  logs: 'Open the run records folder',
  failed: 'That did not work. You can try again.',

  numbers: Object.freeze({
    lastRun: 'Last run · {n} item{n?|s} out',
    lastRunLabel: 'Last run',
    lastRunNone: 'Not run yet',
    lastDecision: 'Your last decision',
    lastDecisionNone: 'None yet',
    monthCalls: 'Calls this month',
    nextRun: 'Next run',
    nextRunNone: 'No timer set yet',
  }),

  connections: Object.freeze({
    heading: 'Connections',
    active: 'in use',
    spare: 'spare',
    models: '{model} / check {verify}',
    probedAt: 'tried once {when}',
    probe: 'Try it now',
    apiNone: 'Enter a key in Settings',
    goSettings: 'Go to Settings',
    notInstalled: 'Not found; install it, then press Detect again.',
    redetect: 'Detect again',
    loadFailed: 'The connections could not be read.',
  }),

  sources: Object.freeze({
    heading: 'Sources (last round)',
    none: 'No sources yet.',
    state: '{state} · {n} item{n?|s}',
    streak: '{state} · HTTP {http} · {n} round{n?|s} in a row',
    streakNoHttp: '{state} · {n} round{n?|s} in a row',
    ok: 'OK {n} round{n?|s} in a row',
    empty: 'Last read fine: {date}; nothing new is not a fault.',
    emptyNoDate: 'Read fine, just nothing new; not a fault.',
    failed: 'Tried again next round by itself; if it keeps failing you will be told to pause it.',
    gap: 'Retrying will not help: change the address or remove it.',
    blocked: 'The site does not let programs read it, and retrying will not help: use another source or remove it.',
    paused: 'You paused it; it is not fetched until you resume it.',
    never: 'The next round fetches it for the first time.',
    fix: 'Deal with it',
  }),
})
