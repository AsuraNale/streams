// Every screen the app can show, by id. navigate(id) only goes to ids listed here (or in ALIASES).
// Adding a screen: docs/desktop.md §五 (one file in screens/, one line here, its words in texts/,
// its styles in styles/screens/ + one @import in styles/app.css).
//
// 11-03 (plan A / B of v1.0): 今日, 待看, 资料库, 图谱, 问库, 流水线, 来源与主题, 运行状态 and 设置; 首次设置 ('first-run') is what
// app.js shows while no library is open (and can be opened by id in development). v2 package I: 首次打开 ('first-run') shows while
// the app knows no library; 新建库 ('new-library') is a route of its own. The component gallery ('kit') is not
// here: app.js adds it in development only.
// v2 package F (plan B of v2; docs/desktop.md §五「界面结构」): the sidebar's 库架 ('shelf') and 主 Agent ('chat'); redesign R1:
// a library's page is four tabs — 待看 ('inbox'), 资料库 ('library', with its graph view 'graph'), 问库 ('ask'), 来源与要求
// ('sources': v1.0's 来源与主题 + 要求 + 流水线's 关卡 + this library's schedule and cap); 概览 is gone. Ids that are no screen of
// their own now lead to where their content went (ALIASES).
import { AskScreen } from './ask.js'
import { ChatScreen } from './chat.js'
import { FirstRunScreen } from './first-run.js'
import { GraphScreen } from './graph.js'
import { InboxScreen } from './inbox.js'
import { LibraryScreen } from './library.js'
import { NewLibraryScreen } from './new-library.js'
import { BuildScreen } from './build.js'
import { SettingsScreen } from './settings.js'
import { ShelfScreen } from './shelf.js'
import { SourcesScreen } from './sources.js'

export const SCREENS = Object.freeze({
  'first-run': FirstRunScreen,
  shelf: ShelfScreen,
  chat: ChatScreen,
  inbox: InboxScreen,
  library: LibraryScreen,
  graph: GraphScreen,
  ask: AskScreen,
  sources: SourcesScreen,
  settings: SettingsScreen,
  // v2 package I: 新建库, the manual way (v1.0's 首次设置 without the connection step); app.js newLibrary() opens it
  'new-library': NewLibraryScreen,
  // 1.1 W6b: 新建库 — one sentence, then the build conversation with the main agent (app.js newLibrary() opens it; v1.0's form
  // above stays until W7 and has no way in from the interface)
  build: BuildScreen,
})

/**
 * v1.0's screen ids → [the screen their content is on now, the params that point at it]. Redesign R1: 概览 is gone (维护者 11-11
 * 第 1 题, its route with it) — v1.0's 今日 and 运行状态 lead to the library's 待看 (the last run and 运行状态 are in the right panel's 进度).
 */
export const ALIASES = Object.freeze({
  today: Object.freeze(['inbox', Object.freeze({})]),
  status: Object.freeze(['inbox', Object.freeze({})]),
  // redesign R4b: 流水线 is 评分环节, the first fold of 来源与要求's 高级设置
  pipeline: Object.freeze(['sources', Object.freeze({ view: 'advanced', section: 'gates' })]),
})

/** The screen the app opens on: the current library's 待看 (redesign R1: a library always opens on 待看). */
export const FIRST_SCREEN = 'inbox'
/** A library you open from the sidebar or the shelf for the first time: its 待看 (design UC2). */
export const LIBRARY_FIRST_SCREEN = 'inbox'
