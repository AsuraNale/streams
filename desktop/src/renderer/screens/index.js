// Every screen the app can show, by id. navigate(id) only goes to ids listed here.
// Adding a screen: docs/desktop.md §五 (one file in screens/, one line here, its words in texts/,
// its styles in styles/screens/ + one @import in styles/app.css).
//
// 11-03 (plan A): 今日, 待看 and 设置 are their own screens, 首次设置 ('first-run') is what app.js shows while no library is
// open (and can be opened by id in development); the other entries are placeholders (screens/placeholder.js) until their
// day comes (plan 5.2). The component gallery ('kit') is not here: app.js adds it in development only.
// 11-03 (plan B): 资料库, 图谱, 问库, 流水线, 来源与主题 and 运行状态 are their own screens too; no entry is a placeholder now.
import { AskScreen } from './ask.js'
import { FirstRunScreen } from './first-run.js'
import { GraphScreen } from './graph.js'
import { InboxScreen } from './inbox.js'
import { LibraryScreen } from './library.js'
import { PipelineScreen } from './pipeline.js'
import { SettingsScreen } from './settings.js'
import { SourcesScreen } from './sources.js'
import { StatusScreen } from './status.js'
import { TodayScreen } from './today.js'

export const SCREENS = Object.freeze({
  'first-run': FirstRunScreen,
  today: TodayScreen,
  inbox: InboxScreen,
  library: LibraryScreen,
  graph: GraphScreen,
  ask: AskScreen,
  pipeline: PipelineScreen,
  sources: SourcesScreen,
  status: StatusScreen,
  settings: SettingsScreen,
})

/** The screen the app opens on. */
export const FIRST_SCREEN = 'today'
