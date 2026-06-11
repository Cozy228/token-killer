# Goal — `tk debug`,把一台内测机的全部诊断现场打成一份 markdown

## 目标
内测进入真实环境(Windows / VS Code / Copilot CLI),但别人的机器我看不到。
做一个 `tk debug` 命令:在 tester 机器上跑一次,产出**一份自包含
markdown**,tester 审一眼发回。验收原则只有一条 ——

> **只给我这份 bundle + 当前源码(无任何运行环境访问),我能否定位绝大多数问题。**

为满足这条:异常行带**完整 payload**,其余行只给摘要;并盖上**确切版本戳**
让我能 diff 对应源码。**这是审查 tk 自身的命令,不是 `inspect`**(inspect 审
开发者自己的 agent 历史/上下文),所以单独立命令,不挂 `inspect --debug`。

## 现状(必读)
- `src/parse.ts:46` `RESERVED_SUBCOMMANDS` —— 新子命令在此登记
- `src/cli.ts:186-207` mode 分发阶梯;`tk inspect` 的入口在 `src/inspect/cli.ts`(镜像它,新建 `src/debug/cli.ts`)
- `src/core/history.ts:151` `listProjectHistories()` —— 跨指纹读全部 history(今天刚去碎片化,正好用上);记录字段见 `:31-66`(`source_adapter` / `quality_status` / `raw_output_path` / `exit_code`)
- `src/core/history.ts:103` `recordHookFailure(...)` —— 投递失败的落点
- `src/core/dataDir.ts:106` `rawOutputDir()`;异常行的真实 stdin/stdout 快照已落盘,路径存在记录的 `raw_output_path`
- `src/core/aggregate.ts` `qualityStatusCounts()` / `src/core/gain.ts` 聚合 —— 复用,别重写
- `src/hook/cli.ts` `tk hook check <cmd>`(rewrite 探针)、`src/hook/debug.ts:28` `debugLogPath()` = `$HOME/debug.log`
- `src/core/governance.ts:36` 每项目 `governance.jsonl`;host 配置写入点在 `src/hook/install.ts` / `claudeInstall.ts` / `src/shim/injection.ts` / `guidance.ts`
- `src/version.ts` `VERSION`(静态常量,**无 git SHA**)—— 见边界

## 改动清单
1. 登记 mode:`parse.ts` 加 `"debug"`;`cli.ts` 加 `if (parsed.mode === "debug")` → `runDebug(subArgs)`。
2. 新建 `src/debug/`:`cli.ts`(参数:`--out <path>` 默认 `reports/debug-<ts>.md`、`--full` 全行 payload、`--redact` 退回长度/label)、`render.ts`(组装 markdown)、`collect.ts`(取数,尽量调现有函数)。
3. markdown 分区(按诊断价值排序):
   1. **版本 + 环境**:`VERSION`、OS/arch/shell/node、host、**locale/codepage**(Windows GBK 命门)、install tier、安装位置
   2. **投递健康自检**(最关键):hook 解析出的绝对命令路径、shim 是否在 PATH、一次内置 `hook check` 探针的 rewrite 结果、最近 `recordHookFailure` 行
   3. **完整命令列表**:逐条原文(命令 + handler + raw/out tokens + savings% + status + exit),给覆盖全景 —— 不截尾
   4. **异常行 + 完整 payload**:筛 `status != passed || exit != 0 || saved < 0 || (handler=raw 且 raw 大)`;每条附**真实 stdin(读 `raw_output_path` 快照)+ tk output**
   5. **用量聚合**:跨指纹合并的 per-host / per-handler / per-command 计数、token、质量直方图(用今天改的诚实标签)、`source_adapter_mix`
   6. **debug.log 全文** + **host 配置原文**(脱敏后)
4. 体积闸(遵守"不许静默截断"):异常行永远完整;其余行只摘要;`--full` 才全量 payload,且省略时显式打印"N 行 payload 已略,加 --full"。

## 隐私(分流,不是放弃)
- `tk debug` = 内测同事、手动触发、发出前可审 → **默认全保真**(命令原文 + 异常行真实字节)。脱敏成长度会直接销毁解析/编码类 bug 的证据。
- "只存长度/label"的克制属于**自动 telemetry 路径**,不挪到这里;`--redact` 仅给谨慎 tester 的可选退路。

## 验收 → verify
- [ ] 找一台(或造一个 fixture)制造三类故障:hook 没接管、handler 解析错、命令报错;只拿生成的 md + 源码,能逐一定位
- [ ] hook 未安装时,bundle 的"投递自检"明确显示"未 wired",而非一片空白(区分"没用"vs"装坏")
- [ ] 异常行能从 `raw_output_path` 还原真实 stdin/stdout;快照缺失时显式标注,不假装完整
- [ ] 跨指纹合并:多仓库/worktree 的数据都进同一份 bundle
- [ ] 全程不触网、不依赖 telemetry server;`--out` 之外无副作用
- [ ] `--redact` 下无原文命令/字节泄漏(长度/label only)

## 边界 / 不做
- **git SHA 戳**:`VERSION` 是静态常量,真实 npm 安装的 dist 无 `.git`。先只盖 `VERSION` + 安装路径;若要精确 SHA,需 tsdown 在 build 时注入构建哈希(单独小改,可后置)。
- 不做自动上传(`--upload` 推预签名 URL/gist)—— 早期手动发即可,成熟再加。
- 不碰 telemetry server / Grafana 那条聚合趋势链路,二者分工:trend 走 telemetry,个案现场走 bundle。
- 不复用 `inspect` 的 scanner 做这件事(职责不同),但可复用其底层 analyzer/读取函数。

## 改动面
~2 文件改(parse/cli)+ 1 新模块(`src/debug/*`),纯新增取数+渲染,低风险;价值在"远程可诊断"。
