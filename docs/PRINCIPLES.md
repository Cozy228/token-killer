# Token Killer Product Principles

> 产品心智层：为什么这么压、压到哪为止、如何判断是否压对了。
> 实现细节（命令族策略表、quality gate 机制、parser tier、delivery policy）见 [DESIGN.md](./DESIGN.md)，本文不复制规则，避免两份事实源 drift。

## One-liner

**Token Killer compresses command output only when it can preserve every actionable fact the coding agent needs for the next step; otherwise it returns raw output.**

> `tk` 只压缩确定无损的噪音，不压缩不确定的证据。

定位不是 "CLI output summarizer"，而是 **command-aware context optimizer for coding agents**——最可靠的 agent context filter，不是最狠的压缩器。

## Positioning statements

这几句是 `tk` 的产品定位语，DESIGN.md 没有，刻意保留在产品层：

- **`tk` 是证据投影器，不是摘要器。** 面向人的摘要可以省细节；面向 agent 的输出不能省可行动事实。不要问"这段输出大意是什么"，要问"agent 下一步需要哪些证据"。
- **只删壳，不删证据。** 可删：ANSI 码、进度条、spinner、重复空行、装饰边框、wrapper 噪音、passed test 冗长列表、完全重复日志、确定性无关目录（如 `node_modules`）。不可删：错误细节、文件路径、行号、diff hunk、匹配行、SQL rows、stderr 语义、failing assertion、crash reason、dependency conflict。
- **0% savings 不是失败，错压才是失败。** 高 savings + 错内容，比 0 savings 更危险。
- **不给 agent 制造幻觉上下文。** `+N more` / `truncated` / `omitted` / "只展示部分结果" 这类"假完整"输出被禁止——agent 没看到被省的内容，却以为掌握了全局。
- **质量门是护城河，不是实现细节。** `tk` 与 RTK 的关键区别不是"谁更会压"，而是 `tk` 有自动回退（Safe Compression Gate）。RTK 容易高 savings 但错。这是核心卖点。

## North-star metric

不要用 `>80% savings` 当全局指标——高压缩率只能来自确定性结构（`tree`、`ruff`），不能来自对 `git diff` 这类每行都是证据的内容的猜测。

正确的产品指标：

```text
P0 retention pass rate = 100%（硬门槛，先证明没丢行动信息）
→ 然后最大化 P0-passing outputs 的 token-weighted savings
```

先证明无损，再谈省多少。

## Evaluation: agent next-action equivalence

评估不问"人看得懂吗"，问"agent 能不能用 compressed output 做出和 raw 一样的下一步"。probe-based，probe 答案与 raw 不一致即失败：

| 输出类型 | Probe |
|---|---|
| diagnostics (tsc/eslint/ruff) | 该改哪个文件、哪一行？ |
| tests (vitest/jest/pytest) | 哪个测试失败？失败原因是什么？ |
| git status | 哪些文件 staged / unstaged / untracked？ |
| git diff | patch 内容是否完整？ |
| search (rg/grep) | 所有匹配位置在哪里？ |
| psql / JSON | 查询返回了哪些行？ |
| docker / kubectl | 哪个服务异常？原因是什么？ |

## See also

- [DESIGN.md](./DESIGN.md) §1.4 retention-first、§1.6 quality gate（含禁止模式）、命令族策略表、parser tier 与 delivery policy——本文所有"规则"的实现合同都在那里。
- [README.md](../README.md) `## Principles`——10 条对外精简版。
