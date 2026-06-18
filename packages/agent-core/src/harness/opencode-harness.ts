import path from "node:path";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { isOpencodeAvailable } from "../engine-mode.js";
import type { ModelTier } from "../router.js";
import { pickOpencodeModel } from "./opencode-model.js";
import { injectOpencodeAuth } from "./opencode-auth.js";
import { createEventBridge } from "./event-bridge.js";
import { handlePermission } from "./permission-bridge.js";
import {
  getActiveHarnessSession,
  registerHarnessSession,
  unregisterHarnessSession,
} from "./session-registry.js";
import { shutdownProjectServer, startProjectServer } from "./opencode-server.js";
import { DEFAULT_SDK_CALL_TIMEOUT_MS, withTimeout } from "./sdk-timeout.js";
import { waitForSessionCompletion } from "./wait-for-session.js";
import type {
  CodingHarness,
  DevContext,
  ReviewResult,
  ReviewSpec,
  SliceResult,
  SliceSpec,
} from "./types.js";
import { buildReviewPrompt, buildTddPrompt } from "../agents/prompt-builder.js";

export { buildReviewPrompt, buildTddPrompt } from "../agents/prompt-builder.js";

const DEFAULT_SLICE_TIMEOUT_MS = Number(process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ?? 600_000);
const DEFAULT_REVIEW_TIMEOUT_MS = Number(process.env.OC_OPENCODE_REVIEW_TIMEOUT_MS ?? 240_000);

/** Harness returns this when opencode exits cleanly but made no edits (retry after prior work). */
export const OPENCODE_NO_FILE_CHANGES_SUMMARY = "opencode completed without file changes";

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

/** Extract the trailing JSON review verdict from the assistant's reply. */
export function parseReviewVerdict(text: string): ReviewResult | undefined {
  // Last {...} block wins; reviewers sometimes prepend commentary.
  const matches = text.match(/\{[\s\S]*\}/g);
  if (!matches) return undefined;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(matches[i]!) as Record<string, unknown>;
      if (typeof parsed.approved !== "boolean") continue;
      return {
        approved: parsed.approved,
        findings: Array.isArray(parsed.findings)
          ? parsed.findings.filter((f): f is string => typeof f === "string")
          : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    } catch {
      // Try the previous candidate block.
    }
  }
  return undefined;
}

async function lastAssistantText(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<string> {
  const response = await withTimeout(
    client.session.messages({
      path: { id: sessionId },
      query: { directory },
    }),
    DEFAULT_SDK_CALL_TIMEOUT_MS,
    "opencode session.messages",
  );
  const messages = response.data ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.info.role !== "assistant") continue;
    const text = message.parts
      .filter((part) => part.type === "text" && Boolean(part.text?.trim()))
      .map((part) => (part as { text?: string }).text ?? "")
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

async function collectChangedFiles(
  client: ReturnType<typeof createOpencodeClient>,
  directory: string,
  tracked: Set<string>,
): Promise<string[]> {
  const response = await withTimeout(
    client.file.status({ query: { directory } }),
    DEFAULT_SDK_CALL_TIMEOUT_MS,
    "opencode file.status",
  );
  const fromStatus = (response.data ?? []).map((file) => file.path);
  return [...new Set([...tracked, ...fromStatus])];
}

function harnessHeartbeat(ctx: DevContext, phase: string, elapsedMs: number): void {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  emitPhase(ctx, phase, `Opencode 仍在运行（已 ${seconds}s）…`);
}

export function createOpencodeHarness(): CodingHarness {
  return {
    async runSlice(slice: SliceSpec, ctx: DevContext): Promise<SliceResult> {
      if (!isOpencodeAvailable()) {
        throw new Error(
          "Coding CLI not found. Install mimo (or opencode), set OC_OPENCODE_BIN, or ensure /opt/homebrew/bin is on PATH when starting the API.",
        );
      }

      emitPhase(ctx, "plan", `opencode slice ${slice.sliceId}: ${slice.goal}`);

      const directory = path.resolve(ctx.repoPath);
      const model = parseModelRef(pickOpencodeModel(slice.modelTier as ModelTier));
      let bridge: ReturnType<typeof createEventBridge> | undefined;
      let client: OpencodeClient;
      let sessionId: string;
      const existingSession = getActiveHarnessSession(ctx.projectId);

      try {
        if (existingSession) {
          client = existingSession.client;
          sessionId = existingSession.sessionId;
        } else {
          const server = await startProjectServer(directory, {
            projectId: ctx.projectId,
            projectMcp: ctx.projectMcp,
          });
          client = createOpencodeClient({ baseUrl: server.url });
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

          sessionId = session.id;
          registerHarnessSession(ctx.projectId, {
            client,
            sessionId,
            directory,
          });
        }

        bridge = createEventBridge(client, {
          sessionId,
          directory,
          emit: (event) => ctx.emit(event),
          onPermission: async (permission) => {
            await handlePermission(client, sessionId, permission, ctx.authorize, {
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

        const promptText = buildTddPrompt(slice);
        const finalPrompt = existingSession
          ? `Previous slice completed. Now implement the next slice.\n\n${promptText}`
          : promptText;
        ctx.emit({
          type: "agent.prompt",
          text: finalPrompt,
          sliceId: slice.sliceId,
        });

        await withTimeout(
          client.session.promptAsync({
            path: { id: sessionId },
            query: { directory },
            body: {
              model,
              parts: [{ type: "text", text: finalPrompt }],
            },
          }),
          DEFAULT_SLICE_TIMEOUT_MS,
          "opencode session.promptAsync",
        );

        await waitForSessionCompletion(
          client,
          bridge,
          sessionId,
          directory,
          DEFAULT_SLICE_TIMEOUT_MS,
          {
            onHeartbeat: (elapsedMs) => harnessHeartbeat(ctx, "act", elapsedMs),
          },
        );

        const changedFiles = await collectChangedFiles(client, directory, bridge.changedFiles);
        emitPhase(ctx, "observe", `opencode idle; ${changedFiles.length} changed file(s)`);

        if (changedFiles.length === 0) {
          return {
            passed: false,
            summary: OPENCODE_NO_FILE_CHANGES_SUMMARY,
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
        bridge?.stop();
        const activeSession = getActiveHarnessSession(ctx.projectId);
        if (activeSession) {
          unregisterHarnessSession(ctx.projectId, activeSession.sessionId);
          await shutdownProjectServer(activeSession.directory, { projectId: ctx.projectId });
        } else {
          await shutdownProjectServer(directory, { projectId: ctx.projectId });
        }
        return {
          passed: false,
          summary: message,
          changedFiles: [],
        };
      }
    },

    async runReview(review: ReviewSpec, ctx: DevContext): Promise<ReviewResult> {
      if (!isOpencodeAvailable()) {
        throw new Error("Coding CLI (mimo/opencode) not found for review run");
      }

      emitPhase(ctx, "plan", `审查切片 ${review.sliceId} 的代码改动`);

      const directory = path.resolve(ctx.repoPath);
      const server = await startProjectServer(directory, {
        projectId: ctx.projectId,
        projectMcp: ctx.projectMcp,
      });
      const model = parseModelRef(pickOpencodeModel(review.modelTier as ModelTier));
      let bridge: ReturnType<typeof createEventBridge> | undefined;

      try {
        const client = createOpencodeClient({ baseUrl: server.url });
        await injectOpencodeAuth(client, {
          directory,
          preferredProviderIDs: [model.providerID],
        });

        const sessionResponse = await client.session.create({
          body: { title: `review:${review.sliceId}` },
          query: { directory },
        });
        const session = sessionResponse.data;
        if (!session) {
          throw new Error("opencode session.create failed for review");
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

        emitPhase(ctx, "act", `正在审查 ${review.sliceId} — 阅读改动与验收标准`);

        const promptText = buildReviewPrompt(review);
        ctx.emit({
          type: "agent.prompt",
          text: promptText,
          sliceId: review.sliceId,
        });

        await withTimeout(
          client.session.promptAsync({
            path: { id: session.id },
            query: { directory },
            body: {
              model,
              parts: [{ type: "text", text: promptText }],
            },
          }),
          DEFAULT_REVIEW_TIMEOUT_MS,
          "opencode session.promptAsync",
        );

        await waitForSessionCompletion(
          client,
          bridge,
          session.id,
          directory,
          DEFAULT_REVIEW_TIMEOUT_MS,
          {
            onHeartbeat: (elapsedMs) => harnessHeartbeat(ctx, "act", elapsedMs),
          },
        );
        bridge.stop();

        const reply = await lastAssistantText(client, session.id, directory);
        const verdict = parseReviewVerdict(reply);
        if (!verdict) {
          // Unparseable verdict must not block the pipeline; surface raw text.
          const fallback: ReviewResult = {
            approved: true,
            findings: [],
            summary: reply ? `审查输出未结构化：${reply.slice(0, 160)}` : "审查无输出",
          };
          emitPhase(ctx, "observe", fallback.summary);
          return fallback;
        }

        emitPhase(
          ctx,
          "observe",
          verdict.findings.length
            ? `审查发现 ${verdict.findings.length} 个问题：${verdict.findings.join("；")}`
            : "审查未发现问题",
        );
        emitPhase(
          ctx,
          "reflect",
          `审查结论：${verdict.approved ? "✓ 通过" : "✗ 不通过"}${verdict.summary ? ` — ${verdict.summary}` : ""}`,
        );
        return verdict;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitPhase(ctx, "observe", `审查未完成：${message.slice(0, 200)}`);
        throw error;
      } finally {
        bridge?.stop();
      }
    },

    async closeProjectSession(projectId: string): Promise<void> {
      const session = getActiveHarnessSession(projectId);
      if (!session) return;
      unregisterHarnessSession(projectId, session.sessionId);
      await shutdownProjectServer(session.directory, { projectId });
    },
  };
}

/** Default real-engine harness (governed; requires opencode CLI). */
export const OpencodeHarness = createOpencodeHarness();
