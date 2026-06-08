import type { EventEnvelope, Db } from "@oc/shared";
import type { RunAgentInput, RunAgentResult } from "../executor.js";

export type GateHooks = {
  createGate: (projectId: string, gateType: string, options: string[]) => { id: string };
  waitForGate: (gateId: string) => Promise<string>;
};

export type OrchestrationContext = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
  runAgent: (
    input: RunAgentInput,
  ) => Promise<RunAgentResult>;
  gateHooks?: GateHooks;
};

export type DemoGraphInput = {
  projectId: string;
  agentIdAtVersion: string;
  maxAttempts?: number;
  forceFail?: boolean;
};

export type DemoGraphState = {
  projectId: string;
  agentIdAtVersion: string;
  attempts: number;
  maxAttempts: number;
  done: boolean;
  lastRunFailed: boolean;
  needsGate: boolean;
  forceFail: boolean;
};
