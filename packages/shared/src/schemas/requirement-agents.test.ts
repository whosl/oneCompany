import { describe, expect, it } from "vitest";
import {
  AnalystOutputSchema,
  IntakeOutputSchema,
  PrdAcceptanceOutputSchema,
  QuestionPlannerOutputSchema,
  ScorerOutputSchema,
} from "./requirement-agents.js";

describe("requirement agent output schemas — M3", () => {
  it("parses IntakeOutput", () => {
    const parsed = IntakeOutputSchema.parse({
      normalizedSummary: "A todo web app",
      targetUsers: ["developers"],
      userGoals: ["track tasks"],
      appType: "web",
      missingContext: ["auth model"],
    });
    expect(parsed.appType).toBe("web");
  });

  it("parses AnalystOutput", () => {
    const parsed = AnalystOutputSchema.parse({
      coreFeatures: ["create todo"],
      pagesAndFlows: [{ name: "Home", purpose: "list", userActions: ["add"] }],
      dataObjects: [{ name: "Todo", fields: ["id", "title"] }],
      rolesAndPermissions: ["owner"],
      integrations: [],
      nonFunctionalRequirements: ["responsive"],
      assumptions: ["single user"],
    });
    expect(parsed.coreFeatures).toHaveLength(1);
  });

  it("parses ScorerOutput", () => {
    const parsed = ScorerOutputSchema.parse({
      completenessScore: 72,
      gaps: [{ topic: "auth", severity: "medium", question: "Who logs in?" }],
    });
    expect(parsed.completenessScore).toBe(72);
  });

  it("rejects ScorerOutput above 100", () => {
    const result = ScorerOutputSchema.safeParse({
      completenessScore: 120,
      gaps: [],
    });
    expect(result.success).toBe(false);
  });

  it("parses QuestionPlannerOutput with 3 to 6 questions", () => {
    const parsed = QuestionPlannerOutputSchema.parse({
      topic: "Users",
      questions: [
        {
          question: "Who is the primary user?",
          suggestedAnswers: ["Developers", "Managers", "Everyone"],
        },
        {
          question: "What is the main workflow?",
          suggestedAnswers: ["Track tasks", "Review history", "Collaborate"],
        },
        {
          question: "Which platform first?",
          suggestedAnswers: ["Web", "CLI", "Mobile"],
        },
      ],
    });
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions[0]?.suggestedAnswers).toHaveLength(3);
  });

  it("coerces legacy string questions into structured items with defaults", () => {
    const parsed = QuestionPlannerOutputSchema.parse({
      topic: "Users",
      questions: [
        "Who is the primary user?",
        "What is the main workflow?",
        "Which platform first?",
      ],
    });
    expect(parsed.questions[0]?.question).toBe("Who is the primary user?");
    expect(parsed.questions[0]?.suggestedAnswers.length).toBeGreaterThan(0);
    expect(parsed.questions).toHaveLength(3);
  });

  it("rejects QuestionPlannerOutput with fewer than 3 or more than 6 questions", () => {
    expect(
      QuestionPlannerOutputSchema.safeParse({
        topic: "Users",
        questions: [{ question: "Only one?", suggestedAnswers: ["A", "B", "C"] }],
      }).success,
    ).toBe(false);
    expect(
      QuestionPlannerOutputSchema.safeParse({
        topic: "Users",
        questions: Array.from({ length: 7 }, (_, i) => `Q${i}`),
      }).success,
    ).toBe(false);
  });

  it("parses PrdAcceptanceOutput", () => {
    const parsed = PrdAcceptanceOutputSchema.parse({
      prd: "# PRD",
      acceptanceCriteria: "- User can add todos",
      assumptions: ["local only"],
      risks: [],
    });
    expect(parsed.prd).toContain("PRD");
  });
});
