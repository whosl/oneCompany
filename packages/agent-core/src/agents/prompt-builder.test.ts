import { describe, expect, it } from "vitest";
import { buildReviewPrompt, buildTddPrompt } from "./prompt-builder.js";

describe("buildTddPrompt", () => {
  it("includes retry repair context before test instructions", () => {
    const prompt = buildTddPrompt({
      projectId: "project-1",
      sliceId: "slice-2",
      goal: "牌桌游戏核心",
      acceptanceChecks: ["typecheck passes"],
      testCommand: "pnpm vitest run tests/slice2.test.ts --reporter=json",
      retryContext: [
        "Previous typecheck failure repeated 2 time(s) for this slice.",
        "Latest failure evidence: tests passed but typecheck failed: src/table.ts(12,4): error TS2322",
      ],
      modelTier: "strong",
    });

    expect(prompt).toContain("Retry repair context from previous attempt(s):");
    expect(prompt).toContain("Previous typecheck failure repeated 2 time(s)");
    expect(prompt).toContain("Start from this evidence first");
    expect(prompt.indexOf("Retry repair context")).toBeLessThan(
      prompt.indexOf("Scoped test command"),
    );
  });

  it("injects tech context, predecessors, and repo file tree when provided", () => {
    const prompt = buildTddPrompt({
      projectId: "project-2",
      sliceId: "slice-3",
      goal: "充值、个人中心与游客限制",
      acceptanceChecks: ["充值页面可用"],
      testCommand: "pnpm vitest run tests/slice3.test.ts --reporter=json",
      modelTier: "strong",
      techContext: "Tech stack: TypeScript + Vite. Monorepo with client/ and server/.",
      predecessors: [
        {
          sliceId: "slice-1",
          title: "用户认证与游戏大厅",
          files: ["client/src/App.tsx", "server/src/routes/auth.ts"],
        },
        {
          sliceId: "slice-2",
          title: "牌桌游戏核心",
          files: ["client/src/pages/GameTablePage.tsx"],
        },
      ],
      repoFileTree: [
        "client/src/App.tsx",
        "server/src/index.ts",
        "package.json",
        "index.html",
      ],
    });

    expect(prompt).toContain("Tech context from the latest technical plan");
    expect(prompt).toContain("TypeScript + Vite");

    expect(prompt).toContain("Previously delivered slices");
    expect(prompt).toContain("slice-1: 用户认证与游戏大厅");
    expect(prompt).toContain("slice-2: 牌桌游戏核心");
    expect(prompt).toContain("client/src/pages/GameTablePage.tsx");

    expect(prompt).toContain("Existing repo files");
    expect(prompt).toContain("server/src/index.ts");
    expect(prompt).toContain("index.html");
  });

  it("omits global context sections when not provided", () => {
    const prompt = buildTddPrompt({
      projectId: "project-3",
      sliceId: "slice-1",
      goal: "first slice",
      acceptanceChecks: [],
      testCommand: "pnpm vitest run tests/slice1.test.ts --reporter=json",
      modelTier: "strong",
    });

    expect(prompt).not.toContain("Tech context from the latest technical plan");
    expect(prompt).not.toContain("Previously delivered slices");
    expect(prompt).not.toContain("Existing repo files");
  });
});

describe("buildReviewPrompt", () => {
  it("enforces grounding rules against hallucination", () => {
    const prompt = buildReviewPrompt({
      projectId: "project-1",
      sliceId: "slice-1",
      goal: "德州扑克牌桌",
      acceptanceChecks: ["牌桌渲染正确"],
      modelTier: "strong",
    });

    expect(prompt).toContain("GROUNDING RULES");
    expect(prompt).toContain("Scope-bound");
    expect(prompt).toContain(
      "Do NOT invent new requirements",
    );
    expect(prompt).toContain("Evidence-bound");
    expect(prompt).toContain("file:line");
    expect(prompt).toContain("Dependency claims");
    expect(prompt).toContain(
      "read an actual import/require statement",
    );
    expect(prompt).toContain("package.json");
    expect(prompt).toContain(
      "Fabricated dependency problems are forbidden",
    );
    expect(prompt).toContain("No speculation");
  });
});
