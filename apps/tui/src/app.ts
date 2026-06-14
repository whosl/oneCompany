import { ApiClient } from "./api.js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { attachStdin, type Key, type MouseEvent } from "./input.js";
import { toggleTurnExpansion } from "./codex-turns.js";
import { toggleTheme } from "./theme.js";
import {
  enterScreen,
  hitTest,
  inInspectorFiles,
  inStream,
  leaveScreen,
  renderConsole,
  renderMarkdownLines,
  renderPicker,
  rosterOrder,
  type PickerState,
} from "./render.js";
import { loadDismissedGates, loadTheme, loadYoloMode, persistDismissedGate, persistTheme, persistYoloMode } from "./persist.js";
import { startEventStream, type SseHandle } from "./sse.js";
import {
  createConsoleState,
  filterPaletteActions,
  hydrateSnapshot,
  applyEnvelope,
  pushNotice,
  pushUserMessage,
  pushTaiziReply,
  markTaiziActive,
  refreshComposer,
  toggleFileDir,
  type ConsoleState,
  type FocusZone,
} from "./store.js";
import type { TuiOptions } from "./types.js";
import type { EventEnvelope } from "./types.js";

const FOCUS_CYCLE: FocusZone[] = ["composer", "timeline", "agents"];

export class App {
  private readonly api: ApiClient;
  private screen: "picker" | "console" = "picker";
  private picker: PickerState = {
    projects: [],
    cursor: 0,
    mode: "list",
    nameInput: "",
    loading: true,
    apiOk: false,
  };
  private console?: ConsoleState;
  private sse?: SseHandle;
  private pollTimer?: NodeJS.Timeout;
  private tickTimer?: NodeJS.Timeout;
  private renderQueued = false;
  private detachStdin: () => void = () => {};
  private lastOpenedProjectId?: string;

  constructor(private readonly options: TuiOptions) {
    this.api = new ApiClient(options.apiBase);
  }

  /* -- lifecycle ----------------------------------------------------- */

  async start(): Promise<void> {
    enterScreen();
    this.detachStdin = attachStdin((key) => this.handleKey(key));
    process.stdout.on("resize", () => this.markDirty());
    // 100ms keeps the spinner and typewriter reveal smooth.
    this.tickTimer = setInterval(() => this.markDirty(), 100);

    this.picker.apiOk = await this.api.health();
    if (!this.picker.apiOk) {
      this.picker.loading = false;
      this.picker.error = `API unreachable at ${this.options.apiBase} — start it with: pnpm api`;
      this.markDirty();
      return;
    }

    if (this.options.projectId) {
      await this.openProject(this.options.projectId);
    } else {
      await this.loadProjects();
    }
  }

  quit(code = 0): never {
    this.closeConsoleStreams();
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.detachStdin();
    leaveScreen();
    if (this.lastOpenedProjectId) {
      process.stdout.write(`\nProject: ${this.lastOpenedProjectId}\n`);
    }
    process.exit(code);
  }

  /* -- rendering ------------------------------------------------------ */

  private markDirty(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setTimeout(() => {
      this.renderQueued = false;
      if (this.screen === "picker") {
        renderPicker(this.picker, this.options.apiBase);
      } else if (this.console) {
        renderConsole(this.console);
      }
    }, 16);
  }

  /* -- picker ----------------------------------------------------------- */

  private async loadProjects(): Promise<void> {
    this.picker.loading = true;
    this.picker.error = undefined;
    this.markDirty();
    try {
      const projects = await this.api.listProjects();
      projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      this.picker.projects = projects;
      this.picker.cursor = Math.min(this.picker.cursor, Math.max(0, projects.length - 1));
      this.picker.apiOk = true;
    } catch (error) {
      this.picker.error = error instanceof Error ? error.message : String(error);
    }
    this.picker.loading = false;
    this.markDirty();
  }

  private async createAndOpenProject(name: string): Promise<void> {
    this.picker.loading = true;
    this.markDirty();
    try {
      const project = await this.api.createProject(name);
      await this.openProject(project.id);
    } catch (error) {
      this.picker.loading = false;
      this.picker.error = error instanceof Error ? error.message : String(error);
      this.markDirty();
    }
  }

  /* -- console ----------------------------------------------------------- */

  private async openProject(projectId: string): Promise<void> {
    this.closeConsoleStreams();
    this.screen = "console";
    this.lastOpenedProjectId = projectId;
    this.console = createConsoleState(projectId, this.options.theme ?? loadTheme());
    this.console.yoloMode = loadYoloMode();
    if (this.console.yoloMode) {
      // Persisted from a previous session — never silently auto-approve.
      pushNotice(
        this.console,
        "info",
        "⚡ YOLO 模式仍处于开启状态（上次会话保留）— 危险操作将自动放行，按 y 关闭",
      );
    }
    // Decisions made in earlier sessions: keep those gate cards hidden even
    // though the server still reports the rows as open mid-resume.
    for (const gateId of loadDismissedGates(projectId)) {
      this.console.dismissedGateIds.add(gateId);
    }
    this.markDirty();

    await this.refreshSnapshot();

    const state = this.console;
    if (!state) return;
    this.sse = startEventStream(
      this.options.apiBase,
      projectId,
      state.lastSeq,
      (envelope) => {
        if (this.console && applyEnvelope(this.console, envelope)) {
          this.maybeYoloApprove(envelope);
          this.markDirty();
        }
      },
      (connected) => {
        if (this.console) {
          this.console.sseConnected = connected;
          this.markDirty();
        }
      },
    );
    this.pollTimer = setInterval(() => void this.refreshSnapshot(), 2_500);
  }

  private closeConsoleStreams(): void {
    this.sse?.stop();
    this.sse = undefined;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private backToPicker(): void {
    this.closeConsoleStreams();
    this.console = undefined;
    this.screen = "picker";
    void this.loadProjects();
  }

  private async refreshSnapshot(): Promise<void> {
    const state = this.console;
    if (!state) return;
    try {
      const snapshot = await this.api.snapshot(state.projectId);
      hydrateSnapshot(state, snapshot);
      try {
        state.repoFiles = await this.api.listFiles(state.projectId, "repo");
      } catch {
        /* best-effort */
      }
      try {
        const preview = await this.api.previewStatus(state.projectId);
        state.previewReachable = preview.health.reachable;
      } catch {
        state.previewReachable = undefined;
      }
      this.yoloSweep();
      this.markDirty();
    } catch {
      /* best-effort; SSE keeps flowing */
    }
  }

  /* -- async action plumbing ---------------------------------------------- */

  /**
   * Wraps an async API call with busy tracking and optional optimistic UI:
   * `hint` shows immediately in the composer; `apply` mutates local state
   * right away (e.g. hide a resolved gate) so the UI reacts before the server.
   */
  private runAction(
    label: string,
    fn: () => Promise<string | void>,
    optimistic?: { hint?: string; apply?: (state: ConsoleState) => void },
  ): void {
    const state = this.console;
    if (!state) return;
    if (state.busy.has(label)) return;
    state.busy.add(label);
    if (optimistic?.apply) optimistic.apply(state);
    if (optimistic?.hint) state.pendingHint = optimistic.hint;
    refreshComposer(state);
    this.markDirty();
    void fn()
      .then((message) => {
        if (message && this.console) pushNotice(this.console, "info", message);
      })
      .catch((error) => {
        if (this.console) {
          let message = error instanceof Error ? error.message : String(error);
          // undici's bare "fetch failed" means the API itself was unreachable.
          if (/fetch failed/i.test(message)) {
            message = `${label} 失败：无法连接 API（fetch failed）— 请确认 API 正在运行，稍后重试`;
          }
          pushNotice(this.console, "error", message);
        }
      })
      .finally(() => {
        const current = this.console;
        if (current) {
          current.busy.delete(label);
          if (optimistic?.hint && current.pendingHint === optimistic.hint) {
            current.pendingHint = undefined;
          }
          refreshComposer(current);
        }
        void this.refreshSnapshot();
      });
  }

  /* -- artifact viewer ----------------------------------------------------- */

  private openArtifact(path: string): void {
    const state = this.console;
    if (!state) return;
    state.viewer = { title: path, lines: [], scroll: 0, loading: true };
    this.markDirty();
    void this.api
      .readFile(state.projectId, path)
      .then((file) => {
        if (!this.console) return;
        if (file.binary && file.absolutePath) {
          this.console.viewer = undefined;
          this.openBinaryArtifact(file.absolutePath, file.path);
          return;
        }
        if (!this.console.viewer) return;
        // Match overlayViewer's inner content width (w - 4 box padding).
        const cols = process.stdout.columns || 120;
        const viewerWidth = Math.min(cols - 6, 110) - 4;
        const lines = file.path.endsWith(".md")
          ? renderMarkdownLines(file.content, viewerWidth)
          : file.content.replace(/\r\n/g, "\n").split("\n");
        this.console.viewer = {
          title: file.path,
          lines,
          scroll: 0,
          loading: false,
        };
        this.markDirty();
      })
      .catch((error) => {
        if (this.console) {
          this.console.viewer = undefined;
          pushNotice(
            this.console,
            "error",
            `无法读取 ${path}: ${error instanceof Error ? error.message : String(error)}`,
          );
          this.markDirty();
        }
      });
  }

  /** Open a local file or folder with the OS default handler (Preview / Finder / …). */
  private openSystemPath(
    absolutePath: string,
    options?: { successMessage?: string; failLabel?: string },
  ): void {
    const state = this.console;
    if (!state) return;
    const failLabel = options?.failLabel ?? absolutePath;
    if (!fs.existsSync(absolutePath)) {
      pushNotice(state, "error", `路径不存在：${absolutePath}`);
      this.markDirty();
      return;
    }

    const run =
      process.platform === "darwin"
        ? (cb: (error: Error | null) => void) => execFile("open", [absolutePath], cb)
        : process.platform === "win32"
          ? (cb: (error: Error | null) => void) => execFile("explorer", [absolutePath], cb)
          : (cb: (error: Error | null) => void) => execFile("xdg-open", [absolutePath], cb);

    run((error) => {
      if (!this.console) return;
      pushNotice(
        this.console,
        error ? "error" : "info",
        error
          ? `无法打开 ${failLabel}: ${error.message}`
          : (options?.successMessage ?? `已打开 ${failLabel}`),
      );
      this.markDirty();
    });
  }

  /** Open exported submission package folder in Finder / file manager. */
  private openSubmissionPackage(packagePath: string): void {
    this.openSystemPath(packagePath, {
      failLabel: "提交包",
      successMessage:
        process.platform === "darwin"
          ? "提交包已导出，已在 Finder 中打开"
          : process.platform === "win32"
            ? "提交包已导出，已在资源管理器中打开"
            : "提交包已导出，已用系统文件管理器打开",
    });
  }

  /** PNG/JPEG etc. cannot render in the terminal — open with the OS viewer. */
  private openBinaryArtifact(absolutePath: string, label: string): void {
    this.openSystemPath(absolutePath, {
      failLabel: label,
      successMessage: `已用 Preview 打开 ${label}`,
    });
  }

  /* -- business actions ----------------------------------------------------- */

  private submitRequirement(text: string): void {
    const state = this.console;
    if (!state) return;
    pushUserMessage(state, text);
    state.seededRequirement = true;
    const profile = this.options.stub ? "complete" : undefined;
    this.runAction(
      "requirement",
      async () => {
        const result = await this.api.startRequirement(state.projectId, text, profile);
        return `requirement started → ${result.phase}`;
      },
      { hint: "需求已提交 — 需求录入 Agent 正在分析…" },
    );
  }

  private skipClarification(): void {
    const state = this.console;
    if (!state || state.composer.mode !== "question_round") return;
    pushUserMessage(state, "跳过澄清，采用系统默认假设");
    this.runAction(
      "skip clarification",
      async () => {
        const result = await this.api.skipClarification(state.projectId);
        return `clarification skipped → ${result.phase}`;
      },
      {
        hint: "已跳过澄清 — 正在用默认假设生成 PRD…",
        apply: (s) => {
          if (s.snapshot?.requirement) s.snapshot.requirement.pendingQuestions = [];
        },
      },
    );
  }

  private submitDraftAnswers(): void {
    const state = this.console;
    if (!state || state.composer.mode !== "question_round") return;
    this.flushQuestionDraft(state);
    const answers = [...state.composer.draftAnswers];
    if (answers.some((answer) => !answer.trim())) {
      pushNotice(state, "error", "请先回答全部问题，或用 ← → 切换检查每题答案。");
      return;
    }
    this.submitAnswers(answers);
  }

  private flushQuestionDraft(state: ConsoleState): void {
    const composer = state.composer;
    const text = composer.input.trim();
    if (text) {
      composer.draftAnswers[composer.questionIndex] = text;
      composer.input = "";
    }
  }

  private navigateQuestion(state: ConsoleState, delta: number): void {
    const composer = state.composer;
    if (composer.mode !== "question_round" || composer.questions.length === 0) return;
    this.flushQuestionDraft(state);
    const next = Math.max(0, Math.min(composer.questions.length - 1, composer.questionIndex + delta));
    composer.questionIndex = next;
    composer.input = composer.draftAnswers[next] ?? "";
  }

  private submitAnswers(answers: string[]): void {
    const state = this.console;
    if (!state) return;
    this.runAction(
      "answers",
      async () => {
        const result = await this.api.submitAnswers(state.projectId, answers);
        return `answers submitted → ${result.phase}`;
      },
      {
        hint: "回答已提交 — 等待 agent 重新评估…",
        apply: (s) => {
          const pending = s.snapshot?.requirement?.pendingQuestions;
          // Remember the answered round so snapshot polls don't resurrect it
          // while the workflow is still chewing on the answers.
          if (pending?.length) {
            s.answeredQuestionsKey = pending.map((q) => q.question).join("|");
          }
          if (s.snapshot?.requirement) s.snapshot.requirement.pendingQuestions = [];
        },
      },
    );
  }

  private maybeYoloApprove(envelope: EventEnvelope): void {
    const state = this.console;
    if (!state?.yoloMode) return;
    const payload = envelope.payload;
    if (payload.type !== "human_gate.created") return;
    if (payload.gateType !== "dangerous_operation") return;
    const gateId = String(payload.gateId ?? "");
    if (!gateId || state.dismissedGateIds.has(gateId)) return;
    this.resolveGate(gateId, "approve", undefined, { yolo: true });
  }

  /**
   * Auto-approve dangerous-operation gates that are ALREADY open — gates that
   * arrived before YOLO was toggled on, or via snapshot polling while SSE was
   * down. Event-driven approval alone would leave those sitting forever.
   */
  private yoloSweep(): void {
    const state = this.console;
    if (!state?.yoloMode || !state.snapshot) return;
    for (const gate of state.snapshot.openGates) {
      if (gate.gateType !== "dangerous_operation") continue;
      if (state.dismissedGateIds.has(gate.id)) continue;
      if (state.busy.has(`gate:${gate.id}`)) continue;
      this.resolveGate(gate.id, "approve", undefined, { yolo: true });
    }
  }

  private resolveGate(
    gateId: string,
    decision: string,
    customText?: string,
    opts?: { yolo?: boolean },
  ): void {
    // Per-gate busy key: resolving one gate can block server-side for minutes
    // (the workflow resumes inside the request), and a shared "gate" label
    // would silently swallow clicks on any other gate that opens meanwhile.
    this.runAction(
      `gate:${gateId}`,
      async () => {
        await this.api.resolveGate(gateId, decision, customText);
        return `gate resolved → ${decision}`;
      },
      {
        hint: opts?.yolo
          ? "⚡ YOLO 自动放行 — 工作流继续中…"
          : `已选择「${decision}」— 工作流继续中…`,
        apply: (s) => {
          // Server keeps the gate row open until the resumed workflow yields;
          // mark it dismissed (and persist across TUI restarts) so snapshot
          // polls / re-entering the project don't bring the card back.
          s.dismissedGateIds.add(gateId);
          persistDismissedGate(s.projectId, gateId);
          if (s.snapshot) {
            s.snapshot.openGates = s.snapshot.openGates.filter((gate) => gate.id !== gateId);
          }
        },
      },
    );
  }

  private submitDeploymentUrl(gateId: string, url: string): void {
    const state = this.console;
    if (!state) return;
    pushUserMessage(state, `deployment url: ${url}`);
    this.runAction(
      "deploy",
      async () => {
        await this.api.setDeploymentUrl(state.projectId, url);
        await this.api.resolveGate(gateId, "approve");
        return `deployment confirmed → ${url}`;
      },
      {
        hint: "部署地址已确认 — 工作流继续中…",
        apply: (s) => {
          if (s.snapshot) {
            s.snapshot.openGates = s.snapshot.openGates.filter((gate) => gate.id !== gateId);
          }
        },
      },
    );
  }

  private submitCodingAnswer(gateId: string, answer: string): void {
    const state = this.console;
    if (!state) return;
    pushUserMessage(state, `coding answer: ${answer}`);
    this.runAction(
      `gate:${gateId}`,
      async () => {
        // "answer" carries the free-text reply as customText; the server's
        // normalizeDecision stores it as `answer:<text>` and the harness's
        // blocking waitForGate resolves to inject it into the opencode session.
        await this.api.resolveGate(gateId, "answer", answer);
        return `coding answer submitted`;
      },
      {
        hint: "答案已发送 — Coding Agent 继续实现…",
        apply: (s) => {
          s.dismissedGateIds.add(gateId);
          persistDismissedGate(s.projectId, gateId);
          if (s.snapshot) {
            s.snapshot.openGates = s.snapshot.openGates.filter((gate) => gate.id !== gateId);
          }
        },
      },
    );
  }

  /**
   * Taizi（太子）统一入口：任意模式下的自由文本都送到这里。
   * 服务端判断意图（继续/暂停/打断/变更/门禁/导出/进度…）并分发到目标
   * agent；这里只回显消息并展示路由结果，长动作进度走事件流。
   */
  private sendToTaizi(raw: string): void {
    const state = this.console;
    if (!state) return;
    const text = raw.trim();
    if (!text) return;
    pushUserMessage(state, text);
    markTaiziActive(state);
    state.localUserEchoes.add(text);
    this.runAction(
      "taizi",
      async () => {
        const result = await this.api.taiziMessage(state.projectId, text);
        if (this.console) {
          pushTaiziReply(this.console, result.reply, result.action);
          if (result.openPath) {
            this.openSubmissionPackage(result.openPath);
          }
          this.markDirty();
        }
      },
      { hint: "太子正在判断你的意图并分发…" },
    );
  }

  private dispatchAction(id: string): void {
    const state = this.console;
    if (!state) return;
    switch (id) {
      case "start_dev":
        this.runAction(
          "development",
          async () => {
            const profile = this.options.stub ? "testing_pass" : undefined;
            const result = await this.api.startDevelopment(state.projectId, profile);
            return `development started → ${result.phase}`;
          },
          { hint: "正在启动开发阶段 — 架构师 Agent 即将开始…" },
        );
        break;
      case "start_testing":
        this.runAction(
          "testing",
          async () => {
            const result = await this.api.startTesting(state.projectId, true);
            return `testing started → ${result.phase}`;
          },
          { hint: "正在启动测试阶段…" },
        );
        break;
      case "delivery_report":
        this.runAction("delivery report", async () => {
          await this.api.generateDelivery(state.projectId);
          return "delivery report generated";
        });
        break;
      case "export_submission":
        this.runAction("export submission", async () => {
          const result = await this.api.exportSubmission(state.projectId);
          this.openSubmissionPackage(result.packagePath);
          return `submission exported → ${result.packagePath}`;
        });
        break;
      case "start_preview":
        this.runAction(
          "start preview",
          async () => {
            const result = await this.api.startPreview(state.projectId);
            if (this.console) {
              this.console.previewReachable = result.health.reachable;
              if (this.console.snapshot?.dev) {
                this.console.snapshot.dev.previewUrl = result.url;
              }
              if (this.console.snapshot?.testing) {
                this.console.snapshot.testing.previewUrl = result.url;
              }
            }
            return `preview started → ${result.url}`;
          },
          { hint: "正在启动预览部署…" },
        );
        break;
      case "stop_preview":
        this.runAction(
          "stop preview",
          async () => {
            await this.api.stopPreview(state.projectId);
            return "preview stopped";
          },
          {
            hint: "正在取消部署…",
            apply: (s) => {
              s.previewReachable = false;
              if (s.snapshot?.dev) s.snapshot.dev.previewUrl = undefined;
              if (s.snapshot?.testing) s.snapshot.testing.previewUrl = undefined;
            },
          },
        );
        break;
      case "skip_clarification":
        this.skipClarification();
        break;
      case "submit_answers":
        this.submitDraftAnswers();
        break;
      case "inspector_artifacts":
        state.inspectorTab = "artifacts";
        break;
      case "inspector_files":
        state.inspectorTab = "files";
        state.fileTreeScroll = 0;
        break;
      case "pause_resume": {
        const paused = state.snapshot?.project.status === "Paused";
        this.runAction(paused ? "resume" : "pause", async () => {
          if (paused) await this.api.resumeProject(state.projectId);
          else await this.api.pauseProject(state.projectId);
          return paused ? "project resumed" : "project paused";
        });
        break;
      }
      case "refresh":
        void this.refreshSnapshot();
        break;
      case "toggle_yolo": {
        state.yoloMode = !state.yoloMode;
        persistYoloMode(state.yoloMode);
        pushNotice(
          state,
          "info",
          state.yoloMode
            ? "⚡ YOLO 已开启 — 危险操作将自动放行（顶部显示 ⚡YOLO）"
            : "YOLO 已关闭 — 危险操作需手动确认",
        );
        if (state.yoloMode) this.yoloSweep();
        break;
      }
      case "toggle_theme": {
        state.theme = toggleTheme(state.theme);
        persistTheme(state.theme);
        pushNotice(
          state,
          "info",
          state.theme === "dark"
            ? "已切换为深色主题 — 太子回复使用柔和深底（按 m 切回浅色）"
            : "已切换为浅色主题 — 太子回复使用暖色浅底（按 m 切回深色）",
        );
        break;
      }
      case "follow_stream":
        state.timelineScroll = 0;
        break;
      default:
        break;
    }
  }

  /* -- key handling ----------------------------------------------------------- */

  private handleKey(key: Key): void {
    if (key.type === "ctrl" && key.ch === "c") this.quit();

    if (key.type === "mouse") {
      this.handleMouse(key);
    } else if (this.screen === "picker") {
      this.handlePickerKey(key);
    } else {
      this.handleConsoleKey(key);
    }
    this.markDirty();
  }

  private handleMouse(event: MouseEvent): void {
    if (this.screen === "picker") {
      const picker = this.picker;
      if (event.kind === "wheelup") picker.cursor = Math.max(0, picker.cursor - 1);
      else if (event.kind === "wheeldown") {
        picker.cursor = Math.min(picker.projects.length - 1, picker.cursor + 1);
      } else if (event.kind === "press") {
        const hit = hitTest(event.x, event.y);
        if (!hit) return;
        if (hit.type === "open_project") void this.openProject(hit.id);
        else if (hit.type === "action") {
          if (hit.id === "new_project") picker.mode = "naming";
          else if (hit.id === "refresh_projects") void this.loadProjects();
          else if (hit.id === "quit") this.quit();
        }
      }
      return;
    }

    const state = this.console;
    if (!state) return;

    if (state.commandPalette) {
      if (event.kind === "press") {
        const hit = hitTest(event.x, event.y);
        if (hit?.type === "palette_action") {
          this.dispatchAction(hit.id);
          state.commandPalette = undefined;
        }
      }
      return;
    }

    // File viewer overlay captures all mouse input.
    if (state.viewer) {
      if (event.kind === "wheelup") {
        state.viewer.scroll = Math.max(0, state.viewer.scroll - 3);
      } else if (event.kind === "wheeldown") {
        state.viewer.scroll += 3;
      } else if (event.kind === "press") {
        state.viewer = undefined;
      }
      return;
    }

    if (event.kind === "wheelup" || event.kind === "wheeldown") {
      if (inStream(event.x, event.y)) {
        state.timelineScroll =
          event.kind === "wheelup"
            ? state.timelineScroll + 3
            : Math.max(0, state.timelineScroll - 3);
      } else if (inInspectorFiles(event.x, event.y) && state.inspectorTab === "files") {
        state.fileTreeScroll =
          event.kind === "wheelup"
            ? Math.max(0, state.fileTreeScroll - 3)
            : state.fileTreeScroll + 3;
      }
      return;
    }

    if (event.kind !== "press") return;
    const hit = hitTest(event.x, event.y);
    if (!hit) return;

    switch (hit.type) {
      case "focus":
        state.focus = hit.zone;
        break;
      case "select_agent": {
        const roster = rosterOrder(state);
        const index = roster.findIndex((agent) => agent.id === hit.id);
        if (index >= 0) state.agentCursor = index;
        this.focusAgentStream(state, hit.id);
        break;
      }
      case "timeline_focus_back":
        if (state.timelineFocusAgentId) {
          state.agentStreamScroll.set(state.timelineFocusAgentId, state.timelineScroll);
        }
        state.timelineFocusAgentId = undefined;
        state.timelineScroll = 0;
        state.focus = "timeline";
        break;
      case "gate_option": {
        const options = state.composer.gateOptions;
        const option = options[hit.index];
        if (option) {
          state.composer.gateCursor = hit.index;
          this.chooseGateOption(state, option);
        }
        break;
      }
      case "suggestion": {
        const question = state.composer.questions[state.composer.questionIndex];
        const answer = question?.suggestedAnswers[hit.index];
        if (answer) this.recordAnswer(state, answer, { advance: true });
        break;
      }
      case "skip_clarification":
        this.skipClarification();
        break;
      case "question_prev":
        this.navigateQuestion(state, -1);
        break;
      case "question_next":
        this.navigateQuestion(state, 1);
        break;
      case "inspector_tab":
        state.inspectorTab = hit.tab;
        if (hit.tab === "files") state.fileTreeScroll = 0;
        break;
      case "action":
        this.dispatchAction(hit.id);
        break;
      case "palette_action":
        if (state.commandPalette) {
          this.dispatchAction(hit.id);
          state.commandPalette = undefined;
        }
        break;
      case "open_artifact":
        this.openArtifact(hit.path);
        break;
      case "open_file":
        this.openArtifact(hit.path);
        break;
      case "toggle_file_dir":
        toggleFileDir(state, hit.path);
        break;
      case "toggle_turn":
        toggleTurnExpansion(state, hit.id, hit.expanded);
        break;
      default:
        break;
    }
  }

  private handlePickerKey(key: Key): void {
    const picker = this.picker;

    if (picker.mode === "naming") {
      if (key.type === "esc") {
        picker.mode = "list";
        picker.nameInput = "";
      } else if (key.type === "enter") {
        const name = picker.nameInput.trim();
        if (name) {
          picker.mode = "list";
          picker.nameInput = "";
          void this.createAndOpenProject(name);
        }
      } else if (key.type === "backspace") {
        picker.nameInput = [...picker.nameInput].slice(0, -1).join("");
      } else if (key.type === "char") {
        picker.nameInput += key.ch;
      }
      return;
    }

    if (key.type === "up") picker.cursor = Math.max(0, picker.cursor - 1);
    else if (key.type === "down") picker.cursor = Math.min(picker.projects.length - 1, picker.cursor + 1);
    else if (key.type === "enter") {
      const project = picker.projects[picker.cursor];
      if (project) void this.openProject(project.id);
    } else if (key.type === "char") {
      if (key.ch === "q") this.quit();
      if (key.ch === "n") picker.mode = "naming";
      if (key.ch === "r") void this.loadProjects();
    }
  }

  private handleConsoleKey(key: Key): void {
    const state = this.console;
    if (!state) return;

    // Command palette captures input (opencode-style Ctrl+P menu).
    if (state.commandPalette) {
      return this.handleCommandPaletteKey(state, key);
    }

    // File viewer overlay captures all keys.
    if (state.viewer) {
      const viewer = state.viewer;
      const page = Math.max(4, (process.stdout.rows || 40) - 10);
      if (key.type === "esc" || (key.type === "char" && key.ch === "q")) {
        state.viewer = undefined;
      } else if (key.type === "up") viewer.scroll = Math.max(0, viewer.scroll - 1);
      else if (key.type === "down") viewer.scroll += 1;
      else if (key.type === "pgup") viewer.scroll = Math.max(0, viewer.scroll - page);
      else if (key.type === "pgdn") viewer.scroll += page;
      else if (key.type === "home") viewer.scroll = 0;
      else if (key.type === "end") viewer.scroll = Number.MAX_SAFE_INTEGER;
      return;
    }

    // Global controls (work regardless of focus / typing).
    if (key.type === "ctrl") {
      if (key.ch === "b") return this.backToPicker();
      if (key.ch === "r") return void this.refreshSnapshot();
      if (key.ch === "p") {
        state.commandPalette = { query: "", cursor: 0 };
        return;
      }
      return;
    }
    if (key.type === "tab") {
      const index = FOCUS_CYCLE.indexOf(state.focus);
      state.focus = FOCUS_CYCLE[(index + 1) % FOCUS_CYCLE.length]!;
      return;
    }
    if (key.type === "esc") {
      if (state.composer.mode === "gate_custom") {
        state.composer.mode = "gate_decision";
        state.composer.input = "";
        refreshComposer(state);
      } else if (state.composer.input) {
        state.composer.input = "";
      } else {
        state.focus = "composer";
      }
      return;
    }

    if (state.focus === "timeline") return this.handleTimelineKey(state, key);
    if (state.focus === "agents") return this.handleAgentsKey(state, key);
    this.handleComposerKey(state, key);
  }

  private handleTimelineKey(state: ConsoleState, key: Key): void {
    if (key.type === "esc" && state.timelineFocusAgentId) {
      state.agentStreamScroll.set(state.timelineFocusAgentId, state.timelineScroll);
      state.timelineFocusAgentId = undefined;
      state.timelineScroll = 0;
      return;
    }
    const page = Math.max(4, (process.stdout.rows || 40) - 14);
    if (key.type === "up") state.timelineScroll += 1;
    else if (key.type === "down") state.timelineScroll = Math.max(0, state.timelineScroll - 1);
    else if (key.type === "pgup") state.timelineScroll += page;
    else if (key.type === "pgdn") state.timelineScroll = Math.max(0, state.timelineScroll - page);
    else if (key.type === "home") state.timelineScroll = Number.MAX_SAFE_INTEGER;
    else if (key.type === "end") state.timelineScroll = 0;
    else if (key.type === "char") this.handleShortcut(state, key.ch);
  }

  private focusAgentStream(state: ConsoleState, agentId: string): void {
    if (state.timelineFocusAgentId) {
      state.agentStreamScroll.set(state.timelineFocusAgentId, state.timelineScroll);
    }
    state.timelineFocusAgentId = agentId;
    state.inspectorAgentId = agentId;
    state.timelineScroll = state.agentStreamScroll.get(agentId) ?? 0;
    state.focus = "timeline";
  }

  private handleAgentsKey(state: ConsoleState, key: Key): void {
    const roster = rosterOrder(state);
    if (key.type === "up") state.agentCursor = Math.max(0, state.agentCursor - 1);
    else if (key.type === "down") state.agentCursor = Math.min(roster.length - 1, state.agentCursor + 1);
    else if (key.type === "enter") {
      const agent = roster[state.agentCursor];
      if (agent) this.focusAgentStream(state, agent.id);
    } else if (key.type === "char") this.handleShortcut(state, key.ch);
  }

  private handleComposerKey(state: ConsoleState, key: Key): void {
    const composer = state.composer;

    switch (composer.mode) {
      case "gate_decision": {
        const options = composer.gateOptions;
        if (!composer.gateId || options.length === 0) {
          if (key.type === "char") this.handleShortcut(state, key.ch);
          return;
        }
        if (key.type === "left" || key.type === "up") {
          composer.gateCursor = (composer.gateCursor + options.length - 1) % options.length;
        } else if (key.type === "right" || key.type === "down") {
          composer.gateCursor = (composer.gateCursor + 1) % options.length;
        } else if (key.type === "enter") {
          // 输入了自然语言（如「批准」「换个方案」）→ 交给太子判断；
          // 空输入则按当前高亮选项决策。
          const text = composer.input.trim();
          if (text) {
            composer.input = "";
            this.sendToTaizi(text);
          } else {
            this.chooseGateOption(state, options[composer.gateCursor]!);
          }
        } else if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "char") {
          const digit = Number(key.ch);
          if (
            composer.input === "" &&
            Number.isInteger(digit) &&
            digit >= 1 &&
            digit <= options.length
          ) {
            composer.gateCursor = digit - 1;
            this.chooseGateOption(state, options[digit - 1]!);
          } else {
            composer.input += key.ch;
          }
        }
        return;
      }

      case "deployment_url": {
        const options = composer.gateOptions;
        if (key.type === "left") {
          composer.gateCursor = (composer.gateCursor + options.length - 1) % Math.max(1, options.length);
        } else if (key.type === "right") {
          composer.gateCursor = (composer.gateCursor + 1) % Math.max(1, options.length);
        } else if (key.type === "enter") {
          const url = composer.input.trim();
          if (url && composer.gateId) {
            this.submitDeploymentUrl(composer.gateId, url);
            composer.input = "";
          } else if (composer.gateId && options[composer.gateCursor]) {
            this.chooseGateOption(state, options[composer.gateCursor]!);
          }
        } else if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "char") {
          composer.input += key.ch;
        }
        return;
      }

      case "coding_question": {
        const options = composer.gateOptions;
        if (key.type === "left") {
          composer.gateCursor = (composer.gateCursor + options.length - 1) % Math.max(1, options.length);
        } else if (key.type === "right") {
          composer.gateCursor = (composer.gateCursor + 1) % Math.max(1, options.length);
        } else if (key.type === "enter") {
          const answer = composer.input.trim();
          const highlighted = options[composer.gateCursor];
          // If the user typed an answer, submit it. Otherwise fall back to the
          // highlighted option — but refuse to submit "answer" with empty text
          // (would inject a blank reply). Default cursor sits on "skip".
          if (answer && composer.gateId) {
            this.submitCodingAnswer(composer.gateId, answer);
            composer.input = "";
          } else if (composer.gateId && highlighted && highlighted !== "answer") {
            this.chooseGateOption(state, highlighted);
          }
        } else if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "char") {
          composer.input += key.ch;
        }
        return;
      }

      case "question_round": {
        const question = composer.questions[composer.questionIndex];
        if (!question) return;
        if (key.type === "left") {
          this.navigateQuestion(state, -1);
          return;
        }
        if (key.type === "right") {
          this.navigateQuestion(state, 1);
          return;
        }
        if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "char") {
          const digit = Number(key.ch);
          if (
            composer.input === "" &&
            Number.isInteger(digit) &&
            digit >= 1 &&
            digit <= question.suggestedAnswers.length
          ) {
            this.recordAnswer(state, question.suggestedAnswers[digit - 1]!, { advance: true });
          } else if (composer.input === "" && key.ch === "k") {
            // 快捷键只在尚未输入时生效，避免吃掉答案里的字母（如 "risk"）。
            this.skipClarification();
          } else if (composer.input === "" && key.ch === "s") {
            this.submitDraftAnswers();
          } else {
            composer.input += key.ch;
          }
        } else if (key.type === "enter") {
          const answer = composer.input.trim();
          if (answer) {
            this.recordAnswer(state, answer, { advance: true });
          } else if (
            composer.draftAnswers.every((item) => item.trim().length > 0) &&
            composer.draftAnswers.length === composer.questions.length
          ) {
            this.submitDraftAnswers();
          } else {
            pushNotice(state, "error", "输入答案、按 1-9 选建议，或用 ← → 切换问题。");
          }
        }
        return;
      }

      case "requirement":
      case "change_request":
      case "gate_custom": {
        if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "char") {
          composer.input += key.ch;
        } else if (key.type === "enter") {
          const text = composer.input.trim();
          if (!text) return;
          composer.input = "";
          if (composer.mode === "requirement") this.submitRequirement(text);
          else if (composer.mode === "change_request") this.sendToTaizi(text);
          else if (composer.gateId) {
            const decision = composer.pendingGateDecision ?? "custom";
            pushUserMessage(state, `reject: ${text}`);
            this.resolveGate(composer.gateId, decision, text);
            composer.pendingGateDecision = undefined;
          }
        }
        return;
      }

      default: {
        // read_only / paused：输入框全程可用（太子接收）。
        // 输入为空时单字母仍作快捷键（q/b/d/e/p…），开始打字后全部进输入框。
        if (key.type === "backspace") {
          composer.input = [...composer.input].slice(0, -1).join("");
        } else if (key.type === "enter") {
          const text = composer.input.trim();
          if (!text) return;
          composer.input = "";
          this.sendToTaizi(text);
        } else if (key.type === "char") {
          if (composer.input === "" && this.isShortcutKey(state, key.ch)) {
            this.handleShortcut(state, key.ch);
          } else {
            composer.input += key.ch;
          }
        }
      }
    }
  }

  private chooseGateOption(state: ConsoleState, option: string): void {
    const composer = state.composer;
    if (!composer.gateId) return;
    if (option === "reject_and_redo" && composer.gateType === "final_acceptance") {
      composer.mode = "gate_custom";
      composer.pendingGateDecision = "reject_and_redo";
      composer.input = "";
      composer.reason = "驳回重做 — 在下方说明问题或修改意见，Enter 发送";
      return;
    }
    if (option === "custom") {
      composer.mode = "gate_custom";
      composer.pendingGateDecision = "custom";
      composer.input = "";
      composer.reason = "Custom decision — describe what should happen instead.";
      return;
    }
    this.resolveGate(composer.gateId, option);
  }

  private recordAnswer(
    state: ConsoleState,
    answer: string,
    options: { advance?: boolean } = {},
  ): void {
    const composer = state.composer;
    composer.draftAnswers[composer.questionIndex] = answer;
    pushUserMessage(state, `A${composer.questionIndex + 1}: ${answer}`);
    composer.input = "";
    if (options.advance !== false) {
      if (composer.questionIndex < composer.questions.length - 1) {
        composer.questionIndex += 1;
        composer.input = composer.draftAnswers[composer.questionIndex] ?? "";
      } else if (composer.draftAnswers.every((item) => item.trim().length > 0)) {
        this.submitDraftAnswers();
      }
    }
  }

  private handleCommandPaletteKey(state: ConsoleState, key: Key): void {
    const palette = state.commandPalette!;
    const actions = filterPaletteActions(state);

    if (key.type === "esc") {
      state.commandPalette = undefined;
      return;
    }
    if (key.type === "up") {
      palette.cursor = Math.max(0, palette.cursor - 1);
      return;
    }
    if (key.type === "down") {
      palette.cursor = Math.min(Math.max(0, actions.length - 1), palette.cursor + 1);
      return;
    }
    if (key.type === "enter") {
      const action = actions[palette.cursor];
      state.commandPalette = undefined;
      if (action) this.dispatchAction(action.id);
      return;
    }
    if (key.type === "backspace") {
      palette.query = [...palette.query].slice(0, -1).join("");
      palette.cursor = 0;
      return;
    }
    if (key.type === "char") {
      palette.query += key.ch;
      palette.cursor = 0;
    }
  }

  private isShortcutKey(state: ConsoleState, ch: string): boolean {
    return ch === "q" || ch === "b";
  }

  private handleShortcut(state: ConsoleState, ch: string): void {
    if (ch === "q") this.quit();
    if (ch === "b") return this.backToPicker();
  }
}
