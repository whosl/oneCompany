import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isActive, isTerminal } from "./machine.js";

describe("status machine — M1", () => {
  it("allows Developing -> Testing", () => {
    expect(canTransition("Developing", "Testing")).toBe(true);
  });

  it("allows deployment rejection to return to development", () => {
    expect(canTransition("Deploying", "Developing")).toBe(true);
    expect(() => assertTransition("Deploying", "Developing")).not.toThrow();
  });

  it("rejects Developing -> Delivered", () => {
    expect(canTransition("Developing", "Delivered")).toBe(false);
    expect(() => assertTransition("Developing", "Delivered")).toThrow(/Illegal status transition/);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("Delivered", "Developing")).toBe(false);
    expect(canTransition("Failed", "Developing")).toBe(false);
    expect(isTerminal("Delivered")).toBe(true);
    expect(isTerminal("Failed")).toBe(true);
  });

  it("allows any active state to enter Paused", () => {
    expect(canTransition("Developing", "Paused")).toBe(true);
    expect(canTransition("Asking Questions", "Paused")).toBe(true);
    expect(isActive("Developing")).toBe(true);
    expect(isActive("Paused")).toBe(false);
  });

  it("allows Paused -> previous state when pausedFrom is provided", () => {
    expect(canTransition("Paused", "Developing", { pausedFrom: "Developing" })).toBe(true);
    expect(canTransition("Paused", "Testing", { pausedFrom: "Developing" })).toBe(false);
  });

  it("allows Paused -> Failed", () => {
    expect(canTransition("Paused", "Failed")).toBe(true);
  });

  it("allows any active state to enter Failed", () => {
    expect(canTransition("Developing", "Failed")).toBe(true);
    expect(canTransition("Tech Plan Review", "Failed")).toBe(true);
  });

  it("allows self-loops defined in STATUS_TRANSITIONS", () => {
    expect(canTransition("Asking Questions", "Asking Questions")).toBe(true);
    expect(canTransition("Tech Plan Review", "Tech Plan Review")).toBe(true);
    expect(canTransition("Developing", "Developing")).toBe(true);
  });
});
