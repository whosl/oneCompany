import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("integrations API — M12", () => {
  it("lists integration definitions", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const response = await app.request("/integrations");
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        integrations: Array<{ id: string }>;
        gateway?: { adapterMode: string };
      };
      expect(body.integrations.map((row) => row.id).sort()).toEqual([
        "figma",
        "github",
        "playwright",
        "supabase",
        "vercel",
      ]);
      const gatewayBody = body as {
        gateway?: { adapterMode: string; gateMode: string; skillPacksRoot: string };
      };
      expect(gatewayBody.gateway?.adapterMode).toBe("mock");
      expect(gatewayBody.gateway?.gateMode).toBe("sync");
      expect(gatewayBody.gateway?.skillPacksRoot).toContain("skill-packs");
    } finally {
      cleanup();
    }
  });

  it("enables and calls a low-risk connector for a project", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Integrations API");
      const enable = await app.request(`/projects/${project.id}/integrations/github/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["repo:read"] }),
      });
      expect(enable.status).toBe(200);

      const status = await app.request(`/projects/${project.id}/integrations`);
      const statusBody = (await status.json()) as {
        integrations: Array<{ integrationId: string; status: string }>;
      };
      const github = statusBody.integrations.find((row) => row.integrationId === "github");
      expect(github?.status).toBe("connected");

      await app.request(`/projects/${project.id}/integrations/figma/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["design:read"] }),
      });

      const call = await app.request(`/projects/${project.id}/integrations/figma/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: "get_design_context" }),
      });
      expect(call.status).toBe(200);
    } finally {
      cleanup();
    }
  });

  it("stores integration metadata on async high-risk gates", async () => {
    const previousGateMode = process.env.OC_INTEGRATION_GATE_MODE;
    process.env.OC_INTEGRATION_GATE_MODE = "async";
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Async Integration Gate");
      await app.request(`/projects/${project.id}/integrations/vercel/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["deploy:preview"] }),
      });

      const call = await app.request(`/projects/${project.id}/integrations/vercel/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "create_preview_deploy",
          args: { projectId: "prj_demo", name: "preview" },
        }),
      });
      expect(call.status).toBe(200);
      const body = (await call.json()) as { mode: string; gateId?: string };
      expect(body.mode).toBe("pending");
      expect(body.gateId).toBeTruthy();

      const gates = await app.request(`/projects/${project.id}/gates`);
      const gatesBody = (await gates.json()) as {
        gates: Array<{
          id: string;
          metadata?: { integrationId?: string; toolName?: string };
        }>;
      };
      const gate = gatesBody.gates.find((row) => row.id === body.gateId);
      expect(gate?.metadata).toMatchObject({
        integrationId: "vercel",
        toolName: "create_preview_deploy",
      });
    } finally {
      if (previousGateMode === undefined) {
        delete process.env.OC_INTEGRATION_GATE_MODE;
      } else {
        process.env.OC_INTEGRATION_GATE_MODE = previousGateMode;
      }
      cleanup();
    }
  });

  it("routes opencode gateway tool names through caller=opencode", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Opencode Gateway");
      await app.request(`/projects/${project.id}/integrations/figma/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["read"] }),
      });

      const call = await app.request(`/projects/${project.id}/integrations/opencode/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "oc_figma__get_design_context",
          args: { fileKey: "demo" },
        }),
      });
      expect(call.status).toBe(200);
      const body = (await call.json()) as { mode: string };
      expect(body.mode).toBe("remote");
    } finally {
      cleanup();
    }
  });
});
