"use client";

import type { ConsoleState } from "../../../store/types";
import type { ConsoleActions } from "../../../hooks/useConsoleState";
import { isProjectDeployReady } from "../../../store/reducer";
import { buildFileTree, filterRepoPaths, flattenFileTree } from "../../../lib/format/file-tree";
import { lifecycleIndex } from "../../../lib/catalog/lifecycle";
import { Box, KV, Rule } from "../../ui/primitives";

function ProjectPanel({ state }: { state: ConsoleState }) {
  const s = state.snapshot;
  if (!s) return null;
  const req = s.requirement;
  const dev = s.dev;
  const testing = s.testing;
  const stage = lifecycleIndex(s.project.status);

  return (
    <div className="px-2 py-1 text-xs space-y-1">
      <Rule label="PROJECT" />
      <KV label="name" value={s.project.name} />
      <KV label="id" value={<span className="font-mono">{s.project.id}</span>} />
      <KV label="status" value={s.project.status} />
      <KV label="phase" value={s.phase.label} />
      <KV label="created" value={new Date(s.project.createdAt).toLocaleString("en-GB", { hour12: false })} />
      {req && (
        <KV
          label="complete"
          value={`${Math.round(req.completenessScore * 100)}%${req.completenessLocked ? " (locked)" : ""}`}
        />
      )}
      {dev && dev.sliceTotal > 0 && (
        <KV
          label="slices"
          value={
            <span>
              {dev.sliceIndex}/{dev.sliceTotal}
              {dev.currentSliceId && (
                <span className="text-term-dim font-mono"> · {dev.currentSliceId}</span>
              )}
            </span>
          }
        />
      )}
      {testing && (
        <KV label="tests" value={`${testing.suitePassed}/${testing.suiteTotal} passed`} />
      )}
      {(dev?.previewUrl || testing?.previewUrl) && (
        <KV
          label="preview"
          value={
            <a
              href={dev?.previewUrl ?? testing?.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-term-cyan hover:underline"
            >
              {dev?.previewUrl ?? testing?.previewUrl}
            </a>
          }
        />
      )}
      <KV label="gates" value={`${s.openGates.length} open`} />
    </div>
  );
}

function ActionButtons({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const ready = isProjectDeployReady(state);
  const api = actions;
  return (
    <div className="px-2 py-1 flex gap-1">
      <button
        disabled={!ready}
        onClick={() => void actions.dispatchAction("delivery_report")}
        className={`flex-1 text-xs py-1 border ${
          ready
            ? "border-term-green/40 text-term-green hover:bg-term-green/10"
            : "border-term-dim/30 text-term-dim cursor-not-allowed"
        }`}
      >
        部署
      </button>
      <button
        disabled={!ready}
        onClick={() => void actions.exportSubmission()}
        className={`flex-1 text-xs py-1 border ${
          ready
            ? "border-term-green/40 text-term-green hover:bg-term-green/10"
            : "border-term-dim/30 text-term-dim cursor-not-allowed"
        }`}
      >
        导出包
      </button>
    </div>
  );
}

function Integrations({ state }: { state: ConsoleState }) {
  const ints = state.snapshot?.integrations;
  if (!ints || ints.length === 0) return null;
  return (
    <div className="px-2 py-1 text-xs">
      <Rule label="INTEGRATIONS" />
      {ints.map((it) => {
        const connected = /connected|enabled|ready/i.test(it.status);
        const cls = connected ? "text-term-green" : /offline|disabled/i.test(it.status) ? "text-term-dim" : "text-term-yellow";
        return (
          <div key={it.integrationId}>
            <span className="text-term-dim">•</span> {it.displayName}{" "}
            <span className={cls}>{it.status}</span>
          </div>
        );
      })}
    </div>
  );
}

function ArtifactsTab({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const pid = state.projectId;
  const stage = lifecycleIndex(state.snapshot?.project.status ?? "");
  const docs: { label: string; path: string; stage: number }[] = [
    { label: "PRD（最新版）", path: `artifacts/${pid}/prd-latest.md`, stage: 1 },
    { label: "验收标准（最新版）", path: `artifacts/${pid}/ac-latest.md`, stage: 1 },
    { label: "技术方案（最新版）", path: `artifacts/${pid}/tp-latest.md`, stage: 2 },
  ];
  const runtime = state.artifacts.filter(
    (p) => !/prd-latest|ac-latest|tp-latest/.test(p),
  );

  return (
    <div className="px-2 py-1 text-xs space-y-0.5">
      {docs
        .filter((d) => stage >= d.stage)
        .map((d) => (
          <button
            key={d.path}
            onClick={() => void actions.openFile(d.path)}
            className="block w-full text-left hover:text-term-cyan"
          >
            <span className="text-term-cyan">▤</span> {d.label}
          </button>
        ))}
      {runtime.map((path) => (
        <button
          key={path}
          onClick={() => void actions.openFile(path)}
          className="block w-full text-left text-term-dim hover:text-term-cyan"
        >
          <span className="text-term-cyan">▤</span> {path}
        </button>
      ))}
      {docs.filter((d) => stage >= d.stage).length === 0 && runtime.length === 0 && (
        <div className="text-term-dim">暂无产物</div>
      )}
    </div>
  );
}

function FilesTab({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const files = filterRepoPaths(state.repoFiles);
  const tree = buildFileTree(files);
  const rows = flattenFileTree(tree, state.expandedFileDirs);

  if (rows.length === 0) {
    return <div className="px-2 py-1 text-xs text-term-dim">暂无文件</div>;
  }

  return (
    <div className="px-2 py-1 text-xs space-y-0.5 max-h-96 overflow-y-auto">
      {rows.map((row, i) => {
        const indent = "  ".repeat(row.depth);
        if (row.kind === "dir") {
          return (
            <button
              key={row.path}
              onClick={() => {
                if (state.expandedFileDirs.has(row.path)) state.expandedFileDirs.delete(row.path);
                else state.expandedFileDirs.add(row.path);
              }}
              className="block w-full text-left hover:text-term-cyan"
            >
              <span className="pl-2" style={{ paddingLeft: row.depth * 12 }}>
                {row.expanded ? "▾" : "▸"} 📁 {row.name}{" "}
                <span className="text-term-dim">({row.childCount})</span>
              </span>
            </button>
          );
        }
        return (
          <button
            key={row.path}
            onClick={() => void actions.openFile(row.path)}
            className="block w-full text-left text-term-fg hover:text-term-cyan"
          >
            <span style={{ paddingLeft: row.depth * 12 + 16 }}>📄 {row.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function InspectorColumn({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  return (
    <div className="text-xs">
      <ProjectPanel state={state} />
      <ActionButtons state={state} actions={actions} />
      <Integrations state={state} />

      <div className="flex border-b border-term-dim/30">
        <button
          onClick={() => (state.inspectorTab = "artifacts")}
          className={`flex-1 px-2 py-1 ${
            state.inspectorTab === "artifacts"
              ? "font-bold text-term-cyan border-b-2 border-term-cyan"
              : "text-term-dim"
          }`}
        >
          ▣ Artifacts
        </button>
        <button
          onClick={() => (state.inspectorTab = "files")}
          className={`flex-1 px-2 py-1 ${
            state.inspectorTab === "files"
              ? "font-bold text-term-cyan border-b-2 border-term-cyan"
              : "text-term-dim"
          }`}
        >
          ▢ Files
        </button>
      </div>

      {state.inspectorTab === "artifacts" ? (
        <ArtifactsTab state={state} actions={actions} />
      ) : (
        <FilesTab state={state} actions={actions} />
      )}
    </div>
  );
}
