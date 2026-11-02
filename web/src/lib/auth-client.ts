import { createAuthClient } from "better-auth/react";

/** Talks to /api/auth on whatever host the page was opened from (localhost, LAN or Tailscale). */
export const authClient = createAuthClient();
