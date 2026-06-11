import { describe, expect, it } from "vitest";
import { parseCodingServerListeningUrl } from "./opencode-server.js";

describe("parseCodingServerListeningUrl", () => {
  it("parses opencode serve stdout", () => {
    const url = parseCodingServerListeningUrl(
      "opencode server listening on http://127.0.0.1:4096\n",
    );
    expect(url).toBe("http://127.0.0.1:4096");
  });

  it("parses mimo (mimocode) serve stdout", () => {
    const url = parseCodingServerListeningUrl(
      "Warning: something\nmimocode server listening on http://127.0.0.1:4999\n",
    );
    expect(url).toBe("http://127.0.0.1:4999");
  });
});
