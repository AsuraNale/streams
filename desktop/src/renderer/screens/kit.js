// The component gallery (development only: `npm start -- --screen kit`; src/main/protocol.mjs DEV_ONLY serves its files
// only then). Every component of the kit once, with sample words (texts/kit.js), so the tokens can be judged on real
// components — Friday's comparison of the three token sets happens here. test/kit.test.mjs measures sizes and colours on it.
import { html } from '../lib/html.js'
import { AppFrame, AppSidebar, Button, CardFrame, ICON_NAMES, Icon, LinkButton, Main, Notice, StageProgress, Tag, TopBar } from '../kit/index.js'
import { FETCH_STATES as FETCH_WORDS } from '../texts/common.js'
import { KIT } from '../texts/kit.js'
import { FETCH_STATES } from '../../shared/fetch-states.mjs'

const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = '/styles/screens/kit.css'
document.head.append(link)

function Block({ title, children }) {
  return html`<section class="kit-block">
    <h2 class="kit-block__title">${title}</h2>
    <div class="kit-block__row">${children}</div>
  </section>`
}

export function KitScreen() {
  const stages = KIT.steps.names.map((name, i) => ({ id: `s${i}`, name, current: i === 1, steps: [{ key: 'a', state: i < 1 ? 'done' : i === 1 ? 'active' : 'todo' }, { key: 'b', state: i < 1 ? 'done' : i === 1 ? 'awaiting' : 'todo' }] }))
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="kit" />`}>
    <${Main} screen="kit" state="ready" labelledby="kit-title">
      <${TopBar} title=${KIT.title} subtitle=${KIT.subtitle} titleTag="h1" titleId="kit-title" />
      <div class="st-main__body kit-body">
        <${Block} title=${KIT.sections.text}>
          <div class="kit-stack">
            <div class="st-t-heading">${KIT.text.heading}</div>
            <div class="st-t-title">${KIT.text.title}</div>
            <div class="st-t-body">${KIT.text.body}</div>
            <div class="st-t-small st-t-sub">${KIT.text.small}</div>
            <div class="st-t-tiny st-t-muted">${KIT.text.tiny}</div>
            <div class="st-t-small st-t-wait">${KIT.text.wait}</div>
            <div class="st-t-small st-t-done">${KIT.text.done}</div>
          </div>
        <//>
        <${Block} title=${KIT.sections.buttons}>
          <${Button} variant="primary">${KIT.buttons.primary}<//>
          <${Button}>${KIT.buttons.secondary}<//>
          <${Button} icon="plus">${KIT.buttons.icon}<//>
          <${Button} disabled=${true}>${KIT.buttons.disabled}<//>
          <${LinkButton}>${KIT.buttons.secondary}<//>
        <//>
        <${Block} title=${KIT.sections.tags}>
          <${Tag} tone="wait">${KIT.tags.wait}<//>
          <${Tag} tone="done">${KIT.tags.done}<//>
          <${Tag} tone="recommend">${KIT.tags.recommend}<//>
          <${Notice} tone="wait">${KIT.tags.noticeWait}<//>
          <${Notice} tone="plain">${KIT.tags.noticePlain}<//>
        <//>
        <${Block} title=${KIT.sections.states}>
          ${FETCH_STATES.map(s => html`<span key=${s} class=${`st-fetch st-fetch--${s}`} data-fetch-state=${s}>${FETCH_WORDS[s]}</span>`)}
        <//>
        <${Block} title=${KIT.sections.steps}>
          <${StageProgress} stages=${stages} label=${KIT.steps.label} />
        <//>
        <${Block} title=${KIT.sections.cards}>
          <div class="kit-cards">
            <${CardFrame} label=${KIT.card.label} status=${KIT.card.status} tone="waiting">${KIT.card.body}<//>
            <${CardFrame} label=${KIT.card.label} status=${KIT.card.answered} tone="answered">${KIT.card.body}<//>
            <${CardFrame} label=${KIT.card.label} tone="plain">${KIT.card.body}<//>
          </div>
        <//>
        <${Block} title=${KIT.sections.icons}>
          ${ICON_NAMES.map(name => html`<span key=${name} class="kit-icon" title=${name}><${Icon} name=${name} size=${18} /></span>`)}
        <//>
      </div>
    <//>
  <//>`
}
