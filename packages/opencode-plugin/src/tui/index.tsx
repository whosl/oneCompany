/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, onMount, Show, For } from "solid-js";
import { PLUGIN_ID, resolveApiUrl } from "../shared/config.js";
import {
  checkSidecarHealth,
  createProject,
  fetchSnapshot,
  listProjects,
  type ConsoleSnapshot,
  type ProjectRecord,
} from "../shared/sidecar.js";

const tui: TuiPlugin = async (api, options) => {
  const apiUrl = resolveApiUrl(
    typeof options?.apiUrl === "string" ? options.apiUrl : undefined,
  );

  api.command?.register(() => [
    {
      title: "OneCompany Hub",
      description: "Open delivery pipeline project center",
      value: "onecompany.hub",
      slash: { name: "onecompany", aliases: ["oc", "oneco"] },
      category: "OneCompany",
      onSelect: () => api.route.navigate("onecompany"),
    },
  ]);

  api.route.register([
    {
      name: "onecompany",
      render: () => <ProjectHub api={api} apiUrl={apiUrl} />,
    },
    {
      name: "onecompany-console",
      render: (ctx) => (
        <ProjectConsole
          api={api}
          apiUrl={apiUrl}
          projectId={String(ctx?.params?.projectId ?? "")}
        />
      ),
    },
  ]);

  void checkSidecarHealth(apiUrl).then((health) => {
    if (health.ok) {
      api.ui.toast({ title: "OneCompany", message: `Sidecar OK (${apiUrl})`, variant: "success" });
    } else {
      api.ui.toast({
        title: "OneCompany",
        message: `Sidecar offline — run: onecompany daemon`,
        variant: "warning",
      });
    }
  });
};

function ProjectHub(props: { api: import("@opencode-ai/plugin/tui").TuiPluginApi; apiUrl: string }) {
  const [projects, setProjects] = createSignal<ProjectRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | undefined>();
  const [cursor, setCursor] = createSignal(0);

  onMount(async () => {
    try {
      const rows = await listProjects(props.apiUrl);
      rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setProjects(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  });

  const open = (projectId: string) => {
    props.api.route.navigate("onecompany-console", { projectId });
  };

  const create = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const project = await createProject(`Project ${new Date().toISOString().slice(0, 10)}`, props.apiUrl);
      open(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <box style={{ flexDirection: "column", padding: 1, gap: 1, flexGrow: 1 }}>
      <text fg="cyan">OneCompany — Project Hub</text>
      <text fg="gray">{props.apiUrl}</text>
      <Show when={loading()}>
        <text>Loading projects…</text>
      </Show>
      <Show when={error()}>
        <text fg="red">{error()}</text>
      </Show>
      <Show when={!loading() && !error()}>
        <For each={projects()}>
          {(project, index) => (
            <box
              style={{ flexDirection: "row", gap: 1 }}
              onMouseDown={() => {
                setCursor(index());
                open(project.id);
              }}
            >
              <text fg={index() === cursor() ? "yellow" : undefined}>
                {project.name} — {project.status}
              </text>
            </box>
          )}
        </For>
        <Show when={projects().length === 0}>
          <text>No projects yet.</text>
        </Show>
      </Show>
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text fg="green" onMouseDown={() => void create()}>[ New project ]</text>
        <text fg="gray" onMouseDown={() => props.api.route.navigate("home")}>[ Back ]</text>
      </box>
    </box>
  );
}

function ProjectConsole(props: {
  api: import("@opencode-ai/plugin/tui").TuiPluginApi;
  apiUrl: string;
  projectId: string;
}) {
  const [snapshot, setSnapshot] = createSignal<ConsoleSnapshot | undefined>();
  const [error, setError] = createSignal<string | undefined>();
  const [taiziReply, setTaiziReply] = createSignal<string | undefined>();

  onMount(async () => {
    if (!props.projectId) {
      setError("Missing projectId");
      return;
    }
    process.env.ONECOMPANY_PROJECT_ID = props.projectId;
    try {
      setSnapshot(await fetchSnapshot(props.projectId, props.apiUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  const gates = () => snapshot()?.openGates ?? [];

  return (
    <box style={{ flexDirection: "column", padding: 1, gap: 1, flexGrow: 1 }}>
      <text fg="cyan">OneCompany Console</text>
      <Show when={error()}>
        <text fg="red">{error()}</text>
      </Show>
      <Show when={snapshot()}>
        {(snap) => (
          <>
            <text>{snap().project.name} — {snap().project.status}</text>
            <text fg="gray">{snap().phase.label}</text>
            <Show when={snap().dev}>
              {(dev) => (
                <text>
                  Slice {dev().sliceIndex + 1}/{dev().sliceTotal}
                  {dev().currentSliceId ? ` (${dev().currentSliceId})` : ""}
                </text>
              )}
            </Show>
            <Show when={gates().length > 0}>
              <text fg="yellow">Open gates: {gates().map((g) => g.gateType).join(", ")}</text>
            </Show>
            <Show when={snap().requirement?.pendingQuestions?.length}>
              <text fg="magenta">
                Clarification: {snap().requirement!.pendingQuestions!.length} question(s) pending
              </text>
            </Show>
          </>
        )}
      </Show>
      <Show when={taiziReply()}>
        <text fg="green">{taiziReply()}</text>
      </Show>
      <box style={{ flexDirection: "row", gap: 2 }}>
        <text
          fg="green"
          onMouseDown={async () => {
            try {
              const res = await fetch(`${props.apiUrl}/projects/${props.projectId}/taizi/message`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "现在到哪了？" }),
              });
              const body = (await res.json()) as { reply?: string };
              setTaiziReply(body.reply ?? "ok");
            } catch (err) {
              setTaiziReply(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          [ Taizi: status ]
        </text>
        <text fg="blue">[ Coding: use OpenCode home session when Developing ]</text>
        <text fg="gray" onMouseDown={() => props.api.route.navigate("onecompany")}>[ Hub ]</text>
      </box>
      <text fg="gray">Full console: pnpm tui2 — plugin UI is v0 preview</text>
    </box>
  );
}

const pluginModule: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default pluginModule;
