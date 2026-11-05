// The undo of a new library's steps that failed (v2 package B; proposals.mjs confirmProposal of a create_library card): the
// folder back to how it was before (absent or empty), taking out only what the steps made — streams.json (and a temporary
// file of it), _pipeline\, index.jsonl / index.meta.json (the registration's index), and the note folder createLibrary
// made, only while it is empty (rmdir takes nothing else). Anything else found there is left and named. Kept apart from the
// files that write, so that the only file that names the note folder beside a write call stays write-note.mjs (V2): nothing
// here writes anything.
//
// unmake(folder, stateBefore) -> [name…]   what was left (empty: the folder is as it was)
import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE } from '../library/config.mjs';
import { NOTES_DIR } from '../library/scan.mjs';
import { INDEX_FILE, INDEX_META_FILE } from '../library/index.mjs';

const MADE = [CONFIG_FILE, '_pipeline', INDEX_FILE, INDEX_META_FILE];

export function unmake(folder, stateBefore) {
  if (!existsSync(folder)) return [];
  const left = [];
  for (const name of readdirSync(folder)) {
    const p = join(folder, name);
    if (MADE.includes(name) || /^streams\.json\.\d+\.tmp$/.test(name)) rmSync(p, { recursive: true, force: true });
    else if (name === NOTES_DIR) { try { rmdirSync(p); } catch { left.push(name); } }
    else left.push(name);
  }
  if (stateBefore === 'absent' && left.length === 0) rmdirSync(folder);
  return left;
}
