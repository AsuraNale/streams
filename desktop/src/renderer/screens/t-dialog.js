// The template's dialog (redesign R4b; design 07-模板版 「输入 API key」「许可证与致谢」「移除该库」, 03-页面稿 P18, P19, P21): a <dialog>
// opened with showModal — the template's own backdrop, the focus kept inside, Esc is its cancel — with the template's dialog-head
// (the title and a close button) and dialog-body (a new-content form, then a form-footer). The same shape R3's 编辑笔记
// (screens/edit-dialog.js) has; here for 来源与要求 (修改地址, 删除来源, 删除主题, 移除该库, 恢复默认) and 设置 (输入 API key,
// 许可证与致谢).
//   html`<${TDialog} name="remove-library" title=${…} closeLabel=${…} onClose=${…} footer=${html`…buttons…`}>…<//>`
// The focus goes to the element with data-dialog-initial when there is one, else to the dialog's first control; it goes back to
// where it was when the dialog goes. Test hooks: dialog[data-dialog=<name>], [data-action="close-dialog"], .dialog-head h2.
import { html, useLayoutEffect, useRef } from '../lib/html.js'
import { TIcon } from '../lib/template-icons.js'

let counter = 0

/**
 * @param {object} p
 * @param {string} p.name - data-dialog
 * @param {string} p.title
 * @param {string} p.closeLabel - the close button's name
 * @param {() => void} p.onClose - Esc, the close button
 * @param {unknown} [p.footer] - the form-footer's buttons
 * @param {string} [p.className]
 * @param {unknown} p.children
 */
export function TDialog({ name, title, closeLabel, onClose, footer = null, className = '', children }) {
  const box = useRef(null)
  const id = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  if (id.current === null) id.current = `st-tdialog-${++counter}`
  useLayoutEffect(() => {
    const d = box.current
    const was = document.activeElement
    if (d && !d.open) d.showModal()
    const first = d?.querySelector('[data-dialog-initial]') ?? d?.querySelector('.dialog-body input:not([disabled]), .dialog-body select:not([disabled]), .dialog-body textarea:not([disabled]), .dialog-body button:not([disabled])')
    first?.focus()
    return () => { if (was && document.contains(was) && typeof was.focus === 'function') was.focus() }
  }, [])
  return html`<dialog class=${`dialog st-tdialog ${className}`.trim()} data-dialog=${name} ref=${box} aria-labelledby=${id.current}
    onCancel=${ev => { ev.preventDefault(); close.current() }}>
    <div class="dialog-head">
      <h2 id=${id.current}>${title}</h2>
      <span class="st-act" data-action="close-dialog"><button type="button" class="icon-btn" aria-label=${closeLabel} title=${closeLabel} onClick=${() => close.current()}><${TIcon} name="close" fallback="down" /></button></span>
    </div>
    <div class="dialog-body">
      <form class="new-content" onSubmit=${ev => ev.preventDefault()}>
        ${children}
        ${footer ? html`<div class="form-footer st-tdialog__footer">${footer}</div>` : null}
      </form>
    </div>
  </dialog>`
}

/** A button of the dialog's footer (or anywhere): the template's .btn inside a [data-action] hook. */
export function Btn({ name, kind = '', disabled = false, onClick, label, children }) {
  return html`<span class="st-act" data-action=${name}><button type="button" class=${`btn${kind ? ` ${kind}` : ''}`} disabled=${disabled} aria-label=${label} onClick=${onClick}>${children}</button></span>`
}
