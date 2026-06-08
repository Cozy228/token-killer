# Goal A — 让 handler 声明 gate traits,消除 base.ts 的三个名字 Set

## 目标
把 `src/handlers/base.ts` 中按 handler 名字索引的三个 Set
(`INFLATION_EXEMPT_HANDLERS` / `MASKING_HANDLERS` / `LADDER_HANDLERS`)
替换为 handler 自己声明的 `traits`,gate 通过接口读取,不再硬编码名字。

## 现状(必读)
- `src/handlers/base.ts:60`  INFLATION_EXEMPT_HANDLERS(19 条)
- `src/handlers/base.ts:96`  MASKING_HANDLERS(env)
- `src/handlers/base.ts:107` LADDER_HANDLERS(13 条)
- gate 分支点:`base.ts:175`(inflationExempt)、`:187`(masking)、`:191`(LADDER.has)
- 接口定义:`src/types.ts:95` CommandHandler
- 已有的同类 seam 参照:`OmissionDeclaration`(types.ts:32)已把运行时削减事实穿过接口——traits 对静态事实做同一件事。

> 计数事实:三个 Set 共 19 + 1 + 13 = 33 条名字,去重后 24 个 handler 带至少一个 trait;其余 27 个 handler 无 trait,不动。

## 改动清单
1. `src/types.ts`:在 `CommandHandler` 加可选
   ```ts
   traits?: { structural?: boolean; masksSecrets?: boolean; ladder?: boolean };
   ```
2. 给 24 个带 trait 的 handler 各加一行 `traits`。映射严格按现有 Set 成员,逐个核对(注意非对称:`git-show` 在 structural+ladder,`tsc/mypy/pip/curl/log/summary/git-status/git-push/gh/glab` 只在 structural,`ruff/js-test/playwright/dotnet/psql` 只在 ladder,`env` 三者全有)。
3. `src/handlers/base.ts`:删除三个 Set;把
   - `INFLATION_EXEMPT_HANDLERS.has(handler)` → 读 `traits?.structural`
   - `MASKING_HANDLERS.has(handler)`         → `traits?.masksSecrets`
   - `LADDER_HANDLERS.has(handler)`          → `traits?.ladder`
   `makeFilteredResult` 当前签名收的是 `handler: string`,改为额外接收 traits(或传 handler 对象);所有调用点在各 handler 的 `filter()` 里,改为传 `this.traits`。

## 验收 → verify
- [ ] `pnpm test` 全绿,特别是 qualityGate 相关用例
- [ ] `grep -rn "INFLATION_EXEMPT\|MASKING_HANDLERS\|LADDER_HANDLERS" src/` 无命中
- [ ] 抽查:`tk git diff <大 commit>`、`tk --raw env`(打码仍在)、`tk pytest`(ladder 声明仍生效)三条手测输出与改前一致
- [ ] 每个原 Set 成员都已迁移为对应 trait(逐项对照清单)

## 边界 / 不做
- 不改 gate 的判断逻辑本身,只改"事实从哪来"。
- 不触碰 ADR 0001 的决定。
- 27 个无 trait 的 handler 不加任何字段。

## 改动面
~20 文件,机械、集中,低风险。
