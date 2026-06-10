import { describe, expect, it } from "vitest";
import { REDACTED, redact, redactDeep } from "./redaction.js";

describe("redact — shared", () => {
  it("redacts secret-like tokens and explicit secret values", () => {
    const secret = "sk-test1234567890abcdef";
    const result = redact(`token=${secret}`, { FAKE_OPENAI_KEY: secret });
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain(REDACTED);
    expect(result.incidents.length).toBeGreaterThan(0);
  });

  it("redacts nested string fields", () => {
    const secret = "sk-test1234567890abcdef";
    const result = redactDeep({
      type: "agent.error",
      message: `failed with ${secret}`,
    });
    expect(result.value.message).not.toContain(secret);
    expect(result.value.message).toContain(REDACTED);
    expect(result.incidents.length).toBeGreaterThan(0);
  });
});
