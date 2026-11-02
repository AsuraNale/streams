// The placeholder screens: one for each entry of the sidebar until its page is built (plan 5.2). A title, the line
// 「这一页明天起做」, and one sentence saying what the page will be (texts/screens.js). `placeholderScreen(id)` makes the
// component screens/index.js registers; the test hook is the usual `main[data-screen=<id>][data-state="ready"]`.
import { html } from '../lib/html.js'
import { AppFrame, AppSidebar, Main, TopBar } from '../kit/index.js'
import { SCREENS } from '../texts/screens.js'

export function placeholderScreen(id) {
  const title = SCREENS.titles[id] ?? id
  const about = SCREENS.about[id] ?? ''
  return function PlaceholderScreen() {
    return html`<${AppFrame} sidebar=${html`<${AppSidebar} current=${id} />`}>
      <${Main} screen=${id} state="ready" labelledby=${`${id}-title`}>
        <${TopBar} title=${title} titleTag="h1" titleId=${`${id}-title`} />
        <div class="st-main__body ph-body">
          <p class="ph-note">${SCREENS.placeholder}</p>
          ${about ? html`<p class="ph-hint">${about}</p>` : null}
        </div>
      <//>
    <//>`
  }
}
