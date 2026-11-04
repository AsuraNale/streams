// V3 · 五种抓取状态各能触发，且界面文案和「怎么办」对应正确
// 怎么核：用假服务器分别返回 200 空、404、503、429、403 和代理拒绝
//
// Each case goes through the desktop's 「试抓」 service (createSourcesService().trySource → the core's fetchSource) against a
// server on 127.0.0.1; the status and hint codes it returns are turned into words with the page's own tables
// (texts/common.js, texts-en/common.js FETCH_STATES / FETCH_HINTS), which are checked against the plan's words (§1.7 对照表,
// 4.5, mockups S2 / S5). The proxy refusal is run twice: as the error text the toolkit's fetcher meets ("Tunnel connection
// failed: 403"), injected as fetchImpl, and through a real proxy on 127.0.0.1 that refuses the CONNECT, with Node's own
// proxy support switched on (NODE_USE_ENV_PROXY=1) in a child process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { CORE_DIR, core, fileUrl } from './support/paths.mjs'
import { startFakeServer } from './support/library.mjs'
import { EMPTY_RSS, RSS2 } from '../../core/test/support/feeds.mjs'
import { createSourcesService } from '../../desktop/src/main/services/sources.mjs'
import * as ZH from '../../desktop/src/renderer/texts/common.js'
import * as EN from '../../desktop/src/renderer/texts-en/common.js'

// the plan's words for the five states (方案 §1.7 对照表 / 4.5 fetch_log) and the 「怎么办」 each must say
const PLAN_WORDS = { ok: '正常', empty: '没新内容', gap: '地址有问题', failed: '暂时失败', blocked: '被拒绝' }
const PLAN_HINTS = {
  // mockups S2 / S5: 「这不是临时故障，重试没用：改地址，或删掉这个来源」「下一轮会再试；不需要你改地址」「对方不让程序抓，重试没用；换一个来源」
  'zh-CN': { none: ['不需要你做什么'], 'fix-address-or-remove': ['重试没用', '改地址', '删掉这个来源'], 'retry-next-round': ['下一轮', '不需要你改地址'], 'blocked-remove-source': ['对方不让程序抓', '重试没用', '换一个来源'] },
  en: { none: ['Nothing for you to do'], 'fix-address-or-remove': ['retrying will not help', 'change the address', 'remove this source'], 'retry-next-round': ['next round', 'no need to change the address'], 'blocked-remove-source': ['does not let programs', 'retrying will not help', 'another source'] },
}
const BAD = ['gap', 'failed', 'blocked']

/** What is wrong with one language's tables (the same function is run on a broken copy below). */
function dictionaryProblems({ FETCH_STATES, FETCH_HINTS }, lang) {
  const problems = []
  for (const s of core.FETCH_STATES) {
    const word = FETCH_STATES[s]
    if (typeof word !== 'string' || word.trim() === '') { problems.push(`${lang}: no word for ${s}`); continue }
    if (lang === 'zh-CN' && word !== PLAN_WORDS[s]) problems.push(`${lang}: ${s} is 「${word}」, the plan says 「${PLAN_WORDS[s]}」`)
    const hint = core.hintOf(s)
    const sentence = FETCH_HINTS[hint]
    if (typeof sentence !== 'string' || sentence.trim() === '') { problems.push(`${lang}: no 怎么办 for ${s} (${hint})`); continue }
    for (const must of PLAN_HINTS[lang][hint]) if (!sentence.includes(must)) problems.push(`${lang}: 怎么办 of ${s} 「${sentence}」 does not say 「${must}」`)
  }
  const words = core.FETCH_STATES.map(s => FETCH_STATES[s])
  if (new Set(words).size !== words.length) problems.push(`${lang}: two states share a word`)
  const sentences = BAD.map(s => FETCH_HINTS[core.hintOf(s)])
  if (new Set(sentences).size !== BAD.length) problems.push(`${lang}: two of the bad states share one 怎么办`)
  if (lang === 'zh-CN' && FETCH_HINTS[core.hintOf('failed')]?.includes('重试没用')) problems.push(`${lang}: a temporary failure is told retrying will not help`)
  return problems
}

// 「试抓」 as the page calls it (bridge trySource); a try needs no open library
function tryUrl(url, fetchContext = { timeoutMs: 3000 }) {
  const { handlers } = createSourcesService({ library: { require: () => { throw new Error('no library needed') }, current: () => null }, emit: () => 0, log: () => {}, core, fetchContext })
  return handlers.trySource({ name: 'probe', kind: 'rss', url })
}

const words = (r, T) => ({ word: T.FETCH_STATES[r.status], hint: T.FETCH_HINTS[r.hint] })

test('V3 dictionaries: each of the five states has the plan\'s word and a 「怎么办」 that says the plan\'s action (中英两套)', () => {
  assert.deepEqual(core.FETCH_STATES, ['ok', 'empty', 'gap', 'failed', 'blocked'])
  assert.deepEqual(dictionaryProblems(ZH, 'zh-CN'), [])
  assert.deepEqual(dictionaryProblems(EN, 'en'), [])
  assert.deepEqual(Object.keys(EN.FETCH_STATES).sort(), Object.keys(ZH.FETCH_STATES).sort())
  assert.deepEqual(Object.keys(EN.FETCH_HINTS).sort(), Object.keys(ZH.FETCH_HINTS).sort())
})

test('V3 dictionaries, reverse: a table with gap called 暂时失败, or with the gap and failed sentences swapped, is reported', () => {
  const renamed = { FETCH_STATES: { ...ZH.FETCH_STATES, gap: '暂时失败' }, FETCH_HINTS: ZH.FETCH_HINTS }
  assert.ok(dictionaryProblems(renamed, 'zh-CN').some(p => p.includes('gap is 「暂时失败」')))
  const swapped = { FETCH_STATES: ZH.FETCH_STATES, FETCH_HINTS: { ...ZH.FETCH_HINTS, 'fix-address-or-remove': ZH.FETCH_HINTS['retry-next-round'], 'retry-next-round': ZH.FETCH_HINTS['fix-address-or-remove'] } }
  assert.ok(dictionaryProblems(swapped, 'zh-CN').length >= 2)
  const merged = { FETCH_STATES: EN.FETCH_STATES, FETCH_HINTS: { ...EN.FETCH_HINTS, 'blocked-remove-source': EN.FETCH_HINTS['fix-address-or-remove'] } }
  assert.ok(dictionaryProblems(merged, 'en').some(p => p.includes('share one')))
})

test('V3 server: 200 with items, 200 empty, 404, 503 (Retry-After), 429 (Retry-After), 403 each give their state, hint and words', async (t) => {
  const srv = await startFakeServer()
  t.after(() => srv.close())
  const cases = [
    ['/items', { status: 200, body: RSS2 }, 'ok', 'none', undefined],
    ['/empty', { status: 200, body: EMPTY_RSS }, 'empty', 'none', undefined],
    ['/missing', { status: 404, body: 'not here', contentType: 'text/plain' }, 'gap', 'fix-address-or-remove', undefined],
    ['/busy', { status: 503, body: 'busy', contentType: 'text/plain', headers: { 'retry-after': '120' } }, 'failed', 'retry-next-round', 120],
    ['/slow-down', { status: 429, body: 'slow down', contentType: 'text/plain', headers: { 'retry-after': '30' } }, 'failed', 'retry-next-round', 30],
    ['/forbidden', { status: 403, body: 'no bots', contentType: 'text/plain' }, 'blocked', 'blocked-remove-source', undefined],
  ]
  const seen = new Set()
  for (const [path, spec, status, hint, retryAfter] of cases) {
    const url = srv.route(path, spec)
    const r = await tryUrl(url)
    assert.equal(r.status, status, `${path}: ${JSON.stringify(r)}`)
    assert.equal(r.hint, hint, path)
    assert.equal(r.http, spec.status, path)
    assert.equal(srv.hits(path), 1, `${path} was really requested`)
    if (retryAfter !== undefined) assert.match(r.message, new RegExp(`Retry-After: ${retryAfter}s`), path)
    const direct = await core.fetchSource({ name: 'probe', kind: 'rss', url }, core.makeContext({ timeoutMs: 3000 }))
    if (retryAfter !== undefined) assert.equal(direct.retryAfterSeconds, retryAfter, `${path}: retryAfterSeconds`)
    const zh = words(r, ZH)
    assert.equal(zh.word, PLAN_WORDS[status], path)
    for (const must of PLAN_HINTS['zh-CN'][hint]) assert.ok(zh.hint.includes(must), `${path}: ${zh.hint}`)
    assert.ok(words(r, EN).word && words(r, EN).hint, `${path}: English words`)
    seen.add(status)
  }
  assert.deepEqual([...seen].sort(), [...core.FETCH_STATES].sort(), 'all five states were produced')
  // reverse: 「没新内容」 and 「没抓到」 are never merged — the empty feed and the 404 differ in state, word and hint
  const empty = await tryUrl(`${srv.base}/empty`)
  const missing = await tryUrl(`${srv.base}/missing`)
  assert.notEqual(empty.status, missing.status)
  assert.notEqual(ZH.FETCH_HINTS[empty.hint], ZH.FETCH_HINTS[missing.hint])
})

test('V3 proxy refusal, as the toolkit meets it ("Tunnel connection failed: 403"): blocked, 被拒绝, 换一个来源', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw new TypeError('fetch failed', { cause: new Error('Tunnel connection failed: 403 Forbidden') }) }
  const r = await tryUrl('https://feed.example.test/feed', { fetchImpl, timeoutMs: 3000 })
  assert.equal(calls, 1)
  assert.equal(r.status, 'blocked', JSON.stringify(r))
  assert.equal(r.hint, 'blocked-remove-source')
  assert.equal(ZH.FETCH_STATES[r.status], '被拒绝')
  assert.ok(ZH.FETCH_HINTS[r.hint].includes('换一个来源'))
  // reverse: a plain connection reset through the same path is a temporary failure, not a refusal
  const reset = await tryUrl('https://feed.example.test/feed', { fetchImpl: async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }) }, timeoutMs: 3000 })
  assert.equal(reset.status, 'failed')
})

// A proxy on 127.0.0.1 that refuses everything: a CONNECT (https) gets 403, a forwarded GET (http) gets 403.
async function refusingProxy() {
  const seen = { connect: 0, get: 0 }
  const server = createServer((req, res) => { seen.get++; res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden by proxy policy') })
  server.on('connect', (req, socket) => { seen.connect++; socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}

// fetchSource with the default context (globalThis.fetch) in a child Node whose own proxy support is on
function fetchThroughProxy(proxyUrl, url) {
  const src = `import { fetchSource } from ${JSON.stringify(fileUrl(join(CORE_DIR, 'src', 'fetch', 'source.mjs')))};\n` +
    `const r = await fetchSource({ name: 'probe', kind: 'rss', url: ${JSON.stringify(url)} }, { timeoutMs: 5000 });\n` +
    'process.stdout.write(JSON.stringify(r));\n'
  const env = { ...process.env, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, NO_PROXY: '' }
  for (const k of ['https_proxy', 'http_proxy', 'no_proxy', 'NODE_OPTIONS']) delete env[k]
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', src], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', reject)
    child.on('close', code => {
      try { resolve(JSON.parse(out)) } catch { reject(new Error(`child exited ${code}: ${out}${err}`)) }
    })
  })
}

test('V3 proxy refusal through a real proxy (Node\'s own proxy support): a refused CONNECT, for an http and an https address, is blocked', async (t) => {
  const proxy = await refusingProxy()
  t.after(() => proxy.close())
  const results = []
  for (const url of ['http://feed.example.test/feed', 'https://feed.example.test/feed']) {
    const before = proxy.seen.connect + proxy.seen.get
    const r = await fetchThroughProxy(proxy.url, url)
    assert.equal(proxy.seen.connect + proxy.seen.get, before + 1, `${url}: the request went to the proxy (and nowhere else)`)
    results.push({ url, status: r.status, hint: r.hint, message: r.message })
  }
  for (const r of results) {
    assert.equal(r.status, 'blocked', `a proxy refusing the request must be 被拒绝 (方案 4.5「403 和代理拒绝算被拒绝」); for ${r.url} fetchSource said ${r.status} (${ZH.FETCH_STATES[r.status]}, 「${ZH.FETCH_HINTS[r.hint]}」): ${r.message}`)
    assert.equal(r.hint, 'blocked-remove-source')
  }
})
