"use client";

import { LIFECYCLE_STEPS, lifecycleIndex } from "../../../lib/catalog/lifecycle";

/** 7-step lifecycle bar: ● done / ◉ current / ○ future, joined by ── . */
export function Stepper({ status }: { status: string }) {
  const current = lifecycleIndex(status);
  const failed = status === "Failed";
  const paused = status === "Paused";

  return (
    <div className="flex items-center gap-1 text-xs flex-wrap">
      {LIFECYCLE_STEPS.map((step, i) => {
        const isCurrent = i === current;
        const isDone = current >= 0 && i < current;
        const sep = i > 0 ? <span className="text-term-dim"> ── </span> : null;
        let glyph: React.ReactNode;
        let cls: string;
        if (isCurrent) {
          glyph = "◉";
          cls = "text-term-cyan font-bold";
        } else if (isDone) {
          glyph = "●";
          cls = "text-term-green";
        } else {
          glyph = "○";
          cls = "text-term-dim";
        }
        return (
          <span key={step.id} className="flex items-center">
            {sep}
            <span className={cls}>
              {glyph} {step.label}
            </span>
          </span>
        );
      })}
      {failed && <span className="text-term-red ml-2">▾ failed</span>}
      {paused && <span className="text-term-magenta ml-2">▾ paused</span>}
    </div>
  );
}
