import { ConsoleLayout } from "@/components/console/console-layout";
import { UiV2Console } from "@/components/ui-v2/ui-v2-console";

export default async function ProjectConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ui?: string }>;
}) {
  const { id } = await params;
  const { ui } = await searchParams;
  const useUiV2 = ui === "v2" || process.env.NEXT_PUBLIC_OC_UI_V2 === "1";

  if (useUiV2) {
    return <UiV2Console projectId={id} />;
  }

  return <ConsoleLayout projectId={id} />;
}
