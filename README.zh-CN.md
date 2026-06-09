# OneCompany

> 将一句话需求变为可运行、可部署的 Web 应用。

OneCompany 是一个**本地优先的 AI 多智能体协作开发平台**。它编排完整的软件生命周期——从需求采集、架构设计、代码实现、测试验证到交付部署——全程由专业 AI Agent 驱动，并在每一个关键决策点保留人工审批。

## 它能做什么

给 OneCompany 一句话，比如 *"用 TypeScript 写一个带 vitest 测试的 CLI 待办应用"*，它会：

1. **分析与澄清** — AI Agent 分析你的需求，对完整度评分，提出聚焦问题填补空白。
2. **生成 PRD** — 产出结构化的产品需求文档和验收标准。
3. **规划架构** — 设计技术方案，包含技术栈推荐、数据模型和 TDD 策略。
4. **TDD 实现** — 将工作拆分为可测试的函数切片；每个切片先写失败测试，再写实现。
5. **测试与验证** — 运行权威测试套件，验证本地预览，实时呈现结果。
6. **交付** — 生成完整的交付包：源代码、Dockerfile、测试脚本、运行说明和交付报告。

**每一步都受治理。** 高风险操作需要人工确认。没有任何操作能绕过风险分级、沙箱策略或审计日志。

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                           │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐ │
│  │   左面板                  │  │   右面板 (五个标签页)             │ │
│  │   ┌──── 流式模式 ─────┐  │  │   文件 │ 预览 │ 终端             │ │
│  │   │  用户消息          │  │  │   测试 │ 报告                 │ │
│  │   │  Agent 事件        │  │  └──────────────────────────────────┘ │
│  │   │  内嵌 Gate 卡片    │  │                                       │
│  │   │  粘性输入框        │  │            顶部导航栏                  │
│  │   └───────────────────┘  │   项目切换器 │ 状态 │ 运行/暂停       │
│  │   ┌─── 泳道模式 ──────┐  │   头像 ▸ 设置                        │
│  │   │  Agent × 计划/执行 │  │   切换器 ▸ 项目中心                   │
│  │   │      /观察/反思    │  │                                       │
│  │   └───────────────────┘  │                                       │
│  └──────────────────────────┘                                       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ SSE / REST API
┌─────────────────────────────▼───────────────────────────────────────┐
│                        apps/api (Hono)                               │
│  项目管理 │ 门控 │ 需求 │ 开发 │ 测试 │ 工作空间                     │
└───────┬──────────┬──────────┬──────────────┬─────────────┬──────────┘
        │          │          │              │             │
┌───────▼───┐ ┌────▼────┐ ┌──▼───────────┐ │  ┌──────────▼──────────┐
│ shared    │ │workflow │ │ agent-core   │ │  │ workspace           │
│ Zod schema│ │需求引擎 │ │Agent 注册表  │ │  │Git、Shell、沙箱     │
│ DB schema │ │开发引擎 │ │模型路由      │ │  │风险分级             │
│ 状态机    │ │测试引擎 │ │OpenCode      │ │  │授权治理             │
│ 事件系统  │ │控制台   │ │  Harness     │ │  │测试运行器           │
│ Gate 策略 │ │快照     │ │执行器        │ │  │预览服务             │
│ 密钥脱敏  │ │         │ │事件/权限桥   │ │  │开发脚手架           │
└───────────┘ └─────────┘ └──────┬───────┘ │  │日志管线             │
                                │          │  └─────────────────────┘
                    ┌───────────▼──────────▼──┐
                    │  @opencode-ai/sdk       │
                    │  HTTP Server + Client    │
                    └───────────┬─────────────┘
                                │ 127.0.0.1:41xx (本地回环)
                    ┌───────────▼─────────────┐
                    │  OpenCode 引擎           │
                    │  (AI 编码智能体)         │
                    └─────────────────────────┘
```

## 项目生命周期

OneCompany 通过一个 9 阶段状态机驱动每个项目：

```
需求草稿 (Draft Requirement)
  ↓
提问中 (Asking Questions)  ←──── 带预算和卡住检测的循环
  ↓
PRD 就绪 (PRD Ready)
  ↓
技术计划评审 (Tech Plan Review)  ←──── 拒绝则重新规划
  ↓
开发中 (Developing)  ←────────── 切片 TDD 循环，带重试预算
  ↓
测试中 (Testing)  ←────────────── 失败则返回开发中
  ↓
部署中 (Deploying)  (可选)
  ↓
待验收 (Awaiting Acceptance)
  ↓
已交付 (Delivered) ✓
```

跨切状态：**已暂停 (Paused)** — 从任何活跃状态可暂停，恢复时精确回到中断点；**已失败 (Failed)** — 终态，来自不可恢复错误或人工决策。

## Golden Path：端到端流程

本节追踪一个项目从一句话到交付应用的完整过程，展示每个阶段如何衔接。

### 流程总览

```
用户: "用 TypeScript 写一个带 vitest 测试的 CLI 待办应用"
  │
  ▼
① 创建项目 ──→ 需求草稿 (Draft Requirement)
  │
  ▼
② 需求分析循环 ──→ 提问中 (Asking Questions)
  │   接收 → 分析师 → 评分 → 问题规划 → 用户回答 → 评分 → ...
  │   （循环直到分数 ≥ 85 或预算耗尽）
  │
  ▼
③ PRD 生成 ──→ PRD 就绪 (PRD Ready)        ← 写入数据库 (prd_versions + acceptance_criteria_versions)
  │
  ▼
④ 用户: POST /development/start
  │
  ▼
⑤ 架构师 Agent ──→ 技术计划评审 (Tech Plan Review)  ← Gate: tech_plan_confirm
  │                                                    用户点击 "approve"
  ▼
⑥ 规划 Agent ──→ 开发中 (Developing)
  │   ┌─ 切片 1: OpenCode TDD → 权威测试 → 提交
  │   ├─ 切片 2: OpenCode TDD → 权威测试 → 提交
  │   └─ 切片 N: ...
  │
  ▼
⑦ 全部切片完成 ──→ 测试中 (Testing)
  │
  ▼
⑧ 全套测试通过 ──→ 部署 → 待验收 → 已交付 ✓
```

### 第一阶段：需求分析

**步骤 1 — 创建项目。**
`POST /projects` 创建一个状态为 `Draft Requirement` 的项目。

**步骤 2 — 启动需求分析。**
`POST /projects/:id/requirement/start` 附带一句话需求，依次触发 3 个 Agent：

| 序号 | Agent | 输出 |
|------|-------|------|
| 1 | **接收 Agent (Intake)** | `normalizedSummary`、`targetUsers`、`userGoals` |
| 2 | **分析师 Agent (Analyst)** | `coreFeatures`、`pagesAndFlows`、`dataObjects`、`rolesAndPermissions` |
| 3 | **评分 Agent (Scorer)** | `completenessScore` (0–100)、`gaps[]` |

**步骤 3 — 决策循环** (`decideAndContinue`)：

```
分数 ≥ 85 且无关键缺口？
  ├─ 是 → 运行 PRD 与验收 Agent → 写入数据库 → 状态 = "PRD Ready"
  ├─ 否，还有预算 → 问题规划 Agent → 等待用户回答 → 重新评分 → 循环
  └─ 否，预算耗尽或卡住（连续 2 轮提升 < 3 分）→ 创建"需求卡住" Gate
       ├─ "继续回答" → 扩展预算，继续循环
       ├─ "强制继续" → 在阈值以下生成 PRD（记录为风险）→ "PRD Ready"
       └─ "失败" → 状态 = "Failed"
```

**步骤 4 — 生成 PRD。**
PRD 与验收 Agent 产出 Markdown 格式的 PRD 和验收标准。它们被**持久化**到 `prd_versions` 和 `acceptance_criteria_versions` 表——这是通往下一阶段的桥梁。

### 第二阶段：开发

**步骤 5 — 启动开发。**
`POST /projects/:id/development/start` 启动开发流程：

```typescript
// 来自 development/engine.ts
const prd = loadLatestPrd(deps.db, projectId);           // ← 从 prd_versions 表读取
const acceptance = loadLatestAcceptance(deps.db, projectId); // ← 从 acceptance_criteria_versions 表读取

payload = await runArchitect(deps, payload, { prd: prd.content, acceptance: acceptance.content });
payload = raiseTechPlanGate(deps, payload);  // → 创建 tech_plan_confirm Gate，阻塞
```

**架构师 Agent** 接收需求阶段的 PRD 和验收标准，产出技术方案（技术栈、架构、数据模型、TDD 策略）。`tech_plan_confirm` Gate 阻塞直到用户批准。

**步骤 6 — 用户批准技术计划。**
`POST /gates/:id/resolve` 附带 `decision: "approve"` 触发：

```typescript
// 规划 Agent 将 PRD 拆分为函数切片
let next = await runPlanner(deps, payload);
deps.setStatus(projectId, "Developing", "tech_plan_approved");
return runSliceLoopUntilHalt(deps, next);
```

**步骤 7 — 切片 TDD 循环。**
每个函数切片的流程：

```
① OpenCode Harness.runSlice()     ← AI 通过 OpenCode 写代码 + 跑测试
② runAuthoritativeCheck()         ← OneCompany 独立运行 vitest --reporter=json
③ 通过？→ git 提交 + 评审 Agent → 下一个切片
④ 失败？→ 重试（预算：4 次机会）→ 预算耗尽 → 切片失败 Gate
     ├─ "retry" → 扩展预算，重试切片
     ├─ "replan" → 返回技术计划评审
     ├─ "request_skip_slice" → 变更评审（必须更新 PRD/验收标准）
     └─ "fail" → 状态 = "Failed"
```

**步骤 8 — 全部切片完成。**
状态转换到 `Testing`，运行完整验收测试套件。

### 两个阶段如何衔接

```
需求阶段                                  开发阶段
───────                                  ───────
RequirementState                         DevState
    │                                        │
    │ savePrdAndAcceptance()                 │ loadLatestPrd()
    ▼                                        ▲
┌──────────────────┐                   ┌──────────────────┐
│ prd_versions     │  ←── 数据库 ───→ │ 读取 PRD 内容     │
│ acceptance_      │   （共享状态）    │ 读取验收标准       │
│ criteria_versions│                   └──────────────────┘
└──────────────────┘                         │
    │                                        │
    │ setStatus("PRD Ready")                 │ 守卫: status !== "PRD Ready" → 抛异常
    ▼                                        │
┌──────────────────┐                         │
│ projects.status  │  ←── 状态机 ──────────→│
└──────────────────┘                         │
```

三个衔接机制：

1. **数据库** — 需求阶段将 PRD + 验收标准写入 `prd_versions` 和 `acceptance_criteria_versions`；开发阶段从同一张表读取。这是**数据传递**通道。

2. **状态机** — 项目状态必须为 `PRD Ready` 才能调用 `startDevelopment()`。状态机强制执行合法转换，拒绝非法转换。这是**时序守卫**。

3. **人工门控 (Gate)** — 需求确认和技术计划确认 Gate 位于两个阶段之间。用户必须显式批准工作流才能推进。这是**人工审批**检查点。

### API 调用序列

```
# 1. 创建项目
POST /projects                          → { id: "abc", status: "Draft Requirement" }

# 2. 启动需求分析
POST /projects/abc/requirement/start    → { phase: "awaiting_answers", questions: [...], status: "Asking Questions" }

# 3. 提交回答（按需重复）
POST /projects/abc/requirement/answers  → { phase: "awaiting_answers", questions: [...], status: "Asking Questions" }
POST /projects/abc/requirement/answers  → { phase: "completed", status: "PRD Ready" }

# 4. 启动开发
POST /projects/abc/development/start    → { phase: "awaiting_gate", gateType: "tech_plan_confirm", gateId: "gate-1" }

# 5. 批准技术计划
POST /gates/gate-1/resolve              → { status: "resolved", decision: "approve" }
  （触发 Planner → 切片循环 → 返回开发状态）

# 6. 查看开发进度
GET /projects/abc/development/status    → { phase: "slicing", state: { taskQueue: [...] } }

# 7. 解决切片失败 Gate（如需要）
POST /gates/gate-2/resolve              → { decision: "retry" | "replan" | "request_skip_slice" | "fail" }
```

## 智能体系统

### 需求组 Agent

| Agent | 职责 |
|-------|------|
| 接收 Agent (Intake) | 规范化用户原始输入，识别应用类型和缺失上下文 |
| 需求分析师 Agent (Analyst) | 提取功能需求、角色、页面流程、数据对象、集成和约束 |
| 完整度评分 Agent (Scorer) | 0–100 分评分，识别关键缺口 |
| 问题规划 Agent (Planner) | 生成聚焦问题轮次（每轮 ≤10 个问题） |
| PRD 与验收 Agent | 产出 PRD、验收标准、假设和风险 |

### 开发组 Agent

| Agent | 职责 |
|-------|------|
| 架构师 Agent (Architect) | 制定技术方案、架构、技术栈、数据模型 |
| 测试设计 Agent (Test Designer) | 将验收标准转化为测试用例 |
| 规划 Agent (Planner) | 将工作拆分为函数切片 |
| 编码 Agent (Coding) | 通过 OpenCode 在受治理的 TDD 循环中实现代码 |
| 评审 Agent (Review) | 审查 diff、架构一致性、安全风险 |
| QA Agent | 运行测试、检查日志、验证浏览器行为 |
| DevOps 与交付 Agent | 产出 Dockerfile、运行说明、交付报告 |

### 编排边界

OneCompany 在宏观和微观编排之间执行严格分离：

- **宏观工作流**（LangGraph）：项目阶段、循环预算、状态转换、人工门控、重试策略。这些逻辑**永远不放在** Agent 内部。
- **微观执行**（OpenCode / OpenAI Agents SDK）：单 Agent 的 ReAct 推理、工具调用、代码生成。Agent 只报告结果；**LangGraph 决定转换**。

## 治理与安全

### 风险分级

每一个 shell/edit 操作在执行前都要经过分类：

| 风险等级 | 示例 | 处理方式 |
|---------|------|---------|
| **低** | `ls`、`cat`、`npm test`、`git status` | 本地执行，记录日志 |
| **中** | 文件生成、数据库初始化、启动服务 | 本地执行，记录日志 |
| **中（受限）** | 带 lockfile 的 `npm ci --ignore-scripts` | 本地执行，限制网络 |
| **高** | `rm -rf`、未知脚本、任意 `npm install` | 人工确认 + Docker 沙箱 |
| **高（部署）** | 部署、隧道、生产环境变更 | 人工确认，真实网络 |

### OpenCode 权限桥

OpenCode 被配置为**每次 shell/edit 操作前都必须请求许可**（`edit: "ask"`, `bash: "ask"`）。每个请求经过：

```
OpenCode 权限请求 (permission.asked)
  → 权限桥 → 操作分类 → 风险分级
    → 低/中风险 → 自动批准 → 回复 "once"
    → 高风险 → 创建 Gate → 等待人工决策
      → 批准 → 回复 "once"
      → 拒绝 → 回复 "reject"
```

**没有任何操作能绕过治理。** 系统从不使用 `"always"` 自动批准。

### 权威测试

OpenCode 自报的测试结果仅供参考。**OneCompany 在每个切片边界运行自己的权威测试**，使用 `vitest --reporter=json` 解析结果，这些结果才驱动状态转换和测试面板显示。

### 密钥脱敏

所有命令输出、工具结果和日志在持久化或展示前都经过自动密钥检测与脱敏。大输出被分块存储为工件文件；数据库仅保存元数据和哈希值。

## 人工门控 (Human Gates)

8 种 Gate 类型确保人工在关键节点拥有控制权：

| Gate 类型 | 触发时机 |
|----------|---------|
| 需求确认 | 开发启动前 |
| 技术计划确认 | 编码开始前 |
| 需求卡住 | 问题轮次预算耗尽或循环卡住 |
| 切片失败 | 函数切片重试预算耗尽 |
| 变更评审 | 用户在开发中途修改需求 |
| 部署确认 | 暴露 URL 前 |
| 危险操作 | 高风险命令或文件操作 |
| 最终验收 | 标记"已交付"前 |

每种 Gate 强制执行操作策略——例如"跳过风险继续"仅对低/中风险操作 Gate 可用，部署确认和最终验收 Gate 不提供此选项。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js、React、Tailwind CSS、shadcn/ui |
| 后端 API | Hono (TypeScript) |
| Agent 编排 | LangGraph.js |
| Agent 执行 | OpenAI Agents SDK TypeScript |
| 编码引擎 | [opencode](https://opencode.ai) via `@opencode-ai/sdk` |
| 数据库 | SQLite + Drizzle ORM |
| 测试 | Vitest、Playwright |
| 工作空间 | 本地工作区 + Docker 沙箱 |
| 部署 | 本地预览 + Cloudflare Tunnel |

## 目录结构

```
apps/
  web/              Next.js 控制台 (Stream/Swimlane + 五标签页右面板)
  api/              Hono REST API + SSE 端点
packages/
  shared/           Zod schema、数据库 schema、状态机、事件系统、Gate 策略、密钥脱敏
  agent-core/       Agent 注册表、执行器、模型路由、OpenCode Harness
  workflow/         需求/开发/测试工作流引擎
  workspace/        项目工作空间、Git、Shell、沙箱、风险分级、测试运行器
  ui/               共享 UI 组件
data/
  app.sqlite        本地 SQLite 数据库
generated-projects/  每个项目的代码仓库 + 工件 + 日志
handbook/           里程碑实现手册
```

## 快速开始

### 前置条件

- Node.js 22+
- pnpm 9+
- Git
- Docker（可选，用于高风险沙箱）

### 安装

```bash
pnpm install
```

### 数据库初始化

```bash
pnpm migrate
```

### 开发模式

```bash
pnpm dev
```

API 服务启动于 `http://localhost:3001`，Web 控制台启动于 `http://localhost:3000`。

### 测试

```bash
pnpm test
```

### 引擎模式

OneCompany 支持两种引擎模式：

| 模式 | 条件 | 行为 |
|------|------|------|
| **真实引擎** | 默认（需 API Key + OpenCode CLI） | 完整 OpenCode Harness、受治理授权、真实测试运行器、LLM Agent |
| **Stub 模式** | `OC_USE_STUB_ENGINE=1` | Stub Harness、自动批准、始终通过、脚本化 Agent |

集成测试通过 `OC_OPENCODE_INTEGRATION=1` 运行真实引擎。每周 `opencode-integration` GitHub workflow 会跑完整 golden path 至 `Delivered`（见 `handbook/acceptance/evidence/golden-path-run.md`）。

### 环境变量

关键配置（完整列表见 [.env.example](.env.example)）：

| 变量 | 用途 |
|------|------|
| `OPENAI_API_KEY` | 工作流 Agent 的 LLM 提供商密钥 |
| `OC_LLM_API_KEY` / `OC_LLM_BASE_URL` | 替代 OpenAI 兼容端点 |
| `ZHIPU_API_KEY` | 智谱/GLM 模型密钥（OpenCode 使用） |
| `OC_USE_STUB_ENGINE` | 设为 `1` 启用 Stub 模式 |
| `OC_OPENCODE_INTEGRATION` | 设为 `1` 运行集成测试 |
| `OC_OPENCODE_MODEL_CHEAP` | 便宜层级模型引用（如 `zhipuai-coding-plan/glm-5.1`） |
| `OC_OPENCODE_MODEL_STANDARD` | 标准层级模型引用 |
| `OC_OPENCODE_MODEL_STRONG` | 强力层级模型引用 |

## 开发里程碑

| ID | 里程碑 | 状态 |
|----|--------|------|
| M0 | 基础设施与仓库搭建 | ✅ 已完成 |
| M1 | 事件日志 + SSE + 状态机 + Gate 基础 | ✅ 已完成 |
| M2 | Agent 注册表 + 编排骨架 | ✅ 已完成 |
| M3 | 需求工作流 | ✅ 已完成 |
| M4 | 人工 Gate UI + Gate 策略 | ✅ 已完成 |
| M5 | 工作空间、Git、Shell、沙箱 | ✅ 已完成 |
| M6 | 开发工作流（TDD 循环、OpenCode） | ✅ 已完成 |
| M7 | 测试与 QA 集成 + 本地预览 | ✅ 已完成 |
| M8 | 右面板标签页 | ✅ 已完成 |
| M9 | 信息流 + 泳道渲染器 | ✅ 已完成 |
| **M9.5** | **真实引擎集成与去 Stub 化** | **✅ 已完成** |
| **M10** | **部署、交付、变更请求** | **✅ 已完成** |
| **M11** | **加固与 MVP 验收** | **✅ 已完成** |
| M12 | 集成网关 + 离线 Skill Packs | ✅ 完成（[计划](handbook/m12-implementation-plan.md)） |

### M9.5：真实引擎集成（当前里程碑）

M2–M9 阶段使用脚本化 fixture 和 stub 边界完成结构与 UI 的搭建。M9.5 的核心是将这些 seam 替换为真实组件：

| 去掉的 Stub | 替换为 |
|------------|--------|
| `StubHarness` | `OpencodeHarness`（真实 OpenCode SDK 桥接） |
| `authorize: () => ({ allow: true })` | `createAuthorize`（真实风险分级 + Gate） |
| `runAuthoritativeCheck: () => ({ passed: true })` | 真实 Vitest Runner（`vitest --reporter=json`） |
| `runScriptedDevAgent` | OpenAI 兼容 Agent（DeepSeek/智谱 via 环境变量） |

## 事件系统

所有状态变更通过追加写入日志发出类型化事件：

```typescript
type EventEnvelope<TPayload> = {
  eventId: string;
  seq: number;              // 每个项目内单调递增
  schemaVersion: string;
  projectId: string;
  runId?: string;
  agentId?: string;
  timestamp: string;
  payload: TPayload;
};
```

事件类型包括：`project.created`、`agent.started/plan/act/observe/reflect`、`agent.error`、`run.failed`、`tool_call.started/output/failed`、`diff.created`、`test.result`、`human_gate.created/resolved`、`change_request.created/resolved` 和 `artifact.created`。

前端通过 SSE 消费事件，通过两种可切换视图渲染——**流式模式**（时间序信息流，含内嵌 Gate 卡片）和**泳道模式**（Agent 行 × 计划/执行/观察/反思列）——两者共享同一事件投影，无独立状态。

## 控制台 UI

控制台采用 Claude 风格的暖色调视觉风格：

- **顶部导航**：项目切换器、状态/阶段标签、运行/暂停、部署入口、头像下拉 → 设置
- **左面板**：流式模式（默认），包含用户消息、Agent 事件、内嵌 Gate 卡片和粘性输入框；可切换到泳道模式
- **右面板**：五个标签页——文件、预览、终端、测试、报告
- **项目中心**（从切换器打开）：多项目管理，含 9 阶段生命周期时间线
- **设置**（从头像打开）：环境状态、API Key 就绪度、工具检查、只读策略标签

## 许可证

私有项目。保留所有权利。
