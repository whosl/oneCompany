import { z } from "zod";

export const AgentReasoningFieldsSchema = z.object({
  plan: z.string().describe("Brief plan summary visible to the user (no hidden chain-of-thought)"),
  observation: z.string().describe("What was observed from the inputs"),
  reflection: z.string().describe("Brief reflection on the outcome"),
});

export type AgentReasoningFields = z.infer<typeof AgentReasoningFieldsSchema>;

export function withReasoningFields<T extends z.ZodRawShape>(outputSchema: z.ZodObject<T>) {
  return outputSchema.extend(AgentReasoningFieldsSchema.shape);
}

const REASONING_KEYS = ["plan", "observation", "reflection"] as const;

export function splitReasoningFromOutput(raw: Record<string, unknown>): {
  output: Record<string, unknown>;
  reasoning: AgentReasoningFields;
} {
  const output: Record<string, unknown> = { ...raw };
  const reasoning: Partial<AgentReasoningFields> = {};

  for (const key of REASONING_KEYS) {
    const value = output[key];
    if (typeof value === "string") {
      reasoning[key] = value;
    }
    delete output[key];
  }

  return {
    output,
    reasoning: AgentReasoningFieldsSchema.parse({
      plan: reasoning.plan ?? "Planned next step",
      observation: reasoning.observation ?? "Processed structured inputs",
      reflection: reasoning.reflection ?? "Completed structured output",
    }),
  };
}
