// 待看: a card judged on its title only (11-18, proposal D2: a news aggregator's item — Google News — whose body cannot be read;
// core cache.mjs title-only, the card's `materials`) carries the mark 「只有标题」 with its hover note; no other card does.
// The seeded world has none (the control); one card's inbox file is given materials: 'title-only' (a test fixture, as the seed
// rewrites the ledger), the page is loaded again, and the mark is on that card only.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INBOX } from '../src/renderer/texts/inbox.js'
import { INBOX as INBOX_EN } from '../src/renderer/texts-en/inbox.js'
import { REPO_DIR } from '../scripts/lib/paths.mjs'
import { worldSession } from './support/seed.mjs'

const core = await import(pathToFileURL(join(REPO_DIR, 'core', 'src', 'index.mjs')).href)
const POLL = { polling: 100, timeout: 60_000 }
const settings = { connections: { active: 'claude-code' }, panel: { open: true, tab: 'detail' } }

describe('待看: the 只有标题 mark', () => {
  const s = worldSession({ kind: 'seeded', waitFor: 'inbox', settings, env: world => ({ STREAMS_DEV_LIBRARY: world.library, STREAMS_DEV_CONNECTION: 'fake', STREAMS_START_SCREEN: 'inbox' }) })
  const marks = () => s.page.evaluate(() => [...document.querySelectorAll('[data-card] [data-title-only]')].map(e => ({ url: e.closest('[data-card]').dataset.url, text: e.textContent.trim(), title: e.getAttribute('title') })))

  test('the words in both dictionaries', () => {
    assert.equal(INBOX.card.titleOnly, '只有标题')
    assert.ok(INBOX.card.titleOnlyHint.includes('只依据标题'))
    assert.equal(INBOX_EN.card.titleOnly, 'Title only')
    assert.ok(INBOX_EN.card.titleOnlyHint.includes('title alone'))
  })

  test('no mark on the seed; one card made title-only → the mark on that card only, with its note', async () => {
    assert.deepEqual(await marks(), [], 'control: the seeded cards were all read in full')
    const target = s.world.seed.inbox[1].url
    const file = core.inboxPath(s.world.library, target)
    const item = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(item.materials, 'body', 'control: the seed card was read in full')
    writeFileSync(file, JSON.stringify({ ...item, materials: 'title-only' }) + '\n', 'utf8')
    await s.page.reload()
    await s.page.waitForFunction(() => document.querySelectorAll('[data-card]').length > 0, null, POLL)
    await s.page.waitForFunction(() => document.querySelectorAll('[data-card] [data-title-only]').length > 0, null, POLL)
    const got = await marks()
    assert.deepEqual(got, [{ url: target, text: INBOX.card.titleOnly, title: INBOX.card.titleOnlyHint }])
  })
})
