"use client";

import { useEffect, useState } from "react";
import { panelApi } from "@/lib/api";

export function PreviewTab({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof panelApi.getPreviewStatus>> | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await panelApi.getPreviewStatus(projectId);
      if (active) {
        setStatus(next);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId]);

  if (!status?.previewUrl) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center" data-testid="preview-tab">
        <p className="text-sm text-[var(--oc-text-muted)]">No preview yet. Start preview from testing.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col" data-testid="preview-tab">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono">{status.previewUrl}</span>
        <span className={status.health.reachable ? "oc-chip-success" : "oc-chip-muted"}>
          {status.health.reachable ? "Reachable" : "Unreachable"}
        </span>
        <span className={status.health.playwrightReady ? "oc-chip-success" : "oc-chip-muted"}>
          Playwright {status.health.playwrightReady ? "ready" : "pending"}
        </span>
      </div>
      <iframe
        title="App preview"
        src={status.previewUrl}
        className="min-h-[360px] flex-1 border border-[var(--oc-border-muted)] bg-white"
        data-testid="preview-iframe"
      />
    </div>
  );
}
