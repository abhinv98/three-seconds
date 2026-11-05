import { db, get, run } from "@/lib/db";

// A slow read kept in its own row (the brand kit, a Reel's finer details): claimed before it starts, so two clicks
// don't start two reads, and finished or failed when it ends. A read that started longer ago than a function
// can run died with its server, so it counts as failed and may start again.

export const STALE_MS = 7 * 60_000;

export interface Job<T> {
  status: "reading" | "done" | "error";
  data: T | null;
  error: string | null;
  cost_usd: number | null;
  started_at: string;
}

export function jobStore<T>(table: "brand_kit" | "reel_details" | "reel_scene", key: "brand_id" | "reel_id", column: "kit" | "details" | "scene") {
  return {
    async get(id: string): Promise<Job<T> | null> {
      const row = await get<Omit<Job<T>, "data"> & { data: string | null }>(
        `SELECT status, ${column} AS data, error, cost_usd, started_at FROM ${table} WHERE ${key} = ?`,
        id,
      );
      if (!row) return null;
      const stale = row.status === "reading" && Date.now() - Date.parse(row.started_at) > STALE_MS;
      return {
        ...row,
        status: stale ? "error" : row.status,
        error: stale ? "The read stopped before it finished." : row.error,
        data: row.data ? (JSON.parse(row.data) as T) : null,
      };
    },

    /** True if this call may start the read; false while another one is running. A finished read's data stays. */
    async claim(id: string): Promise<boolean> {
      const now = Date.now();
      const result = await db.execute({
        sql: `INSERT INTO ${table} (${key}, status, started_at) VALUES (?, 'reading', ?)
              ON CONFLICT (${key}) DO UPDATE SET status = 'reading', error = NULL, started_at = excluded.started_at
              WHERE ${table}.status != 'reading' OR ${table}.started_at < ?`,
        args: [id, new Date(now).toISOString(), new Date(now - STALE_MS).toISOString()],
      });
      return result.rowsAffected > 0;
    },

    async finish(id: string, data: T, costUsd: number) {
      await run(
        `UPDATE ${table} SET status = 'done', ${column} = ?, error = NULL, cost_usd = ? WHERE ${key} = ?`,
        JSON.stringify(data),
        Math.round(costUsd * 10_000) / 10_000,
        id,
      );
    },

    async fail(id: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await run(`UPDATE ${table} SET status = 'error', error = ? WHERE ${key} = ?`, message.slice(0, 300) || "The read failed.", id);
    },
  };
}
