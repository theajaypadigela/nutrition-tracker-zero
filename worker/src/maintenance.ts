/**
 * Retention (WEEKLY_BREAKDOWN_PLAN.md 8.3.3, Phase 6): a call's transcript is kept only to explain a call that saved nothing, so it is
 * emptied after 30 days. The call row stays (its status, reason and duration are what the person sees later); only the words go.
 *
 * Two layers, so the rule does not depend on the schedule having run: a transcript older than the period is never served (`callJson`),
 * and a daily scheduled run empties them for everyone (`wrangler.jsonc` triggers).
 */
export const TRANSCRIPT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const cutoff = (now: Date) => new Date(now.getTime() - TRANSCRIPT_RETENTION_DAYS * DAY_MS).toISOString();

/** A transcript from a call created at `createdAt` is past its retention period. */
export const transcriptExpired = (createdAt: string, now = new Date()): boolean => createdAt < cutoff(now);

/** Empties every transcript older than the retention period, for everyone. Returns how many were emptied. */
export async function purgeOldTranscripts(db: D1Database, now = new Date()): Promise<number> {
  const res = await db
    .prepare('UPDATE calls SET transcript = NULL WHERE transcript IS NOT NULL AND created_at < ?1')
    .bind(cutoff(now))
    .run();
  return res.meta.changes ?? 0;
}
