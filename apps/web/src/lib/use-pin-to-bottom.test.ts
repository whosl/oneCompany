/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePinToBottom } from "./use-pin-to-bottom";

function mockContainer(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    scrollTo: () => undefined,
  } as HTMLDivElement;
}

describe("usePinToBottom — M11", () => {
  it("marks pinned when near the bottom threshold", () => {
    const { result } = renderHook(() => usePinToBottom("key-1"));
    const container = mockContainer(952, 1000, 48);

    act(() => {
      result.current.containerRef.current = container;
      result.current.handleScroll();
    });

    expect(result.current.pinned).toBe(true);
  });

  it("unpins when the user scrolls away from the bottom", () => {
    const { result } = renderHook(() => usePinToBottom("key-2"));
    const container = mockContainer(100, 1000, 48);

    act(() => {
      result.current.containerRef.current = container;
      result.current.handleScroll();
    });

    expect(result.current.pinned).toBe(false);
  });
});
