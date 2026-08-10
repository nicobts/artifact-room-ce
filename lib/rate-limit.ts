import type BetterSqlite3 from "better-sqlite3";

/**
 * In-process, SQLite-backed fixed-window rate limiter (no Redis — single
 * container). Every public-facing ingest/share endpoint is rate-limited. IP,
 * when used as a key, is transient (rate-limit only) and never persisted as
 * identity.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  sqlite: BetterSqlite3.Database,
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const row = sqlite
    .prepare("SELECT count, window_start FROM rate_limit WHERE key = ?")
    .get(key) as { count: number; window_start: number } | undefined;

  // New key or expired window -> start a fresh window.
  if (!row || now - row.window_start >= opts.windowMs) {
    sqlite
      .prepare(
        "INSERT INTO rate_limit (key, count, window_start) VALUES (?, 1, ?) " +
          "ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start",
      )
      .run(key, now);
    return {
      allowed: true,
      remaining: opts.limit - 1,
      resetAt: now + opts.windowMs,
    };
  }

  const count = row.count + 1;
  sqlite.prepare("UPDATE rate_limit SET count = ? WHERE key = ?").run(count, key);
  return {
    allowed: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    resetAt: row.window_start + opts.windowMs,
  };
}
