import { z } from "zod";

export const ChangeRequestKindSchema = z.enum(["skip_slice", "requirement_change"]);
export type ChangeRequestKind = z.infer<typeof ChangeRequestKindSchema>;

export const ChangeRequestImpactSchema = z.enum(["queue_only", "architecture", "unknown"]);
export type ChangeRequestImpact = z.infer<typeof ChangeRequestImpactSchema>;

export const ChangeRequestStatusSchema = z.enum(["open", "resolved"]);
export type ChangeRequestStatus = z.infer<typeof ChangeRequestStatusSchema>;

export const CreateChangeRequestInputSchema = z.object({
  summary: z.string().min(1),
  kind: ChangeRequestKindSchema.default("requirement_change"),
  details: z.string().optional(),
});

export type CreateChangeRequestInput = z.infer<typeof CreateChangeRequestInputSchema>;
