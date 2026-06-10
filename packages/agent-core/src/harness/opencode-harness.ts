import path from "node:path";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { isOpencodeAvailable } from "../engine-mode.js";
import type { ModelTier } from "../router.js";
import { pickOpencodeModel } from "./opencode-model.js";
import { injectOpencodeAuth } from "./opencode-auth.js";
import { createEventBridge } from "./event-bridge.js";
import { handlePermission } from "./permission-bridge.js";
import { registerHarnessSession, unregisterHarnessSession } from "./session-registry.js";
import { releaseProjectServer, startProjectServer } from "./opencode-server.js";
import type {
  CodingHarness,
  DevContext,
  ReviewResult,
  ReviewSpec,
  SliceResult,
  SliceSpec,
} from "./types.js";

const DEFAULT_SLICE_TIMEOUT_MS = Number(process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ?? 600_000);
const DEFAULT_REVIEW_TIMEOUT_MS = Number(process.env.OC_OPENCODE_REVIEW_TIMEOUT_MS ?? 240_000);

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

function buildReviewPrompt(review: ReviewSpec): string {
  const checks =
    review.acceptanceChecks.length > 0
      ? review.acceptanceChecks.map((check, index) => `${index + 1}. ${check}`).join("\n")
      : "";

  return [
    `You are a READ-ONLY code reviewer for slice "${review.sliceId}" (just committed).`,
    `Slice goal: ${review.goal}`,
    checks ? `Acceptance checks:\n${checks}` : "",
    review.diffSummary ? `Latest commit summary: ${review.diffSummary}` : "",
    "Inspect the repository using read / grep / glob tools ONLY.",
    "Do NOT edit, write, or create any files. Do NOT run shell commands.",
    "Review the implementation for correctness, consistency with the acceptance checks, and obvious defects.",
    "When done, reply with EXACTLY ONE JSON object and nothing else:",
    '{"approved": true|false, "findings": ["发现1", "发现2"], "summary": "一句话结论"}',
    "findings 与 summary 必须使用简体中文。无问题时 findings 为空数组。",
  ]
    .filter(Boolean)
    .join("\n\n");
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
  const response = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
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
          "opencode CLI not found. Install opencode, set OC_OPENCODE_BIN, or ensure /opt/homebrew/bin is on PATH when starting the API.",
        );
      }

      emitPhase(ctx, "plan", `opencode slice ${slice.sliceId}: ${slice.goal}`);

      const directory = path.resolve(ctx.repoPath);
      const server = await startProjectServer(directory, { projectId: ctx.projectId });
      const model = parseModelRef(pickOpencodeModel(slice.modelTier as ModelTier));
      let bridge: ReturnType<typeof createEventBridge> | undefined;
      let activeSessionId: string | undefined;

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

        activeSessionId = session.id;
        registerHarnessSession(ctx.projectId, {
          client,
          sessionId: session.id,
          directory,
        });

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
        if (activeSessionId) unregisterHarnessSession(ctx.projectId, activeSessionId);
        bridge?.stop();
        await releaseProjectServer(directory);
      }
    },

    async runReview(review: ReviewSpec, ctx: DevContext): Promise<ReviewResult> {
      if (!isOpencodeAvailable()) {
        throw new Error("opencode CLI not found for review run");
      }

      emitPhase(ctx, "plan", `审查切片 ${review.sliceId} 的代码改动`);

      const directory = path.resolve(ctx.repoPath);
      const server = await startProjectServer(directory, { projectId: ctx.projectId });
      const model = parseModelRef(pickOpencodeModel(review.modelTier as ModelTier));
      let bridge: ReturnType<typeof createEventBridge> | undefined;
      let activeSessionId: string | undefined;

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

        activeSessionId = session.id;
        registerHarnessSession(ctx.projectId, {
          client,
          sessionId: session.id,
          directory,
        });

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

        await client.session.promptAsync({
          path: { id: session.id },
          query: { directory },
          body: {
            model,
            parts: [{ type: "text", text: buildReviewPrompt(review) }],
          },
        });

        await waitForSessionCompletion(
          client,
          bridge,
          session.id,
          directory,
          DEFAULT_REVIEW_TIMEOUT_MS,
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
      } finally {
        if (activeSessionId) unregisterHarnessSession(ctx.projectId, activeSessionId);
        bridge?.stop();
        await releaseProjectServer(directory);
      }
    },
  };
}

/** Default real-engine harness (governed; requires opencode CLI). */
export const OpencodeHarness = createOpencodeHarness();
