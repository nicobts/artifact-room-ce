import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createSqlite } from "./sqlite";
import * as schema from "./schema";

/**
 * The application's singleton Drizzle client (Node runtime only — never import
 * this from `proxy.ts` or any edge context; better-sqlite3 is a native module).
 */
const DB_PATH =
  process.env.DATABASE_PATH ?? "./data/artifact-room.sqlite";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = createSqlite(DB_PATH);
export const db = drizzle(sqlite, { schema });
