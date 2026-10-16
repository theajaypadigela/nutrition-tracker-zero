/**
 * Which parts of the product are on. This is the Worker's own file (worker/src/domain/features.ts), so the app and the Worker follow
 * one switch: change it there, rebuild the app and redeploy the Worker. Read it at the point of use (`FEATURES.dayCompletion`), not
 * once at load, so a test can flip it.
 *
 * `dayCompletion` is off for now: no "Mark this day" row, no sheet, no "This day looks incomplete" card, no "looks incomplete" insight,
 * and the voice call does not ask. The components and strings stay in place, unused, so turning it back on is that one line.
 */
export { FEATURES } from '../../../worker/src/domain/features';
