/**
 * What was logged, as the intake calculator hands it on. The weekly pipeline has four modules, each tested on its own:
 * `targets/` (what a person is compared against), `intake/` (what was logged, in nutrients), `quality/` (what is complete,
 * missing or uncertain) and `report/` (the weekly view built from the other three). An item's amounts are its food's values
 * times how much was logged; a nutrient that is absent or null is UNKNOWN, never zero (WEEKLY_BREAKDOWN_PLAN.md 7.1).
 */
import type { FoodSource } from '../match';
import type { NutrientKey } from '../nutrients';

/** A mark the person put on a day: it is complete, it looks incomplete, or leave it out. */
export type DayMark = 'complete' | 'partial' | 'skip';

/** One logged item, resolved. */
export interface IntakeItem {
  foodId: string | null;
  /** The food's name, or what the person called it, for "top sources". */
  name: string;
  /** Waiting for a food or a unit: contributes nothing and is counted separately. */
  pending: boolean;
  nutrients: Partial<Record<NutrientKey, number | null>>;
  /** How much was logged, as it was said or typed: the data-quality checker looks for an amount worth a second look. */
  quantity?: number;
  unit?: string;
  /** Where the food's numbers came from, as recorded on the food; null when nobody said. */
  source?: FoodSource | null;
}

export interface IntakeDay {
  date: string;
  items: IntakeItem[];
  mark: DayMark | null;
}
