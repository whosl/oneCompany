import type { RequirementState } from "@oc/shared";

export type RequirementFixtureProfile = "vague" | "complete" | "stuck" | "improving";

export type RequirementAgentTask = {
  state: RequirementState;
  profile: RequirementFixtureProfile;
};
