import { RightPanel } from "@/components/right-panel/right-panel";

export default async function ProjectConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-[var(--oc-app-bg)] p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-lg font-semibold text-[var(--oc-text-primary)]">Project console</h1>
        <RightPanel projectId={id} />
      </div>
    </main>
  );
}
