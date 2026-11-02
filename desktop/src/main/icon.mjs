/**
 * The app's icon file (the icon round, 2026-10-08): desktop/assets/icon/streams.ico, the one file of the icon set the
 * app itself reads. main.mjs gives it to every BrowserWindow (the window's title bar and the taskbar), in development
 * and packaged alike: the packaged app's desktop/ is resources/app, and installer/build-installer.mjs copies the file
 * there at the same relative place — and gives the installer's shortcuts and uninstall entry the same file. The sources
 * (SVG) and the script that renders the .ico are documented in desktop/assets/icon/README.md.
 * @module desktop/main/icon
 */

import { join } from 'node:path'

/** Where the .ico sits below desktop/ (and below resources/app in an install), as path segments. */
export const ICON_FILE = Object.freeze(['assets', 'icon', 'streams.ico'])

/** @param {string} desktopDir - the desktop/ folder (development) or resources/app (packaged) */
export function iconPath(desktopDir) {
  return join(desktopDir, ...ICON_FILE)
}
