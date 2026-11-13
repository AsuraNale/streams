// The new logo (docs/checks/2026-11-12-logo/contract.md L-3): 流息's mark as the design's file has it, and as a window draws it.
//   markOfFile()               { viewBox, transform, d, fill, paths } of docs/design/logo/source/流息/mark-black.svg (the copy of
//                              赞妮's final file, docs/design/logo/来源.md)
//   markIn(page, selector)     the same read off the real window: the <svg> at `selector` — its viewBox, its <path>s (transform,
//                              d, the fill attribute, the computed fill), its computed color and its size on the screen
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'

export const MARK_FILE = join(REPO_DIR, 'docs', 'design', 'logo', 'source', '流息', 'mark-black.svg')

export function markOfFile(file = MARK_FILE) {
  const text = readFileSync(file, 'utf8')
  const paths = [...text.matchAll(/<path\b([^>]*)\/>/g)].map(m => Object.fromEntries([...m[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])))
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(text)?.[1] ?? null
  return { viewBox, paths: paths.length, transform: paths[0]?.transform ?? null, d: paths[0]?.d ?? null, fill: paths[0]?.fill ?? null }
}

export function markIn(page, selector) {
  return page.evaluate(sel => {
    const svg = document.querySelector(sel)
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    const cs = getComputedStyle(svg)
    return {
      viewBox: svg.getAttribute('viewBox'),
      glyph: svg.dataset.glyph ?? null,
      paths: [...svg.querySelectorAll('path')].map(p => ({ transform: p.getAttribute('transform'), d: p.getAttribute('d'), fill: p.getAttribute('fill'), computedFill: getComputedStyle(p).fill })),
      color: cs.color,
      shown: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.9,
      width: box.width,
      height: box.height,
    }
  }, selector)
}
