"use client";

import { useEffect, useState } from "react";
import type { ReportSnapshot } from "@oc/shared";
import { panelApi } from "@/lib/api";

export function ReportTab({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<ReportSnapshot | null>(null);

  useEffect(() => {
    void panelApi.getReport(projectId).then(setReport);
  }, [projectId]);

  if (!report) {
    return <p className="text-sm text-[var(--oc-text-muted)]">Loading report…</p>;
  }

  return (
    <div className="space-y-4" data-testid="report-tab">
      <header className="text-sm text-[var(--oc-text-muted)]">Status: {report.projectStatus}</header>
      {report.sections.map((section) => (
        <section key={section.id} className="rounded-md border border-[var(--oc-border-muted)] p-3">
          <h3 className="text-sm font-semibold">{section.title}</h3>
          {section.content ? (
            <pre className="mt-2 whitespace-pre-wrap text-xs">{section.content}</pre>
          ) : (
            <p className="mt-2 text-sm text-[var(--oc-text-muted)]" data-testid={`empty-${section.id}`}>
              {section.emptyReason ?? "No content"}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
