import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 48;

export function usePinToBottom(scrollKey: string | number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const top = element.scrollHeight;
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top, behavior });
    } else {
      element.scrollTop = top;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setPinned(distanceFromBottom <= BOTTOM_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    scrollToBottom();
  }, [scrollKey, pinned, scrollToBottom]);

  return { containerRef, pinned, handleScroll, scrollToBottom };
}
