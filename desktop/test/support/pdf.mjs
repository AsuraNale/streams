// A real, minimal PDF made here (one page per entry of `pages`, each a list of lines in Helvetica), with a correct
// cross-reference table — so the PDF reader is tried on an actual PDF, not on a stand-in. ASCII text only.
export function makePdf(pages) {
  const objs = []
  const add = body => { objs.push(body); return objs.length }
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pagesId = objs.length + 1 + pages.length * 2
  const kids = []
  for (const lines of pages) {
    const esc = s => s.replace(/[\()]/g, m => `\${m}`)
    const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map(l => `(${esc(l)}) Tj T*`).join(' ')} ET`
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`))
  }
  add(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
