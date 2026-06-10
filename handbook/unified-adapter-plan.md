# Unified Integration Adapter Plan

Status: **In progress** (PR-A+/B+/C1/D/E-F done, PR-G next)

## Goal

One governed integration pipeline (`callIntegrationTool`) serves all callers:

- OneCompany LangChain agents
- Workflow deterministic steps (Testing / QA / Delivery)
- Integrations UI manual calls
- Opencode (via `oc-gateway-mcp`, later PR-D)

Opencode and in-house agents must **not** attach arbitrary MCP servers directly.

## Architecture

```text
Consumers                    Bridges (thin)              Core (@oc/integrations)
─────────                    ──────────────              ────────────────────────
Opencode          ──►  oc-gateway-mcp (PR-D)
LangChain agents  ──►  integration-tools (PR-C)
Workflow          ──►  workflow hooks (PR-B)
Integrations UI   ──►  API routes
                              │
                              ▼
                    callIntegrationTool(deps, input)
                              │
                    AdapterResolver (mock | real)
                         ├── MockAdapter
                         ├── NativeAdapter (PR-B+)
                         └── McpTransportAdapter (PR-D)
                              │
                    tool_call.* events → v2 Stream
                    integration_tool_calls audit row
```

## Hard rules

- No unregistered / non-allowlisted integration tools
- No raw secrets in definitions, logs, or frontend
- MCP output is **untrusted data** only
- Offline mode must not claim remote success
- High-risk tools require human gates
- Opencode must not bypass the gateway (no direct `playwright-mcp` in opencode config)

## PR slices

| PR | Scope | Status |
|----|-------|--------|
| **PR-A+** | Resolver, deps factory, skill-pack root, gateway meta API, caller/suppressEvents, secret→offline, async gate types | Done |
| **PR-B+** | Native Playwright, testing deps (`artifactsPath`, gates), dual screenshot hooks | Done |
| **PR-C1** | Workflow injects integration results into QA `testingContext`; auto-enable with id normalization | Done |
| **PR-C2** | QA langchain executor + dynamic integration tools | Optional |
| **PR-D** | MCP transport + `oc-gateway-mcp` + opencode config + permission bridge | Done |
| **PR-E/F** | Figma, GitHub, Supabase, Vercel real adapters | Done |
| **PR-G** | Stream gate metadata, Settings summary, E2E | Planned |

## PR-E/F (completed)

### Deliverables

1. **`adapters/mcp/tool-mapping.ts`** — maps allowlist tool names to upstream MCP tool names (figma/github/supabase)
2. **`adapters/mcp/transport.ts`** — applies mapping before `client.callTool`
3. **`adapters/native/vercel.ts`** — Vercel REST adapter (`list_projects`, `create_preview_deploy`, `read_logs`)
4. **`register-native.ts`** — registers Vercel alongside Playwright

### Tool mapping (allowlist → MCP)

| Integration | Allowlist | MCP server tool |
|-------------|-----------|-----------------|
| figma | `get_design_context` | `get_figma_data` |
| figma | `export_screenshot` | `download_figma_images` |
| github | `list_repos` | `search_repositories` |
| github | `open_pr` | `create_pull_request` |
| github | `read_issues` | `list_issues` |
| supabase | `seed_sql` | `execute_sql` |

## PR-D (completed)

### Deliverables

1. **`adapters/mcp/transport.ts`** — stdio MCP client transport for registered connectors
2. **`adapters/register-mcp.ts`** — registers MCP adapters from `config/oc-gateway-mcp.json`
3. **`packages/oc-gateway-mcp`** — stdio MCP server exposing `oc_{integrationId}__{toolName}` → API
4. **`POST .../integrations/opencode/call`** — `caller: opencode`, parses prefixed tool names
5. **Opencode server config** — attaches only `oc-gateway-mcp` (not raw playwright-mcp)
6. **Permission bridge** — auto-approves `oc_*` MCP permission prompts (gateway enforces allowlist/gates)

### Environment

```bash
OC_GATEWAY_MCP_ENTRY=/opt/onecompany/packages/oc-gateway-mcp/dist/index.js
OC_API_URL=http://127.0.0.1:3001
OC_INTEGRATION_GATEWAY_MCP=0   # disable oc-gateway in opencode config
```

## PR-C1 (completed)

### Deliverables

1. **`integration-id-normalize.ts`** — alias map + substring match for P1 connector ids
2. **`auto-enable-from-requirement.ts`** — project enablement + `agent.observe` warnings for unknown ids
3. **Requirement analyst hook** — normalizes `integrations[]` after analyst (graph + legacy engine)
4. **Testing engine** — re-applies requirement integrations at test start; passes enabled ids to preview checks
5. **`TestingSessionMeta.integrationNotes`** — persisted notes flow into QA `testingContext`

## PR-B+ (completed)

### Deliverables

1. **`adapters/native/playwright.ts`** — `screenshot`, `console_errors`, `navigate` via `playwright-core`
2. **`register-native.ts`** — registers real Playwright adapter on package load
3. **`workflow/integrations/hooks.ts`** — `runPreviewIntegrationChecks` (auto-enable + dual tools)
4. **Testing engine** — baseline after `startPreview`, diagnostic on suite failure
5. **Testing API service** — wires `artifactsPath`, gates, `caller: workflow`
6. **QA scripted runner** — reads `integrationNotes` from testing context
7. **`TestingSessionMeta.integrationArtifacts`** — persisted in session

### Environment

```bash
OC_INTEGRATION_ADAPTER_MODE=real   # use native Playwright (requires chromium)
OC_TESTING_INTEGRATION_CHECKS=0    # disable workflow integration hooks
```

## PR-A+ (completed)

### Deliverables

1. **`AdapterResolver`** — `OC_INTEGRATION_ADAPTER_MODE=mock|real` (default `mock`)
2. **Mock adapters** moved under `packages/integrations/src/adapters/`
3. **`CallIntegrationToolDeps.caller`** — `ui | workflow | agent | opencode`; `opencode` suppresses duplicate `tool_call.*` events
4. **Secret readiness** — in `real` mode, missing `secretRefs` → offline fallback when pack exists
5. **Async gate protocol types** — `pending` result + `gateId` for MCP/HTTP callers (PR-D)
6. **`createCallIntegrationToolDeps`** — shared API factory
7. **Skill pack root** — walk monorepo ancestors; API passes explicit repo root
8. **`GET /integrations`** — returns `gateway.adapterMode` for honest UI badges

### Environment

```bash
OC_INTEGRATION_ADAPTER_MODE=mock   # default; CI uses mock
OC_INTEGRATION_ADAPTER_MODE=real   # requires native/MCP adapter (PR-B+)
OC_SKILL_PACKS_ROOT=               # optional override
OC_INTEGRATION_GATE_MODE=sync      # sync | async (async: return pending gate, PR-D)
```

## Review fixes incorporated

| Issue | Fix |
|-------|-----|
| QA agent is scripted, cannot call tools | PR-C split: C1 workflow injects results; C2 langchain QA optional |
| Gate blocks MCP/HTTP forever | Async gate protocol in PR-A+; full flow in PR-D |
| Duplicate tool_call events from Opencode | `caller: "opencode"` suppresses event emit |
| Requirement `integrations[]` free text | PR-C1 normalization map + warning event |
| `playwright` not in deps | PR-B adds `playwright-core` |
| Testing deps missing `artifactsPath` / gates | PR-B extends `TestingWorkflowDeps` |
| Mock badge always shown | PR-A+ `gateway.adapterMode` from API |

## Tool naming

External (Stream / Gate / UI):

```text
{integrationId}:{toolName}
```

Opencode MCP surface (PR-D):

```text
oc_{integrationId}__{toolName}
```

## Testing

| Layer | PR-A+ |
|-------|-------|
| Unit | `resolver.test.ts`, `call-tool` caller + secret fallback |
| API | `integrations.test.ts` gateway meta |
| Web | `page.test.tsx` mock badge only when `adapterMode=mock` |

## Definition of done (full plan)

- [x] PR-A+ merged
- [x] PR-B+: Testing auto-screenshot visible in Stream
- [x] PR-C1: QA notes cite integration artifacts
- [x] PR-D: Opencode can call allowlisted tools via oc-gateway-mcp
- [x] All five P1 connectors have real or MCP adapter behind resolver
