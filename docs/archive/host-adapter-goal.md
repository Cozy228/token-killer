# Goal B — 一个 HostAdapter,把 host 事实收到一条 seam 后面

## 目标
把散在 6+ 文件的 per-host 分支(dialect / tier / 各类路径 / 安装)收进
一个 `HostAdapter` 接口;`init.ts` 通过 `selectTier()` + adapter 驱动,
不再用硬编码 if 阶梯。让 `selectTier()` 从死代码变成唯一的 tier 出口。

## 现状(必读)
- `src/shim/init.ts:261-329`  硬编码 if 阶梯(claude→copilot→vscode→injection)
- `src/shim/detect.ts:57`     selectTier(...) —— 已正确编码 ADR 0002 阶梯,但全仓库无人调用(死代码,`grep -rn selectTier src/` 仅命中定义行)
- `src/shim/injection.ts:66`  userInjectionPath(host)
- `src/shim/guidance.ts:60`   guidanceFilePath(host) / guidanceLoader(host)
- `src/shim/hostConfig.ts`、`src/hook/install.ts`、`src/hook/claudeInstall.ts` 各自的安装细节
- 决策依据:ADR 0002(delivery tier)。阶梯本身不变,只重接线。

## 改动清单
1. 新建 `src/shim/hostAdapter.ts`:
   ```ts
   interface HostAdapter {
     dialect: Dialect;
     supportedTiers: Tier[];
     guidancePath(home: string): string | undefined;
     injectionPath(loc): string;
     installHook?(opts): InstallResult;   // 仅支持 hook 的 host 实现
   }
   const adapters: Record<Host, HostAdapter> = {
     "copilot-cli": ..., "claude-code": ..., vscode: ..., unknown: ...,
   };
   ```
2. 把 `injection.ts` / `guidance.ts` / install 里的 `if (host===...)` 路径搬进对应 adapter(函数体照搬,不改逻辑)。
3. 重写 `init.ts:261-329`:
   ```ts
   const a = adapters[host];
   const tier = selectTier(host, !!a.installHook, probePass);
   // 按 tier 调 a.installHook / installShim / writeInjection(a.injectionPath(...))
   ```
   删掉三段硬编码 if。
4. `selectTier` 由 `supportedTiers` 推导其偏好(或保留现状但确保被调用)。

## 验收 → verify
- [ ] `grep -rn "selectTier" src/` 至少有一个调用点(不再是死代码)
- [ ] `tk init --host copilot-cli|claude-code|vscode --dry-run` 三条输出与改前逐行一致
- [ ] `tk init --host claude-code` 实装后 `~/.claude/settings.json` 与改前等价
- [ ] shim/hook/injection 三套安装的现有测试全绿
- [ ] 新增 host 只需新增一个 adapter 条目(用一个 stub host 验证可行性)

## 边界 / 不做
- 不改 ADR 0002 的 tier 阶梯本身,只让代码对齐它。
- 不动 dialect 归一化层(normalize.ts / copilot.ts),那层已 deep。
- 建议在 Goal A 之后做。

## 改动面
~7 文件改 + 1 新模块,结构重构,中高风险。
