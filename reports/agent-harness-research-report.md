# AI Agent 工程中的 Harness —— 调研报告

> 调研时间：2026-07-17  
> 调研工具：WebSearch + Context7 MCP（LangGraph、MCP、Pydantic AI 官方文档）+ Firecrawl（LangChain、Martin Fowler、Anthropic、OpenAI、Databricks、学术综述等一手来源）  
> 目标：搞清楚"AI Agent 工程里的 harness 是什么、为什么需要、核心组件、主流实践、设计原则"。

---

## 1. 一句话定义

**Harness = 把裸模型变成生产可用 Agent 的那整套"周边基础设施"。**

模型本身只会"接着说"（predict the next token）。一旦你要让它稳定地完成真实任务——调用工具、保持记忆、不胡来、可被观测、可与人协作——你就需要在那颗模型外面套上一层" harness "：它负责循环控制、上下文编排、安全护栏、状态持久、评测反馈，让模型从"会说话"变成"会干活"。

> 类比：引擎 vs 整车。模型是引擎，harness 是底盘、方向盘、刹车和人机交互——没有引擎车跑不动，没有 harness 引擎装不到车上。

---

## ★ 核心观点：Harness = Agent − Model

这是当前业界给 harness 下的**最锋利、最可操作的一个定义**——由 LangChain 在《The Anatomy of an Agent Harness》中提出，并被 Martin Fowler、Databricks、Dawiso、以及 2026 年的学术综述反复引用：

$$\boxed{\textbf{Agent} = \textbf{Model} + \textbf{Harness}} \quad\Longleftrightarrow\quad \textbf{Harness} = \textbf{Agent} - \textbf{Model}$$

> **"If you're not the model, you're the harness."**（不是模型的部分，就是 harness。）
> —— harness 就是"一个 agent 系统里，**除了模型本身之外的所有代码、配置和执行逻辑**"。

这个"减法定义"的价值不在于它精确，而在于它**逼着工程师换一个视角思考问题**：

1. **它把"智能"和"让智能变得有用"切开了。** 模型负责推理与决策（reasoning & decisions）；harness 负责把这份智能落地成真实动作——状态、工具执行、反馈回路、可执行的约束。模型是大脑，harness 是让大脑能动手的身体。

2. **它改变了"agent 不靠谱时该往哪使劲"的直觉。** 团队一遇到 agent 不稳定，第一反应往往是"换个更大的模型"。但 LangChain / Databricks / Dawiso 的共识是：**真正的修复几乎总在 harness 里**——更锋利的工具集、更紧的上下文、一条验证回路、一道在 agent 犯错前就拦住它的护栏。

3. **它解释了"为什么模型在趋同、竞争却在加剧"。** 当前沿模型的原始能力逐渐收敛，**harness 越来越成为决定系统表现的那一半**。Databricks 说得很直白：在工作流密集型任务上，**"强 harness + 中等模型"可以打败"弱 harness + 更强模型"**。智能正在接近商品化，脚手架（scaffolding）才是差异化的来源。

**一个把这句话砸实的数据点**：xAI 的 Grok Code Fast 1 模型，**仅仅改了编辑工具（edit-tool）的输出格式**，在 SWE-bench 上就从 **6.7% 飙到 68.3%**——模型权重一个字节没动，纯 harness 改动带来了十倍级的能力释放。OpenAI Codex 团队的复盘也印证了同一点：**"早期进展比预期慢，不是因为 Codex 不行，而是因为环境（environment）描述得不够充分。"**

> 换句话说：**Harness = Agent − Model 不只是一个定义，它是一个诊断工具。** 当你在评估、调试、或对比两个 agent 时，把"模型这一项"减掉，剩下的差距——就是 harness 工程的全部战场。

---

## 2. 为什么需要 Harness

裸模型 / 裸 chatbot 的局限：

| 裸模型的问题 | Harness 来解决 |
|---|---|
| 单次一问一答，没有多步循环 | 提供 **agent loop**（思考-行动-观察） |
| 记不住上一次干了什么 | 提供 **记忆系统**（短期/长期/情景/语义） |
| 不能操作真实世界 | 提供 **工具调用 + MCP** 接入外部系统 |
| 输出格式不可控 | 提供 **结构化输出 / 类型约束** |
| 幻觉、越狱、泄露 | 提供 **护栏（guardrails）** |
| 跑一半挂了就没了 | 提供 **持久化执行 + 人类审批（HITL）** |
| 不知道它干得好不好 | 提供 **评测（eval）+ 可观测性** |

业界共识（Anthropic "Building Effective Agents"）：**能用简单链路解决的事，别上来就用 agent**。但一旦任务需要模型"在运行时自己决定下一步"，harness 就是必需品。

---

## 3. Harness 的全景分层（核心组件）

从模型向外看，harness 通常由内到外分这些层：

```
┌──────────────────────────────────────────────────────┐
│  ⑦ 评测与可观测：LLM-as-Judge / 追踪 / 监控 / 成本    │
├──────────────────────────────────────────────────────┤
│  ⑥ 编排层：单 Agent / 多 Agent / Routing / Handoff    │
├──────────────────────────────────────────────────────┤
│  ⑤ 人类在环 HITL：审批 / 中断 / 回退                   │
├──────────────────────────────────────────────────────┤
│  ④ 护栏层：输入校验 / 工具沙箱 / 输出过滤 / PII        │
├──────────────────────────────────────────────────────┤
│  ③ 工具层：Function Calling / MCP / 沙箱执行          │
├──────────────────────────────────────────────────────┤
│  ② 记忆与上下文工程：工作记忆 / 情景记忆 / 语义记忆    │
├──────────────────────────────────────────────────────┤
│  ① 循环控制层：Think → Act → Observe                  │
├──────────────────────────────────────────────────────┤
│             ★ 模型（predict the next token）          │
└──────────────────────────────────────────────────────┘
```

下面逐层展开。

---

## 4. 核心层详解

### 4.1 循环控制层（Agent Loop）

Agent 最基本的"心跳"是 **Think → Act → Observe → 重复**，也被称为 ReAct（Reasoning + Acting）。

- **Think**：模型读上下文，决定下一步做什么。
- **Act**：模型输出一个结构化动作（通常是 tool_use / function_call）。
- **Observe**：harness 执行该动作并把结果塞回上下文。
- **Repeat**：直到任务完成、超过步数上限、或触发终止条件。

> 这层的关键不是"让模型想"——而是**循环本身由 harness 控制**。模型只输出动作，真正"跑循环"的是 harness。

实现参考：LangGraph 把循环建模成**图上的边**（节点=动作，边=转移条件），天然支持条件跳转、并行、循环。

### 4.2 记忆与上下文工程（Context Engineering）

2025 年的主流共识是：**Context Engineering 比 Prompt Engineering 更重要**——因为提示词是静态的，而上下文是动态的，你需要决定"每一步给模型看什么"。

四层记忆架构：

| 记忆类型 | 作用 | 实现 |
|---|---|---|
| **工作记忆** Working | 当前任务的上下文窗口 | 上下文窗口本身，配合滑动窗口 / 摘要压缩 |
| **情景记忆** Episcopic | 过去发生的事 | 向量数据库 + 检索（RAG） |
| **语义记忆** Semantic | 已学到的知识与事实 | 知识图谱 / 嵌入 / 稳定提示 |
| **程序记忆** Procedural | 已习得的行为模式 | 微调模式 / 提示库 / 工具使用经验 |

关键实践：**动态上下文选择**——不是塞满窗口，而是在每一步"只把此刻最相关的信息取出来"。

### 4.3 工具层 & MCP

让模型能"动手"。三层：

1. **工具定义**：用 JSON Schema / Function Calling / `@tool` 描述工具的名字、参数、用途。
2. **工具执行**：harness 拿到模型的 tool_use 调用真实 API/数据库/代码沙箱，并把结果 observe 回去。
3. **MCP（Model Context Protocol）**：Anthropic 推出的**开放标准**，把"模型能不能接外部系统"这件事从"每个模型各写一套"变成统一协议。

MCP 架构（来源：modelcontextprotocol.io 官方文档）：
- **Host**（AI 应用）里跑若干 **Client**。
- 每个 Client 与一个 **Server** 建立专属连接。
- Server 暴露三种能力：**Tools**（被动等调用的函数）、**Resources**（只读数据）、**Prompts**（预设指令模板）。
- 通信基于 **JSON-RPC 2.0**，通过能力协商（capability negotiation）决定双方支持什么。

> MCP 的意义：让 harness 的工具层**标准化、可组合、可插拔**——一个工具服务写一次，所有支持 MCP 的 agent 都能用。

### 4.4 护栏（Guardrails）

护栏要贯穿整条管道，而不仅是最后一道过滤：

- **输入护栏**：PII 检测、越狱拦截、意图分类。
- **工具调用护栏**：沙箱化执行、参数校验、权限白名单（Pydantic AI 的 `before_tool_execute` 审批钩子是这类设计）。
- **输出护栏**：格式校验（结构化输出 / JSON Mode / Pydantic Model）、事实性接地（grounding）、内容审核。
- **上下文护栏**：防止记忆跨会话泄露敏感数据。

### 4.5 人类在环（Human-in-the-Loop, HITL）

生产 agent 不是全自动的：
- **中断（interrupt）**：模型要做危险动作前暂停，等人确认。
- **审批流**：LangGraph 的 `interrupt` / HumanInterrupt；Pydantic AI 的 `before_tool_execute` 钩子。
- **回退 / 纠正**：人可以接管、改方向、补充信息。

### 4.6 编排层：从单 Agent 到多 Agent

Anthropic "Building Effective Agents" 列出的核心模式：

| 模式 | 说明 |
|---|---|
| **Prompt Chaining** | 链式调用，上一步输出是下一步输入 |
| **Routing** | 分类后分发给专门处理器 |
| **Parallelization** | 多路并行，再汇总 |
| **Orchestrator-Workers** | 中央编排者派发子任务给 worker |
| **Evaluator-Optimizer** | 生成者 + 评审者迭代优化 |

多 Agent 框架：
- **LangGraph Supervisor**：中心 supervisor 通过工具通信协调专职 agent。
- **Pydantic AI Handoff**：通过 `output_type=[handOffToX, Failure]` 把控制交给另一个 agent。
- **Claude Agent SDK**：原生子 agent 派生（sub-agent）。
- **Anthropic 多 Agent 研究系统**：Lead Researcher 并行派生子 agent 探索不同侧面。

### 4.7 持久化与 Durable Execution

长任务中途挂了不能从头来：
- **状态 checkpoint**：每一步把状态持久化（LangGraph 的 persistence + MemorySaver）。
- **可恢复执行**：从最后一个 checkpoint 继续。
- **时间旅行（time travel）**：回退到某一步重新走。

### 4.8 评测（Eval）与可观测性

- **Eval 维度**：任务完成率、安全合规、上下文效率、记忆准确率、延迟与成本。
- **LLM-as-Judge**：用另一个模型给当前 agent 打分。
- **轨迹分析（Trajectory）**：不只看结果，看整条推理-动作链。
- **可观测性工具**：LangSmith、Phoenix Arize、结构化 tracing。

---

## 5. 主流 Harness 实现对比

| 框架 | 定位 | Harness 特点 |
|---|---|---|
| **LangGraph** | 底层编排运行时 | 图 = 循环；持久化、HITL、memory、time-travel；与 LangSmith 集成 |
| **Pydantic AI** | FastAI 风格生产级 harness | 类型安全输出、依赖注入 RunContext、Capability 延迟加载、`ModelRetry` 自纠、Handoff |
| **Claude Agent SDK** | Anthropic 原生 agent SDK | 内置文件/Bash/Web 工具、子 agent、多轮 tool_use、MCP 集成 |
| **LlamaIndex / CrewAI / AutoGen** | 应用层框架 | 更上层封装，自带 RAG、多角色、任务分配 |

选型原则（来自 Anthropic 官方）：**从最简单的开始**——先试试单次 LLM、再试 prompt chaining、再试 routing，最后才上完整 agent。用 agent，是因为你"在运行时没法预知所有步骤"。

---

## 6. 设计原则（Takeaway）

1. **Harness 的价值 = 把"会说话"变成"会干活"**。
2. **循环控制权在 harness，不在模型**——模型只出动作，harness 负责跑、查、判、停。
3. **Context Engineering > Prompt Engineering**——动态地、按步骤地给模型看它此刻需要的信息。
4. **工具接入标准化（MCP）**——一次定义，随处接入。
5. **护栏要铺满整条管道**，不是只在入口/出口。
6. **人要在环**——危险动作要审批，错误方向要可纠正。
7. **可评测、可观测**——没 eval 等于没上线；没 tracing 等于盲飞。
8. **从简开始，按需加复杂度**——agent 不是银弹，能链式解决的事别上 agent。

---

## 7. 补充调研（firecrawl 一手来源，2026-07）

用 Firecrawl 抓取了 LangChain、Martin Fowler、Anthropic、OpenAI、Databricks 以及学术综述的一手内容，补齐前面几节没覆盖到的四块：**（A）harness 的"减法定义"与推导逻辑、（B）"Harness Turn"这个行业拐点、（C）从模型视角"倒推"harness 组件的方法论、（D）用户侧的"外层 harness"实践。**

### 7.1 "Harness Turn"——2024 起的行业拐点

学术综述《Agent Harness for LLM Agents: A Survey》(preprints.org, 2026) 提出一个关键判断：**2024 年前后，行业发生了一次"harness 转向"（the Harness Turn）**。

- 早期（2022–2023）大家在拼模型、拼 prompt；到 2024，积累的部署经验让大家认识到：**制约 agent 可靠性的瓶颈不是模型质量，而是基础设施质量（infrastructure quality）**。
- 综述把 harness 从"一堆孤立模块"正式抬升为**一个完整的研究对象**，并把它的核心问题命名为 **"harness-as-infrastructure problem"**——harness 不是被动的执行管道，而是 agent 能力的**共同决定者（co-determinant）**。
- 演化谱系：harness 这个词从**软件测试脚手架** → **强化学习环境（RL environments）** → **LLM agent 框架** 三条线在 2023–2024 汇流，标志是 MCP 协议标准化 + 第一代评测基础设施的同时出现。
- 术语链的演进：**Prompt Engineering（问什么）→ Context Engineering（该让模型看到什么，2025）→ Harness Engineering（整套周边基础设施，2026 OpenAI 正式命名）**。

### 7.2 从"模型视角"倒推 harness 组件（LangChain 的方法论）

LangChain 的《Anatomy of an Agent Harness》给了一个非常好用的推导范式：**不是先列组件，而是"想要什么 agent 行为 → 反推 harness 该提供什么"**（Behavior we want → Harness design）。据此推出的现代 harness 核心原语：

| 想要的行为 | Harness 提供的原语 | 要点 |
|---|---|---|
| 持久存储、卸载超窗信息、跨会话保留成果 | **文件系统抽象 + fs 工具** | 模型只能操作上下文窗口内的东西；文件系统是 memory / 状态 / 卸载的共同底座 |
| 不用人预先设计每个工具就能自主解题 | **Bash + 代码执行工具** | "给模型一台电脑"，让它自己写代码造工具，而非被固定工具集限制 |
| 能执行并**自我验证**工作 | **沙箱 + 预装运行时/测试器/浏览器** | 浏览器、日志、截图、test runner → 让 agent 形成自验证回路 |
| 持续学习、跨会话积累知识 | **记忆文件标准（如 AGENTS.md）+ Web/MCP 检索** | 无法改权重，"加知识"只能靠上下文注入；越过知识截止靠 Web Search / Context7 类 MCP |
| 对抗 **Context Rot（上下文腐烂）** | **Compaction / 工具输出卸载 / Skills 渐进式披露** | 上下文越满推理越差；harness 本质上是"好上下文工程的交付机制" |
| 长程自主执行（跨多个上下文窗口） | **Ralph Loop / 规划文件 / 自验证钩子** | Ralph Loop：拦截模型的退出，在干净上下文里重注入原始目标，逼它继续干 |

> 一句话金句：**"Harnesses today are largely delivery mechanisms for good context engineering."**（今天的 harness，本质上就是好上下文工程的交付载体。）

**关于 harness 的未来**：LangChain 认为随着模型变强，今天 harness 里的一部分（规划、自验证、长程连贯）会被"吸收进模型"，所以 harness 理应随时间变得没那么重要；但——正如 prompt engineering 至今仍有价值——**harness engineering 也会长期有用**，因为它不只是"给模型打补丁"，更是"围绕模型智能去设计系统"。（同时观察到一个副作用：**模型训练与 harness 设计正在耦合**——改个工具逻辑就可能让模型表现变差，这是"harness 在训练回路里"造成的过拟合。）

### 7.3 用户侧的"外层 harness"（Martin Fowler）

Martin Fowler《Harness engineering for coding agent users》把 harness 分成**内层（厂商内置：系统提示、检索机制、编排系统）**和**外层（用户为自己的场景搭建）**：

- **外层 harness 的两个目标**：① 提高 agent"一次就做对"的概率；② 提供一条**在问题到达人类之前就自我纠正**的反馈回路——最终减少 review 负担、提升质量、少烧 token。
- 三类"调节器（regulation）"harness：**可维护性 harness**、**架构适应度 harness（architecture fitness）**、**行为 harness（behaviour）**——分别用规则、结构测试、静态分析等把质量"左移（keep quality left）"。
- **Steering Loop（操舵回路）**：可以用 AI 反过来改进 harness——让 agent 帮你写结构测试、从观察到的模式生成规则草稿、搭定制 linter。
- 开放问题（也是 harness 工程的前沿）：**harness 长大后如何保持自洽**？如何评估**harness 覆盖率与质量**（类似代码覆盖率 / 变异测试之于测试）？"外层 harness 正在成为一项持续的工程实践，而非一次性配置。"

### 7.4 长程 agent 的 harness 实践（Anthropic）

Anthropic《Effective harnesses for long-running agents》给了一个可落地的样板——核心难题是**每个新会话都从"零记忆"开始**（像轮班的工程师，接班时完全不知道上一班干了啥）。仅靠 compaction 不够。它的两段式方案：

- **Initializer agent（初始化 agent）**：第一个会话专门搭环境——写 `init.sh`、建 `claude-progress.txt` 进度日志、做初始 git commit。
- **Coding agent（编码 agent）**：之后每个会话**只做一个功能**、并在结束时把环境留在"可合并主干"的干净状态（无重大 bug、代码有序、有文档、有 git commit + 进度摘要）。
- **关键洞察**：让新会话能靠 `progress 文件 + git history` 快速"读懂当前进度"；用 feature list 文件防止"提前把功能标记为完成"（必须自验证通过才算 passing）。灵感直接来自"优秀软件工程师每天怎么干活"。

### 7.5 一句话把这几家的观点串起来

| 来源 | 对 harness 的定位 | 金句 / 数据 |
|---|---|---|
| **LangChain** | Agent = Model + Harness | "不是模型的部分，就是 harness" |
| **Databricks / Dawiso** | 模型趋同后，harness 决定表现 | 强 harness + 中模型 > 弱 harness + 强模型 |
| **学术综述** | harness-as-infrastructure，能力的共同决定者 | Grok Code Fast 1：改工具格式 6.7%→68.3% |
| **OpenAI Codex** | harness 才是"绑定约束" | "慢不是因为模型不行，而是环境没描述清楚" |
| **Anthropic** | harness = 让模型跨会话连续工作的机制 | initializer + 增量 coding + 进度文件 |
| **Martin Fowler** | 用户可搭"外层 harness"把质量左移 | steering loop：用 AI 改进 harness 本身 |

---

## 8. 信息来源

**Harness 定义与"减法框架"（Agent = Model + Harness）**
- LangChain, *The Anatomy of an Agent Harness* — https://www.langchain.com/blog/the-anatomy-of-an-agent-harness
- Martin Fowler, *Harness engineering for coding agent users* — https://martinfowler.com/articles/harness-engineering.html
- Dawiso, *What Is an Agent Harness?*（含 Databricks 观点转述）— https://www.dawiso.com/glossary/agent-harness
- *Agent Harness for LLM Agents: A Survey*（学术综述，含"Harness Turn"与 Grok/Codex 数据）— https://www.preprints.org/manuscript/202604.0428

**Harness 工程实践（长程 / Codex / 控制面）**
- Anthropic, *Effective harnesses for long-running agents* — https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- OpenAI, *Harness engineering: leveraging Codex in an agent-first way* — https://openai.com/index/harness-engineering/
- Adnan Masood, *Agent Harness Engineering — The Rise of the AI Control Plane* — https://medium.com/@adnanmasood/agent-harness-engineering-the-rise-of-the-ai-control-plane-938ead884b1d

**框架与协议（前序调研）**
- Anthropic, *Building Effective Agents* — https://www.anthropic.com/research/building-effective-agents
- Anthropic, *Claude Agent SDK* — https://docs.anthropic.com/en/docs/agents-and-tools/claude-code-sdk
- Anthropic, *Tool Use* — https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- Model Context Protocol, *Architecture / Specification* — https://modelcontextprotocol.io/docs/learn/architecture
- LangGraph, *README / Prebuilt* — https://github.com/langchain-ai/langgraph
- Pydantic AI, *Docs (index / output / capabilities)* — https://github.com/pydantic/pydantic-ai
- LangGraph Supervisor — https://github.com/langchain-ai/langgraph-supervisor-py
