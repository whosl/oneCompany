import { test, expect } from "@playwright/test";

const projectId = process.env.PLAYWRIGHT_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001";

test.describe("integrations baseline — M12", () => {
  test.skip(!process.env.PLAYWRIGHT_E2E, "Set PLAYWRIGHT_E2E=1 with API + web dev servers running");

  test("lists P1 connectors without leaking secrets", async ({ page }) => {
    await page.goto(`/integrations?projectId=${projectId}`);
    await expect(page.getByTestId("integrations-page")).toBeVisible();
    await expect(page.getByTestId("integration-card-github")).toBeVisible();
    await expect(page.getByTestId("integration-card-figma")).toBeVisible();
    await expect(page.getByTestId("skill-pack-github-offline")).toBeVisible();
    await expect(page.getByText(/sk-[a-zA-Z0-9]/)).toHaveCount(0);
    await expect(page.getByText(/ghp_/)).toHaveCount(0);
  });

  test("shows honest adapter mode badge on connector cards", async ({ page }) => {
    await page.goto(`/integrations?projectId=${projectId}`);
    await expect(page.getByTestId("integrations-page")).toBeVisible();
    await expect(page.getByText("Simulated adapter")).toBeVisible();
  });
});
