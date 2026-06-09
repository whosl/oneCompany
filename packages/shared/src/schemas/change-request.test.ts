import { describe, expect, it } from "vitest";
import { ChangeRequestKindSchema, CreateChangeRequestInputSchema } from "./change-request.js";

describe("change request schema", () => {
  it("parses requirement change input", () => {
    const parsed = CreateChangeRequestInputSchema.parse({
      summary: "Add export button",
      kind: "requirement_change",
    });
    expect(parsed.kind).toBe("requirement_change");
    expect(ChangeRequestKindSchema.parse("skip_slice")).toBe("skip_slice");
  });
});
