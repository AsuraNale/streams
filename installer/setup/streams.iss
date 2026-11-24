; The Windows installer of Streams (W7, work order 06). Compiled only by installer/build-installer.mjs, which passes
; every #define below (ISCC -D...) and the script itself on standard input, as UTF-8 (Inno Setup 7 reads a script from
; stdin as UTF-8): this file stays UTF-8 without a byte-order mark, like the rest of the repository. See docs/installer.md.
;
; Per user, no administrator rights: %LOCALAPPDATA%\Programs\Streams by default ({autopf} in a non-administrative
; install), the shortcuts in the user's own Start menu and desktop, the uninstall entry under HKCU (Settings → Apps).
; The icon (desktop/assets/icon/streams.ico, staged at {#IconFile} below the install folder): the setup program's own
; (SetupIconFile, a build-machine path), the uninstall entry's and both shortcuts' (IconFilename). Streams.exe carries
; the same icon in its resources (the build runs rcedit on it), so Explorer shows it too. Every name, the version and the
; copyright line come from installer/setup/release.json through the defines: the setup program and Streams.exe say the same.
; Uninstalling removes the program files only; the library folder is never touched; the app's data
; (%APPDATA%\Streams: the keys, settings; %LOCALAPPDATA%\Streams: caches) stays unless the user says yes
; to the one question at the end (default: no; a silent uninstall keeps it). The one registry key besides the uninstall
; entry — the notification activator's, [Registry] below — goes with the program.
; Updating (work order 08, docs/installer.md §十一): a newer setup program with the same AppId installs over the copy that
; is there — the uninstall entry, the shortcuts, the notification ID, the app's data and the projects stay. [InstallDelete]
; first removes the older copy's program files (the names at the stage's top level, from installer/dist/install-delete.iss;
; only when the folder holds the copy this app's uninstall entry names — decided once, before the first entry deletes
; anything: [Code] OldCopyHere), so nothing of the old version stays behind below
; resources\ and locales\ (a top-level file only an older version had is not on the list: docs/installer.md 11.5); [Run]
; opens Streams again when the app itself started the update (/STRELAUNCH=1, desktop/src/main/services/update.mjs); after the
; install [Code] UninstallEntryVersion makes sure the uninstall entry shows this version (docs/installer.md 11.6). The
; handshake: the app also passes /STWAITPID=<its process id>, and [Code] PrepareToInstall waits (at most
; {#WaitPidTimeoutMs} ms) for that process to have exited before the Restart Manager looks for programs holding our files.

#ifndef StageDir
  #error StageDir is not defined: build with node installer/build-installer.mjs
#endif
#ifndef InstallDeleteFile
  #error InstallDeleteFile is not defined: build with node installer/build-installer.mjs
#endif
; the handshake's limit ([Code] WaitForTheApp): how long the setup program waits for the app that started it to exit.
; The build does not set it (60 s); installer/test/wait-pid.test.mjs compiles a shorter one to see the time-out
#ifndef WaitPidTimeoutMs
  #define WaitPidTimeoutMs 60000
#endif
; 1.1 W12: once the app's own process has exited, how long the setup program waits for the app's program file to be free —
; the app's other processes (Chromium's, which end a moment after it) still have it open ([Code] WaitForTheAppsProcesses)
#ifndef WaitOthersTimeoutMs
  #define WaitOthersTimeoutMs 10000
#endif

[Setup]
AppId={{{#AppGuid}}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppVerName}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}.0
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
VersionInfoDescription={#AppVerName}
VersionInfoCompany={#AppPublisher}
; release.json's copyright, the same line rcedit puts in Streams.exe (the compiler writes "(C)" as the © sign)
VersionInfoCopyright={#AppCopyright}
DefaultDirName={autopf}\{#InstallFolder}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2/max
SolidCompression=yes
LZMANumBlockThreads=4
WizardStyle=modern
ShowLanguageDialog=no
SetupIconFile={#SetupIconFile}
UninstallDisplayName={#AppVerName}
UninstallDisplayIcon={app}\{#IconFile}
CloseApplications=yes
RestartApplications=no
UsedUserAreasWarning=no
TimeStampsInUTC=yes
; no log by default (an update's log is 9–13 MB in %TEMP% that Inno Setup never removes); a run given /LOG=<file> still
; writes one. 0.2.2 briefly had SetupLogging=yes to explain a 2026-10-13 entry that seemed left at the old version; it
; was not (the tools that read it see the Claude desktop app's private registry view; docs/installer.md 11.6)
SetupLogging=no

[Languages]
Name: "chs"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
chs.DeleteAppData=是否同时删除流息的应用数据？%n%n应用数据包括 API key、设置、库的登记、主 Agent 的对话记录、日志和缓存。你的库（Markdown 文件夹）不会被删除，你电脑上别的程序（例如 Claude Code、Codex）的登录也不受影响。%n%n选择「否」将保留应用数据，重新安装流息后可继续使用。
chs.LaunchApp=打开流息

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; everything the build staged (docs/installer.md §三); no time stamps stored, so two builds of the same files are the same
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs notimestamp

[Icons]
; both shortcuts carry the app's AppUserModelID and toast activator CLSID (desktop/src/main/app-id.mjs; the app sets the
; same two at start). Electron 44 checks the Start-menu one (Programs\{#AppName}.lnk) at the app's first notification and
; rewrites it unless its target, working folder, ID and CLSID are what it would write itself, the ID a VT_LPWSTR: these
; are, once [Code] below has rewritten the ID's type (docs/installer.md §九 12), so it is left as the installer made it —
; icon and comment included
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#ExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#IconFile}"; AppUserModelID: "{#AppUserModelId}"; AppUserModelToastActivatorCLSID: "{#ToastActivatorClsid}"; Comment: "{#AppVerName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#ExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#IconFile}"; AppUserModelID: "{#AppUserModelId}"; AppUserModelToastActivatorCLSID: "{#ToastActivatorClsid}"; Comment: "{#AppVerName}"; Tasks: desktopicon

[Registry]
; the toast activator's COM registration, as Electron 44 writes it at the app's first notification of each run (the same
; key, values and data: shell/browser/notifications/win/windows_toast_activator.cc, EnsureCLSIDRegistry): a click on a
; notification of the app's starts it. Electron never removes it; the uninstaller does (uninsdeletekey: the key with its
; values and LocalServer32), whoever wrote it last. Per user, like the rest of this install
Root: HKCU; Subkey: "Software\Classes\CLSID\{{{#ToastActivatorClsid}}"; ValueType: string; ValueName: ""; ValueData: "Electron Notification Activator"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\CLSID\{{{#ToastActivatorClsid}}"; ValueType: dword; ValueName: "CustomActivator"; ValueData: "1"
Root: HKCU; Subkey: "Software\Classes\CLSID\{{{#ToastActivatorClsid}}\LocalServer32"; ValueType: string; ValueName: ""; ValueData: "{app}\{#ExeName}"

[InstallDelete]
; an update over this app's older copy (work order 08): that copy's program files go before the new ones are copied — every
; name at the stage's top level (Streams.exe, Electron's files, locales\, resources\ …), made by the build from the stage;
; never the uninstaller (unins000.*), nothing outside {app}, nothing else in the folder. Each entry asks OldCopyHere ([Code]),
; which answers what was decided once at ssInstall, before the first entry deleted anything
#include InstallDeleteFile

[Run]
Filename: "{app}\{#ExeName}"; WorkingDir: "{app}"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent
; the update started from the app (services/update.mjs: /SILENT … /STRELAUNCH=1): Streams opens again once installed. Only
; with that parameter and silent ([Code] RelaunchAfterUpdate); an ordinary silent install opens nothing, as before
Filename: "{app}\{#ExeName}"; WorkingDir: "{app}"; Flags: nowait; Check: RelaunchAfterUpdate

[UninstallDelete]
; the install folder itself, once the files the installer put there are gone (nothing else is deleted from it)
Type: dirifempty; Name: "{app}\resources"
Type: dirifempty; Name: "{app}"

[Code]
// The shortcuts' AppUserModelID as a VT_LPWSTR. Inno Setup writes [Icons]' AppUserModelID as a VT_BSTR (and the toast
// activator CLSID as a VT_CLSID); Electron 44, at the app's first notification, keeps the Start-menu shortcut only when
// that property is a VT_LPWSTR (besides the target, working folder, ID and CLSID being its own) and otherwise writes the
// shortcut anew, without its icon and comment (docs/installer.md §九 12). So after [Icons], the same string is written
// back as a VT_LPWSTR — cleared first: the shortcut's property store keeps the old type when an equal value is set. Tried
// on Inno Setup 7.1.0's 64-bit setup (the type read back: VT_LPWSTR; icon, comment, CLSID kept). A failure is logged and
// leaves the shortcut as Inno Setup made it (Electron then rewrites it once, at the first notification).
const
  CLSID_ShellLink = '{00021401-0000-0000-C000-000000000046}';
  VT_BSTR = 8;
  VT_LPWSTR = 31;
  STGM_READWRITE = 2;

type
  TPropertyKey = record
    fmtid: TGUID;
    pid: DWORD;
  end;
  // PROPVARIANT: the type, three reserved words, the value (here a string pointer, never read by the script)
  TPropVariant = record
    vt: Word;
    Reserved1: Word;
    Reserved2: Word;
    Reserved3: Word;
    Value: Int64;
    Value2: Int64;
  end;

  IPersist = interface(IUnknown)
    '{0000010C-0000-0000-C000-000000000046}'
    procedure GetClassID(var classID: TGUID); safecall;
  end;

  IPersistFile = interface(IPersist)
    '{0000010B-0000-0000-C000-000000000046}'
    procedure IsDirty; safecall;
    procedure Load(pszFileName: String; dwMode: Longint); safecall;
    procedure Save(pszFileName: String; fRemember: BOOL); safecall;
    procedure SaveCompleted(pszFileName: String); safecall;
    function GetCurFile: String; safecall;
  end;

  IPropertyStore = interface(IUnknown)
    '{886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}'
    function GetCount(var cProps: DWORD): HResult;
    function GetAt(iProp: DWORD; var pkey: TPropertyKey): HResult;
    function GetValue(var key: TPropertyKey; var pv: TPropVariant): HResult;
    function SetValue(var key: TPropertyKey; var propvar: TPropVariant): HResult;
    function Commit: HResult;
  end;

function PropVariantChangeType(var dest: TPropVariant; var src: TPropVariant; flags: Integer; vt: Word): HResult;
  external 'PropVariantChangeType@propsys.dll stdcall';
function PropVariantClear(var pv: TPropVariant): HResult;
  external 'PropVariantClear@ole32.dll stdcall';

function AppUserModelIDAsLpwstr(const Lnk: String): String;
var
  Obj: IUnknown;
  PF: IPersistFile;
  PS: IPropertyStore;
  Key: TPropertyKey;
  Src, Dest, Cleared: TPropVariant;
  Hr: HResult;
begin
  try
    Obj := CreateComObject(StringToGuid(CLSID_ShellLink));
    PF := IPersistFile(Obj);
    PF.Load(Lnk, STGM_READWRITE);
    PS := IPropertyStore(Obj);
    Key.fmtid := StringToGuid('{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}'); // PKEY_AppUserModel_ID
    Key.pid := 5;
    Cleared.vt := 0; // VT_EMPTY
    Hr := PS.GetValue(Key, Src);
    if Hr <> 0 then begin
      Result := 'not read (' + IntToStr(Hr) + ')';
      Exit;
    end;
    if Src.vt <> VT_BSTR then
      Result := 'left as it is (type ' + IntToStr(Src.vt) + ')'
    else begin
      Hr := PropVariantChangeType(Dest, Src, 0, VT_LPWSTR);
      if Hr = 0 then Hr := PS.SetValue(Key, Cleared);
      if Hr = 0 then Hr := PS.SetValue(Key, Dest);
      if Hr = 0 then Hr := PS.Commit;
      if Hr = 0 then begin
        PF.Save(Lnk, True);
        Result := 'written as VT_LPWSTR';
      end else
        Result := 'not written (' + IntToStr(Hr) + ')';
      PropVariantClear(Dest);
    end;
    PropVariantClear(Src);
  except
    Result := 'failed: ' + GetExceptionMessage;
  end;
end;

// [InstallDelete] (work order 08): the folder holds this app's older copy — Streams.exe is there and the folder is the one
// this app's uninstall entry names (Inno Setup writes "Inno Setup: App Path" there at every install). A first install, or a
// folder that is someone else's, removes nothing.
// Decided ONCE, at ssInstall (CurStepChanged below: just before the installation starts — before the Restart Manager closes
// anything and before [InstallDelete] runs), and every entry gets that one answer. Not asked afresh per entry: Inno Setup calls
// an entry's Check when it reaches the entry, and the entries delete the very thing the question looks at — Streams.exe is one
// of them (the 4th of 20: the list is sorted, upper case first) — so a per-entry answer turned to 0 once Streams.exe was gone
// and the 16 entries after it (locales\, resources\ …) were skipped: the older copy's files stayed (2026-10-12, the real
// upgrade test; the update's own log said 1 four times, then 0 sixteen times; docs/installer.md 11.1). Before ssInstall —
// the Preparing step asks the Checks to know which files the Restart Manager should look at — the answer is worked out each
// time: nothing has been deleted then.
var
  OldCopyDecided: Boolean;
  OldCopyAnswer: Boolean;

function OldCopyNow: Boolean;
var
  Recorded: String;
begin
  Result := False;
  if FileExists(ExpandConstant('{app}\{#ExeName}')) and
     RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + '{#AppGuid}' + '}_is1', 'Inno Setup: App Path', Recorded) then
    Result := CompareText(RemoveBackslashUnlessRoot(Recorded), RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) = 0;
end;

function OldCopyHere: Boolean;
begin
  if OldCopyDecided then
    Result := OldCopyAnswer
  else
    Result := OldCopyNow;
end;

// [Run] (work order 08): open Streams again after the update the app itself started — silent, with /STRELAUNCH=1
// (desktop/src/main/services/update.mjs SETUP_ARGS). Any other install opens nothing by itself.
function RelaunchAfterUpdate: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:STRELAUNCH|0}') = '1');
  Log('Open the app again after the update: ' + IntToStr(Ord(Result)));
end;

// The handshake with the app's update (docs/installer.md §七): the app starts this setup program with
// /STWAITPID=<its main process id> and then quits; before anything is installed — PrepareToInstall, the first step of
// "Preparing to install", before the Restart Manager looks for programs that hold our files — the setup program waits for
// that process to have exited, at most {#WaitPidTimeoutMs} ms. Each case writes one line to the log, all beginning
// "Wait for the app to exit:": no /STWAITPID (an install not started by the app: nothing waits, as before), a value that is
// not a process id, a process that is not running (it has exited already), the process exited after <n> ms, or still running
// after the limit (the install goes on; the Restart Manager then closes it, as before the handshake). The wait polls in
// short steps (WaitForSingleObject, 250 ms) on a handle opened with SYNCHRONIZE only.
const
  SYNCHRONIZE = $00100000;
  WAIT_OBJECT_0 = 0;

function OpenProcess(dwDesiredAccess: DWORD; bInheritHandle: BOOL; dwProcessId: DWORD): THandle;
  external 'OpenProcess@kernel32.dll stdcall';
function WaitForSingleObject(hHandle: THandle; dwMilliseconds: DWORD): DWORD;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function CloseHandle(hObject: THandle): BOOL;
  external 'CloseHandle@kernel32.dll stdcall';
function GetTickCount: DWORD;
  external 'GetTickCount@kernel32.dll stdcall';
// 1.1 W12: opening the program file for writing, shared with nobody, fails while any process runs it
function CreateFileW(lpFileName: String; dwDesiredAccess: DWORD; dwShareMode: DWORD; lpSecurityAttributes: Cardinal; dwCreationDisposition: DWORD; dwFlagsAndAttributes: DWORD; hTemplateFile: Cardinal): Longint;
  external 'CreateFileW@kernel32.dll stdcall';
function CloseFileHandle(hObject: Longint): BOOL;
  external 'CloseHandle@kernel32.dll stdcall';

const
  GENERIC_WRITE = $40000000;
  OPEN_EXISTING = 3;

function ProgramFileInUse(const Path: String): Boolean;
var
  H: Longint;
begin
  Result := False;
  if not FileExists(Path) then Exit;
  H := CreateFileW(Path, GENERIC_WRITE, 0, 0, OPEN_EXISTING, 0, 0);
  if (H = -1) or (H = 0) then
    Result := True
  else
    CloseFileHandle(H);
end;

// 1.1 W12: the app's own process has exited; Chromium's processes of it end a moment later (the Restart Manager, looking right
// away, found one: upgrade.test.mjs step 5). Wait until {app}\{#ExeName} is free, at most {#WaitOthersTimeoutMs} ms, polling every
// 100 ms; one line in the log, beginning "Wait for the app's other processes:"
procedure WaitForTheAppsProcesses;
var
  Exe: String;
  Started, Waited: DWORD;
  InUse: Boolean;
begin
  Exe := ExpandConstant('{app}\{#ExeName}');
  if not FileExists(Exe) then
  begin
    Log('Wait for the app''s other processes: no ' + Exe + ', nothing to wait for');
    Exit;
  end;
  Started := GetTickCount;
  repeat
    InUse := ProgramFileInUse(Exe);
    if InUse then Sleep(100);
    Waited := GetTickCount - Started;
  until (not InUse) or (Waited >= {#WaitOthersTimeoutMs});
  if InUse then
    Log('Wait for the app''s other processes: ' + Exe + ' still in use after ' + IntToStr(Waited) + ' ms (limit {#WaitOthersTimeoutMs} ms); going on, the Restart Manager closes them')
  else
    Log('Wait for the app''s other processes: ' + Exe + ' free after ' + IntToStr(Waited) + ' ms');
end;

function IsProcessId(const Text: String): Boolean;
var
  I: Integer;
begin
  Result := (Length(Text) >= 1) and (Length(Text) <= 10) and (Text[1] <> '0');
  if Result then
    for I := 1 to Length(Text) do
      if (Text[I] < '0') or (Text[I] > '9') then Result := False;
  if Result then Result := StrToInt64Def(Text, 0) <= 4294967295;
end;

procedure WaitForTheApp;
var
  Given: String;
  Pid: DWORD;
  Handle: THandle;
  Started, Waited: DWORD;
  Exited: Boolean;
begin
  Given := ExpandConstant('{param:STWAITPID|}');
  if Given = '' then
  begin
    Log('Wait for the app to exit: no /STWAITPID given, nothing to wait for');
    Exit;
  end;
  if not IsProcessId(Given) then
  begin
    Log('Wait for the app to exit: /STWAITPID=' + Given + ' is not a process id; not waiting');
    Exit;
  end;
  Pid := StrToInt64Def(Given, 0);
  Handle := OpenProcess(SYNCHRONIZE, False, Pid);
  if Handle = 0 then
  begin
    Log('Wait for the app to exit: process ' + Given + ' is not running (it has exited already)');
    Exit;
  end;
  Started := GetTickCount;
  Exited := False;
  repeat
    Exited := WaitForSingleObject(Handle, 250) = WAIT_OBJECT_0;
    Waited := GetTickCount - Started;
  until Exited or (Waited >= {#WaitPidTimeoutMs});
  CloseHandle(Handle);
  if Exited then
  begin
    Log('Wait for the app to exit: process ' + Given + ' exited after ' + IntToStr(Waited) + ' ms');
    WaitForTheAppsProcesses;
  end
  else
    Log('Wait for the app to exit: process ' + Given + ' still running after ' + IntToStr(Waited) + ' ms (limit {#WaitPidTimeoutMs} ms); going on, the Restart Manager closes it');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  WaitForTheApp;
  Result := '';
end;

// The uninstall entry's version (0.2.2, docs/installer.md 11.6): what Settings → Apps shows. Inno Setup deletes and writes
// the entry anew at every install, DisplayVersion from AppVersion ("Creating new uninstall key … Writing uninstall key
// values"), and did so in every run tried on 2026-10-21 (this script compiled as two versions, the higher run over the
// lower with the app's switches, the app open meanwhile). An entry that seemed left at 0.2.0 after the 2026-10-13 update
// was not: the tools that read it ran in the Claude desktop app's private registry view (docs/installer.md 11.6); the real
// entry had the new version. This check is a guard for the case of an
// entry Inno Setup itself leaves behind. So after the install the entry is read once more: when it names this folder and shows
// another version, the version values are written as Inno Setup writes them (DisplayVersion, MajorVersion/MinorVersion,
// VersionMajor/VersionMinor), and the log says so. An entry that names another folder is left as it is.
function VersionNumber(const Version: String; Index: Integer): Cardinal;
// the Index-th number (0 = major) of release.json's version, major.minor.patch, digits only (build-installer.mjs checks it)
var
  Rest: String;
  I, Dot: Integer;
begin
  Rest := Version;
  for I := 1 to Index do
  begin
    Dot := Pos('.', Rest);
    if Dot = 0 then Rest := '' else Rest := Copy(Rest, Dot + 1, Length(Rest));
  end;
  Dot := Pos('.', Rest);
  if Dot > 0 then Rest := Copy(Rest, 1, Dot - 1);
  Result := StrToIntDef(Rest, 0);
end;

procedure UninstallEntryVersion;
var
  Key, Recorded, Shown: String;
begin
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + '{#AppGuid}' + '}_is1';
  if not RegQueryStringValue(HKCU, Key, 'Inno Setup: App Path', Recorded) then Recorded := '';
  if CompareText(RemoveBackslashUnlessRoot(Recorded), RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) <> 0 then
  begin
    Log('The uninstall entry does not name this folder: its version is left as it is');
    Exit;
  end;
  if not RegQueryStringValue(HKCU, Key, 'DisplayVersion', Shown) then Shown := '(none)';
  if Shown = '{#AppVersion}' then
    Log('The uninstall entry shows this version: ' + Shown)
  else if RegWriteStringValue(HKCU, Key, 'DisplayVersion', '{#AppVersion}') and
    RegWriteDWordValue(HKCU, Key, 'MajorVersion', VersionNumber('{#AppVersion}', 0)) and
    RegWriteDWordValue(HKCU, Key, 'MinorVersion', VersionNumber('{#AppVersion}', 1)) and
    RegWriteDWordValue(HKCU, Key, 'VersionMajor', VersionNumber('{#AppVersion}', 0)) and
    RegWriteDWordValue(HKCU, Key, 'VersionMinor', VersionNumber('{#AppVersion}', 1)) then
    Log('The uninstall entry showed version ' + Shown + ': written ' + '{#AppVersion}')
  else
    Log('The uninstall entry showed version ' + Shown + ': writing ' + '{#AppVersion}' + ' failed');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    // [InstallDelete]'s one answer (OldCopyHere above), taken while the older copy is still whole
    OldCopyAnswer := OldCopyNow;
    OldCopyDecided := True;
    Log('An older copy of the app in this folder (its program files are removed first): ' + IntToStr(Ord(OldCopyAnswer)));
  end;
  if CurStep = ssPostInstall then
  begin
    // after Inno Setup has written the uninstall entry (its log: "Writing uninstall key values" comes before this step)
    UninstallEntryVersion;
    Log('AppUserModelID of the Start-menu shortcut: ' + AppUserModelIDAsLpwstr(ExpandConstant('{autoprograms}\{#AppName}.lnk')));
    if FileExists(ExpandConstant('{autodesktop}\{#AppName}.lnk')) then
      Log('AppUserModelID of the desktop shortcut: ' + AppUserModelIDAsLpwstr(ExpandConstant('{autodesktop}\{#AppName}.lnk')));
  end;
end;

// After the program files are removed: ask once whether the app's data goes too. Default No; a silent uninstall
// (/SUPPRESSMSGBOXES) takes the default. DelTree removes a junction without following it (Inno Setup's documentation:
// "This function will remove directories that are reparse points, but it will not recursively delete files/directories
// inside them") — a link inside the data folders is removed as a link, never followed.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if SuppressibleMsgBox(CustomMessage('DeleteAppData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES then
    begin
      DelTree(ExpandConstant('{userappdata}\{#InstallFolder}'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\{#InstallFolder}'), True, True, True);
    end;
  end;
end;
