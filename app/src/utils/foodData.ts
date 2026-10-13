/**
 * The food-data format: the one block of JSON a person copies from a chat assistant into the food form, and the prompt that makes an
 * assistant write it. Pasting fills the same fields typing does, so a food entered either way is the same food.
 *
 *   {
 *     "name": "Idli",                  the food (fills the Name field only if it is empty)
 *     "per": "piece",                  what every number is for: a base unit from /meta ("piece", "katori", "100 g", ...)
 *     "form": "as_eaten",              "as_eaten" or "raw" (optional)
 *     "source": "estimate",            "label", "database", "recipe" or "estimate" (optional)
 *     "calories_kcal": 39,             one field per nutrient, named by its key and its unit: "protein_g", "sodium_mg", ...
 *     "protein_g": 1.9,
 *     ...
 *   }
 *
 * A nutrient left out, or null, is left empty in the form, and an empty field is saved as 0 (see `buildNutrients`). Field names are
 * read loosely ("Protein (g)", "carbohydrate", "fibre"), but a field in the wrong unit ("sodium_g") is refused, never rescaled by
 * guesswork, and a number written with its unit ("0.4 g") is converted to the field's own unit.
 */
import type { FoodForm, FoodIssue, FoodSource, NutrientInfo } from '@/api/types';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { isLooseObject, LooseSyntaxError, readLoose, type Loose, type LooseObject } from './looseJson';

/** The most a nutrient may be, as the Worker takes it. */
export const MAX_NUTRIENT_VALUE = 100_000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** The unit a nutrient is counted in, as one word: "kcal", "g", "mg" or "mcg" ("mcg DFE" is counted in mcg). */
const unitToken = (unit: string) => (unit.toLowerCase().split(/\s+/)[0] ?? '').replace(/[^a-z]/g, '');
const snake = (key: string) => key.replace(/([A-Z])/g, '_$1').toLowerCase();

/** The name a nutrient has in the pasted format: its key in snake case and its unit ("protein_g", "sodium_mg", "calories_kcal"). */
export function fieldName(n: Pick<NutrientInfo, 'key' | 'unit'>): string {
  return `${snake(n.key)}_${unitToken(n.unit)}`;
}

// ---- grouping the fields of the form

export type NutrientGroupId = 'label' | 'minerals' | 'vitamins' | 'other';

const LABEL_KEYS = ['calories', 'protein', 'carbs', 'fat', 'saturatedFat', 'fiber', 'sugar', 'addedSugar', 'sodium'];
const MINERAL_KEYS = ['calcium', 'iron', 'potassium', 'magnesium', 'zinc'];
const VITAMIN_KEYS = ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate'];

/**
 * The fields of the form in the order a pack label lists them, then minerals, then vitamins. A nutrient the Worker adds later that this
 * does not know still gets a field, under "other": nothing is hidden.
 */
export function groupNutrients(nutrients: readonly NutrientInfo[]): { id: NutrientGroupId; nutrients: NutrientInfo[] }[] {
  const pick = (keys: readonly string[]) => nutrients.filter(n => keys.includes(n.key));
  const known = [...LABEL_KEYS, ...MINERAL_KEYS, ...VITAMIN_KEYS];
  const groups: { id: NutrientGroupId; nutrients: NutrientInfo[] }[] = [
    { id: 'label', nutrients: pick(LABEL_KEYS) },
    { id: 'minerals', nutrients: pick(MINERAL_KEYS) },
    { id: 'vitamins', nutrients: pick(VITAMIN_KEYS) },
    { id: 'other', nutrients: nutrients.filter(n => !known.includes(n.key)) },
  ];
  return groups.filter(g => g.nutrients.length > 0);
}

// ---- numbers typed into the form

/**
 * A typed number; a decimal comma is allowed ("2,5"). Null for a blank, or anything that is not a finite number. A comma followed by
 * exactly three digits ("1,200") is null too: it is 1.2 in one country and twelve hundred in another, and a guess would be a thousandfold
 * mistake in somebody's food.
 */
export function readNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const comma = /^\d+,(\d+)$/.exec(t);
  if (comma && comma[1]!.length === 3) return null;
  const n = Number(comma ? t.replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}

/** The numbers typed so far: a blank, or a half-typed or invalid one, is left out. What the live check is asked about. */
export function typedNutrients(values: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, text] of Object.entries(values)) {
    const v = readNumber(text);
    if (v !== null && v >= 0 && v <= MAX_NUTRIENT_VALUE) out[key] = v;
  }
  return out;
}

export interface BuiltNutrients {
  /** Every nutrient there is, as the Worker takes it: what was typed, and 0 for what was left empty. */
  nutrients: Record<string, number>;
  /** The fields that hold something that is not a number the Worker accepts, by nutrient key. */
  errors: Record<string, string>;
  /** The keys that were left empty and so became 0. */
  blanks: string[];
}

/**
 * What a save sends. An empty field is 0, not unknown: a person fills in only what they know, and the rest counts as nothing. The
 * same function serves a form that was typed and one that was filled from pasted data, so both make the same food.
 */
export function buildNutrients(values: Record<string, string>, nutrients: readonly NutrientInfo[]): BuiltNutrients {
  const out: BuiltNutrients = { nutrients: {}, errors: {}, blanks: [] };
  for (const n of nutrients) {
    const text = (values[n.key] ?? '').trim();
    if (text === '') {
      out.nutrients[n.key] = 0;
      out.blanks.push(n.key);
      continue;
    }
    const v = readNumber(text);
    if (v === null || v < 0) out.errors[n.key] = strings.foodEntry.errors.number;
    else if (v > MAX_NUTRIENT_VALUE) out.errors[n.key] = fill(strings.foodEntry.errors.tooLarge, { max: MAX_NUTRIENT_VALUE });
    else out.nutrients[n.key] = v;
  }
  return out;
}

/**
 * Two things that become likely once an empty field is 0: a food with nothing in it at all (it would count as no energy), and a
 * calorie count left empty beside protein, carbohydrate and fat (it would count as no energy too). Neither blocks a save; the
 * person is asked, in the same words and the same box as the Worker's own questions about the numbers.
 */
export function emptinessIssues(nutrients: Record<string, number>): FoodIssue[] {
  if (Object.values(nutrients).every(v => v === 0)) return [{ id: 'all_empty', severity: 'warning', params: {} }];
  const expected = 4 * (nutrients.protein ?? 0) + 4 * (nutrients.carbs ?? 0) + 9 * (nutrients.fat ?? 0);
  if ((nutrients.calories ?? 0) === 0 && expected >= 20) {
    return [{ id: 'calories_empty', severity: 'warning', nutrient: 'calories', params: { expected: Math.round(expected) } }];
  }
  return [];
}

/**
 * The Worker compares calories with protein, carbohydrate and fat; if one of the three was left empty (so it is 0 here only because
 * it was not typed) that comparison says nothing, and asking about it on every save of a food with just a few numbers would be noise.
 */
export function withoutGuesses(warnings: readonly FoodIssue[], blanks: readonly string[]): FoodIssue[] {
  const macroBlank = ['protein', 'carbs', 'fat'].some(k => blanks.includes(k));
  return warnings.filter(w => !(w.id === 'calories_vs_macros' && macroBlank));
}

// ---- reading pasted data

export interface PastedFood {
  name?: string;
  /** A base unit from /meta. */
  baseUnit?: string;
  form?: FoodForm;
  source?: FoodSource;
  /** Only the nutrients the data mentions, by key: a number as text, or '' for one it said it does not know. */
  values: Record<string, string>;
}

export type DataIssueId =
  | 'empty'
  | 'no_data'
  | 'syntax'
  | 'several'
  | 'bad_number'
  | 'negative'
  | 'too_large'
  | 'wrong_unit'
  | 'bad_per'
  | 'bad_form'
  | 'no_values';

/** A problem with pasted data: an id and the numbers or words involved, worded by `dataIssueText`. */
export interface DataIssue {
  id: DataIssueId;
  params: Record<string, string | number>;
}

export type ParseResult =
  | {
      ok: true;
      food: PastedFood;
      /** How many nutrient fields the data filled. */
      filled: number;
      /** Fields the data had that this app does not track, as they were written. */
      ignored: string[];
    }
  | { ok: false; issues: DataIssue[] };

export const dataIssueText = (issue: DataIssue): string => fill(strings.foodEntry.dataIssues[issue.id], issue.params);

const SYNONYMS: Record<string, string[]> = {
  calories: ['calorie', 'energy', 'energykcal', 'kcal'],
  protein: ['proteins'],
  carbs: ['carb', 'carbohydrate', 'carbohydrates', 'totalcarbohydrate', 'totalcarbohydrates', 'totalcarbs'],
  fat: ['fats', 'totalfat'],
  saturatedFat: ['satfat', 'saturatedfats', 'saturatedfattyacids'],
  fiber: ['fibre', 'dietaryfiber', 'dietaryfibre'],
  sugar: ['sugars', 'totalsugar', 'totalsugars'],
  addedSugar: ['addedsugars'],
  vitaminA: ['vita'],
  vitaminB12: ['b12', 'vitb12'],
  vitaminC: ['vitc'],
  vitaminD: ['vitd'],
  vitaminE: ['vite'],
  vitaminK: ['vitk'],
};

interface Field {
  info: NutrientInfo;
  token: string;
}

/** Every spelling of every nutrient: by its own name, and with its own unit after it. */
function fieldIndex(nutrients: readonly NutrientInfo[]) {
  const exact = new Map<string, Field>();
  const bases = new Map<string, Field>();
  for (const info of nutrients) {
    const field = { info, token: unitToken(info.unit) };
    for (const name of new Set([norm(info.key), norm(info.label), ...(SYNONYMS[info.key] ?? [])])) {
      bases.set(name, field);
      exact.set(name, field);
      exact.set(name + field.token, field);
    }
  }
  return { exact, bases };
}

/** A unit ending a field name, longest first (so "mcg" is not read as "g"); "ug" is another way to write "mcg". */
const NAME_UNITS: [suffix: string, unit: string][] = [
  ['kcal', 'kcal'],
  ['mcg', 'mcg'],
  ['ug', 'mcg'],
  ['mg', 'mg'],
  ['kj', 'kj'],
  ['iu', 'iu'],
  ['g', 'g'],
];

type Lookup = { field: Field } | { wrongUnit: Field } | null;

function lookup(raw: string, index: ReturnType<typeof fieldIndex>): Lookup {
  const key = norm(raw);
  const direct = index.exact.get(key);
  if (direct) return { field: direct };
  for (const [suffix, unit] of NAME_UNITS) {
    if (!key.endsWith(suffix)) continue;
    const field = index.bases.get(key.slice(0, -suffix.length));
    if (!field) continue;
    return unit === field.token ? { field } : { wrongUnit: field };
  }
  return null;
}

const chars = (...codes: number[]) => codes.map(c => String.fromCodePoint(c)).join('');
/** Both micro signs (U+00B5 and U+03BC) a copied unit can carry, so either one reads as micrograms. */
const MICRO = chars(0xb5, 0x3bc);

const MASS_IN_GRAMS: Record<string, number> = { g: 1, mg: 1e-3, mcg: 1e-6, ug: 1e-6 };
for (const sign of MICRO) MASS_IN_GRAMS[`${sign}g`] = 1e-6;
const ENERGY_UNITS = ['kcal', 'cal', 'calorie', 'calories', 'kilocalorie', 'kilocalories'];
const KILOJOULES = ['kj', 'kilojoule', 'kilojoules'];
/** What a person writes when they mean "no figure" (an em or en dash, n/a, trace, ...): the field is left empty. */
const NO_FIGURE = new RegExp(`^(|-|${chars(0x2014)}|${chars(0x2013)}|n/?a|nil|none|unknown|trace|tr|not (known|available|specified))$`, 'i');
const APPROXIMATELY = new RegExp(
  `^(~|${chars(0x2248)}|about\\s|approximately\\s|approx\\.?\\s?|around\\s|<=?|>=?|${chars(0x2264)}|${chars(0x2265)}|less than\\s|under\\s|over\\s)\\s*`,
  'i',
);
/** "1,200 mg" is twelve hundred: a first group of one to three digits (not starting with 0), then groups of three. */
const THOUSANDS = new RegExp(`^[1-9]\\d{0,2}(,\\d{3})+(\\.\\d+)?(\\s|[a-z${MICRO}]|$)`, 'i');
const NUMBER_WITH_UNIT = new RegExp(`^([+-]?(?:\\d+\\.?\\d*|\\.\\d+))\\s*([a-z${MICRO}%]*)\\.?$`, 'i');

type Amount = { kind: 'value'; value: string } | { kind: 'empty' } | { kind: 'issue'; id: 'bad_number' | 'negative' | 'too_large'; shown: string };

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function judge(n: number, shown: string): Amount {
  if (!Number.isFinite(n)) return { kind: 'issue', id: 'bad_number', shown };
  if (n < 0) return { kind: 'issue', id: 'negative', shown };
  if (n > MAX_NUTRIENT_VALUE) return { kind: 'issue', id: 'too_large', shown };
  return { kind: 'value', value: String(round6(n)) };
}

/** One field's value: a number, or text that is a number with its unit, converted to the field's own unit. */
function amountOf(raw: Loose, field: Field): Amount {
  if (raw === null) return { kind: 'empty' };
  if (typeof raw === 'number') return judge(raw, String(raw));
  if (typeof raw !== 'string') return { kind: 'issue', id: 'bad_number', shown: describe(raw) };

  const text = raw.trim();
  if (NO_FIGURE.test(text)) return { kind: 'empty' };
  let t = text.replace(APPROXIMATELY, '');
  // "1,200 mg" is twelve hundred; "1,5 g" and "0,125 g" are decimals.
  t = THOUSANDS.test(t) ? t.replace(/,/g, '') : t.replace(/^(\d+),(\d+)/, '$1.$2');
  const m = NUMBER_WITH_UNIT.exec(t);
  if (!m) return { kind: 'issue', id: 'bad_number', shown: text };
  let n = Number(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  if (unit !== '') {
    if (field.token === 'kcal') {
      if (KILOJOULES.includes(unit)) n /= 4.184;
      else if (!ENERGY_UNITS.includes(unit)) return { kind: 'issue', id: 'bad_number', shown: text };
    } else {
      const given = MASS_IN_GRAMS[unit];
      const own = MASS_IN_GRAMS[field.token];
      if (given === undefined || own === undefined) return { kind: 'issue', id: 'bad_number', shown: text };
      n = (n * given) / own;
    }
  }
  return judge(n, text);
}

const PER_WORDS: Record<string, string> = {
  pieces: 'piece',
  slices: 'slice',
  katoris: 'katori',
  katoree: 'katori',
  vati: 'katori',
  vatis: 'katori',
  wati: 'katori',
  bowls: 'bowl',
  plates: 'plate',
  cups: 'cup',
  glasses: 'glass',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsps: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsps: 'tsp',
  servings: 'serving',
  portion: 'serving',
  portions: 'serving',
};

/** "1 piece", "per katori", "100g", "100 grams", "1 cup (240 ml)" as a base unit from the list; null when it is none of them. */
export function readBaseUnit(raw: string, baseUnits: readonly string[]): string | null {
  const t = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(per|one|an?|1x?)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const metric = /^100\s*(g|gm|gms|gr|gram|grams|ml|mls|millilitre|millilitres|milliliter|milliliters)$/.exec(t);
  const candidate = metric ? (metric[1]!.startsWith('m') ? '100 ml' : '100 g') : (PER_WORDS[t] ?? t);
  return baseUnits.includes(candidate) ? candidate : null;
}

const FORM_WORDS: Record<string, FoodForm> = {
  aseaten: 'as_eaten',
  cooked: 'as_eaten',
  prepared: 'as_eaten',
  readytoeat: 'as_eaten',
  raw: 'raw',
  dry: 'raw',
  dried: 'raw',
  uncooked: 'raw',
  rawordry: 'raw',
};

const SOURCE_WORDS: Record<string, FoodSource> = {
  label: 'label',
  packlabel: 'label',
  packagelabel: 'label',
  database: 'database',
  fooddatabase: 'database',
  recipe: 'recipe',
  estimate: 'estimate',
  estimated: 'estimate',
  guess: 'estimate',
};

const META_KEYS = {
  name: ['name', 'food', 'foodname', 'displayname', 'title'],
  per: ['per', 'baseunit', 'servingunit', 'serving', 'servingsize', 'valuesper'],
  form: ['form', 'foodform'],
  source: ['source', 'datasource'],
  /** Objects that hold the nutrient fields instead of the top level. */
  groups: ['nutrients', 'nutrition', 'nutritionfacts', 'nutrientvalues'],
};

const fail = (...issues: DataIssue[]): ParseResult => ({ ok: false, issues });

/** A value as the person would name it in a message: the text itself, or what kind of thing it is. */
const describe = (value: Loose): string => (Array.isArray(value) ? 'a list' : value !== null && typeof value === 'object' ? 'a group of fields' : String(value));

/** The top-level fields, and those of a nested `nutrients` object read as if they were top-level. */
function fieldsOf(root: LooseObject): [string, Loose][] {
  const out: [string, Loose][] = [];
  for (const [key, value] of Object.entries(root)) {
    if (META_KEYS.groups.includes(norm(key)) && isLooseObject(value)) out.push(...Object.entries(value));
    else out.push([key, value]);
  }
  return out;
}

/**
 * Reads pasted text into a food. Collects every problem it can find, not only the first, so a person can fix them in one go; and a
 * field it does not know is only noted, never an error. Nothing here touches the form: the caller applies a successful result.
 */
export function parseFoodData(text: string, nutrients: readonly NutrientInfo[], baseUnits: readonly string[]): ParseResult {
  if (text.trim() === '') return fail({ id: 'empty', params: {} });

  let root: Loose | undefined;
  try {
    root = readLoose(text);
  } catch (e) {
    if (e instanceof LooseSyntaxError) return fail({ id: 'syntax', params: { line: e.line, column: e.column, near: e.near, expected: e.expected } });
    throw e;
  }
  if (root === undefined) return fail({ id: 'no_data', params: {} });
  // `readLoose` only returns an object, or a list that holds one.
  let object: LooseObject;
  if (Array.isArray(root)) {
    const foods = root.filter(isLooseObject);
    if (foods.length > 1) return fail({ id: 'several', params: { count: foods.length } });
    object = foods[0]!;
  } else object = root as LooseObject;

  const index = fieldIndex(nutrients);
  const food: PastedFood = { values: {} };
  const issues: DataIssue[] = [];
  const ignored: string[] = [];

  for (const [rawKey, value] of fieldsOf(object)) {
    const key = norm(rawKey);
    if (META_KEYS.name.includes(key)) {
      if (typeof value === 'string' && value.trim() !== '') food.name = value.trim().replace(/\s+/g, ' ');
      continue;
    }
    if (META_KEYS.per.includes(key)) {
      if (value === null || value === '') continue;
      const unit = typeof value === 'string' ? readBaseUnit(value, baseUnits) : null;
      if (unit) food.baseUnit = unit;
      else issues.push({ id: 'bad_per', params: { value: describe(value), allowed: baseUnits.join(', ') } });
      continue;
    }
    if (META_KEYS.form.includes(key)) {
      if (value === null || value === '') continue;
      const form = typeof value === 'string' ? FORM_WORDS[norm(value)] : undefined;
      if (form) food.form = form;
      else issues.push({ id: 'bad_form', params: { value: describe(value) } });
      continue;
    }
    if (META_KEYS.source.includes(key)) {
      const source = typeof value === 'string' ? SOURCE_WORDS[norm(value)] : undefined;
      if (source) food.source = source;
      else if (value !== null && value !== '') ignored.push(rawKey);
      continue;
    }

    const found = lookup(rawKey, index);
    if (!found) {
      ignored.push(rawKey);
      continue;
    }
    if ('wrongUnit' in found) {
      issues.push({ id: 'wrong_unit', params: { field: rawKey, expected: fieldName(found.wrongUnit.info) } });
      continue;
    }
    const amount = amountOf(value, found.field);
    if (amount.kind === 'value') food.values[found.field.info.key] = amount.value;
    else if (amount.kind === 'empty') food.values[found.field.info.key] = '';
    else if (amount.id === 'too_large') issues.push({ id: 'too_large', params: { field: rawKey, value: amount.shown, max: MAX_NUTRIENT_VALUE } });
    else issues.push({ id: amount.id, params: { field: rawKey, value: amount.shown } });
  }

  const filled = Object.keys(food.values).length;
  if (filled === 0 && !issues.some(i => i.id === 'wrong_unit' || i.id === 'bad_number' || i.id === 'negative' || i.id === 'too_large')) {
    issues.push({ id: 'no_values', params: { examples: nutrients.slice(0, 3).map(fieldName).join(', ') } });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, food, filled, ignored };
}

// ---- the prompt

/**
 * The text a person copies into a chat assistant. It is built from the nutrients and base units the Worker serves, so it asks for
 * exactly the fields this app reads. With a name or a base unit already chosen in the form, the prompt carries them.
 */
export function buildPrompt({
  name,
  baseUnit,
  nutrients,
  baseUnits,
}: {
  name?: string | null;
  baseUnit?: string | null;
  nutrients: readonly NutrientInfo[];
  baseUnits: readonly string[];
}): string {
  const p = strings.foodEntry.prompt;
  const food = name?.trim() ?? '';
  const per = baseUnit && baseUnits.includes(baseUnit) ? baseUnit : null;
  const example: Record<string, string | number> = {
    name: food || p.exampleName,
    per: per ?? p.examplePer,
    form: 'as_eaten',
    source: 'estimate',
  };
  for (const n of nutrients) example[fieldName(n)] = 0;

  return [
    p.intro,
    '',
    ...p.rules.map(rule => `- ${rule}`),
    `- ${per ? fill(p.perFixed, { unit: per }) : fill(p.perAny, { list: baseUnits.join(', ') })}`,
    '',
    p.formatLead,
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    '',
    `${p.foodLabel} ${food || p.foodPlaceholder}`,
  ].join('\n');
}
