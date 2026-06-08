import { describe, expect, it } from "vitest";
import {
  FilesListResponseSchema,
  PreviewStatusSchema,
  ReportSnapshotSchema,
  TestsResultsResponseSchema,
} from "./panel.js";

describe("panel schemas — M8", () => {
  it("parses files list response", () => {
    const parsed = FilesListResponseSchema.parse({
      scope: "all",
      files: ["src/index.ts", "artifacts/trace.zip"],
    });
    expect(parsed.files).toHaveLength(2);
  });

  it("parses tests results with slice and final partitions", () => {
    const parsed = TestsResultsResponseSchema.parse({
      slice: [{ suite: "slice:auth", status: "passed", details: null }],
      final: [{ suite: "final:vitest", status: "failed", details: "1 failed" }],
    });
    expect(parsed.slice[0]?.suite).toBe("slice:auth");
    expect(parsed.final[0]?.status).toBe("failed");
  });

  it("parses preview status without url", () => {
    const parsed = PreviewStatusSchema.parse({
      health: { reachable: false },
    });
    expect(parsed.previewUrl).toBeUndefined();
    expect(parsed.health.reachable).toBe(false);
  });

  it("parses report snapshot with empty delivery section", () => {
    const parsed = ReportSnapshotSchema.parse({
      projectStatus: "Testing",
      risks: ["QA: fix playwright"],
      sections: [
        {
          id: "delivery-report",
          title: "Delivery report",
          content: null,
          emptyReason: "Delivery report — not generated yet",
        },
      ],
    });
    expect(parsed.sections[0]?.emptyReason).toContain("not generated");
  });
});
