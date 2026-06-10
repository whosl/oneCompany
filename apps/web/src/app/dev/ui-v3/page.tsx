import { adaptUiV3Projection } from "@/components/ui-v3/projection";
import { adaptConsoleProjection } from "@/components/ui-v2/adapter";
import { UiV3Shell } from "@/components/ui-v3/ui-v3-shell";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { getProjectionScenario } from "@/lib/projection/scenarios";
import "@/styles/ui-v3.css";

export default async function UiV3DevPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; live?: string }>;
}) {
  const { scenario: scenarioId, live } = await searchParams;

  if (live === "1") {
    return (
      <main className="ui-v3-root p-6 text-sm text-[var(--v3-text-muted)]">
        实时模式请打开 <code>/projects/&lt;id&gt;?ui=v3</code>
      </main>
    );
  }

  const scenario = getProjectionScenario(scenarioId);
  if (!scenario) {
    return (
      <main className="ui-v3-root p-6 text-sm text-[var(--v3-text-muted)]">
        未知 scenario。可用：requirement、gate、dangerous、testing、delivered
      </main>
    );
  }

  const projection = adaptUiV3Projection(createProjectionFromSnapshot(scenario.snapshot));

  return (
    <UiV3Shell
      projection={projection}
      actions={{
        onRefresh: async () => undefined,
        onPauseResume: async () => undefined,
        onDeploy: async () => undefined,
        onStartDevelopment: async () => undefined,
        onResolveGate: async () => undefined,
        onComposerSubmit: async () => undefined,
        onContextualAction: async () => undefined,
        onOpenProjectHub: () => undefined,
        onOpenSettings: () => undefined,
      }}
      renderWorkspaceTab={(tab) => (
        <div className="text-sm text-[var(--v3-text-muted)]">
          Fixture workspace · {tab} · {adaptConsoleProjection(createProjectionFromSnapshot(scenario.snapshot)).project.slug}
        </div>
      )}
    />
  );
}
