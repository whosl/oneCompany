import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import {
  artifacts,
  emit,
  redact,
  techPlanVersions,
  type Db,
  type DeliveryReportSection,
  type EventEnvelope,
} from "@oc/shared";
import { loadLatestAcceptance, loadLatestPrd } from "../development/artifacts.js";
import { loadTestResults } from "../testing/results.js";
import { collectProjectRisks } from "./collect-risks.js";
import { assertDeliveryReportAllowed, collectHonestyRisks } from "./report-honesty.js";
import { buildIntegrationReportNotes } from "./report-integrations.js";
import {
  DELIVERY_REPORT_SECTION_IDS,
  renderDeliveryReportMarkdown,
  sectionTitle,
} from "./report-sections.js";

export type DeliveryReportDeps = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
};

export type GenerateDeliveryReportInput = {
  projectId: string;
  repoPath: string;
  artifactsPath: string;
  previewUrl?: string;
  deploymentUrl?: string;
  stateRisks?: string[];
  taskTitles?: string[];
  projectStatus?: string;
};

function readRepoFile(repoPath: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const fullPath = path.join(repoPath, candidate);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
  }
  return null;
}

function listRepoStructure(repoPath: string, maxDepth = 2): string {
  const lines: string[] = [];

  function walk(dir: string, depth: number, prefix: string): void {
    if (depth > maxDepth) {
      return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 40);
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      lines.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), depth + 1, `${prefix}  `);
      }
    }
  }

  if (fs.existsSync(repoPath)) {
    walk(repoPath, 0, "");
  }
  return lines.length > 0 ? lines.join("\n") : "Repository structure unavailable";
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

function summarizeTests(rows: Array<{ suite: string; status: string; details?: string | null }>): string {
  if (rows.length === 0) {
    return "No automated test results recorded.";
  }
  return rows
    .map((row) => `- ${row.suite}: ${row.status}${row.details ? ` (${row.details})` : ""}`)
    .join("\n");
}

export function buildDeliveryReportSections(
  deps: DeliveryReportDeps,
  input: GenerateDeliveryReportInput,
): DeliveryReportSection[] {
  let prdContent = "Not available";
  try {
    prdContent = loadLatestPrd(deps.db, input.projectId).content;
  } catch {
    // keep default
  }

  let acceptanceContent = "";
  try {
    acceptanceContent = loadLatestAcceptance(deps.db, input.projectId).content;
  } catch {
    acceptanceContent = "";
  }

  const techPlanContent = loadLatestTechPlan(deps.db, input.projectId);
  const runInstructions =
    readRepoFile(input.repoPath, ["RUN.md", "README.md", "docs/RUN.md"]) ??
    "See repository README for setup. Run `pnpm install` then `pnpm dev` for local preview.";
  const testRows = loadTestResults(deps.db, input.projectId);
  const risks = [
    ...collectProjectRisks(deps.db, input.projectId, input.stateRisks ?? []),
    ...collectHonestyRisks(deps.db, input.projectId, input.repoPath),
    ...buildIntegrationReportNotes(deps.db, input.projectId),
  ];
  const deploymentUrl = input.deploymentUrl ?? input.previewUrl ?? "No deployment URL (preview only)";
  const features =
    input.taskTitles && input.taskTitles.length > 0
      ? input.taskTitles.map((title) => `- ${title}`).join("\n")
      : acceptanceContent
        ? acceptanceContent
            .split("\n")
            .filter((line) => line.trim().startsWith("-"))
            .join("\n")
        : "- Features derived from PRD and acceptance criteria";

  const stackLines = techPlanContent
    ? techPlanContent
        .split("\n")
        .filter((line) => /stack|typescript|next|react|sqlite|vitest/i.test(line))
        .slice(0, 12)
        .join("\n")
    : "TypeScript, Next.js/React, SQLite, Vitest, Playwright (per platform defaults)";

  const sections: DeliveryReportSection[] = DELIVERY_REPORT_SECTION_IDS.map((id) => {
    switch (id) {
      case "requirement-summary":
        return { id, title: sectionTitle(id), content: redact(prdContent).text };
      case "confirmed-tech-stack":
        return { id, title: sectionTitle(id), content: redact(stackLines).text };
      case "feature-list":
        return { id, title: sectionTitle(id), content: redact(features).text };
      case "directory-structure":
        return {
          id,
          title: sectionTitle(id),
          content: redact(listRepoStructure(input.repoPath)).text,
        };
      case "run-instructions":
        return { id, title: sectionTitle(id), content: redact(runInstructions).text };
      case "test-results":
        return { id, title: sectionTitle(id), content: summarizeTests(testRows) };
      case "deployment-url":
        return { id, title: sectionTitle(id), content: deploymentUrl };
      case "risks-and-limitations":
        return {
          id,
          title: sectionTitle(id),
          content:
            risks.length > 0
              ? risks.map((risk) => `- ${risk}`).join("\n")
              : "- No additional risks recorded",
        };
      case "follow-up-recommendations": {
        const integrationNotes = buildIntegrationReportNotes(deps.db, input.projectId);
        return {
          id,
          title: sectionTitle(id),
          content: [
            "- Review any [MOCK] data placeholders and supply production API keys where needed.",
            "- Run full acceptance suite before production traffic.",
            "- Configure Cloudflare Tunnel or hosting provider for sustained public access.",
            ...integrationNotes.map((note) => `- ${note}`),
          ].join("\n"),
        };
      }
      default:
        return { id, title: sectionTitle(id), content: "N/A" };
    }
  });

  return sections;
}

export function generateDeliveryReport(
  deps: DeliveryReportDeps,
  input: GenerateDeliveryReportInput,
): { relativePath: string; content: string } {
  if (input.projectStatus) {
    assertDeliveryReportAllowed(input.projectStatus);
  }

  const sections = buildDeliveryReportSections(deps, input);
  const content = renderDeliveryReportMarkdown(sections);
  const relativePath = "delivery-report.md";

  fs.mkdirSync(input.artifactsPath, { recursive: true });
  const fullPath = path.join(input.artifactsPath, relativePath);
  fs.writeFileSync(fullPath, content, "utf8");

  const artifactId = randomUUID();
  const now = new Date().toISOString();
  deps.db
    .insert(artifacts)
    .values({
      id: randomUUID(),
      project_id: input.projectId,
      artifact_id: artifactId,
      path: `artifacts/${relativePath}`,
      kind: "delivery-report",
      created_at: now,
    })
    .run();

  const envelope = emit(deps.db, {
    projectId: input.projectId,
    payload: {
      type: "artifact.created",
      projectId: input.projectId,
      artifactId,
      path: `artifacts/${relativePath}`,
    },
  });
  deps.onEvent?.(envelope);

  const reportEnvelope = emit(deps.db, {
    projectId: input.projectId,
    payload: {
      type: "delivery.report_generated",
      projectId: input.projectId,
      artifactPath: `artifacts/${relativePath}`,
    },
  });
  deps.onEvent?.(reportEnvelope);

  return { relativePath, content };
}
