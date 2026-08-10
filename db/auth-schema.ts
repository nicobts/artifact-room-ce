import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * BetterAuth tables — the CREATOR identity system ONLY (never viewers).
 *
 * Shape matches BetterAuth's expected Drizzle/SQLite schema (user / session /
 * account / verification) so the drizzle adapter maps fields correctly. Kept in
 * its own file but re-exported from db/schema.ts so it shares the single SQLite
 * file, the Drizzle client, and the migration history.
 *
 * Privacy note: `session.ipAddress` exists in BetterAuth's model but we set
 * `advanced.ipAddress.disableIpTracking` in lib/auth.ts, so it is never
 * populated — honoring the no-raw-IP-at-rest invariant.
 *
 * No viewer-side table references `user`; `artifact.ownerId` is a plain text id.
 */

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  ts("created_at").default(sql`(unixepoch() * 1000)`).notNull();
const updatedAt = () =>
  ts("updated_at")
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date())
    .notNull();

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  // Server-set authorization role (`member` | `admin`). NEVER client-writable:
  // lib/auth.ts declares it with `input: false`, and boot promotion / the admin
  // UI are the only writers. See docs/05-security.md.
  role: text("role").default("member").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"), // left null — IP tracking disabled in config
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // hashed by BetterAuth (email+password)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
