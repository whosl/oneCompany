import { eq } from "drizzle-orm";
import { events, projectStatusHistory } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("projects API — M1", () => {
  it("POST /projects creates a project and project.created event", async () => {
    const { app, db, cleanup } = setupTestApp();
    try {
      const response = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Demo App" }),
      });

      expect(response.status).toBe(201);
      const project = (await response.json()) as { id: string; status: string };
      expect(project.status).toBe("Draft Requirement");

      const createdEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all();
      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0]?.type).toBe("project.created");
    } finally {
      cleanup();
    }
  });

  it("setStatus records history and emits project.status_changed", () => {
    const { projects, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Status Demo");
      projects.setStatus(project.id, "Asking Questions", "analysis_started");

      const [row] = db.select().from(projectStatusHistory).all();
      expect(row?.from_status).toBe("Draft Requirement");
      expect(row?.to_status).toBe("Asking Questions");

      const statusEvents = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "project.status_changed");
      expect(statusEvents).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("rejects illegal status transitions", () => {
    const { projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Illegal");
      expect(() => projects.setStatus(project.id, "Delivered", "invalid")).toThrow(
        /Illegal status transition/,
      );
    } finally {
      cleanup();
    }
  });
});
