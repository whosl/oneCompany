import { ConsoleLayout } from "@/components/console/console-layout";

export default async function ProjectConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConsoleLayout projectId={id} />;
}
