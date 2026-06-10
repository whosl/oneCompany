/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleSnapshot } from "@oc/shared";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { Composer } from "./composer";

vi.mock("@/lib/api", () => ({
  consoleApi: {
    resolveGate: vi.fn(),
    startRequirement: vi.fn(),
    submitRequirementAnswers: vi.fn(),
    submitDeploymentUrl: vi.fn(),
    createChangeRequest: vi.fn(),
  },
}));

const baseSnapshot: ConsoleSnapshot = {
  project: {
    id: "p1",
    name: "Demo",
    slug: "d",
    status: "Asking Questions",
    createdAt: "t",
    updatedAt: "t",
  },
  phase: { label: "Asking Questions", activeGroup: "Requirement Group" },
  risks: [],
  openGates: [
    {
      id: "gate-1",
      gateType: "requirement_stuck",
      status: "open",
      options: ["keep_answering", "force_continue", "fail"],
      decision: null,
      createdAt: "t",
    },
  ],
  events: [],
  lastSeq: 0,
};

afterEach(() => cleanup());

const blockedProjection = createProjectionFromSnapshot(baseSnapshot);

const questionsProjection = createProjectionFromSnapshot({
  ...baseSnapshot,
  openGates: [],
  project: {
    ...baseSnapshot.project,
    status: "Asking Questions",
  },
  requirement: {
    rawRequirement: "Build a calendar",
    normalizedSummary: "Calendar app",
    completenessScore: 60,
    completenessLocked: false,
    settledChips: [],
    upcomingChips: [],
    pendingQuestions: [
      {
        question: "Who is the primary user?",
        suggestedAnswers: ["Developers", "Managers", "Everyone"],
      },
      {
        question: "What platforms are required?",
        suggestedAnswers: ["Web only", "Desktop", "Mobile"],
      },
    ],
  },
});

const prdReadyProjection = createProjectionFromSnapshot({
  ...baseSnapshot,
  openGates: [],
  project: {
    ...baseSnapshot.project,
    status: "PRD Ready",
  },
});

const changeRequestProjection = createProjectionFromSnapshot({
  ...baseSnapshot,
  openGates: [],
  project: {
    ...baseSnapshot.project,
    status: "Developing",
  },
});

const deploymentGateProjection = createProjectionFromSnapshot({
  ...baseSnapshot,
  openGates: [
    {
      id: "gate-deploy",
      gateType: "deployment",
      status: "open",
      options: ["provide_url", "fail"],
      decision: null,
      createdAt: "t",
    },
  ],
  project: {
    ...baseSnapshot.project,
    status: "Deploying",
  },
});

describe("Composer — M9", () => {
  it("shows gate options when blocked and hides free send", () => {
    render(<Composer projectId="p1" projection={blockedProjection} />);
    expect(screen.getByRole("button", { name: "keep answering" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("shows question hint and submit answers action", () => {
    render(
      <Composer
        projectId="p1"
        projection={questionsProjection}
        questionAnswers={["Developers", "Web only"]}
      />,
    );
    expect(screen.getByTestId("composer-questions-hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit answers" })).toBeTruthy();
  });

  it("does not offer manual development start when PRD is ready", () => {
    render(<Composer projectId="p1" projection={prdReadyProjection} />);
    expect(screen.queryByTestId("composer-start-development")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start development" })).toBeNull();
    expect(screen.getByTestId("composer-mode-reason").textContent).toContain("PRD Ready");
  });

  it("switches to change request mode during development", () => {
    render(<Composer projectId="p1" projection={changeRequestProjection} />);
    expect(screen.getByRole("button", { name: "Submit change request" })).toBeTruthy();
  });

  it("offers deployment URL submission for deployment gates", () => {
    render(<Composer projectId="p1" projection={deploymentGateProjection} />);
    expect(screen.getByTestId("composer-submit-deployment-url")).toBeTruthy();
  });
});
