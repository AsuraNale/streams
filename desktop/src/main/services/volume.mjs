/**
 * 1.1.2 第 4 件 (维护者 11-25 「用量不够，找来的文章不够多……设置里没有相关选项」; 赞妮's mock 04): a library's 「每次更新的量」
 * (core library/volume.mjs: standard · more · most, in its streams.json) and 设置's 「新建库的默认更新量」 (settings.json
 * defaultVolume). A step the user sets is recorded as theirs (services/changes.mjs byYou, field volume), like the schedule.
 *
 *   getLibraryVolume(id)        → { volume, volumes, budget, near } — its step, the three, what one update may do at its step
 *                                 (core libraryUpdateBudget), and how near its last update came to the limit (core nearLimit:
 *                                 { reads, limit, notRead, volume } | null)
 *   setLibraryVolume(id, v)     → the same, after the change; sends `library-changed`
 *   getDefaultVolume()          → { volume }
 *   setDefaultVolume(v)         → { volume }; sends `settings-changed`
 * @module desktop/main/services/volume
 */
import { BridgeError } from '../bridge-methods.mjs'
import { VOLUMES, isVolume, libraryUpdateBudget, listRounds, nearLimit, readLibraryVolume, saveLibraryVolume } from '../core.mjs'
import { byYou } from './changes.mjs'

/** The last update of the library at `dir` (rounds.jsonl kind 'update'), or null. */
export function lastUpdateOf(dir) {
  try { return listRounds(dir, 50).find(r => r?.kind === 'update') ?? null } catch { return null }
}

/**
 * @param {object} o
 * @param {object} o.library - services/library.mjs (entryOf, usable)
 * @param {() => object} o.settings - the settings as read now
 * @param {(patch: object) => object} o.writeSettings
 * @param {(topic: string, payload?: unknown) => number} o.emit
 * @param {(line: string) => void} o.log
 * @param {() => Date} [o.now]
 */
export function createVolumeService({ library, settings, writeSettings, emit, log, now = () => new Date() }) {
  const dirOf = id => {
    const e = library.entryOf(id)
    if (!library.usable(e.path)) throw new BridgeError('open_failed', `${e.path} is not a readable library`)
    return e.path
  }
  const viewOf = dir => {
    let volume = 'standard'
    try { volume = readLibraryVolume(dir).volume } catch { /* streams.json unreadable: the standard step is shown */ }
    return { volume, volumes: [...VOLUMES], budget: libraryUpdateBudget(dir).budget, near: nearLimit(lastUpdateOf(dir)) }
  }
  return {
    handlers: {
      getLibraryVolume(id) {
        return viewOf(dirOf(id))
      },
      setLibraryVolume(id, volume) {
        if (!isVolume(volume)) throw new BridgeError('bad_arguments', 'volume')
        const dir = dirOf(id)
        byYou(dir, ['volume'], () => saveLibraryVolume(dir, volume), { log, now })
        log(`volume: ${id}: ${volume}`)
        emit('library-changed', null)
        return viewOf(dir)
      },
      getDefaultVolume() {
        return { volume: settings().defaultVolume }
      },
      setDefaultVolume(volume) {
        if (!isVolume(volume)) throw new BridgeError('bad_arguments', 'volume')
        const saved = writeSettings({ defaultVolume: volume }).defaultVolume
        log(`volume: the default of a new library: ${saved}`)
        emit('settings-changed', null)
        return { volume: saved }
      },
    },
  }
}
