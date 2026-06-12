type JsonRecord = Record<string, unknown>;

const GAP_SEVERITY: Record<string, string> = {
  critical: "严重",
  medium: "中等",
  low: "轻微",
};

const SLICE_STATUS: Record<string, string> = {
  pending: "待办",
  in_progress: "进行中",
  passed: "已通过",
  failed: "失败",
  skipped: "已跳过",
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim());
}

function section(title: string): string[] {
  return ["", `── ${title} ──`];
}

function bulletLines(items: string[], prefix = "·"): string[] {
  return items.map((item) => `  ${prefix} ${item}`);
}

function pushSection(lines: string[], title: string, body: string[]): void {
  if (body.length === 0) return;
  lines.push(...section(title), ...body);
}

function formatPagesAndFlows(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = asString(item.name) ?? "未命名页面";
    const purpose = asString(item.purpose);
    const actions = asStringList(item.userActions);
    rows.push(purpose ? `${name} — ${purpose}` : name);
    if (actions.length > 0) rows.push(`  操作: ${actions.join("、")}`);
  }
  return rows;
}

function formatDataObjects(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = asString(item.name) ?? "未命名对象";
    const fields = asStringList(item.fields);
    const relationships = asStringList(item.relationships);
    const parts = [name];
    if (fields.length > 0) parts.push(`字段: ${fields.join("、")}`);
    if (relationships.length > 0) parts.push(`关系: ${relationships.join("、")}`);
    rows.push(parts.join(" · "));
  }
  return rows;
}

function formatGaps(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const topic = asString(item.topic) ?? "未分类";
    const severity = GAP_SEVERITY[String(item.severity)] ?? String(item.severity ?? "");
    const question = asString(item.question);
    rows.push(`[${severity}] ${topic}${question ? `: ${question}` : ""}`);
  }
  return rows;
}

function formatQuestionRounds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const rows: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const round = value[i];
    if (!isRecord(round)) continue;
    const topic = asString(round.topic) ?? "未命名主题";
    const score = typeof round.scoreAfter === "number" ? round.scoreAfter : undefined;
    rows.push(`第 ${i + 1} 轮 · ${topic}${score !== undefined ? ` · 得分 ${score}` : ""}`);
    const questions = Array.isArray(round.questions) ? round.questions : [];
    const answers = asStringList(round.answers);
    for (let q = 0; q < questions.length; q += 1) {
      const item = questions[q];
      const question =
        typeof item === "string"
          ? item
          : isRecord(item)
            ? asString(item.question)
            : undefined;
      if (question) rows.push(`  Q${q + 1}: ${question}`);
      const answer = answers[q];
      if (answer) rows.push(`  A${q + 1}: ${answer}`);
    }
  }
  return rows;
}

function formatRequirementState(state: JsonRecord): string[] {
  const lines: string[] = [];

  const raw = asString(state.rawRequirement);
  const summary = asString(state.normalizedSummary);
  if (raw) pushSection(lines, "原始需求", [raw]);
  if (summary && summary !== raw) pushSection(lines, "需求概述", [summary]);

  const score = typeof state.completenessScore === "number" ? state.completenessScore : undefined;
  const threshold =
    typeof state.completenessThreshold === "number" ? state.completenessThreshold : undefined;
  if (score !== undefined) {
    const scoreLine =
      threshold !== undefined ? `完整度 ${score} / 目标 ${threshold}` : `完整度 ${score}`;
    pushSection(lines, "评估", [scoreLine]);
  }

  pushSection(lines, "目标用户", bulletLines(asStringList(state.targetUsers)));
  pushSection(lines, "用户目标", bulletLines(asStringList(state.userGoals)));
  pushSection(lines, "核心功能", bulletLines(asStringList(state.coreFeatures)));
  pushSection(lines, "页面与流程", bulletLines(formatPagesAndFlows(state.pagesAndFlows)));
  pushSection(lines, "数据对象", bulletLines(formatDataObjects(state.dataObjects)));
  pushSection(lines, "角色与权限", bulletLines(asStringList(state.rolesAndPermissions)));
  pushSection(lines, "外部集成", bulletLines(asStringList(state.integrations)));
  pushSection(
    lines,
    "非功能需求",
    bulletLines(asStringList(state.nonFunctionalRequirements)),
  );
  pushSection(lines, "假设", bulletLines(asStringList(state.assumptions)));
  pushSection(lines, "风险", bulletLines(asStringList(state.risks)));
  pushSection(lines, "缺口", bulletLines(formatGaps(state.gaps)));
  pushSection(lines, "问答记录", formatQuestionRounds(state.questionRounds));

  if (state.clarificationSkipped === true) {
    pushSection(lines, "澄清", ["用户已跳过澄清，采用默认假设"]);
  }

  return lines;
}

function formatSliceTask(slice: JsonRecord, index?: number): string {
  const id = asString(slice.id) ?? `slice-${index ?? "?"}`;
  const title = asString(slice.title) ?? "未命名切片";
  const status = SLICE_STATUS[String(slice.status ?? "")] ?? "";
  const prefix = status ? `${id} · ${status}` : id;
  return `${prefix} · ${title}`;
}

function formatDevState(state: JsonRecord): string[] {
  const lines: string[] = [];

  const techPlanVersion = asString(state.techPlanVersion);
  if (techPlanVersion) pushSection(lines, "技术方案", [`版本 ${techPlanVersion}`]);

  const currentTask = isRecord(state.currentTask) ? state.currentTask : undefined;
  if (currentTask) {
    pushSection(lines, "当前切片", [formatSliceTask(currentTask)]);
    const checks = asStringList(currentTask.acceptanceChecks);
    if (checks.length > 0) pushSection(lines, "验收点", bulletLines(checks));
    const testCommand = asString(currentTask.testCommand);
    if (testCommand) pushSection(lines, "测试命令", [testCommand]);
  }

  const taskQueue = Array.isArray(state.taskQueue) ? state.taskQueue : [];
  if (taskQueue.length > 0) {
    const rows = taskQueue
      .map((item, index) => (isRecord(item) ? formatSliceTask(item, index + 1) : undefined))
      .filter((row): row is string => Boolean(row));
    pushSection(lines, `切片队列 (${taskQueue.length})`, bulletLines(rows));
  }

  const attempts = typeof state.currentSliceAttempts === "number" ? state.currentSliceAttempts : 0;
  const maxAttempts =
    typeof state.maxSliceAttempts === "number" ? state.maxSliceAttempts : undefined;
  if (attempts > 0 || maxAttempts !== undefined) {
    pushSection(
      lines,
      "重试",
      [maxAttempts !== undefined ? `当前切片第 ${attempts} / ${maxAttempts} 次尝试` : `当前切片第 ${attempts} 次尝试`],
    );
  }

  const commits = Array.isArray(state.commits) ? state.commits : [];
  if (commits.length > 0) {
    const rows = commits.slice(-5).map((item) => {
      if (!isRecord(item)) return undefined;
      const hash = asString(item.hash)?.slice(0, 7) ?? "???????";
      const summary = asString(item.summary) ?? asString(item.taskId) ?? "commit";
      return `${hash} · ${summary}`;
    }).filter((row): row is string => Boolean(row));
    pushSection(lines, `最近提交 (${commits.length})`, bulletLines(rows));
  }

  pushSection(lines, "风险", bulletLines(asStringList(state.risks)));

  const previewUrl = asString(state.previewUrl);
  const deploymentUrl = asString(state.deploymentUrl);
  if (previewUrl || deploymentUrl) {
    const urls = [
      previewUrl ? `Preview: ${previewUrl}` : undefined,
      deploymentUrl ? `Deploy: ${deploymentUrl}` : undefined,
    ].filter((row): row is string => Boolean(row));
    pushSection(lines, "链接", urls);
  }

  return lines;
}

function formatLongDocument(title: string, body: string): string[] {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return [...section(title), ...normalized.split("\n")];
}

function formatTaskPayload(parsed: unknown): string {
  if (!isRecord(parsed)) return JSON.stringify(parsed, null, 2);

  const lines: string[] = [];
  const profile = asString(parsed.profile);
  if (profile) lines.push(`场景: ${profile}`);

  if (isRecord(parsed.state)) {
    if ("rawRequirement" in parsed.state) {
      lines.push(...formatRequirementState(parsed.state));
    } else if ("taskQueue" in parsed.state || "repoPath" in parsed.state) {
      lines.push(...formatDevState(parsed.state));
    } else {
      lines.push(
        ...section("状态"),
        ...JSON.stringify(parsed.state, null, 2).split("\n").map((row) => `  ${row}`),
      );
    }
  }

  const prd = asString(parsed.prd);
  const acceptance = asString(parsed.acceptance);
  const techPlan = asString(parsed.techPlan);
  if (prd) lines.push(...formatLongDocument("PRD", prd));
  if (acceptance) lines.push(...formatLongDocument("验收标准", acceptance));
  if (techPlan) lines.push(...formatLongDocument("技术方案全文", techPlan));

  if (isRecord(parsed.testingContext)) {
    const ctx = parsed.testingContext;
    const failedSuites = asStringList(ctx.failedSuites);
    if (failedSuites.length > 0) {
      pushSection(lines, "失败测试", bulletLines(failedSuites));
    }
    const previewUrl = asString(ctx.previewUrl);
    if (previewUrl) pushSection(lines, "Preview", [previewUrl]);
  }

  if (lines.length === 0) return JSON.stringify(parsed, null, 2);
  return lines.join("\n").trim();
}

function extractHumanBody(raw: string): string {
  const humanIdx = raw.indexOf("[Human]");
  if (humanIdx >= 0) return raw.slice(humanIdx + "[Human]".length).trimStart();
  return raw.split("\n\n").pop()?.trim() ?? raw.trim();
}

/** Turn raw agent.prompt human payload into readable terminal text. */
export function formatAgentTaskPrompt(raw: string): string {
  const body = extractHumanBody(raw);
  if (!body) return raw.trim();

  if (body.startsWith("{") || body.startsWith("[")) {
    try {
      return formatTaskPayload(JSON.parse(body));
    } catch {
      // fall through
    }
  }

  return body;
}
