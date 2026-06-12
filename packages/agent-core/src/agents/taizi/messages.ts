import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { TaiziChatTurn } from "@oc/shared";

const HISTORY_PREAMBLE =
  "下面是与用户之前的对话（由远到近）。请结合历史理解指代（如「刚才」「那个」「按上一条」），但调度决策仍须基于当前项目状态。";

export function appendHistorySection(systemPrompt: string, history: TaiziChatTurn[]): string {
  if (history.length === 0) return systemPrompt;
  return `${systemPrompt}\n\n== ${HISTORY_PREAMBLE} ==`;
}

/** Build LangChain messages: system + prior turns + current user message. */
export function buildTaiziChatMessages(
  systemPrompt: string,
  history: TaiziChatTurn[],
  currentMessage: string,
): BaseMessage[] {
  const messages: BaseMessage[] = [
    new SystemMessage(appendHistorySection(systemPrompt, history)),
  ];
  for (const turn of history) {
    messages.push(
      turn.role === "user" ? new HumanMessage(turn.content) : new AIMessage(turn.content),
    );
  }
  messages.push(new HumanMessage(currentMessage));
  return messages;
}
