"use client";

import { useEffect, useState } from "react";
import type { TestsResultsResponse } from "@oc/shared";
import { FlaskConical } from "lucide-react";
import { panelApi } from "@/lib/api";
import {
  UiEmptyState,
  UiSectionHeading,
  UiStatusPill,
  type UiStatusTone,
} from "@/components/ui-v2/primitives";

function statusTone(status: string): UiStatusTone {
  if (status === "passed") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  return "neutral";
}

function SuiteSection({
  title,
  rows,
}: {
  title: string;
  rows: TestsResultsResponse["slice"];
}) {
  return (
    <section className="space-y-3">
      <UiSectionHeading title={title} description={`${rows.length} result${rows.length === 1 ? "" : "s"}`} />
      {rows.length === 0 ? (
        <UiEmptyState
          className="min-h-32 rounded-md border border-dashed border-[var(--oc-border-muted)]"
          title="No results yet"
          icon={<FlaskConical className="size-5" />}
        />
      ) : (
        <ul className="divide-y divide-[var(--oc-border-muted)] rounded-md border border-[var(--oc-border-muted)]">
          {rows.map((row, index) => (
            <li key={`${row.suite}-${index}`} className="px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{row.suite}</span>
                <UiStatusPill tone={statusTone(row.status)} label={row.status} />
              </div>
              {row.details ? <p className="mt-1 text-xs text-[var(--oc-text-muted)]">{row.details}</p> : null}
              {row.artifacts && row.artifacts.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {row.artifacts.map((artifact, artifactIndex) => (
                    <li key={`${artifact.artifactId}-${artifactIndex}`}>
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
    <div className="space-y-8" data-testid="tests-tab">
      <SuiteSection title="Per-slice checks" rows={results?.slice ?? []} />
      <SuiteSection title="Final acceptance suite" rows={results?.final ?? []} />
    </div>
  );
}
