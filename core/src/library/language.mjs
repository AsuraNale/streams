// The language of a library (1.1 W7b): what the ask, the inbox decisions and the header proposals need of streams.json once
// v1.0's scoring pipeline left core/src. It is where v1.0 kept it, streams.json `pipeline.language`, so a library made by
// either version reads the same.
//   LANGUAGES                 the languages a library can be in
//   languageOf(language)      that language when it is one of them, else 'zh-CN'
//   languageOfConfig(config)  the language of a streams.json object (null / no pipeline: 'zh-CN')
//   languageConfig(language)  what createLibrary writes for it: { language }
export const LANGUAGES = Object.freeze(['zh-CN', 'en']);

export function languageOf(language) {
  return LANGUAGES.includes(language) ? language : 'zh-CN';
}

export function languageOfConfig(config) {
  const p = config && typeof config === 'object' ? config.pipeline : null;
  return languageOf(p && typeof p === 'object' && !Array.isArray(p) ? p.language : undefined);
}

export function languageConfig(language) {
  return { language: languageOf(language) };
}
