import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// When set (e.g. on Vercel), REST calls go to /api/v1/* on the site's own
// origin and are proxied to the API. That keeps the HttpOnly refresh-token
// cookie first-party (SameSite=Lax), which a cross-site API can't rely on.
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@codearena/shared"],
  // The standalone bundle is for the Docker image; Vercel packages the app itself.
  ...(process.env.VERCEL
    ? {}
    : {
        output: "standalone",
        // Monorepo: trace file dependencies from the workspace root, not just apps/web.
        outputFileTracingRoot: path.join(__dirname, "../../"),
      }),
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }];
  },
};

export default nextConfig;
