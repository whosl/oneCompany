"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsoleSnapshot, EventEnvelope } from "@oc/shared";
import { consoleApi } from "../api";
import { applyEvent, createProjectionFromSnapshot } from "./build-projection";
import type { ConsoleProjection } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useConsoleProjection(projectId: string) {
  const [projection, setProjection] = useState<ConsoleProjection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const hydrate = useCallback(async () => {
    const snapshot = await consoleApi.getSnapshot(projectId);
    setProjection(createProjectionFromSnapshot(snapshot));
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
    if (!projection) {
      return;
    }

    const source = new EventSource(
      `${API_BASE}/projects/${projectId}/events/stream?afterSeq=${projection.lastSeq}`,
    );

    source.onmessage = (message) => {
      const envelope = JSON.parse(message.data) as EventEnvelope;
      // Gate lifecycle changes the actionable state, and the allowed options
      // live in the snapshot rather than the event payload. Re-hydrate so the
      // composer/gate card render real options instead of an empty stub.
      if (
        envelope.payload.type === "human_gate.created" ||
        envelope.payload.type === "human_gate.resolved"
      ) {
        void hydrate();
        return;
      }
      setProjection((current) => (current ? applyEvent(current, envelope) : current));
    };

    return () => source.close();
  }, [projectId, projection?.lastSeq, hydrate]);

  const refresh = useCallback(async () => {
    const snapshot = await consoleApi.getSnapshot(projectId);
    setProjection(createProjectionFromSnapshot(snapshot));
  }, [projectId]);

  return { projection, status, refresh };
}

export type { ConsoleProjection };
