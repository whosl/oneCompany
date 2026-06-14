"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClient } from "../lib/api/client";
import { startEventStream } from "../lib/api/sse";
import { loadTheme } from "./useTheme";
import {
  applyEnvelope,
  createConsoleState,
  hydrateSnapshot,
  markTaiziActive,
  pushNotice,
  pushTaiziReply,
  pushUserMessage,
  refreshComposer,
} from "../store/reducer";
import type { ConsoleState } from "../store/types";
import type {
  ConsoleSnapshot,
  EventEnvelope,
  TaiziDispatchResult,
} from "../lib/api/types";

export type ConsoleActions = {
  /** Dispatch a contextual action by id (mirrors TUI dispatchAction). */
  dispatchAction: (id: string) => void;
  /** Send free text to Taizi (universal entry). */
  sendToTaizi: (message: string) => Promise<TaiziDispatchResult | undefined>;
  /** Resolve the open gate with a decision (and optional custom text). */
  resolveGate: (gateId: string, decision: string, customText?: string) => Promise<void>;
  /** Submit clarification answers. */
  submitAnswers: (answers: string[]) => Promise<void>;
  /** Skip remaining clarification. */
  skipClarification: () => Promise<void>;
  /** Start the requirement pipeline. */
  startRequirement: (requirement: string) => Promise<void>;
  /** Open a file/artifact in the viewer overlay. */
  openFile: (path: string) => Promise<void>;
  /** Export submission package. */
  exportSubmission: () => Promise<void>;
  /** Refresh snapshot manually. */
  refresh: () => Promise<void>;
  /** Toggle theme. */
  toggleTheme: () => void;
  /** Toggle YOLO mode. */
  toggleYolo: () => void;
};

/**
 * Console state hook — the bridge between the mutable reducer store and React.
 *
 * The ConsoleState lives in a ref (mirroring the TUI's single in-memory store);
 * the reducer mutates it in place. A 16ms coalesced markDirty triggers
 * re-renders (mirroring the TUI's renderQueued batcher). SSE events flow into
 * applyEnvelope; actions mutate state and call the API.
 */
export function useConsoleState(projectId: string): {
  state: ConsoleState;
  actions: ConsoleActions;
  snapshot: ConsoleSnapshot | undefined;
} {
  const api = useMemo(() => new ApiClient("/api"), []);
  const ref = useRef<ConsoleState>(createConsoleState(projectId, loadTheme()));
  const [, setTick] = useState(0);
  const renderQueued = useRef(false);

  const markDirty = useCallback(() => {
    if (renderQueued.current) return;
    renderQueued.current = true;
    setTimeout(() => {
      renderQueued.current = false;
      setTick((t) => (t + 1) % 1_000_000);
    }, 16);
  }, []);

  const refresh = useCallback(async () => {
    ref.current.busy.add("refresh");
    markDirty();
    try {
      const snapshot = await api.snapshot(projectId);
      hydrateSnapshot(ref.current, snapshot);
    } catch (err) {
      pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
    } finally {
      ref.current.busy.delete("refresh");
      markDirty();
    }
  }, [api, projectId, markDirty]);

  // Initial load + SSE subscription.
  useEffect(() => {
    let sse: ReturnType<typeof startEventStream> | undefined;
    let mounted = true;

    const init = async () => {
      try {
        const snapshot = await api.snapshot(projectId);
        if (!mounted) return;
        hydrateSnapshot(ref.current, snapshot);
        ref.current.repoFiles = await api.listFiles(projectId, "repo").catch(() => []);
        markDirty();
        // Subscribe to live events from the last seen seq.
        sse = startEventStream(
          "/api",
          projectId,
          ref.current.lastSeq,
          (envelope: EventEnvelope) => {
            applyEnvelope(ref.current, envelope);
            markDirty();
          },
          (connected) => {
            ref.current.sseConnected = connected;
            markDirty();
          },
        );
      } catch (err) {
        pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
        markDirty();
      }
    };
    void init();

    // 100ms heartbeat keeps the spinner / elapsed timers smooth (mirrors TUI tick).
    const tick = setInterval(markDirty, 100);

    return () => {
      mounted = false;
      sse?.stop();
      clearInterval(tick);
    };
  }, [api, projectId, markDirty]);

  const sendToTaizi = useCallback(
    async (message: string): Promise<TaiziDispatchResult | undefined> => {
      const trimmed = message.trim();
      if (!trimmed) return undefined;
      // Optimistic local echo (the matching taizi.routed event is deduped).
      pushUserMessage(ref.current, trimmed);
      ref.current.localUserEchoes.add(trimmed);
      markTaiziActive(ref.current);
      markDirty();
      try {
        const result = await api.taiziMessage(projectId, trimmed);
        if (!result.reply) {
          pushTaiziReply(ref.current, result.reply || "已收到，处理中…", result.action);
        } else {
          pushTaiziReply(ref.current, result.reply, result.action);
        }
        markDirty();
        return result;
      } catch (err) {
        pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
        markDirty();
        return undefined;
      }
    },
    [api, projectId, markDirty],
  );

  const resolveGate = useCallback(
    async (gateId: string, decision: string, customText?: string) => {
      ref.current.busy.add(`gate:${gateId}`);
      ref.current.dismissedGateIds.add(gateId);
      if (ref.current.snapshot) {
        ref.current.snapshot.openGates = ref.current.snapshot.openGates.filter(
          (g) => g.id !== gateId,
        );
      }
      refreshComposer(ref.current);
      markDirty();
      try {
        await api.resolveGate(gateId, decision, customText);
      } catch (err) {
        pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
      } finally {
        ref.current.busy.delete(`gate:${gateId}`);
        markDirty();
      }
    },
    [api, markDirty],
  );

  const submitAnswers = useCallback(
    async (answers: string[]) => {
      ref.current.busy.add("answers");
      markDirty();
      try {
        const result = await api.submitAnswers(projectId, answers);
        ref.current.answeredQuestionsKey = undefined;
        if (result.phase === "awaiting_gate" && result.gateId) {
          ref.current.pendingHint = "答案已提交 — 等待 PRD 确认…";
        } else {
          ref.current.pendingHint = "答案已提交 — Agent 正在分析…";
        }
        refreshComposer(ref.current);
      } catch (err) {
        pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
      } finally {
        ref.current.busy.delete("answers");
        markDirty();
      }
    },
    [api, projectId, markDirty],
  );

  const skipClarification = useCallback(async () => {
    ref.current.busy.add("skip");
    markDirty();
    try {
      await api.skipClarification(projectId);
      ref.current.pendingHint = "已跳过澄清 — 采用默认假设生成 PRD…";
      refreshComposer(ref.current);
    } catch (err) {
      pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
    } finally {
      ref.current.busy.delete("skip");
      markDirty();
    }
  }, [api, projectId, markDirty]);

  const startRequirement = useCallback(
    async (requirement: string) => {
      ref.current.busy.add("requirement");
      ref.current.pendingHint = "需求已提交 — 需求录入 Agent 正在分析…";
      pushUserMessage(ref.current, requirement);
      refreshComposer(ref.current);
      markDirty();
      try {
        await api.startRequirement(projectId, requirement);
      } catch (err) {
        pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
      } finally {
        ref.current.busy.delete("requirement");
        markDirty();
      }
    },
    [api, projectId, markDirty],
  );

  const openFile = useCallback(
    async (path: string) => {
      ref.current.viewer = { title: path, lines: [], scroll: 0, loading: true };
      markDirty();
      try {
        const content = await api.readFile(projectId, path);
        ref.current.viewer = {
          title: path,
          lines: content.binary ? ["（二进制文件，无法在浏览器渲染）"] : content.content.split("\n"),
          scroll: 0,
          loading: false,
        };
      } catch (err) {
        ref.current.viewer = {
          title: path,
          lines: [
            `读取失败：${err instanceof Error ? err.message : String(err)}`,
          ],
          scroll: 0,
          loading: false,
        };
      }
      markDirty();
    },
    [api, projectId, markDirty],
  );

  const exportSubmission = useCallback(async () => {
    ref.current.busy.add("export");
    markDirty();
    try {
      await api.exportSubmission(projectId);
      pushNotice(ref.current, "info", "导出包已生成");
    } catch (err) {
      pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
    } finally {
      ref.current.busy.delete("export");
      markDirty();
    }
  }, [api, projectId, markDirty]);

  const toggleTheme = useCallback(() => {
    ref.current.theme = ref.current.theme === "dark" ? "light" : "dark";
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("theme-dark", "theme-light");
      document.documentElement.classList.add(`theme-${ref.current.theme}`);
      try {
        localStorage.setItem("onecompany-web-theme", ref.current.theme);
      } catch {
        /* ignore */
      }
    }
    markDirty();
  }, [markDirty]);

  const toggleYolo = useCallback(() => {
    ref.current.yoloMode = !ref.current.yoloMode;
    markDirty();
  }, [markDirty]);

  const dispatchAction = useCallback(
    async (id: string) => {
      switch (id) {
        case "start_dev":
          ref.current.busy.add("dev");
          ref.current.pendingHint = "正在启动开发…";
          markDirty();
          try {
            await api.startDevelopment(projectId);
          } catch (err) {
            pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
          } finally {
            ref.current.busy.delete("dev");
            markDirty();
          }
          break;
        case "start_testing":
          ref.current.busy.add("test");
          ref.current.pendingHint = "正在运行测试…";
          markDirty();
          try {
            await api.startTesting(projectId);
          } catch (err) {
            pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
          } finally {
            ref.current.busy.delete("test");
            markDirty();
          }
          break;
        case "pause_resume": {
          const status = ref.current.snapshot?.project.status;
          if (status === "Paused") {
            try {
              await api.resumeProject(projectId);
            } catch (err) {
              pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
            }
          } else if (status) {
            try {
              await api.pauseProject(projectId);
            } catch (err) {
              pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
            }
          }
          markDirty();
          break;
        }
        case "refresh":
          await refresh();
          break;
        case "toggle_theme":
          toggleTheme();
          break;
        case "toggle_yolo":
          toggleYolo();
          break;
        case "skip_clarification":
          await skipClarification();
          break;
        case "submit_answers":
          await submitAnswers(ref.current.composer.draftAnswers);
          break;
        case "delivery_report":
          try {
            await api.generateDelivery(projectId);
          } catch (err) {
            pushNotice(ref.current, "error", err instanceof Error ? err.message : String(err));
          }
          markDirty();
          break;
        default:
          break;
      }
    },
    [api, projectId, refresh, toggleTheme, toggleYolo, skipClarification, submitAnswers, markDirty],
  );

  const actions = useMemo<ConsoleActions>(
    () => ({
      dispatchAction,
      sendToTaizi,
      resolveGate,
      submitAnswers,
      skipClarification,
      startRequirement,
      exportSubmission,
      openFile,
      refresh,
      toggleTheme,
      toggleYolo,
    }),
    [
      dispatchAction,
      sendToTaizi,
      resolveGate,
      submitAnswers,
      skipClarification,
      startRequirement,
      exportSubmission,
      openFile,
      refresh,
      toggleTheme,
      toggleYolo,
    ],
  );

  return { state: ref.current, actions, snapshot: ref.current.snapshot };
}
