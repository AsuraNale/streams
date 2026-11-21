// A small Electron app for test/render.test.mjs: the real render service (src/main/render.mjs) and PDF reader
// (src/main/pdf-text.mjs) behind the core's page reader, run on the addresses the test gives (STREAMS_RENDER_TEST_URLS, a
// JSON list); every result and every log line of the service go to STREAMS_RENDER_TEST_OUT, then it quits.
// (An ES module main: whenReady().then, not a top-level await — that waits for ever in Electron 44's ESM main.)
import { app, BrowserWindow, session } from 'electron'
import { writeFileSync } from 'node:fs'
import { createRenderService } from '../../../src/main/render.mjs'
import { pdfText } from '../../../src/main/pdf-text.mjs'
import { createPageReader } from '../../../src/main/core.mjs'

app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const lines = []
  const out = { results: [], log: lines, windowsLeft: null, shown: [] }
  app.on('browser-window-created', (_e, win) => { win.on('show', () => out.shown.push(win.id)) })
  try {
    const service = createRenderService({ BrowserWindow, session, log: l => lines.push(l), settleMs: 800 })
    const reader = createPageReader({ render: service.render, pdfText, minGapMs: 0, timeoutMs: 20_000 })
    for (const url of JSON.parse(process.env.STREAMS_RENDER_TEST_URLS ?? '[]')) {
      const r = await reader.read(url)
      out.results.push({ url, ok: r.ok, method: r.method, reason: r.reason, tried: r.tried, http: r.http, title: r.title, text: r.text.slice(0, 2000), message: r.message })
    }
    out.windowsLeft = BrowserWindow.getAllWindows().length
  } catch (err) {
    out.error = String(err?.stack ?? err)
  }
  writeFileSync(process.env.STREAMS_RENDER_TEST_OUT, JSON.stringify(out, null, 2))
  app.exit(0)
})
