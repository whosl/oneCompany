"use client";

import { useState } from "react";
import { FilesTab } from "./files-tab";
import { PreviewTab } from "./preview-tab";
import { ReportTab } from "./report-tab";
import { TerminalTab } from "./terminal-tab";
import { TestsTab } from "./tests-tab";
import { UiPanel, UiTabs } from "@/components/ui-v2/primitives";

const TABS = ["Files", "Preview", "Terminal", "Tests", "Report"] as const;
export type RightPanelTabId = (typeof TABS)[number];

export function RightPanel({
  projectId,
  activeTab: controlledTab,
  onTabChange,
}: {
  projectId: string;
  activeTab?: RightPanelTabId;
  onTabChange?: (tab: RightPanelTabId) => void;
}) {
  const [internalTab, setInternalTab] = useState<RightPanelTabId>("Files");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

  return (
    <UiPanel className="flex h-full flex-col" data-testid="right-panel">
      <div className="border-b border-[var(--oc-border-muted)] p-3">
        <UiTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Right panel tabs"
        />
      </div>
      <div role="tabpanel" className="flex-1 p-4">
        {activeTab === "Files" ? <FilesTab projectId={projectId} /> : null}
        {activeTab === "Preview" ? <PreviewTab projectId={projectId} /> : null}
        {activeTab === "Terminal" ? <TerminalTab projectId={projectId} /> : null}
        {activeTab === "Tests" ? <TestsTab projectId={projectId} /> : null}
        {activeTab === "Report" ? <ReportTab projectId={projectId} /> : null}
      </div>
    </UiPanel>
  );
}
