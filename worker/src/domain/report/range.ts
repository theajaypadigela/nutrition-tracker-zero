import { NUTRIENTS, round, type NutrientValues } from '../nutrients';
import { daysBetween } from '../time';

/** Recorded intake, not an adequacy assessment. Partial days count; days explicitly left out do not. */
export function buildRangeReport(input: {
  from: string;
  to: string;
  through: string;
  numbersHidden: boolean;
  skippedDates: string[];
  items: { date: string; pending: boolean; nutrients: NutrientValues }[];
}) {
  const skipped = new Set(input.skippedDates);
  const items = input.items.filter(i => !skipped.has(i.date));
  const loggedDays = new Set(items.map(i => i.date)).size;
  return {
    range: { from: input.from, to: input.to, through: input.through },
    display: { numbersHidden: input.numbersHidden },
    coverage: {
      calendarDays: daysBetween(input.from, input.through) + 1,
      loggedDays,
      skippedDays: skipped.size,
      itemCount: items.length,
      pendingItems: items.filter(i => i.pending).length,
    },
    nutrients: input.numbersHidden ? [] : NUTRIENTS.map(n => {
      let sum = 0;
      let knownItems = 0;
      for (const item of items) {
        const value = item.nutrients[n.key];
        if (value !== null) { sum += value; knownItems++; }
      }
      const missingItems = items.length - knownItems;
      return {
        nutrient: n.key,
        total: knownItems ? round(sum) : null,
        meanPerLoggedDay: knownItems && loggedDays ? round(sum / loggedDays) : null,
        knownItems,
        missingItems,
        isLowerBound: knownItems > 0 && missingItems > 0,
      };
    }),
  };
}
