# Phase M8 — Right Panel Tabs

## Goal

Build the five right-panel tabs from spec §14.5: Files, Preview, Terminal, Tests, Report. Each is wired to real backend data.

## Prerequisites

- M1 done (events/SSE). M5 done (files, shell, logs). M7 done (tests + preview URL). M6 helps (diffs).

## Concepts You Need

- The right panel has EXACTLY five tabs (spec §14.5). No more.
- Files tab is read-only: it shows files and diffs. No editing in the viewer (spec §2.3). Code is changed by agents or the terminal, never by typing in the Files tab.
- The Terminal is a free terminal, but it is NOT a bypass (spec §14.5, L3): its output is logged (M5 pipeline) and its commands go through risk grading (M5). High-risk commands typed here still need a gate.
- Follow the Figma baseline `OneCompany Console / Stream Mode` for the right-side density and hierarchy: compact tab row, browser-like Preview surface, file/artifact-oriented Files tab, governed Terminal, normalized Tests, and Report sections. Do not add a sixth tab or extra side panel.

## Spec References

`spec_0.2.md` §14.5, §2.3, §16, §17.

## Tasks

### Task 8.1 — Tab shell

In `apps/web`, build a right-panel container with five tabs: Files, Preview, Terminal, Tests, Report. Keep it simple and not crowded (spec §14.5), using the warm compact console style from spec §14.8. Selecting a tab shows its content.

Verify: all five tabs render and switch.

### Task 8.2 — Files tab

- Show a file tree for the project `repo/` and `artifacts/` (via a `GET /projects/:id/files` endpoint backed by M5 `listFiles`).
- Clicking a file shows its content (read-only).
- If the file has a diff (from `diffs` / `diff.created`), show the diff view.
- Make source files and artifacts both discoverable; generated PRD/acceptance/report artifacts should not be hidden behind terminal output.

Verify: the tree lists real files; clicking shows content; a changed file shows its diff. Editing is not possible.

### Task 8.3 — Preview tab

- Embed the local preview URL from `DevState.previewUrl` (M7); when a deployment URL exists (M10), allow showing that instead.
- If no preview is running, show a clear "no preview yet" state (not an error).
- Use a browser-like frame with the active URL, matching the Figma baseline. The preview surface should be visually prominent and not wrapped in a nested card inside another card.

Verify: when a preview is running, the tab shows the live app.

### Task 8.4 — Terminal tab

- A terminal UI that sends commands to the M5 `runCommand` executor for the project.
- Show output streamed back (via the `tool_call.*` events or a dedicated stream).
- High-risk commands trigger the same gate as agent commands.
- The Terminal tab is free-form for MVP, but every command and output must still flow through the same logging, redaction, and risk-grading path as agent tool calls.

Verify: running `ls` works and is logged; running a high-risk command triggers a gate before executing.

### Task 8.5 — Tests tab

- Show results from `test_results` / `test.result`: unit, integration, typecheck, build, Playwright E2E, acceptance — with pass/fail counts and links to artifacts (logs, screenshots, traces).
- Preserve the distinction between per-slice scoped checks and final acceptance-suite results.

Verify: after M7 runs, the tab shows the suites and statuses.

### Task 8.6 — Report tab

- Show the PRD, acceptance cases, run instructions, delivery report, risks, deployment/preview URL, and final acceptance summary (spec §17). The full delivery report is generated in M10; here, render whatever exists and leave clearly-marked empty sections out (do not show fake data).

Verify: the tab shows the current PRD and any existing report sections.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: open each tab; Files lists real files + diffs; Preview shows the app; Terminal runs ls and gates a high-risk cmd; Tests shows results; Report shows PRD
```

## Definition of Done

- [ ] Exactly five tabs: Files, Preview, Terminal, Tests, Report.
- [ ] Tab shell follows the Figma baseline density and Claude-inspired warm console tokens.
- [ ] Files tab is read-only and shows tree + content + diffs.
- [ ] Preview tab embeds the local (or deployment) URL.
- [ ] Terminal runs through M5 risk grading + logging; high-risk commands are gated.
- [ ] Tests tab shows normalized results with artifact links.
- [ ] Report tab shows PRD, acceptance cases, and existing report sections.

## Do Not

- Do not add a sixth tab.
- Do not allow editing files in the Files tab.
- Do not let the Terminal bypass risk grading or logging.
- Do not render fake/placeholder data in the Report tab.

## Output

- The full right panel, ready to pair with the left panel renderers (M9) inside the main layout.
