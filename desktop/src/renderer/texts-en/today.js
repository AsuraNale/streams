// English (docs/desktop.md §六) for src/renderer/texts/today.js: the same keys.

export const TODAY = Object.freeze({
  title: 'Today',
  nextRun: Object.freeze({
    none: 'Schedule off',
    at: 'Next run {when}',
  }),
  connection: 'Connection: {name} · {model}',
  connectionDefault: 'Connection: {name} · default model',
  noConnection: 'No connection: fetching only, no scoring',
  loadFailed: "Today's numbers could not be read.",
  // plan C8: from NO_OUTPUT_ROUNDS (the core's) rounds in a row that put nothing into the inbox (getHome().numbers.noOutputStreak)
  noOutput: Object.freeze({
    text: 'No new items in the Inbox in {n} runs in a row.',
    hint: 'Check whether the sources have updates, or whether the pass thresholds are set too high.',
    go: 'View run status',
  }),

  numbers: Object.freeze({
    inbox: 'In the inbox',
    inboxOld: 'the oldest has waited {n} day{n?|s}',
    caught: 'Fetched today',
    passed: 'Passed into the inbox',
    kept: 'Kept',
  }),

  sources: Object.freeze({
    failed: '{n} of {total} source{total?|s} failed for now: {names}. They are tried again next round; no address to fix.',
    gap: '{n} of {total} source{total?|s} with an address problem: {names}. Fix the address, or remove the source.',
    blocked: '{n} of {total} source{total?|s} blocked by the site: {names}. Use another source.',
    go: 'See sources and brief',
  }),

  problem: Object.freeze({
    connection: Object.freeze({
      'login-expired': 'The sign-in of {name} has expired, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      'not-logged-in': '{name} is not signed in, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      'not-installed': '{name}: it was not found, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      'bad-key': 'The API key is wrong, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      network: '{name} could not be reached, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      timeout: '{name} gave no answer in time, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      other: '{name} ran into an error ({code}), so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
      none: 'No connection is chosen yet, so this round did not score. The {n} fetched item{n?|s} are all there; nothing is lost.',
    }),
    fix: Object.freeze({
      login: 'Click "Sign in", finish in the window that opens, then click "Score again". Or switch to another connection first.',
      'not-installed': 'Install it and click "Score again", or switch to another connection.',
      'bad-key': 'Enter the key again in Settings, then click "Score again".',
      network: 'Once the network is back, click "Score again".',
      timeout: 'Wait a moment, then click "Score again".',
      other: 'Click "Score again"; if it still fails, copy the diagnostics and send them to us.',
      none: 'Click "Switch connection" to choose one, then "Score again".',
    }),
    'not-writable': 'The library folder cannot be written to, so this round did not start. Check whether the folder is read-only or held by another program.',
    index: 'The index could not be read, so this round did not start. Click "Rebuild the index" in Settings and try again.',
    config: "The library's settings file could not be read, so this round did not start.",
    retry: 'Score again',
    change: 'Switch connection',
    copy: 'Copy diagnostics',
    copied: 'Copied.',
  }),

  round: Object.freeze({
    title: 'Last run · {when}',
    none: 'Not run yet. Click “Run now” in the header to start.',
    fetch: 'Fetched {n} source{n?|s}: {lines}',
    fetchLine: '{n} {state}',
    dedup: '{fetched} fetched, {new} new after dedup',
    node: '{name}: {passed} passed · {failed} filtered out',
    nodeUnscored: ' · {n} not scored',
    summary: '{n} summarized',
    inbox: '{n} into the inbox',
    calls: '{n} model call{n?|s}',
    stopped: Object.freeze({
      cap: 'Stopped at the per-run cap; the rest waits for the next run',
      aborted: 'Stopped manually; the rest waits for the next run',
      connection: 'Stopped on a connection error; the rest waits for the next run',
    }),
  }),

  progress: Object.freeze({
    title: 'This run is in progress',
    phase: '{phase}',
    calls: 'Model calls {calls} / {cap}',
    stop: 'Stop',
    stopping: 'Stopping after this item…',
  }),

  recent: Object.freeze({
    title: 'Recently kept',
    none: 'Nothing kept yet.',
    line: '{source} · {date}',
  }),
})
