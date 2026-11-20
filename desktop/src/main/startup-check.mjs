/**
 * 1.1 W1 (C2 / C3): before the app does anything, the core's own files must be sound — the definition of objects and
 * actions (core/src/ontology/streams.json) and the two SOPs (core/src/sop/). If one is missing, empty or broken the app
 * says so and does not start, rather than running agents on an empty instruction or an unchecked list of actions.
 * startupProblem({ check, language }) -> null when all is well, else { title, body, problems } in the app's language.
 * `check` is the core's startupCheck (with the folders a development run may point elsewhere).
 * @module desktop/main/startup-check
 */

import { APP } from './texts/app.js'
import { APP as APP_EN } from './texts-en/app.js'

const TABLES = Object.freeze({ 'zh-CN': APP, en: APP_EN })

export function startupProblem({ check, language = 'zh-CN' } = {}) {
  const r = check()
  if (r.ok) return null
  const t = (TABLES[language] ?? APP).startupBroken
  const lines = r.problems.map(p => `- ${p.message}`).join('\n')
  return { title: t.title, body: t.body.replace('{problems}', lines), problems: r.problems }
}
