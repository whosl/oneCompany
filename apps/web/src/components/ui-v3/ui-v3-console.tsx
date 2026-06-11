"use client";

import { useMemo, useState } from "react";
import "@/styles/ui-v3.css";
import { consoleApi } from "@/lib/api";
import { useConsoleProjection } from "@/lib/projection/use-console-projection";
import { ProjectHub } from "@/components/console/project-hub";
import { SettingsModal } from "@/components/console/settings-modal";
import { FilesTab } from "@/components/right-panel/files-tab";
import { PreviewTab } from "@/components/right-panel/preview-tab";
import { ReportTab } from "@/components/right-panel/report-tab";
import { TerminalTab } from "@/components/right-panel/terminal-tab";
import { TestsTab } from "@/components/right-panel/tests-tab";
import type { ComposerProjection } from "@/lib/projection/types";
import type { WorkspaceTabId } from "../ui-v2/types";
import { adaptUiV3Projection } from "./projection";
import { UiV3Shell } from "./ui-v3-shell";
import type { UiV3Actions } from "./types";

function splitAnswers(text: string): string[] {
  return text
    .split(/\n+/)
    .map((answer) => answer.replace(/^\d+[.)\]]\s*/, "").trim())
    .filter(Boolean);
}

export function UiV3Console({ projectId }: { projectId: string }) {
  const [projectHubOpen, setProjectHubOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { projection, status, refresh } = useConsoleProjection(projectId);
  const viewModel = useMemo(
    () => (projection ? adaptUiV3Projection(projection) : undefined),
    [projection],
  );

  if (status === "error") {
    return (
      <main className="ui-v3-root flex min-h-screen items-center justify-center text-sm text-[var(--v3-danger)]">
        无法加载 Agent Console，请检查 API 是否在运行。
      </main>
    );
  }

  if (status === "loading" || !projection || !viewModel) {
    return (
      <main className="ui-v3-root flex min-h-screen items-center justify-center text-sm text-[var(--v3-text-muted)]">
        正在加载 Agent Console…
      </main>
    );
  }

  const actions: UiV3Actions = {
    onRefresh: refresh,
    onPauseResume: async () => {
      const projectStatus = projection.snapshot.project.status;
      if (projectStatus === "Delivered" || projectStatus === "Failed") return;
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
    onStartDevelopment: async () => {
      await consoleApi.startDevelopment(projectId);
      await refresh();
    },
    onResolveGate: async (gateId, decision, customText) => {
      if (projection.snapshot.project.status === "Paused") return;
      await consoleApi.resolveGate(gateId, decision, customText);
      await refresh();
    },
    onComposerSubmit: async (mode: ComposerProjection["mode"], text: string, answers?: string[]) => {
      if (mode === "requirement") {
        await consoleApi.startRequirement(projectId, text);
      } else if (mode === "question_round") {
        const payload = answers?.length ? answers : splitAnswers(text);
        await consoleApi.submitRequirementAnswers(projectId, payload);
      } else if (mode === "change_request") {
        await consoleApi.createChangeRequest(projectId, text);
      } else if (mode === "deployment_url") {
        await consoleApi.submitDeploymentUrl(projectId, text);
      } else {
        return;
      }
      await refresh();
    },
    onSkipClarification: async () => {
      await consoleApi.skipRequirementClarification(projectId);
      await refresh();
    },
    onContextualAction: async (actionId) => {
      try {
        if (actionId === "start-development") {
          await consoleApi.startDevelopment(projectId);
        } else if (actionId === "deploy") {
          await consoleApi.startTesting(projectId, true);
        } else if (actionId === "resume") {
          await consoleApi.resumeProject(projectId);
        } else {
          return;
        }
        await refresh();
      } catch (error) {
        throw error instanceof Error ? error : new Error("操作失败");
      }
    },
    onOpenProjectHub: () => setProjectHubOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
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
      <UiV3Shell projection={viewModel} actions={actions} renderWorkspaceTab={renderWorkspaceTab} />
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
