import { describe, expect, it } from "vitest";
import {
  EventEnvelopeSchema,
  ProjectStatusSchema,
  STATUS_TRANSITIONS,
} from "@oc/shared";

describe("@oc/api shared import smoke — M0 baseline", () => {
  it("imports schemas from @oc/shared workspace package", () => {
    expect(ProjectStatusSchema.options).toHaveLength(12);
    expect(Object.keys(STATUS_TRANSITIONS)).toHaveLength(12);
    expect(
      EventEnvelopeSchema.safeParse({
        eventId: "evt-api-smoke",
        seq: 1,
        schemaVersion: "1",
        projectId: "proj-api",
        timestamp: "2026-06-08T00:00:00.000Z",
        payload: {
          type: "project.created",
          projectId: "proj-api",
          name: "API Smoke",
        },
      }).success,
    ).toBe(true);
  });
});
