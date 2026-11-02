import path from "node:path";
import type { NextConfig } from "next";

// The report contract and mock fixture live in ../shared, outside the app
// directory, so the monorepo root is the module root for Turbopack and tracing.
const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // Next blocks dev-only assets for any hostname but localhost. To open the dev server on your other devices (the
  // LAN, or a Tailscale address), list their hostnames, comma-separated, as DEV_ORIGINS in .env.local.
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  // The dev badge would sit on the dashboard sidebar's Sign out button in the bottom-left corner.
  devIndicators: { position: "bottom-right" },
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
