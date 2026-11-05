import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client, type InStatement, type InValue, type Transaction } from "@libsql/client";
import {
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

// One SQLite database for accounts and everything they own: Better Auth's tables (user, session, account,
// verification) and ours below. Deployed, it's Turso (TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, set by the Vercel
// Marketplace integration); local dev keeps a file in web/.data (gitignored).

const cache = globalThis as { __threeSecondsLibsql?: Client };

/** Survives dev hot reloads, so there is one client per server process. */
export const db: Client = (cache.__threeSecondsLibsql ??= open());

function open() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  // A function's disk doesn't last between requests, so a deploy without Turso has nowhere to keep accounts.
  if (process.env.VERCEL) throw new Error("TURSO_DATABASE_URL is not set. Connect the Turso database to this project.");
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return createClient({ url: `file:${path.join(dir, "three-seconds.db")}` });
}

/** Rows as plain objects (libSQL's rows also carry their columns by index). */
export async function all<T>(sql: string, ...args: InValue[]): Promise<T[]> {
  const { rows } = await db.execute({ sql, args });
  return rows.map((row) => ({ ...row }) as T);
}

export async function get<T>(sql: string, ...args: InValue[]): Promise<T | null> {
  return (await all<T>(sql, ...args))[0] ?? null;
}

export async function run(sql: string, ...args: InValue[]) {
  await db.execute({ sql, args });
}

/** Several writes that land together or not at all. */
export async function writeAll(statements: InStatement[]) {
  await db.batch(statements, "write");
}

/** Better Auth reaches the same database through Kysely: this is its libSQL driver. */
export const dialect: Dialect = {
  createAdapter: () => new SqliteAdapter(),
  createIntrospector: (kysely) => new SqliteIntrospector(kysely),
  createQueryCompiler: () => new SqliteQueryCompiler(),
  createDriver: () => ({
    init: async () => {},
    acquireConnection: async () => new Connection(),
    beginTransaction: (connection) => (connection as Connection).begin(),
    commitTransaction: (connection) => (connection as Connection).end("commit"),
    rollbackTransaction: (connection) => (connection as Connection).end("rollback"),
    releaseConnection: async () => {},
    destroy: async () => {},
  }),
};

class Connection implements DatabaseConnection {
  #transaction: Transaction | null = null;

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const result = await (this.#transaction ?? db).execute({ sql: query.sql, args: query.parameters as InValue[] });
    return { rows: result.rows as R[], numAffectedRows: BigInt(result.rowsAffected), insertId: result.lastInsertRowid };
  }

  async begin() {
    this.#transaction = await db.transaction("write");
  }

  async end(how: "commit" | "rollback") {
    const transaction = this.#transaction;
    this.#transaction = null;
    await transaction?.[how]();
  }

  // Better Auth never streams; Kysely only needs the method to exist.
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming queries aren't supported.");
  }
}

/** Our tables. They point at Better Auth's "user" table, so they are created after its migrations run. */
export async function createAppTables() {
  if (!process.env.TURSO_DATABASE_URL) {
    // Per connection, and only meaningful for the local file: Turso serves each request on its own connection.
    await db.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS profile (
      user_id      TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('brand', 'creator')),
      display_name TEXT NOT NULL,
      handle       TEXT,
      niche        TEXT,
      created_at   TEXT NOT NULL
    );
    -- A brand's folder: everything its creators send, and the Reels it checks itself.
    CREATE TABLE IF NOT EXISTS brand (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      website     TEXT NOT NULL,
      category    TEXT,
      team_size   TEXT,
      invite_code TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL
    );
    -- A creator and a brand they make Reels for. brand_id stays null until the brand opens the creator's invite
    -- link (invite_token); a creator who joins through a brand's own link is connected at once.
    CREATE TABLE IF NOT EXISTS connection (
      id            TEXT PRIMARY KEY,
      creator_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      brand_id      TEXT REFERENCES brand(id) ON DELETE CASCADE,
      brand_name    TEXT NOT NULL,
      brand_website TEXT,
      invite_token  TEXT UNIQUE,
      created_at    TEXT NOT NULL,
      UNIQUE (creator_id, brand_id)
    );
    -- A checked Reel. brand_id is the folder it belongs to: the brand's own check, or where a creator sent it.
    -- video_url is the video in Vercel Blob.
    CREATE TABLE IF NOT EXISTS reel (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      brand_id   TEXT REFERENCES brand(id) ON DELETE SET NULL,
      filename   TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('checking', 'done', 'error')),
      verdict    TEXT,
      report     TEXT,
      error      TEXT,
      sent_at    TEXT,
      created_at TEXT NOT NULL,
      video_url  TEXT
    );
    -- The brand kit: logo, colours and type read from the brand's site and the web, with what people say about
    -- the brand (lib/brand-kit.ts). kit is JSON; it stays while a new read runs.
    CREATE TABLE IF NOT EXISTS brand_kit (
      brand_id   TEXT PRIMARY KEY REFERENCES brand(id) ON DELETE CASCADE,
      status     TEXT NOT NULL CHECK (status IN ('reading', 'done', 'error')),
      kit        TEXT,
      error      TEXT,
      cost_usd   REAL,
      started_at TEXT NOT NULL
    );
    -- A Reel's finer details for its brand (lib/finer.ts): what to change, where it shows and why. JSON.
    CREATE TABLE IF NOT EXISTS reel_details (
      reel_id    TEXT PRIMARY KEY REFERENCES reel(id) ON DELETE CASCADE,
      status     TEXT NOT NULL CHECK (status IN ('reading', 'done', 'error')),
      details    TEXT,
      error      TEXT,
      cost_usd   REAL,
      started_at TEXT NOT NULL
    );
    -- SAM 3.1's track of a Reel for the Studio (lib/scene.ts). JSON, about 1 MB, served by /api/reels/[id]/scene.
    CREATE TABLE IF NOT EXISTS reel_scene (
      reel_id    TEXT PRIMARY KEY REFERENCES reel(id) ON DELETE CASCADE,
      status     TEXT NOT NULL CHECK (status IN ('reading', 'done', 'error')),
      scene      TEXT,
      error      TEXT,
      cost_usd   REAL,
      started_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reel_owner ON reel(owner_id, created_at);
    CREATE INDEX IF NOT EXISTS reel_brand ON reel(brand_id, created_at);
    CREATE INDEX IF NOT EXISTS connection_brand ON connection(brand_id);
  `);
  // Local databases made before videos moved to Blob kept them on disk instead.
  const columns = await all<{ name: string }>("SELECT name FROM pragma_table_info('reel')");
  if (!columns.some((column) => column.name === "video_url")) await run("ALTER TABLE reel ADD COLUMN video_url TEXT");
}
