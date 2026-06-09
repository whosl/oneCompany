import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentDefinition } from "@oc/shared";
import { callTool } from "../tools.js";
import {
  assertAgentMayUseTool,
  resolveToolsForAgent,
  type ToolExecutionContext,
} from "./registry.js";
import { ensureLocalToolsRegistered } from "./local-tools.js";

export function bindAgentTools(
  agent: AgentDefinition,
  execCtx: ToolExecutionContext,
): StructuredToolInterface[] {
  ensureLocalToolsRegistered();
  if (agent.tools.length === 0) {
    return [];
  }

  const definitions = resolveToolsForAgent(agent.tools);
  for (const definition of definitions) {
    assertAgentMayUseTool(agent, definition);
  }

  return definitions.map((definition) =>
    tool(
      async (args) => {
        const toolCtx: ToolExecutionContext = {
          ...execCtx,
          task: execCtx.task,
        };

        const result = await callTool(toolCtx, {
          toolName: `${definition.id}@${definition.version}`,
          args,
          impl: () => definition.impl(args, toolCtx),
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        return typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output);
      },
      {
        name: definition.id,
        description: definition.description,
        schema: definition.argsSchema,
      },
    ),
  );
}
