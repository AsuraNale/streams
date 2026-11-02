/**
 * The update's clean-up list (work order 08; installer/setup/streams.iss [InstallDelete]; docs/installer.md §十一 11.1): every
 * entry at the top of the stage, so that installing over an older copy first removes that copy's program files of those
 * names — the folders (resources\, locales\) go whole, so a file the old version had in them and this one has not cannot stay
 * behind and be loaded; a file at the top that only an older version had (a name this stage no longer has) is not on the list
 * and stays (docs/installer.md 11.5). Made from the stage itself, so it follows whatever the stage holds. Only the stage's
 * own names: the uninstaller (unins000.exe / .dat, written at install time, never in the stage) and anything else in the
 * folder stay, and every name is one plain name (no path, no wildcard, nothing outside {app}). Each entry runs only when the
 * folder holds the copy this app's uninstall entry names ([Code] OldCopyHere, decided once before the first entry deletes
 * anything — the list itself removes Streams.exe, which that question looks at).
 *
 * Used by installer/build-installer.mjs (installer/dist/install-delete.iss) and by installer/test/install-delete.test.mjs
 * (the same list for a small stage, compiled into the same streams.iss and run).
 */
import { readdirSync } from 'node:fs'

/** The Check every entry carries ([Code] in installer/setup/streams.iss). */
export const INSTALL_DELETE_CHECK = 'OldCopyHere'

/**
 * @param {string} stageDir - the stage (what the installer installs into {app})
 * @returns {{entries: {name: string, dir: boolean}[], text: string}} the text is the [InstallDelete] entries to #include
 * @throws {Error} the stage is empty, or has a top-level name the list does not write (not one plain name, or unins*)
 */
export function installDeleteList(stageDir) {
  const entries = readdirSync(stageDir, { withFileTypes: true }).map(e => ({ name: e.name, dir: e.isDirectory() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (!entries.length) throw new Error('the stage is empty: nothing for the update to replace')
  for (const e of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(e.name) || e.name.includes('..')) throw new Error(`the stage has a top-level name the update's clean-up does not write: ${e.name}`)
    if (/^unins/i.test(e.name)) throw new Error(`the stage has ${e.name} at its top: the uninstaller's name, never removed by an update`)
  }
  const lines = entries.map(e => `Type: ${e.dir ? 'filesandordirs' : 'files'}; Name: "{app}\\${e.name}"; Check: ${INSTALL_DELETE_CHECK}`)
  return { entries, text: `; made by installer/build-installer.mjs from the stage's top level (installer/install-delete.mjs): do not edit\n${lines.join('\n')}\n` }
}
