import path from "node:path";
import type { NextConfig } from "next";

// The report contract and mock fixture live in ../shared, outside the app
// directory, so the monorepo root is the module root for Turbopack and tracing.
const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
