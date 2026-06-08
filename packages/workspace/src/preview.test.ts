import { afterEach, describe, expect, it } from "vitest";
import {
  clearPreviewRegistry,
  getPreviewHealth,
  startPreview,
  stopPreview,
} from "./preview.js";

describe("preview lifecycle", () => {
  afterEach(() => {
    clearPreviewRegistry();
  });

  it("start returns reachable URL and stop cleans up", async () => {
    const handle = await startPreview({ projectId: "proj-1" });
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await getPreviewHealth(handle.url);
    expect(health.reachable).toBe(true);
    expect(health.statusCode).toBe(200);

    await stopPreview("proj-1");
    const after = await getPreviewHealth(handle.url);
    expect(after.reachable).toBe(false);
  });

  it("reuses existing preview for same project", async () => {
    const first = await startPreview({ projectId: "proj-2" });
    const second = await startPreview({ projectId: "proj-2" });
    expect(second.url).toBe(first.url);
  });
});
