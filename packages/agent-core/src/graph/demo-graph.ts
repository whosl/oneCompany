import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { emit } from "@oc/shared";
import type { DemoGraphInput, DemoGraphState, OrchestrationContext } from "./types.js";

const DemoGraphAnnotation = Annotation.Root({
  projectId: Annotation<string>,
  agentIdAtVersion: Annotation<string>,
  attempts: Annotation<number>,
  maxAttempts: Annotation<number>,
  done: Annotation<boolean>,
  lastRunFailed: Annotation<boolean>,
  needsGate: Annotation<boolean>,
  forceFail: Annotation<boolean>,
});

function createInitialState(input: DemoGraphInput): DemoGraphState {
  return {
    projectId: input.projectId,
    agentIdAtVersion: input.agentIdAtVersion,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 2,
    done: false,
    lastRunFailed: false,
    needsGate: false,
    forceFail: input.forceFail ?? false,
  };
}

function routeAfterAgent(state: DemoGraphState): "gate" | "finish" {
  if (state.lastRunFailed && state.attempts >= state.maxAttempts) {
    return "gate";
  }
  return "finish";
}

export function buildDemoGraph(ctx: OrchestrationContext) {
  const runAgentNode = async (state: DemoGraphState): Promise<Partial<DemoGraphState>> => {
    if (state.attempts >= state.maxAttempts) {
      return { needsGate: true };
    }

    const result = await ctx.runAgent({
      projectId: state.projectId,
      agentIdAtVersion: state.agentIdAtVersion,
      task: { demo: true },
      forceFail: state.forceFail,
    });

    if (ctx.onEvent) {
      // runAgent already emits; host may also broadcast via onEvent inside executor ctx.
    }

    return {
      attempts: state.attempts + 1,
      lastRunFailed: result.failed,
    };
  };

  const gateNode = async (state: DemoGraphState): Promise<Partial<DemoGraphState>> => {
    if (ctx.gateHooks) {
      const gate = ctx.gateHooks.createGate(state.projectId, "demo_retry", [
        "retry",
        "abort",
      ]);
      await ctx.gateHooks.waitForGate(gate.id);
    }
    return { needsGate: true };
  };

  const finishNode = async (state: DemoGraphState): Promise<Partial<DemoGraphState>> => {
    const envelope = emit(ctx.db, {
      projectId: state.projectId,
      payload: {
        type: "artifact.created",
        projectId: state.projectId,
        artifactId: `demo-${state.projectId}`,
        path: "demo/complete",
      },
    });
    ctx.onEvent?.(envelope);
    return { done: true };
  };

  const graph = new StateGraph(DemoGraphAnnotation)
    .addNode("runAgent", runAgentNode)
    .addNode("gate", gateNode)
    .addNode("finish", finishNode)
    .addEdge(START, "runAgent")
    .addConditionalEdges("runAgent", routeAfterAgent, {
      gate: "gate",
      finish: "finish",
    })
    .addEdge("gate", END)
    .addEdge("finish", END);

  return graph.compile();
}

export async function runDemoGraph(
  ctx: OrchestrationContext,
  input: DemoGraphInput,
): Promise<DemoGraphState> {
  const graph = buildDemoGraph(ctx);
  const result = await graph.invoke(createInitialState(input));
  return result as DemoGraphState;
}
