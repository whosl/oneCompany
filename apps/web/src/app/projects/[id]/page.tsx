import { ConsoleScreen } from "../../../components/console/ConsoleScreen";

export default function ProjectConsolePage({ params }: { params: Promise<{ id: string }> }) {
  return <ConsoleScreenPage params={params} />;
}

import { use } from "react";
function ConsoleScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ConsoleScreen projectId={id} />;
}
