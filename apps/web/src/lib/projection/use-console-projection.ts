"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventEnvelope, ProjectStatus } from "@oc/shared";
import { consoleApi } from "../api";
import { applyEvent, createProjectionFromSnapshot } from "./build-projection";
import type { ConsoleProjection } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const ACTIVE_PROJECT_STATUSES = new Set<ProjectStatus>([
  "Draft Requirement",
  "Asking Questions",
  "Developing",
  "Tech Plan Review",
  "Testing",
  "Change Review",
]);

const SNAPSHOT_POLL_MS = 2000;

export function useConsoleProjection(
  projectId: string,
  options: { workflowPending?: boolean } = {},
) {
  const [projection, setProjection] = useState<ConsoleProjection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const lastSeqRef = useRef(0);
  const workflowPending = options.workflowPending ?? false;
  const projectStatus = projection?.snapshot.project.status;
  const openGateCount = projection?.openGates.length ?? 0;

  const hydrate = useCallback(async () => {
    const snapshot = await consoleApi.getSnapshot(projectId);
    const lastSeq = Math.max(lastSeqRef.current, snapshot.lastSeq);
    lastSeqRef.current = lastSeq;
    const next = createProjectionFromSnapshot({ ...snapshot, lastSeq });
    setProjection(next);
    setStatus("ready");
    return snapshot;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void hydrate().catch(() => {
      if (active) {
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, [hydrate]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) {
        return;
      }
      source?.close();
      source = new EventSource(
        `${API_BASE}/projects/${projectId}/events/stream?afterSeq=${lastSeqRef.current}`,
      );

      source.onmessage = (message) => {
        const envelope = JSON.parse(message.data) as EventEnvelope;
        if (envelope.seq <= lastSeqRef.current) {
          return;
        }
        lastSeqRef.current = envelope.seq;

        if (
          envelope.payload.type === "human_gate.created" ||
          envelope.payload.type === "human_gate.resolved"
        ) {
          void hydrate();
          return;
        }

        setProjection((current) => (current ? applyEvent(current, envelope) : current));
      };

      source.onerror = () => {
        source?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [projectId, status, hydrate]);

  useEffect(() => {
    if (status !== "ready" || !projectStatus) {
      return;
    }

    const shouldPoll =
      workflowPending || ACTIVE_PROJECT_STATUSES.has(projectStatus) || openGateCount > 0;

    if (!shouldPoll) {
      return;
    }

    const timer = setInterval(() => {
      void hydrate();
    }, SNAPSHOT_POLL_MS);

    return () => clearInterval(timer);
  }, [status, projectStatus, openGateCount, workflowPending, hydrate]);

  const refresh = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  return { projection, status, refresh };
}

export type { ConsoleProjection };
