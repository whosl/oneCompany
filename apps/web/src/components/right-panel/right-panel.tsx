"use client";

import { useState } from "react";
import { FilesTab } from "./files-tab";
import { PreviewTab } from "./preview-tab";
import { ReportTab } from "./report-tab";
import { TerminalTab } from "./terminal-tab";
import { TestsTab } from "./tests-tab";

const TABS = ["Files", "Preview", "Terminal", "Tests", "Report"] as const;
type TabId = (typeof TABS)[number];

export function RightPanel({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("Files");

  return (
    <section className="oc-panel flex h-full flex-col rounded-lg" data-testid="right-panel">
      <div role="tablist" aria-label="Right panel tabs" className="flex border-b border-[var(--oc-border-muted)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            data-active={activeTab === tab ? "true" : "false"}
            className="oc-tab px-4 py-2 text-sm font-medium"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex-1 p-4">
        {activeTab === "Files" ? <FilesTab projectId={projectId} /> : null}
        {activeTab === "Preview" ? <PreviewTab projectId={projectId} /> : null}
        {activeTab === "Terminal" ? <TerminalTab projectId={projectId} /> : null}
        {activeTab === "Tests" ? <TestsTab projectId={projectId} /> : null}
        {activeTab === "Report" ? <ReportTab projectId={projectId} /> : null}
      </div>
    </section>
  );
}
