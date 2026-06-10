"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsoleSnapshot } from "@oc/shared";
import {
  Archive,
  Check,
  Circle,
  Clock3,
  FileText,
  FolderOpen,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { consoleApi, type ProjectSummary } from "@/lib/api";
import {
  UiButton,
  UiDialog,
  UiEmptyState,
  UiInput,
  UiStatusPill,
  type UiStatusTone,
} from "@/components/ui-v2/primitives";
import { cn } from "@/lib/utils";

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
  if (status === "Developing" || status === "Change Review" || status === "Paused") return 4;
  if (status === "Testing") return 5;
  if (status === "Deploying") return 6;
  if (status === "Awaiting Acceptance") return 7;
  if (status === "Delivered") return 8;
  return 0;
}

function projectStatusTone(status: string): UiStatusTone {
  if (status === "Delivered") return "success";
  if (status === "Failed") return "danger";
  if (status === "Paused" || status.includes("Review") || status.includes("Acceptance")) {
    return "warning";
  }
  if (status === "Developing" || status === "Testing" || status === "Deploying") return "accent";
  return "neutral";
}

function projectArtifacts(snapshot: ConsoleSnapshot): string[] {
  const artifacts = new Set<string>();
  for (const event of snapshot.events) {
    if (event.payload.type === "artifact.created") artifacts.add(event.payload.path);
    if (event.payload.type === "delivery.report_generated") artifacts.add(event.payload.artifactPath);
  }
  return [...artifacts];
}

function deploymentUrl(snapshot: ConsoleSnapshot): string | undefined {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const payload = snapshot.events[index]?.payload;
    if (payload?.type === "deployment.url_confirmed") return payload.url;
    if (payload?.type === "deployment.completed" && payload.url) return payload.url;
  }
  return undefined;
}

function reworkCount(snapshot: ConsoleSnapshot): number {
  let previousIndex = -1;
  let count = 0;
  for (const event of snapshot.events) {
    if (event.payload.type !== "project.status_changed") continue;
    const nextIndex = stageIndexForStatus(event.payload.status);
    if (previousIndex >= 0 && nextIndex < previousIndex) count += 1;
    previousIndex = nextIndex;
  }
  return count;
}

export function ProjectHub({
  open,
  currentProjectId,
  onClose,
  projectQuery,
  mode = "dialog",
}: {
  open: boolean;
  currentProjectId: string;
  onClose: () => void;
  projectQuery?: string;
  mode?: "dialog" | "page";
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState(currentProjectId);
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open && mode !== "page") return;
    let active = true;
    setSelectedId(currentProjectId);
    setLoadingProjects(true);
    setError(null);
    void consoleApi
      .listProjects()
      .then((result) => {
        if (!active) return;
        setProjects(result.projects);
        if (!currentProjectId && result.projects[0]) {
          setSelectedId(result.projects[0].id);
        }
      })
      .catch((loadError: unknown) =>
        active
          ? setError(loadError instanceof Error ? loadError.message : "Failed to load projects")
          : undefined,
      )
      .finally(() => {
        if (active) setLoadingProjects(false);
      });
    return () => {
      active = false;
    };
  }, [currentProjectId, mode, open]);

  useEffect(() => {
    if ((!open && mode !== "page") || !selectedId) return;
    let active = true;
    setLoadingSnapshot(true);
    setError(null);
    setSnapshot(null);
    void consoleApi
      .getSnapshot(selectedId)
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch((loadError: unknown) =>
        active
          ? setError(loadError instanceof Error ? loadError.message : "Failed to load project details")
          : undefined,
      )
      .finally(() => {
        if (active) setLoadingSnapshot(false);
      });
    return () => {
      active = false;
    };
  }, [mode, open, selectedId]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.slug.toLowerCase().includes(query) ||
        project.status.toLowerCase().includes(query),
    );
  }, [projects, search]);

  const currentStage = snapshot ? stageIndexForStatus(snapshot.project.status) : 0;
  const artifacts = snapshot ? projectArtifacts(snapshot) : [];
  const preview = snapshot?.testing?.previewUrl ?? snapshot?.dev?.previewUrl;
  const deployment = snapshot ? deploymentUrl(snapshot) : undefined;
  const reworks = snapshot ? reworkCount(snapshot) : 0;

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    setPendingAction("create");
    setError(null);
    try {
      const project = await consoleApi.createProject(name);
      setProjects((current) => [project, ...current]);
      setSelectedId(project.id);
      setNewProjectName("");
      setNewProjectOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create project");
    } finally {
      setPendingAction(null);
    }
  }

  async function changePauseState(mode: "pause" | "resume") {
    if (!snapshot) return;
    setPendingAction(mode);
    setError(null);
    try {
      await (mode === "pause"
        ? consoleApi.pauseProject(snapshot.project.id)
        : consoleApi.resumeProject(snapshot.project.id));
      const [projectList, nextSnapshot] = await Promise.all([
        consoleApi.listProjects(),
        consoleApi.getSnapshot(snapshot.project.id),
      ]);
      setProjects(projectList.projects);
      setSnapshot(nextSnapshot);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${mode} project`);
    } finally {
      setPendingAction(null);
    }
  }

  function openProject() {
    const suffix = projectQuery ? `?${projectQuery}` : "";
    router.push(`/projects/${selectedId}${suffix}`);
    onClose();
  }

  const canPause =
    snapshot &&
    !["Draft Requirement", "Delivered", "Failed", "Paused"].includes(snapshot.project.status);

  const hubContent = (
    <div
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]",
        mode === "page" && "min-h-[calc(100vh-4.5rem)]",
      )}
    >
        <aside className="flex min-h-0 flex-col border-b border-[var(--oc-border-muted)] md:border-b-0 md:border-r">
          <div className="space-y-3 border-b border-[var(--oc-border-muted)] p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--oc-text-muted)]" />
              <UiInput
                className="w-full pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
              />
            </div>
            {newProjectOpen ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createProject();
                }}
              >
                <UiInput
                  className="flex-1"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Project name"
                  aria-label="New project name"
                  autoFocus
                />
                <UiButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!newProjectName.trim() || pendingAction === "create"}
                >
                  Create
                </UiButton>
              </form>
            ) : (
              <UiButton className="w-full" onClick={() => setNewProjectOpen(true)}>
                <Plus />
                New project
              </UiButton>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2 md:p-3">
            {loadingProjects ? (
              <UiEmptyState className="min-h-40" title="Loading projects" />
            ) : visibleProjects.length === 0 ? (
              <UiEmptyState
                className="min-h-40"
                title="No matching projects"
                description="Clear the search or create a new project."
              />
            ) : (
              <ul className="space-y-1">
                {visibleProjects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35",
                        selectedId === project.id
                          ? "border-[var(--oc-border-active)] bg-[var(--oc-accent-soft)]"
                          : "border-transparent hover:bg-[var(--oc-surface-raised)]",
                      )}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-[var(--oc-text-primary)]">
                          {project.name}
                        </span>
                        {project.id === currentProjectId ? (
                          <span className="text-[10px] text-[var(--oc-accent-primary)]">Current</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--oc-text-muted)]">
                        <span className="truncate">{project.slug}</span>
                        <span className="shrink-0">{project.status}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-auto">
          {error ? (
            <div className="border-b border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 px-5 py-3 text-sm text-[var(--oc-status-danger)]">
              {error}
            </div>
          ) : null}
          {loadingSnapshot ? (
            <UiEmptyState title="Loading project details" />
          ) : snapshot ? (
            <div className="divide-y divide-[var(--oc-border-muted)]">
              <header className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-semibold text-[var(--oc-text-primary)]">
                      {snapshot.project.name}
                    </h3>
                    <UiStatusPill
                      tone={projectStatusTone(snapshot.project.status)}
                      label={snapshot.project.status}
                    />
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--oc-text-muted)]">
                    {snapshot.project.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <UiButton variant="primary" onClick={openProject}>
                    <FolderOpen />
                    Open
                  </UiButton>
                  {snapshot.project.status === "Paused" ? (
                    <UiButton
                      onClick={() => void changePauseState("resume")}
                      disabled={pendingAction !== null}
                    >
                      <Play />
                      Resume
                    </UiButton>
                  ) : (
                    <UiButton
                      onClick={() => void changePauseState("pause")}
                      disabled={!canPause || pendingAction !== null}
                      title={canPause ? "Pause project" : "This project cannot be paused"}
                    >
                      <Pause />
                      Pause
                    </UiButton>
                  )}
                  <UiButton disabled title="Archive is planned after the MVP release window">
                    <Archive />
                    Archive
                  </UiButton>
                </div>
              </header>

              <section className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Lifecycle</h4>
                    <p className="text-xs text-[var(--oc-text-muted)]">
                      {snapshot.phase.activeGroup} · {snapshot.phase.progressLabel ?? snapshot.phase.label}
                    </p>
                  </div>
                  {reworks > 0 ? (
                    <UiStatusPill tone="warning" label={`${reworks} rework`} />
                  ) : null}
                </div>
                <div
                  data-testid="lifecycle-timeline"
                  className="overflow-x-auto rounded-md border border-[var(--oc-border-muted)]"
                >
                  <div className="grid min-w-[760px] grid-cols-9">
                    {LIFECYCLE_STAGES.map((stage, index) => {
                      const complete = index < currentStage;
                      const current = index === currentStage;
                      return (
                        <div
                          key={stage}
                          className={cn(
                            "flex min-h-16 flex-col items-center justify-center gap-1 border-r border-[var(--oc-border-muted)] px-2 text-center last:border-r-0",
                            current ? "bg-[var(--oc-accent-soft)]" : "bg-[var(--oc-surface-base)]",
                          )}
                        >
                          {complete ? (
                            <Check className="size-4 text-[var(--oc-status-success)]" />
                          ) : current ? (
                            <Clock3 className="size-4 text-[var(--oc-accent-primary)]" />
                          ) : (
                            <Circle className="size-3 text-[var(--oc-border-muted)]" />
                          )}
                          <span
                            className={cn(
                              "text-[11px]",
                              current
                                ? "font-semibold text-[var(--oc-accent-primary)]"
                                : "text-[var(--oc-text-muted)]",
                            )}
                          >
                            {stage}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 divide-y divide-[var(--oc-border-muted)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <section className="p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-[var(--oc-status-warning)]" />
                    <h4 className="text-sm font-semibold">Open gates</h4>
                    <span className="text-xs text-[var(--oc-text-muted)]">
                      {snapshot.openGates.length}
                    </span>
                  </div>
                  {snapshot.openGates.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--oc-text-muted)]">No open gates.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                      {snapshot.openGates.map((gate) => (
                        <li key={gate.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span>{gate.gateType}</span>
                          <UiStatusPill tone="warning" label="Open" />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-[var(--oc-status-danger)]" />
                    <h4 className="text-sm font-semibold">Risks</h4>
                    <span className="text-xs text-[var(--oc-text-muted)]">{snapshot.risks.length}</span>
                  </div>
                  {snapshot.risks.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--oc-text-muted)]">No recorded project risks.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {snapshot.risks.map((risk, index) => (
                        <li key={`${risk}-${index}`} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--oc-status-danger)]" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <div className="grid grid-cols-1 divide-y divide-[var(--oc-border-muted)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <section className="p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="size-4 text-[var(--oc-status-info)]" />
                    <h4 className="text-sm font-semibold">Preview and deployment</h4>
                  </div>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--oc-text-muted)]">Preview</dt>
                      <dd className="mt-0.5 break-all font-mono text-xs">{preview ?? "Not available"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--oc-text-muted)]">Deployment</dt>
                      <dd className="mt-0.5 break-all font-mono text-xs">
                        {deployment ?? "Not confirmed"}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-[var(--oc-accent-primary)]" />
                    <h4 className="text-sm font-semibold">Artifacts</h4>
                    <span className="text-xs text-[var(--oc-text-muted)]">{artifacts.length}</span>
                  </div>
                  {artifacts.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--oc-text-muted)]">No generated artifacts yet.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                      {artifacts.slice(0, 6).map((artifact) => (
                        <li key={artifact} className="flex items-center gap-2 py-2 font-mono text-xs">
                          <FileText className="size-3.5 shrink-0 text-[var(--oc-text-muted)]" />
                          <span className="truncate">{artifact}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {reworks > 0 ? (
                <section className="flex items-start gap-3 bg-[var(--oc-status-warning)]/10 p-4 sm:p-5">
                  <RotateCcw className="mt-0.5 size-4 shrink-0 text-[var(--oc-status-warning)]" />
                  <div>
                    <h4 className="text-sm font-semibold">Rework history</h4>
                    <p className="mt-1 text-xs text-[var(--oc-text-muted)]">
                      The event timeline contains {reworks} backward lifecycle transition
                      {reworks === 1 ? "" : "s"}. Time remains monotonic; rework is shown as a marker.
                    </p>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <UiEmptyState title="Select a project" description="Choose a project to inspect its lifecycle." />
          )}
        </section>
      </div>
  );

  if (mode === "page") {
    return (
      <main className="flex min-h-screen flex-col bg-[var(--oc-app-bg)] text-[var(--oc-text-primary)]">
        <header className="border-b border-[var(--oc-border-muted)] px-6 py-4">
          <h1 className="text-lg font-semibold">Project Hub</h1>
          <p className="mt-1 text-sm text-[var(--oc-text-muted)]">
            Project lifecycle, blockers, risks and delivery artifacts
          </p>
        </header>
        {hubContent}
      </main>
    );
  }

  return (
    <UiDialog
      open={open}
      onClose={onClose}
      title="Project Hub"
      description="Project lifecycle, blockers, risks and delivery artifacts"
      className="max-w-6xl"
      testId="project-hub"
    >
      {hubContent}
    </UiDialog>
  );
}
