// redesign R6c: the development switches and their traps, without a build (docs/installer.md §八).
//
//   node --test installer/test/switches.test.mjs
//
// The installed app is started with every development switch set to a trap (world.mjs trapSwitches) and must take none.
// That only holds for the switches the list knows: one read by the app and not in the list is a switch no install test
// watches (five were missing before R6c). So: every STREAMS_* name in the CODE of desktop/src/main (comments taken out; any
// form — process.env.STREAMS_X, process.env['STREAMS_X'], process.env[`STREAMS_X`], env.STREAMS_X, const { STREAMS_X } =
// process.env, a quoted 'STREAMS_X' as layout.mjs names its two) is a key of trapSwitches, and every key is a name the code
// holds (a trap for a switch that is gone says nothing). Then the guards: every line of main.mjs that names a switch is a
// statement `const NAME = !app.isPackaged && …` or goes on from one (a line beginning with ?, : or &&), and no switch stands
// where the guard does not reach: after the ternary's ` : ` (or on a line beginning with :, the branch a packaged app takes),
// after `||` or after a `;`; no other file takes a STREAMS_* name off an object itself — process.env, an `env` handed in, or
// any other name it is held under (`e.STREAMS_X`, `e['STREAMS_X']`, `const { STREAMS_X } = e`) — (layout.mjs's two are
// names handed to `pick`, which refuses them when packaged); and no file holds the bare prefix 'STREAMS_' (a name built).
// Controls: copies of desktop/src/main with one more read, in each form, are told; a name only in a comment's prose is not a
// read; a read in a function below a guarded line, a read in a service, a read of layout's without `pick`'s refusal are told;
// a log with a trap's line is told, the app's ordinary lines are not; so are the escapes past a guard (the else branch, ||, ;)
// and a read through an alias of process.env (R6c fixer, 2026-11-15 ET, after the pre-check). Not seen by this scan: a name
// held in a variable and read with it (`const k = 'STREAMS_X'; e[k]` — the name itself is still found and must have a trap),
// a name put together from other pieces than the 'STREAMS_' prefix, a second declaration after a comma on a guarded line —
// desktop/src/main has none of these, and a review would have to catch one.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { cpSync, appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { QUOTA_TRAP_LINE, trapLogLines, trapSwitches, trapsUntouched } from './world.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAIN = join(REPO, 'desktop', 'src', 'main')
const imp = p => import(pathToFileURL(join(REPO, p)).href)
const { removeTree } = await imp('desktop/scripts/lib/remove-tree.mjs')
const { tempDir } = await imp('desktop/scripts/lib/temp.mjs')

const ROOT = tempDir('st-switches-')
after(() => removeTree(ROOT, { waitMs: 10_000 }))

/** A switch's name, wherever it stands in the code. */
const NAME = /\bSTREAMS_[A-Z0-9_]+\b/g
/** A line of main.mjs that reads its switches: `const NAME = !app.isPackaged && …`; and a line that goes on from the one above. */
const GUARDED = /^\s*const [A-Z_]+ = !app\.isPackaged && /
const GOES_ON = /^\s*(\?|:|&&)/
/**
 * Outside main.mjs: a STREAMS_* name taken off an object — process.env, an `env` handed in, or any alias of them (R6c fixer,
 * after the pre-check: `const e = process.env; e.STREAMS_X` was not told): a property read (.X, ?.X), a key read (['X']),
 * a destructuring (`{ X } = anything`).
 */
const ENV_READ = [/[\w$)\]]\s*(\?\.|\.)\s*STREAMS_/, /[\w$)\]]\s*(\?\.)?\[\s*['"`]STREAMS_/, /\{[^}]*\bSTREAMS_[A-Z0-9_]+\b[^}]*\}\s*=\s*[\w$(]/]
/** The bare prefix in a string, anywhere: a switch's name put together at run time ('STREAMS_' + x). */
const PREFIX = /['"`]STREAMS_['"`]/
/**
 * Where a guarded statement's guard does not reach (R6c fixer, after the pre-check: `!app.isPackaged && false ? null` with
 * `: process.env.STREAMS_X` below was taken for guarded): the else branch of `A && B ? C : D` — after the last ` : ` of a
 * line, or a whole line beginning with `:` — is what a packaged app evaluates; so is what follows `||` (`(A && B) || C`)
 * and what follows a `;` (another statement).
 */
const PAST_GUARD = [/^\s*:/, /\s:\s(?![^]*\s:\s)/, /\|\|/, /;/]
function pastGuard(line) {
  for (const re of PAST_GUARD) {
    const m = re.exec(line)
    if (!m) continue
    NAME.lastIndex = 0
    if (NAME.test(line.slice(re === PAST_GUARD[0] ? 0 : m.index + m[0].length))) return true
  }
  return false
}

/** Every .js / .mjs file below `dir`. */
function sources(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (/\.m?js$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * The code of a file, line by line (line numbers kept): a line that begins a comment (//, /*, or a JSDoc line's *) is empty;
 * on the other lines, what lies between `/* ` and `*\/` and what follows ` // ` is taken out.
 */
function codeLines(text) {
  return text.split('\n').map(l => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l.replace(/\/\* [^]*?\*\//g, '').replace(/\s\/\/\s.*$/, '')))
}

/** The STREAMS_* names in the code below `dir`: name → the files (relative to `dir`) that hold it. */
function switchesRead(dir) {
  const found = new Map()
  for (const file of sources(dir)) {
    const rel = relative(dir, file)
    for (const line of codeLines(readFileSync(file, 'utf8'))) for (const m of line.matchAll(NAME)) found.set(m[0], [...new Set([...(found.get(m[0]) ?? []), rel])])
  }
  return found
}

/** What the two lists disagree on: [] when every switch read has a trap and every trap is of a switch read. */
function disagreements(read, traps) {
  const out = []
  for (const name of [...read.keys()].sort()) if (!Object.hasOwn(traps, name)) out.push(`${name} is read (${read.get(name).join(', ')}) and has no trap in installer/test/world.mjs trapSwitches`)
  for (const name of Object.keys(traps).sort()) if (!read.has(name)) out.push(`${name} has a trap and nothing in desktop/src/main reads it`)
  return out
}

/** The lines of main.mjs that name a switch and are not behind app.isPackaged: [] when every one is. */
function unguardedReads(mainText) {
  const lines = codeLines(mainText)
  const ok = []
  const out = []
  for (const [i, line] of lines.entries()) {
    ok[i] = GUARDED.test(line) || (GOES_ON.test(line) && i > 0 && ok[i - 1] === true)
    NAME.lastIndex = 0
    if (NAME.test(line) && (!ok[i] || pastGuard(line))) out.push(`line ${i + 1}: ${line.trim().slice(0, 120)}`)
  }
  return out
}

/** The files below `dir` other than main.mjs that take a STREAMS_* name from the environment themselves: [] when none does. */
function readsElsewhere(dir) {
  const out = []
  for (const file of sources(dir)) {
    const rel = relative(dir, file)
    if (rel === 'main.mjs') continue
    for (const [i, line] of codeLines(readFileSync(file, 'utf8')).entries()) if (ENV_READ.some(re => re.test(line))) out.push(`${rel} line ${i + 1}: ${line.trim().slice(0, 120)}`)
  }
  return out
}

/** The files below `dir` (main.mjs too) whose code holds the bare prefix 'STREAMS_': [] when none does. */
function builtNames(dir) {
  const out = []
  for (const file of sources(dir)) for (const [i, line] of codeLines(readFileSync(file, 'utf8')).entries()) if (PREFIX.test(line)) out.push(`${relative(dir, file)} line ${i + 1}`)
  return out
}

const PICK = 'const pick = name => (isPackaged ? null : fromEnv(env, name))'
const trapsOf = name => { const dir = join(ROOT, name); mkdirSync(dir); return { dir, switches: trapSwitches(dir, 'http://127.0.0.1:9') } }
const copyOfMain = name => { const copy = join(ROOT, name); cpSync(MAIN, copy, { recursive: true }); return copy }

test('every development switch the main process reads is set to a trap for the installed app, and every trap is of a switch it reads; every read is behind app.isPackaged', () => {
  const read = switchesRead(MAIN)
  const { switches } = trapsOf('real')
  assert.ok(read.size >= 17, `control: the scan finds the switches (${read.size}: ${[...read.keys()].sort().join(' ')})`)
  for (const name of ['STREAMS_APP_DATA', 'STREAMS_LOCAL_DATA', 'STREAMS_WINDOW', 'STREAMS_DEV_DETECT', 'STREAMS_DEV_BUILD', 'STREAMS_DEV_LIBRARY_ROOT', 'STREAMS_DEV_SOP_DIR', 'STREAMS_DEV_ASK_SCRIPT']) assert.ok(read.has(name), `control: the scan finds ${name}`)
  assert.deepEqual(disagreements(read, switches), [])
  // every switch main.mjs names is behind app.isPackaged (the one place they are read)
  const main = readFileSync(join(MAIN, 'main.mjs'), 'utf8')
  assert.ok(codeLines(main).filter(l => /process\.env\.STREAMS_/.test(l)).length >= 15, 'control: main.mjs reads its switches from process.env')
  assert.deepEqual(unguardedReads(main), [], 'every read in main.mjs is behind app.isPackaged')
  // no other file takes a switch from the environment; layout.mjs's two are refused when packaged
  assert.deepEqual(readsElsewhere(MAIN), [], 'no file but main.mjs reads a STREAMS_* name from the environment')
  assert.deepEqual(builtNames(MAIN), [], 'no file puts a switch\'s name together from the prefix')
  const layout = readFileSync(join(MAIN, 'layout.mjs'), 'utf8')
  assert.equal(layout.split(PICK).length, 2, 'layout.mjs refuses STREAMS_APP_DATA / STREAMS_LOCAL_DATA when packaged')
  // controls: a read whose guard is taken away is told — on the statement's own line, and on both lines of a statement that
  // goes on over a second line; so is a new read that never had one, and a read in a function just below a guarded line
  const bare = main.replace('const DEV_DETECT = !app.isPackaged && ', 'const DEV_DETECT = ')
  assert.notEqual(bare, main, 'control: the guard of STREAMS_DEV_DETECT was there to take away')
  assert.equal(unguardedReads(bare).length, 1, `a read without the guard is told: ${unguardedReads(bare).join(' | ')}`)
  const bare2 = main.replace('const DEV_LANGUAGES = !app.isPackaged && ', 'const DEV_LANGUAGES = ')
  assert.notEqual(bare2, main, 'control: the guard of STREAMS_DEV_SYSTEM_LANGUAGES was there to take away')
  assert.equal(unguardedReads(bare2).length, 2, `both lines of a two-line statement without the guard are told: ${unguardedReads(bare2).join(' | ')}`)
  assert.equal(unguardedReads(`${main}\nconst X = process.env.STREAMS_DEV_NEW_THING === '1'\n`).length, 1, 'a new read without the guard is told')
  const anchor = main.split('\n').find(l => l.startsWith('const DEV_BUILD = !app.isPackaged && '))
  assert.ok(anchor, 'control: the guarded line of STREAMS_DEV_BUILD')
  for (const read of ['function buildScriptFile () { return process.env.STREAMS_DEV_BUILD }', 'const { STREAMS_DEV_BUILD: s } = process.env', 'const s = process.env[`STREAMS_DEV_BUILD`]']) {
    assert.equal(unguardedReads(main.replace(anchor, `${anchor}\n${read}`)).length, 1, `a read on the line below a guarded one is told: ${read}`)
  }
  // controls (R6c fixer, after the pre-check): a switch where the guard does not reach — the else branch on the guarded line or
  // on a line beginning with :, after ||, after ; — is told; the guarded lines of main.mjs as they are (` ? X : null`) are not
  const guardedLine = main.split('\n').find(l => l.startsWith('const DEV_DETECT = !app.isPackaged && '))
  for (const escape of [
    'const DEV_DETECT = !app.isPackaged && false ? null : process.env.STREAMS_DEV_DETECT',
    'const DEV_DETECT = !app.isPackaged && false ? null\n  : process.env.STREAMS_DEV_DETECT ?? null',
    'const DEV_DETECT = !app.isPackaged && false\n  ? null\n  : process.env.STREAMS_DEV_DETECT',
    'const DEV_DETECT = !app.isPackaged && false || process.env.STREAMS_DEV_DETECT',
    'const DEV_DETECT = !app.isPackaged && false; const D2 = process.env.STREAMS_DEV_DETECT',
  ]) {
    const mutated = main.replace(guardedLine, escape)
    assert.notEqual(mutated, main, 'control: the line was there to change')
    assert.equal(unguardedReads(mutated).length, 1, `a switch past the guard is told: ${escape.replace(/\n/g, ' ⏎ ')} → ${unguardedReads(mutated).join(' | ')}`)
  }
  // controls: a service that reads a switch itself (in each form, and through an alias of process.env) is told; so is layout.mjs
  // without its refusal; so is a name put together from the prefix
  for (const read of ['const q = process.env.STREAMS_DEV_QUOTA', 'const q = env.STREAMS_DEV_QUOTA', 'const q = process.env[\'STREAMS_DEV_QUOTA\']', 'const q = process.env[`STREAMS_DEV_QUOTA`]', 'const { STREAMS_DEV_QUOTA: q } = process.env', 'const q = process.env?.STREAMS_DEV_QUOTA', 'const q = e.STREAMS_DEV_QUOTA', 'const q = e[\'STREAMS_DEV_QUOTA\']', 'const { STREAMS_DEV_QUOTA: q } = e', 'const q = (o.env).STREAMS_DEV_QUOTA']) {
    const copy = copyOfMain(`elsewhere-${readdirSync(ROOT).length}`)
    assert.deepEqual(readsElsewhere(copy), [], 'control: the copy as it is has no read outside main.mjs')
    appendFileSync(join(copy, 'services', 'quota.mjs'), `\n${read}\n`)
    const d = readsElsewhere(copy)
    assert.equal(d.length, 1, `a read in a service is told: ${read}`)
    assert.match(d[0], /^services[\\/]quota\.mjs line \d+: /)
  }
  assert.equal(layout.replace(PICK, 'const pick = name => fromEnv(env, name)').split(PICK).length, 1, 'control: layout.mjs without its refusal is told')
  for (const [file, read] of [['services/quota.mjs', 'const q = process.env[\'STREAMS_\' + \'DEV_QUOTA\']'], ['main.mjs', 'const P = "STREAMS_"']]) {
    const copy = copyOfMain(`built-${readdirSync(ROOT).length}`)
    appendFileSync(join(copy, ...file.split('/')), `\n${read}\n`)
    assert.equal(builtNames(copy).length, 1, `a name put together from the prefix is told: ${read}`)
  }
})

test('control: one more switch read in a copy of desktop/src/main — in any form — is told; a name in a comment\'s prose is not a read; a trap of a switch that is gone is told', () => {
  const { switches } = trapsOf('copies')
  const forms = [
    'const X = !app.isPackaged && process.env.STREAMS_DEV_NEW_THING === \'1\'',
    'const X = process.env["STREAMS_DEV_NEW_THING"]',
    'const X = process.env[`STREAMS_DEV_NEW_THING`]',
    'const NAMES = { x: \'STREAMS_DEV_NEW_THING\' }',
    'const { STREAMS_DEV_NEW_THING } = process.env',
    'const X = env.STREAMS_DEV_NEW_THING',
  ]
  for (const [i, line] of forms.entries()) {
    const copy = copyOfMain(`main-${i}`)
    assert.deepEqual(disagreements(switchesRead(copy), switches), [], 'control: the copy as it is agrees')
    appendFileSync(join(copy, 'main.mjs'), `\n${line}\n`)
    const d = disagreements(switchesRead(copy), switches)
    assert.equal(d.length, 1, `one more read is told: ${line}`)
    assert.match(d[0], /^STREAMS_DEV_NEW_THING is read \(main\.mjs\) and has no trap/)
  }
  // the same read in a service, in a copy far deeper than the repository (the names are relative to the copy, whatever its path)
  const deep = join(ROOT, 'a-much-longer-folder-name-than-the-repository-has-'.repeat(2), 'main')
  mkdirSync(dirname(deep), { recursive: true })
  cpSync(MAIN, deep, { recursive: true })
  appendFileSync(join(deep, 'services', 'quota.mjs'), '\nconst X = process.env.STREAMS_DEV_NEW_THING\n')
  assert.deepEqual(disagreements(switchesRead(deep), switches), [`STREAMS_DEV_NEW_THING is read (${join('services', 'quota.mjs')}) and has no trap in installer/test/world.mjs trapSwitches`])
  // prose: a comment line, a JSDoc line, and what follows ` // ` on a line of code
  const prose = copyOfMain('main-prose')
  appendFileSync(join(prose, 'main.mjs'), '\n// the build script reads STREAMS_INSTALLER_VERSION, not the app\n/**\n * nor STREAMS_INSTALLER_OUT\n */\nconst y = 1 // STREAMS_INSTALLER_APP_REF is the build\'s too\n')
  assert.deepEqual(disagreements(switchesRead(prose), switches), [], 'a name in prose is not a read')
  assert.deepEqual(disagreements(switchesRead(MAIN), { ...switches, STREAMS_DEV_GONE: 'x' }), ['STREAMS_DEV_GONE has a trap and nothing in desktop/src/main reads it'])
  const { STREAMS_DEV_DETECT: _gone, ...without } = switches
  assert.equal(disagreements(switchesRead(MAIN), without).length, 1, 'a switch whose trap is taken out of the list is told')
})

test('the traps as made: each file switch points at a file that is there, each folder switch at an empty folder; trapsUntouched and trapLogLines tell a switch that was taken', () => {
  const { dir, switches } = trapsOf('made')
  for (const name of ['STREAMS_DEV_QUOTA', 'STREAMS_DEV_ASK_SCRIPT', 'STREAMS_DEV_DETECT', 'STREAMS_DEV_BUILD', 'STREAMS_DEV_DEFINITION']) assert.ok(statSync(switches[name]).isFile(), `${name}'s trap file is there`)
  for (const name of ['STREAMS_DEV_QUOTA', 'STREAMS_DEV_ASK_SCRIPT', 'STREAMS_DEV_BUILD', 'STREAMS_DEV_DEFINITION']) assert.throws(() => JSON.parse(readFileSync(switches[name], 'utf8')), SyntaxError, `${name}'s trap is not JSON: an app that read it says so in main.log`)
  const detect = JSON.parse(readFileSync(switches.STREAMS_DEV_DETECT, 'utf8'))
  assert.deepEqual(Object.keys(detect), ['claude-code', 'codex'])
  for (const k of Object.keys(detect)) assert.deepEqual([detect[k].installed, detect[k].loggedIn], [true, true], `the detection trap says ${k} is found and signed in (an app that took it shows it usable)`)
  for (const name of ['STREAMS_APP_DATA', 'STREAMS_LOCAL_DATA', 'STREAMS_DEV_LIBRARY', 'STREAMS_DEV_CHOOSE_FOLDER', 'STREAMS_DEV_LIBRARY_ROOT', 'STREAMS_DEV_SOP_DIR']) assert.deepEqual(readdirSync(switches[name]), [], `${name}'s trap folder is empty`)
  assert.equal(existsSync(switches.STREAMS_DEV_UPDATE_SETUP_RECORD), false)
  assert.deepEqual(trapsUntouched(dir), [])
  // controls: something written where a switch points is told
  mkdirSync(join(switches.STREAMS_DEV_LIBRARY_ROOT, '新库'))
  assert.deepEqual(trapsUntouched(dir), ['library-root: 新库'])
  // the log: the app's ordinary lines are not a trap's; each line a taken switch would leave is
  const ordinary = ['2026-11-13T22:00:00.000Z library: the registry has 0 libraries', '2026-11-13T22:00:01.000Z connections: detect claude-code: not-installed', '2026-11-13T22:00:02.000Z build: confirm: done', '2026-11-13T22:00:03.000Z quota: nothing to read']
  assert.deepEqual(trapLogLines(dir, ordinary.join('\n')), [])
  const taken = [
    `x ${QUOTA_TRAP_LINE}: ENOENT`,
    `x startup: the SOP folder ${switches.STREAMS_DEV_SOP_DIR} has no update.md`,
    `x startup: ${switches.STREAMS_DEV_DEFINITION}: Unexpected token`,
    'x connections: STREAMS_DEV_DETECT unreadable: ENOENT',
    `x library: the default place for a new library is ${switches.STREAMS_DEV_LIBRARY_ROOT}`,
  ]
  assert.deepEqual(trapLogLines(dir, [...ordinary, ...taken].join('\r\n')), taken)
})
