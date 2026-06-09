/** MVP SQLite tables from spec.md §10.3 */
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

/** Post-MVP integration tables (M12). */
export const INTEGRATION_TABLE_NAMES = [
  "integration_definitions",
  "integration_connections",
  "integration_tool_calls",
  "skill_packs",
  "skill_pack_runs",
] as const;

export const INTEGRATION_TABLE_COUNT = INTEGRATION_TABLE_NAMES.length;
