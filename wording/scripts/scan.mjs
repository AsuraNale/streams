#!/usr/bin/env node
// Scan a card (an item as the pipeline shows it, or a `{questions: [...]}` payload) or a text for banned terms (V7).
//
// Usage:
//   node wording/scripts/scan.mjs card.json [--user-text user.txt] [--advise] [--json]
//   echo '{"question":"..."}' | node wording/scripts/scan.mjs -
//   node wording/scripts/scan.mjs --text "这一条还 pending" [--quote-cues]
// Cards are always scanned strictly: a quote counts as the user's only when it is found
// verbatim in --user-text. --quote-cues (cue words such as 原话 / 你说 stand in for the
// user's text) is the loose mode for free chat text, so it is accepted only with --text.
// Exit code: 0 = no hits, 1 = hits, 2 = bad input.

import { readFileSync } from 'node:fs'
import { scanPayload, scanText, formatForAgent } from '../src/scanner.mjs'

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const value = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

try {
  const opts = { advise: flag('--advise') }
  const userTextFile = value('--user-text')
  if (userTextFile) opts.userText = readFileSync(userTextFile, 'utf8')

  let result
  const text = value('--text')
  if (flag('--quote-cues')) {
    if (text === undefined) throw new Error('--quote-cues works only with --text: cards are always scanned strictly (quotes are checked against --user-text)')
    opts.quoteCues = true
  }
  if (text !== undefined) {
    result = scanText(text, opts, 'text')
  } else {
    const valued = new Set(['--user-text', '--text'].map(name => args.indexOf(name) + 1).filter(i => i > 0))
    const file = args.find((a, i) => (!a.startsWith('--') || a === '-') && !valued.has(i))
    if (!file) throw new Error('give a card JSON file, "-" for stdin, or --text "..."')
    const raw = readFileSync(file === '-' ? 0 : file, 'utf8')
    result = scanPayload(JSON.parse(raw), opts)
  }

  if (flag('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    console.log('ok: no banned terms')
    for (const a of result.advisories) console.log(`advisory: ${a.field} 「${a.text}」 ${a.note}`)
  } else {
    console.log(formatForAgent(result))
  }
  process.exit(result.ok ? 0 : 1)
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
