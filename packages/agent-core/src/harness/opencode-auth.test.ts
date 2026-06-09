import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultOpencodeModelRef,
  injectOpencodeAuth,
  readLocalOpencodeAuth,
} from "./opencode-auth.js";

const KEYS_TO_RESET = [
  "OC_MODEL_CHEAP",
  "OC_MODEL_STANDARD",
  "OC_MODEL_STRONG",
  "OC_OPENCODE_PROVIDER",
  "OC_OPENCODE_API_KEY",
  "OC_OPENCODE_ZHIPU_API_KEY",
  "OC_OPENCODE_ZAI_API_KEY",
  "ZHIPU_API_KEY",
  "ZAI_API_KEY",
  "OPENAI_API_KEY",
  "OC_OPENAI_API_KEY",
  "OC_LLM_API_KEY",
  "OC_OPENCODE_INTEGRATION",
] as const;

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of KEYS_TO_RESET) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return run().finally(() => {
    for (const key of KEYS_TO_RESET) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

describe("opencode-auth", () => {
  it("injects provider key inferred from OC_MODEL_*", async () => {
    await withEnv(
      {
        OC_MODEL_STRONG: "zhipuai-coding-plan/glm-5.1",
        ZHIPU_API_KEY: "zhipu-secret",
      },
      async () => {
        const list = vi.fn(async () => ({
          data: {
            all: [{ id: "zhipuai-coding-plan" }, { id: "openai" }],
          },
        }));
        const set = vi.fn(async () => ({ data: true }));
        const client = {
          provider: { list },
          auth: { set },
        };

        const injected = await injectOpencodeAuth(client as never, { directory: "/tmp/repo" });

        expect(injected).toContain("zhipuai-coding-plan");
        expect(set).toHaveBeenCalledWith({
          path: { id: "zhipuai-coding-plan" },
          query: { directory: "/tmp/repo" },
          body: { type: "api", key: "zhipu-secret" },
        });
      },
    );
  });

  it("uses OC_OPENCODE_PROVIDER + OC_OPENCODE_API_KEY", async () => {
    await withEnv(
      {
        OC_OPENCODE_PROVIDER: "zai",
        OC_OPENCODE_API_KEY: "zai-secret",
      },
      async () => {
        const set = vi.fn(async () => ({ data: true }));
        const client = {
          provider: {
            list: vi.fn(async () => ({
              data: {
                all: [{ id: "zai" }, { id: "openai" }],
              },
            })),
          },
          auth: { set },
        };

        const injected = await injectOpencodeAuth(client as never);
        expect(injected).toEqual(["zai"]);
        expect(set).toHaveBeenCalledOnce();
      },
    );
  });

  it("reads local auth and prefers zhipuai-coding-plan default model", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-auth-test-"));
    const authPath = path.join(tempDir, "auth.json");
    fs.writeFileSync(
      authPath,
      JSON.stringify({
        "zhipuai-coding-plan": { type: "api", key: "local-zhipu-key" },
        "zai-coding-plan": { type: "api", key: "local-zai-key" },
      }),
    );

    expect(readLocalOpencodeAuth(authPath)["zhipuai-coding-plan"]?.key).toBe("local-zhipu-key");
    expect(getDefaultOpencodeModelRef(authPath)).toBe("zhipuai-coding-plan/glm-5.1");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
