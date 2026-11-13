// 流息's mark in the app (the new logo, docs/checks/2026-11-12-logo/contract.md L-3; docs/desktop.md 「品牌记号」): 赞妮's 五流,
// the one path of docs/design/logo/source/流息/mark-black.svg — the same viewBox, the same transform, the same path data —
// filled with currentColor instead of the file's black, so the mark takes the ink of the theme it is drawn in (the design has
// no version for a dark ground; one colour that follows the theme holds in both). The red and blue 3D edges are the app icon's
// only (desktop/assets/icon/). test/ui-brand.test.mjs reads the path off the real window and compares it with the file.
//   html`<${BrandMark} />`   an <svg class="st-brand-mark" data-mark="streams">, hidden from the accessibility tree (the brand's
//                            name is said by the link around it)
import { html } from './html.js'

/** mark-black.svg, as the file has it (only `fill` differs: currentColor). */
export const MARK = Object.freeze({
  viewBox: '0 0 520 360',
  transform: 'scale(40)',
  d: 'M2 0L4.707 0L6.854 2.146L6.146 2.854L4.293 1L1 1ZM1 2L7.707 2L9.854 4.146L9.146 4.854L7.293 3L0 3ZM3 4L13 4L12 5L2 5ZM2 6L7.293 6L9.146 4.146L9.854 4.854L7.707 7L1 7ZM1 8L4.293 8L6.146 6.146L6.854 6.854L4.707 9L0 9Z',
})

export function BrandMark() {
  return html`<svg class="st-brand-mark" data-mark="streams" viewBox=${MARK.viewBox} aria-hidden="true" focusable="false"><path transform=${MARK.transform} fill="currentColor" d=${MARK.d} /></svg>`
}
