// English (docs/desktop.md §六) for src/renderer/texts/today.js: the same keys.

export const TODAY = Object.freeze({
  problem: Object.freeze({
    connection: Object.freeze({
      'login-expired': '{name}: the sign-in has expired, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      'not-logged-in': '{name}: not signed in, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      'not-installed': '{name} was not found, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      'bad-key': 'The API key is not valid, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      network: '{name} cannot be reached, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      timeout: '{name} took too long to answer, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      other: '{name} had a connection problem, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
      none: 'No connection has been chosen, so this run did not start. The {n} fetched item{n?|s} {n?is|are} retained.',
    }),
    fix: Object.freeze({
      login: 'Press “Sign in”, finish signing in in the window that opens, then press “I have signed in, retry”.',
      'not-installed': 'Install the tool and press “Retry”, or switch the connection.',
      'bad-key': 'Enter the API key again in Settings, then press “Retry”.',
      network: 'Press “Retry” once the network is back.',
      timeout: 'Press “Retry” a little later.',
      other: 'Press “Retry”; if it still fails, copy the diagnostics under Settings → About → Advanced and send them to the developer.',
      none: 'Press “Switch connection” to choose one, then press “Retry”.',
    }),
    'not-writable': 'The library folder cannot be written, so this run did not start. Check whether the folder is read-only or in use by another program.',
    index: 'The index cannot be read, so this run did not start. Rebuild the index under Sources & Brief → Advanced settings → Library folder and try again.',
    'needs-build': 'This library was made by the last version and is no longer updated the old way, so this run did not start. To keep it updated, go to Sources & Brief, press Check the sources again, and confirm the new library card. Notes, the library and Ask work as before.',
    'update-not-supported': 'This connection cannot update, so this update did not start. In Settings, choose “{cc}”, “{cx}”, or an API key with the model\'s key.',
    rebuild: 'Check the sources again',
    config: 'The library settings file cannot be read, so this run did not start.',
    login: 'Sign in',
    loginAgain: 'I have signed in, retry',
    loginFailed: 'The sign-in window could not be opened.',
    retry: 'Retry',
    change: 'Switch connection',
  }),
})
