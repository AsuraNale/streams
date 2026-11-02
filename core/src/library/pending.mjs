// listPending(libraryDir) -> [{ file, codes, messages, proposedHeader? }]
//
// Files in notes/ that do not conform to spec v0. Read-only: proposedHeader is a
// suggestion returned to the caller, nothing is written.
// proposedHeader is offered only for:
//   - a file with no front matter at all (title from "# heading" or file name,
//     source "file:<name>", date = file mtime (local calendar day), status authored, topics [])
//   - a file with front matter whose only problems are missing source and/or date
//     (only the missing ones are filled, everything else is kept as is)
import { scanLibrary } from './scan.mjs';
import { idFromFileName } from './validate.mjs';

export function listPending(libraryDir) {
  const { pending } = scanLibrary(libraryDir);
  return pending.map((p) => {
    const out = { file: p.file, codes: p.codes, messages: p.messages };
    const header = proposeHeader(p);
    if (header) out.proposedHeader = header;
    return out;
  });
}

export function localDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function proposeHeader(p) {
  const id = idFromFileName(p.file);
  if (p.codes.length === 1 && p.codes[0] === 'no-frontmatter') {
    const text = p.text ?? p.body ?? '';
    const h1 = /^#\s+(.+?)\s*$/m.exec(text);
    return {
      id,
      title: h1 ? h1[1] : id,
      source: `file:${p.file}`,
      date: localDate(p.stat.mtimeMs),
      status: 'authored',
      topics: [],
    };
  }
  const fixable = new Set(['missing:source', 'missing:date']);
  if (p.meta && p.codes.length > 0 && p.codes.every((c) => fixable.has(c))) {
    const header = { ...p.meta };
    if (p.codes.includes('missing:source')) header.source = `file:${p.file}`;
    if (p.codes.includes('missing:date')) header.date = localDate(p.stat.mtimeMs);
    return header;
  }
  return null;
}
