import { toggleArtifacts, toggleToolPanel, type RenderState, render } from "./render.js";

export function attachKeyHandlers(state: RenderState, onQuit: () => void): () => void {
  if (!process.stdin.isTTY) return () => {};

  const onData = (chunk: Buffer): void => {
    const key = chunk.toString();
    if (key === "q" || key === "\u0003") {
      onQuit();
      return;
    }
    if (key === "l") {
      toggleToolPanel(state);
      render(state);
      return;
    }
    if (key === "a") {
      toggleArtifacts(state);
      render(state);
    }
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);

  return () => {
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}
