import {
  DELIVERY_REPORT_SECTION_IDS,
  DeliveryReportSchema,
  type DeliveryReportSection,
  type DeliveryReportSectionId,
} from "@oc/shared";

export { DELIVERY_REPORT_SECTION_IDS };

export function assertReportComplete(sections: DeliveryReportSection[]): void {
  DeliveryReportSchema.parse({ sections });
  const ids = new Set(sections.map((section) => section.id));
  for (const id of DELIVERY_REPORT_SECTION_IDS) {
    if (!ids.has(id)) {
      throw new Error(`Missing delivery report section: ${id}`);
    }
  }
}

export function renderDeliveryReportMarkdown(sections: DeliveryReportSection[]): string {
  assertReportComplete(sections);
  return sections.map((section) => `## ${section.title}\n\n${section.content.trim()}\n`).join("\n");
}

export function sectionTitle(id: DeliveryReportSectionId): string {
  switch (id) {
    case "requirement-summary":
      return "Requirement Summary";
    case "confirmed-tech-stack":
      return "Confirmed Tech Stack";
    case "feature-list":
      return "Feature List";
    case "directory-structure":
      return "Directory Structure";
    case "run-instructions":
      return "Run Instructions";
    case "test-results":
      return "Test Results";
    case "deployment-url":
      return "Deployment URL";
    case "risks-and-limitations":
      return "Risks and Limitations";
    case "follow-up-recommendations":
      return "Follow-up Recommendations";
    default:
      return id;
  }
}
