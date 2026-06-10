import path from "node:path";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { isOpencodeAvailable } from "../engine-mode.js";
import type { ModelTier } from "../router.js";
import { pickOpencodeModel } from "./opencode-model.js";
import { injectOpencodeAuth } from "./opencode-auth.js";
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
    "The repo already contains package.json, tsconfig.json, vitest.config.ts, and src/.",
    "Do not run npm/pnpm install; vitest is already available from the workspace toolchain.",
    "You MUST create and edit files under src/ using tools. Do not reply with text-only plans.",
    "Write failing tests first, implement code, run the scoped test command via shell tools, then stop.",
    "Do not claim success without producing file changes and running the scoped test command.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function assistantHasText(messages: Array<{ info: { role: string }; parts: Array<{ type: string; text?: string }> }>): boolean {
  return messages.some(
    (message) =>
      message.info.role === "assistant" &&
      message.parts.some((part) => part.type === "text" && Boolean(part.text?.trim())),
  );
}

async function hasAssistantMessage(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<boolean> {
  const response = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
  return assistantHasText(response.data ?? []);
}

async function waitForSessionCompletion(
  client: OpencodeClient,
  bridge: ReturnType<typeof createEventBridge>,
  sessionId: string,
  directory: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  const idleGraceMs = Number(process.env.OC_OPENCODE_IDLE_GRACE_MS ?? 15_000);
  const idleStreakRequired = Number(process.env.OC_OPENCODE_IDLE_STREAK ?? 2);
  let idleStreak = 0;

  while (Date.now() < deadline) {
    const hasFiles = bridge.changedFiles.size > 0;
    const idle = bridge.isIdle();
    const elapsed = Date.now() - startedAt;

    if (idle) {
      idleStreak += 1;
    } else {
      idleStreak = 0;
    }

    if (hasFiles && idleStreak >= 1) {
      return;
    }

    if (idleStreak >= idleStreakRequired && elapsed >= idleGraceMs) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (await hasAssistantMessage(client, sessionId, directory)) {
    return;
  }

  throw new Error(`opencode session completion timeout after ${timeoutMs}ms`);
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

      const directory = path.resolve(ctx.repoPath);
      const server = await startProjectServer(directory);
      const model = parseModelRef(pickOpencodeModel(slice.modelTier as ModelTier));
      let bridge: ReturnType<typeof createEventBridge> | undefined;

      try {
        const client = createOpencodeClient({ baseUrl: server.url });
        await injectOpencodeAuth(client, {
          directory,
          preferredProviderIDs: [model.providerID],
        });

        const sessionResponse = await client.session.create({
          body: { title: `slice:${slice.sliceId}` },
          query: { directory },
        });
        const session = sessionResponse.data;
        if (!session) {
          const err = sessionResponse.error as
            | { name?: string; data?: { message?: string } }
            | undefined;
          const detail =
            err?.data?.message ??
            err?.name ??
            `HTTP ${sessionResponse.response?.status ?? "unknown"}`;
          throw new Error(`opencode session.create failed: ${detail}`);
        }

        bridge = createEventBridge(client, {
          sessionId: session.id,
          directory,
          emit: (event) => ctx.emit(event),
          onPermission: async (permission) => {
            await handlePermission(client, session.id, permission, ctx.authorize, {
              directory,
              classifyShellRisk: ctx.classifyShellRisk,
              runGovernedCommand: ctx.runGovernedCommand,
            });
          },
          logBridge: ctx.formatToolOutput
            ? { formatOutput: ctx.formatToolOutput }
            : undefined,
        });

        emitPhase(ctx, "act", `prompting opencode for ${slice.sliceId}`);

        await client.session.promptAsync({
          path: { id: session.id },
          query: { directory },
          body: {
            model,
            parts: [{ type: "text", text: buildTddPrompt(slice) }],
          },
        });

        await waitForSessionCompletion(client, bridge, session.id, directory, DEFAULT_SLICE_TIMEOUT_MS);
        bridge.stop();

        const changedFiles = await collectChangedFiles(client, directory, bridge.changedFiles);
        emitPhase(ctx, "observe", `opencode idle; ${changedFiles.length} changed file(s)`);

        if (changedFiles.length === 0) {
          return {
            passed: false,
            summary: "opencode completed without file changes",
            changedFiles,
          };
        }

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
        bridge?.stop();
        await releaseProjectServer(directory);
      }
    },
  };
}

/** Default real-engine harness (governed; requires opencode CLI). */
export const OpencodeHarness = createOpencodeHarness();
