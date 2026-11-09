// v2 draft: a web site on this machine (127.0.0.1, a port the system picks) for the feeds, the item pages and the reading
// window of the N tests. Nothing reaches the network.
//
//   const site = await startSite()
//   site.feed(name, n)              the address of an RSS feed of n items: /feed/<name>?n=<n>, items /item/<name>/<i>
//   site.page(path, html, status?)  serve this HTML at this path (an item page, an article)
//   site.items(name, list)          a feed whose items are given: [{ title, path, body, summary? }] (each body an HTML page)
//   site.blocked                    an address that answers 403 (a source the site refuses)
//   site.hits(path)                 how many requests reached that path
//   site.base · site.close()
// An item page with no route of its own is a short default page; any other path is a 404.
import { createServer } from 'node:http'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const HOUR = 3_600_000

export function htmlPage(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${body}</body></html>`
}

export async function startSite() {
  const routes = new Map()
  const feeds = new Map()
  const hits = new Map()
  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`
    const u = new URL(req.url ?? '/', base)
    hits.set(u.pathname, (hits.get(u.pathname) ?? 0) + 1)
    const r = routes.get(u.pathname)
    if (r) { res.writeHead(r.status, { 'content-type': r.type }); res.end(r.body); return }
    const given = /^\/list\/([\w-]+)$/.exec(u.pathname)
    if (given && feeds.has(given[1])) {
      const list = feeds.get(given[1])
      const items = list.map((it, i) => `<item><title>${esc(it.title)}</title><link>${base}${it.path}</link><pubDate>${new Date(Date.now() - (i + 1) * HOUR).toUTCString()}</pubDate><description>${esc(it.summary ?? it.title)}</description></item>`)
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>${esc(given[1])}</title>\n${items.join('\n')}\n</channel></rss>`)
      return
    }
    const m = /^\/feed\/([\w-]+)$/.exec(u.pathname)
    if (m) {
      const n = Number(u.searchParams.get('n') ?? 3)
      const items = Array.from({ length: n }, (_, i) => `<item><title>${esc(m[1])} 第 ${i + 1} 条：行业动态</title><link>${base}/item/${m[1]}/${i + 1}</link><pubDate>${new Date(Date.now() - (i + 1) * HOUR).toUTCString()}</pubDate><description>about ${esc(m[1])} ${i + 1}</description></item>`)
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>${esc(m[1])}</title>\n${items.join('\n')}\n</channel></rss>`)
      return
    }
    if (u.pathname === '/blocked') { res.writeHead(403, { 'content-type': 'text/plain' }); res.end('no'); return }
    if (/^\/item\//.test(u.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(htmlPage(u.pathname, `<p>Body of ${esc(u.pathname)}. The benchmark improved by 6%. Nothing else.</p>`))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not here')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    blocked: `${base}/blocked`,
    feed: (name, n = 3) => `${base}/feed/${name}?n=${n}`,
    page(path, html, status = 200) { routes.set(path, { status, body: html, type: 'text/html; charset=utf-8' }); return `${base}${path}` },
    items(name, list) {
      feeds.set(name, list)
      for (const it of list) if (it.body !== undefined) routes.set(it.path, { status: 200, body: it.body, type: 'text/html; charset=utf-8' })
      return `${base}/list/${name}`
    },
    hits: path => hits.get(path) ?? 0,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }),
  }
}
