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
  techPlanVersion?: string;
  testingContext?: {
    failedSuites: string[];
    previewUrl?: string;
    integrationArtifacts?: Array<{
      label: "baseline" | "diagnostic";
      toolName: string;
      mode: "remote" | "offline" | "pending";
      artifactPath?: string;
      summary?: string;
    }>;
    integrationNotes?: string[];
  };
};
