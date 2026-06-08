"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsoleSnapshot } from "@oc/shared";
import { consoleApi, type ProjectSummary } from "@/lib/api";

const LIFECYCLE_STAGES = [
  "Draft",
  "Asking",
  "PRD",
  "Tech plan",
  "Developing",
  "Testing",
  "Deploy",
  "Acceptance",
  "Delivered",
] as const;

function stageIndexForStatus(status: string): number {
  if (status === "Draft Requirement") return 0;
  if (status === "Asking Questions") return 1;
  if (status === "PRD Ready") return 2;
  if (status === "Tech Plan Review") return 3;
  if (status === "Developing" || status === "Change Review") return 4;
  if (status === "Testing") return 5;
  if (status === "Deploying") return 6;
  if (status === "Awaiting Acceptance") return 7;
  if (status === "Delivered") return 8;
  return 0;
}

export function ProjectHub({
  open,
  currentProjectId,
  onClose,
}: {
  open: boolean;
  currentProjectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState(currentProjectId);
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    void consoleApi.listProjects().then((result) => setProjects(result.projects));
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId) {
      return;
    }
    void consoleApi.getSnapshot(selectedId).then(setSnapshot);
  }, [open, selectedId]);

  if (!open) {
    return null;
  }

  const currentStage = snapshot ? stageIndexForStatus(snapshot.project.status) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" data-testid="project-hub">
      <div className="grid h-[80vh] w-full max-w-5xl grid-cols-[1fr_1.2fr] gap-4 overflow-hidden rounded-lg border bg-[var(--oc-surface-base)] p-4 shadow-lg">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Project Hub</h2>
          <ul className="space-y-2 overflow-auto text-sm">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left ${
                    selectedId === project.id ? "bg-[var(--oc-accent-soft)]" : ""
                  }`}
                  onClick={() => setSelectedId(project.id)}
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-xs text-[var(--oc-text-muted)]">{project.status}</div>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-2 text-sm"
            onClick={() => {
              void consoleApi.createProject("New Project").then((project) => {
                setProjects((current) => [project, ...current]);
                setSelectedId(project.id);
              });
            }}
          >
            New Project
          </button>
        </section>

        <section className="overflow-auto">
          {snapshot ? (
            <div className="space-y-4 text-sm">
              <header>
                <h3 className="text-base font-semibold">{snapshot.project.name}</h3>
                <p className="text-[var(--oc-text-muted)]">{snapshot.project.status}</p>
              </header>

              <div data-testid="lifecycle-timeline" className="flex flex-wrap gap-2">
                {LIFECYCLE_STAGES.map((stage, index) => (
                  <span
                    key={stage}
                    className={
                      index === currentStage
                        ? "rounded-full bg-[var(--oc-accent-primary)] px-2 py-1 text-xs text-white"
                        : index < currentStage
                          ? "rounded-full bg-[var(--oc-status-success)]/20 px-2 py-1 text-xs"
                          : "rounded-full bg-[var(--oc-border-muted)] px-2 py-1 text-xs text-[var(--oc-text-muted)]"
                    }
                  >
                    {stage}
                  </span>
                ))}
              </div>

              <div>
                <h4 className="font-medium">Open gates</h4>
                {snapshot.openGates.length === 0 ? (
                  <p className="text-[var(--oc-text-muted)]">No open gates</p>
                ) : (
                  <ul>
                    {snapshot.openGates.map((gate) => (
                      <li key={gate.id}>{gate.gateType}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="font-medium">Preview</h4>
                <p>{snapshot.dev?.previewUrl ?? "No preview URL yet"}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs"
                  onClick={() => {
                    router.push(`/projects/${selectedId}`);
                    onClose();
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs"
                  onClick={() => void consoleApi.pauseProject(selectedId).then(() => onClose())}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs"
                  onClick={() => void consoleApi.resumeProject(selectedId).then(() => onClose())}
                >
                  Resume
                </button>
                <button
                  type="button"
                  disabled
                  title="Post-MVP"
                  className="rounded-md border px-3 py-1 text-xs opacity-50"
                >
                  Archive
                </button>
              </div>

              <p className="text-xs text-[var(--oc-text-muted)]">
                Project Hub manages project instances. Settings manages only the global environment.
              </p>
            </div>
          ) : (
            <p>Select a project</p>
          )}
        </section>

        <button
          type="button"
          className="absolute right-6 top-6 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
