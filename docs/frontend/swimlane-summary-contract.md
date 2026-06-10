# Swimlane Summary Contract

## Goal

Swimlane cells are a scanning surface, not a transcript. They show a short operational summary while selected-run detail and Event History retain the complete auditable text.

## Display Contract

Each Plan / Act / Observe / Reflect item should eventually expose:

```ts
type AgentStepSummary = {
  summary: string;
  displaySummary?: string;
  summarySource?: "agent" | "small_model" | "deterministic";
  summaryVersion?: string;
};
```

Rules:

- `summary` remains immutable audit content.
- `displaySummary` describes the action or result, not hidden reasoning.
- Target length: about 18-36 CJK characters or 4-10 English words.
- Preserve authoritative identifiers when useful: slice, suite, file, gate or command name.
- Never model-summarize gate decisions, test status, risk level or command exit status into a different meaning.
- Full text remains available from selected-run detail and event sequence references.

## Generation Priority

### 1. Originating Agent

Preferred. The Agent already has the relevant context and should return `displaySummary` beside its normal structured output. This avoids a second model call and usually produces the most accurate summary.

Prompt requirement:

```text
Return a short operational display summary. State what changed, what was observed,
or what is blocking progress. Do not include chain-of-thought or speculative detail.
```

### 2. Deterministic Fallback

The frontend currently normalizes whitespace, prefers a complete first sentence, and applies a bounded word-aware cut. This path is synchronous, free, deterministic and always available.

Implementation: `apps/web/src/components/ui-v2/display-summary.ts`.

### 3. Small-Model Backfill

Use only for legacy or verbose records that have no acceptable `displaySummary`.

- Run asynchronously after the event is persisted.
- Never block SSE delivery, projection building or initial rendering.
- Persist the result; do not regenerate it on every page load.
- Cache key: `eventId + sourceHash + promptVersion + locale`.
- Store model/provider metadata for cost and quality audits.
- On timeout or failure, retain the deterministic fallback.

The model must be selected through the existing model configuration layer. UI code must not hardcode a provider or model name.

## Recommended Backend Evolution

1. Add optional summary metadata to user-visible Agent step events or their durable run projection.
2. Update Agent structured-output schemas to request `displaySummary`.
3. Add an asynchronous low-cost summarization worker for missing summaries.
4. Backfill only records viewed frequently or included in reports.
5. Measure summary acceptance, regeneration rate, latency and cost before enabling broad backfill.

## Current UI Behavior

- Cells show a maximum two-line deterministic short summary.
- The full step summary is preserved as the cell title and selected-run detail.
- Selected-run detail shows the source event sequence range.
- Tool, diff, test and report markers deep-link to the existing five-tab workspace.
