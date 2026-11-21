/**
 * The text of a PDF (1.1 W2, acceptance B5: the third way of reading a page), for the core's page reader (core
 * read/read-page.mjs takes it as `pdfText`). unpdf 1.9.1 (MIT; PDF.js built to run without a browser, no dependencies) runs
 * here in the main process, never in a page. Pages are joined with a blank line; a PDF with no text layer (scanned pages)
 * gives '' and the reader calls it unreadable.
 * pdfText(bytes: Uint8Array) -> Promise<string>      throws when the bytes are not a PDF it can open
 * @module desktop/main/pdf-text
 */

import { extractText, getDocumentProxy } from 'unpdf'

export const PDF_MAX_PAGES = 200

export async function pdfText(bytes) {
  const doc = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 })
  try {
    const { text } = await extractText(doc, { mergePages: false })
    return (Array.isArray(text) ? text : [text]).slice(0, PDF_MAX_PAGES).map(t => String(t ?? '').trim()).filter(Boolean).join('\n\n')
  } finally {
    await doc.destroy?.()
  }
}
