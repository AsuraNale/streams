// English (docs/desktop.md §六) for src/renderer/texts/run.js: the same keys.

export const RUN = Object.freeze({
  last: 'Last run · {when} · {n} new in the Inbox',
  lastStopped: 'Last run · {when} · not finished · {n} new in the Inbox',
  lastHere: 'This library’s last run · {when} · {n} new in the Inbox',
  lastHereStopped: 'This library’s last run · {when} · not finished · {n} new in the Inbox',
  none: 'No runs yet. Select Run now at the top to start one.',
  lastHereNone: 'This library has not run yet',

  current: 'This run · started {when} · {why}',
  steps: Object.freeze({
    sources: 'Read the sources',
    originals: 'Fetch originals of new articles',
    agent: 'The update agent picks and summarizes by the card',
    check: 'Check the summaries',
  }),
  live: Object.freeze({
    sources: '{done} / {total}',
    originals: '{done} / {total}, {kept} stored',
    agent: '{searches} searches, {reads} pages read',
    check: '{done} / {total}',
  }),
  noSearch: 'Search isn\'t available for this run because no search service is set up. To enable it, add a DeepSeek search key in Settings.',
  usuallyFirst: 'A first update usually takes 2–6 minutes. You can leave this page; you\'ll be notified when it\'s done.',
  usuallyLast: 'This library\'s last update took {min} minutes. You can leave this page; you\'ll be notified when it\'s done.',
  stepsDone: '{done} / {total} steps complete',
  stepNow: 'Current step: {step}',
  stop: 'Stop',
  stopping: 'Stopping',
  chipNoCap: 'Running: {phase} · model calls {calls}',
})
