import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const projectStatusHistory = sqliteTable("project_status_history", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  from_status: text("from_status").notNull(),
  to_status: text("to_status").notNull(),
  trigger: text("trigger").notNull(),
  created_at: text("created_at").notNull(),
});

export const requirementSessions = sqliteTable("requirement_sessions", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  state: text("state").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const devSessions = sqliteTable("dev_sessions", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  state: text("state").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const requirementScores = sqliteTable("requirement_scores", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  score: integer("score").notNull(),
  round_index: integer("round_index").notNull(),
  created_at: text("created_at").notNull(),
});

export const prdVersions = sqliteTable("prd_versions", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  version: text("version").notNull(),
  content: text("content").notNull(),
  created_at: text("created_at").notNull(),
});

export const techPlanVersions = sqliteTable("tech_plan_versions", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  version: text("version").notNull(),
  content: text("content").notNull(),
  created_at: text("created_at").notNull(),
});

export const acceptanceCriteriaVersions = sqliteTable("acceptance_criteria_versions", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  version: text("version").notNull(),
  content: text("content").notNull(),
  created_at: text("created_at").notNull(),
});

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").notNull(),
    version: text("version").notNull(),
    definition: text("definition").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })],
);

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  agent_id: text("agent_id").notNull(),
  run_id: text("run_id").notNull(),
  status: text("status").notNull(),
  started_at: text("started_at").notNull(),
  ended_at: text("ended_at"),
});

export const events = sqliteTable(
  "events",
  {
    event_id: text("event_id").primaryKey(),
    seq: integer("seq").notNull(),
    schema_version: text("schema_version").notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    run_id: text("run_id"),
    agent_id: text("agent_id"),
    correlation_id: text("correlation_id"),
    timestamp: text("timestamp").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    uniqueIndex("events_project_seq_unique").on(table.project_id, table.seq),
    index("events_project_seq_idx").on(table.project_id, table.seq),
  ],
);

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  tool_call_id: text("tool_call_id").notNull(),
  tool_name: text("tool_name").notNull(),
  status: text("status").notNull(),
  output_ref: text("output_ref"),
  created_at: text("created_at").notNull(),
});

export const diffs = sqliteTable("diffs", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  diff_id: text("diff_id").notNull(),
  summary: text("summary").notNull(),
  path: text("path"),
  created_at: text("created_at").notNull(),
});

export const humanGates = sqliteTable("human_gates", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  gate_type: text("gate_type").notNull(),
  status: text("status").notNull(),
  options: text("options").notNull(),
  decision: text("decision"),
  created_at: text("created_at").notNull(),
  resolved_at: text("resolved_at"),
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  artifact_id: text("artifact_id").notNull(),
  path: text("path").notNull(),
  kind: text("kind").notNull(),
  created_at: text("created_at").notNull(),
});

export const testResults = sqliteTable("test_results", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  suite: text("suite").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  created_at: text("created_at").notNull(),
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  url: text("url"),
  status: text("status").notNull(),
  created_at: text("created_at").notNull(),
});

export const changeRequests = sqliteTable("change_requests", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  summary: text("summary").notNull(),
  status: text("status").notNull(),
  decision: text("decision"),
  created_at: text("created_at").notNull(),
  resolved_at: text("resolved_at"),
});

export const commits = sqliteTable("commits", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  hash: text("hash").notNull(),
  task_id: text("task_id").notNull(),
  summary: text("summary").notNull(),
  created_at: text("created_at").notNull(),
});
