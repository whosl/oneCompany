import { createPlaywrightNativeAdapter } from "./native/playwright.js";
import { registerRealAdapter } from "./resolver.js";

export function registerNativeAdapters(): void {
  registerRealAdapter("playwright", createPlaywrightNativeAdapter());
}

registerNativeAdapters();
