import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { artifacts, emit, type Db, type EventEnvelope } from "@oc/shared";

export type DeliveryDockerArtifactDeps = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
};

export type DeliveryDockerArtifactInput = {
  projectId: string;
  repoPath: string;
};

const DOCKERFILE = `FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "dev"]
`;

const COMPOSE = `services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
`;

const RUN_MD = `# Run Instructions

## Local

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Docker

\`\`\`bash
docker compose up --build
\`\`\`

If the generated app references third-party API keys, provide them through a local
\`.env\` file. Missing keys should use mock data until real credentials are supplied.
`;

export function ensureDeliveryDockerArtifacts(
  deps: DeliveryDockerArtifactDeps,
  input: DeliveryDockerArtifactInput,
): string[] {
  fs.mkdirSync(input.repoPath, { recursive: true });
  const files = [
    { relativePath: "Dockerfile", content: DOCKERFILE },
    { relativePath: "docker-compose.yml", content: COMPOSE },
    { relativePath: "RUN.md", content: RUN_MD },
  ];

  for (const file of files) {
    const fullPath = path.join(input.repoPath, file.relativePath);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, file.content, "utf8");
    }
    recordArtifact(deps, input.projectId, file.relativePath);
  }

  return files.map((file) => file.relativePath);
}

function recordArtifact(
  deps: DeliveryDockerArtifactDeps,
  projectId: string,
  relativePath: string,
): void {
  const artifactId = randomUUID();
  const now = new Date().toISOString();
  deps.db
    .insert(artifacts)
    .values({
      id: randomUUID(),
      project_id: projectId,
      artifact_id: artifactId,
      path: relativePath,
      kind: "delivery-artifact",
      created_at: now,
    })
    .run();

  const envelope = emit(deps.db, {
    projectId,
    payload: {
      type: "artifact.created",
      projectId,
      artifactId,
      path: relativePath,
    },
  });
  deps.onEvent?.(envelope);
}
