"use client";

import { ProjectHub } from "./project-hub";

export function ProjectHubPage() {
  return (
    <ProjectHub
      mode="page"
      open
      currentProjectId=""
      onClose={() => {}}
      projectQuery="ui=v2"
    />
  );
}
