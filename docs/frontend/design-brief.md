# Frontend Design Brief

## 产品定位

OneCompany 是一个 local-first multi-agent development platform。用户输入一句需求，系统通过多个 agent 完成需求澄清、PRD、技术方案、切片开发、测试、预览、部署和交付。

前端不是“任务管理后台”，而是一个 agent runtime console。它要让用户清楚看到：

- 当前主流程进行到哪里。
- 哪个 agent 正在工作。
- agent 做了什么计划、动作、观察和反思。
- 哪些操作被 gate 阻塞。
- 哪些测试、diff、工具调用、日志、artifact 支撑当前状态。
- 用户此刻能安全地做什么。

## 用户

主要用户是独立开发者或小团队技术负责人。他们关心的是控制、可解释性、进度、风险和可交付结果，而不是营销视觉。

界面应支持长时间工作，信息密度可以高，但层级必须清楚。

## 核心设计目标

1. **突出多 agent 编排**
   主 agent 与子 agent 的调用关系必须成为第一层信息，而不是埋在日志里。

2. **信息流可追踪**
   用户能从一次事件跳转到相关工具调用、diff、测试、文件、终端日志和报告。

3. **泳道可对照**
   用户能从时间线切换到 agent x Plan/Act/Observe/Reflect 的视角，理解多个 agent 的进度和交接。

4. **gate 不可绕过**
   所有高风险操作、确认、失败处理和最终验收必须通过明确 gate 表达。composer 只能附加到允许的 gate decision，不能隐式批准。

5. **后端不重写**
   前端应消费现有事件、状态、gate、文件、测试、预览和报告 API。必要时可以增加投影层，不应复制业务状态机。

## 参考产品

### Cursor

参考点：

- Background Agents 的 agent 列表、状态查看、follow-up、take over。
- Agent / Ask / Manual 等模式区分。

不照搬：

- OneCompany 不只是 IDE sidebar，它需要表达完整生命周期和多个 agent group。

### OpenAI Codex

参考点：

- 端到端 coding task 的任务感。
- 技能、文档、PR、测试和交付物的工作流表达。

不照搬：

- OneCompany 是本地优先、强 gate、强状态机，不是纯云端任务列表。

### Claude Code

参考点：

- agentic coding system 的开发者信任模型：读代码、改文件、跑测试、提交结果。
- 可解释的 action / result / artifact 关系。

不照搬：

- OneCompany 前端需要多 agent 编排可视化，而不是单 terminal transcript。

### opencode

参考点：

- terminal-native coding harness 的实时事件感。
- 工具调用、命令输出、diff、测试的紧凑呈现。

不照搬：

- OneCompany 需要更强的 workflow governance、human gate、project workspace 和 right panel。

## UI v2 视觉方向

UI v2 是全新界面，不复刻当前 Figma baseline 或现有页面结构。

保留当前配色 token 方案：

- warm paper background
- dark ink text
- copper/orange primary accent
- muted warm borders
- green success
- amber warning
- red danger

在这个 token 体系上重新设计开发者控制台感：

- 更清楚的 agent status indicators
- 更强的 run grouping
- 更紧凑的 log/tool/diff/test rows
- 更明显的 current blocker / next action
- 更可扫描的泳道网格

旧 Figma baseline 只作为业务结构参考：它说明了 Stream、Swimlane、Settings、Project Hub 和右侧五 Tab 的存在关系，但不决定 UI v2 的具体布局、卡片形态或组件样式。

## 非目标

- 不做营销站 hero。
- 不做三栏拥挤布局。
- 不把 Settings 变成项目管理。
- 不把 Project Hub 变成环境配置。
- 不在 Files tab 直接编辑代码。
- 不在前端创建第二套工作流状态机。
- 不展示 hidden chain-of-thought，只展示计划、观察、反思摘要和可审计结果。
