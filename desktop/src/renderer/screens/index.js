// Every screen the app can show, by id. navigate(id) only goes to ids listed here (or in ALIASES).
// Adding a screen: docs/desktop.md §五 (one file in screens/, one line here, its words in texts/,
// its styles in styles/screens/ + one @import in styles/app.css).
//
// 11-03 (plan A / B of v1.0): 今日, 待看, 资料库, 图谱, 问库, 流水线, 来源与主题, 运行状态 and 设置; 首次设置 ('first-run') is what
// app.js shows while no library is open (and can be opened by id in development). The component gallery ('kit') is not
// here: app.js adds it in development only.
// v2 package F (plan B of v2; docs/desktop.md §五「界面结构」): the sidebar's 库架 ('shelf') and 和主 Agent 聊 ('chat', an empty
// page until package G); a library's page is five tabs — 概览 ('overview': v1.0's 今日 + 流水线's numbers + 运行状态's sources),
// 待看 ('inbox'), 资料库 ('library', with its graph view 'graph'), 问库 ('ask'), 来源与要求 ('sources': v1.0's 来源与主题 + 要求
// + 流水线's 关卡 + this library's schedule and cap). v1.0's ids that are no screen of their own now lead to where their
// content went (ALIASES).
import { AskScreen } from './ask.js'
import { ChatScreen } from './chat.js'
import { FirstRunScreen } from './first-run.js'
import { GraphScreen } from './graph.js'
import { InboxScreen } from './inbox.js'
import { LibraryScreen } from './library.js'
import { OverviewScreen } from './overview.js'
import { SettingsScreen } from './settings.js'
import { ShelfScreen } from './shelf.js'
import { SourcesScreen } from './sources.js'

export const SCREENS = Object.freeze({
  'first-run': FirstRunScreen,
  shelf: ShelfScreen,
  chat: ChatScreen,
  overview: OverviewScreen,
  inbox: InboxScreen,
  library: LibraryScreen,
  graph: GraphScreen,
  ask: AskScreen,
  sources: SourcesScreen,
  settings: SettingsScreen,
})

/** v1.0's screen ids → [the screen their content is on now, the params that point at it] */
export const ALIASES = Object.freeze({
  today: Object.freeze(['overview', Object.freeze({})]),
  status: Object.freeze(['overview', Object.freeze({ section: 'run' })]),
  pipeline: Object.freeze(['sources', Object.freeze({ section: 'gates' })]),
})

/** The screen the app opens on: the current library's 概览 (v1.0 opened on 今日, which it took in). */
export const FIRST_SCREEN = 'overview'
/** A library you open from the sidebar or the shelf for the first time: its 待看 (design UC2). */
export const LIBRARY_FIRST_SCREEN = 'inbox'
