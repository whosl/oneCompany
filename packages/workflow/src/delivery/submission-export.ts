import fs from "node:fs";
import path from "node:path";
import { listEvents, type Db } from "@oc/shared";
import { ensurePackageRunnable } from "@oc/workspace";
import { loadDevSession } from "../development/state.js";
import { loadRequirementSession } from "../requirement/state.js";

export type SubmissionExportInput = {
  projectId: string;
  projectName: string;
  repoPath: string;
  artifactsPath: string;
};

export type SubmissionExportResult = {
  packagePath: string;
  generatedAppPath: string;
  files: string[];
};

function rmAndMkdir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirFiltered(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function listRepoFiles(repoPath: string, prefix = ""): string[] {
  const out: string[] = [];
  if (!fs.existsSync(repoPath)) {
    return out;
  }
  for (const entry of fs.readdirSync(repoPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(repoPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listRepoFiles(abs, rel));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function buildToolCallLog(db: Db, projectId: string) {
  return listEvents(db, projectId)
    .filter((event) => event.payload.type.startsWith("tool_call."))
    .map((event) => ({
      seq: event.seq,
      timestamp: event.timestamp,
      type: event.payload.type,
      agentId: event.agentId,
      payload: event.payload,
    }));
}

export function exportSubmissionPackage(
  db: Db,
  input: SubmissionExportInput,
): SubmissionExportResult {
  const root = path.join(input.artifactsPath, "submission-package");
  const generatedApp = path.join(root, "generated_app");
  const logsDir = path.join(root, "logs");
  const outputsDir = path.join(root, "outputs");

  rmAndMkdir(root);
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(outputsDir, { recursive: true });

  if (fs.existsSync(input.repoPath)) {
    copyDirFiltered(input.repoPath, generatedApp);
  } else {
    fs.mkdirSync(generatedApp, { recursive: true });
  }
  ensurePackageRunnable(generatedApp);

  const toolLog = buildToolCallLog(db, input.projectId);
  fs.writeFileSync(path.join(logsDir, "tool-call-log.json"), JSON.stringify(toolLog, null, 2));

  let requirementJson: Record<string, unknown> = { projectId: input.projectId };
  let planJson: Record<string, unknown> = {};
  let testCases: unknown[] = [];

  try {
    const req = loadRequirementSession(db, input.projectId);
    requirementJson = {
      projectId: input.projectId,
      rawRequirement: req.state.rawRequirement,
      normalizedSummary: req.state.normalizedSummary,
      completenessScore: req.state.completenessScore,
      questionRounds: req.state.questionRounds,
      assumptions: req.state.assumptions,
      gaps: req.state.gaps,
      clarificationSkipped: req.state.clarificationSkipped,
    };
  } catch {
    // Requirement session may not exist for legacy projects.
  }

  try {
    const dev = loadDevSession(db, input.projectId);
    planJson = {
      techPlanVersion: dev.state.techPlanVersion,
      taskQueue: dev.state.taskQueue,
      previewUrl: dev.state.previewUrl,
      deploymentUrl: dev.state.deploymentUrl,
    };
    testCases = dev.state.taskQueue.flatMap((slice) =>
      (slice.acceptanceChecks ?? []).map((check) => ({
        sliceId: slice.id,
        title: slice.title,
        check,
        testCommand: slice.testCommand,
      })),
    );
  } catch {
    // Dev session optional during early phases.
  }

  const fileList = listRepoFiles(input.repoPath);
  fs.writeFileSync(path.join(outputsDir, "requirement.json"), JSON.stringify(requirementJson, null, 2));
  fs.writeFileSync(path.join(outputsDir, "plan.json"), JSON.stringify(planJson, null, 2));
  fs.writeFileSync(path.join(outputsDir, "file-list.json"), JSON.stringify(fileList, null, 2));
  fs.writeFileSync(path.join(outputsDir, "test-cases.json"), JSON.stringify(testCases, null, 2));

  for (const name of ["prd-latest.md", "ac-latest.md", "tp-latest.md"]) {
    const src = path.join(input.artifactsPath, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outputsDir, name));
    }
  }

  const readme = [
    `# OneCompany Submission Package — ${input.projectName}`,
    "",
    "评委一键导出包，包含：",
    "",
    "- `generated_app/` — 智能体生成的目标应用源码",
    "- `logs/tool-call-log.json` — 工具调用日志",
    "- `outputs/requirement.json` — 需求解析结果",
    "- `outputs/plan.json` — 技术方案与切片计划",
    "- `outputs/file-list.json` — 生成文件清单",
    "- `outputs/test-cases.json` — 验收用例",
    "- `outputs/prd-latest.md` / `ac-latest.md` / `tp-latest.md`（如已生成）",
    "",
    "## 验证 generated_app",
    "",
    "```bash",
    "cd generated_app",
    "npm install   # standalone; use pnpm install if pnpm-lock.yaml is present",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "# or: npm run verify",
    "```",
    "",
    `导出时间：${new Date().toISOString()}`,
  ].join("\n");
  fs.writeFileSync(path.join(root, "README.md"), readme);

  const files: string[] = [];
  const walk = (dir: string, rel = ""): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, nextRel);
      } else {
        files.push(nextRel);
      }
    }
  };
  walk(root);

  return {
    packagePath: root,
    generatedAppPath: generatedApp,
    files,
  };
}
