// V7 · 界面禁词零命中：Bronze、Silver、Gold、judge、keeper、gate、Medallion、pending、ledger；品牌词 Claude、Anthropic、OpenAI、ChatGPT 只出现在「连接你电脑上的 …」、型号表和许可证页
// 怎么核：扫描器跑全部界面文件（中英两套）
// 占位（2026-11-02）：实装时把 notYet 换成真的核法，并保留一条故意失败的反向用例。
import { test } from 'node:test'
import { notYet } from './placeholder.mjs'

test('V7: 界面禁词零命中：Bronze、Silver、Gold、judge、keeper、gate、Medallion、pending、ledger；品牌词 Claude、Anthropic、OpenAI、ChatGPT 只出现在「连接你电脑上的 …」、型号表和许可证页', () => {
  notYet('V7')
})
