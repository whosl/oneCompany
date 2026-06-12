import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { PLUGIN_ID, resolveApiUrl } from "../shared/config.js";
import {
  ensureSidecar,
  fetchSnapshot,
  forwardOpencodeEvent,
  linkOpencodeSession,
  taiziMessage,
} from "../shared/sidecar.js";

const server: Plugin = async (input, options) => {
  const apiUrl = resolveApiUrl(
    typeof options?.apiUrl === "string" ? options.apiUrl : undefined,
  );

  try {
    await ensureSidecar(apiUrl);
    console.log(`[${PLUGIN_ID}] connected to sidecar ${apiUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${PLUGIN_ID}] sidecar not ready: ${message}`);
  }

  const directory = input.directory;

  return {
    event: async ({ event }) => {
      const sessionId = extractSessionId(event);
      if (!sessionId) return;
      try {
        await forwardOpencodeEvent({
          sessionId,
          directory,
          eventType: String((event as { type?: string }).type ?? "unknown"),
          payload: event,
        }, apiUrl);
      } catch {
        /* best-effort bridge */
      }
    },

    "chat.message": async (hookInput) => {
      try {
        await linkOpencodeSession({
          projectId: readLinkedProjectId(directory),
          sessionId: hookInput.sessionID,
          directory,
          role: "chat",
        }, apiUrl);
      } catch {
        /* mapping is optional until user opens a OneCompany project */
      }
    },

    tool: {
      onecompany_status: tool({
        description:
          "Fetch OneCompany project status snapshot (phase, gates, requirement progress) from the sidecar API.",
        args: {
          projectId: z.string().describe("OneCompany project id"),
        },
        execute: async (args) => {
          await ensureSidecar(apiUrl);
          const snapshot = await fetchSnapshot(args.projectId, apiUrl);
          return JSON.stringify({
            project: snapshot.project,
            phase: snapshot.phase,
            openGates: snapshot.openGates?.length ?? 0,
            dev: snapshot.dev,
          });
        },
      }),

      onecompany_taizi: tool({
        description:
          "Send a natural-language message to Taizi (OneCompany dispatcher). Long actions continue in the workflow; returns routing reply.",
        args: {
          projectId: z.string(),
          message: z.string(),
        },
        execute: async (args) => {
          await ensureSidecar(apiUrl);
          const result = await taiziMessage(args.projectId, args.message, apiUrl);
          return JSON.stringify(result);
        },
      }),
    },
  };
};

function extractSessionId(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as Record<string, unknown>;
  const properties = record.properties as Record<string, unknown> | undefined;
  const fromProps =
    typeof properties?.sessionID === "string"
      ? properties.sessionID
      : typeof properties?.sessionId === "string"
        ? properties.sessionId
        : undefined;
  if (fromProps) return fromProps;
  if (typeof record.sessionID === "string") return record.sessionID;
  if (typeof record.sessionId === "string") return record.sessionId;
  return undefined;
}

/** KV-less v0: stash active project id in a well-known env var file under worktree. */
function readLinkedProjectId(directory: string): string {
  return process.env.ONECOMPANY_PROJECT_ID?.trim() || "unknown";
}

const pluginModule: PluginModule & { id: string } = {
  id: PLUGIN_ID,
  server,
};

export default pluginModule;
