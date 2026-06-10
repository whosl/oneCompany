"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";
import { panelApi } from "@/lib/api";
import {
  UiEmptyState,
  UiSectionHeading,
  UiStatusPill,
} from "@/components/ui-v2/primitives";

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
      <div className="h-full min-h-[420px]" data-testid="preview-tab">
        <UiEmptyState
          title="No preview yet"
          description="Start the preview from Testing to inspect the generated application."
          icon={<MonitorPlay className="size-5" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col" data-testid="preview-tab">
      <div className="mb-3 space-y-3">
        <UiSectionHeading
          title="Application preview"
          description={status.previewUrl}
          action={
            <a
              href={status.previewUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open preview in a new tab"
              title="Open preview in a new tab"
              className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--oc-border-muted)] text-[var(--oc-text-muted)] hover:bg-[var(--oc-surface-raised)] hover:text-[var(--oc-text-primary)]"
            >
              <ExternalLink className="size-4" />
            </a>
          }
        />
        <div className="flex flex-wrap gap-2">
          <UiStatusPill
            tone={status.health.reachable ? "success" : "danger"}
            label={status.health.reachable ? "Reachable" : "Unreachable"}
          />
          <UiStatusPill
            tone={status.health.playwrightReady ? "success" : "warning"}
            label={`Playwright ${status.health.playwrightReady ? "ready" : "pending"}`}
          />
        </div>
      </div>
      <iframe
        title="App preview"
        src={status.previewUrl}
        className="min-h-[360px] flex-1 rounded-md border border-[var(--oc-border-muted)] bg-white"
        data-testid="preview-iframe"
      />
    </div>
  );
}
