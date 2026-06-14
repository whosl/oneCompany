/** Lifecycle stepper (7 steps) ported from apps/tui/src/catalog.ts. */

export type LifecycleStep = {
  id: string;
  label: string;
  statuses: string[];
};

export const LIFECYCLE_STEPS: LifecycleStep[] = [
  { id: "requirement", label: "Require", statuses: ["Draft Requirement", "Asking Questions"] },
  { id: "prd", label: "PRD", statuses: ["PRD Ready"] },
  { id: "tech-plan", label: "Plan", statuses: ["Tech Plan Review"] },
  { id: "development", label: "Develop", statuses: ["Developing", "Change Review"] },
  { id: "testing", label: "Test", statuses: ["Testing"] },
  { id: "deploy", label: "Deploy", statuses: ["Deploying"] },
  { id: "delivery", label: "Deliver", statuses: ["Awaiting Acceptance", "Delivered"] },
];

export function lifecycleIndex(status: string): number {
  const index = LIFECYCLE_STEPS.findIndex((step) => step.statuses.includes(status));
  return index >= 0 ? index : -1;
}
