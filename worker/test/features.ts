import { FEATURES } from '../src/domain/features';

/**
 * Runs a test body with day marking switched on, then puts the switch back. Day marking is off in the product for now
 * (src/domain/features.ts), and these tests keep the way back to it working: flip the switch there and they hold without this wrapper.
 */
export function withDayCompletion<A extends unknown[]>(body: (...args: A) => Promise<void> | void) {
  return async (...args: A): Promise<void> => {
    const was = FEATURES.dayCompletion;
    FEATURES.dayCompletion = true;
    try {
      await body(...args);
    } finally {
      FEATURES.dayCompletion = was;
    }
  };
}
