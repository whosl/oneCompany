"use client";

import type { ConsoleProjection } from "@/lib/projection/types";

export function ProjectSwitcher({
  projection,
  dropdownOpen,
  onToggleDropdown,
  onOpenHub,
}: {
  projection: ConsoleProjection;
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onOpenHub: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md border px-3 py-1 text-sm font-medium"
        onClick={onToggleDropdown}
      >
        {projection.snapshot.project.name}
      </button>
      {dropdownOpen ? (
        <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border bg-[var(--oc-surface-base)] p-2 shadow">
          <button
            type="button"
            className="w-full rounded px-2 py-1 text-left text-sm hover:bg-[var(--oc-accent-soft)]"
            onClick={onOpenHub}
          >
            Open Project Hub
          </button>
        </div>
      ) : null}
    </div>
  );
}
