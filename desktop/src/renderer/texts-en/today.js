// English (docs/desktop.md §六) for src/renderer/texts/today.js: the same keys.

export const TODAY = Object.freeze({
  problem: Object.freeze({
    connection: Object.freeze({
      'login-expired': '{name}: the sign-in has expired, so this run did not start. All {n} fetched items are kept.',
      'not-logged-in': '{name}: not signed in yet, so this run did not start. All {n} fetched items are kept.',
      'not-installed': '{name}: it was not found, so this run did not start. All {n} fetched items are kept.',
      'bad-key': 'The API key is not valid, so this run did not start. All {n} fetched items are kept.',
      network: '{name} cannot be reached, so this run did not start. All {n} fetched items are kept.',
      timeout: '{name} took too long to answer, so this run did not start. All {n} fetched items are kept.',
      other: '{name} went wrong, so this run did not start. All {n} fetched items are kept.',
      none: 'No connection is chosen yet, so this run did not start. All {n} fetched items are kept.',
    }),
    fix: Object.freeze({
      login: 'Press “Sign in”, finish signing in in the window that opens, then press “I have signed in, retry”.',
      'not-installed': 'Install it and press “Retry”, or change the connection.',
      'bad-key': 'Enter the API key again in Settings, then press “Retry”.',
      network: 'Press “Retry” once the network is back.',
      timeout: 'Press “Retry” a little later.',
      other: 'Press “Retry” to try again; if it still fails, copy the diagnostics under Settings → About → Advanced and send them to us.',
      none: 'Press “Change connection” to choose one, then press “Retry”.',
    }),
    'not-writable': 'The library folder cannot be written, so this run did not start. Check whether the folder is read-only or in use by another program.',
    index: 'The index cannot be read, so this run did not start. Rebuild the index under Sources & Brief → Advanced settings → Library folder and try again.',
    config: 'The library settings file cannot be read, so this run did not start.',
    login: 'Sign in',
    loginAgain: 'I have signed in, retry',
    loginFailed: 'The sign-in window could not be opened.',
    retry: 'Retry',
    change: 'Change connection',
  }),
})
