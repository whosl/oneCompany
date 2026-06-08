const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export type GateRecord = {
  id: string;
  projectId: string;
  gateType: string;
  status: "open" | "resolved";
  options: string[];
  decision: string | null;
};

export function formatGateOptionLabel(option: string): string {
  return option.replaceAll("_", " ");
}

export async function fetchOpenGates(projectId: string): Promise<GateRecord[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/gates`);
  if (!response.ok) {
    throw new Error("Failed to load gates");
  }
  const body = (await response.json()) as { gates: GateRecord[] };
  return body.gates;
}

export async function resolveGate(input: {
  gateId: string;
  decision: string;
  customText?: string;
}): Promise<GateRecord> {
  const response = await fetch(`${API_BASE}/gates/${input.gateId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: input.decision,
      customText: input.customText,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to resolve gate");
  }
  return (await response.json()) as GateRecord;
}
