第一部分：什么是 Harness Engineering
Harness Engineering是指围绕 AI Agent（特别是 Coding Agent）设计和构建约束机制、反馈回路、工作流控制和持续改进循环的系统工程实践。它解决的核心问题是：当 AI Agent 拥有了强大的代码生成能力后，如何确保其输出的可靠性、一致性和长期可维护性。

"Harness"本意是马具——缰绳、鞍具那一套东西，把马的力气引到正确方向上。拿来类比 AI Agent 挺合适：LLM 就像一匹蛮力十足但方向感不太行的马，跑得快但容易跑偏.

1.1 三层工程概念的关系
Harness Engineering 并不是凭空出现的，它是 Prompt Engineering 和 Context Engineering 的自然延伸。三者构成嵌套关系：

Phil Schmid 打了个比方：模型是 CPU，Harness 是操作系统——CPU 再强，OS 拉胯也白搭。mtrajan 的区分更直接：Context Engineering 管的是"给 Agent 看什么"，Harness Engineering 管的是"系统怎么防崩、怎么量化、怎么修".


1.2 这个词是怎么火起来的
2025 年底已经有人零星提到过这个说法，但真正结晶成术语是 2026 年 2 月的事：

Mitchell Hashimoto（HashiCorp 联合创始人、Terraform 创作者）在博客中首次明确命名了这一实践，提出核心理念："每当发现 Agent 犯错，就花时间设计一个解决方案，确保 Agent 永远不会再犯同样的错误".

OpenAI数天后发布了"Harness engineering: leveraging Codex in an agent-first world"——一篇关于三名工程师用 5 个月构建百万行代码产品的详细报告.

Ethan Mollick围绕"Models, Apps, and Harnesses"三个概念重组了他的 AI 指南框架，迅速推动了术语的规范化。

Martin Fowler发表深度分析文章，将 OpenAI 的 Harness 分类为三个领域：Context Engineering、Architecture Constraints 和 Garbage Collection.

第二部分：为什么需要 Harness Engineering
2.1 模型能力不是瓶颈
这一判断得到了量化验证：

Can.ac 实验：仅改变 Harness 的工具格式（编辑接口），就在 16 个模型上显著提升了编码基准分数。效果最显著的 Grok Code Fast 1 从 6.7% 跃升至 68.3%——没有修改任何模型权重.

LangChain实验：仅通过 Harness 改进，在 Terminal Bench 2.0 上从第 30 名跃升至第 5 名，同一模型提升了 13.7 分。

这些结果表明：在纠结模型选择之前，先审视 Harness 设计能获得更高的投资回报率。

OpenAI 团队说得很直接：真正卡你的不是 Agent 写代码的能力，而是围绕它的结构、工具和反馈机制跟不上. 五个独立团队得出了相同结论：基础设施才是瓶颈，而非智能水平。

2.2 Agent 的典型失败模式
Anthropic 在做长时间运行 Agent 的过程中，总结了 Agent 常见的翻车姿势：

失败模式 1：试图一步到位（One-shotting）。 Agent 倾向于一次做完所有事情，结果在实现进行到一半时上下文窗口就耗尽了。下一个会话启动时看到的是半成品、没有文档的代码，只能花大量时间猜测之前发生了什么并试图恢复工作状态。

失败模式 2：过早宣布胜利。 在项目后期，当部分功能已经完成后，Agent 会环顾四周，看到已有进展就直接宣布任务完成——即使还有大量功能未实现。

失败模式 3：过早标记功能完成。 在没有明确提示的情况下，Agent 写完代码就标记为“完成”，却没有做端到端测试。单元测试或 curl 命令通过了不代表功能真正可用。

失败模式 4：环境启动困难。 每次新会话启动时，Agent 需要花费大量 token 弄清楚如何运行应用、如何启动开发服务器，而不是把时间花在实际开发上。

2.3 上下文窗口利用率的甜蜜区间
Dex Horthy 有个很实用的经验观察：上下文填得越满，LLM输出质量越差。以 168K token 的上下文窗口为例，大约用到 40% 就开始走下坡路了：

Smart Zone（前约 40%）：聚焦、准确的推理。Agent 拥有相关、精炼的信息。

Dumb Zone（超过约 40%）：幻觉、循环、格式错误的工具调用、低质量代码。更多 token 反而损害性能。


说白了，给 Agent 塞一堆 MCP 工具、冗长文档和累积的对话历史，不会让它更聪明——反而会让它变笨。

第三部分：Harness Engineering 的四大支柱
综合 OpenAI、Anthropic、Carlini（C 编译器项目）、Huntley、Horthy 等五个独立团队的实践，四种模式反复出现并形成收敛。这就是 Harness Engineering 的四大支柱。


3.1 支柱一：上下文架构（Context Architecture）
核心原则：Agent 应当恰好获得当前任务所需的上下文——不多不少。

每个团队都独立发现，将所有指令塞进一个文件无法扩展。解决方案是分层上下文与渐进式披露：

OpenAI使用 AGENTS.md 作为动态反馈循环文件，每当 Agent 遇到失败时更新。

Anthropic使用大量 README 和每次会话频繁更新的进度文件。

Horthy倡导"频繁有意识压缩"（Frequent Intentional Compaction）。

Vasilopoulos（2026 论文）将上下文形式化为三层：热记忆（Hot Memory）、领域专家（Domain Experts）、冷记忆知识库（Cold-Memory Knowledge）。

实践建议——三层上下文体系：

层级	加载时机	内容示例	上下文占用
Tier 1：会话常驻	每次会话自动加载	AGENTS.md / CLAUDE.md，项目结构概览	最小
Tier 2：按需加载	特定子 Agent 或技能被调用时	专业化 Agent 的上下文、领域知识	中等
Tier 3：持久化知识库	Agent 主动查询时	研究文档、规格说明、历史会话	按需
3.2 支柱二：Agent 专业化（Agent Specialization）
核心原则：专注于特定领域、拥有受限工具的 Agent 优于拥有全部权限的通用 Agent。

Carlini（Anthropic C 编译器项目）将 Agent 专业化为编译器核心、去重、性能优化和文档四类角色。

Vasilopoulos部署了 19 个领域特定 Agent。

Huntley使用子 Agent 来保持主 Agent 上下文的清洁。

专业化不仅是组织性的——它本身就是上下文管理策略。每个专家因为携带更少的无关信息，所以运行在"Smart Zone"内。

实践中的角色分工：

Agent 角色	职责范围	工具权限
研究 Agent	探索代码库、分析实现细节	只读（Read, Grep, Glob）
规划 Agent	将需求分解为结构化任务	只读，无写入权限
执行 Agent	实现单个具体任务	限定范围的读写权限
审查 Agent	审计完成的工作，标记问题	只读 + 标记权限
调试 Agent	修复审查发现的问题	限定范围的修复权限
清理 Agent	对抗熵积累，清理低质量代码	读写权限
3.3 支柱三：持久化记忆（Persistent Memory）
核心原则：进度持久化在文件系统上，而非上下文窗口中。每次新 Agent 会话从零开始，通过文件系统制品重建上下文。

Anthropic 解决这一问题的方案堪称经典：

初始化 Agent：首次会话使用专门的 prompt，要求模型建立初始环境——init.sh 脚本、claude-progress.txt 进度文件和初始 git 提交。

编码 Agent：后续每次会话要求模型在做出增量进展的同时，留下结构化更新。

每个编码 Agent 的典型会话启动流程如下：

1. 运行 pwd 查看工作目录

2. 读取 git log 和进度文件，了解最近的工作

3. 读取 feature list 文件，选择最高优先级的未完成功能

4. 启动开发服务器，运行基础端到端测试

5. 确认基本功能正常后，开始新功能开发

关键发现：使用 JSON 格式追踪 feature 状态比 Markdown 更有效，因为 Agent 不太可能不恰当地修改或覆盖结构化数据。

3.4 支柱四：结构化执行（Structured Execution）
核心原则：将思考与执行分离。研究和规划在受控阶段进行，执行基于验证过的计划，验证通过自动化反馈（测试、Linter、CI）和人类审查完成。

所有团队都施加了刻意的执行序列：理解 → 规划 → 执行 → 验证。

OpenAI使用声明式 prompt 和反馈回路。轻量的计划用于小变更，复杂工作通过带有进度和决策日志的执行计划完成，并检入仓库。

Huntley将规划模式与构建模式分离。

Horthy的 Research-Plan-Implement 工作流围绕上下文管理精心设计。

人工检查点的价值：审查计划远比审查代码快。当规格正确时，实现自然可靠。当规格有误时，可以在 500 行代码生成之前及时纠正。

第五部分：Harness 的核心组件详解
5.1 AGENTS.md——Agent 的活文档
AGENTS.md 是一个新兴的开放约定——本质上是给 AI Agent 的 README。它是代码仓库根目录下的 Markdown 文件，编码 Agent 在每次会话开始时自动读取。

关键特性：

不是一次性编写后遗忘的静态文档

每当 Agent 犯错时都要更新——文档变成了反馈循环而非静态制品

简单的错误（Agent 运行了错误命令、找到了错误 API）通过更新 AGENTS.md 解决

复杂的问题需要构建工具层面的解决方案

OpenAI 的进阶实践：不是维护一个巨大的指令文件，而是构建了一个小型 AGENTS.md，指向更深层的事实源——设计文档、架构图、执行计划、质量评级——全部版本控制并维护在仓库中。一个后台 Agent 定期扫描过期文档并提交清理 PR：由 Agent 为 Agent 维护的文档。

5.2 架构约束与自动化执行
分层架构依赖方向强制执行（OpenAI 实践）：

Types → Config → Repo → Service → Runtime → UI

任何违反这一方向的代码都被自定义 Linter 自动检测和阻止。在人类优先的工作流中，这些规则可能感觉过于严苛；对 Agent 来说，它们是乘数效应：一旦编码，便处处适用。

Linter 错误消息即修复指令：

传统 Linter 错误消息仅标记违规。OpenAI 的自定义 Linter 在错误消息中直接包含修复方法——Agent 在遇到违规时同时获得了"教学"。

结构测试：

Martin Fowler 提到了 ArchUnit 等结构测试框架的潜力——它们可以验证代码库的架构约束是否被遵守，这对于 AI Agent 生成的代码尤其重要.

5.3 可观测性集成
OpenAI 团队将可观测性连接到 Agent 工作流：

浏览器自动化：通过 Puppeteer MCP 让 Agent 像人类用户一样进行端到端测试

Chrome DevTools 集成：Agent 能捕获 DOM 快照和截图

日志和指标查询：使性能目标（如"启动时间低于 800ms"）变得可度量

遥测驱动的 bug 修复：Agent 利用日志、指标和 Span 来自主重现 bug 和验证修复

5.4 熵管理与"垃圾回收"
Agent 生成的代码以不同于人类编写的方式积累"技术债"。OpenAI 的 Harness Engineering 报告称之为"熵"。

解决方案：定期运行的"垃圾回收" Agent：

扫描文档不一致

检测架构约束违规

清理冗余或低质量代码

确保清理吞吐量与代码生成吞吐量成比例

第六部分：工程师角色的转变
6.1 从写代码到设计环境
OpenAI 和 Anthropic 的实践都指向同一个结论：工程师的工作正在分成两块很不一样的东西：

第一部分：构建环境。当 Codex 卡住时，团队将其视为环境设计问题——诊断 Agent 缺少什么才能可靠地继续工作。焦点从实现转向赋能。

第二部分：管理工作。Greg Brockman 建议每个团队指定一名"Agent 队长"——负责思考 Agent 如何融入团队工作流。Peter Steinberger（OpenClaw 创作者）在一个月内完成了 6,600+ 次提交，同时运行 5-10 个 Agent。

这两部分不是顺序关系。你同时做两件事，每件事都影响另一件：Agent 的失败告诉你环境缺少什么；更好的环境让管理更顺畅。

6.2 规划是新的编码
越来越多的开发者强调与 AI 合作时前期规划的广度——如此之深，以至于大多数 AI 编码工具现在都包含专用的"更多规划"功能。

Cloudflare 的 Boris Tane 将此原则总结为一句话："永远不要让 Agent 在你审查和批准书面计划之前写代码。这种规划与执行的分离是我做的最重要的一件事。"

Anthropic 的做法更进一步：初始化 Agent 从高级 prompt 生成综合 feature 列表——单个 Web 应用超过 200 个独立功能，每个都有明确的测试步骤，全部初始标记为"failing"。

第十部分：业界共识与分歧全景
10.1 六大共识
共识 1：瓶颈在基础设施，不在模型智能。这是整个领域最核心的共识。Can.ac 实验中仅改变 Harness 的工具格式就让 Grok Code Fast 1 从 6.7% 跳到 68.3%，LangChain 同一模型靠 Harness 改进从第 30 名跳到第 5 名。Alex Lavaee 的总结最直接："Five independent teams. Same conclusion: the bottleneck is infrastructure, not intelligence." 六个以上独立来源支持这一判断，无反对意见。

共识 2：文档必须是活的反馈循环，不是静态制品。Hashimoto 的 Ghostty 项目 AGENTS.md 每一行都对应一个历史 Agent 失败案例。OpenAI 更进一步，让后台 Agent 定期扫描过期文档并提交清理 PR——Agent 为 Agent 维护文档。Anthropic 用 claude-progress.txt + git 日志做跨会话活文档。四个以上来源支持，无反对意见。

共识 3：思考与执行必须分离。OpenAI、Anthropic、Hashimoto、Horthy、Huntley、Boris Tane 全部独立发现了"先规划再执行"的模式。Boris Tane 的表述最简洁："永远不要让 Agent 在你审查和批准书面计划之前写代码。" Anthropic 把这个做到了极致——初始化 Agent 生成超过 200 个功能的结构化列表，全部初始标记为 failing。六个以上来源支持。

共识 4：上下文不是越多越好。Horthy 给出了量化经验——上下文填到约 40% 就开始走下坡路，之后进入 Dumb Zone。Carlini 花大量精力做"上下文窗口污染缓解"。OpenAI 从单个巨大 AGENTS.md 迁移到分层渐进式披露。Vasilopoulos 的 283 个开发会话学术验证也证实单文件指令集在规模化后会崩溃。四个以上来源支持。

共识 5：约束必须机械化执行，不能靠文档记录。OpenAI 原话："if it cannot be enforced mechanically, agents will deviate." Carlini 的项目后期 Claude 频繁破坏现有功能，解决方案是更严格的 CI——"a harness-level solution to a model-level problem"。Huntley 的 Backpressure 概念核心就是上下游的机械化约束。Martin Fowler 提到 ArchUnit 等结构测试框架的重要性。四个以上来源支持。

共识 6：工程师角色正在从"写代码"转向"设计环境 + 管理工作"。OpenAI、Charlie Guo、Hashimoto、Martin Fowler / Böckeler 都在强调这一转变。Chad Fowler 用 "Relocating Rigor" 描述这个现象——rigor 没有消失，只是从写代码转移到了设计约束系统。