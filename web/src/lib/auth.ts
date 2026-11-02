import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { createAppTables, dialect } from "@/lib/db";

// Sign-in is email and password for now (Google needs OAuth credentials from a Google Cloud project).
// Better Auth checks a request's Origin against trustedOrigins; DEV_ORIGINS adds the LAN and Tailscale
// addresses the dev server is opened from (see next.config.ts).
const devOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)
  .map((host) => `http://${host}:${process.env.PORT ?? 3000}`);

// On Vercel: the production domain, this branch's alias and this deployment's own URL (system environment variables).
const vercelHosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL].filter(
  (host): host is string => Boolean(host),
);

export const auth = betterAuth({
  database: { dialect, type: "sqlite", transaction: true },
  secret: process.env.BETTER_AUTH_SECRET,
  // Locally the origin comes from the request (localhost, LAN or Tailscale); deployed, only this project's hosts.
  baseURL: vercelHosts.length ? { allowedHosts: vercelHosts, protocol: "https" } : undefined,
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
  trustedOrigins: [`http://localhost:${process.env.PORT ?? 3000}`, ...devOrigins, ...vercelHosts.map((host) => `https://${host}`)],
  plugins: [nextCookies()],
});

const cache = globalThis as { __threeSecondsSchemaReady?: Promise<void> };

/**
 * Better Auth's tables, then ours (which point at its "user" table). Once per server process; a failure (two fresh
 * instances racing to create the tables) is retried on the next request instead of being kept.
 */
export function schemaReady(): Promise<void> {
  cache.__threeSecondsSchemaReady ??= (async () => {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    await createAppTables();
  })().catch((error) => {
    cache.__threeSecondsSchemaReady = undefined;
    throw error;
  });
  return cache.__threeSecondsSchemaReady;
}
