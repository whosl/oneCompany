import { z } from "zod";

export const DELIVERY_REPORT_SECTION_IDS = [
  "requirement-summary",
  "confirmed-tech-stack",
  "feature-list",
  "directory-structure",
  "run-instructions",
  "test-results",
  "deployment-url",
  "risks-and-limitations",
  "follow-up-recommendations",
] as const;

export type DeliveryReportSectionId = (typeof DELIVERY_REPORT_SECTION_IDS)[number];

export const DeliveryReportSectionSchema = z.object({
  id: z.enum(DELIVERY_REPORT_SECTION_IDS),
  title: z.string(),
  content: z.string().min(1),
});

export const DeliveryReportSchema = z.object({
  sections: z.array(DeliveryReportSectionSchema).min(DELIVERY_REPORT_SECTION_IDS.length),
});

export type DeliveryReportSection = z.infer<typeof DeliveryReportSectionSchema>;
export type DeliveryReport = z.infer<typeof DeliveryReportSchema>;
