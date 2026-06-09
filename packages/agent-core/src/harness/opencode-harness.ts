import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { isOpencodeAvailable } from "../engine-mode.js";
import { pickModel } from "../router.js";
import { createEventBridge } from "./event-bridge.js";
import { handlePermission } from "./permission-bridge.js";
import { releaseProjectServer, startProjectServer } from "./opencode-server.js";
import type { CodingHarness, DevContext, SliceResult, SliceSpec } from "./types.js";

const DEFAULT_SLICE_TIMEOUT_MS = Number(process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ?? 600_000);

function emitPhase(ctx: DevContext, phase: string, summary: string): void {
  ctx.emit({ type: `agent.${phase}`, summary });
}

function parseModelRef(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/");
  if (slash > 0) {
    return {
      providerID: model.slice(0, slash),
      modelID: model.slice(slash + 1),
    };
  }
  return { providerID: "openai", modelID: model };
}

function buildTddPrompt(slice: SliceSpec): string {
  const checks =
    slice.acceptanceChecks.length > 0
      ? slice.acceptanceChecks.map((check, index) => `${index + 1}. ${check}`).join("\n")
      : "";

  return [
    `Implement slice "${slice.sliceId}" using strict TDD.`,
    `Goal: ${slice.goal}`,
    checks ? `Acceptance checks:\n${checks}` : "",
    `Scoped test command (OneCompany runs this authoritatively after you finish): ${slice.testCommand}`,
    "Write failing tests first, then implement until the scoped tests would pass, then stop.",
    "Do not claim success without running the scoped test command via tools.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function waitForSessionIdle(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let sawBusy = false;

  while (Date.now() < deadline) {
    const response = await client.session.status({ query: { directory } });
    const status = response.data?.[sessionId];
    if (status?.type === "busy") {
      sawBusy = true;
    }
    if (sawBusy && status?.type === "idle") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`opencode session idle timeout after ${timeoutMs}ms`);
}

async function collectChangedFiles(
  client: ReturnType<typeof createOpencodeClient>,
  directory: string,
  tracked: Set<string>,
): Promise<string[]> {
  const response = await client.file.status({ query: { directory } });
  const fromStatus = (response.data ?? []).map((file) => file.path);
  return [...new Set([...tracked, ...fromStatus])];
}

export function createOpencodeHarness(): CodingHarness {
  return {
    async runSlice(slice: SliceSpec, ctx: DevContext): Promise<SliceResult> {
      if (!isOpencodeAvailable()) {
        throw new Error(
          "opencode CLI is not installed. Install opencode or set OC_USE_STUB_ENGINE=1 for tests.",
        );
      }

      emitPhase(ctx, "plan", `opencode slice ${slice.sliceId}: ${slice.goal}`);

      const server = await startProjectServer(ctx.repoPath);
      const directory = ctx.repoPath;

      try {
        const client = createOpencodeClient({ baseUrl: server.url });
        const sessionResponse = await client.session.create({
          body: { title: `slice:${slice.sliceId}` },
          query: { directory },
        });
        const session = sessionResponse.data;
        if (!session) {
          throw new Error("opencode session.create returned no session");
        }

        const bridge = createEventBridge(client, {
          sessionId: session.id,
          directory,
          emit: (event) => ctx.emit(event),
          onPermission: (permission) => {
            void handlePermission(client, session.id, permission, ctx.authorize, directory);
          },
          logBridge: ctx.formatToolOutput
            ? { formatOutput: ctx.formatToolOutput }
            : undefined,
        });

        emitPhase(ctx, "act", `prompting opencode for ${slice.sliceId}`);

        const model = parseModelRef(pickModel(slice.modelTier));

        await client.session.promptAsync({
          path: { id: session.id },
          query: { directory },
          body: {
            model,
            parts: [{ type: "text", text: buildTddPrompt(slice) }],
          },
        });

        await waitForSessionIdle(client, session.id, directory, DEFAULT_SLICE_TIMEOUT_MS);
        bridge.stop();

        const changedFiles = await collectChangedFiles(client, directory, bridge.changedFiles);
        emitPhase(ctx, "observe", `opencode idle; ${changedFiles.length} changed file(s)`);

        return {
          passed: true,
          summary: `opencode slice ${slice.sliceId}`,
          changedFiles,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitPhase(ctx, "observe", `opencode failed: ${message}`);
        return {
          passed: false,
          summary: message,
          changedFiles: [],
        };
      } finally {
        await releaseProjectServer(ctx.repoPath);
      }
    },
  };
}

/** Default real-engine harness (governed; requires opencode CLI). */
export const OpencodeHarness = createOpencodeHarness();
