import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import {
  assertTransition,
  emit,
  parseProjectStatus,
  type Db,
  type EventEnvelope,
  type ProjectStatus,
} from "@oc/shared";
import { projectStatusHistory, projects } from "@oc/shared";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPausedFrom(db: Db, projectId: string): ProjectStatus | undefined {
  const entries = db
    .select({
      fromStatus: projectStatusHistory.from_status,
      toStatus: projectStatusHistory.to_status,
    })
    .from(projectStatusHistory)
    .where(eq(projectStatusHistory.project_id, projectId))
    .orderBy(desc(projectStatusHistory.created_at))
    .all();

  const latestPause = entries.find((entry) => entry.toStatus === "Paused");
  return latestPause ? parseProjectStatus(latestPause.fromStatus) : undefined;
}

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export function createProjectService(db: Db, onEvent: (envelope: EventEnvelope) => void) {
  return {
    createProject(name: string): ProjectRecord {
      const id = randomUUID();
      const slug = `${slugify(name) || "project"}-${id.slice(0, 8)}`;
      const now = new Date().toISOString();

      db.insert(projects)
        .values({
          id,
          name,
          slug,
          status: "Draft Requirement",
          created_at: now,
          updated_at: now,
        })
        .run();

      const envelope = emit(db, {
        projectId: id,
        payload: { type: "project.created", projectId: id, name },
      });
      onEvent(envelope);

      return {
        id,
        name,
        slug,
        status: "Draft Requirement",
        createdAt: now,
        updatedAt: now,
      };
    },

    getProject(projectId: string): ProjectRecord | null {
      const [row] = db.select().from(projects).where(eq(projects.id, projectId)).limit(1).all();
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: parseProjectStatus(row.status),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    setStatus(projectId: string, nextStatus: ProjectStatus, trigger: string): ProjectRecord {
      const project = this.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const pausedFrom = project.status === "Paused" ? getPausedFrom(db, projectId) : undefined;
      assertTransition(project.status, nextStatus, { pausedFrom });

      const now = new Date().toISOString();
      db.update(projects)
        .set({ status: nextStatus, updated_at: now })
        .where(eq(projects.id, projectId))
        .run();

      db.insert(projectStatusHistory)
        .values({
          id: randomUUID(),
          project_id: projectId,
          from_status: project.status,
          to_status: nextStatus,
          trigger,
          created_at: now,
        })
        .run();

      const envelope = emit(db, {
        projectId,
        payload: { type: "project.status_changed", projectId, status: nextStatus },
      });
      onEvent(envelope);

      return {
        ...project,
        status: nextStatus,
        updatedAt: now,
      };
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
