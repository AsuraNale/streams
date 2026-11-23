// Redesign R5b (docs/checks/2026-11-12-r5b/contract.md 「测」) on the running app — what of it the product still has after 1.1 W7b:
// the page's words for what went wrong (O9: the problem card of a run that could not start, 资料库's 缺少文件头 card — a code they
// have no words for is said in words, never as itself), 来源与要求 reading no HTTP code, and the right panel's 待确认 with nothing in
// it (precheck fix 9). The rest of R5b — the one 提议 (screens/proposal.js), the 主 Agent page (screens/chat.js), 系统检测, 重新评分
// in 未通过筛选, 运行漏斗 — went with v2's main agent and v1.0's scoring pipeline (1.1 W7b), and its tests with them.
// One world (test/support/seed.mjs worldSession: the pinned Electron, a world under the system's temporary folder, every
// connection the core's stand-in). Each check first shows the input that makes it fail (the control beside it).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { TODAY } from '../src/renderer/texts/today.js'
import { PANEL } from '../src/renderer/texts/panel.js'
import { BUILD } from '../src/renderer/texts/build.js'
import { CONNECTIONS } from '../src/renderer/texts/common.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'

const POLL = { polling: 100, timeout: 60_000 }
const RAW = /HTTP \d{3}|\b40[34]\b|ECONNREFUSED|ENOTFOUND|socket hang up|check the address|Not Found|Forbidden|permission denied|EACCES|E_WEIRD/i

test('controls: the scan of raw error text finds what it is for, and passes the words in use', () => {
  assert.ok(RAW.test('HTTP 404: check the address') && RAW.test('connect ECONNREFUSED 127.0.0.1:9') && RAW.test('E_WEIRD_CONNECT'))
  assert.equal(RAW.test('稍后处理 · 修改 · 创建 · 添加 · 已生效 · 今天 12:03 · 1–4 次'), false)
})

test('R5b-5 precheck fix 11: 来源与要求 has no words for an HTTP code and does not read one (a code coming back would not be shown)', () => {
  const src = join(REPO_DIR, 'desktop', 'src', 'renderer')
  for (const f of ['texts/sources.js', 'texts-en/sources.js']) assert.equal(/\{http\}|HTTP \{/.test(readFileSync(join(src, f), 'utf8')), false, f)
  const page = readFileSync(join(src, 'screens', 'sources.js'), 'utf8')
  assert.equal(/\b[a-z]\w*\.http\b/.test(page), false, 'screens/sources.js reads no .http')
  assert.ok(/\b[a-z]\w*\.http\b/.test('return s.http ? a : b') && /\{http\}/.test("streak: '{state} · HTTP {http}'"), 'control: the scans find it')
})

// =========================================================================================================================
describe('R5b-5 the page\'s words for what went wrong, and an empty 待确认', () => {
  const s = worldSession({
    kind: 'seeded', waitFor: 'inbox', settings: { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } },
    env: () => ({ STREAMS_DEV_CONNECTION: 'fake' }),
  })
  const until = (fn, arg) => s.page.waitForFunction(fn, arg, POLL)
  const bridge = (name, ...args) => s.page.evaluate(([n, a]) => window.streams[n](...a), [name, args])

  test('R5b-5 O9: 问题卡 and 资料库\'s file rules say a code they do not know in words', async () => {
    const said = await s.page.evaluate(async () => {
      const { problemWords } = await import('./screens/problem-card.js')
      const { pendingWords } = await import('./screens/library.js')
      return {
        problem: [problemWords({ code: 'connection', kind: 'claude-code', connectionCode: 'E_WEIRD_CONNECT', caughtKept: 2 }).text, problemWords({ code: 'E_WEIRD_PROBLEM', kind: 'claude-code', caughtKept: 1 }).text],
        library: [pendingWords('E_WEIRD_RULE'), pendingWords('no-frontmatter')],
      }
    })
    for (const t of [...said.problem, said.library[0]]) assert.ok(!/E_WEIRD|\(|（\s*）/.test(t.replace(/（详细信息见「复制诊断信息」）/, '')), t)
    assert.ok(said.problem[0].length > 0 && said.library[0].length > 0)
    assert.notEqual(said.library[1], said.library[0], 'control: a known rule has its own words')
  })

  test('R5b-5 O9 drawn (precheck fix 5): 问题卡 and 资料库\'s file card drawn in the page with English errors, a 404 and codes it does not know — the page\'s text has no code, no raw text', async () => {
    const raw = { message: 'Error: connect ECONNREFUSED 127.0.0.1:443', detail: 'HTTP 404 Not Found: check the address', http: 404 }
    const problems = [
      { code: 'connection', kind: 'claude-code', connectionCode: 'E_WEIRD_CONNECT', caughtKept: 2, ...raw },
      { code: 'connection', kind: 'api', connectionCode: 'http-404', caughtKept: 1, ...raw },
      { code: 'E_WEIRD_PROBLEM', kind: 'codex', caughtKept: 1, ...raw },
      // control: a code with words of its own
      { code: 'connection', kind: 'claude-code', connectionCode: 'login-expired', caughtKept: 2 },
    ]
    const files = [{ file: 'odd.md', path: 'notes/odd.md', codes: ['E_WEIRD_RULE', 'http-404'], proposedHeader: null, nameOk: true, bodyHash: 'x' }]
    const drawn = await s.page.evaluate(async ([ps, fs]) => {
      const { html, render } = await import('./lib/html.js')
      const { ProblemCard } = await import('./screens/problem-card.js')
      const { HeaderCard } = await import('./screens/library.js')
      const box = document.createElement('div')
      document.body.append(box)
      const read = async node => { render(node, box); await new Promise(r => setTimeout(r, 0)); const t = box.textContent; render(null, box); return t }
      const noop = () => {}
      const out = { problem: [], library: [] }
      for (const p of ps) out.problem.push(await read(html`<${ProblemCard} problem=${p} busy=${false} onRetry=${noop} onChange=${noop} onRedetect=${noop} />`))
      for (const f of fs) out.library.push(await read(html`<${HeaderCard} item=${f} busy=${false} onApply=${noop} onSkip=${noop} />`))
      box.remove()
      return out
    }, [problems, files])
    const CODE = /E_WEIRD|http-404|ECONNREFUSED|Not Found|check the address|\b404\b|\(\s*[\w-]+\s*\)|（\s*[\w-]+\s*）/
    const all = [...drawn.problem.slice(0, 3), ...drawn.library]
    for (const t of all) {
      assert.ok(t.trim().length > 0, 'control: something drawn')
      assert.equal(CODE.test(t), false, `a code or raw text on the page: ${CODE.exec(t)?.[0]} in 「${t}」`)
      assert.equal(RAW.test(t), false, t)
    }
    // precheck fix 10: the sentence for a connection problem the page has no words for is in 05's words
    for (const t of drawn.problem.slice(0, 3)) {
      assert.ok(t.includes(fmt(TODAY.problem.connection.other, { name: '', n: 1 }).split('，').at(-1)) || t.includes(fmt(TODAY.problem.connection.other, { name: '', n: 2 }).split('，').at(-1)), t)
      assert.equal(/这一轮|打分|没丢/.test(t), false, `05 不再用: ${t}`)
    }
    // controls: a known code has its own words; the scan finds a code put back
    assert.ok(drawn.problem[3].includes(fmt(TODAY.problem.connection['login-expired'], { name: CONNECTIONS.names['claude-code'], n: 2 })), drawn.problem[3])
    assert.ok(CODE.test('连接出现问题（E_WEIRD_CONNECT）') && CODE.test('出现错误（http-404）') && CODE.test('stopped (aborted-x)'), 'control: the scan finds a code in brackets')
  })

  test('R5b-3 待确认 with nothing in it (precheck fix 9): only the empty state\'s sentence — no 「以下事项均需确认后才会执行。」', async () => {
    assert.equal((await bridge('getBuild')).data, null, 'control: no build conversation waits in this world')
    await s.page.click('[data-panel-tab="decide"]')
    await until(() => document.querySelector('[data-pane="decide"] [data-part="decide-none"]') !== null)
    const pane = await s.page.evaluate(() => ({ text: document.querySelector('[data-pane="decide"]').textContent, paragraphs: document.querySelectorAll('[data-pane="decide"] [data-part="decide-summary"] p').length }))
    assert.ok(pane.text.includes(PANEL.decide.none), pane.text)
    assert.equal(pane.text.includes(BUILD.panelLead), false, `the lead only over a card: ${pane.text}`)
    assert.equal(pane.paragraphs, 0)
  })

  test('no page errors (R5b-5)', () => {
    assert.deepEqual(s.errors, [])
  })
})
