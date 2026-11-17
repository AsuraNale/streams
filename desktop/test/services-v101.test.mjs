// 1.0.1 (docs/checks/2026-11-17-1.0.1/contract.md F3 · F5) in the main process, plain Node: every turn of the main agent hands
// the core the interface's language (the locale) and the connection the settings choose — its kind, the API vendor and the two
// model slots as the pipeline resolves them — and the situation the model is sent says them. The other way: an API key stored
// through the real connections service (and its address, its key file's folder) is nowhere in what the model is sent.
// The model is the core's scripted stand-in (its calls are read); nothing here touches the real app data.
// Fails on the code before the fix: the prompt has no 界面语言 and no 当前连接.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { join } from 'node:path'
import { createAgentService } from '../src/main/services/agent.mjs'
import { createConnectionsService } from '../src/main/services/connections.mjs'
import { scriptedAgentConnector } from '../src/main/core.mjs'
import { removeTree } from '../scripts/lib/remove-tree.mjs'
import { testWorld } from './support/services.mjs'

const worlds = []
after(() => { for (const w of worlds) removeTree(w.root, { waitMs: 3000 }) })
const FAKE_KEY = 'sk-v101-FAKEKEY-0123456789abcdefghijABCDEFGHIJ'
const now = () => new Date('2026-11-17T16:00:00.000Z')

/** The real connections service on a test world; the agent's session connector is the scripted stand-in `c`. */
function setup(c) {
  const w = testWorld('st-v101-')
  worlds.push(w)
  const conns = createConnectionsService({ settingsFile: w.settingsFile, emit: w.emit, log: w.log, secrets: w.secrets, locale: () => w.locale })
  const library = { entries: () => [], find: () => null, usable: () => false }
  const proposals = { createProposal: async () => { throw new Error('no cards here') }, handlers: { listProposals: () => [] } }
  const agent = createAgentService({ appDataDir: join(w.root, 'appData'), library, connections: { ...conns, sessionConnector: () => c }, proposals, emit: w.emit, log: w.log, now, locale: () => w.locale })
  return { w, conns, agent }
}
const promptOf = c => c.sends().at(-1).prompt

test('v101 F3 · F5: the situation of a turn says the interface\'s language and the connection the settings choose (Chinese, then English)', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '好' }, { reply: 'OK' }] })
  const { w, conns, agent } = setup(c)
  conns.handlers.setConnectionModels('claude-code', { model: 'claude-opus-5-5', verifyModel: 'claude-haiku-5-5' })
  conns.handlers.setActiveConnection('claude-code')
  await agent.handlers.agentSend('你现在用的是哪个模型？')
  const zh = promptOf(c)
  assert.ok(zh.includes('界面语言：中文（zh-CN）'), 'the Chinese interface is said')
  assert.ok(zh.includes('当前连接：连接你电脑上的 Claude Code；主模型：Opus 5.5（claude-opus-5-5）；核验模型：Haiku 5.5（claude-haiku-5-5）'), 'the connection and its two slots')
  // the interface switched to English: the next turn says so
  w.locale = { resolved: 'en' }
  await agent.handlers.agentSend('which model scores my libraries?')
  const en = promptOf(c)
  assert.ok(en.includes('界面语言：英文（en）'), 'the English interface is said')
  assert.ok(!en.includes('界面语言：中文'), 'and not the Chinese one')
})

test('v101 F5 (the other way): an API key stored through the connections service is nowhere in what the model is sent; nor its address or folder', async () => {
  const c = scriptedAgentConnector({ answers: [{ reply: '好' }] })
  const { w, conns, agent } = setup(c)
  conns.handlers.setApiVendor('custom', 'http://127.0.0.1:9/v1')
  conns.handlers.setApiKey('custom', FAKE_KEY)
  conns.handlers.setConnectionModels('api', { model: 'my-local-model', verifyModel: null })
  conns.handlers.setActiveConnection('api')
  // control: the key really is held where the connections service keeps it (so not finding it below means something)
  assert.equal(w.secrets.get('key-custom'), FAKE_KEY)
  await agent.handlers.agentSend('你好')
  const p = promptOf(c)
  assert.ok(p.includes('当前连接：API key（Custom (OpenAI-compatible)）；主模型：my-local-model；核验模型：同主模型'), 'control: the connection is said')
  for (let i = 0; i + 6 <= FAKE_KEY.length; i++) assert.ok(!p.includes(FAKE_KEY.slice(i, i + 6)), `a piece of the key: ${FAKE_KEY.slice(i, i + 6)}`)
  for (const bit of ['key-custom', '127.0.0.1', w.root, 'secrets']) assert.ok(!p.includes(bit), bit)
})
