"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsoleState } from "../../../store/types";
import type { ConsoleActions } from "../../../hooks/useConsoleState";
import { filterPaletteActions } from "../../../store/reducer";

/** Ctrl+P command palette — query input + filtered deriveActions list. */
export function CommandPalette({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQuery = (q: string) => {
    state.commandPalette = { query: q, cursor: 0 };
    setQuery(q);
    setCursor(0);
  };

  // Read the (live) filtered actions from the store.
  state.commandPalette = { query, cursor };
  const actions_list = filterPaletteActions(state);

  const run = (id: string) => {
    state.commandPalette = undefined;
    void actions.dispatchAction(id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(0, actions_list.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = actions_list[cursor];
      if (selected) run(selected.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-16"
      onClick={() => (state.commandPalette = undefined)}
    >
      <div
        className="w-[min(72ch,90vw)] border border-term-cyan/40 bg-term-bg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-term-dim/30">
          <span className="text-term-cyan">❯</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="type to filter actions…"
            className="flex-1 bg-transparent focus:outline-none text-term-fg"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {actions_list.length === 0 ? (
            <div className="px-3 py-2 text-term-dim">no matching actions</div>
          ) : (
            actions_list.slice(0, 10).map((action, i) => (
              <button
                key={action.id}
                onClick={() => run(action.id)}
                onMouseEnter={() => setCursor(i)}
                className={`block w-full text-left px-3 py-1 text-xs ${
                  i === cursor ? "bg-term-cyan/20 text-term-cyan" : "text-term-fg hover:bg-term-cyan/5"
                }`}
              >
                {action.label} <span className="text-term-dim">({action.id})</span>
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-1 border-t border-term-dim/30 text-xs text-term-dim">
          ↑↓ select · Enter run · Esc close · type to filter
        </div>
      </div>
    </div>
  );
}
