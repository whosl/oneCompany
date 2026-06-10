import { test, expect, type Page } from "@playwright/test";

async function openStableScenario(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("ui-v2-shell")).toBeVisible();
}

test.describe("UI v2 visual regression", () => {
  test.skip(!process.env.PLAYWRIGHT_VISUAL, "Set PLAYWRIGHT_VISUAL=1 with the web dev server running");

  test("default stream at desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await openStableScenario(page, "/dev/ui-v2");
    await expect(page).toHaveScreenshot("stream-desktop.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("paused state at laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStableScenario(page, "/dev/ui-v2?scenario=status-paused");
    await expect(page).toHaveScreenshot("paused-laptop.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("multiple gates at mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStableScenario(page, "/dev/ui-v2?scenario=edge-multiple-open-gates");
    await expect(page).toHaveScreenshot("multi-gate-mobile.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("long output workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openStableScenario(page, "/dev/ui-v2");
    await page.getByRole("tab", { name: "Terminal" }).click();
    await expect(page).toHaveScreenshot("terminal-long-output.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
