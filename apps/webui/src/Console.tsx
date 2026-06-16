import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Command,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderTree,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Send,
  ShieldAlert,
  Sun,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { api, openEventStream } from "./api";
import { AGENTS, GATES, LIFECYCLE, OPTION_LABELS, REVIEW_ARTIFACTS } from "./catalog";
import { buildFileTree, filterRepoPaths, flattenFileTree } from "./file-tree";
import { Markdown } from "./Markdown";
import { appendEvent, deriveAgents, deriveTimeline } from "./state";
import type { AgentView, ConsoleSnapshot, FileResult, GateInfo, TimelineEntry } from "./types";

type Theme = "dark" | "light";
type MobilePanel = "agents" | "stream" | "inspector";
type Notice = { type: "success" | "error" | "info"; text: string };
type PendingMessage = { id: string; text: string; at: string; afterSeq: number; status: "sending" | "failed" };

const statusTone = (status: string) => {
  if (status === "Delivered") return "success";
  if (status === "Failed") return "danger";
  if (status === "Paused") return "muted";
  if (/Questions|Review|Acceptance/.test(status)) return "warning";
  return "active";
};

const duration = (from?: number) => {
  if (!from) return "0s";
  const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return seconds > 59 ? `${Math.floor(seconds / 60)}m${seconds % 60}s` : `${seconds}s`;
};

const unique = <T,>(items: T[]) => [...new Set(items)];

export function ConsoleScreen({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<"artifacts" | "files">("artifacts");
  const [viewer, setViewer] = useState<FileResult | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<string[]>([]);
  const [gateFeedback, setGateFeedback] = useState("");
  const [pendingGateDecision, setPendingGateDecision] = useState<string>();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("oc-webui-theme") === "light" ? "light" : "dark"));
  const [yolo, setYolo] = useState(() => localStorage.getItem("oc-webui-yolo") === "true");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("stream");
  const dismissedGates = useRef(new Set<string>());
  const answeredQuestionsKey = useRef<string>();
  const streamRef = useRef<HTMLDivElement>(null);
  const firstSnapshotReady = Boolean(snapshot);

  const filterOptimistic = (next: ConsoleSnapshot) => {
    const openGates = next.openGates.filter((gate) => !dismissedGates.current.has(gate.id));
    const questions = next.requirement?.pendingQuestions;
    if (questions?.length && answeredQuestionsKey.current === questions.map((item) => item.question).join("|")) {
      return { ...next, openGates, requirement: { ...next.requirement!, pendingQuestions: [] } };
    }
    return { ...next, openGates };
  };

  const refresh = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [next, repoFiles] = await Promise.all([api.snapshot(projectId), api.listFiles(projectId).catch(() => [])]);
      setSnapshot(filterOptimistic(next));
      setFiles(repoFiles);
    } catch (reason) {
      setNotice({ type: "error", text: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    setSnapshot(null);
    setLoading(true);
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    if (!firstSnapshotReady || !snapshot) return;
    return openEventStream(
      projectId,
      snapshot.lastSeq,
      (event) => setSnapshot((current) => (current ? appendEvent(current, event) : current)),
      setConnected,
    );
  }, [projectId, firstSnapshotReady]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("oc-webui-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("oc-webui-yolo", String(yolo));
  }, [yolo]);

  useEffect(() => {
    const questions = snapshot?.requirement?.pendingQuestions ?? [];
    setDraftAnswers((current) => questions.map((_, index) => current[index] ?? ""));
  }, [snapshot?.requirement?.pendingQuestions?.map((item) => item.question).join("|")]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [snapshot?.lastSeq, snapshot?.openGates.length]);

  const run = async (label: string, task: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (busy.includes(label)) return false;
    setBusy((items) => [...items, label]);
    try {
      await task();
      setNotice({ type: "success", text: success });
      await refresh();
      return true;
    } catch (reason) {
      setNotice({ type: "error", text: reason instanceof Error ? reason.message : String(reason) });
      return false;
    } finally {
      setBusy((items) => items.filter((item) => item !== label));
    }
  };

  const agents = useMemo(() => (snapshot ? deriveAgents(snapshot) : []), [snapshot]);
  const timeline = useMemo(() => {
    if (!snapshot) return [];
    const serverEntries = deriveTimeline(snapshot);
    const localEntries = pendingMessages
      .filter((pending) => !serverEntries.some((entry) => entry.kind === "user" && entry.text === pending.text && (entry.seq > pending.afterSeq || entry.id === "seed-requirement")))
      .map<TimelineEntry>((pending) => ({ id: pending.id, seq: Number.MAX_SAFE_INTEGER, at: pending.at, kind: "user", tag: "USER", text: pending.text, localState: pending.status }));
    return [...serverEntries, ...localEntries];
  }, [snapshot, pendingMessages]);
  const activeGate = snapshot?.openGates[0];
  const questions = snapshot?.requirement?.pendingQuestions ?? [];
  const previewUrl = snapshot?.testing?.previewUrl ?? snapshot?.dev?.previewUrl;
  const selected = agents.find((agent) => agent.id === selectedAgent) ?? agents.find((agent) => ["running", "tool", "blocked"].includes(agent.status)) ?? agents[0];

  useEffect(() => {
    if (!yolo || activeGate?.gateType !== "dangerous_operation" || busy.includes(`gate:${activeGate.id}`)) return;
    void resolveGate(activeGate, "approve", "", true);
  }, [yolo, activeGate?.id]);

  const openFile = async (path: string) => {
    setViewerLoading(true);
    try {
      setViewer(await api.readFile(projectId, path));
    } catch (reason) {
      setNotice({ type: "error", text: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setViewerLoading(false);
    }
  };

  const resolveGate = async (gate: GateInfo, decision: string, feedback = "", automatic = false) => {
    dismissedGates.current.add(gate.id);
    setSnapshot((current) => current ? { ...current, openGates: current.openGates.filter((item) => item.id !== gate.id) } : current);
    setPendingGateDecision(undefined);
    setGateFeedback("");
    await run(`gate:${gate.id}`, async () => {
      if (gate.gateType === "deployment" && decision === "approve" && previewUrl) await api.setDeploymentUrl(projectId, previewUrl);
      await api.resolveGate(gate.id, decision, feedback || undefined);
    }, automatic ? "YOLO 已自动放行危险操作" : `${OPTION_LABELS[decision] ?? decision}，工作流继续`);
  };

  const chooseGate = (gate: GateInfo, decision: string) => {
    const needsFeedback = ["custom", "revise_then_approve", "reject_and_redo"].includes(decision) || (decision === "reject" && gate.gateType !== "dangerous_operation");
    if (needsFeedback) {
      setPendingGateDecision(decision);
      setGateFeedback("");
      return;
    }
    void resolveGate(gate, decision);
  };

  const submitQuestions = async () => {
    if (draftAnswers.some((answer) => !answer.trim())) {
      setNotice({ type: "error", text: "请回答全部问题，未完成的题目已标出。" });
      return;
    }
    answeredQuestionsKey.current = questions.map((item) => item.question).join("|");
    setSnapshot((current) => current?.requirement ? { ...current, requirement: { ...current.requirement, pendingQuestions: [] } } : current);
    await run("answers", () => api.submitAnswers(projectId, draftAnswers), "回答已提交，Agent 正在重新评估需求");
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || !snapshot) return;
    const pending: PendingMessage = {
      id: `local-user-${Date.now()}`,
      text,
      at: new Date().toTimeString().slice(0, 8),
      afterSeq: snapshot.lastSeq,
      status: "sending",
    };
    setPendingMessages((items) => [...items, pending]);
    setMessage("");
    let sent = false;
    if (snapshot.project.status === "Draft Requirement") {
      sent = await run("requirement", () => api.startRequirement(projectId, text), "需求已提交，需求 Agent 组开始分析");
    } else {
      sent = await run("taizi", () => api.taizi(projectId, text), "指令已交给太子调度");
    }
    if (!sent) {
      setPendingMessages((items) => items.map((item) => item.id === pending.id ? { ...item, status: "failed" } : item));
    }
  };

  const togglePause = () => {
    if (!snapshot) return;
    const paused = snapshot.project.status === "Paused";
    void run(paused ? "resume" : "pause", () => paused ? api.resume(projectId) : api.pause(projectId), paused ? "项目已恢复" : "项目已暂停");
  };

  const startPreview = () => void run("preview", () => api.startPreview(projectId), "预览已启动");
  const stopPreview = () => void run("preview", () => api.stopPreview(projectId), "预览已停止");
  const exportProject = () => void run("export", async () => {
    await api.exportSubmission(projectId);
    const link = document.createElement("a");
    link.href = api.downloadPackageUrl(projectId);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, "导出包已开始下载");

  const handleShortcut = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      setPaletteOpen((value) => !value);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key === "Escape") {
      setViewer(null);
      setPaletteOpen(false);
      setPendingGateDecision(undefined);
      return;
    }
    if (typing) return;
    if (event.key.toLowerCase() === "m") setTheme((value) => value === "dark" ? "light" : "dark");
    if (event.key.toLowerCase() === "y") setYolo((value) => !value);
    if (event.key.toLowerCase() === "d" && snapshot?.project.status === "PRD Ready") void run("development", () => api.startDevelopment(projectId), "开发阶段已启动");
    if (event.key.toLowerCase() === "t" && snapshot?.project.status === "Testing") void run("testing", () => api.startTesting(projectId), "测试与部署流水线已启动");
  };

  if (loading || !snapshot) {
    return <main className="console-loading"><span className="brand-mark">⬢</span><p>Loading OneCompany console…</p></main>;
  }

  const activeLifecycle = LIFECYCLE.findIndex((step) => step.statuses.includes(snapshot.project.status));

  return (
    <main className="console-root" onKeyDown={handleShortcut} tabIndex={-1}>
      <header className="console-header">
        <div className="title-row">
          <div className="console-title"><button className="icon-button" onClick={onBack} title="返回项目中心 (Ctrl+B)"><ArrowLeft size={17} /></button><span className="brand-mark">⬢</span><strong>OneCompany</strong><span>·</span><b>{snapshot.project.name}</b></div>
          <div className="header-actions">
            {busy.length > 0 && <span className="busy-note"><Activity size={14} className="pulse" /> {busy[0]}</span>}
            <button className={`mode-chip ${yolo ? "on" : ""}`} onClick={() => setYolo((value) => !value)} title="危险操作自动放行"><Zap size={13} /> YOLO</button>
            <button className="icon-button" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} title="切换主题 (M)">{theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}</button>
            <button className="icon-button" onClick={() => setPaletteOpen(true)} title="命令面板 (Ctrl+P)"><Command size={15} /></button>
            <span className={connected ? "connection-state live" : "connection-state offline"}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? "live" : "offline"}</span>
          </div>
        </div>
        <div className="status-row">
          <span className={`status-badge ${statusTone(snapshot.project.status)}`}>{snapshot.project.status}</span>
          <button className="header-text-button" onClick={togglePause}>{snapshot.project.status === "Paused" ? <Play size={13} /> : <Pause size={13} />}{snapshot.project.status === "Paused" ? "恢复" : "暂停"}</button>
          <span className="phase-summary">{snapshot.phase.label}{snapshot.phase.progressLabel ? ` · ${snapshot.phase.progressLabel}` : ""}</span>
        </div>
        <div className="lifecycle">
          {LIFECYCLE.map((step, index) => {
            const done = activeLifecycle > index || snapshot.project.status === "Delivered";
            const active = activeLifecycle === index;
            return <div key={step.id} className={`lifecycle-step ${done ? "done" : ""} ${active ? "active" : ""}`}><span>{done ? <Check size={11} /> : active ? "◉" : "○"}</span>{step.label}{index < LIFECYCLE.length - 1 && <i />}</div>;
          })}
        </div>
        <div className="mobile-tabs">
          <button className={mobilePanel === "agents" ? "active" : ""} onClick={() => setMobilePanel("agents")}>Agents</button>
          <button className={mobilePanel === "stream" ? "active" : ""} onClick={() => setMobilePanel("stream")}>Stream</button>
          <button className={mobilePanel === "inspector" ? "active" : ""} onClick={() => setMobilePanel("inspector")}>Inspector</button>
        </div>
      </header>

      <div className="console-grid" data-mobile-panel={mobilePanel}>
        <AgentColumn agents={agents} selected={selected} onSelect={(id) => setSelectedAgent(id)} />
        <section className="stream-column">
          <div className="stream-scroll" ref={streamRef}>
            <Stream entries={timeline} />
            {activeGate && <GateCard gate={activeGate} projectId={projectId} previewUrl={previewUrl} yolo={yolo} previewBusy={busy.includes("preview")} pendingDecision={pendingGateDecision} feedback={gateFeedback} onFeedback={setGateFeedback} onChoose={(decision) => chooseGate(activeGate, decision)} onStartPreview={startPreview} onSubmitFeedback={() => pendingGateDecision && gateFeedback.trim() && void resolveGate(activeGate, pendingGateDecision, gateFeedback.trim())} onCancelFeedback={() => setPendingGateDecision(undefined)} onOpenFile={openFile} />}
            {questions.length > 0 && <QuestionRound questions={questions} answers={draftAnswers} onChange={(index, value) => setDraftAnswers((items) => items.map((item, itemIndex) => itemIndex === index ? value : item))} onSubmit={() => void submitQuestions()} onSkip={() => { answeredQuestionsKey.current = questions.map((item) => item.question).join("|"); void run("skip", () => api.skipClarification(projectId), "已采用默认假设，开始生成 PRD"); }} busy={busy.includes("answers") || busy.includes("skip")} />}
            {snapshot.project.status === "PRD Ready" && !activeGate && <LaunchPanel icon={<Rocket size={22} />} title="启动开发" description="PRD 已就绪。启动后 Architect 会先产出技术方案，再进入切片开发。" busy={busy.includes("development")} onClick={() => void run("development", () => api.startDevelopment(projectId), "开发阶段已启动")} />}
            {snapshot.project.status === "Testing" && (snapshot.testing?.suiteTotal ?? 0) === 0 && !activeGate && <LaunchPanel icon={<FlaskConical size={22} />} title="运行测试 + 部署" description="开发已完成，启动独立验证、预览和部署确认。" busy={busy.includes("testing")} onClick={() => void run("testing", () => api.startTesting(projectId), "测试与部署流水线已启动")} />}
          </div>
          <Composer snapshot={snapshot} value={message} busy={busy} onChange={setMessage} onSubmit={sendMessage} />
        </section>
        <Inspector snapshot={snapshot} files={files} tab={inspectorTab} onTab={setInspectorTab} onOpen={openFile} previewUrl={previewUrl} onStartPreview={startPreview} onStopPreview={stopPreview} onExport={exportProject} busy={busy} />
      </div>

      <footer className="shortcut-bar"><span><kbd>Ctrl P</kbd> 命令</span><span><kbd>Ctrl B</kbd> 项目</span><span><kbd>M</kbd> 主题</span><span><kbd>Y</kbd> YOLO</span><span>WebUI mirrors TUI2 · actions are state-aware</span></footer>

      {notice && <div className={`notice ${notice.type}`}>{notice.type === "error" ? <X size={15} /> : <Check size={15} />}{notice.text}</div>}
      {viewerLoading && <div className="notice info"><RefreshCw size={14} className="spin" />读取文件…</div>}
      {viewer && <FileViewer file={viewer} projectId={projectId} onClose={() => setViewer(null)} />}
      {paletteOpen && <CommandPalette snapshot={snapshot} onClose={() => setPaletteOpen(false)} actions={{ refresh: () => void refresh(), togglePause, toggleTheme: () => setTheme((value) => value === "dark" ? "light" : "dark"), toggleYolo: () => setYolo((value) => !value), exportProject, startPreview, stopPreview }} />}
    </main>
  );
}

function AgentColumn({ agents, selected, onSelect }: { agents: AgentView[]; selected?: AgentView; onSelect: (id: string) => void }) {
  return <aside className="agents-column panel-column">
    <h2>AGENTS</h2>
    {(["requirement", "development"] as const).map((group) => <div key={group} className="agent-group">
      <div className="section-rule">{group === "requirement" ? "Requirement" : "Development"}</div>
      {agents.filter((agent) => agent.group === group).map((agent) => <button key={agent.id} className={`agent-row ${selected?.id === agent.id ? "selected" : ""}`} onClick={() => onSelect(agent.id)}>
        <span className={`agent-glyph ${agent.status}`}>{agent.status === "running" || agent.status === "tool" ? "◌" : agent.status === "blocked" ? "!" : agent.status === "failed" ? "×" : agent.status === "done" ? "●" : "○"}</span>
        <span className="agent-name">{agent.name}</span>
        <span className={`agent-status ${agent.status}`}>{agent.status === "running" ? `run ${duration(agent.activeSince)}` : agent.status}</span>
      </button>)}
    </div>)}
    {selected && <div className="agent-detail">
      <div className="section-rule">DETAIL</div>
      <h3><span className={`agent-glyph ${selected.status}`}>●</span>{selected.name}<small>{selected.status}</small></h3>
      <p className="dim">{selected.role}</p>
      <dl><dt>职责</dt><dd>{selected.description}</dd><dt>能力</dt><dd>{selected.capabilities.map((item) => <span key={item}>· {item}</span>)}</dd><dt>简报</dt><dd>工具 {selected.toolRuns} · 产物 {selected.artifactCount} · 步骤 {selected.steps}{selected.errors ? ` · 错误 ${selected.errors}` : ""}</dd>{selected.lastText && <><dt>最近</dt><dd>{selected.lastText}</dd></>}</dl>
    </div>}
  </aside>;
}

function Stream({ entries }: { entries: TimelineEntry[] }) {
  const visible = entries.slice(-300);
  if (visible.length === 0) return <div className="waiting-line">waiting for events…</div>;
  const groups: Array<{ kind: "entry"; entry: TimelineEntry } | { kind: "tools"; id: string; entries: TimelineEntry[] }> = [];
  for (const entry of visible) {
    const isTool = ["tool", "tool_ok", "tool_err"].includes(entry.kind);
    const previous = groups.at(-1);
    if (isTool && previous?.kind === "tools") {
      previous.entries.push(entry);
    } else if (isTool) {
      groups.push({ kind: "tools", id: `tools-${entry.id}`, entries: [entry] });
    } else {
      groups.push({ kind: "entry", entry });
    }
  }
  return <div className="timeline">{groups.map((group) => group.kind === "tools" ? <ToolGroup key={group.id} entries={group.entries} /> : <TimelineRow key={group.entry.id} entry={group.entry} />)}</div>;
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "user") return <article className={`user-message ${entry.localState ?? ""}`}><header><span>┌</span><strong>用户</strong><time>{entry.localState === "sending" ? "发送中…" : entry.localState === "failed" ? "发送失败" : entry.at}</time></header><Markdown>{entry.text}</Markdown><footer>└────────────────</footer></article>;
  if (entry.kind === "taizi") return <article className="taizi-message"><strong>◆ 太子</strong><Markdown>{entry.text}</Markdown>{entry.summary && <small>({entry.summary})</small>}</article>;
  if (entry.kind === "reason") return <article className={`reason-entry ${entry.tag === "REFLT" ? "conclusion" : ""}`}><header><span className="tag">{entry.tag}</span><strong>{entry.agent}</strong><time>{entry.at}</time></header><Markdown>{entry.text}</Markdown></article>;
  return <div className={`event-line ${entry.kind}`}><span>{entry.kind === "error" ? "×" : entry.kind === "gate" ? "!" : entry.kind === "gate_ok" ? "✓" : entry.kind === "artifact" ? "▤" : "◆"}</span><Markdown className="event-copy">{entry.text}</Markdown><time>{entry.at}</time></div>;
}

function ToolGroup({ entries }: { entries: TimelineEntry[] }) {
  const failures = entries.filter((entry) => entry.kind === "tool_err").length;
  const running = entries.filter((entry) => entry.kind === "tool").length;
  const names = unique(entries.map((entry) => entry.tool).filter((name): name is string => Boolean(name)));
  return <details className={`tool-group ${failures ? "has-errors" : ""}`}>
    <summary><Activity size={12} /><span>{running ? `正在执行 ${running} 项工具任务` : `已收起 ${entries.length} 项工具调用`}</span>{names.length > 0 && <em>{names.slice(0, 2).join("、")}{names.length > 2 ? ` +${names.length - 2}` : ""}</em>}{failures > 0 && <b>{failures} 失败</b>}<ChevronDown size={12} /></summary>
    <div className="tool-group-items">{entries.map((entry) => <details key={entry.id} className={`tool-item ${entry.kind}`}><summary><span>{entry.kind === "tool" ? "◌" : entry.kind === "tool_ok" ? "✓" : "×"}</span><strong>{entry.tool ?? "tool"}</strong>{entry.summary && <em>{entry.summary}</em>}<time>{entry.at}</time><ChevronRight size={11} /></summary>{entry.text && <Markdown className="tool-output">{entry.text}</Markdown>}</details>)}</div>
  </details>;
}

function GateCard(props: { gate: GateInfo; projectId: string; previewUrl?: string; yolo: boolean; previewBusy: boolean; pendingDecision?: string; feedback: string; onFeedback: (value: string) => void; onChoose: (decision: string) => void; onStartPreview: () => void; onSubmitFeedback: () => void; onCancelFeedback: () => void; onOpenFile: (path: string) => void }) {
  const def = GATES[props.gate.gateType] ?? { title: props.gate.gateType, description: "请处理该确认项以继续。", options: ["approve", "reject"] };
  const options = props.gate.options.length ? props.gate.options : def.options;
  const metadata = props.gate.metadata ?? {};
  const operation = typeof metadata.operation === "string" ? metadata.operation : undefined;
  const toolName = typeof metadata.toolName === "string" ? metadata.toolName : undefined;
  const riskLevel = typeof metadata.riskLevel === "string" ? metadata.riskLevel : undefined;
  const links = REVIEW_ARTIFACTS[props.gate.gateType] ?? [];
  return <section className="gate-card">
    <header><ShieldAlert size={17} /><strong>{def.title}</strong><span>BLOCKING</span></header>
    <p>{def.description}</p>
    {props.yolo && props.gate.gateType === "dangerous_operation" && <div className="gate-yolo"><Zap size={14} />YOLO 已开启，此操作将自动放行</div>}
    {(operation || toolName || riskLevel) && <dl className="gate-metadata">{operation && <><dt>具体操作</dt><dd>{operation}</dd></>}{toolName && <><dt>调用工具</dt><dd>{toolName}</dd></>}{riskLevel && <><dt>风险等级</dt><dd className="danger-text">{riskLevel}</dd></>}</dl>}
    {links.length > 0 && <div className="review-links"><span>review 材料</span>{links.map((link) => <button key={link.suffix} onClick={() => props.onOpenFile(`artifacts/${props.projectId}/${link.suffix}`)}><FileText size={14} />{link.label}<ChevronRight size={13} /></button>)}</div>}
    {props.gate.gateType === "deployment" && <div className="deployment-flow"><div><span>1</span><div><strong>检查预览</strong><small>{props.previewUrl || "预览尚未生成，先生成可访问版本"}</small></div>{props.previewUrl ? <a href={props.previewUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开预览</a> : <button className="terminal-button primary" disabled={props.previewBusy} onClick={props.onStartPreview}>{props.previewBusy ? "生成中…" : "生成预览"}</button>}</div><div><span>2</span><div><strong>确认部署</strong><small>{props.previewUrl ? "确认当前预览即为对外交付版本" : "完成上一步后才能确认部署"}</small></div></div></div>}
    <div className="gate-options">{options.map((option, index) => {
      const previewRequired = props.gate.gateType === "deployment" && option === "approve" && !props.previewUrl;
      return <button key={option} disabled={previewRequired} title={previewRequired ? "请先生成并检查预览" : undefined} className={option === "approve" || option === "accept" ? "approve" : option.includes("reject") || option === "fail" ? "reject" : ""} onClick={() => props.onChoose(option)}><span>{index + 1}</span>{OPTION_LABELS[option] ?? option}{previewRequired && <small>需要预览</small>}</button>;
    })}</div>
    {props.pendingDecision && <div className="gate-feedback"><label>{OPTION_LABELS[props.pendingDecision] ?? props.pendingDecision} · 请说明具体意见</label><textarea autoFocus value={props.feedback} onChange={(event) => props.onFeedback(event.target.value)} placeholder="写清要修改的问题、预期结果或拒绝原因…" /><div><button className="terminal-button" onClick={props.onCancelFeedback}>取消</button><button className="terminal-button primary" disabled={!props.feedback.trim()} onClick={props.onSubmitFeedback}>提交意见并继续</button></div></div>}
  </section>;
}

function QuestionRound(props: { questions: Array<{ question: string; suggestedAnswers: string[] }>; answers: string[]; onChange: (index: number, value: string) => void; onSubmit: () => void; onSkip: () => void; busy: boolean }) {
  const answered = props.answers.filter((item) => item.trim()).length;
  return <section className="question-round">
    <header><div><strong>需求澄清</strong><span>{answered}/{props.questions.length} 已回答</span></div><div className="question-progress"><i style={{ width: `${answered / props.questions.length * 100}%` }} /></div></header>
    <p className="question-intro">一次查看并回答全部问题，答案会保留到提交，不需要来回切换。</p>
    <div className="question-list">{props.questions.map((question, index) => <article key={question.question} className={!props.answers[index]?.trim() ? "missing" : "answered"}>
      <div className="question-title"><span>{index + 1}</span><strong>{question.question}</strong>{props.answers[index]?.trim() && <Check size={14} />}</div>
      <div className="suggestions">{question.suggestedAnswers.slice(0, 4).map((answer) => <button key={answer} onClick={() => props.onChange(index, answer)}>{answer}</button>)}</div>
      <textarea value={props.answers[index] ?? ""} onChange={(event) => props.onChange(index, event.target.value)} placeholder="选择建议答案，或输入更符合实际情况的答案" />
    </article>)}</div>
    <footer><button className="terminal-button warning" onClick={props.onSkip} disabled={props.busy}>采用默认假设</button><span>默认假设可能降低需求准确度</span><button className="terminal-button primary" onClick={props.onSubmit} disabled={props.busy || answered !== props.questions.length}><Send size={14} />提交本轮回答</button></footer>
  </section>;
}

function LaunchPanel({ icon, title, description, busy, onClick }: { icon: ReactNode; title: string; description: string; busy: boolean; onClick: () => void }) {
  return <section className="launch-panel"><div className="launch-icon">{icon}</div><div><strong>{title}</strong><p>{description}</p></div><button onClick={onClick} disabled={busy}>{busy ? "启动中…" : title}<ChevronRight size={16} /></button></section>;
}

function Composer({ snapshot, value, busy, onChange, onSubmit }: { snapshot: ConsoleSnapshot; value: string; busy: string[]; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  const status = snapshot.project.status;
  let label = "太子在线 — 插话 / 指令 / 变更";
  let placeholder = `${status} — 输入继续、暂停、变更需求、导出或询问进度…`;
  if (status === "Draft Requirement") { label = "输入产品需求"; placeholder = "描述你想构建的产品，Enter 启动流水线"; }
  if (status === "Paused") placeholder = `项目已暂停${snapshot.pausedFrom ? `，原阶段 ${snapshot.pausedFrom}` : ""} — 输入“继续”或点顶部恢复`;
  if (status === "Delivered") placeholder = "项目已交付 — 输入变更需求可重新打开开发";
  return <form className="composer" onSubmit={onSubmit}><label>{label}</label><div><span>❯</span><textarea rows={1} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={placeholder} /><button disabled={!value.trim() || busy.includes("taizi") || busy.includes("requirement")}><Send size={15} /></button></div></form>;
}

function Inspector(props: { snapshot: ConsoleSnapshot; files: string[]; tab: "artifacts" | "files"; onTab: (tab: "artifacts" | "files") => void; onOpen: (path: string) => void; previewUrl?: string; onStartPreview: () => void; onStopPreview: () => void; onExport: () => void; busy: string[] }) {
  const { snapshot } = props;
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const score = snapshot.requirement ? (snapshot.requirement.completenessScore <= 1 ? Math.round(snapshot.requirement.completenessScore * 100) : Math.round(snapshot.requirement.completenessScore)) : undefined;
  const artifacts = unique([
    ...(snapshot.project.status !== "Draft Requirement" ? [`artifacts/${snapshot.project.id}/prd-latest.md`, `artifacts/${snapshot.project.id}/ac-latest.md`] : []),
    ...(LIFECYCLE.findIndex((step) => step.statuses.includes(snapshot.project.status)) >= 2 ? [`artifacts/${snapshot.project.id}/tp-latest.md`] : []),
    ...snapshot.events.filter((event) => event.payload.type === "artifact.created").map((event) => String(event.payload.path ?? "")).filter(Boolean),
  ]);
  const fileRows = useMemo(() => flattenFileTree(buildFileTree(filterRepoPaths(props.files)), expandedDirs), [props.files, expandedDirs]);
  const toggleDirectory = (path: string) => setExpandedDirs((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  return <aside className="inspector-column panel-column">
    <div className="section-rule">PROJECT</div>
    <dl className="project-meta"><dt>name</dt><dd>{snapshot.project.name}</dd><dt>id</dt><dd title={snapshot.project.id}>{snapshot.project.id}</dd><dt>status</dt><dd>{snapshot.project.status}</dd><dt>phase</dt><dd>{snapshot.phase.label}</dd><dt>created</dt><dd>{snapshot.project.createdAt.slice(0, 16).replace("T", " ")}</dd>{score !== undefined && <><dt>complete</dt><dd>{score}%{snapshot.requirement?.completenessLocked ? " (locked)" : ""}</dd></>}{snapshot.dev && snapshot.dev.sliceTotal > 0 && <><dt>slices</dt><dd>{snapshot.dev.sliceIndex}/{snapshot.dev.sliceTotal}{snapshot.dev.currentSliceId ? ` · ${snapshot.dev.currentSliceId}` : ""}</dd></>}{snapshot.testing && snapshot.testing.suiteTotal > 0 && <><dt>tests</dt><dd>{snapshot.testing.suitePassed}/{snapshot.testing.suiteTotal} passed</dd></>}{props.previewUrl && <><dt>preview</dt><dd><a href={props.previewUrl} target="_blank" rel="noreferrer">预览</a></dd></>}</dl>
    <div className="project-actions"><button disabled={props.busy.includes("preview")} onClick={props.previewUrl ? props.onStopPreview : props.onStartPreview}>{props.previewUrl ? <CircleStop size={14} /> : <Play size={14} />}{props.previewUrl ? "取消部署" : "部署"}</button><button disabled={props.busy.includes("export")} onClick={props.onExport}><Download size={14} />导出包</button></div>
    {(snapshot.integrations?.length ?? 0) > 0 && <><div className="section-rule">INTEGRATIONS</div><div className="integrations">{snapshot.integrations!.slice(0, 5).map((item) => <div key={item.integrationId}><span>• {item.displayName}</span><em className={item.status}>{item.status}</em></div>)}</div></>}
    <div className="section-rule">PANEL</div>
    <div className="inspector-tabs"><button className={props.tab === "artifacts" ? "active" : ""} onClick={() => props.onTab("artifacts")}><FileText size={14} />Artifacts</button><button className={props.tab === "files" ? "active" : ""} onClick={() => props.onTab("files")}><FolderTree size={14} />Files</button></div>
    <div className="inspector-list">{props.tab === "artifacts" ? artifacts.map((path) => <button key={path} onClick={() => props.onOpen(path)}><FileText size={14} /><span>{path.split("/").at(-1)}</span></button>) : fileRows.map((row) => row.kind === "dir" ? <button key={row.path} className="file-tree-row directory" style={{ paddingLeft: `${4 + row.depth * 14}px` }} onClick={() => toggleDirectory(row.path)} title={row.path}>{row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{row.expanded ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{row.name}</span><small>{row.childCount}</small></button> : <button key={row.path} className="file-tree-row" style={{ paddingLeft: `${22 + row.depth * 14}px` }} onClick={() => props.onOpen(row.path)} title={row.path}><FileCode2 size={13} /><span>{row.name}</span></button>)}</div>
  </aside>;
}

function FileViewer({ file, projectId, onClose }: { file: FileResult; projectId: string; onClose: () => void }) {
  const isMarkdown = /\.(md|markdown)$/i.test(file.path);
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.path);
  const fileName = file.path.split("/").at(-1) ?? file.path;
  return <div className="overlay" role="dialog" aria-modal="true"><section className="file-viewer"><header><div>{isImage ? <FileText size={16} /> : isMarkdown ? <FileText size={16} /> : <FileCode2 size={16} />}<strong>{file.path}</strong></div><button className="icon-button" onClick={onClose}><X size={17} /></button></header>{isImage ? <div className="file-image-scroll"><img className="file-image" src={api.fileRawUrl(projectId, file.path)} alt={fileName} title={file.absolutePath ?? file.path} />{file.absolutePath && <small className="image-path">{file.absolutePath}</small>}</div> : file.binary ? <div className="binary-file">二进制文件无法在 WebUI 中预览。<small>{file.absolutePath}</small></div> : isMarkdown ? <div className="file-markdown-scroll"><Markdown>{file.content}</Markdown></div> : <pre>{file.content}</pre>}</section></div>;
}

function CommandPalette({ snapshot, onClose, actions }: { snapshot: ConsoleSnapshot; onClose: () => void; actions: { refresh: () => void; togglePause: () => void; toggleTheme: () => void; toggleYolo: () => void; exportProject: () => void; startPreview: () => void; stopPreview: () => void } }) {
  const commands = [
    { label: "刷新项目快照", run: actions.refresh },
    { label: snapshot.project.status === "Paused" ? "恢复项目" : "暂停项目", run: actions.togglePause },
    { label: "切换深色 / 浅色主题", run: actions.toggleTheme },
    { label: "切换 YOLO 危险操作自动放行", run: actions.toggleYolo },
    { label: snapshot.dev?.previewUrl || snapshot.testing?.previewUrl ? "停止预览" : "启动预览", run: snapshot.dev?.previewUrl || snapshot.testing?.previewUrl ? actions.stopPreview : actions.startPreview },
    { label: "导出提交包", run: actions.exportProject },
  ];
  return <div className="overlay palette-overlay" onMouseDown={onClose}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><Command size={16} /><span>命令面板</span><kbd>Esc</kbd></header>{commands.map((command) => <button key={command.label} onClick={() => { command.run(); onClose(); }}><ChevronRight size={14} />{command.label}</button>)}</section></div>;
}
