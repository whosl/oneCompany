"use client";

import { useEffect, useState } from "react";
import type { TestsResultsResponse } from "@oc/shared";
import { panelApi } from "@/lib/api";

function statusClass(status: string): string {
  if (status === "passed") {
    return "oc-chip-success";
  }
  if (status === "failed") {
    return "oc-chip-danger";
  }
  return "oc-chip-muted";
}

function SuiteSection({
  title,
  rows,
}: {
  title: string;
  rows: TestsResultsResponse["slice"];
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--oc-text-muted)]">No results yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.suite}
              className="rounded-md border border-[var(--oc-border-muted)] px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{row.suite}</span>
                <span className={statusClass(row.status)}>{row.status}</span>
              </div>
              {row.details ? <p className="mt-1 text-xs text-[var(--oc-text-muted)]">{row.details}</p> : null}
              {row.artifacts && row.artifacts.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {row.artifacts.map((artifact) => (
                    <li key={artifact.artifactId}>
                      <span className="text-[var(--oc-text-muted)]">{artifact.kind}:</span>{" "}
                      <code>{artifact.path}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TestsTab({ projectId }: { projectId: string }) {
  const [results, setResults] = useState<TestsResultsResponse | null>(null);

  useEffect(() => {
    void panelApi.getTestsResults(projectId).then(setResults);
  }, [projectId]);

  return (
    <div className="space-y-6" data-testid="tests-tab">
      <SuiteSection title="Per-slice checks" rows={results?.slice ?? []} />
      <SuiteSection title="Final acceptance suite" rows={results?.final ?? []} />
    </div>
  );
}
