import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "Draft Requirement",
  "Asking Questions",
  "PRD Ready",
  "Tech Plan Review",
  "Developing",
  "Change Review",
  "Testing",
  "Deploying",
  "Awaiting Acceptance",
  "Delivered",
  "Failed",
  "Paused",
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** Allowed next statuses per §3.1 transition table. Paused/Failed use runtime rules. */
export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  "Draft Requirement": ["Asking Questions", "PRD Ready", "Paused", "Failed"],
  "Asking Questions": ["Asking Questions", "PRD Ready", "Failed", "Paused"],
  "PRD Ready": ["Asking Questions", "Tech Plan Review", "Paused", "Failed"],
  "Tech Plan Review": ["Tech Plan Review", "Developing", "Paused", "Failed"],
  Developing: ["Developing", "Testing", "Tech Plan Review", "Failed", "Change Review", "Paused"],
  "Change Review": ["Developing", "Tech Plan Review", "Paused", "Failed"],
  Testing: ["Developing", "Deploying", "Awaiting Acceptance", "Paused", "Failed"],
  Deploying: ["Awaiting Acceptance", "Paused", "Failed"],
  "Awaiting Acceptance": ["Developing", "Delivered", "Paused", "Failed"],
  Delivered: [],
  Failed: [],
  Paused: [],
};

export const DEFAULT_COMPLETENESS_THRESHOLD = 85;
export const DEFAULT_MAX_QUESTION_ROUNDS = 6;
/** Minimum cumulative clarification questions before PRD (real engine; waived on skip). */
export const DEFAULT_MIN_TOTAL_QUESTIONS = 6;
export const DEFAULT_MAX_SLICE_ATTEMPTS = 4;
