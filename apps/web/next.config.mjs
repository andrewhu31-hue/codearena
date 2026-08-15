import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@codearena/shared"],
  output: "standalone",
  // Monorepo: trace file dependencies from the workspace root, not just apps/web.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
