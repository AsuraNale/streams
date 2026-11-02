/**
 * The app's identity for Windows: the AppUserModelID and the toast activator CLSID. The packaged app sets both at start
 * (main.mjs), and the installer gives the Start-menu and desktop shortcuts the same two (installer/setup/streams.iss reads
 * them from here through installer/build-installer.mjs). Windows shows a notification under the shortcut that carries the
 * app's ID — the name 「流息」 and its icon — and a click on it goes back to the running app. A development run keeps
 * Electron's own ID and CLSID (no shortcut carries ours there).
 *
 * Why the CLSID is fixed (docs/installer.md): at the first notification of a run, Electron 44 looks at the Start-menu
 * shortcut named after the product, takes over the CLSID that shortcut carries, rewrites the shortcut when its target,
 * working folder, ID or CLSID differ (and makes one when there is none), and registers the CLSID under
 * HKCU\Software\Classes\CLSID\{…}\LocalServer32. Unset, the CLSID is a random one each run — a new registry key every
 * time the shortcut does not already carry one, never removed. With this one on the installer's shortcuts, Electron finds
 * them as it would write them and leaves them alone; the registry key is the one the installer writes (and its
 * uninstaller removes), written again with the same values.
 * @module desktop/main/app-id
 */

/** CompanyName.ProductName, as Microsoft's naming advice for AppUserModelIDs has it. Never change it once shipped. */
export const APP_USER_MODEL_ID = 'StarryDigital.Streams'

/** The toast activator CLSID: one GUID made for this app (2026-11-02), in the brace-wrapped upper-case form Electron
 *  reports back (app.toastActivatorCLSID). Not the installer's AppId (release.json app_guid): a different identity.
 *  Never change it once shipped. */
export const TOAST_ACTIVATOR_CLSID = '{10309C50-6EBE-4E03-AB99-FF685983103D}'
