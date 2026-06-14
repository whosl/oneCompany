"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClient } from "../../lib/api/client";
import { statusColor } from "../ui/primitives";
import type { ProjectRecord } from "../../lib/api/types";

const STATUS_COLOR_CLASS: Record<string, string> = {
  cyan: "text-term-cyan",
  green: "text-term-green",
  yellow: "text-term-yellow",
  red: "text-term-red",
  magenta: "text-term-magenta",
  blue: "text-term-blue",
  dim: "text-term-dim",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { hour12: false });
}

export function ProjectHub({ apiBase = "/api" }: { apiBase?: string }) {
  const router = useRouter();
  const api = useMemo(() => new ApiClient(apiBase), [apiBase]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [cursor, setCursor] = useState(0);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const ok = await api.health();
      setApiOk(ok);
      if (!ok) {
        setError(`API unreachable at ${apiBase} — start it with: pnpm api`);
        setLoading(false);
        return;
      }
      const list = await api.listProjects();
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setProjects(list);
      setCursor((c) => Math.min(c, Math.max(0, list.length - 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    (id: string) => {
      router.push(`/projects/${id}`);
    },
    [router],
  );

  const create = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;
    try {
      const project = await api.createProject(name);
      open(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, nameInput, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation (mirrors picker keys: ↑↓ select, Enter open, n new, r refresh).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (naming) {
        if (e.key === "Escape") {
          setNaming(false);
          setNameInput("");
        } else if (e.key === "Enter") {
          void create();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, projects.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" && projects[cursor]) {
        void open(projects[cursor]!.id);
      } else if (e.key === "n") {
        e.preventDefault();
        setNaming(true);
      } else if (e.key === "r") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [naming, projects, cursor, open, create, load]);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 border-b border-term-dim/30">
        <div className="flex items-baseline gap-3">
          <span className="text-term-cyan text-lg font-bold">⬢ OneCompany</span>
          <span className="text-term-dim">· Web · project hub</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-term-dim">
          <span>{apiBase}</span>
          {apiOk === true && <span className="text-term-green">● connected</span>}
          {apiOk === false && <span className="text-term-red">○ unreachable</span>}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-3 overflow-auto">
        {error && (
          <div className="mb-3 px-3 py-2 border border-term-red/40 text-term-red">{error}</div>
        )}
        {loading ? (
          <div className="text-term-dim">Loading projects…</div>
        ) : projects.length === 0 && !naming ? (
          <div className="text-term-dim">
            No projects yet — press <kbd className="text-term-cyan">n</kbd> to create one.
          </div>
        ) : (
          <ul className="divide-y divide-term-dim/20">
            {projects.map((project, index) => {
              const isSelected = index === cursor;
              const color = statusColor(project.status);
              return (
                <li key={project.id}>
                  <button
                    onClick={() => open(project.id)}
                    onMouseEnter={() => setCursor(index)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 ${
                      isSelected ? "bg-term-cyan/10" : ""
                    } hover:bg-term-cyan/5`}
                  >
                    <span className="text-term-cyan w-3 shrink-0">{isSelected ? "▸" : " "}</span>
                    <span className={`font-bold flex-1 truncate ${isSelected ? "text-term-cyan" : ""}`}>
                      {project.name}
                    </span>
                    <span className={`text-xs ${STATUS_COLOR_CLASS[color] ?? "text-term-dim"}`}>
                      {project.status}
                    </span>
                    <span className="text-xs text-term-dim w-40 text-right shrink-0">
                      {formatDate(project.updatedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {naming && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-term-cyan">❯</span>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNaming(false);
                  setNameInput("");
                } else if (e.key === "Enter") {
                  void create();
                }
              }}
              placeholder="project name"
              className="flex-1 bg-transparent border-b border-term-cyan/40 focus:outline-none text-term-fg"
            />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <footer className="px-4 py-2 border-t border-term-dim/30 text-xs text-term-dim flex gap-4">
        <button onClick={() => setNaming(true)} className="hover:text-term-cyan">
          n new project
        </button>
        <button onClick={() => void load()} className="hover:text-term-cyan">
          r refresh
        </button>
        <span>↑↓/click select · Enter open</span>
      </footer>
    </main>
  );
}
