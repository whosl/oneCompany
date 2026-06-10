import { describe, expect, it } from "vitest";
import { shouldUseUiV2 } from "./route-mode";

describe("project console route mode", () => {
  it("enables UI v2 from the query flag", () => {
    expect(shouldUseUiV2("v2", undefined)).toBe(true);
  });

  it("enables UI v2 from the environment default", () => {
    expect(shouldUseUiV2(undefined, "1")).toBe(true);
  });

  it("uses UI v2 by default", () => {
    expect(shouldUseUiV2(undefined, undefined)).toBe(true);
  });

  it("keeps an explicit legacy fallback", () => {
    expect(shouldUseUiV2("legacy", undefined)).toBe(false);
  });

  it("allows an environment rollback during the release window", () => {
    expect(shouldUseUiV2(undefined, "0")).toBe(false);
  });
});
