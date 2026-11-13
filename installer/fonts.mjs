/**
 * The fonts that ship with the app (desktop/src/renderer/fonts), for the build and the notices — pure, so the rules run in a
 * test without building anything (installer/test/fonts.test.mjs).
 *
 *   BUNDLED_FONTS        each font: its file and the license text shipped beside it (file names in desktop/src/renderer/fonts),
 *                        its name, what the app uses it for (the words of the notices' line), its license
 *     - Noto Sans SC   the interface font (v2 package K2), OFL-NotoSansSC.txt
 *     - Noto Serif SC  the heading font of the Research theme (redesign R6a: from the official release notofonts/noto-cjk
 *                      Serif2.003, docs/design/fonts/noto-serif-sc/来源.md), OFL-NotoSerifSC.txt — the LICENSE of that release
 *   fontFilesToShip(srcFiles, { appRef })   what the build asks of the app's files (repo-relative paths git knows):
 *       { files: [...], problems: [...] }
 *     the working tree's app (no appRef): every font of BUNDLED_FONTS and every license text must be there — a font without
 *       its license text, or a license text without its font, stops the build;
 *     an older commit's app (appRef, the update test's 0.9.0 — v1.0 shipped no font, K2…R5 shipped one): only the pairs it
 *       has are checked — a font it carries must have its license text beside it.
 *     (Before R6a the build asked whether styles/fonts.css was there — the file K2 loaded the font with. Redesign R1 took that
 *     file away: the template's own design.css declares the face. The question is now asked of the font files themselves.)
 * @module installer/fonts
 */

export const FONT_DIR = 'desktop/src/renderer/fonts'

export const BUNDLED_FONTS = Object.freeze([
  Object.freeze({ name: 'Noto Sans SC', file: 'NotoSansSC-VF.ttf', licenseFile: 'OFL-NotoSansSC.txt', role: 'the interface font (界面字体)', license: 'SIL Open Font License 1.1' }),
  Object.freeze({ name: 'Noto Serif SC', file: 'NotoSerifSC-VF.ttf', licenseFile: 'OFL-NotoSerifSC.txt', role: 'the heading font of the Research theme (研究对话主题的标题字体)', license: 'SIL Open Font License 1.1' }),
])

/** The font of BUNDLED_FONTS a file name belongs to, or null (a font file nobody listed). */
export const fontOfFile = name => BUNDLED_FONTS.find(f => f.file === name) ?? null

/**
 * @param {string[]} srcFiles - the app's files as git knows them, repo-relative ('desktop/src/…')
 * @param {{appRef?: string}} [o] - appRef: the build is of another commit's app (STREAMS_INSTALLER_APP_REF)
 * @returns {{files: string[], problems: string[]}} files: the font files and license texts that ship (repo-relative)
 */
export function fontFilesToShip(srcFiles, { appRef = '' } = {}) {
  const has = name => srcFiles.includes(`${FONT_DIR}/${name}`)
  const files = []
  const problems = []
  for (const f of BUNDLED_FONTS) {
    const font = has(f.file)
    const text = has(f.licenseFile)
    if (font) files.push(`${FONT_DIR}/${f.file}`)
    if (text) files.push(`${FONT_DIR}/${f.licenseFile}`)
    if (font && !text) problems.push(`${FONT_DIR}/${f.licenseFile} is not a file git knows: ${f.name} must ship with its license`)
    else if (!font && text) problems.push(`${FONT_DIR}/${f.file} is not a file git knows: the license text of ${f.name} is there without the font`)
    else if (!font && !text && !appRef) problems.push(`${FONT_DIR}/${f.file} and ${f.licenseFile} are not files git knows: the working tree's app uses ${f.name} (${f.role})`)
  }
  // a font file in that folder that is not one of the list would ship without a line in the notices
  for (const p of srcFiles) {
    if (!p.startsWith(`${FONT_DIR}/`) || !/\.(ttf|otf|woff2?)$/i.test(p)) continue
    if (!fontOfFile(p.slice(FONT_DIR.length + 1))) problems.push(`${p}: a font file installer/fonts.mjs does not list (its name, use and license text)`)
  }
  return { files, problems }
}
