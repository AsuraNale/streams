// 1.1.1 P12 (待办 D2): 1.1 replaced what this 1.0 test checks — V3 is checked by 1.1's B8 now (来源状态由 1.1 的六种状态取代（多一种「要登录」）); kept here, not run by tests/acceptance/run.mjs (../replaced.mjs).
// V3 · 五种抓取状态各能触发，且界面文案和「怎么办」对应正确
// 怎么核：用假服务器分别返回 200 空、404、503、429、403 和代理拒绝
//
// Each case goes through the desktop's 「试抓」 service (createSourcesService().trySource → the core's fetchSource) against a
// server on 127.0.0.1; the status and hint codes it returns are turned into words with the page's own tables
// (texts/common.js, texts-en/common.js FETCH_STATES / FETCH_HINTS), which are checked against the words of 05-措辞规范 第三节
// 「五种抓取状态」 (redesign R6b-1; 维护者 11-11 过目第 1 条: V3's sentence stays, the five words and the 处理建议 change — this comment
// used to point at the plan's §1.7 对照表 and mockups S2 / S5). The proxy refusal is run twice: as the error text the toolkit's fetcher meets ("Tunnel connection
// failed: 403"), injected as fetchImpl, and through a real proxy on 127.0.0.1 that refuses the CONNECT, with Node's own
// proxy support switched on (NODE_USE_ENV_PROXY=1) in a child process.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { CORE_DIR, core, fileUrl } from '../support/paths.mjs'
import { startFakeServer } from '../support/library.mjs'
import { EMPTY_RSS, RSS2 } from '../../../core/test/support/feeds.mjs'
import { createSourcesService } from '../../../desktop/src/main/services/sources.mjs'
import * as ZH from '../../../desktop/src/renderer/texts/common.js'
import * as EN from '../../../desktop/src/renderer/texts-en/common.js'

// redesign R6b-1: the five states' words (05-措辞规范 第三节「五种抓取状态」: 正常 / 无更新 / 地址无效 / 暂时失败 / 访问被拒; English from
// 05 and docs/checks/2026-11-13-r6b/contract.md R6b-1) and what the 处理建议 of each must say. The names PLAN_WORDS / PLAN_HINTS
// stay; what they hold used to be the v1 plan's words (方案 §1.7) and fragments of the v1 mockups' sentences.
// 1.1 W2: the 1.1 acceptance standard's B8 takes V3's place here — 「六种来源状态……多一种『要登录』」: login, its word and its 处理建议
const PLAN_WORDS = { ok: '正常', empty: '无更新', gap: '地址无效', failed: '暂时失败', blocked: '访问被拒', login: '要登录' }
const PLAN_WORDS_EN = { ok: 'OK', empty: 'No updates', gap: 'Invalid address', failed: 'Temporary failure', blocked: 'Access denied', login: 'Sign-in required' }
const PLAN_HINTS = {
  // the contract's four sentences (written to 05 第三节「处理建议一句按正式口气重写」): 「无需处理。」「该地址无效，重试无法解决。请修改地址，或移除该来源。」
  // 「下次运行时将自动重试，无需修改地址。」「该网站拒绝程序访问，重试无法解决。请改用其他来源。」
  'zh-CN': { none: ['无需处理'], 'fix-address-or-remove': ['地址无效', '重试无法解决', '修改地址', '移除该来源'], 'retry-next-round': ['下次运行', '自动重试', '无需修改地址'], 'blocked-remove-source': ['拒绝程序访问', '重试无法解决', '改用其他来源'], 'login-not-supported': ['需要登录', '读不了', '改用其他来源'] },
  en: { none: ['No action needed'], 'fix-address-or-remove': ['not valid', 'retrying will not help', 'Change the address', 'remove this source'], 'retry-next-round': ['next run', 'no need to change the address'], 'blocked-remove-source': ['does not allow programs', 'retrying will not help', 'different source'], 'login-not-supported': ['sign in', 'cannot read', 'different source'] },
}
// the reverse sentinel: what only the sentences of 地址无效 / 访问被拒 say — a temporary failure must not be told any of it
const NOT_FOR_FAILED = {
  'zh-CN': ['重试无法解决', '移除该来源', '改用其他来源'],
  en: ['retrying will not help', 'remove this source', 'different source'],
}
const BAD = ['gap', 'failed', 'blocked', 'login']

/** What is wrong with one language's tables (the same function is run on a broken copy below). */
function dictionaryProblems({ FETCH_STATES, FETCH_HINTS }, lang) {
  const problems = []
  for (const s of core.FETCH_STATES) {
    const word = FETCH_STATES[s]
    if (typeof word !== 'string' || word.trim() === '') { problems.push(`${lang}: no word for ${s}`); continue }
    const planned = (lang === 'zh-CN' ? PLAN_WORDS : PLAN_WORDS_EN)[s]
    if (word !== planned) problems.push(`${lang}: ${s} is 「${word}」, the plan says 「${planned}」`)
    const hint = core.hintOf(s)
    const sentence = FETCH_HINTS[hint]
    if (typeof sentence !== 'string' || sentence.trim() === '') { problems.push(`${lang}: no 怎么办 for ${s} (${hint})`); continue }
    for (const must of PLAN_HINTS[lang][hint]) if (!sentence.includes(must)) problems.push(`${lang}: 怎么办 of ${s} 「${sentence}」 does not say 「${must}」`)
  }
  const words = core.FETCH_STATES.map(s => FETCH_STATES[s])
  if (new Set(words).size !== words.length) problems.push(`${lang}: two states share a word`)
  const sentences = BAD.map(s => FETCH_HINTS[core.hintOf(s)])
  if (new Set(sentences).size !== BAD.length) problems.push(`${lang}: two of the bad states share one 怎么办`)
  for (const not of NOT_FOR_FAILED[lang]) if (FETCH_HINTS[core.hintOf('failed')]?.includes(not)) problems.push(`${lang}: a temporary failure is told 「${not}」`)
  return problems
}

// 「试抓」 as the page calls it (bridge trySource); a try needs no open library
function tryUrl(url, fetchContext = { timeoutMs: 3000 }) {
  const { handlers } = createSourcesService({ library: { require: () => { throw new Error('no library needed') }, current: () => null }, emit: () => 0, log: () => {}, core, fetchContext })
  return handlers.trySource({ name: 'probe', kind: 'rss', url })
}

const words = (r, T) => ({ word: T.FETCH_STATES[r.status], hint: T.FETCH_HINTS[r.hint] })

test('V3 dictionaries: each of the five states has the plan\'s word and a 「怎么办」 that says the plan\'s action (中英两套)', () => {
  assert.deepEqual(core.FETCH_STATES, ['ok', 'empty', 'gap', 'failed', 'blocked', 'login'])
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
  // redesign R6b-1, reverse: any state whose word is not 05's is reported, in both languages (the English words are compared
  // word for word now; they used to be checked only for being there and differing), and so is a 处理建议 that says 下一轮 for 下次运行
  for (const s of ['empty', 'gap', 'blocked']) assert.ok(dictionaryProblems({ FETCH_STATES: { ...ZH.FETCH_STATES, [s]: `${ZH.FETCH_STATES[s]}了` }, FETCH_HINTS: ZH.FETCH_HINTS }, 'zh-CN').some(p => p.includes(`${s} is 「`)), s)
  for (const s of core.FETCH_STATES) assert.ok(dictionaryProblems({ FETCH_STATES: { ...EN.FETCH_STATES, [s]: EN.FETCH_STATES[s].toLowerCase() + '!' }, FETCH_HINTS: EN.FETCH_HINTS }, 'en').some(p => p.includes(`${s} is 「`)), s)
  const otherHint = { FETCH_STATES: ZH.FETCH_STATES, FETCH_HINTS: { ...ZH.FETCH_HINTS, 'retry-next-round': ZH.FETCH_HINTS['retry-next-round'].replace('下次运行', '下一轮') } }
  assert.ok(dictionaryProblems(otherHint, 'zh-CN').some(p => p.includes('does not say 「下次运行」')))
  // reverse of the sentinel: a temporary failure told what only 地址无效 / 访问被拒 are told is reported (中英)
  const wrongZh = { FETCH_STATES: ZH.FETCH_STATES, FETCH_HINTS: { ...ZH.FETCH_HINTS, 'retry-next-round': `${ZH.FETCH_HINTS['retry-next-round']}重试无法解决。` } }
  assert.ok(dictionaryProblems(wrongZh, 'zh-CN').some(p => p.includes('a temporary failure is told 「重试无法解决」')))
  const wrongEn = { FETCH_STATES: EN.FETCH_STATES, FETCH_HINTS: { ...EN.FETCH_HINTS, 'retry-next-round': `${EN.FETCH_HINTS['retry-next-round']} Use a different source.` } }
  assert.ok(dictionaryProblems(wrongEn, 'en').some(p => p.includes('a temporary failure is told 「different source」')))
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
    // 1.1 W2 (B8): a sign-in page where the feed should be, and a 401
    ['/login', { status: 200, body: '<html><head><title>Sign in</title></head><body><form><input name="u"><input type="password" name="p"><button>Sign in</button></form></body></html>', contentType: 'text/html' }, 'login', 'login-not-supported', undefined],
    ['/members-only', { status: 401, body: 'sign in first', contentType: 'text/plain' }, 'login', 'login-not-supported', undefined],
  ]
  const seen = new Set()
  for (const [path, spec, status, hint, retryAfter] of cases) {
    const url = srv.route(path, spec)
    const r = await tryUrl(url)
    assert.equal(r.status, status, `${path}: ${JSON.stringify(r)}`)
    assert.equal(r.hint, hint, path)
    assert.equal(srv.hits(path), 1, `${path} was really requested`)
    // redesign R5a (O9; docs/checks/2026-11-12-r5a/contract.md R5a-6): the 「试抓」 answer the page gets no longer carries the
    // HTTP code or the fetcher's message (they go to 复制诊断信息), so the two checks below read them where they are made — the
    // core's fetchSource of the same address, which the next line already calls. Only where they are read changed: the same
    // HTTP code and the same Retry-After message are asserted (they used to be read as r.http / r.message).
    const direct = await core.fetchSource({ name: 'probe', kind: 'rss', url }, core.makeContext({ timeoutMs: 3000 }))
    assert.equal(direct.http, spec.status, path)
    if (retryAfter !== undefined) assert.match(direct.message, new RegExp(`Retry-After: ${retryAfter}s`), path)
    if (retryAfter !== undefined) assert.equal(direct.retryAfterSeconds, retryAfter, `${path}: retryAfterSeconds`)
    const zh = words(r, ZH)
    assert.equal(zh.word, PLAN_WORDS[status], path)
    for (const must of PLAN_HINTS['zh-CN'][hint]) assert.ok(zh.hint.includes(must), `${path}: ${zh.hint}`)
    assert.ok(words(r, EN).word && words(r, EN).hint, `${path}: English words`)
    seen.add(status)
  }
  assert.deepEqual([...seen].sort(), [...core.FETCH_STATES].sort(), 'all six states were produced')
  // reverse: 「无更新」 and 「没抓到」 are never merged — the empty feed and the 404 differ in state, word and hint
  const empty = await tryUrl(`${srv.base}/empty`)
  const missing = await tryUrl(`${srv.base}/missing`)
  assert.notEqual(empty.status, missing.status)
  assert.notEqual(ZH.FETCH_HINTS[empty.hint], ZH.FETCH_HINTS[missing.hint])
})

test('V3 proxy refusal, as the toolkit meets it ("Tunnel connection failed: 403"): blocked, 访问被拒, 请改用其他来源', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw new TypeError('fetch failed', { cause: new Error('Tunnel connection failed: 403 Forbidden') }) }
  const r = await tryUrl('https://feed.example.test/feed', { fetchImpl, timeoutMs: 3000 })
  assert.equal(calls, 1)
  assert.equal(r.status, 'blocked', JSON.stringify(r))
  assert.equal(r.hint, 'blocked-remove-source')
  // redesign R6b-1: the word and the fragment of the new sentence (05 第三节) — the checks are the same two
  assert.equal(ZH.FETCH_STATES[r.status], '访问被拒')
  assert.ok(ZH.FETCH_HINTS[r.hint].includes('改用其他来源'))
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
    assert.equal(r.status, 'blocked', `a proxy refusing the request must be 访问被拒 (方案 4.5: a 403 and a proxy's refusal are the same state); for ${r.url} fetchSource said ${r.status} (${ZH.FETCH_STATES[r.status]}, 「${ZH.FETCH_HINTS[r.hint]}」): ${r.message}`)
    assert.equal(r.hint, 'blocked-remove-source')
  }
})
