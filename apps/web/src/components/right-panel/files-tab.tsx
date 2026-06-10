"use client";

import { useEffect, useState } from "react";
import { FileCode2, GitCompareArrows } from "lucide-react";
import { panelApi } from "@/lib/api";
import {
  UiCodeBlock,
  UiEmptyState,
  UiSectionHeading,
} from "@/components/ui-v2/primitives";
import { cn } from "@/lib/utils";

export function FilesTab({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [diffs, setDiffs] = useState<Array<{ diffId: string; summary: string }>>([]);
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [patch, setPatch] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void panelApi.listFiles(projectId, "all").then((result) => setFiles(result.files));
    void panelApi.listDiffs(projectId).then((result) => setDiffs(result.diffs));
  }, [projectId]);

  async function handleSelectFile(path: string) {
    setSelectedPath(path);
    setSelectedDiffId(null);
    setPatch("");
    setError(null);
    try {
      const file = await panelApi.readFile(projectId, path);
      setContent(file.content);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Failed to read file");
      setContent("");
    }
  }

  async function handleSelectDiff(diffId: string) {
    setSelectedDiffId(diffId);
    setSelectedPath(null);
    setContent("");
    setError(null);
    try {
      const result = await panelApi.getDiffPatch(projectId, diffId);
      setPatch(result.patch);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Failed to load diff");
      setPatch("");
    }
  }

  return (
    <div
      className="grid h-full min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"
      data-testid="files-tab"
    >
      <aside className="overflow-auto border-b border-[var(--oc-border-muted)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
        <UiSectionHeading title="Files" description={`${files.length} repository items`} />
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((file) => (
            <li key={file}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-[var(--oc-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35",
                  selectedPath === file
                    ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]"
                    : "text-[var(--oc-text-primary)]",
                )}
                onClick={() => void handleSelectFile(file)}
              >
                <FileCode2 className="size-3.5 shrink-0" />
                <span className="truncate font-mono">{file}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <UiSectionHeading title="Diffs" description={`${diffs.length} change sets`} />
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {diffs.map((diff) => (
            <li key={diff.diffId}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-[var(--oc-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35",
                  selectedDiffId === diff.diffId
                    ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]"
                    : "text-[var(--oc-text-primary)]",
                )}
                onClick={() => void handleSelectDiff(diff.diffId)}
              >
                <GitCompareArrows className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2">{diff.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-w-0 overflow-auto">
        {error ? <p className="text-sm text-[var(--oc-status-danger)]">{error}</p> : null}
        {selectedPath ? (
          <div className="space-y-3">
            <UiSectionHeading title={selectedPath} description="Read-only repository content" />
            <UiCodeBlock className="max-h-[620px] whitespace-pre-wrap" data-testid="file-content">
              {content}
            </UiCodeBlock>
          </div>
        ) : null}
        {selectedDiffId ? (
          <div className="space-y-3">
            <UiSectionHeading title="Diff patch" description={selectedDiffId} />
            <UiCodeBlock className="max-h-[620px] whitespace-pre-wrap" data-testid="diff-patch">
              {patch}
            </UiCodeBlock>
          </div>
        ) : null}
        {!selectedPath && !selectedDiffId && !error ? (
          <UiEmptyState
            title="Select a file or diff"
            description="Repository content is read-only in the workspace."
            icon={<FileCode2 className="size-5" />}
          />
        ) : null}
      </section>
    </div>
  );
}
