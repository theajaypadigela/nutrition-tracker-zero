/**
 * The words of a problem the Worker found in a food's numbers (WEEKLY_BREAKDOWN_PLAN.md 7.4): it sends an id and the numbers, and the
 * sentence comes from the strings table, so the copy can change without a deploy and is covered by the string lint.
 */
import type { FoodIssue, NutrientInfo } from '@/api/types';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { nutrientInfo } from './report';

const t = strings.food.issues;

/** The sentence for one issue, or the id itself when this app does not know it (a newer Worker): never blank. */
export function issueText(issue: FoodIssue, nutrients: NutrientInfo[]): string {
  const template = t[issue.id];
  if (!template) return issue.id.replace(/_/g, ' ');
  const key = String(issue.params.nutrient ?? issue.nutrient ?? '');
  const info = key ? nutrientInfo(nutrients, key) : { label: '', unit: '' };
  // `unit` is a unit of measure the person logs (a piece); `nutrientUnit` is what the nutrient is counted in (mg).
  return fill(template, { ...issue.params, nutrient: info.label, nutrientUnit: info.unit });
}

/** Every distinct sentence for a list of issues, in the order the Worker gave them. */
export const issueTexts = (issues: FoodIssue[], nutrients: NutrientInfo[]): string[] => [...new Set(issues.map(i => issueText(i, nutrients)))];
