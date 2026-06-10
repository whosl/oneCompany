import { describe, expect, it } from "vitest";
import { resolveConsoleUiMode, shouldUseUiV2 } from "./route-mode";

describe("project console route mode", () => {
  it("enables UI v3 from the query flag", () => {
    expect(resolveConsoleUiMode("v3", undefined)).toBe("v3");
  });

  it("enables UI v2 from the query flag", () => {
    expect(resolveConsoleUiMode("v2", undefined)).toBe("v2");
    expect(shouldUseUiV2("v2", undefined)).toBe(true);
  });

  it("enables UI v3 from the environment default", () => {
    expect(resolveConsoleUiMode(undefined, "v3")).toBe("v3");
  });

  it("uses UI v2 by default", () => {
    expect(resolveConsoleUiMode(undefined, undefined)).toBe("v2");
    expect(shouldUseUiV2(undefined, undefined)).toBe(true);
  });

  it("keeps an explicit legacy fallback", () => {
    expect(resolveConsoleUiMode("legacy", undefined)).toBe("legacy");
    expect(shouldUseUiV2("legacy", undefined)).toBe(false);
  });

  it("allows an environment rollback during the release window", () => {
    expect(resolveConsoleUiMode(undefined, "0")).toBe("legacy");
    expect(shouldUseUiV2(undefined, "0")).toBe(false);
  });
});
