/**
 * The language of the app's own words (docs/desktop.md��): the setting `language` in settings.json (`auto` ·
 * `zh-CN` · `en`) and what it comes to on this machine. `auto` follows the system: Chinese when any of the user's
 * display languages is Chinese, English otherwise. Pure — no Electron here, the system's languages are given — so the
 * rules run in plain Node (test/locale.test.mjs). main.mjs makes one state at start; the app:// handler (which table
 * the page gets), the notifier and the services read it, and D21's 「语言」 changes it.
 * @module desktop/main/locale
 */

export const LANGUAGE_SETTINGS = Object.freeze(['auto', 'zh-CN', 'en'])
export const LOCALES = Object.freeze(['zh-CN', 'en'])
export const DEFAULT_LANGUAGE = 'auto'

// the language subtag alone decides: zh, zh-CN, zh-Hans-CN, zh_TW, ZH-HK … are Chinese; zho (a three-letter code) is not
const CHINESE = /^zh(?:[-_]|$)/i

/** 'zh-CN' for any tag whose language is Chinese, 'en' for everything else (an empty or odd tag too). */
export function localeOfTag(tag) {
  return CHINESE.test(String(tag ?? '').trim()) ? 'zh-CN' : 'en'
}

/**
 * The setting and the system's languages → 'zh-CN' | 'en'. A setting that names a language is taken as it is; anything
 * else counts as `auto`: Chinese when any of the preferred languages is Chinese (Windows lists the display languages in
 * the user's order, often more than one); when that list is empty the fallback (app.getLocale()) decides the same way;
 * no tag at all → English.
 * @param {string} setting
 * @param {{preferred?: string[], fallback?: string|null}} [system]
 */
export function resolveLocale(setting, { preferred = [], fallback = null } = {}) {
  if (setting === 'zh-CN' || setting === 'en') return setting
  let tags = (Array.isArray(preferred) ? preferred : []).filter(t => typeof t === 'string' && t.trim() !== '')
  if (tags.length === 0 && typeof fallback === 'string' && fallback.trim() !== '') tags = [fallback]
  return tags.some(t => localeOfTag(t) === 'zh-CN') ? 'zh-CN' : 'en'
}

/**
 * The one holder of the current choice and its resolution.
 * @param {object} o
 * @param {string} o.settingsFile
 * @param {() => {preferred: string[], fallback: string|null}} o.systemLanguages - asked on every resolve
 * @param {(file: string) => {language: string}} o.readSettings
 * @param {(file: string, patch: object) => object} o.writeSettings
 * @param {(line: string) => void} [o.log]
 * @returns {{current: () => {setting: string, resolved: string}, set: (setting: string) => {setting: string, resolved: string, changed: boolean}}}
 */
export function createLocaleState({ settingsFile, systemLanguages, readSettings, writeSettings, log = () => {} }) {
  let state = null
  const resolve = () => {
    const setting = readSettings(settingsFile).language
    const system = systemLanguages() ?? {}
    const resolved = resolveLocale(setting, system)
    const tags = [...(Array.isArray(system.preferred) ? system.preferred : []), ...(system.fallback ? [system.fallback] : [])]
    log(`language: ${setting} -> ${resolved} (system: ${tags.join(', ') || 'unknown'})`)
    state = { setting, resolved }
    return state
  }
  return {
    /** The setting and what it comes to now (resolved once, then on every change). */
    current() { return state ?? resolve() },
    /** Write the setting and resolve again; `changed`: the page's language is now another one (it reloads). */
    set(setting) {
      const before = (state ?? resolve()).resolved
      writeSettings(settingsFile, { language: setting })
      const now = resolve()
      return { ...now, changed: now.resolved !== before }
    },
  }
}
