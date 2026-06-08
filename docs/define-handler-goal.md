# Goal C — defineHandler 工厂,吸收 execute/filter 脚手架

## 目标
为只定制 format() 的 handler 提供一个工厂,删除 36 份相同的 passthrough
`execute`,把 filter 终止符契约收到一处。与 Goal A 的 traits 声明式组合。

## 现状(必读)
- 36 个 handler 的 execute 是 `return executeCommand(command)`
  (`grep -rl "return executeCommand(command)" src/handlers`)
- 全部 51 个 filter 以 `makeFilteredResult(this.name, raw, output, options, undefined, omission?)` 收尾
- 自定义 execute 的少数 handler 必须保留 override:git-status(跑两条 git)、diff(先试内部 LCS)、log(先 readFile)等

## 改动清单
1. 新建 `defineHandler({ programs?, match, format, traits? }): CommandHandler`,
   提供默认 execute(passthrough)和默认 filter(format → makeFilteredResult)。
2. 把 36 个 passthrough handler 改写为 `defineHandler({...})`;`format` 即原 filter 里算 output 的那段。
3. 保留 override 的 handler 不动(显式 execute)。
4. 若 Goal A 已落地,traits 直接进 defineHandler 参数。

## 验收 → verify
- [ ] `pnpm test` 全绿
- [ ] `grep -rc "return executeCommand(command)" src/handlers` 显著下降(仅剩 override 者)
- [ ] 随机抽 5 个迁移后的 handler,输出与改前逐字节一致
- [ ] handler 注册顺序(handlers/index.ts)不变,npx 仍在最前

## 边界 / 不做
- 纯机械迁移,不改任何 handler 的压缩行为。
- 不强迁 override-execute 的 handler。
- 价值低于 A/B,建议与 A 顺手一起做。

## 改动面
~37 文件,机械、量大,低风险。
