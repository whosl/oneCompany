import type { RequirementState } from "@oc/shared";

export type RequirementFixtureProfile = "vague" | "complete" | "stuck" | "improving";

/**
 * Lifecycle context for a requirement agent: a concise summary of where this
 * run sits in the clarification loop, so the agent sees "this is round N,
 * prior scores were X→Y, last questions were about Z" instead of only the raw
 * state. Populated by the requirement graph before each agent call.
 */
export type RequirementLifecycleContext = {
  /** Which agent is about to run (for conditional framing in the prompt). */
  currentAgentId: string;
  /** Total rounds executed so far (0 = first pass). */
  roundIndex: number;
  /** Completeness score history, oldest first. Empty on the first run. */
  scoreHistory: number[];
  /** Topics of prior question rounds, so the agent avoids re-asking. */
  priorTopics: string[];
};

export type RequirementAgentTask = {
  state: RequirementState;
  profile: RequirementFixtureProfile;
  /** Optional lifecycle context; injected by the requirement graph. */
  lifecycleContext?: RequirementLifecycleContext;
};
