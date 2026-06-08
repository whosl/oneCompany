import { describe, expect, it } from "vitest";
import { parsePlaywrightJson } from "./playwright.js";

describe("parsePlaywrightJson", () => {
  it("passes when unexpected is zero", () => {
    const result = parsePlaywrightJson(
      JSON.stringify({ stats: { unexpected: 0, expected: 2 } }),
    );
    expect(result.passed).toBe(true);
  });

  it("collects artifact paths", () => {
    const result = parsePlaywrightJson(
      JSON.stringify({
        stats: { unexpected: 1, expected: 0 },
        suites: [
          {
            specs: [
              {
                tests: [
                  {
                    results: [
                      {
                        attachments: [{ path: "trace.zip" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.artifactRefs).toContain("trace.zip");
  });
});
