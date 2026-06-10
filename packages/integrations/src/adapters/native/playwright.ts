import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import type { ConnectorAdapter } from "../../connectors/types.js";

type PlaywrightToolArgs = {
  previewUrl?: string;
  url?: string;
  label?: string;
};

function parseArgs(args: unknown): PlaywrightToolArgs {
  if (!args || typeof args !== "object") {
    return {};
  }
  return args as PlaywrightToolArgs;
}

function resolveTargetUrl(args: PlaywrightToolArgs): string {
  const url = args.previewUrl ?? args.url;
  if (!url?.trim()) {
    throw new Error("playwright tool requires previewUrl or url in args");
  }
  return url;
}

async function withPage<T>(url: string, run: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await run(page);
  } finally {
    await browser.close();
  }
}

function persistScreenshot(
  artifactsPath: string | undefined,
  label: string,
  buffer: Buffer,
): string | undefined {
  if (!artifactsPath) {
    return undefined;
  }
  const dir = path.join(artifactsPath, "integrations");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `playwright-${label}-${Date.now()}.png`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `artifacts/integrations/${filename}`;
}

export function createPlaywrightNativeAdapter(): ConnectorAdapter {
  return {
    integrationId: "playwright",
    async callTool(toolName, context) {
      const args = parseArgs(context.args);

      switch (toolName) {
        case "screenshot": {
          const url = resolveTargetUrl(args);
          return withPage(url, async (page) => {
            const buffer = await page.screenshot({ fullPage: false });
            const savedPath = persistScreenshot(
              context.artifactsPath,
              args.label ?? "screenshot",
              buffer,
            );
            return {
              path: savedPath ?? "artifacts/playwright-screenshot.png",
              previewUrl: url,
              untrusted: false,
            };
          });
        }
        case "console_errors": {
          const url = resolveTargetUrl(args);
          return withPage(url, async (page) => {
            const errors: string[] = [];
            page.on("console", (message) => {
              if (message.type() === "error") {
                errors.push(message.text());
              }
            });
            await page.reload({ waitUntil: "domcontentloaded" });
            return {
              count: errors.length,
              errors: errors.slice(0, 20),
              previewUrl: url,
              untrusted: false,
            };
          });
        }
        case "navigate": {
          const url = resolveTargetUrl(args);
          return withPage(url, async (page) => ({
            url: page.url(),
            untrusted: false,
          }));
        }
        default:
          throw new Error(`Playwright native adapter has no handler for ${toolName}`);
      }
    },
  };
}
