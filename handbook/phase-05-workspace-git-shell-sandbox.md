# Phase M5 — Workspace, Git, Shell, Sandbox

## Goal

Give agents a safe way to create project files, run git, and run shell commands — with risk grading, a Docker sandbox for dangerous commands, secret redaction, and safe log retention.

## Prerequisites

- M0 done (DB has `commits`, `artifacts`). M4 helps (the dangerous-operation gate); if M4 is not done yet, you may use the raw M1 gate primitive and wire the card later.

## Concepts You Need

- Each project lives under `generated-projects/{slug}/` with `repo/`, `artifacts/`, `logs/`, and `meta.json` (spec §10.2, §11).
- Risk grading (spec §12) — copy this table exactly:
  - Low: `ls`, `rg`, `cat`, `npm test`, `npm run build`, `git status` -> run locally, log.
  - Medium: file generation, non-destructive DB init, starting a local service -> run locally, log.
  - Medium (constrained): `npm ci --ignore-scripts` with committed lockfile + pinned registry, or explicitly allowlisted lifecycle scripts -> run locally with network limited to the registry, log.
  - High: delete files, write outside the project, unknown scripts, access secrets, arbitrary external downloads, unpinned/arbitrary `npm install`, installs that run unreviewed lifecycle scripts, destructive DB migration -> require human gate; run in Docker sandbox when containable.
  - High (deploy/network): deploy, start Cloudflare Tunnel -> require human gate; run on the REAL workspace/network, NOT the sandbox.
- Secret redaction (spec §8.2, R5): never write secrets to DB, artifacts, or the stream. Redact first.
- Large output: do not store huge blobs in SQLite. Write them to `logs/` or `artifacts/` files; store only metadata (path, byte length, hash, summary) in the DB.

## Spec References

`spec.md` §11, §12, §8.2.

## Tasks

### Task 5.1 — Workspace layout

Create `packages/workspace/src/workspace.ts`:
- `createWorkspace(projectId, slug)` -> makes `generated-projects/{slug}/{repo,artifacts,logs}` and writes `meta.json`.
- File helpers: `writeFile`, `readFile`, `listFiles` scoped INSIDE the project repo. Reject any path that escapes the project directory (that is a High-risk "write outside project").

Verify: creating a workspace makes the folders + `meta.json`; writing `../escape.txt` is rejected.

### Task 5.2 — Git service

Create `packages/workspace/src/git.ts`:
- `initRepo(projectPath)` -> `git init` in `repo/`.
- `commitSlice({ projectId, taskId, summary, tests })` -> stage all, commit, and write a row in `commits` linking `hash`, `taskId`, `summary` (spec §11).

Verify: init a repo, write a file, `commitSlice` -> a commit exists and a `commits` row links to its task.

### Task 5.3 — Risk classifier

Create `packages/workspace/src/risk.ts`:

```ts
type RiskLevel = "low" | "medium" | "medium_constrained" | "high" | "high_deploy";
function classifyCommand(cmd: string, ctx?: { lockfilePresent?: boolean }): RiskLevel;
```

- Implement the table above. Default unknown commands to `high` (safer).
- `npm install` -> `high` unless it is exactly `npm ci --ignore-scripts` with a lockfile present and registry pinned -> then `medium_constrained`.

Verify: unit tests for one command per level, plus `npm install` -> high and `npm ci --ignore-scripts` (with lockfile) -> medium_constrained.

### Task 5.4 — Shell executor with gating

Create `packages/workspace/src/shell.ts`:

```ts
async function runCommand(input: { projectId: string; cmd: string }): Promise<{ exitCode: number; outputRef: string }>;
```

Flow:
1. Classify the command (Task 5.3).
2. `low` / `medium` / `medium_constrained` -> run locally in the project repo.
3. `high` (containable) -> raise the dangerous-operation gate; if approved, run in the Docker sandbox (Task 5.6).
4. `high_deploy` -> raise the deployment gate (M4); if approved, run on the real machine/network, NOT the sandbox.
5. Capture output through the log pipeline (Task 5.5). Emit `tool_call.*` events for the command.

Verify: a low command runs and logs; a high command does not run until its gate is approved; `npm install` (unpinned) is treated as high.

### Task 5.5 — Log pipeline (redact + chunk)

Create `packages/workspace/src/log-pipeline.ts`:
- `redact(text)` -> remove secrets using: known env var names, a local secret registry, and token-like patterns. Replace with `***REDACTED***`.
- Persist command output: if small, store inline (already redacted); if large, write a file under `logs/` and store only metadata (path, byte length, hash, summary) in the DB.
- A redaction failure is a high-risk incident: record it (without the secret value) so it reaches the delivery report later.

Verify: feed text containing a fake token + an env-var value -> output is redacted everywhere; a very large output is stored as a file with DB metadata only.

### Task 5.6 — Docker sandbox

Create `packages/workspace/src/sandbox.ts`:
- `runInSandbox(projectPath, cmd)` -> run the command inside a Docker container mounting the project repo, with limited network.
- Detect at startup whether Docker is available (used by settings/env checks later). If Docker is missing, do not silently run high-risk commands locally — surface the limitation and require an explicit decision.

Verify: a containable high-risk command runs inside Docker; with Docker unavailable, the system reports the limitation instead of running it unprotected.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: create workspace, init git, write file, commit slice
# manual: run a low command (runs), a high command (gated), npm install (high), npm ci --ignore-scripts (constrained)
# manual: command output containing a token is redacted in DB + stream
```

## Definition of Done

- [ ] Projects get `generated-projects/{slug}/{repo,artifacts,logs}` + `meta.json`; path escapes are rejected.
- [ ] Git init + per-slice commit linked to task id in `commits`.
- [ ] Risk classifier matches the §12 table; unknown -> high; `npm install` -> high; `npm ci --ignore-scripts` (lockfile) -> medium_constrained.
- [ ] Low/medium run locally; containable high runs in Docker after a gate; deploy/tunnel run on the real machine after a gate (not sandboxed).
- [ ] All command output passes redaction; large output stored as artifact files with DB metadata only.
- [ ] Docker absence is surfaced, not silently bypassed.

## Do Not

- Do not run any high-risk command without a human gate.
- Do not run deploy/tunnel inside the sandbox.
- Do not write secrets to the DB, artifacts, or the event stream.
- Do not store huge command outputs as DB blobs.

## Output

- A safe execution layer (`runCommand`), git (`commitSlice`), redaction + chunked logs, and the sandbox — used heavily by M6, M7, and M10.
