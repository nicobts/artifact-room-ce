import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { artifact, event, share, viewerSession } from "@/db/schema";
import type { Event } from "@/db/schema";
import type { DetectionMetadata } from "./beacon";
import { deriveProtection, type DisplayProtection } from "@/lib/share";

type Db = typeof defaultDb;

export interface SlideDwell {
  slideIndex: number;
  totalMs: number;
}

export interface ShareStats {
  uniqueViewers: number;
  views: number;
  reopens: number;
  forwards: number;
  perSlideDwellMs: SlideDwell[];
  coverage: number | null;
  detection: DetectionMetadata | null;
}

// ── Region detection + coverage ────────────────────────────────────────────
// Detection can ride ANY persisted event type (the shell late-attaches it),
// so lookup scans recent metadata-bearing events regardless of event type
// and keeps the max-count detection. `metadata` is a JSON text
// column read via drizzle's `mode: "json"`, so rows already come back parsed;
// candidates are narrowed in JS, never via dialect-specific JSON SQL
// (json_extract), to stay Postgres-portable.

/**
 * Best detection payload recorded for a share, or null if none exists.
 * Scans the 20 most recent metadata-bearing events (newest first) and
 * returns the one with the MAXIMUM `count` among valid detection shapes —
 * not simply the latest. The shim's detection ladder is viewport-dependent
 * (e.g. the scroll rung only fires above a height threshold), so a later
 * viewer can land on a lower-fidelity rung than an earlier one; picking the
 * latest event would let that low count shrink the coverage denominator
 * (falsely inflating coverage) instead of reflecting the artifact's real
 * region count. Ties on count keep the newest of the tied ones, since rows
 * are scanned newest-first and only strictly greater counts replace the
 * running best.
 */
export function getShareDetection(
  shareId: string,
  deps: { db?: Db } = {},
): DetectionMetadata | null {
  const db = deps.db ?? defaultDb;

  const rows = db
    .select({ metadata: event.metadata })
    .from(event)
    .where(and(eq(event.shareId, shareId), isNotNull(event.metadata)))
    .orderBy(desc(event.createdAt))
    .limit(20)
    .all();

  let best: DetectionMetadata | null = null;
  for (const row of rows) {
    const detection = (row.metadata as { detection?: DetectionMetadata } | null)?.detection;
    if (
      detection &&
      typeof detection.method === "string" &&
      typeof detection.count === "number" &&
      (!best || detection.count > best.count)
    ) {
      best = detection;
    }
  }
  return best;
}

/** Distinct slide_view coverage against a known detection, ≤1, rounded to 2dp. */
function computeCoverage(
  db: Db,
  shareId: string,
  detection: DetectionMetadata | null,
): number | null {
  if (!detection || detection.count === 0) return null;

  const distinct = db
    .select({ n: sql<number>`count(distinct ${event.slideIndex})` })
    .from(event)
    .where(and(eq(event.shareId, shareId), eq(event.type, "slide_view")))
    .get();

  const ratio = (distinct?.n ?? 0) / detection.count;
  return Math.round(Math.min(ratio, 1) * 100) / 100;
}

/**
 * Region coverage for a share: distinct slide_view indexes ÷ detection.count.
 * Null when there's no detection or its count is 0 (never 0 or NaN).
 */
export function getShareCoverage(shareId: string, deps: { db?: Db } = {}): number | null {
  const db = deps.db ?? defaultDb;
  const detection = getShareDetection(shareId, { db });
  return computeCoverage(db, shareId, detection);
}

/**
 * Per-share analytics rollup. Everything filters by `share.id` — the moat's
 * attribution unit. To analyze by artifact, sum across the artifact's shares.
 */
export function getShareStats(shareId: string, deps: { db?: Db } = {}): ShareStats {
  const db = deps.db ?? defaultDb;

  const unique = db
    .select({ n: sql<number>`count(distinct ${viewerSession.clientId})` })
    .from(viewerSession)
    .where(eq(viewerSession.shareId, shareId))
    .get();

  const byType = db
    .select({ type: event.type, n: sql<number>`count(*)` })
    .from(event)
    .where(eq(event.shareId, shareId))
    .groupBy(event.type)
    .all();
  const counts = Object.fromEntries(byType.map((r) => [r.type, r.n]));

  const dwell = db
    .select({
      slideIndex: event.slideIndex,
      totalMs: sql<number>`coalesce(sum(${event.durationMs}), 0)`,
    })
    .from(event)
    .where(and(eq(event.shareId, shareId), eq(event.type, "dwell")))
    .groupBy(event.slideIndex)
    .all();

  const detection = getShareDetection(shareId, { db });
  const coverage = computeCoverage(db, shareId, detection);

  return {
    uniqueViewers: unique?.n ?? 0,
    views: counts["view"] ?? 0,
    reopens: counts["reopen"] ?? 0,
    forwards: counts["forward_suspected"] ?? 0,
    perSlideDwellMs: dwell
      .filter((d): d is { slideIndex: number; totalMs: number } => d.slideIndex != null)
      .sort((a, b) => a.slideIndex - b.slideIndex),
    coverage,
    detection,
  };
}

// ── Owner-scoped aggregates (creator console) ──────────────────────────────
// Every aggregate below joins event/viewer_session -> share -> artifact and
// filters by `artifact.ownerId`. Nothing keys to `artifact` directly; artifact
// numbers are sums across that artifact's shares. This preserves the
// event-keying invariant (docs/04-data-model.md) while letting a creator see
// their own account-level rollups.

/** Owned, non-deleted shares for a creator (the scoping spine for all reads). */
function ownerScope(ownerId: string) {
  return and(eq(artifact.ownerId, ownerId), isNull(artifact.deletedAt));
}

export interface AccountTotals {
  artifacts: number;
  shares: number;
  views: number;
  uniqueViewers: number;
  forwards: number;
}

export interface ActivityItem {
  type: Event["type"];
  artifactTitle: string;
  recipientLabel: string | null;
  shareMode: string;
  slideIndex: number | null;
  createdAt: Date;
}

export interface TopArtifact {
  artifactId: string;
  title: string;
  views: number;
  avgDwellMs: number;
}

export interface AccountOverview {
  totals: AccountTotals;
  recentActivity: ActivityItem[];
  topArtifacts: TopArtifact[];
}

/**
 * The dashboard rollup for one creator: headline totals, a recent-activity
 * feed, and top artifacts by engagement. Owner-scoped throughout.
 */
export function getAccountOverview(
  ownerId: string,
  deps: { db?: Db } = {},
): AccountOverview {
  const db = deps.db ?? defaultDb;

  const artifactCount = db
    .select({ n: sql<number>`count(*)` })
    .from(artifact)
    .where(ownerScope(ownerId))
    .get();

  const shareCount = db
    .select({ n: sql<number>`count(*)` })
    .from(share)
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(ownerScope(ownerId))
    .get();

  const eventAgg = db
    .select({
      views: sql<number>`coalesce(sum(case when ${event.type} = 'view' then 1 else 0 end), 0)`,
      forwards: sql<number>`coalesce(sum(case when ${event.type} = 'forward_suspected' then 1 else 0 end), 0)`,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(ownerScope(ownerId))
    .get();

  const unique = db
    .select({ n: sql<number>`count(distinct ${viewerSession.clientId})` })
    .from(viewerSession)
    .innerJoin(share, eq(viewerSession.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(ownerScope(ownerId))
    .get();

  const recentActivity = db
    .select({
      type: event.type,
      slideIndex: event.slideIndex,
      createdAt: event.createdAt,
      artifactTitle: artifact.title,
      recipientLabel: share.recipientLabel,
      shareMode: share.mode,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(ownerScope(ownerId))
    .orderBy(desc(event.createdAt))
    .limit(8)
    .all();

  const topArtifacts = db
    .select({
      artifactId: artifact.id,
      title: artifact.title,
      views: sql<number>`coalesce(sum(case when ${event.type} = 'view' then 1 else 0 end), 0)`,
      dwellSum: sql<number>`coalesce(sum(case when ${event.type} = 'dwell' then ${event.durationMs} else 0 end), 0)`,
      dwellCount: sql<number>`coalesce(sum(case when ${event.type} = 'dwell' then 1 else 0 end), 0)`,
    })
    .from(artifact)
    .innerJoin(share, eq(share.artifactId, artifact.id))
    .innerJoin(event, eq(event.shareId, share.id))
    .where(ownerScope(ownerId))
    .groupBy(artifact.id)
    .all();

  return {
    totals: {
      artifacts: artifactCount?.n ?? 0,
      shares: shareCount?.n ?? 0,
      views: eventAgg?.views ?? 0,
      uniqueViewers: unique?.n ?? 0,
      forwards: eventAgg?.forwards ?? 0,
    },
    recentActivity,
    topArtifacts: topArtifacts
      .map((a) => ({
        artifactId: a.artifactId,
        title: a.title,
        views: a.views,
        avgDwellMs: a.dwellCount > 0 ? Math.round(a.dwellSum / a.dwellCount) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
  };
}

export interface ShareWithStats {
  id: string;
  token: string;
  mode: string;
  recipientLabel: string | null;
  hasPassword: boolean;
  /** Derived from mode + passwordHash; includes the two legacy states. */
  protection: DisplayProtection;
  status: "active" | "revoked" | "expired";
  artifactId: string;
  artifactTitle: string;
  createdAt: Date;
  stats: ShareStats;
  totalDwellMs: number;
  avgDwellMs: number;
  coverage: number | null;
}

function shareStatus(
  s: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): "active" | "revoked" | "expired" {
  if (s.revokedAt) return "revoked";
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/**
 * Every share owned by the creator, each with its per-share stats — the row
 * model for the Analytics table. Filtering/sorting happens client-side.
 */
export function listSharesWithStats(
  ownerId: string,
  deps: { db?: Db; artifactId?: string } = {},
  now: Date = new Date(),
): ShareWithStats[] {
  const db = deps.db ?? defaultDb;

  const where = deps.artifactId
    ? and(ownerScope(ownerId), eq(share.artifactId, deps.artifactId))
    : ownerScope(ownerId);

  const rows = db
    .select({
      id: share.id,
      token: share.token,
      mode: share.mode,
      recipientLabel: share.recipientLabel,
      passwordHash: share.passwordHash,
      revokedAt: share.revokedAt,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      artifactId: artifact.id,
      artifactTitle: artifact.title,
    })
    .from(share)
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(where)
    .orderBy(desc(share.createdAt))
    .all();

  return rows.map((r) => {
    const stats = getShareStats(r.id, { db });
    const totalDwellMs = stats.perSlideDwellMs.reduce((sum, d) => sum + d.totalMs, 0);
    return {
      id: r.id,
      token: r.token,
      mode: r.mode,
      recipientLabel: r.recipientLabel,
      hasPassword: r.passwordHash != null,
      protection: deriveProtection({ mode: r.mode, passwordHash: r.passwordHash }),
      status: shareStatus(r, now),
      artifactId: r.artifactId,
      artifactTitle: r.artifactTitle,
      createdAt: r.createdAt,
      stats,
      totalDwellMs,
      avgDwellMs: stats.views > 0 ? Math.round(totalDwellMs / stats.views) : 0,
      coverage: stats.coverage,
    };
  });
}

export interface ArtifactStats {
  views: number;
  uniqueViewers: number;
  reopens: number;
  forwards: number;
  perSlideDwellMs: SlideDwell[];
  recentEvents: ActivityItem[];
  avgCoverage: number | null;
}

/**
 * Per-artifact recap: totals, per-slide dwell, and a recent-events feed,
 * aggregated across the artifact's shares. Owner-scoped; joins
 * `event → share → artifact` (never keyed to the artifact directly).
 */
export function getArtifactStats(
  ownerId: string,
  artifactId: string,
  deps: { db?: Db } = {},
): ArtifactStats {
  const db = deps.db ?? defaultDb;
  const scope = and(
    eq(artifact.ownerId, ownerId),
    isNull(artifact.deletedAt),
    eq(artifact.id, artifactId),
  );

  const eventAgg = db
    .select({
      views: sql<number>`coalesce(sum(case when ${event.type} = 'view' then 1 else 0 end), 0)`,
      reopens: sql<number>`coalesce(sum(case when ${event.type} = 'reopen' then 1 else 0 end), 0)`,
      forwards: sql<number>`coalesce(sum(case when ${event.type} = 'forward_suspected' then 1 else 0 end), 0)`,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(scope)
    .get();

  const unique = db
    .select({ n: sql<number>`count(distinct ${viewerSession.clientId})` })
    .from(viewerSession)
    .innerJoin(share, eq(viewerSession.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(scope)
    .get();

  const dwell = db
    .select({
      slideIndex: event.slideIndex,
      totalMs: sql<number>`coalesce(sum(${event.durationMs}), 0)`,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(and(scope, eq(event.type, "dwell")))
    .groupBy(event.slideIndex)
    .all();

  const recentEvents = db
    .select({
      type: event.type,
      slideIndex: event.slideIndex,
      createdAt: event.createdAt,
      artifactTitle: artifact.title,
      recipientLabel: share.recipientLabel,
      shareMode: share.mode,
    })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(scope)
    .orderBy(desc(event.createdAt))
    .limit(8)
    .all();

  const shareIds = db
    .select({ id: share.id })
    .from(share)
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(scope)
    .all();
  const shareCoverages = shareIds
    .map((s) => getShareCoverage(s.id, { db }))
    .filter((c): c is number => c !== null);
  const avgCoverage =
    shareCoverages.length > 0
      ? Math.round(
          (shareCoverages.reduce((sum, c) => sum + c, 0) / shareCoverages.length) * 100,
        ) / 100
      : null;

  return {
    views: eventAgg?.views ?? 0,
    reopens: eventAgg?.reopens ?? 0,
    forwards: eventAgg?.forwards ?? 0,
    uniqueViewers: unique?.n ?? 0,
    perSlideDwellMs: dwell
      .filter((d): d is { slideIndex: number; totalMs: number } => d.slideIndex != null)
      .sort((a, b) => a.slideIndex - b.slideIndex),
    recentEvents,
    avgCoverage,
  };
}

// ── Per-share recipient drill-down (recipient-drilldown) ───────────────────
// The DocSend-grade payoff: for ONE share/recipient, the per-slide dwell funnel
// (reached vs. drop-off), the session timeline (return visits/reopens), and
// suspected-forwarding events. Owner-scoped via `share → artifact`; everything
// keyed to `share.id`. Returns null if the share is not owned (no existence
// leak — the page renders not-found).

export interface FunnelSlide {
  slideIndex: number;
  reached: number; // distinct viewer sessions that touched this slide
  totalMs: number; // summed dwell on this slide
}

export interface TimelineSession {
  id: string;
  clientId: string;
  firstSeenAt: Date;
  lastSeenAt: Date | null;
  events: number;
  reopens: number;
}

export interface ForwardEvent {
  id: string;
  createdAt: Date;
}

export interface ShareTimeline {
  shareId: string;
  artifactId: string;
  artifactTitle: string;
  token: string;
  mode: string;
  recipientLabel: string | null;
  status: "active" | "revoked" | "expired";
  createdAt: Date;
  totals: {
    views: number;
    uniqueViewers: number;
    reopens: number;
    forwards: number;
    totalDwellMs: number;
  };
  funnel: FunnelSlide[];
  sessions: TimelineSession[];
  forwards: ForwardEvent[];
  regionKind: string | null;
  regionLabels: (string | null)[] | null;
}

export function getShareTimeline(
  ownerId: string,
  shareId: string,
  deps: { db?: Db } = {},
  now: Date = new Date(),
): ShareTimeline | null {
  const db = deps.db ?? defaultDb;

  // Owner-scoped existence check (share → artifact). Not owned ⇒ null.
  const head = db
    .select({
      token: share.token,
      mode: share.mode,
      recipientLabel: share.recipientLabel,
      revokedAt: share.revokedAt,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      artifactId: artifact.id,
      artifactTitle: artifact.title,
    })
    .from(share)
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(and(eq(share.id, shareId), ownerScope(ownerId)))
    .get();
  if (!head) return null;

  const stats = getShareStats(shareId, { db });
  const totalDwellMs = stats.perSlideDwellMs.reduce((n, d) => n + d.totalMs, 0);

  // Per-slide "reached" = distinct sessions with any slide-bearing event there.
  const reachedRows = db
    .select({
      slideIndex: event.slideIndex,
      reached: sql<number>`count(distinct ${event.viewerSessionId})`,
    })
    .from(event)
    .where(and(eq(event.shareId, shareId), isNotNull(event.slideIndex)))
    .groupBy(event.slideIndex)
    .all();
  const reachedBySlide = new Map<number, number>(
    reachedRows
      .filter((r): r is { slideIndex: number; reached: number } => r.slideIndex != null)
      .map((r) => [r.slideIndex, r.reached]),
  );

  const slideIndexes = new Set<number>([
    ...stats.perSlideDwellMs.map((d) => d.slideIndex),
    ...reachedBySlide.keys(),
  ]);
  const dwellBySlide = new Map(stats.perSlideDwellMs.map((d) => [d.slideIndex, d.totalMs]));
  const funnel: FunnelSlide[] = [...slideIndexes]
    .sort((a, b) => a - b)
    .map((slideIndex) => ({
      slideIndex,
      reached: reachedBySlide.get(slideIndex) ?? 0,
      totalMs: dwellBySlide.get(slideIndex) ?? 0,
    }));

  // Session timeline + per-session event/reopen counts.
  const sessionRows = db
    .select()
    .from(viewerSession)
    .where(eq(viewerSession.shareId, shareId))
    .orderBy(asc(viewerSession.firstSeenAt))
    .all();

  const perSession = db
    .select({
      vsId: event.viewerSessionId,
      total: sql<number>`count(*)`,
      reopens: sql<number>`coalesce(sum(case when ${event.type} = 'reopen' then 1 else 0 end), 0)`,
    })
    .from(event)
    .where(eq(event.shareId, shareId))
    .groupBy(event.viewerSessionId)
    .all();
  const sessionAgg = new Map(perSession.map((r) => [r.vsId, r]));

  const sessions: TimelineSession[] = sessionRows.map((s) => {
    const agg = sessionAgg.get(s.id);
    return {
      id: s.id,
      clientId: s.clientId,
      firstSeenAt: s.firstSeenAt,
      lastSeenAt: s.lastSeenAt,
      events: agg?.total ?? 0,
      reopens: agg?.reopens ?? 0,
    };
  });

  const forwards: ForwardEvent[] = db
    .select({ id: event.id, createdAt: event.createdAt })
    .from(event)
    .where(and(eq(event.shareId, shareId), eq(event.type, "forward_suspected")))
    .orderBy(desc(event.createdAt))
    .all();

  return {
    shareId,
    artifactId: head.artifactId,
    artifactTitle: head.artifactTitle,
    token: head.token,
    mode: head.mode,
    recipientLabel: head.recipientLabel,
    status: shareStatus(head, now),
    createdAt: head.createdAt,
    totals: {
      views: stats.views,
      uniqueViewers: stats.uniqueViewers,
      reopens: stats.reopens,
      forwards: stats.forwards,
      totalDwellMs,
    },
    funnel,
    sessions,
    forwards,
    regionKind: stats.detection?.kind ?? null,
    regionLabels: stats.detection?.labels ?? null,
  };
}

export interface DayBucket {
  day: string; // YYYY-MM-DD (UTC)
  views: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Views per calendar day across the last `days` days, zero-filled. Bucketing is
 * done in application code (not dialect date SQL) to stay Postgres-portable.
 */
export function getViewsTimeSeries(
  ownerId: string,
  days = 14,
  deps: { db?: Db } = {},
  now: Date = new Date(),
): DayBucket[] {
  const db = deps.db ?? defaultDb;

  // Window start = midnight UTC, (days - 1) days before today, inclusive.
  const todayUtc = new Date(`${dayKey(now)}T00:00:00.000Z`);
  const start = new Date(todayUtc.getTime() - (days - 1) * 86_400_000);

  const rows = db
    .select({ createdAt: event.createdAt })
    .from(event)
    .innerJoin(share, eq(event.shareId, share.id))
    .innerJoin(artifact, eq(share.artifactId, artifact.id))
    .where(and(ownerScope(ownerId), eq(event.type, "view"), gte(event.createdAt, start)))
    .all();

  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const buckets: DayBucket[] = [];
  for (let i = 0; i < days; i++) {
    const k = dayKey(new Date(start.getTime() + i * 86_400_000));
    buckets.push({ day: k, views: counts.get(k) ?? 0 });
  }
  return buckets;
}
