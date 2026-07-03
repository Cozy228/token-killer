# 让AI主动管理自己的上下文

> 来源：<https://blog.xlab.app/p/6a966aeb/>（透明人博客，发表于 2026-02-08，分类 AI）
> 抓取：2026-06-26

是时候让上下文管理也 Agentic 起来了。

## 上下文压缩问题

目前来说大部分的上下文管理都是关注里面应该放什么，怎么正确的找到合适的东西放进去，比如 RAG、MEM 之类的，少有如何清理的讨论。

目前的清理主要是靠达到上下文窗口的某个阈值，比如 80%，触发一次压缩，从而实现清理，最早可能还是 Claude Code 引入的，如今已经成为基本功能。

Claude Code 压缩逻辑：修改系统提示词，带上全量历史消息，并追加压缩提示词。

可以看到这是一次无缓存的、全量历史消息调用，还是比较费 Token 的。

```
// 原始消息
System Prompt
Messages

// 压缩消息
Compact System Prompt
Messages
Compact User Prompt
```

应该很多人都会遇到压缩完，丢失了很多东西，聊起来费劲。

理论上 Agent 是能够更早感知“我需要压缩一下”，实现更加语义/任务级别的上下文压缩。

理想情况下 Agent 能够主动的管理自己上下文，主动的选择的加载和卸载哪些内容，在长对话/多话题上应该会很有用。

现在的 Agent 就像一个程序只能申请内存，但不能释放内存，只能靠压缩然后重启。

## Kimi D-Mail

最早应该是在 kimi-cli 上看到的 d-mail 功能。

当 AI 发现做了一些低信息密度的事情时，比如读了一个大文件，其实有用的只有一点点，此时调用 d-mail 进行时间回溯，让 agent 回到之前读之前的上下文，并带一条消息，告诉之前的自己，读了 xxx 发现了 xxx。

- kimi 文档 <https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/tools/dmail/dmail.md>
- 字节内网文档 <https://bytetech.info/articles/7571069998476165146>
- 公开研究资料 <https://leslieo2.github.io/posts/agent-control-via-timetravel-checkpoints/>

## Pi Session Tree

之后看到了 pi agent，其中 session 的设计很有意思：

- 有完整、透明、且供应商无关的统一上下文存储，会话可以方便的交接给其他模型继续推理。
- session 以树的形式存储，每个消息都是一个节点，并提供分支和节点间的跳转功能。
- 其中 `/tree` 命令就是可以跳转到任意节点，并可选带上一个 summary，这一点就和 d-mail 很像了。

作者这篇写了设计思路，推荐一读 <https://mariozechner.at/posts/2025-11-30-pi-coding-agent/>。以防你不知道，openclaw 就是用 pi 开发的。

当然目前很多 agent 都有上下文存储和跳转功能：

- 上下文存储和恢复基本都是 `/resume`。
- claude/codex 都是按两下 esc 跳转。
- opencode 则没有，但是有 `/fork` 命令，可能过于冷门了，文档上甚至都没有介绍 fork 命令。

但总之这都是面向人类的，不是面向 agent 的。

pi 能很方便开发扩展，那么很简单，想办法把 `/tree` 交给 AI。

## Git-Like Tree

我觉得 session tree 很容易类比为 git workflow：

- 每条消息都是一个 commit。
- 跳转就是 checkout，可以跳到任意一个 commit。
- 总结的动作更像是提交 mr，不带上全部垃圾 commit，而是合并为一个 mr-commit。

举个例子：

```
├─ user: "开发一个X功能"
│  └─ assistant: "plan..."           <- 1. base分支
│     ├─ user: "尝试用A方法开发"       <- 2. 在base分支新建分支git branch-1
│     │  └─ assistant: "work..."
│     │     └─ [......]
│     │        └─ user: "不太行"     <- 3. 产生了一堆commit后，此时创建一个mr合并到base
│     └─ sum: "尝试了A方法..."        <- 4. 不以全部commit提交，而是精简为一个mr-commit
│        └─ user: "尝试用B方法开发"    <- 5. 继续开发
│           └─ assistant: "..."
```

左边的数据就是 pi tree 能提供的数据，为了能让 agent 准确的执行跳转，让所有消息都带上 ID 标记，agent 只需要带着 ID 调一下 tree 跳转就可以了。

但实际上在产生了一堆对话之后，session tree 会非常巨大，AI 看一眼 tree 上下文就炸了，所以必定要做精简。

## Session Tree -> Session Log

pi tree 是带有所有分支的，完整的 tree 可能长这样，可以无限套娃的回溯，甚至可以再次回溯到某个历史分支上。

但 agent 其实只要感知当前 session 的内容就可以了，并不需要感知其他分支，因为所有的分支消息的内容都已经包含在 SUM 节点中了。

那么此时就会发现只看当前红线消息＝当前 session 全部会话，一切似乎又回到了总结压缩的这件事。

但有一点不同，我们需要在这个总结上带上跳转标记。

## 如何在 Session Log 上跳转

Session Log ＝ 当前会话的带标记的总结消息。

就像 git log 一样：

```
35d4182f (ROOT)
ba87607d USER: xxx
a8e58e1d AI: xxxx
37ac65e1 TOOL: xxxx
36c8ea0b SUM: xxxx     <- 这里就是总结消息，类似一个mr-commit
236d45e1 USER: xxxx
a8e58e1d (HEAD) AI: xxxx
```

当决策跳转时，则是 git checkout，并带上一个消息：

```
context_checkout("8c5265a1", "summary...")
```

ReAct 循环将变成这样。

需要注意的是这里的总结是一个无缓存的、全量历史的调用，如果在每次 ReAct 循环都调用一次，成本应该会很爆炸。

有几个改进思路：

**调整触发时机** —— 降低频率？特定场景/规则触发？某种意义上，似乎又回到何时和如何压缩的问题了，而且从成本上也是一样的，只是结构上压缩的逻辑不同。

**在 session 内构建** —— 总结和跳转决策都在当前会话这个 session 中继续，就能用缓存了。虽然在当前 session 中有所有的历史会话，但没有 ID，如何在总结的时候提供标记：

1. 消息内容即 ID，agent：我要回到包含“xxxxxx”消息的时间。
2. 由 agent 自己在历史中构建，在对话过程中记录关键节点，关键节点的骨架图＝session log。

我觉得 b 更有意思一些。

## 循环：构建-感知-跳转

在 agent 的对话中需要嵌入这样的循环：

- **构建**：Agent 在对话中主动标记关键节点，形成骨架图。因为每个会话动作是历史的一部分，会被存到 session 中，自带 message id。
- **感知**：通过骨架图，观察上下文状态，当前所处的位置。
- **跳转**：决策在骨架图中跳转，并带上一条消息。

```
35d4182f (ROOT)
a8e58e1d (plan-done)AI: xxxx
36c8ea0b SUM: try A fail, reason: xx...
236d45e1 USER: try B
a8e58e1d (HEAD try-B-start) AI: xxxx
```

### Tool 设计

依旧借用 git 的概念，设计了 3 个工具：

- `context_tag`：git tag，标记节点。
- `context_log`：git log，查看上下文骨架。
- `context_checkout`：git checkout，在骨架上跳转。

为了能让 AI 更好的感知和决策，除了上下文骨架之外，还应该感知上下文占用情况、对话深度，离最近的 tag 有多远，提醒及时打 tag，前置设计了一个 HUD，`context_log` 大概长这样：

```
[Context Dashboard]
• Context Usage:    0.9% (8.2k/1.0M)
• Segment Size:     4 steps since last tag 'exp-b-start'
---------------------------------------------------
ba87607d ...
78c541e2 ...
```

设计更好的 context log 仍然有很多工作：

- 最近的消息最好全部展示。
- tag 太多的话也考虑需要二次折叠。
- 指定 message id 和范围，便于查看折叠的细节，就像翻阅 git log 一样。

### Skill

为了让 Agent 更好的使用这些工具，还补充了一个 skill：

- context 知识，为什么要压缩。
- 何时怎么使用工具。
- 怎么打 tag。
- 观察 context log 之后如何做决策，什么时候应该跳转，应该跳转到哪里。
- checkout 的消息怎么生成，应该包含哪些重要消息。
- 最佳实践和案例。

## 回到未来：无损的时间回溯

d-mail 跳转是回到过去，我还想前往未来。

比如一个简单的修 bug 问题来模拟多线对话的场景。

绿线是 dmail-like 的回到过去，还需要能够有一条紫线回到未来，一切时间旅行都是无损的。

实现也比较简单，在所有的 SUM 中标记从哪个节点过来的，可以随时 checkout 回去：

```
35d4182f (ROOT)
a8e58e1d (plan-done)AI: xxxx
36c8ea0b (from 8ea0891b) SUM: try A fail, reason: xx...
236d45e1 USER: try B
a8e58e1d (HEAD try-B-start) AI: xxxx
```

session tree 还有个好处是，只要不是太久远的分支，都是在缓存里。

更好的时间回溯仍然有很多工作可以做：

- 不一定是真的回去，也可以是找回某些消息，或许提供一个召回工具。
- 历史消息都在文件里，或许直接带上：这段原始消息在 xxxx.jsonl 中。agent 自己搜索查看，看完再回溯到看之前。

## 最后

刚开发的，不知道能有多少提升，还需要更多业务验证，欢迎试用。

```
npm install -g @mariozechner/pi-coding-agent
pi install npm:pi-context
```

<https://github.com/ttttmr/pi-context>

理论上也可以迁移到其他的工具上，毕竟都有会话存储的功能。

## 一些其他想法

- 给 Agent 一个结构化的上下文，让 Agent 自己编排和管理，可能是未来一个不错的方向，面对多线/长周期任务可能比较有用。
- 个人助手：比如在豆包里聊天，换话题，再跳回原来的话题。
- wide/deep-research 可能也有用，因为选择多，噪音多。
- 分支探索再回溯有点像共享历史上下文的 sub-agent，d-mail 消息就是 sub-agent 的响应。sub-agent 的好处是可以并发。
- 其实和 plan 也有点像，对比 planning-with-files，更像是 planning-in-context-files。
- 如果 tag/checkout 的时候搭配可选的配套 git 操作，这样 context 和本地文件可以同步回溯。
- 如果一个 agent 的所有会话都在一个巨大的 session tree 上，可以随时回溯的话，那是不是就是记忆了，经过不断的 summary，重要的内容自然的被保留在 session tree 的主线上，不重要的内容逐渐被稀释在久远的分支中。
- openai responses api 中附带的 summary 字段很适合用来构建 session log 骨架，可惜 pi 不兼容。
