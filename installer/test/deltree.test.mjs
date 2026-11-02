// The uninstaller's "delete the app's data too" answer (installer/setup/streams.iss, [Code]) deletes %APPDATA%\Streams and
// %LOCALAPPDATA%\Streams with Inno Setup's DelTree. DSH_HOME holds links (directory junctions) into the program folder;
// Inno Setup documents that DelTree "will remove directories that are reparse points, but it will not recursively
// delete files/directories inside them". The packaged test cannot answer that question on the real folders (it would
// delete this machine's own %APPDATA%\Streams), so this checks the documented behaviour with the pinned Inno Setup: a
// tiny setup whose only code is the same DelTree call on a folder given on its command line, which then aborts (nothing
// is installed, no uninstall entry). The folder holds files, a subfolder and a junction to a folder outside it: the
// folder goes, the junction goes, the folder it pointed to and its file stay.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { ensureInnoSetup } = await import(pathToFileURL(join(REPO, 'installer', 'innosetup', 'setup_innosetup.mjs')).href)
const { removeTree } = await import(pathToFileURL(join(REPO, 'desktop', 'scripts', 'lib', 'remove-tree.mjs')).href)
const ROOT = mkdtempSync(join(tmpdir(), 'st-w7-deltree-'))
after(() => removeTree(ROOT, { waitMs: 10_000 }))

const SCRIPT = `
[Setup]
AppName=DelTree check
AppVersion=1
DefaultDirName={tmp}\\never
Uninstallable=no
CreateAppDir=no
OutputDir=${join(ROOT, 'out')}
OutputBaseFilename=deltree-check
PrivilegesRequired=lowest
[Code]
function InitializeSetup(): Boolean;
begin
  DelTree(ExpandConstant('{param:TARGET}'), True, True, True);
  Result := False;
end;
`

test('DelTree as the uninstaller calls it: the folder and the junction in it go; the junction\'s target stays', { skip: process.platform !== 'win32' && 'Windows only' }, async () => {
  const { iscc } = await ensureInnoSetup({ install: false })
  const c = spawnSync(iscc, ['-Q', '-'], { input: SCRIPT, encoding: 'utf8', windowsHide: true })
  assert.equal(c.status, 0, c.stdout + c.stderr)
  const outside = join(ROOT, 'engine-package')
  mkdirSync(outside)
  writeFileSync(join(outside, 'index.js'), 'keep me\n')
  const target = join(ROOT, 'Streams')
  mkdirSync(join(target, 'dsh-home', 'profiles', 'ann', 'node_modules', '@streams'), { recursive: true })
  writeFileSync(join(target, 'settings.json'), '{}\n')
  symlinkSync(outside, join(target, 'dsh-home', 'profiles', 'ann', 'node_modules', '@streams', 'ann-runtime'), 'junction')
  const r = spawnSync(join(ROOT, 'out', 'deltree-check.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', `/TARGET=${target}`], { windowsHide: true, timeout: 60_000 })
  assert.notEqual(r.status, null, 'the check setup ended')
  assert.equal(existsSync(target), false, 'the folder is gone, links and all')
  assert.equal(readFileSync(join(outside, 'index.js'), 'utf8'), 'keep me\n', 'the junction\'s target and its file stay')
})
