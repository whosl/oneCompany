# OneCompany 业务流程与功能设计手册（前端开发指导版）

Status: v1.0（2026-06-10，基于当前实现 + M13 已确认决策）
Audience: 前端开发 / UI 设计
Source of truth: 代码实现现状（`packages/shared`、`packages/workflow`、`apps/api`）+ `handbook/m13-remediation-plan.md` 已拍板决策

本手册回答三个问题：

1. **业务上发生了什么**——项目从一句话需求到交付的完整流程，每个阶段后端做什么、用户做什么。
2. **前端要呈现什么**——每个界面区域的职责、每种状态下的展示与可用操作。
3. **数据从哪来**——API、SSE 事件、快照投影的精确契约。

> 标注约定：
> - 【现状】= 当前代码的真实行为。
> - 【M13】= 已确认将在 M13 修复/变更的行为。**前端新开发一律按 M13 目标行为设计**，现状仅用于理解当前系统为什么这样表现。

---

## 1. 核心概念（领域模型）

| 概念 | 说明 | 关键字段 |
| --- | --- | --- |
| **Project** | 一次交付的容器。一个项目 = 一句话需求 → 一个交付物 | `id`, `name`, `slug`, `status` |
| **Status** | 项目生命周期状态，共 12 个，由严格状态机控制 | 见 §2 |
| **Agent** | 干活的角色（Intake、Architect、Coding……），分属 requirement / development 两个 group | `agentId@version`, `group`, `modelTier` |
| **Agent Run** | 一次 agent 执行。生命周期 `running → completed/failed`。每个 run 产生 PAROR 事件（Plan/Act/Observe/Reflect） | `runId`, `agentId` |
| **Human Gate** | 需要人决策的暂停点，共 8 种类型。gate 未决时对应工作流挂起 | `gateId`, `gateType`, `options[]` |
| **Event** | 仅追加的事件日志，全部 UI 状态的最终来源。24 种类型 | `seq`, `payload.type` |
| **Slice** | 开发阶段的功能切片（垂直切片）。状态 `pending / in_progress / passed / failed / skipped`，【M13】新增 `interrupted` | `id`, `title`, `testCommand` |
| **Artifact** | 产出物：PRD 版本（`prd-1`…）、验收标准（`ac-1`…）、技术方案（`tp-1`…）、交付报告 | `artifactId`, `path` |
| **Change Request** | 用户中途变更需求的请求，kind = `requirement_change` / `skip_slice` | `changeRequestId`, `kind` |
| **Integration** | 外部连接器（GitHub、Figma、Vercel、Supabase、Playwright），带离线 Skill Pack 兜底 | `integrationId`, `status` |

**心智模型**：用户与"一家公司"对话。Orchestrator 接单 → 需求组弄清楚要做什么 → 开发组分片实现 → 测试 → 部署 → 交付验收。用户全程只在 gate 处做决策、在提问轮回答问题。

---

## 2. 项目状态机

### 2.1 全部状态

| 状态（精确字符串） | 含义 | 前端阶段归属 |
| --- | --- | --- |
| `Draft Requirement` | 刚建项目，未提交需求或需求处理中 | 需求 |
| `Asking Questions` | 提问轮进行中，等用户回答 | 需求 |
| `PRD Ready` | PRD 已生成，等用户确认（`requirement_confirm` gate） | 需求 |
| `Tech Plan Review` | 技术方案已生成，等用户确认（`tech_plan_confirm` gate） | 开发 |
| `Developing` | 切片开发执行中 | 开发 |
| `Change Review` | 变更请求评审中（`change_review` gate） | 开发 |
| `Testing` | 最终测试套件运行中 | 测试 |
| `Deploying` | 部署 gate 开启，等待 URL 确认 | 部署 |
| `Awaiting Acceptance` | 交付报告已生成，等最终验收（`final_acceptance` gate） | 交付 |
| `Delivered` | 终态：交付完成 | 交付 |
| `Failed` | 终态：失败 | — |
| `Paused` | 暂停（记录 `pausedFrom`，resume 回到原状态） | — |

### 2.2 合法转换表

任意活跃状态（非终态、非 Paused）都可 → `Paused` / `Failed`。`Paused` 只能 → `pausedFrom` 原状态或 `Failed`。`Delivered` / `Failed` 是终态。

| From | To |
| --- | --- |
| `Draft Requirement` | `Asking Questions`, `PRD Ready` |
| `Asking Questions` | `Asking Questions`（自转换）, `PRD Ready` |
| `PRD Ready` | `Asking Questions`（驳回 PRD）, `Tech Plan Review` |
| `Tech Plan Review` | `Tech Plan Review`（自转换）, `Developing` |
| `Developing` | `Developing`, `Testing`, `Tech Plan Review`, `Change Review` |
| `Change Review` | `Developing`, `Tech Plan Review` |
| `Testing` | `Developing`（套件失败）, `Deploying`, `Awaiting Acceptance` |
| `Deploying` | `Awaiting Acceptance` |
| `Awaiting Acceptance` | `Developing`（拒收重做）, `Delivered` |

【M13 新增的边】：`Testing → Change Review`、`Change Review → Testing`、`Deploying → Testing`（部署被拒）。前端的生命周期时间线和状态推断要容纳这三条边。

### 2.3 状态 → 前端关键呈现

| 状态 | Composer 模式 | 顶栏动作 | 必须醒目呈现 |
| --- | --- | --- | --- |
| `Draft Requirement` | 需求输入框 | — | 引导文案"描述你想要的产品" |
| `Asking Questions` | 问题卡片 + 答案提交 | Pause | 当前轮问题、完成度分数、剩余轮次预算 |
| `PRD Ready` | gate 决策（PRD 确认） | Pause | PRD 内容入口、gate 选项 |
| `Tech Plan Review` | gate 决策（技术方案确认） | Pause | 技术方案入口、gate 选项 |
| `Developing` | 变更请求输入 | Pause | 切片进度（n/m）、当前切片、实时 agent 活动 |
| `Change Review` | gate 决策（变更评审） | Pause | 变更摘要、影响分类、gate 选项 |
| `Testing` | 变更请求输入 | Deploy、Pause | 套件进度（4 个 suite 逐个状态）、preview URL |
| `Deploying` | 部署 URL 提交 + gate 决策 | Pause | 部署引导（隧道/托管说明）、URL 输入 |
| `Awaiting Acceptance` | gate 决策（最终验收） | Pause | 交付报告入口、验收选项 |
| `Delivered` | 只读 | — | 交付报告、部署 URL |
| `Failed` | 只读 | — | 失败原因（最后的 gate 决策 / `run.failed` 事件） |
| `Paused` | 禁用（全局横幅） | Resume | `pausedFrom` 提示"恢复后回到 X 阶段" |

【M13】`Paused` 必须全局禁用 composer 与 gate 操作并显示横幅（F-29）；暂停为硬中断语义（点击即停，进行中的切片中断保存，恢复后继续），前端按"暂停立即生效"设计，不需要"正在停止中"的长过渡态，但要能渲染切片 `interrupted` 状态。

---

## 3. 端到端业务流程

### 3.1 总览

```
创建项目 ──► 需求阶段 ──► PRD 确认 ──► 技术方案确认 ──► 切片开发 ──► 最终测试 ──► (部署) ──► 交付验收 ──► Delivered
              ▲   │            │              ▲    ▲          │   │           │            │
              └───┘            └──驳回回到提问 │    └─变更评审──┘   └─失败回开发  └─拒绝回测试   └─拒收回开发
            提问循环                          └────replan─────────────────────【M13】
```

### 3.2 创建项目

- `POST /projects` `{ name }` → 项目以 `Draft Requirement` 创建，事件 `project.created`。
- 前端入口：Project Hub 的"New Project"。
- 创建后直接进入 console（`/projects/{id}`），composer 处于需求输入模式。

### 3.3 需求阶段（Requirement Workflow）

**触发**：`POST /projects/:id/requirement/start` `{ requirement }`（composer 发送一句话需求）。

**内部流程**（需求组 agent 流水线）：

```
intake（需求结构化）→ requirement-analyst（分析）→ completeness-scorer（完成度打分）→ 路由：
  ├─ 分数 ≥ 85 且无 critical 缺口 → prd-acceptance（生成 PRD + 验收标准）→ requirement_confirm gate → PRD Ready
  ├─ 轮次未用尽（默认上限 6 轮）→ question-planner（出题，每轮 ≤10 题）→ 等用户回答 → 回到 scorer
  └─ 轮次用尽或连续两轮提升 <3 分（卡住）→ requirement_stuck gate
```

**用户视角**：

1. 发出需求 → 信息流出现"原始需求"和"标准化摘要"两张卡。
2. 进入 `Asking Questions`：信息流出现问题卡片。每题带最多 3 个建议答案（A/B/C）+ 自定义（D）。回答通过 `POST .../requirement/answers` `{ answers: string[] }` 整轮提交（答案数组与当轮问题一一对应）。
3. 每轮回答后完成度分数更新——前端展示分数进展（如 62 → 78 → 88）和"已确认 / 待确认"信息块（snapshot 的 `settledChips` / `upcomingChips`）。
4. 达标后 PRD 生成，进入 `PRD Ready`，弹出 `requirement_confirm` gate。

**卡住 gate（`requirement_stuck`）**——选项与语义：

| 选项 | 语义 | 前端文案要点 |
| --- | --- | --- |
| `keep_answering` | 追加 3 轮提问预算，继续问 | "继续回答问题" |
| `force_continue` | 信息不全也直接生成 PRD | "信息不全也继续，按当前理解生成 PRD" |
| `fail` | 项目失败（终态） | 危险操作样式，需明确警示 |

**PRD 确认 gate（`requirement_confirm`）**：

| 选项 | 语义 | 状态走向 |
| --- | --- | --- |
| `approve` | 接受 PRD | 【现状】停留 `PRD Ready`，用户手动点"开始开发"。【M13/D2】**自动转 `Tech Plan Review` 并直接启动技术方案生成**，"开始开发"按钮取消，前端按自动流转设计 |
| `revise_then_approve` | 带修改意见返工 | 回到 `Asking Questions` |
| `reject_and_redo` | 整体驳回重做 | 回到 `Asking Questions` |
| `custom` + 文本 | 自定义意见 | 回到 `Asking Questions` |

**产物**：PRD 版本（`prd-1`, `prd-2`…）与验收标准（`ac-1`…）写入 artifacts，事件 `artifact.created`。PRD 每次返工生成新版本——前端 Files tab / Report 应能看到版本序列。

### 3.4 技术方案阶段

**触发**：【现状】`POST /projects/:id/development/start`（PRD 确认后手动）。【M13/D2】approve PRD 后自动触发。

**流程**：`architect`（strong 模型）生成技术方案 → 写入 `tp-1` 版本 → `tech_plan_confirm` gate → 状态 `Tech Plan Review`。

**gate 选项**：与 `requirement_confirm` 相同四项。

| 选项 | 语义 |
| --- | --- |
| `approve` | 进入切片规划：`test-designer` 设计每个切片的测试要点 + `planner` 产出切片队列 → 状态 `Developing` |
| `revise_then_approve` | 【M13/F-37i】修改意见注入 architect 重跑出新版方案（`tp-2`），再开 gate |
| `reject_and_redo` | 重新生成方案，再开 gate |
| `custom` | 同 revise 处理 |

**前端要点**：技术方案是 markdown artifact，gate 卡片应提供"查看技术方案"入口（跳 Files tab 或内嵌渲染）。方案版本号（tp-n）应展示。

### 3.5 切片开发阶段（Developing）

**核心循环**（每个切片）：

```
标记 in_progress → coding agent 写代码（引擎：opencode harness）
  → 权威检查（vitest 跑 slice.testCommand，引擎说了不算，测试说了算）
    ├─ 通过 → git commit → 标记 passed → 生成 diff（事件 diff.created）→ review agent 评审
    └─ 失败 → 重试（每切片预算 4 次）→ 预算耗尽 → slice_failure gate
全部切片 passed/skipped → 状态 Testing
```

**前端必须呈现**：

- **切片进度**：`dev.sliceIndex / dev.sliceTotal`、当前切片标题（snapshot `dev.currentSliceId`）。
- **实时 agent 活动**：PAROR 事件流（`agent.plan/act/observe/reflect`）按 run 分组渲染。
- **每个切片的测试结果**：`test.result` 事件（`suite` = 切片 id，`status` = passed/failed）。
- **diff**：`diff.created` 事件 → Files tab 可查看 patch。
- **重试可见性**：同一切片多次尝试要可区分（attempt 计数）。

**切片失败 gate（`slice_failure`）**：

| 选项 | 语义 | 前端文案要点 |
| --- | --- | --- |
| `retry` | 重置尝试预算（+4 次），原方案重试 | "再试一次" |
| `replan` | 回 architect 重出技术方案 | "调整技术方案" |
| `request_skip_slice` | 发起跳过该功能的变更评审（走 change_review gate） | "跳过这个功能"，需说明会修订 PRD |
| `fail` | 项目失败 | 危险样式 |

**高危命令 gate（`dangerous_operation`）**：开发中 agent 要执行高危 shell 命令（删库、`rm -rf`、改系统配置等）时弹出。

| 选项 | 语义 |
| --- | --- |
| `approve` | 允许执行。【M13/D1】实际执行走 Docker 沙箱代执行，结果回注引擎 |
| `skip_risk_and_continue` | 跳过该操作继续（**riskLevel=high 时此选项被策略移除**，前端按 gate 返回的 `options` 渲染，不要硬编码） |
| `reject` | 拒绝执行 |
| `custom` | 自定义指示 |

gate 的 `metadata.riskLevel` 必须影响视觉等级（high = 危险红、阻断式呈现命令原文）。**gate 卡片必须展示待执行的命令/工具与参数摘要**（payload 内，【M13/F-32】补全元数据）。

### 3.6 变更请求与变更评审

**入口**：项目处于 `Developing` 或 `Testing` 时，composer 提供"提出变更"输入。`POST /projects/:id/change-requests` `{ summary, details? }`。

**流程**：创建后系统做影响分析（关键词命中 database/schema/auth 等 → `architecture`，否则 `queue_only`）→ 开 `change_review` gate → 状态 `Change Review`。

**gate 选项（`change_review`）**：

| 选项 | requirement_change 语义 | skip_slice 语义 |
| --- | --- | --- |
| `update_plan` | PRD/AC 追加修订版本，任务队列更新，回 `Developing`。【M13/F-22.2】若影响= architecture 则改走 `Tech Plan Review` | 切片标记 `skipped`，验收标准追加豁免说明，【M13/F-23】PRD 同步修订 |
| `revise_tech_plan` | 回 `Tech Plan Review` 重出方案 | 同左 |
| `reject` | 驳回变更，回 `Developing` 原计划继续 | 同左 |

**前端要点**：变更卡片要展示影响分类（`queue_only`="排队即可" / `architecture`="影响架构"）和系统建议。`change_request.created/resolved` 事件【M13/F-26】将进入信息流渲染。

### 3.7 测试阶段（Testing）

**触发**：切片全部完成自动进入；或顶栏 Deploy 按钮 = `POST .../testing/start` `{ requestDeploy: true }`。

**流程**：启动 preview 服务 → 依次跑 4 个套件，**任一失败即停**：

| 套件 ID | 内容 |
| --- | --- |
| `final:typecheck` | `pnpm typecheck` |
| `final:build` | `pnpm build` |
| `final:vitest` | 单元/集成测试 |
| `final:playwright` | E2E（依赖 preview URL） |

- **失败** → QA agent 生成失败分析 → 状态回 `Developing`（自动修复后重测）。
- **通过** → `requestDeploy=true` 时 → `Deploying` 并自动开启部署流程；否则 → `Awaiting Acceptance`。

**前端必须呈现**：套件逐项状态（pending/running/passed/failed）、preview URL（Preview tab iframe + 顶栏链接）、失败时的 QA notes。数据源：snapshot `testing.{phase, suitePassed, suiteTotal, previewUrl}` + `test.result` 事件 + `GET .../testing/status`。

### 3.8 部署阶段（Deploying）

**当前形态是"人工确认 URL"而非自动化部署**：

1. 进入 `Deploying` → 事件 `deployment.started` → 开 `deployment` gate。
2. 用户在外部完成部署（Vercel / Cloudflare Tunnel 等），把公网 URL 通过 `POST .../deployment/url` `{ url }` 提交（必须 http/https）。
3. gate `approve` → 记录 deployment（`deployment.url_confirmed` + `deployment.completed` 事件）→ 状态 `Awaiting Acceptance`。
4. gate `reject` → 【现状】卡在 `Deploying`。【M13/F-22.3】**回到 `Testing`**，前端按此设计。

**前端要点**：composer 部署模式 = URL 输入框 + 提交按钮 + gate 决策按钮；要有部署引导文案（怎么拿到公网 URL）。`deployment.*` 事件【M13/F-26】进入信息流。

### 3.9 交付与最终验收（Awaiting Acceptance）

**进入时自动**：生成交付报告（`delivery-report.md`），事件 `delivery.report_generated`，开 `final_acceptance` gate。

**交付报告 9 个固定 section**（Report tab 按此渲染）：

`requirement-summary`（需求摘要）、`confirmed-tech-stack`（技术栈）、`feature-list`（功能清单）、`directory-structure`（目录结构）、`run-instructions`（运行说明）、`test-results`（测试结果）、`deployment-url`（部署地址）、`risks-and-limitations`（风险与限制）、`follow-up-recommendations`（后续建议）。

每个 section 可能带 `emptyReason`（如未部署则 deployment-url 为空并说明原因）——**空也要诚实渲染原因，不准编造**。

**最终验收 gate（`final_acceptance`）**：

| 选项 | 语义 |
| --- | --- |
| `accept` | → `Delivered`（终态，撒花） |
| `reject_and_redo` | → 回 `Developing` 重做 |
| `custom` | 自定义意见 |

**诚实交付原则（前端红线）**：报告中的 mock/模拟数据必须带 `[MOCK]` 标记呈现；离线集成调用、缺失凭据、降级行为都会出现在 risks 区——前端不得弱化或隐藏这些条目。

### 3.10 暂停 / 恢复

- `POST /projects/:id/pause` → `Paused`；`POST .../resume` → 回 `pausedFrom`。
- 【M13/D3 目标行为】暂停 = 硬中断：abort 进行中的 opencode session、终止 shell 命令；进行中切片改动 stash 保存、切片标记 `interrupted`；恢复时还原继续。
- **前端设计**：Pause 即时生效（按钮无需长 loading）；Paused 全局横幅 + 操作禁用；切片列表支持 `interrupted` 状态（区别于 failed 的中性样式）；恢复后该切片回 `in_progress`。

---

## 4. Human Gate 完整规格

gate 是整个产品的核心交互。**前端渲染 gate 永远以 API 返回的 `options` 数组为准**（策略会动态删减选项，如 high 风险移除 `skip_risk_and_continue`），不要在前端硬编码选项集。

### 4.1 八种 gate 类型速查

| gateType | 出现时机 | 选项 | 支持 custom 文本 |
| --- | --- | --- | --- |
| `requirement_confirm` | PRD 生成后 | `approve` / `revise_then_approve` / `reject_and_redo` / `custom` | 是 |
| `tech_plan_confirm` | 技术方案生成后 | 同上 | 是 |
| `requirement_stuck` | 提问预算耗尽/卡住 | `keep_answering` / `force_continue` / `fail` | 否 |
| `slice_failure` | 切片重试预算耗尽 | `retry` / `replan` / `request_skip_slice` / `fail` | 否 |
| `change_review` | 变更请求创建后 | `update_plan` / `revise_tech_plan` / `reject` | 否 |
| `deployment` | 进入 Deploying | `approve` / `reject` / `custom` | 是 |
| `dangerous_operation` | 高危命令/集成写操作 | `approve` / `skip_risk_and_continue`* / `reject` / `custom` | 是 |
| `final_acceptance` | 交付报告生成后 | `accept` / `reject_and_redo` / `custom` | 是 |

\* `metadata.riskLevel === "high"` 时被策略移除。

### 4.2 决策提交

`POST /gates/:id/resolve` `{ decision, customText? }`。custom 决策提交 `{ decision: "custom", customText: "..." }`。解决后事件 `human_gate.resolved` 广播，对应工作流自动恢复。

### 4.3 gate UI 设计要求

1. **阻断性分级**：流程 gate（confirm/acceptance）= 信息流内卡片 + composer 接管；风险 gate（dangerous_operation, riskLevel=high）= 必须无法忽略（高亮/置顶/声效可选）。
2. **上下文完整**：每个 gate 卡片要回答"系统想干什么、为什么需要我、每个选项的后果"。`metadata`（riskLevel、integrationId、toolName、args 摘要等）必须渲染。
3. **不可重复提交**：resolve 后卡片立刻变为已决策态（显示 decision + 时间），按钮禁用。
4. **历史可溯**：已决策的 gate 留在信息流中（`human_gate.resolved` 渲染为记录卡）。
5. **多 gate 并存**：`openGates` 可能 >1（如 dangerous_operation 叠加在 developing 上）。composer 接管以 `blockingGateId`（最早未决 gate）为准，其余在信息流就地决策。

---

## 5. 事件模型与前端数据层

### 5.1 数据获取模式（hydrate + live）

```
进入页面 → GET /projects/:id/console/snapshot   （全量：项目+阶段+事件历史+lastSeq+openGates）
        → 建立投影 ConsoleProjection
        → GET /projects/:id/events/stream?afterSeq={lastSeq}   （SSE 实时增量）
        → 每事件 applyEvent 增量更新；gate 事件触发快照重取（gate options 不在事件里）
```

- SSE 断线 1.5s 重连，cursor 用 `afterSeq`（**只增不退**，【M13/F-25】修复快照晚到导致游标回退的 bug——前端实现 `lastSeq = max(current, snapshot.lastSeq)`）。
- 事件按 `seq`（项目内单调递增）排序与去重。

### 5.2 事件信封

```ts
{
  eventId: string,
  seq: number,            // 项目内单调递增，排序与去重的唯一依据
  schemaVersion: "1",
  projectId: string,
  runId?: string,         // 归组 agent run 用
  agentId?: string,
  timestamp: string,      // ISO
  payload: { type: string, ... }   // 24 种，按 type 判别
}
```

### 5.3 事件类型 → 信息流渲染映射

| 事件类型 | 信息流渲染 | 备注 |
| --- | --- | --- |
| `agent.plan` / `agent.act` / `agent.observe` / `agent.reflect` | run 分组内的 PAROR 段 | 【M13/F-26】reflect 纳入渲染 |
| `agent.started` | run 分组头（agent 名 + 状态） | |
| `agent.error` | run 分组内错误条 | 红色 |
| `run.failed` | 【M13/F-26】失败卡 | 现状不渲染，需补 |
| `tool_call.started` / `tool_call.output` / `tool_call.failed` | 工具调用行（折叠详情） | output 可能是 ref（大输出落盘） |
| `diff.created` | diff 卡 → 跳 Files tab | |
| `test.result` | 测试结果行（suite + passed/failed） | |
| `human_gate.created` / `resolved` | gate 卡片 / 决策记录卡 | 不分组，独立卡 |
| `change_request.created` / `resolved` | 【M13/F-26】变更卡 | 现状不渲染，需补 |
| `deployment.started` / `url_confirmed` / `completed` | 【M13/F-26】部署里程碑卡 | 现状不渲染，需补 |
| `delivery.report_generated` | 【M13/F-26】报告就绪卡 → 跳 Report tab | 现状不渲染，需补 |
| `artifact.created` | 【M13/F-26】产物卡 → 跳 Files tab | 现状不渲染，需补 |
| `project.status_changed` | 阶段分隔线（信息流分段） | 建议用作时间轴节点 |
| `environment.missing_key` | 环境警告条 | 与 Settings 降级提示联动 |
| `project.created` | 不渲染 | |

**排序规则**：信息流一律按 `seq` 时间序渲染（【M13/F-26】修复现状的四段拼接乱序）。run 分组是"时间序上连续同 runId 事件的视觉折叠"，不改变顺序。

### 5.4 快照补充的非事件条目

来自 snapshot 而非事件：`user.requirement.raw`（原始需求）、`user.requirement.normalized`（标准化摘要）、`requirement.question`（当前轮待答问题）。

### 5.5 泳道（Swimlane）

同一份投影的第二渲染：行 = agent，列 = plan/act/observe/reflect/user/gate。单元格 = 该 agent 最近事件摘要 + 状态色（active/completed/failed）。用于查看多 agent 并行与卡点。设计契约详见 `stream-and-swimlane-contract.md`。

---

## 6. Agent 编排模型

### 6.1 组织结构

```
Orchestrator（编排，对用户的"接口人"）
├── Requirement Group
│   ├── intake             需求结构化        cheap
│   ├── requirement-analyst 需求分析         standard
│   ├── completeness-scorer 完成度打分       cheap
│   ├── question-planner    出题            cheap
│   └── prd-acceptance      PRD+验收标准     standard
└── Development Group
    ├── architect           技术方案         strong
    ├── test-designer       测试设计         standard
    ├── planner             切片规划         strong
    ├── coding              编码（opencode）  strong
    ├── review              代码评审         strong
    ├── qa                  测试分析         standard
    └── devops-delivery     交付             standard
```

前端展示用名称建议：Intake=需求接待、Analyst=需求分析、Scorer=完成度评估、Planner=切片规划、Coding=编码、Review=评审、QA=质检、DevOps=交付。模型档位（cheap/standard/strong）可作为次要信息展示。

### 6.2 run 生命周期与 UI 状态

`agent.started` → running（泳道 active 色、信息流 spinner）→ `agent.reflect` 后通常结束 → completed；`agent.error`/`run.failed` → failed（红）。同一 agent 可多次 run（多轮提问 = 多次 scorer run）。

---

## 7. 界面功能设计（区域职责）

页面结构与布局规范见 `information-architecture.md` 和 `ui-v2-screen-spec.md`，此处只定义**业务职责**。

### 7.1 顶部编排状态区（必须常驻）

- 项目名 + 状态 chip + 阶段标签（snapshot `phase.{label, activeGroup, progressLabel}`）。
- 当前活跃 group / agent、阻塞中的 gate 提示（"等你确认 PRD"）。
- 动作：Deploy（仅 `Testing` 可用，语义 = 跑最终测试并部署）、Pause/Resume、项目切换、Settings。
- 【M13/F-29】Deploy 按钮在不可用阶段需说明原因（tooltip）而非静默禁用。

### 7.2 信息流（默认主视图）

- 严格 `seq` 时间序；阶段切换插入分隔线；run 折叠分组；gate/用户/问题卡不折叠。
- 自动滚动到最新，用户上翻时显示"跳到最新"。
- 卡片可深链到右侧面板（diff → Files、test → Tests、report → Report）。

### 7.3 Composer（状态机驱动的多模态输入）

唯一的用户输入入口，模式由 `status + blockingGate` 决定（详见 §2.3 表）。规则：

- 任意时刻 composer 必须明确告诉用户"现在系统在等你做什么"。
- 有阻塞 gate 时 composer 被 gate 决策接管；无 gate 且在 `Developing`/`Testing` 时退化为变更请求入口。
- 问题回答支持卡片选择（A/B/C/D）与整轮提交，提交前可修改任意题。

### 7.4 右侧面板（5 个 tab）

| Tab | 数据源 | 职责 |
| --- | --- | --- |
| **Files** | `GET .../files`（repo/artifacts 双 scope）、`.../diffs` | 文件树 + 文件内容 + diff patch 列表。PRD/技术方案/报告等 artifact 在这里可读 |
| **Preview** | `GET .../preview/status`（5s 轮询） | iframe 预览 + 健康状态（reachable/consoleErrors）。无 preview 时给出阶段性说明 |
| **Terminal** | `POST .../commands` | 受限命令执行；403+gateId 时就地渲染 gate 卡（高危命令审批闭环） |
| **Tests** | `GET .../tests/results` | 切片测试 + 最终套件两个分区，按 suite 列出 passed/failed。【建议】监听 `test.result` 事件自动刷新 |
| **Report** | `GET .../report` | 9 section 交付报告 + risks + URL。空 section 渲染 `emptyReason` |

### 7.5 Project Hub（项目列表）

列表（名称/状态/更新时间）+ 详情（生命周期时间线、open gates、preview/deployment URL）+ 新建入口。生命周期时间线按 §2 状态机渲染，要支持回退路径（Testing→Developing 等）呈现为"重做"标记而非时间线倒退。

### 7.6 Settings

环境就绪（node/pnpm/git/docker/playwright/sqlite checks）、引擎就绪（workflowLlmReady/opencodeCliReady）、API key 就绪（只展示 key 名，**绝不展示值**）、策略 chips、Integrations 入口。引擎降级时全局降级横幅（`engine-degraded-notice`）。

### 7.7 Integrations 页

- 连接器卡片：displayName、状态 pill（`not_configured` / `connected` / `expired` / `offline_fallback` / `disabled`）、scopes、secret 就绪（只有名字）、离线 Skill Pack。
- 【现状】只读。【M13/F-33 后】增加 enable 交互；缺凭据时状态显示 `not_configured` 并引导配置。
- 【M13/D5】mock 模式（`OC_INTEGRATION_MOCK=1`）下所有模拟结果带"模拟"徽章，Settings 显示提示横幅。

---

## 8. API 速查表

Base URL：`NEXT_PUBLIC_API_URL`（默认 `http://localhost:3001`）。

| 域 | Method + Path | 用途 |
| --- | --- | --- |
| 项目 | `GET/POST /projects`；`GET /projects/:id`；`POST /projects/:id/pause`、`/resume` | 列表/创建/详情/暂停恢复 |
| 快照 | `GET /projects/:id/console/snapshot` | hydrate 全量（含事件史 + lastSeq） |
| 事件 | `GET /projects/:id/events/stream?afterSeq=` | SSE 实时流 |
| 需求 | `POST /projects/:id/requirement/start`、`/answers` | 提需求 / 交答案 |
| 开发 | `POST /projects/:id/development/start`；`GET .../development/status` | 启动开发 / 状态 |
| 测试 | `POST /projects/:id/testing/start`；`GET .../testing/status` | 启动测试（可带 requestDeploy）/ 状态 |
| 预览 | `POST .../preview/start`、`/stop`；`GET .../preview/status` | 预览生命周期 / 健康 |
| 部署 | `POST .../deployment/start`、`/url`；`GET .../deployment` | 部署 gate / URL 提交 / 状态 |
| 交付 | `GET .../delivery`；`POST .../delivery/generate` | 验收状态 / 重新生成报告 |
| Gate | `GET /projects/:id/gates`；`POST /gates/:id/resolve` | 未决 gate / 决策 |
| 变更 | `POST/GET /projects/:id/change-requests` | 提变更 / 列表 |
| 面板 | `GET .../files`、`.../diffs`、`.../diffs/:diffId`、`.../tests/results`、`.../report`；`POST .../commands` | 右侧面板数据 |
| 环境 | `GET /environment/readiness` | Settings 数据 |
| 集成 | `GET /integrations`、`/integrations/skill-packs`、`/projects/:id/integrations`；`POST .../integrations/:iid/enable`、`/call` | 集成页数据与操作 |

---

## 9. 已知缺陷与 M13 变更对照（前端注意清单）

以下行为当前是坏的/将变，**新前端代码不要适配现状的错误行为**：

| # | 现状（错误） | M13 目标（按此设计） |
| --- | --- | --- |
| 1 | Pause 只改标签，引擎照跑 | 硬中断 + `interrupted` 切片状态 + 恢复继续（D3） |
| 2 | approve PRD 后停留 PRD Ready，需手动"开始开发" | 自动转 Tech Plan Review，按钮取消（D2） |
| 3 | 部署 reject 卡死 Deploying | 回到 Testing（F-22.3） |
| 4 | Testing 中提变更非法转换报错 | Testing → Change Review 合法（F-22.1） |
| 5 | 信息流缺 deployment/change_request/artifact/run.failed/reflect 渲染 | 全部纳入时间序渲染（F-26） |
| 6 | 信息流四段拼接、非全局时间序 | 严格 seq 时间序 + 阶段分隔线（F-26） |
| 7 | SSE 游标可能被旧快照回退 | `max(current, snapshot.lastSeq)`（F-25） |
| 8 | gate 卡片缺命令/工具上下文 | metadata 完整渲染（F-27/F-32） |
| 9 | Paused 状态下 UI 无差异 | 全局横幅 + 操作禁用（F-29） |
| 10 | 集成 mock 返回假成功无标记 | `[MOCK]` 标注 + 模拟徽章 + 缺凭据结构化错误（D5/F-31） |
| 11 | 集成页只读 | enable 流程 + 凭据引导（F-33） |
| 12 | tech plan gate 的 revise 与 reject 行为相同 | revise 注入意见重跑（F-37i） |

---

## 10. 术语表（UI 文案基准）

| 术语 | 中文 UI 文案 | 禁止用法 |
| --- | --- | --- |
| Gate | 确认点 / 审批 | 不要叫"弹窗" |
| Slice | 功能切片 | 不要叫"任务" |
| PRD | 需求文档（PRD） | |
| Authoritative check | 权威测试 | 强调"引擎说了不算" |
| Offline Skill Pack | 离线技能包 | |
| PAROR | 计划/执行/观察/反思 | 内部缩写不直接面向用户 |
| Run | （agent 的）一次执行 | |
| Preview / Deployment | 本地预览 / 公网部署 | 两者必须区分清楚 |
| Mock / Simulated | 模拟数据（带 [MOCK] 标记） | 不准展示为真实结果 |

---

## 附：与其他文档的关系

- 状态机 / gate / 事件契约冲突时：**spec.md > 本手册 > 代码现状**；本手册与代码不一致即代码缺陷（见 §9 对照表）。
- 视觉与组件规范：`design-system.md`、`ui-v2-screen-spec.md`。
- 页面结构：`information-architecture.md`。
- 流/泳道渲染契约细节：`stream-and-swimlane-contract.md`。
- agent 编排 UI 语义：`agent-orchestration-ui.md`。
