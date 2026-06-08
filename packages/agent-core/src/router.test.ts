import { describe, expect, it } from "vitest";
import { pickModel } from "./router.js";

describe("model router — M2", () => {
  it("maps cheap tier to gpt-4.1-mini by default", () => {
    expect(pickModel("cheap")).toBe("gpt-4.1-mini");
  });

  it("maps standard tier to gpt-4.1 by default", () => {
    expect(pickModel("standard")).toBe("gpt-4.1");
  });

  it("maps strong tier to o4-mini by default", () => {
    expect(pickModel("strong")).toBe("o4-mini");
  });
});
