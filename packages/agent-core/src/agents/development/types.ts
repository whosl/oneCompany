import type { DevState } from "@oc/shared";

export type DevFixtureProfile =
  | "minimal"
  | "two_slices"
  | "always_fail_slice"
  | "testing_pass"
  | "testing_fail";

export type DevAgentTask = {
  state: DevState;
  profile: DevFixtureProfile;
  prd?: string;
  acceptance?: string;
  techPlan?: string;
  testingContext?: {
    failedSuites: string[];
    previewUrl?: string;
  };
};
