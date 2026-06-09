export type AcceptanceProbeMode = "automated" | "manual" | "integration";

export type AcceptanceCriterion = {
  id: string;
  criterion: string;
  mode: AcceptanceProbeMode;
  probe: string;
};

export const SECTION_18_ACCEPTANCE: AcceptanceCriterion[] = [
  {
    id: "create-project",
    criterion: "User can create a project from a simple web app requirement.",
    mode: "integration",
    probe: "apps/api/src/integration/golden-path.test.ts",
  },
  {
    id: "requirement-prd",
    criterion: "Requirement group completes analysis, scoring, questioning, and PRD generation.",
    mode: "automated",
    probe: "packages/workflow/src/requirement/graph.test.ts",
  },
  {
    id: "requirement-stuck-gate",
    criterion: "Requirement loop terminates via budget/stuck detection and surfaces a gate.",
    mode: "automated",
    probe: "packages/workflow/src/requirement/stuck-gate.test.ts",
  },
  {
    id: "requirement-confirm",
    criterion: "Human confirms requirement through option cards and custom input.",
    mode: "automated",
    probe: "apps/api/src/requirement/requirement-confirm.test.ts",
  },
  {
    id: "tech-plan-confirm",
    criterion: "Human confirms technical plan through option cards and custom input.",
    mode: "automated",
    probe: "packages/workflow/src/development/tech-plan.test.ts",
  },
  {
    id: "figma-console-baseline",
    criterion: "Console implements top nav, Stream, Swimlane, right tabs, Settings, and Project Hub.",
    mode: "manual",
    probe: "apps/web/e2e/console-baseline.spec.ts",
  },
  {
    id: "dev-slices-events",
    criterion: "Development group implements function slices and records agent events.",
    mode: "integration",
    probe: "apps/api/src/integration/golden-path.test.ts",
  },
  {
    id: "slice-retry-budget",
    criterion: "Per-slice retry budget is enforced and surfaces Slice Failure gate.",
    mode: "automated",
    probe: "packages/workflow/src/development/slice-failure-gate.test.ts",
  },
  {
    id: "tests-per-slice-final",
    criterion: "Tests are generated and run with per-slice checks plus final suite.",
    mode: "automated",
    probe: "packages/workflow/src/testing/engine.test.ts",
  },
  {
    id: "preview-playwright",
    criterion: "Generated app is locally previewable and Playwright verifies preview URL.",
    mode: "integration",
    probe: "apps/api/src/integration/golden-path.test.ts",
  },
  {
    id: "docker-run-instructions",
    criterion: "Dockerfile or Docker Compose and run instructions are generated.",
    mode: "automated",
    probe: "packages/workflow/src/delivery/docker-artifacts.test.ts",
  },
  {
    id: "delivery-report",
    criterion: "Delivery report is complete.",
    mode: "automated",
    probe: "packages/workflow/src/delivery/report-generator.test.ts",
  },
  {
    id: "high-risk-gates",
    criterion: "High-risk operations require confirmation and are logged.",
    mode: "automated",
    probe: "packages/workspace/src/risk.regression.test.ts",
  },
  {
    id: "opencode-governance",
    criterion: "Development group runs on opencode under governance with authoritative tests.",
    mode: "integration",
    probe: "apps/api/src/integration/golden-path.test.ts",
  },
  {
    id: "logs-redacted-chunked",
    criterion: "Command logs are redacted and large output is chunked.",
    mode: "automated",
    probe: "apps/api/src/workspace/logging-audit.test.ts",
  },
  {
    id: "failed-paused-reachable",
    criterion: "Failed and Paused states are reachable.",
    mode: "automated",
    probe: "apps/api/src/projects/projects-failed.test.ts;packages/workflow/src/development/slice-failure-gate.test.ts",
  },
  {
    id: "final-acceptance",
    criterion: "Final user acceptance is captured.",
    mode: "automated",
    probe: "packages/workflow/src/delivery/final-acceptance.test.ts",
  },
  {
    id: "no-high-risk-open",
    criterion: "No unresolved high-risk issue remains.",
    mode: "manual",
    probe: "handbook/acceptance/section-18-checklist.md",
  },
];

export function getSection18AcceptanceManifest(): AcceptanceCriterion[] {
  return [...SECTION_18_ACCEPTANCE];
}
