/** Projects with a slice loop currently running in this process (in-memory). */
const ACTIVE_SLICE_LOOPS = new Set<string>();

export function markSliceLoopActive(projectId: string): void {
  ACTIVE_SLICE_LOOPS.add(projectId);
}

export function markSliceLoopInactive(projectId: string): void {
  ACTIVE_SLICE_LOOPS.delete(projectId);
}

export function isSliceLoopActive(projectId: string): boolean {
  return ACTIVE_SLICE_LOOPS.has(projectId);
}
