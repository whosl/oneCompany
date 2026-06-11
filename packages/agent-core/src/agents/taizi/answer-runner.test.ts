import { describe, expect, it } from "vitest";
import { isWeakTaiziAnswer } from "./answer-runner.js";

describe("isWeakTaiziAnswer", () => {
  it("flags closing-only invitation without facts", () => {
    expect(
      isWeakTaiziAnswer("如果您想了解更具体的内容，比如代码变更详情、技术方案文档，随时可以问我。"),
    ).toBe(true);
  });

  it("accepts structured status answer", () => {
    expect(
      isWeakTaiziAnswer(
        "## 现状\n\n项目状态 Change Review；当前切片 slice-2；待确认门禁 change_review。\n\n## 建议下一步\n\n说「继续」放行。",
      ),
    ).toBe(false);
  });
});
