import type { DevState, FunctionSliceTask } from "@oc/shared";

export function getCurrentSlice(state: DevState): FunctionSliceTask | undefined {
  if (state.currentTask) {
    return state.currentTask;
  }
  return state.taskQueue.find((task) => (task.status ?? "pending") === "pending");
}

export function hasPendingSlices(state: DevState): boolean {
  return state.taskQueue.some((task) => (task.status ?? "pending") === "pending");
}

export function hasRunnableSlices(state: DevState): boolean {
  return state.taskQueue.some((task) => {
    const status = task.status ?? "pending";
    return status === "pending" || status === "in_progress";
  });
}

export function allSlicesPassed(state: DevState): boolean {
  return (
    state.taskQueue.length > 0 &&
    state.taskQueue.every((task) => task.status === "passed" || task.status === "skipped")
  );
}

export function isSliceBudgetExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

export function shouldRaiseSliceFailureGate(
  attempts: number,
  maxAttempts: number,
  lastCheckPassed: boolean,
): boolean {
  return !lastCheckPassed && isSliceBudgetExhausted(attempts, maxAttempts);
}

export function effectiveMaxSliceAttempts(
  state: DevState,
  budgetExtension = 0,
): number {
  return state.maxSliceAttempts + budgetExtension;
}
