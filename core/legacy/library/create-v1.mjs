// createLibraryV1(libraryDir, { name, language? }) -> { libraryDir }   an empty library as v1.0 laid it out: core/src's
// createLibrary, then streams.json `pipeline` = v1.0's default scoring steps (DEFAULT_PIPELINE), which 1.1's createLibrary no
// longer writes (1.1 W7b). For tests and fixtures that need a library "as 1.0 made it"; the product never calls it.
import { createLibrary } from '../../src/library/create.mjs';
import { loadWhole, saveWhole } from '../../src/library/setup.mjs';
import { DEFAULT_PIPELINE } from '../pipeline/config.mjs';

export function createLibraryV1(libraryDir, { name, language = 'zh-CN' } = {}) {
  const out = createLibrary(libraryDir, { name, language });
  const whole = loadWhole(libraryDir);
  whole.pipeline = DEFAULT_PIPELINE(language);
  saveWhole(libraryDir, whole);
  return out;
}
