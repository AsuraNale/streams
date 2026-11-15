// app://ui/ in plain Node (the handler is protocol.handle's, without Electron): the page's files are served; a path
// is judged as text before any file is looked at — so a path naming another machine (`//host/share`, `%2f%2f…`) is
// refused at once and no network share is opened (D2); names of any script load (N1); the gallery's files only in a
// development run, whatever the case of the request (D7, N2).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:net'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEV_ONLY, createAppProtocolHandler, vendorFiles } from '../src/main/protocol.mjs'
import { safeSegments } from '../src/main/safe-path.mjs'
import { DESKTOP_DIR } from '../scripts/lib/paths.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { tempDir } from '../scripts/lib/temp.mjs'

const handler = (dev, locale) => createAppProtocolHandler({
  rendererDir: join(DESKTOP_DIR, 'src', 'renderer'),
  sharedDir: join(DESKTOP_DIR, 'src', 'shared'),
  vendor: vendorFiles(),
  csp: "default-src 'none'",
  dev,
  ...(locale ? { locale } : {}),
})
const get = (h, url) => h(new Request(url))

test('the page\'s own files are served (control)', async () => {
  const h = handler(false)
  for (const u of ['app://ui/', 'app://ui/index.html', 'app://ui/app.js', 'app://ui/styles/app.css', 'app://ui/vendor/preact.module.js', 'app://ui/shared/fetch-states.mjs']) {
    assert.equal((await get(h, u)).status, 200, u)
  }
})

// v2 package K2: the bundled UI font is served as font/ttf; its license text beside it is not a type the page uses (control);
// index.html carries the look the handler is given. Redesign R1 (the template's design.css asks for ../fonts/ under
// template/shared/: the same file answers, FILE_ALIASES — the only alias; the default theme is research now)
test('the bundled font is served as font/ttf, byte for byte; the .txt beside it is not; index.html has data-theme and data-appearance', async () => {
  const h = handler(false)
  const font = await get(h, 'app://ui/fonts/NotoSansSC-VF.ttf')
  assert.equal(font.status, 200)
  assert.equal(font.headers.get('content-type'), 'font/ttf')
  assert.ok(Buffer.from(await font.arrayBuffer()).equals(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'NotoSansSC-VF.ttf'))))
  assert.equal((await get(h, 'app://ui/fonts/OFL-NotoSansSC.txt')).status, 404, 'control: a .txt is not served')
  const page = await (await get(createAppProtocolHandler({ rendererDir: join(DESKTOP_DIR, 'src', 'renderer'), sharedDir: join(DESKTOP_DIR, 'src', 'shared'), vendor: vendorFiles(), csp: "default-src 'none'", theme: () => ({ theme: 'research', scheme: 'dark' }) }), 'app://ui/index.html')).text()
  assert.match(page, /<html lang="zh-CN" data-theme="research" data-appearance="dark">/)
  assert.match(page, /<body class="theme-research r9 r9-research r11 r11-research" data-theme="research11" data-appearance="dark" data-product="streams">/)
  assert.ok(page.includes('<link rel="stylesheet" data-theme-sheet href="/template/shared/round9/research.css">'))
  assert.match(await (await get(h, 'app://ui/index.html')).text(), /<html lang="zh-CN" data-theme="research" data-appearance="light">/, 'without a look: the default')
  // redesign R1: the template's face asks for template/shared/fonts/NotoSansSC-VF.ttf — the same bytes as fonts/
  const aliased = await get(h, 'app://ui/template/shared/fonts/NotoSansSC-VF.ttf')
  assert.equal(aliased.status, 200)
  assert.ok(Buffer.from(await aliased.arrayBuffer()).equals(readFileSync(join(DESKTOP_DIR, 'src', 'renderer', 'fonts', 'NotoSansSC-VF.ttf'))))
  assert.equal((await get(h, 'app://ui/template/shared/fonts/OFL-NotoSansSC.txt')).status, 404, 'control: no other file of that folder')
  assert.equal((await get(h, 'app://ui/template/shared/round12/brand/streams.svg')).status, 200, 'the template\'s mark (line.css)')
})

test('D2 · a path naming another machine is refused at once, before the file system: no network share is opened', async () => {
  // 192.0.2.1 is an address nobody answers (TEST-NET-1): handed to the file system as \\192.0.2.1\share\x.png,
  // Windows tries SMB and gives up only after about 21 s — so a fast 404 means no share was opened. A WebDAV-style
  // path (\\127.0.0.1@port\…) would reach the listener below while Windows' WebDAV client runs.
  let connections = 0
  const listener = createServer(socket => { connections++; socket.destroy() })
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port
  try {
    const h = handler(true)
    for (const u of [
      'app://ui///192.0.2.1/share/x.png',
      'app://ui/%2f%2f192.0.2.1%2fshare%2fx.png',
      'app://ui/shared///192.0.2.1/share/x.mjs',
      `app://ui///127.0.0.1@${port}/share/x.png`,
      `app://ui/%5c%5c127.0.0.1@${port}%5cshare%5cx.png`,
    ]) {
      const t0 = Date.now()
      const r = await get(h, u)
      const ms = Date.now() - t0
      assert.equal(r.status, 404, u)
      assert.ok(ms < 1000, `${u} took ${ms} ms`)
    }
  } finally {
    await new Promise(resolve => listener.close(resolve))
  }
  assert.equal(connections, 0, 'no connection reached the listener')
})

test('the path rule (safe-path.mjs): names of any script; no empty segment, dot segment, drive, colon, backslash, %, control character, device name, trailing dot or space', async () => {
  const cp = String.fromCodePoint
  for (const ok of ['/index.html', '/styles/screens/settings.css', '/vendor/htm.module.js', '/shared/fetch-states.mjs',
    '/styles/样式.css', '/texts/说明.js', '/out/第 1 稿（定稿）.html', '/x y.js', '/COM10.js', '/console.js', '/résumé.html']) {
    assert.ok(safeSegments(ok), ok)
  }
  for (const bad of ['//host/share/x.png', '/a//b.js', '/styles/', '/./x.js', '/../main/main.mjs', '/C:/Windows/win.ini', '/c:', '/index.html:stream',
    '/a\\b.js', '/con', '/aux.js', '/COM1.css', '/lpt9', `/com${cp(0xb9)}`, '/CONIN$', '/nul .txt', '/index.html.', '/index.html ', '/ index.html', '/.hidden',
    '/%2e%2e', '/a%b.js', '/a<b', '/a>b', '/a|b', '/a?b', '/a*b', '/a"b', `/x${cp(0xff0f)}y`, `/x${cp(0xff3c)}y`, `/x${cp(0x2215)}y`,
    `/x${cp(0)}.js`, `/x${cp(0x1f)}.js`, `/x${cp(0x200b)}.js`, `/x${cp(0x202e)}.js`, `/x${cp(0x3000)}y.js`, `/x${cp(0xa0)}y.js`, `/x${cp(0x2028)}y.js`,
    'index.html', '']) {
    assert.equal(safeSegments(bad), null, JSON.stringify(bad))
  }
  const h = handler(true)
  for (const u of ['app://ui/%2e%2e/main/main.mjs', 'app://ui/..%2fmain%2fmain.mjs', 'app://ui/C:%5cWindows%5cwin.ini', 'app://ui/vendor/../../package.json',
    'app://ui/node_modules/preact/package.json', 'app://ui/vendor/htm.mjs', 'app://ui/index.html%00.js', 'app://ui/con', 'app://other/index.html']) {
    assert.equal((await get(h, u)).status, 404, u)
  }
})

test('N1 · a file whose name is Chinese (or has a space, full-width brackets) loads; the same name spelled to break the rule does not', async () => {
  const root = tempDir('st-desktop-names-')
  try {
    const files = { 'styles/样式.css': 'body{}', 'texts/说明.js': 'export const A = 1', '第 1 稿（定稿）.html': '<p>x</p>' }
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), text)
    }
    const h = createAppProtocolHandler({ rendererDir: root, sharedDir: join(root, 'shared'), vendor: {}, csp: "default-src 'none'", dev: false })
    for (const [name, text] of Object.entries(files)) {
      const r = await get(h, `app://ui/${encodeURI(name)}`)
      assert.equal(r.status, 200, name)
      assert.equal(await r.text(), text, name)
    }
    // the same file with a trailing space, a trailing dot, an NTFS stream: Windows would open it, the rule does not
    for (const u of ['app://ui/styles/%E6%A0%B7%E5%BC%8F.css%20', 'app://ui/styles/%E6%A0%B7%E5%BC%8F.css.', 'app://ui/styles/%E6%A0%B7%E5%BC%8F.css%3A%3A%24DATA']) {
      assert.equal((await get(h, u)).status, 404, u)
    }
  } finally {
    removeTree(root, { waitMs: 5000 })
  }
})

test('the page\'s words in the user\'s language (docs/desktop.md��): in English texts/<name>.js is answered with texts-en/<name>.js when that exists, else the Chinese file; in Chinese and by default the Chinese file', async () => {
  const renderer = join(DESKTOP_DIR, 'src', 'renderer')
  const text = f => readFileSync(join(renderer, f), 'utf8')
  const en = handler(true, () => 'en')
  const zh = handler(true, () => 'zh-CN')
  assert.notEqual(text('texts-en/common.js'), text('texts/common.js'), 'control: the two tables differ')
  assert.equal(await (await get(en, 'app://ui/texts/common.js')).text(), text('texts-en/common.js'), 'English: the en table in the zh file\'s place')
  assert.equal(await (await get(en, 'app://ui/texts/settings.js')).text(), text('texts-en/settings.js'))
  assert.equal(await (await get(zh, 'app://ui/texts/common.js')).text(), text('texts/common.js'), 'Chinese: the zh table')
  assert.equal(await (await get(handler(true), 'app://ui/texts/common.js')).text(), text('texts/common.js'), 'no locale given: Chinese')
  assert.equal(await (await get(en, 'app://ui/texts/kit.js')).text(), text('texts/kit.js'), 'a module without an en table: the zh file (development)')
  assert.equal((await get(en, 'app://ui/texts-en/common.js')).status, 200, 'the en folder is a renderer folder like any other')
  assert.equal((await get(handler(false, () => 'en'), 'app://ui/texts/kit.js')).status, 404, 'DEV_ONLY still refused when packaged, in English too')
  assert.equal((await get(en, 'app://ui/texts/no-such-table.js')).status, 404)
  // a locale asked on every request: the same handler answers the other language after a switch
  let current = 'zh-CN'
  const h = handler(true, () => current)
  // redesign R6b-2: read with shell.js — it used to be screens.js, the placeholder screen's table, deleted as dead code
  assert.equal(await (await get(h, 'app://ui/texts/shell.js')).text(), text('texts/shell.js'))
  current = 'en'
  assert.equal(await (await get(h, 'app://ui/texts/shell.js')).text(), text('texts-en/shell.js'))
  assert.notEqual(text('texts/shell.js'), text('texts-en/shell.js'), 'control: the two tables differ')
  // and the deleted table is not served in either language
  assert.equal((await get(h, 'app://ui/texts/screens.js')).status, 404)
})

test('D7 · the component gallery\'s files are served only in a development run, whatever the case of the request (N2)', async () => {
  assert.deepEqual([...DEV_ONLY].sort(), ['screens/kit.js', 'styles/screens/kit.css', 'texts/kit.js'])
  const variants = ['screens/KIT.js', 'Screens/kit.js', 'SCREENS/KIT.JS', 'texts/Kit.js', 'TEXTS/kit.js', 'styles/screens/KIT.css', 'Styles/Screens/Kit.CSS']
  for (const f of [...DEV_ONLY, ...variants]) {
    assert.equal((await get(handler(false), `app://ui/${f}`)).status, 404, `packaged: ${f}`)
    assert.equal((await get(handler(true), `app://ui/${f}`)).status, 200, `development: ${f}`)
  }
})
