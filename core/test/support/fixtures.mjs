// Shared fixtures: the spec v0 sample (product spec 4.3) and a library factory.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caseDir } from './tmp.mjs';
import { createLibrary } from '../../src/library/create.mjs';
import { writeNoteFile } from '../../src/library/write-note.mjs';

// The spec sample, exactly as printed in the product spec (with its trailing comments).
export const SPEC_SAMPLE_COMMENTED = `---
id: 2026-10-31-letta-memory-blocks      # = 文件名去掉 .md；库内唯一
title: Letta 发布 Memory Blocks API
source: https://letta.com/blog/memory-blocks
source_name: letta-blog                 # 来源名；手动投入写 manual；导入写 file
date: 2026-10-31                        # 资料自己的日期
collected: 2026-11-01                   # 流息第一次见到它
kept: 2026-11-01                        # 你点收藏的日期；authored 没有这项
status: kept                            # kept | authored | archived
topics: [agent 记忆]
scores:                                 # 只有经过流水线的才有；键 = 关卡 id
  relevance: { score: 0.86, reason: 直接讲 agent 记忆的实现 }
  substance: { score: 0.72, reason: 有接口示例，无评测 }
  freshness: { value: new, reason: 与库里 3 条相关，是新进展 }
---
**这是什么：**一家 agent 框架公司的产品发布……
- 和 [[MemGPT 论文]] 是同一条线的产品化
`;

// The same header with the comments removed: what serializeFrontmatter must reproduce byte for byte.
export const SPEC_HEADER = `---
id: 2026-10-31-letta-memory-blocks
title: Letta 发布 Memory Blocks API
source: https://letta.com/blog/memory-blocks
source_name: letta-blog
date: 2026-10-31
collected: 2026-11-01
kept: 2026-11-01
status: kept
topics: [agent 记忆]
scores:
  relevance: { score: 0.86, reason: 直接讲 agent 记忆的实现 }
  substance: { score: 0.72, reason: 有接口示例，无评测 }
  freshness: { value: new, reason: 与库里 3 条相关，是新进展 }
---
`;

export const SPEC_BODY = `**这是什么：**一家 agent 框架公司的产品发布……
- 和 [[MemGPT 论文]] 是同一条线的产品化
`;

export const SPEC_ID = '2026-10-31-letta-memory-blocks';

export const SPEC_META = {
  id: SPEC_ID,
  title: 'Letta 发布 Memory Blocks API',
  source: 'https://letta.com/blog/memory-blocks',
  source_name: 'letta-blog',
  date: '2026-10-31',
  collected: '2026-11-01',
  kept: '2026-11-01',
  status: 'kept',
  topics: ['agent 记忆'],
  scores: {
    relevance: { score: 0.86, reason: '直接讲 agent 记忆的实现' },
    substance: { score: 0.72, reason: '有接口示例，无评测' },
    freshness: { value: 'new', reason: '与库里 3 条相关，是新进展' },
  },
};

export const TEST_CONFIG = {
  name: '测试库',
  topics: [{ name: 'agent 记忆', keywords: ['memory'] }, { name: 'MCP', keywords: ['mcp'] }],
  sources: [],
  pipeline: { nodes: [{ id: 'relevance' }, { id: 'substance' }, { id: 'freshness' }] },
};

// A fresh library in a clean scratch folder, with TEST_CONFIG as streams.json.
export function makeLibrary(caseName, config = TEST_CONFIG) {
  const dir = caseDir(caseName);
  createLibrary(dir, { name: config.name ?? caseName });
  writeFileSync(join(dir, 'streams.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return dir;
}

// A conforming header for id `id`, with overrides.
export function header(id, overrides = {}) {
  return {
    title: `Title of ${id}`,
    source: `https://example.test/${id}`,
    source_name: 'example',
    date: '2026-10-30',
    collected: '2026-10-31',
    kept: '2026-11-01',
    status: 'kept',
    topics: ['agent 记忆'],
    ...overrides,
  };
}

// Writes a conforming note through the single writer (never raw).
export function keepNote(dir, id, overrides = {}, body = `Body of ${id}.\n`) {
  return writeNoteFile(dir, { id, header: header(id, overrides), body }, { by: 'keep' });
}
