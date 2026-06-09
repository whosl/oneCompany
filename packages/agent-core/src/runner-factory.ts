import type { Db } from "@oc/shared";
import {
  assertOpenAiConfigured,
  resolveEngineMode,
  type EngineMode,
} from "./engine-mode.js";
import { runLangChainDevAgent, runLangChainRequirementAgent } from "./agents/langchain-runner.js";
import { runScriptedDevAgent } from "./agents/development/scripted-runner.js";
import type { DevAgentTask, DevFixtureProfile } from "./agents/development/types.js";
import { runScriptedRequirementAgent } from "./agents/requirement/scripted-runner.js";
import type {
  RequirementAgentTask,
  RequirementFixtureProfile,
} from "./agents/requirement/types.js";
import type { AgentRunner } from "./executor.js";

export type RunnerFactoryOptions = {
  mode?: EngineMode;
  requirementProfile?: RequirementFixtureProfile;
  devProfile?: DevFixtureProfile;
};

export function createRequirementRunner(
  db: Db,
  options: RunnerFactoryOptions = {},
): AgentRunner {
  const mode = options.mode ?? resolveEngineMode();
  const profile = options.requirementProfile ?? "vague";

  if (mode === "stub") {
    return async (_runCtx, agentIdAtVersion, task) => ({
      output: runScriptedRequirementAgent(agentIdAtVersion, {
        ...(task as RequirementAgentTask),
        profile,
      }),
    });
  }

  assertOpenAiConfigured();
  return async (runCtx, agentIdAtVersion, task) => {
    const result = await runLangChainRequirementAgent(
      runCtx,
      agentIdAtVersion,
      task as RequirementAgentTask,
    );
    return {
      output: result.output,
      summaries: {
        plan: result.reasoning.plan,
        act: `Structured output via ${result.modelId}`,
        observe: result.reasoning.observation,
        reflect: result.reasoning.reflection,
      },
    };
  };
}

export function createDevelopmentRunner(
  db: Db,
  options: RunnerFactoryOptions = {},
): AgentRunner {
  const mode = options.mode ?? resolveEngineMode();
  const profile = options.devProfile ?? "minimal";

  if (mode === "stub") {
    return async (_runCtx, agentIdAtVersion, task) => ({
      output: runScriptedDevAgent(agentIdAtVersion, {
        ...(task as DevAgentTask),
        profile,
      }),
    });
  }

  assertOpenAiConfigured();
  return async (runCtx, agentIdAtVersion, task) => {
    const result = await runLangChainDevAgent(runCtx, agentIdAtVersion, task as DevAgentTask);
    return {
      output: result.output,
      summaries: {
        plan: result.reasoning.plan,
        act: `Structured output via ${result.modelId}`,
        observe: result.reasoning.observation,
        reflect: result.reasoning.reflection,
      },
    };
  };
}
