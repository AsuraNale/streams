// Events from the main process to the page (docs/desktop.md §四「事件」) on the running app. One channel carries
// { topic, payload }; main sends with emit(topic, payload) (src/main/events.mjs), the page subscribes with
// window.streams.onEvent(topic, callback) — only to the topics docs/desktop.md §四 lists — gets the payload alone,
// and unsubscribes with the function onEvent returns. The documented example end to end: a setting changes
// (setLanguage through the bridge) → settings-changed → the page re-reads the app state, and open-screen → the page
// goes to the screen named. Also (D9): the sidebar keeps its 232px whatever the words are.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EVENT_CHANNEL, EVENT_TOPICS, createEmitter } from '../src/main/events.mjs'
import { appSession, ready } from './support/app.mjs'

const s = appSession()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** Send a raw message on the event channel to the app's window, as main would (bypassing emit's own check). */
const send = message => s.app.evaluate(({ BrowserWindow }, [channel, m]) => { BrowserWindow.getAllWindows()[0].webContents.send(channel, m) }, [EVENT_CHANNEL, message])

test('emit (main): a listed topic only, to the app\'s own pages that are still open', () => {
  const sent = []
  const win = (url, destroyed = false) => ({ isDestroyed: () => destroyed, webContents: { getURL: () => url, send: (...a) => sent.push([url, ...a]) } })
  const emit = createEmitter(() => [win('app://ui/index.html'), win('app://ui/index.html', true), win('about:blank'), win('https://example.com/')])
  assert.equal(emit('settings-changed'), 1)
  assert.deepEqual(sent, [['app://ui/index.html', 'streams:event', { topic: 'settings-changed', payload: null }]])
  assert.throws(() => emit('made-up-topic', {}), /no event topic/)
  assert.throws(() => emit('toString'), /no event topic/)
  assert.deepEqual(Object.keys(EVENT_TOPICS).sort(), ['open-screen', 'settings-changed', 'update'])
})

test('onEvent (page): only a listed topic and a function; the payload alone arrives; the returned function unsubscribes', async () => {
  const setup = await s.page.evaluate(() => {
    const out = {}
    for (const [k, args] of [['unlisted', ['made-up-topic', () => {}]], ['inherited', ['toString', () => {}]], ['notFunction', ['settings-changed', 'x']]]) {
      try { window.streams.onEvent(...args); out[k] = 'accepted' } catch { out[k] = 'refused' }
    }
    window.__got = []
    window.__off = window.streams.onEvent('settings-changed', (...a) => window.__got.push(a))
    out.off = typeof window.__off
    return out
  })
  assert.deepEqual(setup, { unlisted: 'refused', inherited: 'refused', notFunction: 'refused', off: 'function' })
  await send({ topic: 'made-up-topic', payload: { n: 0 } }) // not listed: the preload drops it
  await send('not a message')
  await send({ topic: 'settings-changed', payload: { n: 1 } })
  await s.page.waitForFunction(() => window.__got.length > 0, null, { polling: 100, timeout: 10_000 })
  await sleep(300)
  assert.deepEqual(await s.page.evaluate(() => window.__got), [[{ n: 1 }]], 'one call, with the payload alone')
  await s.page.evaluate(() => window.__off())
  await send({ topic: 'settings-changed', payload: { n: 2 } })
  await sleep(600)
  assert.deepEqual(await s.page.evaluate(() => window.__got), [[{ n: 1 }]], 'nothing after unsubscribing')
  await ready(s.page, 'today')
})

test('a setting changed through the bridge → settings-changed → the page re-reads the app state, no reload', async () => {
  await ready(s.page, 'today')
  await s.page.evaluate(() => { window.__sameDocument = true; window.__events = []; window.streams.onEvent('settings-changed', p => window.__events.push(p)) })
  // the developer switch: a change the page can see in the app state (the sidebar does not show it, so the test reads the state)
  const r = await s.page.evaluate(() => window.streams.setShowDeveloperInfo(true))
  assert.deepEqual(r, { ok: true, data: { showDeveloperInfo: true } })
  await s.page.waitForFunction(() => window.__events.length > 0, null, { polling: 100, timeout: 10_000 })
  assert.deepEqual(await s.page.evaluate(() => window.__events), [null])
  assert.equal((await s.page.evaluate(() => window.streams.getAppState())).data.showDeveloperInfo, true)
  assert.equal(await s.page.evaluate(() => window.__sameDocument), true, 'the same page, not reloaded')
  // control: a change back is seen too
  await s.page.evaluate(() => window.streams.setShowDeveloperInfo(false))
  await s.page.waitForFunction(() => window.__events.length > 1, null, { polling: 100, timeout: 10_000 })
})

test('open-screen → the page goes to the screen named (an unknown screen is ignored)', async () => {
  await send({ topic: 'open-screen', payload: { screen: 'status' } })
  await ready(s.page, 'status')
  assert.equal(await s.page.evaluate(() => document.querySelector('[data-nav="status"]').getAttribute('aria-current')), 'page')
  await send({ topic: 'open-screen', payload: { screen: 'no-such-screen' } })
  await sleep(500)
  await ready(s.page, 'status')
  await send({ topic: 'open-screen', payload: { screen: 'today' } })
  await ready(s.page, 'today')
})

test('D9 · the sidebar keeps its 232px and the main area starts at 244px; nothing overflows the page', async () => {
  await ready(s.page, 'today')
  const m = await s.page.evaluate(() => {
    const r = el => el.getBoundingClientRect()
    const side = document.querySelector('.st-sidebar')
    const main = document.querySelector('main')
    return {
      sidebar: r(side).width,
      sidebarOverflow: side.scrollWidth - side.clientWidth,
      entries: document.querySelectorAll('[data-nav]').length,
      mainLeft: r(main).left,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
  assert.deepEqual(m, { sidebar: 232, sidebarOverflow: 0, entries: 8, mainLeft: 244, pageOverflow: 0 })
})

test('no page errors', () => {
  assert.deepEqual(s.errors, [])
})
