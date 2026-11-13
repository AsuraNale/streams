#!/usr/bin/env node
// The logo's design files as copied (docs/design/logo/来源.md): every file under source/ against source-sha256.txt, and —
// when 赞妮's folder is on this machine — against the design files themselves (the same list, read from there). Reads only.
//   node docs/design/logo/check-source.mjs              compare; exit code 1 on any difference
//   node docs/design/logo/check-source.mjs --write      write source-sha256.txt from the design folder (once, at the copy)
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(HERE, 'source')
const LIST = join(HERE, 'source-sha256.txt')
// the design folder: 定稿\流息 (copied as source/流息/) and 设计说明.md beside 定稿 (copied as source/设计说明.md)
const DESIGN = process.env.STREAMS_LOGO_DESIGN ?? join(homedir(), 'Desktop', '独立Agent-赞妮', 'Logo设计')
const designPath = rel => (rel === '设计说明.md' ? join(DESIGN, rel) : join(DESIGN, '定稿', ...rel.split('/')))

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else out.push(p)
  }
  return out
}
const rels = root => files(root).map(f => relative(root, f).split('\\').join('/')).sort()

if (process.argv.includes('--write')) {
  const list = [...rels(join(DESIGN, '定稿', '流息')).map(r => `流息/${r}`), '设计说明.md']
  writeFileSync(LIST, list.map(r => `${sha(designPath(r))}  ${r}\n`).join(''))
  process.stdout.write(`${list.length} files listed in ${LIST} (from ${DESIGN})\n`)
  process.exit(0)
}

const listed = readFileSync(LIST, 'utf8').trim().split('\n').map(l => /^([0-9a-f]{64}) {2}(.+)$/.exec(l)).map(m => ({ hash: m[1], rel: m[2] }))
const problems = []
const inSource = rels(SOURCE)
const names = listed.map(l => l.rel)
for (const r of inSource) if (!names.includes(r)) problems.push(`source/${r}: not in the list`)
const designHere = existsSync(join(DESIGN, '定稿', '流息'))
if (designHere) {
  const inDesign = [...rels(join(DESIGN, '定稿', '流息')).map(r => `流息/${r}`), '设计说明.md']
  for (const r of inDesign) if (!names.includes(r)) problems.push(`design ${r}: not in the list (a file added there?)`)
}
for (const { hash, rel } of listed) {
  const copy = join(SOURCE, ...rel.split('/'))
  if (!existsSync(copy)) { problems.push(`source/${rel}: missing`); continue }
  if (sha(copy) !== hash) problems.push(`source/${rel}: sha256 differs from the list`)
  if (designHere) {
    if (!existsSync(designPath(rel))) problems.push(`design ${rel}: missing`)
    else if (sha(designPath(rel)) !== hash) problems.push(`design ${rel}: sha256 differs from the list`)
  }
}
process.stdout.write(`${listed.length} files listed; ${inSource.length} under source/; design folder ${designHere ? 'compared too' : 'not on this machine (source/ against the list only)'}\n`)
if (problems.length) {
  process.stdout.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('every file is the same bytes\n')
