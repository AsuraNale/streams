// 1.1 W6a: a library with a card, made the way 1.1 makes one — from a site on 127.0.0.1 written here, by two real updates of
// the core (core/src/update/run.mjs) with a stand-in update agent that hands in items whose points quote the pages. So the
// state (the 「原文」 of each source), the kept originals, the places of the points and the item whose page cannot be read
// are all the code's own, not written by the test.
//   startCardSite() -> { base, urls, hits, close() }
//   seedCardLibrary(dir, site, { longTitle }) -> { items: [{ url, title, quotes }], missing: url, card }
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'
import { makePdf } from './pdf.mjs'
import { pdfText } from '../../src/main/pdf-text.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href

const PARAS = {
  '/a/1': [
    '十月新能源乘用车零售量为一百一十万辆，比九月增加了不少，月末两周的节奏明显快于月初。',
    '分厂商看，排在前列的几家厂商同比都有增长，插混车型的占比较上月略有上升。',
    '出口方面，主要增量来自东南亚和中东市场，欧洲市场受关税调整影响，环比略有下降。',
    '经销商库存在月末回落到正常区间，没有明显积压，四季度的增长预期没有变化。',
  ],
  '/a/2': [
    '固态电池方面，几家电池厂都公布了中试线的进度，量产时间表集中在两年以后。',
    '宁德时代表示，硫化物路线的小批量试生产仍按原计划推进，没有提前。',
    '业内人士认为，装车验证要先在高端车型上做，成本下降还要等材料体系成熟。',
  ],
}
// each paragraph gets a second sentence, so a page holds more than the 200 characters an article needs (core ARTICLE_MIN)
const MORE = '这一段的数字来自协会每月发布的数据，口径和上个月相同，单位为辆或者吉瓦时。'
const textOf = paras => paras.map(p => `${p}${MORE}`)
const article = (title, paras) => `<html><head><title>${title}</title></head><body><article><h1>${title}</h1>${textOf(paras).map(p => `<p>${p}</p>`).join('')}</article></body></html>`
const listPage = links => `<html><head><title>列表</title></head><body><nav><a href="/">首页</a> <a href="/about">关于</a> <a href="/help">帮助</a></nav><ul>${links.map(l => `<li><a href="${l}">${l}</a></li>`).join('')}</ul></body></html>`
const LOGIN = '<html><head><title>登录</title></head><body><form action="/session"><input name="user"><input type="password" name="pw"><button>登录</button></form></body></html>'
const PDF = makePdf([['Battery report 2026', 'Solid-state battery pilot lines are running at three makers in China this year.', 'Mass production is planned for 2028 at the earliest, according to the makers.', 'Sulfide electrolytes lead the pilot lines; oxide and polymer lines follow later.', 'Vehicle tests start with premium models, where cost matters less than range.', 'Costs fall only when the material supply chain matures, the report says.']])

export async function startCardSite() {
  const site = { list: ['/old/1', '/old/2'], reports: ['/old/r'], hits: [] }
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    site.hits.push(path)
    const send = (status, type, body) => { res.writeHead(status, { 'content-type': type }); res.end(body) }
    if (path === '/list') return send(200, 'text/html; charset=utf-8', listPage(site.list))
    if (path === '/reports') return send(200, 'text/html; charset=utf-8', listPage(site.reports))
    if (path === '/members') return send(200, 'text/html; charset=utf-8', LOGIN)
    if (path === '/locked') return send(200, 'text/html; charset=utf-8', LOGIN)
    if (path === '/doc.pdf') return send(200, 'application/pdf', PDF)
    if (PARAS[path]) return send(200, 'text/html; charset=utf-8', article(path === '/a/1' ? '十月新能源乘用车零售快报' : '固态电池中试线进度', PARAS[path]))
    return send(404, 'text/html', '<html><body>no</body></html>')
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  site.base = base
  site.urls = { a1: `${base}/a/1`, a2: `${base}/a/2`, pdf: `${base}/doc.pdf`, locked: `${base}/locked` }
  site.close = () => new Promise(r => server.close(r))
  return site
}

export async function seedCardLibrary(dir, site, { longTitle = false } = {}) {
  const core = await import(CORE)
  const card = {
    name: '电动车测试库',
    definition: { summary: '一座跟进中国电动车和动力电池的测试库：月度销量、出海、固态电池。', purpose: '行业研究', scope: '对象：车企和电池厂；行业：新能源车；地域：中国；规模：主要车企', exclude: '自媒体和营销号', trust: '公司公告和协会数据（我替你定的）', rhythm: '每天一次', language: '中文简报，英文原文照收（我替你定的）', hard: '每条要有一手出处' },
    decide: [{ what: '储能电池收不收', default: '不收' }],
    collect: ['月度销量和交付', '固态电池进展'], skip: ['试驾评测'],
    sources: [
      { name: '数据站', url: `${site.base}/list`, status: '读得到' },
      { name: '报告库', url: `${site.base}/reports`, status: '读得到' },
      { name: '会员区', url: `${site.base}/members`, status: '要登录' },
      { name: '固态电池', query: '固态电池 装车', status: '检索词' },
    ],
    unreadable: [{ name: '某协会', url: `${site.base}/assoc`, reason: '要登录' }],
    pick: ['新出的月度数据先收'], write: ['写清数字和出处'], samples: [{ title: '样例', url: `${site.base}/old/1`, date: '2026-11-20' }],
  }
  // the world's library (an empty one, made by makeWorld) or a new folder
  if (!existsSync(join(dir, 'streams.json'))) core.createLibrary(dir, { name: card.name, language: 'zh-CN' })
  core.writeCard(dir, card)
  const quotes = { '/a/1': [PARAS['/a/1'][0], PARAS['/a/1'][2], PARAS['/a/1'][3]], '/a/2': [PARAS['/a/2'][0], PARAS['/a/2'][1], PARAS['/a/2'][2]] }
  const item = (path, title, what, texts) => ({ url: `${site.base}${path}`, title, date: '2026-11-21', due: '', what, points: texts.map((t, i) => ({ text: t, quote: quotes[path][i] })), why: '建库卡要「月度销量和固态电池进展」，这是一手数据。' })
  const items = [
    item('/a/1', longTitle ? '十月新能源乘用车零售快报：零售一百一十万辆、月末两周明显快于月初、出口增量来自东南亚和中东、欧洲受关税调整影响环比略降、经销商库存回落到正常区间、四季度增长预期不变' : '十月新能源乘用车零售快报', '一份十月新能源乘用车零售的快报。', ['十月零售一百一十万辆，月末两周更快', '出口增量来自东南亚和中东，欧洲环比略降', '经销商库存回落，四季度预期不变']),
    item('/a/2', '固态电池中试线进度', '几家电池厂公布固态电池中试线进度。', ['量产时间表集中在两年以后', '宁德时代小批量试生产按原计划推进', '装车验证先在高端车型上做']),
  ]
  const agent = answer => ({ async detect() { return { installed: true, loggedIn: true } }, async send() { return { ok: true, json: answer(), text: '{}', sessionId: 'seed', reads: [{ url: site.urls.locked, ok: true }], searches: [] } } })
  const judge = { async complete(req) { const ids = [...req.prompt.matchAll(/^\[([\w-]+)\]/gm)].map(m => m[1]); return { ok: true, json: { items: ids.map(id => ({ id, passed: true, evidence: 'ok' })) }, usage: { calls: 1 } } } }
  const reader = core.createPageReader({ minGapMs: 0, pdfText })
  const links = core.createLinkReader({ minGapMs: 0 })
  const t0 = Date.now() - 2 * 3_600_000
  // the first update only notes what the sources hold; then the site gets its new pages
  await core.runUpdate(dir, { connector: agent(() => ({ items: [] })), judge, readPage: reader.read, readLinks: links.read, now: () => new Date(t0) })
  site.list = ['/old/1', '/old/2', '/a/1', '/a/2', '/locked']
  site.reports = ['/old/r', '/doc.pdf']
  const r = await core.runUpdate(dir, {
    connector: agent(() => ({ items: [...items, { url: site.urls.locked, title: '会员才能看的月度报告', date: '2026-11-21', what: 'x', points: [] }] })),
    judge, readPage: reader.read, readLinks: links.read, now: () => new Date(t0 + 3_600_000),
  })
  if (r.status !== 'done') throw new Error(`the seed update did not finish: ${JSON.stringify(r)}`)
  return { items: items.map(i => ({ url: i.url, title: i.title, quotes: quotes[new URL(i.url).pathname] })), missing: site.urls.locked, card, record: r.record }
}

/**
 * 1.1 W7a: a whole library card whose one source is an address nothing answers on (127.0.0.1, port 9): written into a library
 * of 1.0's seed (seedLibrary), it makes that library a 1.1 one — 立即运行 is an update (the development connection's stand-in
 * agent) that reads nothing, hands in nothing and ends at once — while its 待看 and notes stay as the seed left them.
 */
export function quietCard(name = 'test') {
  return {
    name,
    definition: { summary: '一座测试库。', purpose: '测试', scope: '对象：测试；行业：测试；地域：本机；规模：小', exclude: '无', trust: '官方', rhythm: '每天一次', language: '中文', hard: '无' },
    decide: [], collect: ['新的'], skip: ['旧的'],
    sources: [{ name: '本机', url: 'http://127.0.0.1:9/list', status: '读得到' }], unreadable: [],
    pick: ['新的先收'], write: ['写清数字'], samples: [{ title: '样例', url: 'http://127.0.0.1:9/a', date: '2026-11-20' }],
  }
}
