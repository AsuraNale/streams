// v2 package L: a world where the one queue is busy, for the right panel's tests and pictures (test/ui-panel.test.mjs,
// scripts/shots-l.mjs) — the maintainer's morning of 11-10 (docs/feedback/2026-11-10-maintainer-v2-trial.md #1) on the three libraries of
// seedShelf: the app starts 「tomorrow 09:53」 (STREAMS_DEV_NOW), 「中国电动车行业」 and 「中国时尚上市公司」 both on 08:30 and both
// owing that round, so the catch-up runs 电动车 and queues 时尚 behind it; 「AI Agent 记忆」 (the current one) has its schedule off.
// 电动车's sources are feeds on this machine that hold every request until release() (or holdMs, under the core's 20 s fetch
// timeout), one after the other: its round stays in 抓取 for a minute or two, long enough to look at the queue.
//   const feed = await startHoldingFeed()   → { url(name), release(), close(), requests }
//   const q = await seedQueue(world, shelf, feed)   → { now: the STREAMS_DEV_NOW to start with, running: id, waiting: id, current: id }
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'

const CORE = pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href
const pad = n => String(n).padStart(2, '0')

/** A local time as STREAMS_DEV_NOW takes it (no zone: local), `days` from today. */
export function localAt(days, hm) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hm}:00`
}

export async function startHoldingFeed({ holdMs = 15_000 } = {}) {
  let released = false
  const waiting = new Set()
  const out = { requests: 0 }
  const answer = res => {
    if (res.writableEnded) return
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
    res.end('<?xml version="1.0"?><rss version="2.0"><channel><title>slow</title></channel></rss>')
  }
  const server = createServer((req, res) => {
    out.requests++
    if (released) { answer(res); return }
    const timer = setTimeout(() => { waiting.delete(done); answer(res) }, holdMs)
    const done = () => { clearTimeout(timer); answer(res) }
    waiting.add(done)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  out.url = name => `${base}/feed/${encodeURIComponent(name)}`
  out.release = () => { released = true; for (const d of waiting) d(); waiting.clear() }
  out.close = () => { out.release(); return new Promise(resolve => server.close(() => resolve())) }
  return out
}

/** @param {{ root: string }} world @param {{ ids: string[], dirs: string[] }} shelf - seedShelf's */
export async function seedQueue(world, shelf, feed, { sources = 8 } = {}) {
  const core = await import(CORE)
  const [current, ev, fashion] = shelf.dirs
  for (let i = 1; i <= sources; i++) core.addSource(ev, { name: `slow-${i}`, kind: 'rss', topic: '整车销量', url: feed.url(`slow-${i}`) })
  core.addTopic(fashion, { name: '财报', keywords: ['营收'] })
  core.addSource(fashion, { name: 'fashion-slow', kind: 'rss', topic: '财报', url: feed.url('fashion') })
  core.saveLibrarySchedule(ev, { enabled: true, time: '08:30' })
  core.saveLibrarySchedule(fashion, { enabled: true, time: '08:30' })
  core.saveLibrarySchedule(current, { enabled: false, time: '21:00' })
  return { now: localAt(1, '09:53'), running: shelf.ids[1], waiting: shelf.ids[2], current: shelf.ids[0] }
}
