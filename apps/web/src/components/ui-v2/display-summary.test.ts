import { describe, expect, it } from "vitest";
import { compactDisplaySummary } from "./display-summary";

describe("compactDisplaySummary", () => {
  it("keeps an already compact summary unchanged", () => {
    expect(compactDisplaySummary("Run final tests.")).toBe("Run final tests.");
  });

  it("uses the first meaningful sentence when it fits", () => {
    expect(
      compactDisplaySummary(
        "Implemented project routing and state guards. Additional verbose diagnostic output follows for the full run.",
        64,
      ),
    ).toBe("Implemented project routing and state guards.");
  });

  it("cuts long Chinese summaries without losing the full source contract", () => {
    const source = "正在实现多智能体编排控制台中的泳道分组、状态标记、资源跳转和完整的运行详情审计信息。";
    const compact = compactDisplaySummary(source, 24);
    expect(compact.length).toBeLessThanOrEqual(27);
    expect(compact.endsWith("...")).toBe(true);
  });
});
