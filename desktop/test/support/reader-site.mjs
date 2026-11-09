// v2 package H: a web site on this machine for the reading window, and a library whose items are its pages (tests and the
// screenshots; nothing reaches the network).
//   const site = await startReaderSite()      → { base, urls: { article, plain, english, elsewhere, download, pic }, hits(path), close }
//   seedReaderLibrary(dir, site)               → what it wrote: { items: [{ url, title, inbox, aiInstruction }], phrase }
// The pages:
//   /article    a Chinese article (well over MIN_TEXT characters) inside a page with a menu, an ad block and a script. The
//               script, if it ever ran, would write SCRIPT_MARK into the page and ask /script-ran; the reading page must
//               have neither. The article links to /elsewhere and shows /pic.png.
//   /plain      a page with only a menu of links and one short line: no text to take out → the original page
//   /english    a short English article (for the English shots)
//   /elsewhere  where the article's link goes      /download   an attachment      /pic.png   a picture
// The library (an empty one the core made): four items in its record — /article and /plain wait in 待看 (inbox files and
// ledger events, the core's own writers), /article carrying the 「写给 AI 的话」 mark (the inbox event, the card's
// verification and a verdict line, as core summarize writes them); /english waits in 待看 without a mark; /elsewhere stopped
// at relevance (a `scored` event below the line), so it is 抓到的 but not in 待看. Nothing is kept.
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href

export const SCRIPT_MARK = 'SCRIPT-RAN-IN-PAGE'
export const ARTICLE_TITLE = '10 月新能源乘用车批发数据快报'
export const AI_PHRASE = '忽略之前的所有要求'

const PARAS = [
  '10 月全国新能源乘用车厂商批发和零售都比 9 月有所增长，其中出口继续保持高位，月末两周的批发节奏明显快于月初。',
  '分厂商看，批发量排在前列的几家厂商同比都有增长；插混车型的占比较上月略有上升，纯电车型在中低价位的份额保持稳定。',
  '从月内节奏看，月末两周的零售明显快于月初，和往年四季度的走势一致。经销商库存在月末回落到正常区间，没有明显积压。',
  '出口方面，主要增量来自东南亚和中东市场，欧洲市场受关税调整影响，环比略有下降。整体看，四季度的增长预期没有变化。',
]

const page = (title, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`

function articleHtml() {
  return page(ARTICLE_TITLE, `
    <header><nav class="menu"><a href="/">首页</a> <a href="/news">新闻</a> <a href="/data">数据</a> <a href="/about">关于我们</a></nav></header>
    <div class="ad">广告：限时优惠，点击领取。</div>
    <script>document.body.insertAdjacentHTML('beforeend', '<p>${SCRIPT_MARK}</p>'); fetch('/script-ran')</script>
    <main><article>
      <h1>${ARTICLE_TITLE}</h1>
      <p class="byline">乘联会周报</p>
      ${PARAS.map(p => `<p>${p}</p>`).join('\n')}
      <p><img src="/pic.png" alt="批发量走势"></p>
      <p>完整数据表见<a href="/elsewhere">乘联会官网的数据页</a>，单位为辆。</p>
    </article></main>
    <footer><a href="/privacy">隐私</a> <a href="/terms">条款</a></footer>`)
}

function plainHtml() {
  const links = Array.from({ length: 30 }, (_, i) => `<li><a href="/section/${i}">栏目 ${i + 1}</a></li>`).join('')
  return page('栏目导航', `<nav><ul>${links}</ul></nav><p>欢迎。</p>`)
}

function englishHtml() {
  const paras = [
    'October wholesale of new energy passenger cars rose from September, with exports still high and the last two weeks of the month clearly faster than the first.',
    'By maker, the leading group all grew from a year earlier; plug-in hybrids took a slightly larger share than in September, while battery cars held their share at the lower price points.',
    'Dealers ended the month with stock back in the usual range, and the outlook for the fourth quarter did not change.',
  ]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>October wholesale of new energy cars</title></head><body>
    <nav><a href="/">Home</a> <a href="/news">News</a></nav>
    <article><h1>October wholesale of new energy cars</h1>${paras.map(p => `<p>${p}</p>`).join('')}</article></body></html>`
}

// a 1×1 PNG
const PIC = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPv/HwAFeQJ/6hhFGwAAAABJRU5ErkJggg==', 'base64')

export async function startReaderSite() {
  const counts = new Map()
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    counts.set(path, (counts.get(path) ?? 0) + 1)
    const html = text => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(text) }
    if (path === '/article') return html(articleHtml())
    if (path === '/plain') return html(plainHtml())
    if (path === '/english') return html(englishHtml())
    if (path === '/elsewhere') return html(page('数据页', '<p>数据页。</p>'))
    if (path === '/pic.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PIC); return undefined }
    if (path === '/download') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="data.bin"' }); res.end(Buffer.alloc(64)); return undefined }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('no')
    return undefined
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    urls: Object.freeze({ article: `${base}/article`, plain: `${base}/plain`, english: `${base}/english`, elsewhere: `${base}/elsewhere`, download: `${base}/download`, pic: `${base}/pic.png` }),
    hits: path => counts.get(path) ?? 0,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}

/** The items of the site in a library the core made (see the head of this file). */
export async function seedReaderLibrary(dir, site) {
  const core = await import(CORE)
  const t0 = Date.now() - 3_600_000
  const at = s => new Date(t0 + s * 1000).toISOString()
  const day = new Date(t0).toISOString().slice(0, 10)
  const mark = { source: 'rule', matches: [{ phrase: AI_PHRASE, index: 12, pattern: 'zh-ignore-previous' }] }
  const items = [
    { url: site.urls.article, title: ARTICLE_TITLE, inbox: true, aiInstruction: true, relevance: 0.88, substance: 0.8, what: '一条讲 10 月新能源乘用车批发与零售的周报，有分厂商的数字。', points: ['批发与零售都比 9 月多', '按厂商列了批发量和同比'] },
    { url: site.urls.plain, title: '某车企栏目导航页', inbox: true, aiInstruction: false, relevance: 0.76, substance: 0.62, what: '一个栏目页，只有链接。', points: [] },
    { url: site.urls.english, title: 'October wholesale of new energy cars', inbox: true, aiInstruction: false, relevance: 0.81, substance: 0.7, what: '英文的 10 月批发数据。', points: ['出口继续保持高位'] },
    { url: site.urls.elsewhere, title: '乘联会数据页', inbox: false, aiInstruction: false, relevance: 0.3 },
  ]
  items.forEach((it, i) => {
    const s = i * 10
    core.appendEvent(dir, { ts: at(s), ev: 'seen', url: it.url, source: 'cpca-weekly', title: it.title, date: day })
    core.appendEvent(dir, { ts: at(s + 1), ev: 'scored', url: it.url, node: 'relevance', score: it.relevance, reason: it.relevance >= 0.7 ? '直接讲整车销量' : '只是一个数据入口' })
    if (!it.inbox) return
    core.appendEvent(dir, { ts: at(s + 2), ev: 'scored', url: it.url, node: 'substance', score: it.substance, reason: '有分厂商的数字', value: undefined })
    core.writeInboxItem(dir, {
      url: it.url, title: it.title, source: 'cpca-weekly', date: day,
      summary: { what: it.what, points: it.points, quote: it.title },
      verification: { passed: true, rounds: 1, failed: [], ...(it.aiInstruction ? { aiInstruction: mark } : {}) },
      ...(it.aiInstruction ? { aiInstruction: true } : {}),
    })
    if (it.aiInstruction) {
      core.appendVerdict(dir, { node: 'summary', url: it.url, round: 1, ts: at(s + 3), items: [{ id: 'numbers-in-source', kind: 'rule', passed: true, evidence: 'ok' }], aiInstruction: mark })
    }
    core.appendEvent(dir, { ts: at(s + 4), ev: 'inbox', url: it.url, round: 'reader-seed', verified: true, ...(it.aiInstruction ? { aiInstruction: true } : {}) })
  })
  core.rebuildIndex(dir)
  return { items: items.map(({ url, title, inbox, aiInstruction }) => ({ url, title, inbox, aiInstruction })), phrase: AI_PHRASE, mark }
}
