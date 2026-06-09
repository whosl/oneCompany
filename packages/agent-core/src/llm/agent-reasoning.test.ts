import { z } from "zod";
import { describe, expect, it } from "vitest";
import { splitReasoningFromOutput, withReasoningFields } from "./agent-reasoning.js";

describe("agent reasoning fields", () => {
  it("extends output schema with plan/observation/reflection", () => {
    const schema = withReasoningFields(
      z.object({
        score: z.number(),
      }),
    );

    const parsed = schema.parse({
      score: 42,
      plan: "Score completeness",
      observation: "Read state",
      reflection: "Done",
    });

    expect(parsed.score).toBe(42);
    expect(parsed.plan).toBe("Score completeness");
  });

  it("splits reasoning from task output", () => {
    const { output, reasoning } = splitReasoningFromOutput({
      completenessScore: 80,
      gaps: [],
      plan: "Check gaps",
      observation: "State loaded",
      reflection: "Scored",
    });

    expect(output).toEqual({ completenessScore: 80, gaps: [] });
    expect(reasoning.plan).toBe("Check gaps");
    expect(reasoning.observation).toBe("State loaded");
    expect(reasoning.reflection).toBe("Scored");
  });

  it("applies defaults when reasoning fields are omitted", () => {
    const schema = withReasoningFields(z.object({ score: z.number() }));
    const parsed = schema.parse({ score: 1 });
    expect(parsed.score).toBe(1);

    const { reasoning } = splitReasoningFromOutput(parsed as Record<string, unknown>);
    expect(reasoning.plan).toBe("Planned next step");
    expect(reasoning.observation).toBe("Processed structured inputs");
    expect(reasoning.reflection).toBe("Completed structured output");
  });
});
