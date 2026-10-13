/**
 * The data-quality checker's vocabulary (one of the four modules of the weekly pipeline, see ../intake/types.ts): what state a
 * day is in, why a day does not count, and how sure a week is (WEEKLY_BREAKDOWN_PLAN.md 7.2, 7.6). It decides what is complete,
 * missing or uncertain, and never what is "enough": that is the report's job, against the targets.
 */

export type DayState = 'valid' | 'confirmed' | 'partial' | 'empty' | 'skipped' | 'in_progress' | 'future';
/** Why a day is `partial`: the person said so, too many foods are pending, or very little was logged. */
export type PartialReason = 'marked' | 'pending' | 'low';
export type Confidence = 'good' | 'fair' | 'rough' | 'insufficient';
