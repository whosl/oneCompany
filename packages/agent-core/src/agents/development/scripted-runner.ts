import {
  ArchitectOutputSchema,
  CodingOutputSchema,
  DevopsDeliveryOutputSchema,
  PlannerOutputSchema,
  QaOutputSchema,
  ReviewOutputSchema,
  TestDesignerOutputSchema,
} from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "./definitions.js";
import type { DevAgentTask, DevFixtureProfile } from "./types.js";

function slicesForProfile(profile: DevFixtureProfile) {
  const baseTest = "pnpm vitest run src/slice.test.ts --reporter=json";
  if (profile === "two_slices") {
    return [
      {
        id: "slice-1",
        title: "Scaffold app",
        testCommand: "pnpm vitest run src/scaffold.test.ts --reporter=json",
        acceptanceChecks: ["app boots"],
      },
      {
        id: "slice-2",
        title: "Add feature",
        testCommand: "pnpm vitest run src/feature.test.ts --reporter=json",
        acceptanceChecks: ["feature works"],
      },
    ];
  }

  return [
    {
      id: "slice-1",
      title: profile === "always_fail_slice" ? "Flaky slice" : "Scaffold app",
      testCommand: baseTest,
      acceptanceChecks: ["slice passes scoped tests"],
    },
  ];
}

export function runScriptedDevAgent(agentIdAtVersion: string, task: DevAgentTask): unknown {
  const { state, profile, prd, acceptance, techPlan } = task;
  const slices = slicesForProfile(profile);

  switch (agentIdAtVersion) {
    case DEVELOPMENT_AGENT_IDS.architect:
      return ArchitectOutputSchema.parse({
        techPlan: `# Technical Plan for ${state.projectId}\n\nPRD: ${prd ?? "n/a"}\nAcceptance: ${acceptance ?? "n/a"}`,
        stack: ["typescript", "vitest", "hono"],
        architectureNotes: ["monorepo workspace", "scripted CI path"],
        risks: profile === "always_fail_slice" ? ["slice may fail authoritative checks"] : [],
      });

    case DEVELOPMENT_AGENT_IDS.testDesigner:
      return TestDesignerOutputSchema.parse({
        testSpecs: slices.map((slice) => ({
          sliceId: slice.id,
          testCommand: slice.testCommand,
          description: `Scoped test for ${slice.title}`,
        })),
      });

    case DEVELOPMENT_AGENT_IDS.planner:
      return PlannerOutputSchema.parse({
        slices,
        planningNotes: [`Planned from tech plan ${state.techPlanVersion}`],
      });

    case DEVELOPMENT_AGENT_IDS.coding:
      return CodingOutputSchema.parse({
        summary: `Implemented ${state.currentTask?.title ?? "slice"}`,
        changedFiles: ["src/index.ts"],
        testsAdded: [state.currentTask?.testCommand ?? slices[0]!.testCommand],
      });

    case DEVELOPMENT_AGENT_IDS.review:
      return ReviewOutputSchema.parse({
        approved: true,
        findings: [],
        summary: `Reviewed ${state.currentTask?.id ?? "slice"}`,
      });

    case DEVELOPMENT_AGENT_IDS.qa: {
      const failedSuites = task.testingContext?.failedSuites ?? [];
      const previewReachable = Boolean(task.testingContext?.previewUrl);
      if (failedSuites.length > 0) {
        return QaOutputSchema.parse({
          passed: false,
          notes: [
            `Fix failing suites: ${failedSuites.join(", ")}`,
            previewReachable
              ? "Preview reachable — focus on test failures"
              : "Preview unreachable — restart preview before E2E",
          ],
        });
      }
      return QaOutputSchema.parse({
        passed: true,
        notes: ["final acceptance suite passed", "preview verified"],
      });
    }

    case DEVELOPMENT_AGENT_IDS.devopsDelivery:
      return DevopsDeliveryOutputSchema.parse({
        artifacts: ["repo"],
        deploymentNotes: techPlan ? "Delivery deferred to M10" : "No deployment in M6",
      });

    default:
      throw new Error(`Unknown development agent: ${agentIdAtVersion}`);
  }
}
