/**
 * Canonical form for food names, aliases and logged names (PLAN.md §7).
 * It only has to be consistent and idempotent; anything it gets wrong is fixed with an alias.
 */

const PLURAL_EXCEPTIONS: Record<string, string> = {
  cookies: 'cookie',
  brownies: 'brownie',
  smoothies: 'smoothie',
  pies: 'pie',
  ties: 'tie',
  movies: 'movie',
  calories: 'calorie',
  rotis: 'roti',
  puris: 'puri',
  pooris: 'poori',
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  mice: 'mouse',
  geese: 'goose',
  teeth: 'tooth',
  children: 'child',
  men: 'man',
  women: 'woman',
  people: 'person',
  // Words that end in "s" but are not plurals.
  hummus: 'hummus',
  couscous: 'couscous',
  asparagus: 'asparagus',
  molasses: 'molasses',
  nachos: 'nacho',
  oats: 'oats',
  chips: 'chip',
  fries: 'fry',
  noodles: 'noodle',
  dates: 'date',
  grapes: 'grape',
  olives: 'olive',
  peas: 'pea',
  lentils: 'lentil',
  beans: 'bean',
  greens: 'green',
};

/** Words in the exception map that must be left alone when they appear already-singular. */
const INVARIANT = new Set(Object.values(PLURAL_EXCEPTIONS));

export function singularize(word: string): string {
  const exception = PLURAL_EXCEPTIONS[word];
  if (exception !== undefined) return exception;
  if (INVARIANT.has(word)) return word;
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('oes')) return word.slice(0, -2);
  if (/(ch|sh|x|ss|z)es$/.test(word)) return word.slice(0, -2);
  // PLAN.md also listed "is" here, but that would keep idlis/chapatis/jalebis plural; its examples win.
  if (word.length > 3 && word.endsWith('s') && !/(ss|us)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function normalizeName(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  const last = words.length - 1;
  words[last] = singularize(words[last]!);
  return words.join(' ');
}
