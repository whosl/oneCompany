import type { GateMetadata, StoredHumanGatePayload } from "./types.js";

export function serializeGatePayload(
  options: string[],
  metadata?: GateMetadata,
): string {
  const payload: StoredHumanGatePayload = {
    version: 1,
    options,
    metadata,
  };
  return JSON.stringify(payload);
}

export function parseGatePayload(raw: string): StoredHumanGatePayload {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return {
      version: 1,
      options: parsed as string[],
    };
  }
  const payload = parsed as StoredHumanGatePayload;
  return {
    version: 1,
    options: payload.options ?? [],
    metadata: payload.metadata,
  };
}
