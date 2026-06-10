import { createPlaywrightNativeAdapter } from "./native/playwright.js";
import { createVercelNativeAdapter } from "./native/vercel.js";
import { registerRealAdapter } from "./resolver.js";

export function registerNativeAdapters(): void {
  registerRealAdapter("playwright", createPlaywrightNativeAdapter());
  registerRealAdapter("vercel", createVercelNativeAdapter());
}

registerNativeAdapters();
