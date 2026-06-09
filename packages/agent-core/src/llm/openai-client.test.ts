import { describe, expect, it, vi } from "vitest";
import { callOpenAiChatJson } from "./openai-client.js";

const ENV_KEYS = ["OC_LLM_BASE_URL", "OC_LLM_API_KEY", "OPENAI_API_KEY", "OC_OPENAI_API_KEY"] as const;

function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
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
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

describe("openai-client", () => {
  it("supports OpenAI-compatible base URL and key", async () => {
    await withEnv(
      {
        OC_LLM_BASE_URL: "https://open.bigmodel.cn/api/paas/v4/",
        OC_LLM_API_KEY: "glm-key",
      },
      async () => {
        const fetchMock = vi.fn(async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "{\"ok\":true}" } }],
            }),
            { status: 200 },
          ),
        );
        vi.stubGlobal("fetch", fetchMock);
        try {
          const response = await callOpenAiChatJson({
            model: "glm-5.1",
            system: "Return JSON only",
            user: "ping",
          });

          expect(response).toEqual({ ok: true });
          expect(fetchMock).toHaveBeenCalledOnce();
          const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
          expect(calledUrl).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
          expect(calledInit).toMatchObject({
            headers: {
              Authorization: "Bearer glm-key",
            },
          });
        } finally {
          vi.unstubAllGlobals();
        }
      },
    );
  });
});
