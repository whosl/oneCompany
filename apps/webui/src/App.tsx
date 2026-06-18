import { useEffect, useState } from "react";
import { ConsoleScreen } from "./Console";
import { ProjectHub } from "./Hub";
import { TodoMotionLab } from "./TodoMotionLab";

type RouteState = { page: "hub" } | { page: "project"; projectId: string } | { page: "todo-motion-lab" };

function routeFromPath(): RouteState {
  if (window.location.pathname === "/todo-motion-lab") return { page: "todo-motion-lab" };
  const projectId = projectIdFromPath();
  return projectId ? { page: "project", projectId } : { page: "hub" };
}

function projectIdFromPath(): string | undefined {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function App() {
  const [route, setRoute] = useState<RouteState>(routeFromPath);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (id?: string) => {
    const path = id ? `/projects/${encodeURIComponent(id)}` : "/";
    window.history.pushState({}, "", path);
    setRoute(id ? { page: "project", projectId: id } : { page: "hub" });
  };

  if (route.page === "todo-motion-lab") return <TodoMotionLab />;
  return route.page === "project" ? <ConsoleScreen projectId={route.projectId} onBack={() => navigate()} /> : <ProjectHub onOpen={(id) => navigate(id)} />;
}
