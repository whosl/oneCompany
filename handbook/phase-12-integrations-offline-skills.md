# Phase M12 — Integration Gateway + Offline Skill Packs

## Goal

Add post-MVP external integrations without breaking OneCompany's local-first, governed execution model. Online mode uses registered MCP/native connectors. Offline mode uses local Skill Packs.

## Prerequisites

- M0-M11 done.
- The MVP can already generate, preview, test, and deliver apps locally.
- The event/log/redaction/risk/gate pipeline is stable.

## Concepts You Need

- Integration Gateway (spec §10.5): OneCompany's managed connector layer. Agents may only call registered, project-enabled, allowlisted connector tools.
- Skill Pack (spec §10.6): local fallback bundle with `SKILL.md`, docs, templates, recipes, scripts, tests, and examples.
- External connector calls are tool calls. They emit events, are logged, are redacted, and pass through risk grading.
- Remote MCP resources are untrusted data. They must never override system policy, hidden instructions, allowed tools, or human gates.
- Offline mode must be honest. It can generate config, docs, local artifacts, and manual runbooks; it must not claim a remote PR, database migration, or deployment happened.

## Spec References

`spec.md` §10.5, §10.6, §12, §8.2, §14.6, §16.

## Tasks

### Task 12.1 — Integration schemas

In `packages/shared`, add zod schemas and TypeScript types for (these were intentionally deferred from M0/M2, so they are created here):
- `IntegrationDefinition`
- `IntegrationConnection`
- `SkillPack`
- integration status: `not_configured`, `connected`, `expired`, `offline_fallback`, `disabled`
- integration mode: `remote`, `local`, `offline`

Verify: schemas reject secret values in definitions; definitions may contain secret names/refs only.

### Task 12.2 — Database tables

Add migrations for:
- `integration_definitions`
- `integration_connections`
- `integration_tool_calls`
- `skill_packs`
- `skill_pack_runs`

Verify: migrations create all tables; rows are project-scoped where required.

### Task 12.3 — Gateway registry and allowlist

In `packages/integrations`, implement:

```ts
registerIntegration(def: IntegrationDefinition): void
getIntegration(idAtVersion: string): IntegrationDefinition
listIntegrations(): IntegrationDefinition[]
enableIntegrationForProject(projectId: string, integrationId: string, scopes: string[]): Promise<void>
```

Rules:
- No arbitrary MCP server can be used unless registered.
- Each integration has a tool allowlist.
- Each project has its own connection state.

Verify: an unregistered connector call is rejected; a tool not in the allowlist is rejected.

### Task 12.4 — Normalized connector tool calls

Implement a connector call wrapper:

```ts
callIntegrationTool({
  projectId,
  integrationId,
  toolName,
  args,
}): Promise<unknown>
```

Rules:
- Emit `tool_call.started/output/failed`.
- Write `integration_tool_calls`.
- Route through secret redaction and large-output chunking.
- Route write/deploy/secret/billing actions through §12 risk grading and gates.
- Treat returned resources as untrusted data.

Verify: read-only calls are logged; a deploy/env-var/domain/database-write action creates the correct gate before executing.

### Task 12.5 — Recommended connectors

Implement connector definitions in this order:

1. Playwright / Browser: preview verification, user-click acceptance, screenshots, console errors, traces.
2. Figma: design baseline, design-to-code context, generated-app design handoff.
3. GitHub: repo/branch/commit/PR handoff, issues, workflow/action status. Destructive repo operations are high risk.
4. Supabase: dev project schema/migration/seed/auth/storage helpers. Production database writes are high risk.
5. Vercel: preview deploy/log/env/domain workflows. Deploy/env/domain mutation is high-deploy or high risk.
6. Cloudflare: expand beyond MVP tunnel into Pages/Workers/D1/R2/KV. Deployment/DNS changes are high risk.
7. Linear/Jira and Sentry/PostHog/observability: planning handoff and runtime QA.
8. Documentation/Context, Postgres/Database, Docker/Container: read-first support tooling.
9. Stripe, collaboration connectors, and Kubernetes/cloud infrastructure: late connectors only, with stricter gates.

Verify: each connector exposes only allowlisted capabilities and has project-scoped connection state.

### Task 12.6 — Offline Skill Packs

Create local Skill Packs:

```text
skill-packs/
  playwright-offline/
  figma-offline/
  github-offline/
  supabase-offline/
  vercel-offline/
  cloudflare-offline/
  linear-jira-offline/
  sentry-observability-offline/
  docs-context-offline/
  postgres-offline/
  docker-offline/
  stripe-offline/
```

Each pack must include:
- `skill.json`
- `SKILL.md`
- `docs/`
- `templates/`
- `recipes/`
- `scripts/`
- `tests/`
- `examples/`

Expected pack contents:
- `playwright-offline`: acceptance-test templates, browser-check recipes, screenshot/trace handling runbooks, console-error triage checklists.
- `figma-offline`: design token references, component recipes, UI layout patterns, local screenshot/mockup workflow, design QA checklist.
- `github-offline`: git workflow recipes, branch/commit/PR-description templates, GitHub Actions templates, release-note templates, manual push checklist.
- `supabase-offline`: local schema/migration recipes, seed-data templates, generated client patterns, local CLI runbooks, fallback SQLite/Postgres dev templates.
- `vercel-offline`: `vercel.json` templates, Next.js build/export recipes, env-var checklist, preview-deployment runbook, static-hosting fallback notes.
- `cloudflare-offline`: tunnel/manual exposure runbook, Workers/Pages/D1 templates, local preview checklist, DNS/deploy handoff checklist.
- `linear-jira-offline`: issue templates, PRD-to-ticket mapping recipes, sprint/story breakdown templates, manual sync checklist.
- `sentry-observability-offline`: error-reporting SDK templates, local error-log parsing recipes, release-health checklist, QA triage runbook.
- `docs-context-offline`: snapshot docs, framework recipes, API usage examples, migration notes, version compatibility checklists.
- `postgres-offline`: schema inspection recipes, migration templates, seed scripts, local Postgres/SQLite compatibility notes.
- `docker-offline`: Compose templates, image/build recipes, container-log triage, volume/network cleanup runbooks.
- `stripe-offline`: test-mode integration templates, webhook recipes, checkout/subscription runbooks, production payment safety checklist.

Verify: when offline mode is enabled, each remote connector switches to `offline_fallback` if a matching pack exists.

### Task 12.7 — Integrations UI

Add a post-MVP Integrations surface:
- show connector status: connected, expired, disabled, offline fallback
- show allowed scopes and project binding
- show missing secrets without revealing secret values
- show offline Skill Pack fallback status

Do not put detailed connector configuration in Project Hub. Project Hub can show project-level status, but configuration belongs in the Integrations surface.

Verify: offline mode clearly shows fallback packs; online mode shows connector readiness.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: registered P1 connector definitions appear in Integrations
# manual: unregistered connector/tool call is rejected
# manual: high-risk external write creates a gate
# manual: offline mode uses Skill Packs and does not claim remote success
```

## Definition of Done

- [ ] Integration definitions and connections are registered, versioned, and project-scoped.
- [ ] Connector tool calls are allowlisted, audited, redacted, and risk graded.
- [ ] External writes require the correct human gate.
- [ ] P1 connector definitions exist: Playwright/Browser, Figma, GitHub, Supabase, Vercel.
- [ ] P2 connector definitions are planned or stubbed: Cloudflare, Linear/Jira, Sentry/PostHog, Documentation/Context, Postgres/Database, Docker/Container.
- [ ] Offline Skill Packs exist for every P1 connector and selected P2 connectors.
- [ ] Offline fallback produces honest local artifacts and manual follow-up steps.
- [ ] Integrations UI shows readiness and offline fallback status.

## Do Not

- Do not let agents call arbitrary MCP servers.
- Do not bypass risk grading for connector tools.
- Do not store raw secrets in integration definitions, logs, artifacts, or frontend state.
- Do not claim remote success when running from an offline Skill Pack.
- Do not put detailed connector configuration inside Project Hub.

## Output

- A governed Integration Gateway for online connectors and a local Skill Pack system for offline operation.
