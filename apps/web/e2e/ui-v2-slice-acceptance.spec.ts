import { test, expect, type Page } from "@playwright/test";

const STATUS_SCENARIOS = [
  "status-draft-requirement",
  "status-asking-questions",
  "status-prd-ready",
  "status-tech-plan-review",
  "status-developing",
  "status-change-review",
  "status-testing",
  "status-deploying",
  "status-awaiting-acceptance",
  "status-delivered",
  "status-failed",
  "status-paused",
] as const;

const GATE_SCENARIOS = [
  "gate-requirement_confirm",
  "gate-tech_plan_confirm",
  "gate-requirement_stuck",
  "gate-slice_failure",
  "gate-change_review",
  "gate-deployment",
  "gate-dangerous_operation",
  "gate-final_acceptance",
] as const;

async function openScenario(page: Page, scenarioId: string) {
  await page.goto(`/dev/ui-v2?scenario=${scenarioId}`);
  await expect(page.getByTestId("ui-v2-shell")).toBeVisible({ timeout: 15_000 });
}

async function assertCoreShell(page: Page) {
  await expect(page.getByTestId("orchestration-strip")).toBeVisible();
  await expect(page.getByTestId("ui-v2-stream")).toBeVisible();
  await expect(page.getByTestId("ui-v2-workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: "stream" })).toBeVisible();
  await expect(page.getByRole("button", { name: "swimlane" })).toBeVisible();
  for (const tab of ["Files", "Preview", "Terminal", "Tests", "Report"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }
}

test.describe("UI v2 slice acceptance — fixture scenarios", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (message) => {
      if (message.type() === "error") {
        throw new Error(`Browser console error: ${message.text()}`);
      }
    });
  });

  test("Phase 5 shell: default fixture renders orchestration + workspace", async ({ page }) => {
    await page.goto("/dev/ui-v2");
    await assertCoreShell(page);
  });

  for (const scenarioId of STATUS_SCENARIOS) {
    test(`Phase 0.5 / 6 status scenario: ${scenarioId}`, async ({ page }) => {
      await openScenario(page, scenarioId);
      await assertCoreShell(page);
      await expect(page.getByTestId("ui-v2-current-work")).toBeVisible();
      await expect(page.getByTestId("ui-v2-run-history")).toBeVisible();
      await expect(page.getByTestId("ui-v2-event-history")).toBeVisible();

      if (scenarioId === "status-paused") {
        await expect(page.getByTestId("ui-v2-paused-banner")).toBeVisible();
      } else {
        await expect(page.getByTestId("ui-v2-paused-banner")).toHaveCount(0);
      }

      if (scenarioId === "status-delivered" || scenarioId === "status-failed") {
        await expect(page.locator('footer input[type="text"]')).toHaveCount(0);
      }
    });
  }

  for (const scenarioId of GATE_SCENARIOS) {
    test(`Phase 0.5 gate scenario: ${scenarioId}`, async ({ page }) => {
      await openScenario(page, scenarioId);
      await expect(page.getByTestId("ui-v2-gate")).toBeVisible();
    });
  }

  test("Phase 0.5 edge: multiple open gates", async ({ page }) => {
    await openScenario(page, "edge-multiple-open-gates");
    await expect(page.getByTestId("ui-v2-gate")).toBeVisible();
  });

  test("Phase 6 stream structure: current work, history, event batching", async ({ page }) => {
    await openScenario(page, "status-developing");
    await expect(page.getByTestId("ui-v2-current-work")).toBeVisible();
    await expect(page.getByTestId("ui-v2-run-history")).toBeVisible();
    const loadEarlier = page.getByTestId("ui-v2-load-earlier-events");
    if (await loadEarlier.isVisible()) {
      await loadEarlier.click();
    }
  });

  test("Phase 7 swimlane: groups, markers, run detail", async ({ page }) => {
    await openScenario(page, "status-developing");
    await page.getByRole("button", { name: "swimlane" }).click();
    await expect(page.getByTestId("ui-v2-swimlane")).toBeVisible();
    await expect(page.getByTestId("ui-v2-swimlane-markers")).toBeVisible();
    await expect(page.getByTestId("ui-v2-swimlane-group-requirement")).toBeVisible();
    await expect(page.getByTestId("ui-v2-swimlane-group-development")).toBeVisible();
    await expect(page.getByTestId("ui-v2-run-detail")).toBeVisible();
  });

  test("Phase 7 swimlane preserves selection after mode switch", async ({ page }) => {
    await openScenario(page, "status-developing");
    await page.getByRole("button", { name: "swimlane" }).click();
    await expect(page.getByTestId("ui-v2-run-detail")).toBeVisible();
    await page.getByRole("button", { name: "stream" }).click();
    await page.getByRole("button", { name: "swimlane" }).click();
    await expect(page.getByTestId("ui-v2-run-detail")).toBeVisible();
  });

  test("Phase 8 workspace tabs switch on fixture", async ({ page }) => {
    await page.goto("/dev/ui-v2");
    for (const tab of ["Files", "Preview", "Terminal", "Tests", "Report"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByTestId("ui-v2-workspace")).toBeVisible();
    }
  });

  test("Phase 6 mobile: no horizontal overflow on paused scenario", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScenario(page, "status-paused");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

test.describe("UI v2 slice acceptance — live project", () => {
  const projectId = process.env.PLAYWRIGHT_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001";

  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with API + web running");

  test("Phase 5/6/8/9 live: default v2 console + hub + settings", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await assertCoreShell(page);
    await page.getByTestId("ui-v2-settings").click();
    await expect(page.getByTestId("settings-modal")).toBeVisible();
    await page.getByRole("button", { name: "Close Settings" }).click();
    await page.getByTestId("ui-v2-project-hub").click();
    await expect(page.getByTestId("project-hub")).toBeVisible();
  });

  test("Rollout: legacy console via ?ui=legacy", async ({ page }) => {
    await page.goto(`/projects/${projectId}?ui=legacy`);
    await expect(page.getByTestId("console-layout")).toBeVisible();
    await expect(page.getByTestId("ui-v2-shell")).toHaveCount(0);
  });

  test("Phase 8 live: workspace tabs render", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    for (const tab of ["Files", "Preview", "Terminal", "Tests", "Report"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByTestId("ui-v2-workspace")).toBeVisible();
    }
  });
});
