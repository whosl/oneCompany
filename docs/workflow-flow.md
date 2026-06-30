# 双层工作流流程图 · 中间格式(Mermaid)

> **用途**:这是 `apps/webui/public/about.html` 里"双层工作流"流程图的**可编辑中间格式**。
> 你在 Mermaid 上调整布局 / 节点 / 连接 / 文字,改完告诉我,我按新版本重写 about.html 的 HTML(CSS 样式保留)。

## 怎么预览和编辑

- **在线**(推荐):复制下面代码块的全部内容 → 粘贴到 <https://mermaid.live> → 实时预览 + 直接编辑
- **VSCode**:装 "Markdown Preview Mermaid Support" 插件,直接预览这个 .md 文件
- **Typora / Obsidian**:原生支持 mermaid 代码块预览

## 怎么改(语法速查)

| 你想做的 | Mermaid 语法 |
|---|---|
| 箭头 A→B | `A --> B` |
| 带标签箭头 | `A -- "否" --> B` 或 `A -->\|否\| B` |
| 虚线箭头(关联/贯穿) | `A -.-> B` |
| 粗箭头(主流) | `A ==> B` |
| 方形节点(普通步骤) | `X["标题"]` |
| 菱形节点(Gate/判断) | `X{"达标?"}` |
| 圆形节点(起止) | `X("用户")` |
| 六边形 / 产物 | `X{{"PRD"}}` |
| 圆柱 / 数据库 | `X[("SQLite")]` |
| 分组 | `subgraph 组名["组标题"] ... end` |
| 分组内方向 | `direction LR`(横向)/ `direction TB`(纵向) |

**改完把整个代码块贴回给我,或在这个文件里改好告诉我**,我按新布局重写 about.html 的 HTML 结构(CSS 样式 / 颜色保留当前的实现)。

---

## 当前流程图(原样翻译)

```mermaid
flowchart TD
  %% ============================================================
  %% ① 用户入口
  %% ============================================================
  User("👤 用户<br/>一句话业务需求<br/>+ 任意时刻自由文本输入")

  %% ============================================================
  %% ② Taizi 太子调度 Agent · 横跨全程(黄色横条)
  %%    说明:用户任意时刻的自由文本都先到这里,再分发到下方各阶段
  %% ============================================================
  subgraph TAIZI["🟡 Taizi 太子调度 Agent · 横跨全程"]
    direction LR
    Tclass["三级分类<br/>(规则 → LLM → 状态保底)"]
    Troute["调度路由<br/>(改状态)"]
    Tresearch["只读调研<br/>(不改状态)"]
    Tclass --> Troute
    Tclass --> Tresearch
  end
  Tnote("影响下方各阶段:暂停 · 恢复 · 插话活跃会话 · Gate 决策 · 变更请求 · 启动开发 · 导出提交包 · 状态查询") -.- TAIZI

  User ==> TAIZI

  %% ============================================================
  %% ③ 第一层 · 需求确定工作流(青色边)
  %%    说明:顺序执行 + 评分反馈 + 循环追问;达标后产出 PRD
  %% ============================================================
  subgraph REQ["🔵 第一层 · 需求确定工作流<br/>(LangChain 结构化 · 顺序 + 评分 + 循环追问)"]
    direction LR
    I["Intake<br/>规范化原始需求"]
    A["Analyst<br/>结构化业务模型"]
    S["Scorer<br/>完整度评分 + 缺口"]
    G1{"达标?<br/>completeness ≥ 阈值"}
    Q["Question Planner<br/>主题化问题 + 建议答案"]
    Ans["用户回答 / 采用默认假设"]
    P{{"PRD &amp; Acceptance<br/>固化业务基线"}}

    I --> A --> S --> G1
    G1 -- "否 · 循环追问" --> Q --> Ans --> A
    G1 -- "是 · 达标" --> P
  end

  TAIZI ==> REQ

  %% ============================================================
  %% ④ 持久化产物衔接(虚线桥)
  %%    说明:两层之间通过持久化产物衔接,不是直接函数调用
  %% ============================================================
  Bridge[["持久化产物衔接(业务基线)<br/>PRD · 验收标准"]]
  P ==> Bridge

  %% ============================================================
  %% ⑤ 第二层 · 开发交付工作流(品红边)
  %%    说明:LangGraph 状态机,内含切片循环
  %% ============================================================
  subgraph DEV["🟣 第二层 · 开发交付工作流<br/>(LangGraph 状态机 · Plan + ReAct + TDD + Gate)"]
    direction LR
    Ar["Architect<br/>技术方案"]
    G2{"技术方案 Gate<br/>approve / redo / revise"}
    Pl["Planner<br/>拆 Slice + 测试命令"]

    %% ---- 切片循环(每个 Function Slice)----
    subgraph SLICE["切片循环(每个 Function Slice)"]
      direction LR
      C["Coding<br/>Opencode Harness · TDD"]
      Wt["权威测试<br/>OneCompany 独立执行"]
      R["Review<br/>只读审查 · JSON 裁决"]
      G3{"通过?"}
      Git{{"Git 提交<br/>→ 下一切片"}}
      Retry["重试 / 重规划 / 变更评审"]

      C --> Wt --> R --> G3
      G3 -- "是" --> Git
      G3 -- "否" --> Retry --> C
    end

    All["全部切片完成"]
    Final["最终 typecheck / build / vitest / playwright"]
    G4{"部署 Gate"}
    Acc{{"人工最终验收<br/>→ 交付"}}

    Ar --> G2 --> Pl
    Pl ==> SLICE
    Git ==> All
    All --> Final --> G4 --> Acc
  end

  Bridge ==> DEV

  %% ============================================================
  %% ⑥ final-repair 警告(最终失败时的自动修复循环)
  %% ============================================================
  Final -. "失败触发" .-> FR["⚠ final-repair.ts<br/>最多 3 次自动修复<br/>(Prompt 硬约束'禁绕测试')<br/>超限交 SLICE_FAILURE_GATE 由用户决策"]

  %% ============================================================
  %% ⑦ 持久化产物 · SQLite + Artifacts · 贯穿全程(绿色横条)
  %%    说明:Agent 之间不直接对话,协作通过这里完成
  %% ============================================================
  subgraph STORE["🟢 持久化产物 · SQLite + Artifacts(贯穿全程)"]
    direction LR
    Db[("项目状态机 · 事件流(SSE 可重放)· Gate 历史 · 工具调用日志<br/>PAOR 摘要 · 命令输出 · 截图/Trace · 需求/计划 JSON")]
  end
  StoreNote("Agent 之间不直接对话 —— 协作通过 LangGraph 状态 + SQLite 持久化 + 统一事件流(agent.* / tool_call.*)完成") -.- STORE

  REQ -.-> STORE
  DEV -.-> STORE
  TAIZI -.-> STORE

  %% ============================================================
  %% 样式(颜色对应 about.html 的色板,改布局时可忽略)
  %% ============================================================
  classDef gate fill:#3a3220,stroke:#e4c05c,color:#e4c05c,stroke-width:2px
  classDef out fill:#1e3a25,stroke:#65d28a,color:#65d28a,stroke-width:2px
  classDef harness fill:#153b3e,stroke:#57d5dd,color:#57d5dd,stroke-width:2px
  classDef taizi fill:#3a3022,stroke:#e4c05c,color:#e4c05c
  classDef store fill:#1e3a25,stroke:#65d28a,color:#65d28a
  class G1,G2,G3,G4 gate
  class P,Git,Acc out
  class C harness
```

---

## 当前布局的 7 个组成部分(对应 HTML 结构)

| # | 部分 | Mermaid subgraph / 节点 | HTML 里的位置 |
|---|---|---|---|
| ① | 用户入口 | `User` | `.fd-entry` |
| ② | Taizi 横跨全程 | `subgraph TAIZI` | `.fd-band.fd-taizi` |
| ③ | 第一层 · 需求确定 | `subgraph REQ` | `.fd-layer.fd-req` |
| ④ | 持久化桥接 | `Bridge` | `.fd-bridge` |
| ⑤ | 第二层 · 开发交付 | `subgraph DEV`(内含 `subgraph SLICE`) | `.fd-layer.fd-dev` + `.fd-slice-loop` |
| ⑥ | final-repair 警告 | `FR` | `.fd-note-warn` |
| ⑦ | 持久化产物 贯穿全程 | `subgraph STORE` | `.fd-band.fd-storage` |

## 你可以怎么调整(举例)

- **觉得切片循环太挤**:把 `subgraph SLICE` 拆成更清晰的纵向,或把 `Retry` 分支单独拉出来
- **想让 Taizi 更突出**:把它放到流程图正中间,用箭头辐射到各阶段
- **想合并 / 拆分节点**:直接改节点文字 / 增删节点
- **想改箭头方向或回流**:改 `-->` 的目标

改完把整个 ```mermaid 代码块贴给我(或在文件里改好告诉我),我按新布局重写 about.html 的 HTML(保留当前的深/浅色双主题 + 颜色 + 字号样式)。
