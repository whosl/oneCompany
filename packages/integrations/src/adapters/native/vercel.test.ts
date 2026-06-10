import { afterEach, describe, expect, it, vi } from "vitest";
import { createVercelNativeAdapter } from "./vercel.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.VERCEL_TOKEN;
  vi.restoreAllMocks();
});

describe("vercel native adapter", () => {
  it("lists projects via Vercel REST API", async () => {
    process.env.VERCEL_TOKEN = "vercel_test_token";
    globalThis.fetch = vi.fn(async () =>
      Response.json({ projects: [{ id: "prj_1", name: "generated-app" }] }),
    ) as typeof fetch;

    const adapter = createVercelNativeAdapter();
    const result = await adapter.callTool("list_projects", {
      projectId: "p1",
      args: {},
    });

    expect(result).toEqual({
      projects: [{ id: "prj_1", name: "generated-app" }],
      untrusted: true,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.vercel.com/v9/projects?limit=20",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer vercel_test_token",
        }),
      }),
    );
  });

  it("reads deployment log lines", async () => {
    process.env.VERCEL_TOKEN = "vercel_test_token";
    globalThis.fetch = vi.fn(async () =>
      Response.json({ events: [{ text: "build complete" }] }),
    ) as typeof fetch;

    const adapter = createVercelNativeAdapter();
    const result = await adapter.callTool("read_logs", {
      projectId: "p1",
      args: { deploymentId: "dpl_1" },
    });

    expect(result).toEqual({ lines: ["build complete"], untrusted: true });
  });
});
