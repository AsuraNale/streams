/**
 * v2 package N: an uninstall with its dialogs, as a user runs it (docs/installer.md §五「有界面的卸载」). Every other installer
 * test uninstalls with /VERYSILENT /SUPPRESSMSGBOXES — no window, no question — and on 2026-11-10 the maintainer's own uninstall (a
 * double click on unins000.exe, 「否」 to the question about the app's data) was followed by an uninstall entry that tools
 * still showed (docs/installer.md §十一). This module runs the uninstaller the way he did — no switch but /LOG — and answers its
 * dialogs as he did:
 *
 *   uninstallWithDialogs({ exe, env, log, confirmText, dataQuestion, deleteData, workDir })
 *       starts `exe` (unins000.exe) with only /LOG=<log>, visible, and a watcher (Windows PowerShell 5.1 with a small C#
 *       class, compiled by Add-Type) that follows the uninstaller's process tree — the first phase copies itself into %TEMP%
 *       and hands over to that copy, a child of it — and answers each message box of that tree once:
 *         the box whose text is exactly `confirmText` (Inno Setup's 「您确认要完全移除 … 吗？」 at the start) → 是 (IDYES)
 *         the box whose text is exactly `dataQuestion` (the [Code] question about the app's data)  → 是 when deleteData, else 否
 *         any other box with 是 / 否 (not expected)                                → 否 (the answer that deletes nothing)
 *         a box with only 确定 (Inno Setup's 「已顺利从您的计算机中移除 …。」 at the end, or an error) → 确定
 *       and records each (its title, text, buttons, what was pressed). It ends when the whole tree has gone (or after
 *       timeoutMs). Resolves { exitCode, dialogs, watcherEnd, watcherErr } — the test checks the dialogs in order, so a box
 *       nobody expected (an error) is seen, not hidden.
 *   watchDialogs({ root, confirmText, dataQuestion, deleteData, workDir })
 *       the watcher alone, for an uninstaller started elsewhere (docs/installer.md §十一 used it on one started by Explorer).
 *
 * A message box is a #32770 window; its text is the static control 0xFFFF (MessageBox's own); its buttons are the child
 * controls IDOK 1, IDCANCEL 2, IDYES 6, IDNO 7; pressing one is a WM_COMMAND with that id posted to the box (no focus,
 * no mouse). The watcher looks only at windows of processes in the uninstaller's own tree (Toolhelp's parent ids).
 * @module installer/test/dialogs
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { POWERSHELL } from './machine.mjs'

const q = s => String(s).replace(/'/g, "''")

/**
 * The texts of the three boxes an uninstall shows, as the boxes show them (line breaks \n): Inno Setup's ConfirmUninstall and
 * UninstalledAll from the pinned compiler's ChineseSimplified.isl (next to ISCC.exe), %1 = the app's name; and streams.iss's
 * own question, [CustomMessages] chs.DeleteAppData (%n = a line break).
 * @param {{iscc: string, iss: string, appName: string}} o - ISCC.exe's path, streams.iss's text, AppName
 */
export function uninstallTexts({ iscc, iss, appName }) {
  const isl = readFileSync(join(dirname(iscc), 'Languages', 'ChineseSimplified.isl'), 'utf8')
  const msg = (text, name) => {
    const m = new RegExp(`^${name}=(.*?)\\r?$`, 'm').exec(text)
    if (!m) throw new Error(`no ${name}`)
    return m[1].replace(/%n/g, '\n').replace(/%1/g, appName)
  }
  return { confirm: msg(isl, 'ConfirmUninstall'), done: msg(isl, 'UninstalledAll'), dataQuestion: msg(iss, 'chs\\.DeleteAppData') }
}

const DIALOGS_CS = String.raw`using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace StreamsTestN {
  public static class Dialogs {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint GetDlgItemTextW(IntPtr h, int id, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr h, int id);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h, ref PROCESSENTRY32W e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr h, ref PROCESSENTRY32W e);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32W {
      public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID; public uint th32ModuleID;
      public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }
    // every process ever seen in the uninstaller's tree (by parent id, from root); kept across calls, as a parent that has
    // exited is still the parent id of its children
    static HashSet<uint> known = new HashSet<uint>();
    // the processes of that tree alive now (root included while it lives)
    public static uint[] Alive(uint root) {
      var pairs = new List<uint[]>();
      IntPtr snap = CreateToolhelp32Snapshot(2, 0);
      if (snap == new IntPtr(-1)) return new uint[0];
      var e = new PROCESSENTRY32W(); e.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
      if (Process32FirstW(snap, ref e)) { do { pairs.Add(new uint[] { e.th32ProcessID, e.th32ParentProcessID }); } while (Process32NextW(snap, ref e)); }
      CloseHandle(snap);
      known.Add(root);
      bool grew = true;
      while (grew) { grew = false; foreach (var p in pairs) if (!known.Contains(p[0]) && known.Contains(p[1])) { known.Add(p[0]); grew = true; } }
      var outp = new List<uint>();
      foreach (var p in pairs) if (known.Contains(p[0])) outp.Add(p[0]);
      return outp.ToArray();
    }
    public static int Known() { return known.Count; }
    // the message boxes (#32770) of these processes: "hwnd|pid|b1,b2,..|title|text"
    public static string[] Boxes(uint[] pids) {
      var want = new HashSet<uint>(pids);
      var found = new List<string>();
      EnumWindows((h, l) => {
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (!want.Contains(pid)) return true;
        var cls = new StringBuilder(64); GetClassNameW(h, cls, 64);
        if (cls.ToString() != "#32770") return true;
        var title = new StringBuilder(512); GetWindowTextW(h, title, 512);
        var text = new StringBuilder(4096); GetDlgItemTextW(h, 0xFFFF, text, 4096);
        var buttons = new List<string>();
        foreach (int id in new int[] { 1, 2, 6, 7 }) if (GetDlgItem(h, id) != IntPtr.Zero) buttons.Add(id.ToString());
        found.Add(h.ToInt64().ToString() + "|" + pid + "|" + string.Join(",", buttons.ToArray()) + "|" + title.ToString().Replace("|", " ") + "|" + text.ToString());
        return true;
      }, IntPtr.Zero);
      return found.ToArray();
    }
    public static bool Press(long hwnd, int id) {
      IntPtr h = new IntPtr(hwnd);
      if (!IsWindow(h)) return false;
      return PostMessageW(h, 0x0111, new IntPtr(id), GetDlgItem(h, id));
    }
  }
}
`

// the watcher: one PowerShell run for the whole uninstall; one JSON line per box answered, then {"end": …}
const watcher = ({ source, root, confirmText, dataQuestion, deleteData, timeoutMs }) => `
$ErrorActionPreference = 'Stop'
Add-Type -Path '${q(source)}'
$root = [uint32]${root}
$confirm = '${q(confirmText.replace(/\r\n/g, '\n'))}'
$question = '${q(dataQuestion.replace(/\r\n/g, '\n'))}'
$answer = ${deleteData ? 6 : 7}
$done = @{}
$deadline = (Get-Date).AddMilliseconds(${timeoutMs})
$goneAt = $null
$timedOut = $true
while ((Get-Date) -lt $deadline) {
  $alive = @([StreamsTestN.Dialogs]::Alive($root))
  if ($alive.Count -gt 0) {
    $goneAt = $null
    foreach ($b in [StreamsTestN.Dialogs]::Boxes([uint32[]]$alive)) {
      $p = $b.Split('|', 5)
      $h = [int64]$p[0]
      if ($done.ContainsKey($h)) { continue }
      $buttons = @($p[2].Split(',') | Where-Object { $_ -ne '' } | ForEach-Object { [int]$_ })
      $text = $p[4].Replace([string][char]13 + [char]10, [string][char]10)
      if ($text -eq '' -and $buttons.Count -eq 0) { continue }
      if ($text -ceq $question) { $press = $answer }
      elseif ($text -ceq $confirm) { $press = 6 }
      elseif (($buttons -contains 6) -and ($buttons -contains 7)) { $press = 7 }
      elseif ($buttons -contains 1) { $press = 1 }
      else { $press = 2 }
      Start-Sleep -Milliseconds 300
      $ok = [StreamsTestN.Dialogs]::Press($h, $press)
      $done[$h] = $true
      [Console]::Out.WriteLine((@{ pid = [int]$p[1]; title = $p[3]; text = $text; buttons = $buttons; pressed = $press; posted = $ok } | ConvertTo-Json -Compress))
    }
  } else {
    if ($goneAt -eq $null) { $goneAt = Get-Date }
    elseif (((Get-Date) - $goneAt).TotalMilliseconds -gt 2000) { $timedOut = $false; break }
  }
  Start-Sleep -Milliseconds 200
}
[Console]::Out.WriteLine((@{ end = $true; timedOut = $timedOut; processes = [StreamsTestN.Dialogs]::Known() } | ConvertTo-Json -Compress))
`

/**
 * @param {object} o
 * @param {string} o.exe - the install folder's unins000.exe
 * @param {NodeJS.ProcessEnv} o.env - the uninstaller's environment (a test's user folders: {userappdata} resolves there)
 * @param {string} o.log - /LOG= file
 * @param {string} o.confirmText - Inno Setup's ConfirmUninstall as the box shows it (the language file's, %1 = the app's name)
 * @param {string} o.dataQuestion - the [Code] question's text as the box shows it (CustomMessage DeleteAppData, %n = line break)
 * @param {boolean} o.deleteData - the answer to it: 是 (true) or 否 (false)
 * @param {string} o.workDir - a folder of the test's own (the C# source goes there)
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{exitCode: number|null, dialogs: Array<{pid: number, title: string, text: string, buttons: number[], pressed: number, posted: boolean}>, watcherEnd: object|null, watcherErr: string}>}
 */
export async function uninstallWithDialogs({ exe, env, log, confirmText, dataQuestion, deleteData, workDir, timeoutMs = 180_000 }) {
  // visible, as a double click starts it; no switch but the log
  const child = spawn(exe, [`/LOG=${log}`], { env, windowsHide: false, stdio: 'ignore' })
  const exited = new Promise(r => child.on('exit', code => r(code)))
  const watched = await watchDialogs({ root: child.pid, confirmText, dataQuestion, deleteData, workDir, timeoutMs })
  return { exitCode: await exited, ...watched }
}

/**
 * The watcher alone, for a process tree started elsewhere (its root's process id): answers and records its message boxes as
 * uninstallWithDialogs does, until the tree has gone.
 * @param {{root: number, confirmText: string, dataQuestion: string, deleteData: boolean, workDir: string, timeoutMs?: number}} o
 */
export async function watchDialogs({ root, confirmText, dataQuestion, deleteData, workDir, timeoutMs = 180_000 }) {
  if (![confirmText, dataQuestion].every(t => typeof t === 'string' && t.length > 0)) throw new TypeError('watchDialogs: the two texts it answers are needed')
  const source = join(workDir, 'uninstall-dialogs.cs')
  if (!existsSync(source)) writeFileSync(source, DIALOGS_CS)
  const script = watcher({ source, root, confirmText, dataQuestion, deleteData, timeoutMs })
  const w = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`], { windowsHide: true })
  let out = ''
  let err = ''
  w.stdout.setEncoding('utf8').on('data', d => { out += d })
  w.stderr.setEncoding('utf8').on('data', d => { err += d })
  await new Promise(r => w.on('exit', r))
  const rows = out.split(/\r?\n/).filter(l => l.startsWith('{')).map(l => JSON.parse(l))
  const end = rows.find(r => r.end) ?? null
  const dialogs = rows.filter(r => !r.end).map(({ posted, pid, ...r }) => ({ ...r, buttons: Array.isArray(r.buttons) ? r.buttons : [r.buttons], posted, pid }))
  return { dialogs, watcherEnd: end, watcherErr: err.trim() }
}
