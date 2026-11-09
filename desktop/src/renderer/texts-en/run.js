// English (docs/desktop.md §六) for src/renderer/texts/run.js: the same keys.

export const RUN = Object.freeze({
  title: 'Run a round',
  heading: 'What it is going to do',
  loadFailed: 'The estimate could not be made.',
  rows: Object.freeze({
    fetch: 'Fetch',
    fetchValue: '{n} source{n?|s} ({paused} paused)',
    items: 'New items expected',
    itemsValue: 'About {lo}–{hi} (from the last {rounds} round{rounds?|s})',
    itemsNone: 'No round yet, nothing to go on',
    calls: 'Model calls',
    callsValue: 'About {lo}–{hi}: relevance once per item, substance and the summary only for what passed',
    using: 'Using',
    usingValue: '{name} · main model {model} · checking {verify} · counted against your own plan',
    usingNone: 'No connection: fetching only, everything goes to the inbox unscored',
    cap: 'Per round at most',
    capValue: '{cap} calls; it stops there and the rest waits for next time',
  }),
  start: 'Start',
  cancel: 'Cancel',
  changeCap: 'Change the limit',
  capLabel: 'Calls per round at most',
  saveCap: 'Save',
  capBad: 'The limit must be a whole number above zero.',
  note: 'You can close the window after starting; the progress is on the Overview of this library. Items that fail midway stay in the queue for next time.',
  failed: 'Could not start.',
})
