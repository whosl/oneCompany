export type WorkspaceMeta = {
  version: 1;
  projectId: string;
  slug: string;
  createdAt: string;
  paths: {
    root: string;
    repo: string;
    artifacts: string;
    logs: string;
  };
};

export type WorkspacePaths = {
  root: string;
  repo: string;
  artifacts: string;
  logs: string;
  meta: WorkspaceMeta;
};

export class PathEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathEscapeError";
  }
}
