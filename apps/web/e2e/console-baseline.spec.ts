import { test, expect } from "@playwright/test";

const projectId = process.env.PLAYWRIGHT_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001";

test.describe("console baseline — M11", () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with API + web dev servers running");

  test("renders UI v2 stream, swimlane, workspace, settings, and hub by default", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("ui-v2-shell")).toBeVisible();
    await expect(page.getByTestId("ui-v2-stream")).toBeVisible();
    await expect(page.getByTestId("ui-v2-workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: "stream" })).toBeVisible();
    await expect(page.getByRole("button", { name: "swimlane" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Terminal" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tests" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Report" })).toBeVisible();

    await page.getByTestId("ui-v2-settings").click();
    await expect(page.getByTestId("settings-modal")).toBeVisible();
    await page.getByRole("button", { name: "Close Settings" }).click();

    await page.getByTestId("ui-v2-project-hub").click();
    await expect(page.getByTestId("project-hub")).toBeVisible();
  });

  test("keeps UI v2 responsive on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("ui-v2-shell")).toBeVisible();
    await expect(page.getByTestId("ui-v2-stream")).toBeVisible();
  });

  test("keeps the legacy console behind an explicit query flag", async ({ page }) => {
    await page.goto(`/projects/${projectId}?ui=legacy`);
    await expect(page.getByTestId("console-layout")).toBeVisible();
  });
});
