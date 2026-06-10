import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Long-running agent workflows are proxied via app/api/[...path]/route.ts (5m timeout).
};

export default nextConfig;
