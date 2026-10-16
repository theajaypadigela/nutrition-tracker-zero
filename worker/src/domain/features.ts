/**
 * Switches for parts of the product that are off for now but written to come back. The app imports this very file
 * (app/src/config/features.ts), so the Worker and the app can never disagree, and one line brings a feature back.
 *
 * `dayCompletion`: a person's own mark on a day (complete / looks incomplete / leave it out of the reports), the voice call's
 * "Should I mark this day as complete?" question with its `mark_day_complete` tool, and every prompt on Today and in the report that asks
 * the person to say whether a day is complete. Switched off on 2026-10-17, by request. While it is off:
 *   - nothing can set or clear a mark (the two routes answer 409 `day_marking_off`) and the call never asks;
 *   - marks already stored are kept exactly as they are, but no screen shows them and no report reads them, so a day marked "leave out"
 *     earlier counts like any other day;
 *   - the data-quality rules that decide by themselves whether a day counts (very little logged, too many items pending) are unchanged:
 *     they are a calculation, not a mark.
 * To bring it back, set it to true and rebuild the app and redeploy the Worker. Every place that reads it (search for `dayCompletion`)
 * then takes the path it took before, and the stored marks count again. Nothing in the database was dropped or rewritten.
 *
 * An object, not a constant, so a test can switch a feature on and off again.
 */
export const FEATURES: { dayCompletion: boolean } = {
  dayCompletion: false,
};
