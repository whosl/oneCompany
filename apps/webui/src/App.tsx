import { useEffect, useState } from "react";
import { ConsoleScreen } from "./Console";
import { ProjectHub } from "./Hub";

function projectIdFromPath(): string | undefined {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function App() {
  const [projectId, setProjectId] = useState(projectIdFromPath);

  useEffect(() => {
    const onPopState = () => setProjectId(projectIdFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (id?: string) => {
    const path = id ? `/projects/${encodeURIComponent(id)}` : "/";
    window.history.pushState({}, "", path);
    setProjectId(id);
  };

  return projectId ? <ConsoleScreen projectId={projectId} onBack={() => navigate()} /> : <ProjectHub onOpen={(id) => navigate(id)} />;
}
