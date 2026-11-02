# wording — 对用户的用词

- `glossary.json` 词表（单一来源：内部词 → 对用户说的话，方案 §1.7 的对照表）· `banned-terms.json` 禁用词表（V7）
- `src/scanner.mjs` 扫描器：界面字典、模板文字、模型写给用户的一段话，扫描前先归一写法变体（`src/normalize.mjs`）
- `scripts/scan.mjs` 命令行

```
npm test                                      # 在 wording/ 下跑测试
node scripts/scan.mjs --text "这一条还 pending"   # 扫一段文字：退出码 0 = 没命中，1 = 命中
node scripts/scan.mjs test/fixtures/old-item.json
```

说明见 `../docs/wording.md`。机制与扫描器沿用外壳来源的（致谢见 docs/wording.md），词表内容是流息的。
