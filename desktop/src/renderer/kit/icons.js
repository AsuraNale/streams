// Line icons (24×24, stroke = currentColor, no fill), always
// decorative (aria-hidden): the words next to them carry the meaning.
//   html`<${Icon} name="folder" />`   ·   size (px, default 14) · strokeWidth (default per icon)
import { h, html } from '../lib/html.js'

const ROUND = { linecap: 'round', linejoin: 'round' }

/** name → [default stroke width, line caps, shapes] */
const ICONS = Object.freeze({
  grid: [2, { linejoin: 'round' }, [['rect', { x: 4, y: 4, width: 6, height: 6, rx: 1 }], ['rect', { x: 14, y: 4, width: 6, height: 6, rx: 1 }], ['rect', { x: 4, y: 14, width: 6, height: 6, rx: 1 }], ['rect', { x: 14, y: 14, width: 6, height: 6, rx: 1 }]]],
  plus: [2.2, { linecap: 'round' }, [['path', { d: 'M12 5v14M5 12h14' }]]],
  folder: [2, ROUND, [['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }]]],
  check: [3.5, ROUND, [['path', { d: 'M5 12l5 5L20 7' }]]],
  eye: [2, ROUND, [['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]]],
  lock: [2, ROUND, [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]]],
  database: [2, ROUND, [['ellipse', { cx: 12, cy: 6, rx: 7, ry: 3 }], ['path', { d: 'M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6' }], ['path', { d: 'M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6' }]]],
  external: [2, ROUND, [['path', { d: 'M14 4h6v6M20 4l-9 9' }], ['path', { d: 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4' }]]],
  info: [2, ROUND, [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v6M12 7.5v.01' }]]],
  warning: [2.2, ROUND, [['path', { d: 'M12 3L2 20h20L12 3zM12 10v4M12 17h.01' }]]],
  'arrow-left': [2, ROUND, [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]]],
  'arrow-up': [2, ROUND, [['path', { d: 'M12 19V5M6 11l6-6 6 6' }]]],
  'arrow-down': [2.2, ROUND, [['path', { d: 'M12 5v14M6 13l6 6 6-6' }]]],
  'chevron-down': [2.2, ROUND, [['path', { d: 'M6 9l6 6 6-6' }]]],
  'chevron-up': [2.2, ROUND, [['path', { d: 'M6 15l6-6 6 6' }]]],
  'chevron-left': [2.2, ROUND, [['path', { d: 'M15 6l-6 6 6 6' }]]],
  'chevron-right': [2.2, ROUND, [['path', { d: 'M9 6l6 6-6 6' }]]],
  close: [2.2, { linecap: 'round' }, [['path', { d: 'M6 6l12 12M18 6L6 18' }]]],
  file: [2, ROUND, [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5M9 13h6M9 17h6' }]]],
  sheet: [2, ROUND, [['rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 }], ['path', { d: 'M4 9h16M4 15h16M10 3v18' }]]],
  upload: [2, ROUND, [['path', { d: 'M12 15V4M7 9l5-5 5 5' }], ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }]]],
  clock: [2, ROUND, [['circle', { cx: 12, cy: 12, r: 8 }], ['path', { d: 'M12 8v4l3 2' }]]],
  copy: [2, ROUND, [['path', { d: 'M9 9h10v12H9zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1' }]]],
  search: [2, ROUND, [['circle', { cx: 11, cy: 11, r: 6 }], ['path', { d: 'M20 20l-4.5-4.5' }]]],
  // three dots (the button at the end of a list entry)
  more: [2, ROUND, [['circle', { cx: 5, cy: 12, r: 1 }], ['circle', { cx: 12, cy: 12, r: 1 }], ['circle', { cx: 19, cy: 12, r: 1 }]]],
  // the sidebar's entries (kit/sidebar.js NAV_ENTRIES): a tray for 待看, nodes for 图谱, a flow for 流水线, a feed for 来源
  inbox: [2, ROUND, [['path', { d: 'M3 13l2.5-7h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['path', { d: 'M3 13h5l1.5 3h5l1.5-3h5' }]]],
  graph: [2, ROUND, [['circle', { cx: 6, cy: 6, r: 2.5 }], ['circle', { cx: 18, cy: 8, r: 2.5 }], ['circle', { cx: 10, cy: 18, r: 2.5 }], ['path', { d: 'M8.3 7l7.2 0.6M7 8.2l2.2 7.4M16.5 10l-5.2 6.3' }]]],
  flow: [2, ROUND, [['rect', { x: 3, y: 4, width: 6, height: 5, rx: 1 }], ['rect', { x: 15, y: 4, width: 6, height: 5, rx: 1 }], ['rect', { x: 9, y: 15, width: 6, height: 5, rx: 1 }], ['path', { d: 'M6 9v3h12V9M12 12v3' }]]],
  rss: [2, ROUND, [['path', { d: 'M5 19a1 1 0 1 0 0-.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14' }]]],
  // v2 package F: a speech bubble (和主 Agent 聊, the 问库 tab: feedback #1), bars (the 概览 tab), a gear (设置)
  chat: [2, ROUND, [['path', { d: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' }]]],
  play: [2, ROUND, [['path', { d: 'M8 5l11 7-11 7z' }]]],
  chart: [2, ROUND, [['path', { d: 'M4 20h16M7 16v-5M12 16V7M17 16v-8' }]]],
  gear: [2, ROUND, [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' }]]],
})

export const ICON_NAMES = Object.freeze(Object.keys(ICONS))

export function Icon({ name, size = 14, strokeWidth }) {
  const icon = Object.hasOwn(ICONS, name) ? ICONS[name] : null
  if (!icon) return null
  const [width, caps, shapes] = icon
  return html`<svg class="st-icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width=${strokeWidth ?? width} stroke-linecap=${caps.linecap} stroke-linejoin=${caps.linejoin} aria-hidden="true">
    ${shapes.map(([tag, attrs]) => h(tag, attrs))}
  </svg>`
}
