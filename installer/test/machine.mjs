/**
 * What the installer tests read of this machine (docs/installer.md §五), and the guard every installing test starts with:
 *
 *   uninstallEntry(guid)      the HKCU uninstall entry {guid}_is1 (DisplayName, DisplayVersion, Publisher, InstallLocation,
 *                             UninstallString, QuietUninstallString, DisplayIcon), or null
 *   entriesNamed(re)          every HKCU uninstall entry whose DisplayName matches (to count Streams' entries)
 *   shortcut(path)            a .lnk's target, working folder, icon, AppUserModelID and toast activator CLSID, or null
 *   asElectronReadsIt(path)   the same through IShellLink and its property store, with the PROPVARIANT types (Electron 44
 *                             keeps a Start-menu shortcut only when the ID is a VT_LPWSTR and the CLSID a VT_CLSID)
 *   toastKey(clsid)           HKCU\Software\Classes\CLSID\{clsid}: its default value, CustomActivator, LocalServer32
 *   realInstallTraces(o)      the guard's picture: the app's uninstall entry, its two shortcuts, its toast activator key
 *   picture(root)             names, sizes and times of everything below a folder (nothing read inside files)
 *   processesUnder(dir) / endProcesses(rows)
 *
 * The registry and the shortcuts are read with Windows PowerShell 5.1 (the one every Windows has). Note: a shell that
 * runs inside a packaged desktop app may see that app's private registry view (docs/installer.md §九); the tests write and
 * read through the same view, so they agree with themselves.
 * @module installer/test/machine
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
export const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
export const VT_LPWSTR = 31
export const VT_CLSID = 72
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
const q = s => String(s).replace(/'/g, "''")

export function ps(script, { env } = {}) {
  const r = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { encoding: 'utf8', windowsHide: true, timeout: 120_000, env: env ?? process.env })
  if (r.status !== 0) throw new Error(`powershell: ${r.stderr || r.stdout}`)
  return r.stdout.trim()
}

/** A known folder as Windows resolves it for an environment (USERPROFILE etc. move the ones defined through them). */
export const shellFolder = (name, env) => ps(`[Environment]::GetFolderPath('${name}', 'DoNotVerify')`, { env })

const UNINSTALL = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
export const uninstallKey = guid => `${UNINSTALL}\\{${guid}}_is1`

export function uninstallEntry(guid) {
  const key = uninstallKey(guid)
  const out = ps(`if (Test-Path -LiteralPath '${q(key)}') { Get-ItemProperty -LiteralPath '${q(key)}' | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString, QuietUninstallString, DisplayIcon, MajorVersion, MinorVersion | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}

/** Every HKCU uninstall entry whose DisplayName matches `re`: [{ key, DisplayName, DisplayVersion, InstallLocation }]. */
export function entriesNamed(re) {
  const out = ps(`Get-ChildItem -LiteralPath '${UNINSTALL}' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty -LiteralPath $_.PSPath; [pscustomobject]@{ key = $_.PSChildName; DisplayName = [string]$p.DisplayName; DisplayVersion = [string]$p.DisplayVersion; InstallLocation = [string]$p.InstallLocation } } | ConvertTo-Json -Compress`)
  if (!out) return []
  const rows = JSON.parse(out)
  return (Array.isArray(rows) ? rows : [rows]).filter(r => re.test(r.DisplayName))
}

export const shortcut = path => (existsSync(path)
  ? JSON.parse(ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${q(path)}'); $i = (New-Object -ComObject Shell.Application).NameSpace('${q(dirname(path))}').ParseName('${q(path.split(sep).pop())}'); @{ target = $s.TargetPath; workdir = $s.WorkingDirectory; icon = $s.IconLocation; aumid = [string]$i.ExtendedProperty('System.AppUserModel.ID'); clsid = [string]$i.ExtendedProperty('System.AppUserModel.ToastActivatorCLSID') } | ConvertTo-Json -Compress`))
  : null)

// A shortcut as Electron 44 reads it before deciding whether to rewrite it (windows_toast_activator.cc): through IShellLink
// and the link's IPropertyStore, the raw target, the working folder, and AppUserModel.ID and ToastActivatorCLSID with their
// PROPVARIANT types. C#, compiled by PowerShell's Add-Type; the file is opened read-only.
const LINK_READER = String.raw`using System;
using System.Runtime.InteropServices;
using System.Text;
namespace StreamsTest {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey { public Guid fmtid; public uint pid; public PropertyKey(Guid f, uint p) { fmtid = f; pid = p; } }
  [StructLayout(LayoutKind.Explicit, Size = 24)]
  public struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr ppidl); void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
  }
  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPersistFile {
    void GetClassID(out Guid c); [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint mode);
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    void GetCount(out uint c); void GetAt(uint i, out PropertyKey k);
    void GetValue(ref PropertyKey k, out PropVariant v);
  }
  public static class LinkReader {
    public static string[] Read(string path) {
      object o = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
      ((IPersistFile)o).Load(path, 0);
      var link = (IShellLinkW)o;
      var target = new StringBuilder(1024); link.GetPath(target, 1024, IntPtr.Zero, 4);
      var dir = new StringBuilder(1024); link.GetWorkingDirectory(dir, 1024);
      var store = (IPropertyStore)o;
      var group = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
      var idKey = new PropertyKey(group, 5); var clsidKey = new PropertyKey(group, 26);
      PropVariant id, clsid; store.GetValue(ref idKey, out id); store.GetValue(ref clsidKey, out clsid);
      string idText = (id.vt == 31 || id.vt == 8) && id.p != IntPtr.Zero ? Marshal.PtrToStringUni(id.p) : "";
      string clsidText = clsid.vt == 72 && clsid.p != IntPtr.Zero ? ((Guid)Marshal.PtrToStructure(clsid.p, typeof(Guid))).ToString("B").ToUpperInvariant() : "";
      return new string[] { target.ToString(), dir.ToString(), id.vt.ToString(), idText, clsid.vt.ToString(), clsidText };
    }
  }
}
`
/** @param {string} path - the .lnk @param {string} workDir - a folder of the test's own, for the C# source */
export function asElectronReadsIt(path, workDir) {
  const source = join(workDir, 'link-reader.cs')
  if (!existsSync(source)) writeFileSync(source, LINK_READER)
  return JSON.parse(ps(`Add-Type -Path '${q(source)}'; $r = [StreamsTest.LinkReader]::Read('${q(path)}'); @{ target = $r[0]; workdir = $r[1]; aumidType = [int]$r[2]; aumid = $r[3]; clsidType = [int]$r[4]; clsid = $r[5] } | ConvertTo-Json -Compress`))
}

/** The app's toast activator key: its default value, CustomActivator and LocalServer32's default, or null. */
export function toastKey(clsid) {
  const key = `HKCU:\\Software\\Classes\\CLSID\\${clsid}`
  const out = ps(`if (Test-Path -LiteralPath '${q(key)}') { $k = Get-Item -LiteralPath '${q(key)}'; $l = Get-Item -LiteralPath '${q(key)}\\LocalServer32' -ErrorAction SilentlyContinue; @{ name = $k.GetValue(''); customActivator = $k.GetValue('CustomActivator'); localServer = $(if ($l) { $l.GetValue('') } else { $null }) } | ConvertTo-Json -Compress } else { 'none' }`)
  return out === 'none' ? null : JSON.parse(out)
}

/**
 * A real install's traces, read only: the uninstall entry, the Start-menu and desktop shortcuts of the user this test runs
 * as, the toast activator key. The guard: any of them there → the installing test does not run.
 */
export function realInstallTraces({ guid, appName, clsid }) {
  const startMenu = join(shellFolder('Programs'), `${appName}.lnk`)
  const desktop = join(shellFolder('DesktopDirectory'), `${appName}.lnk`)
  return { startMenuPath: startMenu, desktopPath: desktop, entry: uninstallEntry(guid), startMenu: existsSync(startMenu), desktop: existsSync(desktop), toastKey: toastKey(clsid) }
}

/** What in a picture of realInstallTraces says "installed here": [] when nothing. */
export const installedHere = t => [t.entry && 'its uninstall entry', t.startMenu && t.startMenuPath, t.desktop && t.desktopPath, t.toastKey && 'its toast activator key'].filter(Boolean)

/** Names, sizes and times of everything below `root` (nothing read inside files; links not followed); null when absent. */
export function picture(root) {
  if (!existsSync(root)) return null
  const out = []
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      const st = lstatSync(p)
      out.push(`${relative(root, p)}|${st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : st.size}|${Math.round(st.mtimeMs)}`)
      if (st.isDirectory() && !st.isSymbolicLink()) walk(p)
    }
  }
  walk(root)
  return out.sort()
}

export function sha256File(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }

export function* walkFiles(root, dir = root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) yield { path: p, link: true }
    else if (st.isDirectory()) yield* walkFiles(root, p)
    else yield { path: p, link: false }
  }
}

/** The files below `root` as { relative/path: absolute path }, and the links found. */
export function filesOf(root) {
  const files = new Map()
  const links = []
  for (const f of walkFiles(root)) {
    if (f.link) { links.push(relative(root, f.path)); continue }
    files.set(relative(root, f.path).split(sep).join('/'), f.path)
  }
  return { files, links }
}

/** Processes whose executable lies under `dir` (the installed app and anything it started from there). */
export function processesUnder(dir) {
  const out = ps(`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('${q(resolve(dir).toLowerCase())}') } | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json -Compress`)
  if (!out) return []
  const rows = JSON.parse(out)
  return Array.isArray(rows) ? rows : [rows]
}

export function endProcesses(rows) {
  for (const p of rows) spawnSync(join(SYSTEM32, 'taskkill.exe'), ['/PID', String(p.ProcessId), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
}

/** An icon reference ("path,index") without its index. */
export const iconFileOf = ref => String(ref ?? '').replace(/,-?\d+$/, '')

/** The size of a file, or -1. */
export const sizeOf = p => { try { return statSync(p).size } catch { return -1 } }
