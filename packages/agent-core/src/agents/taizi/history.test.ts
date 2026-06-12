import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { emit } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestDb, seedProject } from "../../test-utils.js";
import { loadTaiziChatHistory, taiziRoutedPayloadsToTurns } from "./history.js";
import { buildTaiziChatMessages } from "./messages.js";

describe("taiziRoutedPayloadsToTurns", () => {
  it("converts routed payloads to chronological user/assistant turns", () => {
    const turns = taiziRoutedPayloadsToTurns(
      [
        { message: "现在到哪了", reply: "还在 PRD 阶段" },
        { message: "那下一步呢", reply: "说开始开发" },
      ],
      500,
    );
    expect(turns).toEqual([
      { role: "user", content: "现在到哪了" },
      { role: "assistant", content: "还在 PRD 阶段" },
      { role: "user", content: "那下一步呢" },
      { role: "assistant", content: "说开始开发" },
    ]);
  });

  it("truncates long turns", () => {
    const long = "x".repeat(100);
    const turns = taiziRoutedPayloadsToTurns([{ message: long, reply: "" }], 20);
    expect(turns[0]?.content).toBe(`${"x".repeat(20)}…`);
  });
});

describe("loadTaiziChatHistory", () => {
  it("loads recent taizi.routed events in chronological order", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db, "History Demo");
      emit(db, {
        projectId,
        agentId: "taizi",
        payload: {
          type: "taizi.routed",
          projectId,
          message: "进度",
          intent: "status_query",
          action: "taizi.research",
          reply: "状态 A",
        },
      });
      emit(db, {
        projectId,
        agentId: "taizi",
        payload: {
          type: "taizi.routed",
          projectId,
          message: "然后呢",
          intent: "chat",
          action: "taizi.research",
          reply: "状态 B",
        },
      });

      expect(loadTaiziChatHistory(db, projectId)).toEqual([
        { role: "user", content: "进度" },
        { role: "assistant", content: "状态 A" },
        { role: "user", content: "然后呢" },
        { role: "assistant", content: "状态 B" },
      ]);
    } finally {
      cleanup();
    }
  });

  it("respects maxTurns limit", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db, "History Limit");
      for (let i = 0; i < 5; i += 1) {
        emit(db, {
          projectId,
          agentId: "taizi",
          payload: {
            type: "taizi.routed",
            projectId,
            message: `msg-${i}`,
            intent: "chat",
            action: "taizi.research",
            reply: `reply-${i}`,
          },
        });
      }

      const history = loadTaiziChatHistory(db, projectId, { maxTurns: 2 });
      expect(history).toEqual([
        { role: "user", content: "msg-3" },
        { role: "assistant", content: "reply-3" },
        { role: "user", content: "msg-4" },
        { role: "assistant", content: "reply-4" },
      ]);
    } finally {
      cleanup();
    }
  });
});

describe("buildTaiziChatMessages", () => {
  it("interleaves system prompt, history, and current message", () => {
    const messages = buildTaiziChatMessages(
      "system",
      [
        { role: "user", content: "你好" },
        { role: "assistant", content: "你好，我是太子" },
      ],
      "刚才说的方案呢",
    );
    expect(messages).toHaveLength(4);
    expect(messages[0]).toBeInstanceOf(SystemMessage);
    expect((messages[0] as SystemMessage).content).toContain("system");
    expect((messages[0] as SystemMessage).content).toContain("之前的对话");
    expect(messages[1]).toBeInstanceOf(HumanMessage);
    expect(messages[2]).toBeInstanceOf(AIMessage);
    expect(messages[3]).toBeInstanceOf(HumanMessage);
    expect((messages[3] as HumanMessage).content).toBe("刚才说的方案呢");
  });
});
