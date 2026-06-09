import { describe, expect, it } from "vitest";
import {
  DELIVERY_REPORT_SECTION_IDS,
  DeliveryReportSchema,
} from "./delivery-report.js";

describe("delivery report schema", () => {
  it("requires all section ids", () => {
    const sections = DELIVERY_REPORT_SECTION_IDS.map((id) => ({
      id,
      title: id,
      content: "content",
    }));
    expect(() => DeliveryReportSchema.parse({ sections })).not.toThrow();
  });
});
