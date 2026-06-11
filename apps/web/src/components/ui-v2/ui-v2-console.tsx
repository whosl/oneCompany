"use client";

import { useMemo, useState } from "react";
import { consoleApi } from "@/lib/api";
import { useConsoleProjection } from "@/lib/projection/use-console-projection";
import { ProjectHub } from "@/components/console/project-hub";
import { SettingsModal } from "@/components/console/settings-modal";
import { FilesTab } from "@/components/right-panel/files-tab";
import { PreviewTab } from "@/components/right-panel/preview-tab";
import { ReportTab } from "@/components/right-panel/report-tab";
import { TerminalTab } from "@/components/right-panel/terminal-tab";
import { TestsTab } from "@/components/right-panel/tests-tab";
import { adaptConsoleProjection } from "./adapter";
import type { UiV2ComposerMode, WorkspaceTabId } from "./types";
import { UiV2Shell, type UiV2Actions } from "./ui-v2-shell";

function splitAnswers(text: string): string[] {
  return text
    .split(/\n+/)
    .map((answer) => answer.replace(/^\d+[.)\]]\s*/, "").trim())
    .filter(Boolean);
}

export function UiV2Console({ projectId }: { projectId: string }) {
  const [projectHubOpen, setProjectHubOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { projection, status, refresh } = useConsoleProjection(projectId);
  const viewModel = useMemo(
    () => (projection ? adaptConsoleProjection(projection) : undefined),
    [projection],
  );

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--oc-app-bg)] text-sm text-[var(--oc-status-danger)]">
        Failed to load agent console.
      </main>
    );
  }

  if (status === "loading" || !projection || !viewModel) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--oc-app-bg)] text-sm text-[var(--oc-text-muted)]">
        Loading agent console...
      </main>
    );
  }

  async function submitComposer(mode: UiV2ComposerMode, text: string) {
    if (mode === "requirement") {
      await consoleApi.startRequirement(projectId, text);
    } else if (mode === "question_round") {
      await consoleApi.submitRequirementAnswers(projectId, splitAnswers(text));
    } else if (mode === "change_request") {
      await consoleApi.createChangeRequest(projectId, text);
    } else if (mode === "deployment_url") {
      await consoleApi.submitDeploymentUrl(projectId, text);
    } else {
      return;
    }
    await refresh();
  }

  const actions: UiV2Actions = {
    onPauseResume: async () => {
      const projectStatus = projection.snapshot.project.status;
      if (projectStatus === "Delivered" || projectStatus === "Failed" || projectStatus === "Draft Requirement") {
        return;
      }
      if (projectStatus === "Paused") {
        await consoleApi.resumeProject(projectId);
      } else {
        await consoleApi.pauseProject(projectId);
      }
      await refresh();
    },
    onDeploy: async () => {
      if (projection.snapshot.project.status !== "Testing") return;
      await consoleApi.startTesting(projectId, true);
      await refresh();
    },
    onOpenProjectHub: () => setProjectHubOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
    onComposerSubmit: submitComposer,
    onSkipClarification: async () => {
      await consoleApi.skipRequirementClarification(projectId);
      await refresh();
    },
    onResolveGate: async (decision, customText) => {
      if (projection.composer.disabled || projection.composer.readOnly) return;
      const gateId = projection.blockingGateId;
      if (!gateId) return;
      await consoleApi.resolveGate(gateId, decision, customText);
      await refresh();
    },
  };

  function renderWorkspaceTab(tab: WorkspaceTabId) {
    if (tab === "Files") return <FilesTab projectId={projectId} />;
    if (tab === "Preview") return <PreviewTab projectId={projectId} />;
    if (tab === "Terminal") return <TerminalTab projectId={projectId} />;
    if (tab === "Tests") return <TestsTab projectId={projectId} />;
    return <ReportTab projectId={projectId} />;
  }

  return (
    <>
      <UiV2Shell projection={viewModel} actions={actions} renderWorkspaceTab={renderWorkspaceTab} />
      <ProjectHub
        open={projectHubOpen}
        currentProjectId={projectId}
        onClose={() => setProjectHubOpen(false)}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projectId={projectId}
      />
    </>
  );
}
