// 和主 Agent 聊 (design P2): the route and an empty page only (v2 package F). The conversation, the proposal and suggestion
// cards and the input are package G's; until then the page says how many things wait for you (the sidebar's badge: the
// app context's `waiting`) and that the rest is coming. Words: texts/shell.js SHELL.chat.
// Test hooks: main[data-screen="chat"][data-state="ready"], [data-part="chat-shell"], [data-waiting].
import { html } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { fmt } from '../lib/format.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { SHELL } from '../texts/shell.js'

export function ChatScreen() {
  const { waiting } = useApp()
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="chat" />`}>
    <${Main} screen="chat" state="ready" labelledby="chat-title">
      <${TopBar} title=${SHELL.chat.title} subtitle=${SHELL.chat.subtitle} titleTag="h1" titleId="chat-title" />
      <div class="st-main__body chat-body" data-part="chat-shell">
        <p class="st-t-small st-t-sub" data-waiting=${waiting ?? 0}>${fmt(SHELL.chat.waiting, { n: waiting ?? 0 })}</p>
        <p class="st-t-small st-t-muted">${SHELL.chat.shell}</p>
      </div>
    <//>
  <//>`
}
