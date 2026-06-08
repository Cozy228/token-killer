# Goal D — 共享 readJsonl + 提取 SURFACE_SELECTORS(可选 / Speculative)

## 目标
消除三个账本 reader 重复的 JSONL 解析,统一损坏行策略;把重复定义两次的
SURFACE_SELECTORS 提到共享模块。账本"四独立账户、永不相加"不变。

## 现状(必读)
- `src/core/history.ts:144` / `core/governance.ts:57` / `inspect/optimizeActions.ts:70`
  三处各写 `split(...).filter(Boolean).map(JSON.parse)`
- `src/context/analyzer.ts:68` 与 `src/context/optimizeCli.ts:41` 逐字重复 SURFACE_SELECTORS

## 改动清单
1. 新建 `readJsonl<T>(path: string): T[]`(放 `src/core/` 合适处),含统一的坏行处理。
2. 三个 reader 改为调用它。
3. 把 SURFACE_SELECTORS 提到 `src/context/types.ts`(或共享常量模块),两处 import。

## 验收 → verify
- [ ] `pnpm test` 全绿(ledger / gain / report / optimize 相关)
- [ ] `grep -rn "SURFACE_SELECTORS" src/` 只剩一处定义 + 若干 import
- [ ] `tk gain` / `tk report` / `tk optimize context` 输出与改前一致

## 边界 / 不做
- Speculative:仅当解析策略确实要变时才做;否则按 AGENTS.md 的 Simplicity First 跳过。
- 不合并四个账本,不改 loadLedgers 的 join。

## 改动面
~5 文件,小清理,极低风险。
