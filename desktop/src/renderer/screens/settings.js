// 设置: the language of the app's own words, the developer switch, the diagnostics, and 「关于」 with the update
// (screens/settings-update.js). The connections (plan C2) get their own part here later. Data: the app state (useApp)
// and the bridge (lib/bridge.js); words: texts/settings.js. Test hooks: [data-part="…"] on each part, the language radios'
// ids `settings-language-<setting>`.
import { html, useEffect, useState } from '../lib/html.js'
import { useApp } from '../lib/app-context.js'
import { call } from '../lib/bridge.js'
import { fmt } from '../lib/format.js'
import { AppFrame, AppSidebar, Button, Main, TopBar } from '../kit/index.js'
import { SETTINGS as T } from '../texts/settings.js'
import { AboutUpdate } from './settings-update.js'

/** One part of the page: a name on the left, the content on the right. */
function Part({ id, name, hint, children }) {
  return html`<section class="settings__part" data-part=${id} aria-labelledby=${`settings-${id}`}>
    <div>
      <h2 class="settings__name st-t-body" id=${`settings-${id}`}>${name}</h2>
      ${hint ? html`<div class="st-t-small st-t-muted">${hint}</div>` : null}
    </div>
    <div class="settings__content">${children}</div>
  </section>`
}

function LanguagePart({ language, onChange }) {
  const setting = language?.setting ?? 'auto'
  const resolved = language?.resolved ?? 'zh-CN'
  const choices = ['auto', 'zh-CN', 'en']
  return html`<${Part} id="language" name=${T.language} hint=${T.languageHint}>
    <div class="settings__models settings__models--three" role="radiogroup" aria-label=${T.languageGroup}>
      ${choices.map(v => html`<label key=${v} class="settings__model" for=${`settings-language-${v}`} data-checked=${String(setting === v)}>
        <input type="radio" name="language" id=${`settings-language-${v}`} value=${v} checked=${setting === v} onChange=${() => onChange(v)} />
        <span class="settings__model-text">
          <b>${T.languages[v]}</b>
          ${v === 'auto' ? html`<span class="st-t-small st-t-sub">${fmt(T.languageNow, { name: T.languages[resolved] })}</span>` : null}
        </span>
      </label>`)}
    </div>
    <div class="st-t-small st-t-sub">${T.languageNote}</div>
    <div class="st-t-small st-t-muted">${T.languageReload}</div>
  <//>`
}

export function SettingsScreen() {
  const { appState } = useApp()
  const data = appState.data
  const [devInfo, setDevInfo] = useState(data?.showDeveloperInfo ?? false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (data) setDevInfo(data.showDeveloperInfo) }, [data?.showDeveloperInfo])
  const changeLanguage = async v => {
    try {
      const r = await call('setLanguage', v)
      // the page's words are served per request in the language chosen: a change of the resolved language is a reload,
      // which comes back to this screen
      if (r.changed) { location.hash = 'settings'; location.reload() } else appState.reload()
    } catch { appState.reload() }
  }
  const toggleDevInfo = async on => {
    setDevInfo(on)
    try { await call('setShowDeveloperInfo', on) } catch { /* the state says what happened */ }
    appState.reload()
  }
  const copy = async () => {
    try { await call('copyDiagnostics'); setCopied(true) } catch { setCopied(false) }
  }
  return html`<${AppFrame} sidebar=${html`<${AppSidebar} current="settings" />`}>
    <${Main} screen="settings" state=${data ? 'ready' : appState.status} labelledby="settings-title">
      <${TopBar} title=${T.title} subtitle=${T.subtitle} titleTag="h1" titleId="settings-title" />
      <div class="st-main__body settings__body">
        <div class="settings__list">
          <${LanguagePart} language=${data?.language} onChange=${changeLanguage} />
          <${Part} id="advanced" name=${T.advanced} hint=${T.advancedHint}>
            <div class="settings__advanced">
              <div class="settings__check">
                <input type="checkbox" id="settings-dev-info" checked=${devInfo} onChange=${e => toggleDevInfo(e.currentTarget.checked)} />
                <div>
                  <label class="settings__check-name" for="settings-dev-info">${T.devInfo}</label>
                  <div class="st-t-small st-t-sub">${T.devInfoText}</div>
                </div>
              </div>
              <div class="settings__diag">
                <${Button} icon="copy" onClick=${copy}>${T.copyDiagnostics}<//>
                <span class="st-t-small st-t-sub">${copied ? T.copied : T.diagnosticsText}</span>
              </div>
            </div>
          <//>
          <${Part} id="about" name=${T.about}>
            ${data ? html`<${AboutUpdate} version=${data.version} devBuild=${data.devBuild} />` : null}
            <div class="st-t-small st-t-muted">${T.madeBy}</div>
          <//>
        </div>
      </div>
    <//>
  <//>`
}
