import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { events, type Db } from "@oc/shared";

export class DeliveryReportStatusError extends Error {
  constructor(status: string) {
    super(
      `Delivery report can only be generated in Awaiting Acceptance or Delivered (current: ${status})`,
    );
    this.name = "DeliveryReportStatusError";
  }
}

const REPORT_ALLOWED_STATUSES = new Set(["Awaiting Acceptance", "Delivered"]);

export function assertDeliveryReportAllowed(status: string): void {
  if (!REPORT_ALLOWED_STATUSES.has(status)) {
    throw new DeliveryReportStatusError(status);
  }
}

export function scanRepoMockMarkers(repoPath: string, maxDepth = 4): string[] {
  const hits: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|md)$/i.test(entry.name)) {
        continue;
      }
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("[MOCK]")) {
          hits.push(path.relative(repoPath, fullPath));
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  if (fs.existsSync(repoPath)) {
    walk(repoPath, 0);
  }

  return hits.sort();
}

export function collectHonestyRisks(db: Db, projectId: string, repoPath: string): string[] {
  const risks = new Set<string>();

  for (const relativePath of scanRepoMockMarkers(repoPath)) {
    risks.add(`Source contains [MOCK] marker: ${relativePath}`);
  }

  const rows = db
    .select()
    .from(events)
    .where(eq(events.project_id, projectId))
    .all();

  for (const row of rows) {
    const payload = JSON.parse(row.payload) as {
      type?: string;
      keyName?: string;
      label?: string;
      field?: string;
    };
    if (payload.type === "environment.missing_key" && payload.keyName) {
      risks.add(`Missing environment key: ${payload.keyName}`);
    }
    if (payload.type === "redaction.incident" && payload.label) {
      const field = payload.field ? ` in ${payload.field}` : "";
      risks.add(`Secret redacted${field} (${payload.label})`);
    }
  }

  return [...risks];
}
