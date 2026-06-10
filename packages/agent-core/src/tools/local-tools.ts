import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { acceptanceCriteriaVersions, prdVersions, resolveScopedPath } from "@oc/shared";
import { z } from "zod";
import type { RequirementAgentTask } from "../agents/requirement/types.js";
import { registerTool } from "./registry.js";

const TOOL_VERSION = "1.0.0";

export const LOCAL_TOOL_IDS = {
  requirementContext: `requirement-context@${TOOL_VERSION}`,
  readArtifact: `read-artifact@${TOOL_VERSION}`,
  workspaceRead: `workspace-read@${TOOL_VERSION}`,
} as const;

export function registerLocalTools(): void {
  registerTool({
    id: "requirement-context",
    version: TOOL_VERSION,
    description:
      "Read a digest of the current requirement state (normalized summary, features, gaps, scores).",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({}),
    impl: async (_args, ctx) => {
      const task = ctx.task as RequirementAgentTask | undefined;
      if (!task?.state) {
        return { error: "No requirement state in task context" };
      }
      const state = task.state;
      return {
        normalizedSummary: state.normalizedSummary,
        completenessScore: state.completenessScore,
        gaps: state.gaps,
        coreFeatures: state.coreFeatures,
        questionRounds: state.questionRounds.length,
      };
    },
  });

  registerTool({
    id: "read-artifact",
    version: TOOL_VERSION,
    description: "Read the latest PRD or acceptance criteria artifact for the project.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({
      kind: z.enum(["prd", "acceptance"]),
    }),
    impl: async (args, ctx) => {
      const { kind } = z.object({ kind: z.enum(["prd", "acceptance"]) }).parse(args);
      const table = kind === "prd" ? prdVersions : acceptanceCriteriaVersions;
      const row = ctx.db
        .select()
        .from(table)
        .where(eq(table.project_id, ctx.projectId))
        .orderBy(desc(table.created_at))
        .all()[0];

      if (!row) {
        return { error: `${kind} not found for project ${ctx.projectId}` };
      }

      return {
        kind,
        version: row.version,
        content: row.content,
      };
    },
  });

  registerTool({
    id: "workspace-read",
    version: TOOL_VERSION,
    description: "Read a text file relative to the project workspace root (read-only).",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({
      relativePath: z.string(),
    }),
    impl: async (args, ctx) => {
      const { relativePath } = z.object({ relativePath: z.string() }).parse(args);
      if (!ctx.repoPath) {
        return { error: "Workspace path is not configured for this run" };
      }

      if (ctx.authorize) {
        const decision = await ctx.authorize({ kind: "read", path: relativePath });
        if (!decision.allow) {
          return { error: decision.reason ?? "Read not authorized" };
        }
      }

      let fullPath: string;
      try {
        fullPath = resolveScopedPath(ctx.repoPath, relativePath);
      } catch {
        return { error: "Path escapes project root" };
      }

      if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${relativePath}` };
      }

      const content = fs.readFileSync(fullPath, "utf8");
      return {
        relativePath,
        content: content.slice(0, 8000),
        truncated: content.length > 8000,
      };
    },
  });
}

let localToolsRegistered = false;

export function ensureLocalToolsRegistered(): void {
  if (localToolsRegistered) {
    return;
  }
  registerLocalTools();
  localToolsRegistered = true;
}

export function resetLocalToolsRegistrationForTests(): void {
  localToolsRegistered = false;
}
