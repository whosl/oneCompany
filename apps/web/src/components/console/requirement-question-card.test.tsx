/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequirementQuestionCard } from "./requirement-question-card";

afterEach(() => cleanup());

describe("RequirementQuestionCard", () => {
  it("renders ABC suggestions and custom D input", () => {
    const onChange = vi.fn();
    render(
      <RequirementQuestionCard
        index={0}
        question="What is the purpose?"
        suggestedAnswers={["Option A text", "Option B text", "Option C text"]}
        value=""
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Option A text")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    expect(onChange).toHaveBeenCalledWith("Option A text");
  });

  it("submits custom D answer", () => {
    const onChange = vi.fn();
    render(
      <RequirementQuestionCard
        index={1}
        question="Who is the user?"
        suggestedAnswers={["A", "B", "C"]}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId("question-1-custom"), {
      target: { value: "My own answer" },
    });
    expect(onChange).toHaveBeenCalledWith("My own answer");
  });
});
