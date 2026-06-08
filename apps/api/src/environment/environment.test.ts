import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("environment API — M9", () => {
  it("GET /environment/readiness returns checks without secret values", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const response = await app.request("/environment/readiness");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        apiKeyReady: boolean;
        checks: { node: boolean };
        policies: string[];
      };
      expect(typeof body.apiKeyReady).toBe("boolean");
      expect(typeof body.checks.node).toBe("boolean");
      expect(body.policies.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toMatch(/sk-[a-zA-Z0-9]/);
    } finally {
      cleanup();
    }
  });
});
