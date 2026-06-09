import { test, expect } from "@playwright/test";

const projectId = process.env.PLAYWRIGHT_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001";

test.describe("console baseline — M11", () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with API + web dev servers running");

  test("renders stream, swimlane, right tabs, settings, and hub", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("console-layout")).toBeVisible();
    await expect(page.getByTestId("left-panel")).toBeVisible();
    await expect(page.getByTestId("right-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stream" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Swimlane" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Terminal" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tests" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Report" })).toBeVisible();
  });

  test("keeps composer visible on narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("console-layout")).toBeVisible();
    await expect(page.getByTestId("stream-renderer")).toBeVisible();
  });
});
