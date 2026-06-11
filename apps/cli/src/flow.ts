import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ApiClient } from "./api.js";
import { applyEnvelope } from "./events.js";
import {
  bootstrapEventsFromSnapshot,
  hydrateTuiFromSnapshot,
} from "./projection.js";
import { attachKeyHandlers } from "./input.js";
import {
  enterScreen,
  leaveScreen,
  pushLog,
  type RenderState,
  render,
} from "./render.js";
import { startEventStream, type SseHandle } from "./sse.js";
import type {
  CliOptions,
  DevelopmentRunResult,
  EventEnvelope,
  RequirementRunResult,
} from "./types.js";

const DEFAULT_DEPLOY_URL = "https://preview.example.com";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultGateDecision(gateType: string, options: string[] = []): string {
  const preferred = (() => {
    switch (gateType) {
      case "requirement_stuck":
        return "force_continue";
      case "requirement_confirm":
      case "tech_plan_confirm":
      case "dangerous_operation":
      case "deployment":
        return "approve";
      case "slice_failure":
        return "retry";
      case "change_review":
        return "update_plan";
      case "final_acceptance":
        return "accept";
      default:
        return options[0] ?? "approve";
    }
  })();
  return options.includes(preferred) ? preferred : (options[0] ?? preferred);
}

async function resolveGateById(
  api: ApiClient,
  state: RenderState,
  gateId: string,
  fallbackType = "requirement_confirm",
  fallbackOptions: string[] = [],
): Promise<void> {
  if (!state.projectId) return;
  const open = await api.listGates(state.projectId);
  const gate = open.find((g) => g.id === gateId) ?? open[0];
  if (!gate) return;
  await resolvePrimaryGate(
    api,
    state,
    gate.id,
    gate.gateType || fallbackType,
    gate.options.length ? gate.options : fallbackOptions,
  );
}

function defaultAnswers(questions: string[]): string[] {
  return questions.map(
    (q, i) =>
      `Proceed with sensible defaults for enterprise HR workflow. (${i + 1}: ${q.slice(0, 60)})`,
  );
}

async function promptChoice(
  state: RenderState,
  title: string,
  options: string[],
): Promise<string> {
  state.mode = title.includes("question") ? "question" : "gate";
  state.gateType = title;
  state.gateOptions = options;
  state.prompt = `Pick 1-${options.length} or type decision:`;
  render(state);

  const rl = readline.createInterface({ input, output });
  try {
    const raw = await rl.question("\x1b[?25h\x1b[?1049l\x1b[?25h\n› ");
    resumeScreen();
    const trimmed = raw.trim();
    const num = Number(trimmed);
    if (Number.isInteger(num) && num >= 1 && num <= options.length) {
      return options[num - 1]!;
    }
    if (options.includes(trimmed)) return trimmed;
    return options[0]!;
  } finally {
    rl.close();
    state.mode = "running";
    state.gateOptions = undefined;
    state.prompt = undefined;
  }
}

function resumeScreen(): void {
  enterScreen();
}

async function refreshSnapshot(api: ApiClient, state: RenderState): Promise<void> {
  if (!state.projectId) return;
  try {
    const snap = await api.snapshot(state.projectId);
    state.snapshot = snap;
    state.projectStatus = snap.project.status;
    state.projectName = snap.project.name;
    bootstrapEventsFromSnapshot(state.view, snap, state.eventContext);
    hydrateTuiFromSnapshot(state.view, snap, state.mode);
  } catch {
    // snapshot is best-effort
  }
}

async function resolveNestedGates(
  api: ApiClient,
  state: RenderState,
  skipId?: string,
): Promise<void> {
  if (!state.projectId) return;
  const open = await api.listGates(state.projectId);
  for (const gate of open) {
    if (gate.id === skipId) continue;
    const decision = state.options.auto
      ? defaultGateDecision(gate.gateType, gate.options)
      : await promptChoice(state, gate.gateType, gate.options);
    pushLog(state, "gate", `resolve ${gate.gateType} → ${decision}`);
    render(state);
    await api.resolveGate(gate.id, decision);
    await sleep(200);
  }
}

async function resolvePrimaryGate(
  api: ApiClient,
  state: RenderState,
  gateId: string,
  gateType: string,
  options: string[],
): Promise<void> {
  const decision = state.options.auto
    ? defaultGateDecision(gateType, options)
    : await promptChoice(
        state,
        gateType,
        options.length ? options : [defaultGateDecision(gateType, options)],
      );

  pushLog(state, "gate", `resolve ${gateType} → ${decision}`);
  render(state);

  const poller = state.options.auto
    ? setInterval(() => {
        void resolveNestedGates(api, state, gateId);
      }, 400)
    : undefined;

  try {
    await api.resolveGate(gateId, decision);
  } finally {
    if (poller) clearInterval(poller);
  }

  await resolveNestedGates(api, state);
  await refreshSnapshot(api, state);
}

async function runRequirementPhase(
  api: ApiClient,
  state: RenderState,
): Promise<RequirementRunResult> {
  if (!state.projectId) throw new Error("missing projectId");

  const profile = state.stubProfilesEnabled ? "complete" : undefined;
  let step = await api.startRequirement(state.projectId, state.options.requirement, profile);
  pushLog(state, "status", `requirement started → ${step.phase}`);
  render(state);

  for (let round = 0; round < 8 && step.phase === "awaiting_answers"; round += 1) {
    const questions = step.questions ?? [];
    if (questions.length === 0) break;

    pushLog(state, "info", `round ${round + 1}: ${questions.length} question(s)`);
    render(state);

    const answers = state.options.auto
      ? defaultAnswers(questions)
      : await (async () => {
          state.mode = "question";
          state.prompt = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
          render(state);
          const rl = readline.createInterface({ input, output });
          try {
            const raw = await rl.question("\x1b[?25h\x1b[?1049l\x1b[?25h\nanswers (comma-separated) › ");
            resumeScreen();
            const parts = raw.split(",").map((s: string) => s.trim()).filter(Boolean);
            return parts.length >= questions.length
              ? parts.slice(0, questions.length)
              : defaultAnswers(questions);
          } finally {
            rl.close();
            state.mode = "running";
          }
        })();

    step = await api.submitAnswers(state.projectId, answers);
    pushLog(state, "status", `answers submitted → ${step.phase} / ${step.projectStatus}`);
    render(state);
    await refreshSnapshot(api, state);
  }

  if (step.phase === "awaiting_gate" && step.gateId) {
    await resolveGateById(
      api,
      state,
      step.gateId,
      step.gateType ?? "requirement_confirm",
      step.gateOptions ?? ["approve", "force_continue"],
    );
  }

  await waitForStatus(api, state, "PRD Ready", 60_000);
  return step;
}

async function waitForStatus(
  api: ApiClient,
  state: RenderState,
  target: string,
  timeoutMs = 120_000,
): Promise<void> {
  if (!state.projectId) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const project = await api.getProject(state.projectId);
    state.projectStatus = project.status;
    render(state);
    if (project.status === target) return;

    const gates = await api.listGates(state.projectId);
    for (const gate of gates) {
      await resolvePrimaryGate(api, state, gate.id, gate.gateType, gate.options);
    }
    await sleep(800);
  }
  throw new Error(`Timed out waiting for status ${target}`);
}

async function runDevelopmentPhase(
  api: ApiClient,
  state: RenderState,
): Promise<DevelopmentRunResult> {
  if (!state.projectId) throw new Error("missing projectId");

  const profile = state.stubProfilesEnabled ? "testing_pass" : undefined;
  let step = await api.startDevelopment(state.projectId, profile);
  pushLog(state, "status", `development started → ${step.phase} / ${step.gateType ?? "—"}`);
  render(state);

  if (step.phase === "awaiting_gate" && step.gateId) {
    await resolvePrimaryGate(
      api,
      state,
      step.gateId,
      step.gateType ?? "tech_plan_confirm",
      step.gateOptions ?? ["approve"],
    );
    step = await api.developmentStatus(state.projectId);
  }

  await waitForStatus(api, state, "Testing", state.stubProfilesEnabled ? 30_000 : 300_000);
  return step;
}

async function runTestingAndDelivery(api: ApiClient, state: RenderState): Promise<void> {
  if (!state.projectId) throw new Error("missing projectId");

  pushLog(state, "status", "starting testing phase…");
  render(state);
  await api.startTesting(state.projectId, true);
  await refreshSnapshot(api, state);

  let gates = await api.listGates(state.projectId);
  for (const gate of gates) {
    if (gate.gateType === "deployment") {
      await api.setDeploymentUrl(state.projectId, DEFAULT_DEPLOY_URL);
      pushLog(state, "info", `deployment url → ${DEFAULT_DEPLOY_URL}`);
      render(state);
    }
    await resolvePrimaryGate(api, state, gate.id, gate.gateType, gate.options);
  }

  await waitForStatus(api, state, "Awaiting Acceptance", 60_000);

  gates = await api.listGates(state.projectId);
  for (const gate of gates) {
    if (gate.gateType === "final_acceptance") {
      await resolvePrimaryGate(api, state, gate.id, gate.gateType, gate.options);
    }
  }

  await waitForStatus(api, state, "Delivered", 30_000);
}

export async function runFullFlow(api: ApiClient, state: RenderState): Promise<void> {
  state.mode = "running";
  render(state);

  const project = await api.createProject(state.options.projectName);
  state.projectId = project.id;
  state.projectStatus = project.status;
  state.projectName = project.name;
  state.view.globalStatus = "INITIALIZING";
  state.view.requirement.appName = project.name;
  state.view.requirement.summary = state.options.requirement;
  pushLog(state, "status", `project created ${project.id}`);
  render(state);

  let sse: SseHandle | undefined;
  sse = startEventStream(state.options.apiBase, project.id, 0, (envelope: EventEnvelope) => {
    applyEnvelope(state, envelope);
    if (state.snapshot) hydrateTuiFromSnapshot(state.view, state.snapshot, state.mode);
    render(state);
  });

  const poll = setInterval(() => {
    void refreshSnapshot(api, state).then(() => render(state));
  }, 2000);

  let aborted = false;
  const detachKeys = attachKeyHandlers(state, () => {
    aborted = true;
    state.mode = "error";
    state.prompt = "Quit requested (q)";
    render(state);
  });

  try {
    if (aborted) throw new Error("Quit requested");

    await runRequirementPhase(api, state);
    pushLog(state, "status", "requirement phase complete");
    render(state);

    await runDevelopmentPhase(api, state);
    pushLog(state, "status", "development phase complete");
    render(state);

    await runTestingAndDelivery(api, state);
    pushLog(state, "status", "delivered");
    state.mode = "done";
    state.prompt = `Done. Project ${project.id} → Delivered`;
    render(state);
  } catch (error) {
    state.mode = "error";
    state.prompt = error instanceof Error ? error.message : String(error);
    pushLog(state, "error", state.prompt);
    render(state);
    throw error;
  } finally {
    detachKeys();
    clearInterval(poll);
    sse?.stop();
    if (aborted) leaveScreen();
  }
}
