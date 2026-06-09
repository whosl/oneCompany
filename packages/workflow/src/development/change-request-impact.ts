import { eq } from "drizzle-orm";
import { commits, type ChangeRequestImpact, type Db } from "@oc/shared";
import { loadLatestAcceptance, loadLatestPrd } from "./artifacts.js";

const ARCHITECTURE_KEYWORDS =
  /\b(database|schema|auth|architecture|migration|api\s+design|microservice|postgres|supabase)\b/i;

export type ChangeImpactAnalysis = {
  impact: ChangeRequestImpact;
  summary: string;
  affectedCommits: string[];
  rollbackHints: string[];
};

export function analyzeChangeImpact(
  db: Db,
  projectId: string,
  summary: string,
  details?: string,
): ChangeImpactAnalysis {
  const combined = `${summary}\n${details ?? ""}`;
  let prdContent = "";
  try {
    prdContent = loadLatestPrd(db, projectId).content;
  } catch {
    prdContent = "";
  }
  let acceptanceContent = "";
  try {
    acceptanceContent = loadLatestAcceptance(db, projectId).content;
  } catch {
    acceptanceContent = "";
  }

  const commitRows = db
    .select()
    .from(commits)
    .where(eq(commits.project_id, projectId))
    .all();
  const affectedCommits = commitRows.slice(-5).map((row) => `${row.hash.slice(0, 8)} (${row.task_id})`);

  const impact: ChangeRequestImpact = ARCHITECTURE_KEYWORDS.test(combined)
    ? "architecture"
    : "queue_only";

  const rollbackHints =
    affectedCommits.length > 0
      ? affectedCommits.map((commit) => `Consider reverting commit ${commit}`)
      : ["No commits recorded yet; rollback may be limited to workspace reset"];

  return {
    impact,
    summary: [
      `Requested change: ${summary}`,
      impact === "architecture"
        ? "Impact: architecture/data model — route to Tech Plan Review"
        : "Impact: task queue only — update plan and continue Developing",
      prdContent ? `Current PRD excerpt: ${prdContent.slice(0, 200)}...` : "PRD unavailable",
      acceptanceContent
        ? `Current acceptance excerpt: ${acceptanceContent.slice(0, 200)}...`
        : "Acceptance criteria unavailable",
    ].join("\n"),
    affectedCommits,
    rollbackHints,
  };
}
