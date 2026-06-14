"use client";

import type { ConsoleState } from "../../../store/types";
import { renderMarkdown } from "../../../lib/format/markdown";

/** Fullscreen file/artifact viewer overlay. Markdown → rendered; else raw lines. */
export function FileViewer({
  state,
  onClose,
}: {
  state: ConsoleState;
  onClose: () => void;
}) {
  const viewer = state.viewer;
  if (!viewer) return null;
  const isMarkdown = /\.md$/i.test(viewer.title);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(110ch,95vw)] h-[85vh] border border-term-cyan/40 bg-term-bg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-1 border-b border-term-dim/30">
          <span className="text-term-cyan font-bold text-xs">▤ {viewer.title}</span>
          <button onClick={onClose} className="text-term-dim hover:text-term-cyan text-xs">
            Esc 关闭
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2 text-xs">
          {viewer.loading ? (
            <div className="text-term-dim">Loading…</div>
          ) : isMarkdown ? (
            <div>{renderMarkdown(viewer.lines.join("\n"), 100)}</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono">{viewer.lines.join("\n")}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
