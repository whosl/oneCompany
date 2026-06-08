import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import {
  deployments,
  techPlanVersions,
  type Db,
  type ProjectStatus,
  type ReportSnapshot,
} from "@oc/shared";
import { loadLatestAcceptance, loadLatestPrd } from "../development/artifacts.js";
import { loadTestResults } from "../testing/results.js";

function readRepoFile(repoPath: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const fullPath = path.join(repoPath, candidate);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
  }
  return null;
}

function readArtifactFile(artifactsPath: string, relativePath: string): string | null {
  const fullPath = path.join(artifactsPath, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, "utf8");
}

function loadLatestTechPlan(db: Db, projectId: string): string | null {
  const row = db
    .select()
    .from(techPlanVersions)
    .where(eq(techPlanVersions.project_id, projectId))
    .orderBy(desc(techPlanVersions.created_at))
    .all()[0];
  return row?.content ?? null;
}

function loadLatestDeploymentUrl(db: Db, projectId: string): string | undefined {
  const row = db
    .select()
    .from(deployments)
    .where(eq(deployments.project_id, projectId))
    .orderBy(desc(deployments.created_at))
    .all()[0];
  return row?.url ?? undefined;
}

function summarizeTests(
  rows: Array<{ suite: string; status: string }>,
): string | null {
  if (rows.length === 0) {
    return null;
  }
  const passed = rows.filter((row) => row.status === "passed").length;
  return `${passed}/${rows.length} suites passed`;
}

export function buildReportSnapshot(
  db: Db,
  projectId: string,
  input: {
    projectStatus: ProjectStatus;
    previewUrl?: string;
    deploymentUrl?: string;
    risks: string[];
    repoPath?: string;
    artifactsPath?: string;
  },
): ReportSnapshot {
  let prdContent: string | null = null;
  try {
    prdContent = loadLatestPrd(db, projectId).content;
  } catch {
    prdContent = null;
  }

  let acceptanceContent: string | null = null;
  try {
    acceptanceContent = loadLatestAcceptance(db, projectId).content;
  } catch {
    acceptanceContent = null;
  }

  const techPlanContent = loadLatestTechPlan(db, projectId);
  const runInstructions = input.repoPath
    ? readRepoFile(input.repoPath, ["RUN.md", "README.md", "docs/RUN.md"])
    : null;
  const deliveryReport = input.artifactsPath
    ? readArtifactFile(input.artifactsPath, "delivery-report.md")
    : null;

  const allTests = loadTestResults(db, projectId);
  const testSummary = summarizeTests(allTests);

  const deploymentUrl = input.deploymentUrl ?? loadLatestDeploymentUrl(db, projectId);

  return {
    projectStatus: input.projectStatus,
    previewUrl: input.previewUrl,
    deploymentUrl,
    risks: input.risks,
    sections: [
      {
        id: "prd",
        title: "PRD",
        content: prdContent,
        emptyReason: prdContent ? undefined : "PRD — not generated yet",
      },
      {
        id: "acceptance",
        title: "Acceptance cases",
        content: acceptanceContent,
        emptyReason: acceptanceContent ? undefined : "Acceptance cases — not generated yet",
      },
      {
        id: "tech-plan",
        title: "Technical plan",
        content: techPlanContent,
        emptyReason: techPlanContent ? undefined : "Technical plan — not generated yet",
      },
      {
        id: "run-instructions",
        title: "Run instructions",
        content: runInstructions,
        emptyReason: runInstructions ? undefined : "Run instructions — not generated yet",
      },
      {
        id: "delivery-report",
        title: "Delivery report",
        content: deliveryReport,
        emptyReason: deliveryReport ? undefined : "Delivery report — not generated yet",
      },
      {
        id: "test-summary",
        title: "Test summary",
        content: testSummary,
        emptyReason: testSummary ? undefined : "No test results recorded yet",
      },
      {
        id: "risks",
        title: "Risks",
        content: input.risks.length > 0 ? input.risks.join("\n") : null,
        emptyReason: input.risks.length > 0 ? undefined : "No risks recorded",
      },
      {
        id: "urls",
        title: "Preview & deployment URLs",
        content:
          input.previewUrl || deploymentUrl
            ? [
                input.previewUrl ? `Preview: ${input.previewUrl}` : null,
                deploymentUrl ? `Deployment: ${deploymentUrl}` : null,
              ]
                .filter(Boolean)
                .join("\n")
            : null,
        emptyReason:
          input.previewUrl || deploymentUrl ? undefined : "No preview or deployment URL yet",
      },
    ],
  };
}
