import { resolveEngineMode, type EngineMode } from "../engine-mode.js";
import { createOpencodeHarness } from "./opencode-harness.js";
import { StubHarness } from "./stub.js";
import type { CodingHarness } from "./types.js";

export function resolveCodingHarness(mode: EngineMode = resolveEngineMode()): CodingHarness {
  if (mode === "stub") {
    return StubHarness;
  }
  return createOpencodeHarness();
}
