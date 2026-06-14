import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, RefreshCw, ServerOff } from "lucide-react";
import { API_BASE, api } from "./api";
import type { ProjectRecord } from "./types";

const statusTone = (status: string) => {
  if (status === "Delivered") return "success";
  if (status === "Failed") return "danger";
  if (status === "Paused") return "muted";
  if (status.includes("Question") || status.includes("Review") || status.includes("Acceptance")) return "warning";
  return "active";
};

export function ProjectHub({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [ok, records] = await Promise.all([api.health(), api.listProjects()]);
      setConnected(ok);
      setProjects(records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setSelected((value) => Math.min(value, Math.max(0, records.length - 1)));
    } catch (reason) {
      setConnected(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => void load(), []);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setLoading(true);
    setError("");
    try {
      const project = await api.createProject(value);
      onOpen(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    }
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (creating || projects.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => Math.min(projects.length - 1, value + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => Math.max(0, value - 1));
    }
    if (event.key === "Enter") onOpen(projects[selected]!.id);
  };

  const counts = useMemo(() => ({ total: projects.length, active: projects.filter((item) => item.status !== "Delivered" && item.status !== "Failed").length }), [projects]);

  return (
    <main className="hub" tabIndex={0} onKeyDown={handleKeyboard}>
      <section className="hub-shell">
        <header className="hub-header">
          <div>
            <h1><span className="brand-mark">⬢</span> OneCompany <span>· WebUI · project hub</span></h1>
            <p className="connection-line"><span className={connected ? "live-dot" : "offline-dot"} /> {API_BASE} · {connected ? "connected" : "unreachable"}</p>
          </div>
          <div className="hub-stats"><strong>{counts.active}</strong> active <span>·</span> {counts.total} total</div>
        </header>

        <div className="terminal-rule" />

        <div className="hub-toolbar">
          <button className="terminal-button primary" onClick={() => setCreating(true)}><Plus size={15} /> new project</button>
          <button className="terminal-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> refresh</button>
          <span className="key-hint">↑↓ select · Enter open</span>
        </div>

        {creating && (
          <form className="new-project" onSubmit={createProject}>
            <label htmlFor="project-name">new project name</label>
            <div className="terminal-input-row"><span>❯</span><input id="project-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="输入项目名称" /></div>
            <div className="form-actions"><button className="terminal-button primary" disabled={!name.trim()}>create & open</button><button type="button" className="terminal-button" onClick={() => { setCreating(false); setName(""); }}>cancel</button></div>
          </form>
        )}

        {error && <div className="hub-error"><ServerOff size={16} /> {error}</div>}

        <div className="project-list" aria-busy={loading}>
          {loading && projects.length === 0 ? <div className="empty-line"><span className="spinner-glyph">◌</span> loading projects…</div> : null}
          {!loading && !error && projects.length === 0 ? <div className="empty-line">no projects yet — create one to start</div> : null}
          {projects.map((project, index) => (
            <button key={project.id} className={`project-row ${selected === index ? "selected" : ""}`} onMouseEnter={() => setSelected(index)} onClick={() => onOpen(project.id)}>
              <span className="row-cursor">{selected === index ? "▸" : " "}</span>
              <span className="project-name">{project.name}</span>
              <span className={`status-badge ${statusTone(project.status)}`}>{project.status}</span>
              <time>{project.updatedAt.slice(0, 16).replace("T", " ")}</time>
              <ArrowRight size={14} className="row-arrow" />
            </button>
          ))}
        </div>

        <footer className="hub-footer">n new project · r refresh · click / Enter open</footer>
      </section>
    </main>
  );
}
