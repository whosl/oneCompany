import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "./redaction.js";

describe("redact — shared", () => {
  it("redacts secret-like tokens and explicit secret values", () => {
    const secret = "sk-test1234567890abcdef";
    const result = redact(`token=${secret}`, { FAKE_OPENAI_KEY: secret });
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain(REDACTED);
    expect(result.incidents.length).toBeGreaterThan(0);
  });
});
