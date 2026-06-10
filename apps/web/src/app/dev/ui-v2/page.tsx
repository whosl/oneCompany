import { adaptConsoleProjection } from "@/components/ui-v2/adapter";
import { UiV2Shell } from "@/components/ui-v2/ui-v2-shell";
import { createProjectionFromSnapshot } from "@/lib/projection/build-projection";
import { getProjectionScenario } from "@/lib/projection/scenarios";

export default async function UiV2DevPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const { scenario: scenarioId } = await searchParams;
  const scenario = getProjectionScenario(scenarioId);
  const projection = scenario
    ? adaptConsoleProjection(createProjectionFromSnapshot(scenario.snapshot))
    : undefined;

  return <UiV2Shell projection={projection} />;
}
