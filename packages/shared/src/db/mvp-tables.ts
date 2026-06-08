/** MVP SQLite tables from spec.md §10.3 (integration tables are M12). */
export const MVP_TABLE_NAMES = [
  "projects",
  "project_status_history",
  "requirement_sessions",
  "dev_sessions",
  "requirement_scores",
  "prd_versions",
  "tech_plan_versions",
  "acceptance_criteria_versions",
  "agents",
  "agent_runs",
  "events",
  "tool_calls",
  "diffs",
  "human_gates",
  "artifacts",
  "test_results",
  "deployments",
  "change_requests",
  "commits",
] as const;

export const MVP_TABLE_COUNT = MVP_TABLE_NAMES.length;
