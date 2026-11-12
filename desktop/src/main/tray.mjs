/**
 * The tray icon (plan A2; docs/desktop.md §4.3): the app's icon in the system tray while it runs, its hint 「流息 · n 条待看」
 * (updated with every `inbox-changed`), its menu 「打开流息」「立即运行」「退出」; a click on the icon opens the window too.
 * Redesign R1 (N06): 「立即运行」 follows the head button's rule — the current library at once, or, while another library runs or
 * waits, at the end of the one queue (main.mjs: scheduler.startOne → startCurrent); never a dialog.
 * The words: main/texts/app.js and main/texts-en/app.js `tray`, in the language the app runs in when the menu is made.
 *
 * Electron is given (Tray, Menu), so this runs in plain Node under test. In a test run of the app (hidden windows) no icon
 * is made: what it would show goes to the log (`tray: …`).
 * @module desktop/main/tray
 */

import { APP } from './texts/app.js'
import { APP as APP_EN } from './texts-en/app.js'

const TABLES = Object.freeze({ 'zh-CN': APP, en: APP_EN })
const fmt = (template, values) => String(template).replace(/\{(\w+)\}/g, (whole, k) => (Object.hasOwn(values, k) ? String(values[k]) : whole))

/**
 * @param {object} o
 * @param {{new (icon: string): object}|null} o.Tray - Electron's
 * @param {{buildFromTemplate: (items: object[]) => object}|null} o.Menu - Electron's
 * @param {string} o.icon - the .ico (icon.mjs)
 * @param {boolean} [o.hidden] - a test run: no icon, the log says what it would be
 * @param {(line: string) => void} [o.log]
 * @param {() => 'zh-CN'|'en'} [o.locale]
 * @param {() => void} o.onOpen - 「打开流息」, a click on the icon
 * @param {() => void} o.onRunNow - 「立即运行」
 * @param {() => void} o.onQuit - 「退出」
 */
export function createTray({ Tray, Menu, icon, hidden = false, log = () => {}, locale = () => 'zh-CN', onOpen, onRunNow, onQuit }) {
  let count = 0
  let tray = null
  const words = () => (TABLES[locale()] ?? APP).tray
  const tooltip = () => fmt(words().tooltip, { n: count })
  const items = () => {
    const w = words()
    return [
      { id: 'open', label: w.open, click: () => onOpen() },
      { id: 'run-now', label: w.runNow, click: () => onRunNow() },
      { type: 'separator' },
      { id: 'quit', label: w.quit, click: () => onQuit() },
    ]
  }

  function refresh() {
    if (hidden) { log(`tray: (a test run: no icon) hint "${tooltip()}"; menu ${items().filter(i => i.label).map(i => i.label).join(' | ')}`); return }
    if (!tray) return
    tray.setToolTip(tooltip())
    tray.setContextMenu(Menu.buildFromTemplate(items()))
  }

  if (!hidden) {
    tray = new Tray(icon)
    tray.on('click', () => onOpen())
  }
  refresh()

  return {
    /** The number of cards in 待看 (the hint says it). */
    setCount(n) {
      const next = Number.isInteger(n) && n >= 0 ? n : 0
      if (next === count) return
      count = next
      refresh()
    },
    /** The words again (the language changed). */
    refresh,
    tooltip,
    /** The menu as it is now: [{ id, label, click }] (the separator has no id). */
    items,
    destroy() { if (tray) { tray.destroy(); tray = null } },
  }
}
