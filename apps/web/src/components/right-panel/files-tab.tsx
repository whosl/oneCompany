"use client";

import { useEffect, useState } from "react";
import { panelApi } from "@/lib/api";

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
    <div className="flex h-full min-h-[420px] gap-3" data-testid="files-tab">
      <aside className="w-56 shrink-0 overflow-auto border-r border-[var(--oc-border-muted)] pr-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]">
          Files
        </h3>
        <ul className="space-y-1 text-sm">
          {files.map((file) => (
            <li key={file}>
              <button
                type="button"
                className="w-full truncate text-left hover:underline"
                onClick={() => void handleSelectFile(file)}
              >
                {file}
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]">
          Diffs
        </h3>
        <ul className="space-y-1 text-sm">
          {diffs.map((diff) => (
            <li key={diff.diffId}>
              <button
                type="button"
                className="w-full text-left hover:underline"
                onClick={() => void handleSelectDiff(diff.diffId)}
              >
                {diff.summary}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-w-0 flex-1 overflow-auto">
        {error ? <p className="text-sm text-[var(--oc-status-danger)]">{error}</p> : null}
        {selectedPath ? (
          <pre
            className="whitespace-pre-wrap rounded-md bg-[var(--oc-surface-raised)] p-3 text-xs"
            data-testid="file-content"
          >
            {content}
          </pre>
        ) : null}
        {selectedDiffId ? (
          <pre
            className="whitespace-pre-wrap rounded-md bg-[var(--oc-surface-raised)] p-3 text-xs"
            data-testid="diff-patch"
          >
            {patch}
          </pre>
        ) : null}
        {!selectedPath && !selectedDiffId && !error ? (
          <p className="text-sm text-[var(--oc-text-muted)]">Select a file or diff to view.</p>
        ) : null}
      </section>
    </div>
  );
}
