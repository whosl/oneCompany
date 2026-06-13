import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ChatOpenAI } from "@langchain/openai";

const MAX_TOOL_STEPS = 3;

export async function runOptionalToolLoop(
  model: ChatOpenAI,
  messages: BaseMessage[],
  tools: StructuredToolInterface[],
): Promise<BaseMessage[]> {
  if (tools.length === 0) {
    return messages;
  }

  const bound = model.bindTools(tools);
  const current = [...messages];

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const response = await bound.invoke(current);
    current.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    for (const toolCall of toolCalls) {
      const matched = tools.find((candidate) => candidate.name === toolCall.name);
      if (!matched) {
        current.push(
          new ToolMessage({
            content: `Tool not found: ${toolCall.name}`,
            tool_call_id: toolCall.id ?? toolCall.name,
          }),
        );
        continue;
      }
      const output = await matched.invoke(toolCall.args);
      current.push(
        new ToolMessage({
          content: typeof output === "string" ? output : JSON.stringify(output),
          tool_call_id: toolCall.id ?? toolCall.name,
        }),
      );
    }
  }

  return current;
}
