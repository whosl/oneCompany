"use client";

import { useEffect, useState } from "react";
import type { ReportSnapshot } from "@oc/shared";
import { FileText } from "lucide-react";
import { panelApi } from "@/lib/api";
import {
  UiEmptyState,
  UiSectionHeading,
  UiStatusPill,
} from "@/components/ui-v2/primitives";

export function ReportTab({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<ReportSnapshot | null>(null);

  useEffect(() => {
    void panelApi.getReport(projectId).then(setReport);
  }, [projectId]);

  if (!report) {
    return <UiEmptyState title="Loading report" description="Fetching the latest report snapshot." />;
  }

  return (
    <div className="space-y-4" data-testid="report-tab">
      <UiSectionHeading
        title="Delivery report"
        description={`${report.sections.length} report sections`}
        action={<UiStatusPill tone="info" label={report.projectStatus} />}
      />
      {report.sections.length === 0 ? (
        <UiEmptyState
          title="No report sections yet"
          description="PRD, plan, test and delivery sections will appear as the workflow advances."
          icon={<FileText className="size-5" />}
        />
      ) : (
        <div className="divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
          {report.sections.map((section) => (
            <section key={section.id} className="py-4">
              <h3 className="text-sm font-semibold text-[var(--oc-text-primary)]">{section.title}</h3>
              {section.content ? (
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--oc-surface-raised)] p-3 font-mono text-xs text-[var(--oc-text-primary)]">
                  {section.content}
                </pre>
              ) : (
                <p
                  className="mt-2 text-sm text-[var(--oc-text-muted)]"
                  data-testid={`empty-${section.id}`}
                >
                  {section.emptyReason ?? "No content"}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
