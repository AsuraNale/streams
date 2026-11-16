// Redesign R6d-4 (docs/checks/2026-11-15-r6d/contract.md 「试评分失败项显示裸 id」): 单条测试 (screens/pipeline.js) names a
// check that did not pass by its description — a built-in rule in the language of the interface (the core's
// describeChecklist, R6b-3), an item of the user's own as they wrote it — where it used to show the bare id
// (quote-in-source：quote is empty).
//
// How a trial is made to fail in the real window, with the stand-in connection (the core's scripted connector, which
// answers every check so that it passes): the world's library gets, before the app starts,
//   - one caught item without a title (a `seen` line in the record with title ''): the scripted connector quotes the title,
//     so its quote is empty and the built-in rule quote-in-source fails;
//   - one rule of the user's own on the relevance step (savePipelineConfig): the answer must not contain the scripted
//     connector's reason — it always does, so that rule fails too.
// Controls in the same window: the same step tried on an item with a title fails only the user's rule (the built-in one is
// not shown as failed when it passed); each <li> carries the id it stands for, so the test reads the words of exactly the
// check it means. Once in Chinese, once in English (each its own world and app; the library is the same Chinese library:
// what the interface shows follows the interface's language, not the library's).
// On a broken copy (scripts/mutation-check.mjs r6d-preview-bare-id): the bare id is back — both tests fail.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { PIPELINE as ZH } from '../src/renderer/texts/pipeline.js'
import { PIPELINE as EN } from '../src/renderer/texts-en/pipeline.js'
import { fmt } from '../src/renderer/lib/format.js'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const UNTITLED = 'https://example.org/r6d/untitled-item'
const USER_ITEM = Object.freeze({ id: 'user-r6d-no-scripted', desc: '理由里不出现 scripted answer 这几个词', kind: 'rule', rule: 'not_regex:scripted answer' })
const BUILT_IN = 'quote-in-source'
// the two descriptions, written out here (not read from the core): what a person must see
const WORDS = Object.freeze({
  'zh-CN': '引用原话逐字出现在材料里',
  en: 'The quoted words appear word for word in the material',
})

function prepare(world) {
  const dir = world.library
  const cfg = core.pipelineConfig(dir)
  core.savePipelineConfig(dir, { ...cfg, nodes: cfg.nodes.map(n => (n.id === 'relevance' ? { ...n, checklist: [USER_ITEM, ...n.checklist] } : n)) })
  const saved = core.pipelineConfig(dir).nodes.find(n => n.id === 'relevance').checklist
  assert.deepEqual(saved.filter(c => c.origin === 'user').map(c => [c.id, c.desc, c.rule]), [[USER_ITEM.id, USER_ITEM.desc, USER_ITEM.rule]], 'the user\'s rule is in the library')
  assert.equal(saved.find(c => c.id === BUILT_IN)?.desc, WORDS['zh-CN'], 'what the library runs with is the Chinese description, whatever the interface')
  core.appendEvent(dir, { ts: new Date().toISOString(), ev: 'seen', url: UNTITLED, source: 'letta-blog', title: '', date: '2026-11-10', summary: 'An entry of the feed that came without a title.' })
}

function session(language) {
  return worldSession({
    kind: 'seeded',
    waitFor: 'sources',
    prepare,
    settings: { ...(language === 'en' ? { language: 'en' } : {}), connections: { active: 'claude-code' } },
    env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'pipeline' }),
  })
}

/** Try one item on the open relevance step; the result as the window shows it. */
async function tryItem(s, url) {
  await s.page.waitForFunction(() => document.querySelector('main[data-screen="sources"] [data-part="gates"][data-state="ready"] [data-part="editor"][data-node-id="relevance"]') !== null, null, POLL)
  const options = await s.page.evaluate(() => [...document.querySelectorAll('select[data-field="preview-url"] option')].map(o => o.value))
  assert.ok(options.includes(url), `the item can be chosen: ${url}`)
  await s.page.selectOption('select[data-field="preview-url"]', url)
  // an earlier trial's result stays on the screen until the new one is back: this trial's own result is the one that
  // comes after the screen has said 「正在测试」 (seen by an observer set before the click, so a quick answer is not missed)
  await s.page.evaluate(() => {
    window.__r6dTrying = false
    window.__r6dObserver?.disconnect()
    window.__r6dObserver = new MutationObserver(() => { if (document.querySelector('[data-part="preview-result"]')?.dataset.state === 'trying') window.__r6dTrying = true })
    window.__r6dObserver.observe(document.body, { subtree: true, childList: true, attributes: true })
  })
  await s.page.click('[data-action="preview"] button')
  await s.page.waitForFunction(() => window.__r6dTrying === true && document.querySelector('[data-part="preview-result"]')?.dataset.state === 'done', null, POLL)
  return s.page.evaluate(() => {
    const r = document.querySelector('[data-part="preview-result"]')
    return {
      passed: r.dataset.passed,
      check: r.querySelector('[data-part="preview-check"]')?.textContent ?? null,
      failed: [...r.querySelectorAll('li[data-failed-item]')].map(li => [li.dataset.failedItem, li.textContent]),
      checklist: [...document.querySelectorAll('[data-part="checklist"] [data-check]')].map(e => [e.dataset.check, e.querySelector('span')?.firstChild?.textContent ?? '']),
    }
  })
}

function checks(language, T) {
  const s = session(language)
  const shown = (desc, text) => {
    // "<description><the dictionary's separator><evidence>": the description first, in full, and the evidence not empty
    const sep = fmt(T.preview.failedItem, { item: '', evidence: '' })
    assert.ok(text.startsWith(`${desc}${sep}`) && text.length > desc.length + sep.length, `${JSON.stringify(text)} starts with ${JSON.stringify(desc + sep)} and goes on with the evidence`)
  }

  test(`R6d-4 单条测试 (${language}): a built-in rule that failed is shown by its description in the interface's language, the user's own by its words; never the bare id`, async () => {
    const r = await tryItem(s, UNTITLED)
    assert.equal(r.passed, 'false')
    assert.deepEqual(r.failed.map(f => f[0]), [USER_ITEM.id, BUILT_IN], 'the two checks that cannot pass on this item, and only they')
    assert.equal(r.check, fmt(T.preview.failed, { n: 2 }))
    const text = Object.fromEntries(r.failed)
    shown(WORDS[language], text[BUILT_IN])
    shown(USER_ITEM.desc, text[USER_ITEM.id])
    for (const [id, t] of r.failed) assert.equal(t.includes(id), false, `the id ${id} is not on the screen: ${t}`)
    // the same words as the checklist of the step, a few lines above on the same screen
    const list = Object.fromEntries(r.checklist)
    assert.equal(list[BUILT_IN], WORDS[language])
    assert.equal(list[USER_ITEM.id], USER_ITEM.desc)
    // the other language's description is not what is shown (the check tells the two apart)
    const other = WORDS[language === 'en' ? 'zh-CN' : 'en']
    assert.equal(text[BUILT_IN].includes(other), false)
  })

  test(`R6d-4 单条测试 (${language}) control: on an item with a title only the user's rule fails — a rule that passed is not listed`, async () => {
    const titled = core.listLibrary(s.world.library, { view: 'caught' }).items.find(i => i.url !== UNTITLED && i.title)
    assert.ok(titled, 'the seeded library has a caught item with a title')
    const r = await tryItem(s, titled.url)
    assert.deepEqual(r.failed.map(f => f[0]), [USER_ITEM.id])
    assert.equal(r.check, fmt(T.preview.failed, { n: 1 }))
    shown(USER_ITEM.desc, r.failed[0][1])
    assert.deepEqual(s.errors, [], 'nothing went wrong in the page')
  })
}

describe('R6d-4 in Chinese', () => checks('zh-CN', ZH))
describe('R6d-4 in English', () => checks('en', EN))
