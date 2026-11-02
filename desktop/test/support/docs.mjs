// Reading docs/desktop.md where the tests hold the code to it: the bridge table between
// <!-- bridge:begin --> and <!-- bridge:end --> (§四). Each row's first cell is `name(…)`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_DIR } from '../../scripts/lib/paths.mjs'

export const DOC_FILE = join(REPO_DIR, 'docs', 'desktop.md')

export function bridgeTable(text = readFileSync(DOC_FILE, 'utf8')) {
  const m = /<!-- bridge:begin -->([\s\S]*?)<!-- bridge:end -->/.exec(text)
  if (!m) throw new Error('docs/desktop.md has no bridge table (<!-- bridge:begin --> … <!-- bridge:end -->)')
  return m[1].split('\n')
    .filter(line => /^\|\s*`/.test(line))
    .map(line => {
      const cell = line.split('|')[1].trim()
      const name = /^`([A-Za-z]\w*)\(/.exec(cell)
      if (!name) throw new Error(`docs/desktop.md bridge table: cannot read the method in ${cell}`)
      return name[1]
    })
}

/** The event topics table between <!-- events:begin --> and <!-- events:end --> (§四「事件」): first cell `topic`. */
export function eventsTable(text = readFileSync(DOC_FILE, 'utf8')) {
  const m = /<!-- events:begin -->([\s\S]*?)<!-- events:end -->/.exec(text)
  if (!m) throw new Error('docs/desktop.md has no events table (<!-- events:begin --> … <!-- events:end -->)')
  return m[1].split('\n')
    .filter(line => /^\|\s*`/.test(line))
    .map(line => {
      const name = /^`([a-z][a-z0-9-]*)`$/.exec(line.split('|')[1].trim())
      if (!name) throw new Error(`docs/desktop.md events table: cannot read the topic in ${line}`)
      return name[1]
    })
}
