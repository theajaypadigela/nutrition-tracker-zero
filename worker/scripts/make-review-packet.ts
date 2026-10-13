/**
 * The review packet for the people who must read this before anyone outside your circle uses it (WEEKLY_BREAKDOWN_PLAN.md 8.7, 11.7):
 * a dietitian, a reader with eating-disorder expertise, a privacy and legal reader, and a second person re-deriving the reference tables.
 * Everything in it comes from the code as it is (the engine's real output, the app's strings table, the tables the engine reads), so the
 * packet cannot drift from what the app does. `npm run review:packet` in the worker writes docs/REVIEW_PACKET.md.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strings } from '../../app/src/i18n/strings';
import { computeTargets } from '../src/domain/targets/engine';
import { ENGINE_VERSION, NO_SAFETY_FLAGS, type HealthProfileInput, type SafetyAnswers, type TargetSet } from '../src/domain/targets/types';
import { NASEM_MICROS, MICRO_KEYS, AGE_BANDS } from '../src/domain/reference/nasem';
import { ICMR_MICROS, ICMR_BANDS } from '../src/domain/reference/icmr';
import { SOURCES } from '../src/domain/reference/sources';
import { REPORT_CONFIG } from '../src/domain/reference/scoring';
import { MAX_COUNT, MAX_COUNT_OTHER, MAX_ITEM_KCAL, MAX_METRIC } from '../src/domain/quality/items';

const TODAY = '2026-10-13';
const out: string[] = [];
const line = (s = '') => out.push(s);
const table = (head: string[], rows: (string | number)[][]) => {
  line(`| ${head.join(' | ')} |`);
  line(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) line(`| ${r.map((c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
  line();
};
const n = (v: number | undefined) => (v === undefined ? '' : Math.round(v).toLocaleString('en-US'));
const t1 = (v: number | undefined) => (v === undefined ? '' : (Math.round(v * 10) / 10).toLocaleString('en-US'));

// ---- personas ------------------------------------------------------------------------------------------------------------------------
type Persona = { label: string; profile: Omit<HealthProfileInput, 'referenceSet'> };
const P = (label: string, p: Partial<HealthProfileInput> & Pick<HealthProfileInput, 'birthYear' | 'sexForCalc' | 'heightCm' | 'weightKg'>): Persona => ({
  label,
  profile: { birthMonth: 6, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', ...p },
});
const PERSONAS: Persona[] = [
  P('Woman 30, 160 cm, 60 kg, low active, eat well', { birthYear: 1996, sexForCalc: 'female', heightCm: 160, weightKg: 60 }),
  P('Vegetarian woman 30, 158 cm, 52 kg, eat well', { birthYear: 1996, sexForCalc: 'female', heightCm: 158, weightKg: 52, pattern: 'vegetarian' }),
  P('Man 45, 172 cm, 85 kg, inactive, lose (standard)', { birthYear: 1981, sexForCalc: 'male', heightCm: 172, weightKg: 85, activity: 'inactive', goal: 'lose' }),
  P('Man 25, 180 cm, 70 kg, active, build muscle', { birthYear: 2001, sexForCalc: 'male', heightCm: 180, weightKg: 70, activity: 'active', goal: 'build_muscle' }),
  P('Woman 68, 155 cm, 58 kg, inactive, maintain, vegetarian', { birthYear: 1958, sexForCalc: 'female', heightCm: 155, weightKg: 58, activity: 'inactive', goal: 'maintain', pattern: 'vegetarian' }),
  P('Sex not given 40, 165 cm, 75 kg, lose (gentle)', { birthYear: 1986, sexForCalc: 'average', heightCm: 165, weightKg: 75, goal: 'lose', pace: 'gentle' }),
  P('Woman 35, 160 cm, 45 kg (BMI 17.6), gain', { birthYear: 1991, sexForCalc: 'female', heightCm: 160, weightKg: 45, goal: 'gain' }),
  P('Woman 50, 150 cm, 95 kg (BMI 42), inactive, lose (faster)', { birthYear: 1976, sexForCalc: 'female', heightCm: 150, weightKg: 95, activity: 'inactive', goal: 'lose', pace: 'faster' }),
  P('Man 75, 170 cm, 80 kg (BMI 27.7), inactive, lose', { birthYear: 1951, sexForCalc: 'male', heightCm: 170, weightKg: 80, activity: 'inactive', goal: 'lose' }),
  P('Woman 24, 165 cm, 63 kg (BMI 23.1), lose', { birthYear: 2002, sexForCalc: 'female', heightCm: 165, weightKg: 63, goal: 'lose' }),
];
const val = (s: TargetSet, k: string) => s.targets.find((t) => t.nutrient === k);
const range = (s: TargetSet, k: string) => {
  const t = val(s, k);
  return t ? `${n(t.value)}${t.low !== undefined && t.high !== undefined ? ` (${n(t.low)}-${n(t.high)})` : ''}` : '';
};

// ---- the packet ----------------------------------------------------------------------------------------------------------------------
line('# Review packet: personal targets and the weekly report');
line();
line(`Generated from the code on ${TODAY} (engine ${ENGINE_VERSION}) by \`cd worker && npm run review:packet\`. **Nothing here has been reviewed yet.**`);
line('Every number below is the engine\'s real output and every sentence is the app\'s real wording, so a comment on this page is a comment on');
line('the app. The design and the evidence behind it are in [WEEKLY_BREAKDOWN_PLAN.md](../WEEKLY_BREAKDOWN_PLAN.md); section references below');
line('point there.');
line();
line('**Who reads what.**');
line();
table(
  ['Reviewer', 'Start with', 'What we need'],
  [
    ['Dietitian', 'Sections 1, 2, 3 and 5', 'Are the targets, floors, caps and gates sensible for adults in India and the US? Is any sentence wrong, alarming or advice we must not give?'],
    ['Eating-disorder expertise', 'Section 2 (the gates), section 5 (all wording), especially low-pressure mode', 'Could any screen or sentence push someone toward restriction? Is the safety wording right?'],
    ['Privacy and legal', 'Section 6 and the README\'s privacy section', 'Is the data inventory complete and the consent wording adequate (DPDP Act, Google Play, Apple)?'],
    ['Second reader of the tables', 'Section 4', 'Re-derive each value from the official book; a test snapshots each table\'s hash, so a correction shows as a diff.'],
  ],
);

// 1. personas
line('## 1. What the engine gives ten people, on both reference sets');
line();
line('Energy is the National Academies 2023 equation on both sets, shown as a range; the target moves only for a loss or gain goal, inside');
line('the floors and caps of plan 4.3. A goal that is not offered is held at maintenance, with a warning.');
line();
for (const set of ['nasem', 'icmr_nin'] as const) {
  line(`### ${set === 'nasem' ? 'US and Canada (National Academies)' : 'India (ICMR-NIN, 2020)'}`);
  line();
  const rows = PERSONAS.map((p) => {
    const s = computeTargets({ ...p.profile, referenceSet: set }, TODAY, { safety: NO_SAFETY_FLAGS });
    if (s.mode !== 'personalised') return [p.label, s.mode, '', '', '', '', '', '', '', '', '', s.warnings.map((w) => w.id).join(', ')];
    return [
      p.label,
      s.inputs!.goalApplied === s.inputs!.goal ? s.inputs!.goalApplied : `${s.inputs!.goal} -> ${s.inputs!.goalApplied}`,
      `${n(s.energy!.maintenance)} (${n(s.energy!.low)}-${n(s.energy!.high)}) -> ${range(s, 'calories')}`,
      n(val(s, 'protein')?.value),
      range(s, 'fat'),
      range(s, 'carbs'),
      n(val(s, 'fiber')?.value),
      n(val(s, 'sodium')?.value),
      n(val(s, 'potassium')?.value),
      `${t1(val(s, 'iron')?.value)} (${val(s, 'iron')?.refType ?? ''})`,
      n(val(s, 'calcium')?.value),
      s.warnings.map((w) => w.id).join(', ') || '-',
    ];
  });
  table(['Person', 'Goal applied', 'Energy kcal: steady weight (range) -> target (range)', 'Protein g', 'Fat g (range)', 'Carbs g (range)', 'Fibre g', 'Sodium mg', 'Potassium mg', 'Iron mg', 'Calcium mg', 'Warnings'], rows);
}

// 2. gates
line('## 2. The gates: who gets personal targets (plan 8.1)');
line();
line('A gate puts the profile in reference-only mode: amounts only, no targets, no energy verdict, and nothing stored that says why. The');
line('safety answers are used once and never stored.');
line();
const base: HealthProfileInput = { ...PERSONAS[0]!.profile, referenceSet: 'nasem' };
const gate = (label: string, profile: Partial<HealthProfileInput>, safety: Partial<SafetyAnswers> = {}) => {
  const s = computeTargets({ ...base, ...profile }, TODAY, { safety: { ...NO_SAFETY_FLAGS, ...safety } });
  return [label, s.mode, s.inputs ? (s.inputs.goal === s.inputs.goalApplied ? s.inputs.goalApplied : `${s.inputs.goal} -> ${s.inputs.goalApplied}`) : '-', s.warnings.map((w) => w.id).join(', ') || '-', (s.availableGoals ?? []).join(', ') || '-'];
};
table(
  ['Situation', 'Mode', 'Goal applied', 'Warnings', 'Goals offered'],
  [
    gate('Age 18', { birthYear: 2008 }),
    gate('Pregnant or breastfeeding', {}, { pregnantOrBreastfeeding: true }),
    gate('Eating disorder, now or in the past (also turns low-pressure mode on)', {}, { eatingDisorder: true }),
    gate("A clinician's diet or calorie target", {}, { clinicianDiet: true }),
    gate('A medicine that interacts with food', {}, { dietInteractingMedicine: true }),
    gate('BMI 15.6', { weightKg: 40 }),
    gate('BMI 60.5', { weightKg: 155 }),
    gate('Lose at BMI 23.4 (US set)', { goal: 'lose' }),
    gate('Lose at BMI 23.4 (India set)', { goal: 'lose', referenceSet: 'icmr_nin' }),
    gate('Gain at BMI 26.2', { goal: 'gain', weightKg: 67 }),
    gate('Lose at 70, BMI 27.3', { goal: 'lose', birthYear: 1956, weightKg: 70 }),
    gate('Lose at 70, BMI 31.3', { goal: 'lose', birthYear: 1956, weightKg: 80 }),
    gate('Lose at 82, BMI 31.3', { goal: 'lose', birthYear: 1944, weightKg: 80 }),
  ],
);

// 3. report thresholds
line('## 3. The weekly report\'s edges (plan 5.4, 7.2, 7.3, 7.6, 7.7)');
line();
line('All are design choices [A] unless marked; each sits in one config object and is covered by tests.');
line();
table(
  ['Edge', 'Value'],
  [
    ['A day looks incomplete under', `${REPORT_CONFIG.minValidKcalFloor} kcal, or ${REPORT_CONFIG.minValidShareOfTarget * 100}% of the person's own energy target`],
    ['... or with more than this share of its items unknown', `${Math.round(REPORT_CONFIG.maxPendingItemShare * 100)}%`],
    ['Days needed before anything is judged', REPORT_CONFIG.minDaysForSummary],
    ['Coverage treated as complete / partial', `${REPORT_CONFIG.coverageComplete * 100}% / ${REPORT_CONFIG.coveragePartial * 100}%`],
    ['"On target" from / "a little low" from', `${REPORT_CONFIG.meetsRatio * 100}% / ${REPORT_CONFIG.closeRatio * 100}% of the target`],
    ['"Well above the limit" past', `${REPORT_CONFIG.wellOverRatio}x the limit`],
    ['Energy "near your target"', `within ${REPORT_CONFIG.energyBand * 100}%`],
    ['A day probably mistyped above (female / male / average)', `${n(REPORT_CONFIG.veryHighKcal.female)} / ${n(REPORT_CONFIG.veryHighKcal.male)} / ${n(REPORT_CONFIG.veryHighKcal.average)} kcal`],
    ['Low-intake notice (and no score) from', `${REPORT_CONFIG.lowIntakeDaysToWithhold} days under the sex-specific floor (1,200 kcal women or unknown, 1,500 men)`],
    ['An amount worth a check: one item over', `${n(MAX_ITEM_KCAL)} kcal`],
    ['... or more than', `${Object.entries(MAX_COUNT).map(([u, v]) => `${v} ${u}`).join(', ')}; ${MAX_COUNT_OTHER} of any other unit`],
    ['... or more than (weight, volume)', Object.entries(MAX_METRIC).map(([u, v]) => `${n(v)} ${u}`).join(', ')],
    ['Trends: earlier weeks needed / noise band', `3 weeks with at least ${REPORT_CONFIG.trendMinAssessedDays} counted days / the larger of 10% of their mean and one standard deviation`],
    ['The Nutrient mix score', 'Off in a deployment unless NUTRIENT_SCORE is "1"'],
  ],
);

// 4. tables
line('## 4. The reference tables the engine reads (for re-deriving)');
line();
line('Values are per day. RDA: Recommended Dietary Allowance; AI: Adequate Intake; EAR: Estimated Average Requirement; UL: upper level.');
line('Each table\'s source is in the registry below; the ICMR-NIN values were typed from a secondary copy of the 2020 report and need a check');
line('against the official book.');
line();
line('### National Academies (US and Canada), by age band 19-30, 31-50, 51-70, over 70');
line();
const dri = (v: { ref: number; type: string; ear?: number }) => `${t1(v.ref)} ${v.type}${v.ear !== undefined ? ` (EAR ${t1(v.ear)})` : ''}`;
table(
  ['Nutrient', 'Unit', ...AGE_BANDS.map((b) => `Women ${b}`), ...AGE_BANDS.map((b) => `Men ${b}`), 'UL (scope)', 'Source'],
  MICRO_KEYS.map((k) => {
    const m = NASEM_MICROS[k];
    return [k, m.unit, ...m.female.map(dri), ...m.male.map(dri), m.upper ? `${m.upper.values.map(t1).join(' / ')} (${m.upper.scope})` : '-', m.basis];
  }),
);
line('### ICMR-NIN 2020 (India), by age band 19-59 and 60 and over');
line();
const icmr = (v: { rda: number; type: string; ear?: number }) => `${t1(v.rda)} ${v.type}${v.ear !== undefined ? ` (EAR ${t1(v.ear)})` : ''}`;
table(
  ['Nutrient', 'Unit', ...ICMR_BANDS.map((b) => `Women ${b}`), ...ICMR_BANDS.map((b) => `Men ${b}`), 'UL (scope)'],
  MICRO_KEYS.map((k) => {
    const m = ICMR_MICROS[k];
    return [k, m.unit, ...m.female.map(icmr), ...m.male.map(icmr), m.upper ? `${t1(m.upper.value)} (${m.upper.scope})` : '-'];
  }),
);
line('### Sources');
line();
table(['Id', 'Title', 'Publisher', 'Year', 'Link'], Object.entries(SOURCES).map(([id, s]) => [id, s.title, s.publisher, s.year ?? '', s.url]));

// 5. strings
line('## 5. Every sentence the person can see in these screens');
line();
line('From `app/src/i18n/strings.ts`. `{name}` holes are filled with numbers or words by the app. A test already bans moralising words');
line('("good", "bad", "cheat", "fail" and others), diagnoses, condition names outside the safety question, and any digit in low-pressure mode.');
line();
const flat = (value: unknown, trail: string[] = []): [string, string][] =>
  typeof value === 'string' ? [[trail.join('.'), value]] : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => flat(v, [...trail, k])) : [];
for (const [section, value] of Object.entries(strings)) {
  line(`### ${section}`);
  line();
  table(['Key', 'Text'], flat(value, [section]));
}

// 6. privacy
line('## 6. What is stored, and who can read it (plan 8.3)');
line();
table(
  ['Data', 'Where', 'Needs the profile\'s secret to read', 'Leaves our system'],
  [
    ['Name, time zone, call time, Vapi public key', 'D1 users', 'No (shared token), unless REQUIRE_SECRET', 'Name and local time go to Vapi in the call prompt'],
    ['Food log and day marks', 'D1 log_items, day_status', 'No, unless REQUIRE_SECRET', 'Up to 30 of today\'s items go into the call prompt'],
    ['Call transcripts (emptied after 30 days)', 'D1 calls', 'No, unless REQUIRE_SECRET', 'No'],
    ['Health profile, weigh-ins, target sets', 'D1 health_profiles, weight_entries, target_sets', 'Yes', 'No'],
    ['Care-team numbers', 'D1 user_goals (origin care_team)', 'Yes (hidden and untouchable without it)', 'No'],
    ['The weekly report', 'Computed on request, never stored', 'Yes, for any profile with a secret', 'No'],
    ['Safety-check answers', 'Nowhere (used once)', '-', 'No'],
    ['The secret itself', 'Phone Keychain/Keystore; SHA-256 in D1', '-', 'No'],
  ],
);

const file = resolve(process.cwd(), '../docs/REVIEW_PACKET.md');
writeFileSync(file, `${out.join('\n')}\n`);
console.log(`wrote ${file} (${out.length} lines)`);
