import type { FoodIndex } from './match';

export interface Suggestion {
  foodId: string;
  name: string;
  displayName: string;
  /** The name or alias that matched. */
  matched: string;
  score: number;
}

function bigrams(s: string): Map<string, number> {
  const padded = ` ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < padded.length - 1; i++) {
    const g = padded.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function size(m: Map<string, number>): number {
  let n = 0;
  for (const v of m.values()) n += v;
  return n;
}

/** Sørensen–Dice coefficient over character bigrams (multiset). */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ba) overlap += Math.min(n, bb.get(g) ?? 0);
  const total = size(ba) + size(bb);
  return total === 0 ? 0 : (2 * overlap) / total;
}

/** Jaccard overlap of the word sets ("masala dosa" vs "dosa" = 0.5). */
export function tokenSet(a: string, b: string): number {
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function similarity(a: string, b: string): number {
  return Math.max(dice(a, b), tokenSet(a, b));
}

/** Top `limit` foods scoring ≥ `threshold` against a normalized name, one entry per food. */
export function suggest(index: FoodIndex, normalizedName: string, limit = 3, threshold = 0.5): Suggestion[] {
  const best = new Map<string, Suggestion>();
  for (const [candidate, food] of index.byName) {
    const score = similarity(normalizedName, candidate);
    if (score < threshold) continue;
    const prev = best.get(food.id);
    if (!prev || score > prev.score) {
      best.set(food.id, {
        foodId: food.id,
        name: food.name,
        displayName: food.displayName,
        matched: candidate,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
