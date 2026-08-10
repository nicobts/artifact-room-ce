import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// Creator auth tables (BetterAuth) — separate file, shared SQLite DB + migrations.
export * from "./auth-schema";

/**
 * The data-model spine. A deviation from this file is a defect, not a variant
 * — reconcile it here first (docs/04-data-model.md).
 *
 * INVARIANTS enforced here:
 *  - Analytics hang off the `share`, NEVER the `artifact`. `event` has a
 *    mandatory `shareId` and NO `artifactId` column. To analyze by artifact,
 *    join event -> share -> artifact. This preserves per-recipient separation.
 *  - No column stores a raw IP for long-term retention. Viewer identity is a
 *    cookieless `clientId` (+ coarse `serverSignalHash` for corroboration).
 *  - `email_gated` mode and the `comment` table exist but ship without flows.
 *
 * Portability: text ids (uuid) and integer `timestamp_ms` are portable to
 * Postgres unchanged; no autoincrement coupling.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull();

export const artifact = sqliteTable("artifact", {
  id: id(),
  ownerId: text("owner_id").notNull(), // -> BetterAuth user (creator); not an FK (auth tables live in creator-auth)
  title: text("title").notNull(),
  storageKey: text("storage_key").notNull(), // blob interface key
  contentType: text("content_type").notNull(), // single-file HTML for MVP
  slideCount: integer("slide_count"), // nullable; for per-slide analytics
  sizeBytes: integer("size_bytes"), // blob byte length at upload (nullable; older rows null)
  scanAdvisories: text("scan_advisories", { mode: "json" }), // string[] non-blocking advisories (nullable)
  // Bumped on in-place re-upload (artifact-versioning). The artifact id, its
  // shares, and their tokens are unchanged across versions — links keep working
  // and analytics (keyed to share) persist; only the stored blob is replaced.
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // soft-delete
});

// THE CENTERPIECE ROW. Everything (analytics, access control, comments) hangs
// off the share. One artifact -> many shares.
export const share = sqliteTable(
  "share",
  {
    id: id(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifact.id),
    token: text("token").notNull().unique(), // unguessable; IS viewer identity
    mode: text("mode", {
      enum: ["public", "recipient", "email_gated"],
    }).notNull(),
    recipientLabel: text("recipient_label"), // e.g. "Jane @ Acme"
    recipientEmail: text("recipient_email"), // captured/verified in email_gated only
    passwordHash: text("password_hash"), // strong KDF; nullable
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("share_artifact_id_idx").on(t.artifactId)],
);

// Anonymous, per-browser; stitches a viewer's events + detects forwarding.
// Identity = first-party storage `clientId` (primary) + coarse `serverSignalHash`
// (corroboration). NEVER a raw IP.
export const viewerSession = sqliteTable(
  "viewer_session",
  {
    id: id(),
    shareId: text("share_id")
      .notNull()
      .references(() => share.id),
    clientId: text("client_id").notNull(), // random id from viewer-origin storage; cookieless
    serverSignalHash: text("server_signal_hash"), // hash(UA + accept-language + ...); NOT raw IP
    firstSeenAt: createdAt(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("viewer_session_share_id_idx").on(t.shareId)],
);

// Every view/slide_view/dwell. KEYED TO SHARE, NEVER ARTIFACT.
export const event = sqliteTable(
  "event",
  {
    id: id(),
    shareId: text("share_id") // <-- the spine; mandatory, references share
      .notNull()
      .references(() => share.id),
    viewerSessionId: text("viewer_session_id").references(() => viewerSession.id),
    type: text("type", {
      enum: [
        "view",
        "slide_view",
        "dwell",
        "reopen",
        "forward_suspected",
      ],
    }).notNull(),
    slideIndex: integer("slide_index"),
    durationMs: integer("duration_ms"), // for dwell
    metadata: text("metadata", { mode: "json" }), // per-event detail (e.g. section detection)
    createdAt: createdAt(),
  },
  (t) => [index("event_share_id_idx").on(t.shareId)],
);

// SCAFFOLDED NOW, FLOW POST-MVP. Identified-only (recipient/email_gated).
export const comment = sqliteTable("comment", {
  id: id(),
  shareId: text("share_id")
    .notNull()
    .references(() => share.id),
  viewerSessionId: text("viewer_session_id").references(() => viewerSession.id),
  authorLabel: text("author_label").notNull(), // from share.recipientLabel/email
  slideIndex: integer("slide_index"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// In-process rate-limit state (fixed window). Infra table, not part of the
// analytics spine. Keys are opaque (e.g. "upload:user:<id>"); IP keys are
// transient rate-limit signals, never identity.
export const rateLimit = sqliteTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

// Abuse reports (public intake) and the managed known-bad signature list the
// upload scanner consults (so the heuristic layer tightens without a redeploy).
export const abuseReport = sqliteTable("abuse_report", {
  id: id(),
  reportedToken: text("reported_token"),
  reportedArtifactId: text("reported_artifact_id"),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status", { enum: ["pending", "actioned", "dismissed"] })
    .notNull()
    .default("pending"),
  createdAt: createdAt(),
  handledAt: integer("handled_at", { mode: "timestamp_ms" }),
});

export const abuseSignature = sqliteTable("abuse_signature", {
  id: id(),
  pattern: text("pattern").notNull(),
  note: text("note"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

// Per-creator preferences + the notifications "seen" watermark (open-notifications).
// Read-side only: notifications are PROJECTED from `event` rows newer than
// `notificationsSeenAt`; the viewer/beacon path NEVER writes here (identity
// boundary upheld). `userId` -> BetterAuth user (creator); not an FK (auth tables
// live in creator-auth). Portable: text pk + timestamp_ms + boolean.
export const creatorPrefs = sqliteTable("creator_prefs", {
  userId: text("user_id").primaryKey(),
  notificationsSeenAt: integer("notifications_seen_at", { mode: "timestamp_ms" }),
  emailOnOpen: integer("email_on_open", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export type Share = typeof share.$inferSelect;
export type Artifact = typeof artifact.$inferSelect;
export type Event = typeof event.$inferSelect;
export type ViewerSession = typeof viewerSession.$inferSelect;
