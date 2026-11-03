// Stand-ins for what the main-process services take from Electron, so their rules run in plain Node
// (test/services-*.test.mjs): a secret store on a fake safeStorage, a dialog that answers what the test says, a shell
// that only records, an emit that only records, a log that only records.
import { join } from 'node:path'
import { createSecretStore } from '../../src/main/secrets.mjs'
import { tempDir } from '../../scripts/lib/temp.mjs'

/** A safeStorage that "encrypts" by reversing the text (so the bytes on disk are not the key) and can be switched off. */
export function fakeSafeStorage({ available = true } = {}) {
  const s = {
    available,
    isEncryptionAvailable: () => s.available,
    encryptString: text => Buffer.from([...text].reverse().join(''), 'utf8'),
    decryptString: buf => [...buf.toString('utf8')].reverse().join(''),
  }
  return s
}

/** A world for one test: an app-data folder with a settings file and a secrets folder, plus the recorders. */
export function testWorld(prefix = 'st-services-') {
  const root = tempDir(prefix)
  const events = []
  const lines = []
  const opened = []
  const revealed = []
  const safeStorage = fakeSafeStorage()
  const dialogAnswers = []
  return {
    root,
    settingsFile: join(root, 'settings.json'),
    secrets: createSecretStore({ dir: join(root, 'secrets'), safeStorage }),
    safeStorage,
    events,
    lines,
    opened,
    revealed,
    emit: (topic, payload = null) => { events.push({ topic, payload }); return 1 },
    log: line => { lines.push(String(line)) },
    shell: { openExternal: async url => { opened.push(url) }, showItemInFolder: p => { revealed.push(p) } },
    dialogAnswers,
    /** The next showOpenDialog answers with this (a path, or null = cancelled). */
    dialog: { showOpenDialog: async () => { const a = dialogAnswers.shift(); return a ? { canceled: false, filePaths: [a] } : { canceled: true, filePaths: [] } } },
    locale: { resolved: 'zh-CN' },
    localeOf() { return this.locale },
    eventsOf: topic => events.filter(e => e.topic === topic),
  }
}
