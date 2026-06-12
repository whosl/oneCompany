import { classifyTaiziWithRules, isStatusInquiry, loadTaiziChatHistory } from "@oc/agent-core";
import { eq } from "drizzle-orm";
import { emit, events, type TaiziContext } from "@oc/shared";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

const baseContext: TaiziContext = {
  projectStatus: "Developing",
  openGates: [],
  pendingQuestionCount: 0,
  hasLiveSession: false,
};

describe("taizi rules classifier", () => {
  it("classifies 继续 as continue", () => {
    const decision = classifyTaiziWithRules("继续", baseContext);
    expect(decision?.intent).toBe("continue");
  });

  it("classifies 暂停 as pause and 停 as stop", () => {
    expect(classifyTaiziWithRules("暂停", baseContext)?.intent).toBe("pause");
    expect(classifyTaiziWithRules("停", baseContext)?.intent).toBe("stop");
  });

  it("classifies 加一个xxx功能 as change_request during development", () => {
    const decision = classifyTaiziWithRules("加一个导出 Excel 的功能", baseContext);
    expect(decision?.intent).toBe("change_request");
    expect(decision?.payload).toContain("导出 Excel");
  });

  it("treats ! prefix as hard interrupt when a session is live", () => {
    const decision = classifyTaiziWithRules("!改用深色主题", {
      ...baseContext,
      hasLiveSession: true,
    });
    expect(decision?.intent).toBe("change_request");
    expect(decision?.abort).toBe(true);
    expect(decision?.payload).toBe("改用深色主题");
  });

  it("maps 批准 to the first open gate's approve option", () => {
    const decision = classifyTaiziWithRules("批准", {
      ...baseContext,
      openGates: [{ id: "g1", gateType: "tech_plan_confirm", options: ["approve", "reject_and_redo"] }],
    });
    expect(decision?.intent).toBe("gate_decision");
    expect(decision?.gateDecision).toBe("approve");
    expect(decision?.gateId).toBe("g1");
  });

  it("classifies 跳过 as skip_clarification only with pending questions", () => {
    expect(
      classifyTaiziWithRules("跳过", { ...baseContext, pendingQuestionCount: 3 })?.intent,
    ).toBe("skip_clarification");
    expect(classifyTaiziWithRules("跳过", baseContext)).toBeUndefined();
  });

  it("returns undefined for ambiguous text (defer to LLM/fallback)", () => {
    expect(classifyTaiziWithRules("帮我看看这个项目怎么样", baseContext)).toBeUndefined();
  });

  it("classifies 下一步是啥 as status_query not change_request", () => {
    expect(isStatusInquiry("下一步是啥")).toBe(true);
    expect(classifyTaiziWithRules("下一步是啥", baseContext)?.intent).toBe("status_query");
    expect(classifyTaiziWithRules("目前卡在哪儿", baseContext)?.intent).toBe("status_query");
  });
});

describe("POST /projects/:id/taizi/message", () => {
  it("rejects empty messages", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Taizi Empty");
      const response = await app.request(`/projects/${project.id}/taizi/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "  " }),
      });
      expect(response.status).toBe(400);
    } finally {
      cleanup();
    }
  });

  it("pauses an active project on 暂停 and emits taizi.routed", async () => {
    const { app, projects, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Taizi Pause");
      const response = await app.request(`/projects/${project.id}/taizi/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "暂停" }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { intent: string; action: string; stateChanged: boolean };
      expect(body.intent).toBe("pause");
      expect(body.action).toBe("project.pause");
      expect(body.stateChanged).toBe(true);
      expect(projects.getProject(project.id)?.status).toBe("Paused");

      const routed = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((event) => event.type === "taizi.routed");
      expect(routed).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("resumes a paused project on 继续", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Taizi Resume");
      projects.setStatus(project.id, "Asking Questions", "test");
      projects.pauseProject(project.id);

      const response = await app.request(`/projects/${project.id}/taizi/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "继续" }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { action: string };
      expect(body.action).toBe("project.resume");
      expect(projects.getProject(project.id)?.status).toBe("Asking Questions");
    } finally {
      cleanup();
    }
  });

  it("answers status queries without changing state", async () => {
    const { app, projects, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Taizi Status");
      const response = await app.request(`/projects/${project.id}/taizi/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "进度" }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        intent: string;
        action: string;
        reply: string;
        stateChanged: boolean;
      };
      expect(body.intent).toBe("status_query");
      expect(body.action).toBe("taizi.research");
      expect(body.reply).toContain("Draft Requirement");
      expect(body.stateChanged).toBe(false);
      expect(projects.getProject(project.id)?.status).toBe("Draft Requirement");
    } finally {
      cleanup();
    }
  });

  it("returns 404 for unknown projects", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const response = await app.request("/projects/nope/taizi/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "继续" }),
      });
      expect(response.status).toBe(404);
    } finally {
      cleanup();
    }
  });

  it("loads prior taizi.routed events as conversation history", async () => {
    const { app, projects, db, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Taizi Memory");
      emit(db, {
        projectId: project.id,
        agentId: "taizi",
        payload: {
          type: "taizi.routed",
          projectId: project.id,
          message: "我们刚才聊了什么主题",
          intent: "chat",
          action: "taizi.research",
          reply: "主题是导出 Excel 功能",
        },
      });

      expect(loadTaiziChatHistory(db, project.id)).toEqual([
        { role: "user", content: "我们刚才聊了什么主题" },
        { role: "assistant", content: "主题是导出 Excel 功能" },
      ]);

      const response = await app.request(`/projects/${project.id}/taizi/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "那按刚才说的做" }),
      });
      expect(response.status).toBe(200);

      const routed = db
        .select()
        .from(events)
        .where(eq(events.project_id, project.id))
        .all()
        .filter((row) => row.type === "taizi.routed");
      expect(routed.length).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });
});
