// Next.js config for the OneCompany web console.
// The browser client talks only same-origin (/api/*); requests are rewritten
// to the OneCompany API on :3001 so we never hit CORS. SSE is also proxied
// because EventSource/fetch reader honour the same-origin rule.
const apiBase = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
