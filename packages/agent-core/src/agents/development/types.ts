import type { DevState } from "@oc/shared";

export type DevFixtureProfile = "minimal" | "two_slices" | "always_fail_slice";

export type DevAgentTask = {
  state: DevState;
  profile: DevFixtureProfile;
  prd?: string;
  acceptance?: string;
  techPlan?: string;
};
