/**
 * The weekly report on screen (WEEKLY_BREAKDOWN_PLAN.md 5, 7.8, 8.2, 11.5, 11.6, 11.10). The reports come from
 * `fixtures/reports.json`, which the Worker's engine writes (`npm run fixtures:app` there, checked by a Worker test), so every
 * screen here is drawn from the shape and the numbers the Worker really sends. Screens are rendered with the navigator, the
 * contexts and the data hook replaced, and driven through their props.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useRangeReport', () => ({ useRangeReport: jest.fn(() => ({ report: null, hidden: false, locked: false, loading: false, error: null, reload: jest.fn() })) }));
jest.mock('@/hooks/useWeeklyReport', () => ({ useWeeklyReport: jest.fn() }));
// The reports are for the week of 5 October; "today" is its Sunday, so this week is the week on screen.
jest.mock('@/hooks/useToday', () => ({ useToday: () => '2026-10-11' }));
jest.mock('@/hooks/useHealthCard', () => ({ useHealthCard: jest.fn(() => ({ visible: false, dismiss: jest.fn() })) }));
jest.mock('@/hooks/useWeightPrompt', () => ({ useWeightPrompt: jest.fn(() => ({ visible: false, dismiss: jest.fn() })) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/api/client', () => ({ api: { addWeight: jest.fn() }, ApiError: class extends Error {}, errorMessage: (e: unknown) => String(e) }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u', name: 'Zoe' } }) }));

import type { Insight, WeeklyReport } from '@/api/types';
import { FEATURES } from '@/config/features';
import { CoverageCard } from '@/components/report/CoverageCard';
import { EnergyCard } from '@/components/report/EnergyCard';
import { IntakeCard, intakeFigure, trendSentence } from '@/components/report/IntakeCard';
import { QualityCard, amountLine, joinNames, sourcesSentence } from '@/components/report/QualityCard';
import { NutrientDetail } from '@/components/report/NutrientDetail';
import { NutrientLine, keepTargetTogether } from '@/components/report/NutrientLine';
import { ScoreBreakdown } from '@/components/report/ScoreBreakdown';
import { ScoreCard, scoreFigure } from '@/components/report/ScoreCard';
import { useRangeReport } from '@/hooks/useRangeReport';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { useHealth } from '@/state/HealthContext';
import { fill, printNumber } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import ReportScreen from '@/screens/ReportScreen';
import WeeklySummaryScreen from '@/screens/WeeklySummaryScreen';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import { insightAction, insightText, weekdayName } from '@/utils/insights';
import {
  assessmentBarTone,
  assessmentLabel,
  assessmentTone,
  fmtNum,
  nutrientSentence,
  referencePhrase,
  tally,
  weekRangeLabel,
} from '@/utils/report';
import metaJson from './fixtures/meta.json';
import reportsJson from './fixtures/reports.json';

const R = reportsJson as unknown as Record<string, WeeklyReport>;
const META = metaJson as unknown as import('@/api/types').Meta;
const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const route = (jest.requireMock('@react-navigation/native') as { useRoute: jest.Mock }).useRoute;

const MORALISING =
  /\b(good|bad|clean|cheat|guilt|guilty|fail|failed|failure|off track|needs attention|streak|perfect|excellent|poor|diagnos\w*|deficient|deficiency|at risk|prescri\w*|cure)\b/i;

// ---- the harness ---------------------------------------------------------------------------------------------------

async function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return tree;
}

/** What a Text says, as a person reads it: a non-breaking space (which keeps "2,600 mg" on one line) reads as a space. */
const textOf = (n: ReactTestInstance) =>
  [n.props.children]
    .flat(Infinity)
    .filter(c => typeof c === 'string' || typeof c === 'number')
    .join('')
    .replace(/\u00A0/g, ' ');
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf);
const all = (tree: TestRenderer.ReactTestRenderer) => texts(tree).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const has = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id).length > 0;
/** The pressable node under a label (a row, a card, a notice action): the one with a role and an onPress. */
const pressableWithText = (tree: TestRenderer.ReactTestRenderer, text: string) =>
  tree.root.findAll(
    (n: ReactTestInstance) =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole !== undefined &&
      n.findAll((c: ReactTestInstance) => (c.type as unknown) === 'Text' && textOf(c) === text).length > 0,
  )[0];
const press = async (tree: TestRenderer.ReactTestRenderer, text: string) => {
  const node = pressableWithText(tree, text);
  if (!node) throw new Error(`nothing to press with the text "${text}"`);
  await act(async () => {
    node.props.onPress();
  });
};
const labelled = (tree: TestRenderer.ReactTestRenderer, label: string) => tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === label && typeof n.type === 'string');

function showing(report: WeeklyReport | null, over: Partial<ReturnType<typeof useWeeklyReport>> = {}) {
  (useWeeklyReport as jest.Mock).mockReturnValue({ report, locked: false, loading: false, refreshing: false, error: null, reload: jest.fn(), ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', targetSet: null, refresh: jest.fn(() => Promise.resolve()) });
  route.mockReturnValue({ params: {} });
  showing(R.ordinary!);
});

const rowOf = (report: WeeklyReport, key: string) => report.nutrients.find(n => n.nutrient === key)!;

// ---- the words ----------------------------------------------------------------------------------------------------

describe('filling a sentence from the numbers the Worker sends', () => {
  it('prints numbers with separators and one decimal at most, and leaves no hole empty-handed', () => {
    expect(fill('{a} kcal, {b} g, {c} g', { a: 2150, b: 11.9, c: '520' })).toBe('2,150 kcal, 11.9 g, 520 g');
    expect(fill('{a}{b}', { a: 'text ' })).toBe('text ');
    expect(fill('x{gone}y', {})).toBe('xy');
    expect(printNumber(1234.56)).toBe('1,235');
    expect(printNumber(9.44)).toBe('9.4');
  });
});

describe('the words of an insight (plan 5.6)', () => {
  const env = { nutrients: META.nutrients, numbersHidden: false };

  it('renders every insight the Worker sent, in every fixture, as a finished sentence', () => {
    const bad: string[] = [];
    for (const [name, report] of Object.entries(R)) {
      for (const i of report.insights) {
        const text = insightText(i, { nutrients: META.nutrients, numbersHidden: report.display.numbersHidden });
        if (!text || /[{}]|undefined|NaN|null/.test(text) || text.trim() !== text || /\s{2,}/.test(text)) bad.push(`${name}/${i.id}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has words for every id the engine can emit, and says nothing for one it does not know', () => {
    const ids: [string, Record<string, number | string>, string?][] = [
      ['low_intake', { n: 4, floor: 1200 }],
      ['underweight', {}],
      ['few_days', { n: 2 }],
      ['incomplete_days', { date: '2026-10-08', kcal: 700, n: 1 }],
      ['pending_items', { n: 6 }],
      ['partial_data', { nutrient: 'vitaminD' }, 'vitaminD'],
      ['implausible_day', { date: '2026-10-06', kcal: 4400 }],
      ['energy_above', { mean: 2500, target: 2150, pct: 16 }],
      ['energy_below', { mean: 1800, target: 2150, pct: 16 }],
      ['energy_near', { k: 4, n: 5 }],
      ['protein_gap', { mean: 40, target: 60 }],
      ['sodium_over', { mean: 3100, limit: 2300, atLeast: 0, sources: 'pickle, papad' }],
      ['fibre_low', { mean: 19, target: 30 }],
      ['potassium_low_sodium_high', { mean: 1900, target: 2600 }],
      ['mineral_gap', { nutrient: 'iron', mean: '11.9', reference: 18 }, 'iron'],
      ['vitamin_window', { nutrient: 'vitaminD', mean: '6.2', reference: 15 }, 'vitaminD'],
      ['weekend_pattern', { pct: 20, direction: 'more' }],
      ['target_met', { nutrient: 'protein' }, 'protein'],
      ['improving', { nutrient: 'protein', from: '48', to: '55' }, 'protein'],
      ['check_amounts', { n: 1, name: 'Rice', quantity: 20, unit: 'katori', date: '2026-10-06' }],
    ];
    for (const [id, params, nutrient] of ids) {
      const text = insightText({ id, priority: 3, params, ...(nutrient ? { nutrient } : {}) }, env);
      expect([id, !!text]).toEqual([id, true]);
      expect([id, /[{}]/.test(text ?? '')]).toEqual([id, false]);
    }
    expect(insightText({ id: 'from_the_future', priority: 3, params: {} }, env)).toBeNull();
  });

  it('says what the plan says, with the numbers in', () => {
    const t = (id: string, params: Record<string, number | string>, nutrient?: string) => insightText({ id, priority: 3, params, ...(nutrient ? { nutrient } : {}) }, env);
    expect(t('few_days', { n: 2 })).toBe('You logged 2 of 7 days. A summary needs at least 3.');
    expect(t('incomplete_days', { date: '2026-10-08', kcal: 700, n: 1 })).toBe('Thursday looks incomplete (about 700 kcal). Is that everything you ate?');
    expect(t('incomplete_days', { date: '2026-10-08', kcal: 700, n: 3 })).toBe('Thursday and 2 other days look incomplete. Is that everything you ate?');
    expect(t('pending_items', { n: 6 })).toBe('6 items are waiting for food values and are not counted.');
    expect(t('pending_items', { n: 1 })).toBe('1 item is waiting for a food value and is not counted.');
    expect(t('implausible_day', { date: '2026-10-06', kcal: 4400 })).toBe("Tuesday's total is about 4,400 kcal. Check the quantities?");
    expect(t('sodium_over', { mean: 3100, limit: 2300, atLeast: 0, sources: 'pickle, papad' })).toBe('Sodium averaged 3,100 mg a day against a limit of 2,300 mg. Most came from pickle, papad.');
    expect(t('sodium_over', { mean: 3100, limit: 2300, atLeast: 1, sources: '' })).toBe('Sodium was at least 3,100 mg a day against a limit of 2,300 mg.');
    expect(t('mineral_gap', { nutrient: 'iron', mean: '11.9', reference: 18 }, 'iron')).toBe('Iron averaged 11.9 mg a day against a reference of 18 mg. Supplements and fortified foods may not be in your log.');
    expect(t('mineral_gap', { nutrient: 'calcium', mean: '520', reference: 1000 }, 'calcium')).toBe('Calcium averaged 520 mg a day against a reference of 1,000 mg.');
    expect(t('vitamin_window', { nutrient: 'vitaminD', mean: '6.2', reference: 15 }, 'vitaminD')).toMatch(/^Over the last four weeks, Vitamin D averaged 6\.2 mcg a day against a reference of 15 mcg\. .* Sunlight and supplements are not counted here\.$/);
    expect(t('energy_below', { mean: 1800, target: 2150, pct: 16 })).toBe('You logged about 1,800 kcal a day, 16% below your target of 2,150. Logs usually run low.');
    expect(t('energy_near', { k: 4, n: 5 })).toBe('You logged within 10% of your target on 4 of 5 days.');
    expect(t('low_intake', { n: 4, floor: 1200 })).toMatch(/^On 4 days you logged under 1,200 kcal\. If that is what you ate, a doctor or dietitian can help you eat enough\./);
    expect(t('check_amounts', { n: 1, name: 'Rice', quantity: 20, unit: 'katori', date: '2026-10-06' })).toBe('20 katori of Rice on Tuesday looks unusual. Is that right?');
    // No more precise than a log can be: an "about" energy figure is to the nearest 10 kcal (plan 7.6).
    expect(t('energy_below', { mean: 1911, target: 2150, pct: 11 })).toBe('You logged about 1,910 kcal a day, 11% below your target of 2,150. Logs usually run low.');
    expect(t('incomplete_days', { date: '2026-10-08', kcal: 694, n: 1 })).toBe('Thursday looks incomplete (about 690 kcal). Is that everything you ate?');
    expect(t('check_amounts', { n: 3, name: 'Rice', quantity: 2.5, unit: 'kg', date: '2026-10-06' })).toBe('2.5 kg of Rice on Tuesday, and 2 other amounts, look unusual. Are they right?');
  });

  it('is worded without a number in low-pressure mode, from the Worker\'s numberless insights', () => {
    const r = R.low_pressure_personal!;
    expect(r.insights.map(i => i.id)).toEqual(['sodium_over', 'fibre_low']);
    const lines = r.insights.map(i => insightText(i, { nutrients: META.nutrients, numbersHidden: true })!);
    expect(lines).toEqual([strings.lowPressure.insights.sodium_over, strings.lowPressure.insights.fibre_low]);
    expect(lines.filter(l => /\d/.test(l))).toEqual([]);
  });

  it('offers the one next step an insight has: Pending, or the nutrient it is about', () => {
    expect(insightAction({ id: 'pending_items', priority: 2, params: { n: 2 } })).toEqual({ label: 'Open Pending', target: 'pending' });
    expect(insightAction({ id: 'sodium_over', priority: 4, nutrient: 'sodium', params: {} })).toEqual({ label: 'See sources', target: 'nutrient', key: 'sodium', window: 'week' });
    expect(insightAction({ id: 'vitamin_window', priority: 4, nutrient: 'vitaminD', params: {} })).toMatchObject({ target: 'nutrient', window: 'four_weeks' });
    expect(insightAction({ id: 'few_days', priority: 2, params: { n: 1 } })).toBeNull();
    expect(insightAction({ id: 'check_amounts', priority: 2, params: { date: '2026-10-06', n: 1 } })).toEqual({ label: 'Open the day', target: 'day', date: '2026-10-06' });
    expect(weekdayName('2026-10-12')).toBe('Monday');
  });
});

describe('words and tones for a nutrient: neutral, never a grade (plan 5.4, 5.8)', () => {
  const label = (assessment: Parameters<typeof assessmentLabel>[0]['assessment'], kind: 'minimum' | 'limit' | 'energy' | 'range' | null = 'minimum', over = {}) =>
    assessmentLabel({ assessment, target: kind ? ({ kind } as never) : null, dataCoverage: 1, mean: 10, ...over });

  it('labels every state, and none of the labels moralises', () => {
    expect(label('meets', 'minimum')).toBe('On target');
    expect(label('meets', 'limit')).toBe('Within the limit');
    expect(label('meets', 'energy')).toBe('Near your target');
    expect(label('close')).toBe('A little low');
    expect(label('below', 'minimum')).toBe('Below target');
    expect(label('below', 'energy')).toBe('Below your target');
    expect(label('over', 'limit')).toBe('Above the limit');
    expect(label('over', 'energy')).toBe('Above your target');
    expect(label('well_over', 'limit')).toBe('Well above the limit');
    expect(label('in_range', 'range')).toBe('In the usual range');
    expect(label('outside', 'range', { target: { kind: 'range', high: 8 }, mean: 10 })).toBe('Above the usual range');
    expect(label('outside', 'range', { target: { kind: 'range', high: 12 }, mean: 10 })).toBe('Below the usual range');
    expect(label('unknown', 'minimum', { dataCoverage: 0.2 })).toBe('Not enough data');
    expect(label('unknown', 'minimum', { dataCoverage: 0.7 })).toBe('Some foods have no value');
    expect(label('amount_only', null)).toBe('Amount only');
    for (const a of ['meets', 'close', 'below', 'over', 'well_over', 'in_range', 'outside', 'unknown', 'amount_only'] as const) {
      expect(label(a, 'minimum')).not.toMatch(MORALISING);
    }
  });

  it('never uses red: danger is kept for data problems and safety ceilings (plan 5.8)', () => {
    expect(Object.values(assessmentTone)).not.toContain('danger');
    for (const a of Object.keys(assessmentTone) as (keyof typeof assessmentTone)[]) expect(assessmentBarTone(a)).not.toBe('danger');
    expect(assessmentTone.meets).toBe('success');
    expect(assessmentTone.below).toBe('warning');
    expect(assessmentTone.unknown).toBe('neutral');
  });

  it('counts only the nutrients that were judged', () => {
    expect(tally([{ assessment: 'meets' }, { assessment: 'below' }, { assessment: 'unknown' }, { assessment: 'amount_only' }, { assessment: 'in_range' }])).toEqual({ judged: 3, onTarget: 2 });
  });

  it('formats numbers short, and labels a week', () => {
    expect(fmtNum(2520, 'mg')).toBe('2,520 mg');
    expect(fmtNum(11.94, 'mg')).toBe('11.9 mg');
    expect(fmtNum(0.4)).toBe('0.4');
    expect(fmtNum(16)).toBe('16');
    expect(weekRangeLabel('2026-10-05')).toBe('Oct 5 – Oct 11');
  });

  it('names what a bar is drawn against: a target, a limit, a reference, a care-team number', () => {
    const p = rowOf(R.ordinary!, 'protein').target!;
    const g = rowOf(R.generic!, 'protein').target!;
    const care = rowOf(R.reference_only!, 'protein').target!;
    expect(referencePhrase(p, 'personalised')).toBe('your target of 60 g');
    expect(referencePhrase(g, 'generic')).toBe('the general reference of 50 g');
    expect(referencePhrase(care, 'reference_only')).toBe('your care-team target of 70 g');
    expect(referencePhrase(rowOf(R.ordinary!, 'sodium').target!, 'personalised')).toBe('the limit of 2,300 mg');
  });

  it('writes one plain sentence for a nutrient over its window', () => {
    const s = (report: WeeklyReport, key: string, name: string, window: 'week' | 'four_weeks' = 'week') =>
      nutrientSentence({ name, report: (window === 'week' ? rowOf(report, key) : report.fourWeek.find(n => n.nutrient === key)!), mode: report.mode, window });
    expect(s(R.ordinary!, 'protein', 'Protein')).toBe('Protein averaged 59 g a day, in line with your target of 60 g.');
    expect(s(R.ordinary!, 'fiber', 'Fiber')).toBe('Fiber averaged 26.5 g a day, a little under your target of 30 g.');
    expect(s(R.ordinary!, 'calcium', 'Calcium')).toBe('Calcium averaged 520 mg a day, below your target of 1,000 mg.');
    expect(s(R.ordinary!, 'sodium', 'Sodium')).toBe('Sodium averaged 2,520 mg a day, above the limit of 2,300 mg.');
    expect(s(R.sodium_high!, 'sodium', 'Sodium')).toBe('Sodium averaged 4,000 mg a day, well above the limit of 2,300 mg.');
    expect(s(R.few_days!, 'protein', 'Protein')).toBe('2 logged days so far. A week needs at least 3 to be compared with a reference.');
    expect(s(R.generic!, 'calories', 'Calories')).toBe(strings.report.sentence.energyReference);
    expect(s(R.ordinary!, 'sugar', 'Sugar')).toBe('Sugar is shown, not judged: no authority sets a reference for it.');
    expect(s(R.ordinary!, 'vitaminD', 'Vitamin D')).toBe('Vitamin D varies a lot from day to day, so it is judged over four weeks, not one.');
    expect(s(R.vitamins!, 'vitaminD', 'Vitamin D', 'four_weeks')).toBe('Vitamin D averaged 3.2 mcg a day, below your target of 15 mcg.');
    expect(s(R.vitamins!, 'vitaminA', 'Vitamin A', 'four_weeks')).toBe('Vitamin A averaged 610 mcg a day, a little under your target of 700 mcg.');
    expect(s(R.vitamins!, 'vitaminC', 'Vitamin C', 'four_weeks')).toBe('Vitamin C averaged 90 mg a day, in line with your target of 75 mg.');
    expect(s(R.ordinary!, 'vitaminD', 'Vitamin D', 'four_weeks')).toBe('No logged day has a vitamin d value, so there is no figure for it.');
  });

  it('reads a vitamin in the week as an amount, because four weeks judge it', () => {
    expect(rowOf(R.ordinary!, 'vitaminD').assessment).toBe('amount_only');
    expect(nutrientSentence({ name: 'Vitamin D', report: rowOf(R.ordinary!, 'vitaminD'), mode: 'personalised', window: 'four_weeks' })).toBe(
      'Vitamin D varies a lot from day to day, so it is judged over four weeks, not one.',
    );
  });
});

// ---- the parts ----------------------------------------------------------------------------------------------------

describe('a nutrient row', () => {
  const row = (report: WeeklyReport, key: string, over: Partial<React.ComponentProps<typeof NutrientLine>> = {}) => {
    const info = META.nutrients.find(n => n.key === key)!;
    return render(
      <NutrientLine report={rowOf(report, key)} name={info.label} unit={info.unit} mode={report.mode} judged={report.coverage.confidence !== 'insufficient'} {...over} />,
    );
  };

  it('shows the average against its target, a neutral label, the share and the days it was met', async () => {
    const tree = await row(R.ordinary!, 'protein');
    const t = all(tree);
    expect(t).toContain('Protein');
    expect(t).toContain('On target');
    expect(t).toContain('59 g');
    expect(t).toContain('a day · target 60 g');
    expect(t).toContain('98% · 7 of 7 days');
  });

  it('reads a limit as a limit: above it is described, and the days within it are counted', async () => {
    const t = all(await row(R.ordinary!, 'sodium'));
    expect(t).toContain('Above the limit');
    expect(t).toContain('2,520 mg');
    expect(t).toContain('limit 2,300 mg');
    expect(t).toContain('within it on 0 of 7 days');
    expect(all(await row(R.sodium_high!, 'sodium'))).toContain('Well above the limit');
  });

  it('says "a little low" and "below target" in neutral words', async () => {
    expect(all(await row(R.ordinary!, 'fiber'))).toContain('A little low');
    expect(all(await row(R.ordinary!, 'calcium'))).toContain('Below target');
  });

  it('with too few days draws no verdict: the amount, "Logged so far", and no badge', async () => {
    const t = all(await row(R.few_days!, 'protein'));
    expect(t).toContain('Logged so far');
    expect(t).not.toMatch(/On target|Below target|A little low|Not enough data/);
    expect(t).toContain('59 g');
  });

  it('draws a total some foods have no value for as "at least", and says why', async () => {
    const r = R.thin_data!;
    const partial = r.nutrients.find(n => n.isLowerBound && n.meanPerAssessedDay !== null && n.assessment !== 'unknown');
    const unknown = r.nutrients.find(n => n.assessment === 'unknown' && n.assessedDays > 0 && n.target);
    expect(unknown).toBeDefined();
    const t = all(await row(r, unknown!.nutrient));
    expect(t).toMatch(/Not enough data|Some foods have no value/);
    if (partial) expect(all(await row(r, partial.nutrient))).toContain('at least');
  });

  it('shows total sugars as an amount with the reason there is no verdict, and no bar', async () => {
    const tree = await row(R.ordinary!, 'sugar', { note: strings.report.groups.sugarNote });
    const t = all(tree);
    expect(t).toContain('no reference');
    expect(t).toContain('Total sugars include the sugars in fruit and milk');
    expect(t).not.toMatch(/Amount only|%/);
  });

  it('switches to percentages, and is a button only when it has somewhere to go', async () => {
    const tree = await row(R.ordinary!, 'protein', { valueMode: 'percent' });
    expect(all(tree)).toContain('98%');
    expect(labelled(tree, 'Protein, 98% a day, On target')).toHaveLength(1);
    const onPress = jest.fn();
    const pressed = await row(R.ordinary!, 'protein', { onPress });
    await act(async () => {
      pressed.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'button')[0]!.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });
});

describe('the coverage card (plan 5.2, 7.6)', () => {
  const card = (report: WeeklyReport | undefined, over: Partial<React.ComponentProps<typeof CoverageCard>> = {}) =>
    render(<CoverageCard weekIdx={0} start="2026-10-05" onPrevWeek={jest.fn()} onNextWeek={jest.fn()} report={report} {...over} />);

  it('says how many days count and how sure the week is, over seven marks, each with its own words', async () => {
    const tree = await card(R.ordinary!);
    expect(byId(tree, 'week-basis')[0]!.props.children).toBe('Based on 7 of 7 days');
    expect(all(tree)).toContain('Solid');
    expect(all(tree)).toContain('Oct 5 – Oct 11');
    expect(labelled(tree, 'How sure: Solid')).toHaveLength(1);
    const days = tree.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && /^\w+day, October \d+, /.test(n.props.accessibilityLabel));
    expect(days).toHaveLength(7);
    expect(days[0]!.props.accessibilityLabel).toBe('Monday, October 5, logged');
  });

  it('says "not enough data" for a week with fewer than three days, and marks today as in progress', async () => {
    const tree = await card(R.few_days!);
    expect(byId(tree, 'week-basis')[0]!.props.children).toBe('Based on 2 of 7 days');
    expect(all(tree)).toContain('Not enough data');
    expect(labelled(tree, 'Wednesday, October 7, today, not counted until it is over')).toHaveLength(1);
    expect(labelled(tree, 'Thursday, October 8, not yet')).toHaveLength(1);
  });

  it('marks a day that is not counted for lack of data by words as well as shape, without asking whether it is complete', async () => {
    const t = await card(R.crash_diet!);
    expect(labelled(t, 'Monday, October 5, not counted, too little to go on')).toHaveLength(1);
    expect(all(t)).not.toMatch(/incomplete/i);
  });

  it('tells this week from last week, and cannot go past this one', async () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const now = await card(undefined, { weekIdx: 0, onPrevWeek: onPrev, onNextWeek: onNext });
    expect(all(now)).toContain('This week');
    const buttons = now.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'button' && typeof n.type !== 'string');
    expect([...new Set(buttons.map(b => b.props.accessibilityLabel))]).toEqual(['Previous week', 'Next week']);
    expect(buttons.filter(b => b.props.accessibilityLabel === 'Next week').some(b => b.props.disabled === true)).toBe(true);
    expect(buttons.filter(b => b.props.accessibilityLabel === 'Previous week').some(b => b.props.disabled === true)).toBe(false);
    const last = await card(undefined, { weekIdx: -1, start: '2026-09-28' });
    expect(all(last)).toContain('Last week');
    expect(all(last)).toContain('Sep 28 – Oct 4');
    expect(all(await card(undefined, { weekIdx: -3, start: '2026-09-14' }))).toContain('3 weeks ago');
  });

  it('offers Pending when items are waiting, and counts them', async () => {
    const onOpenPending = jest.fn();
    const tree = await card(R.pending!, { onOpenPending });
    expect(all(tree)).toContain('14 items are waiting for food values and are not counted.');
    await press(tree, 'Open Pending');
    expect(onOpenPending).toHaveBeenCalledTimes(1);
  });

  it('counts nothing in low-pressure mode: "the days you logged", with no digit in the words', async () => {
    const tree = await card(R.low_pressure!);
    expect(byId(tree, 'week-basis')[0]!.props.children).toBe('Based on the days you logged.');
    const words = texts(tree).filter(t => t !== weekRangeLabel('2026-10-05'));
    expect(words.filter(t => /\d/.test(t))).toEqual([]);
  });
});

describe('the energy card (plan 5.2)', () => {
  it('shows what was logged against the person\'s own target, as a range, with the day-by-day bars', async () => {
    const r = R.ordinary!;
    const tree = await render(<EnergyCard energy={r.energy!} days={r.coverage.days} careTeam={false} />);
    const t = all(tree);
    expect(t).toContain('about 2,150 kcal (1,910 to 2,390)');
    expect(t).toContain('You logged about 1,800 kcal a day');
    expect(t).toContain('Within 10% of 2,150 on 0 of 7 days');
    expect(t).toContain('Logs usually run low; your weight is the better guide.');
    expect(t).toContain('Daily target');
    // one text summary for the whole chart, for the screen reader
    expect(labelled(tree, 'Energy: Monday 1800 kcal, Tuesday 1800 kcal, Wednesday 1800 kcal, Thursday 1800 kcal, Friday 1800 kcal, Saturday 1800 kcal, Sunday 1800 kcal. Energy by day against the target of 2,150 kcal')).toHaveLength(1);
  });

  it('shows a number from a care team as it was given: no range, no "logs run low"', async () => {
    const r = R.reference_only!;
    const tree = await render(<EnergyCard energy={r.energy!} days={r.coverage.days} careTeam />);
    const t = all(tree);
    expect(t).toContain('1,800 kcal');
    expect(t).not.toMatch(/\(|weight is the better guide/);
    expect(t).toContain('The target is the number your care team gave you.');
    expect(t).toContain('Within 10% of 1,800 on 7 of 7 days');
  });
});

describe('the Nutrient mix (plan 5.5)', () => {
  it('shows "about 90" for an ordinary week, never a grade, with the trend in words', async () => {
    const tree = await render(<ScoreCard report={R.ordinary!} onOpen={jest.fn()} />);
    expect(byId(tree, 'score-figure')[0]!.props.children).toBe('about 90');
    const t = all(tree);
    expect(t).toContain('Nutrient mix');
    expect(t).toContain('Based on 7 of 7 days');
    expect(t).toContain('About the same as your last four weeks');
    expect(texts(tree).filter(x => /^[A-F][+-]?$/.test(x))).toEqual([]);
    expect(byId(tree, 'score-disclaimer')[0]!.props.children).toBe('A summary of the foods you logged against reference intakes. It is not a measure of your health.');
    expect(labelled(tree, 'Last eight weeks: no data, no data, no data, no data, 83.5, 88, 92.5, 90')).toHaveLength(1);
  });

  it('shows the card\'s figure the way the plan words it: nearest five, "at least" when a part is unknown', () => {
    expect(scoreFigure({ ...R.ordinary!.score, shown: 90, isMinimum: false })).toBe('about 90');
    expect(scoreFigure({ ...R.ordinary!.score, shown: 80, isMinimum: true })).toBe('at least 80');
    expect(scoreFigure({ ...R.few_days!.score })).toBeNull();
    expect(scoreFigure(R.sodium_high!.score)).toBe('about 80');
  });

  it('says why there is none, instead of a figure, whenever it is withheld', async () => {
    const reasons: Record<string, string> = {
      few_days: 'Not enough days to give a score yet.',
      crash_diet_confirmed: 'No score is shown next to a very low logged intake.',
      thin_data: 'Not enough nutrient data to score. It fills in as the foods you eat most get their values.',
      pending: 'No score yet: some foods are still unknown. Open Pending to sort that out.',
    };
    for (const [name, reason] of Object.entries(reasons)) {
      const tree = await render(<ScoreCard report={R[name]!} onOpen={jest.fn()} />);
      expect([name, has(tree, 'score-figure')]).toEqual([name, false]);
      expect([name, byId(tree, 'score-withheld')[0]!.props.children]).toEqual([name, reason]);
    }
  });

  it('opens its parts: the exact value, the points of each, and the standard each was measured against', async () => {
    const r = R.sodium_high!;
    const tree = await render(<ScoreBreakdown report={r} visible onClose={jest.fn()} />);
    const t = all(tree);
    expect(t).toContain('about 80');
    expect(t).toContain('Exactly 77.9 out of 100');
    expect(t).toContain('What it is made of');
    for (const name of ['Protein', 'Fibre', 'Potassium', 'Calcium', 'Iron', 'Magnesium', 'Zinc', 'Sodium']) expect(t).toContain(name);
    expect(t).toContain('0 of 10'); // sodium at 4,000 mg earns nothing
    expect(t).toContain('Sodium: full credit at 1,100 mg per 1,000 kcal or less');
    expect(t).toContain('It does not measure how much you ate');
    expect(t).toContain('A summary of the foods you logged against reference intakes. It is not a measure of your health.');
    expect(t).toContain(strings.disclaimer.footer);
  });

  it('shows what leaving out any one day would do, with four logged days', async () => {
    const tree = await render(<ScoreBreakdown report={R.four_days!} visible onClose={jest.fn()} />);
    expect(all(tree)).toContain('Leaving out any one day, it would be between 90 and 90.');
    expect(all(await render(<ScoreBreakdown report={R.ordinary!} visible onClose={jest.fn()} />))).not.toContain('Leaving out any one day');
  });

  it('names a part with too little data as such, and says the figure is a minimum', async () => {
    const r = R.thin_data!;
    expect(r.score.components.some(c => !c.scorable)).toBe(true);
    const t = all(await render(<ScoreBreakdown report={r} visible onClose={jest.fn()} />));
    expect(t).toContain('Not enough data');
    expect(t).toContain('foods with a value cover');
    expect(t).toContain('Not enough nutrient data to score.');
  });
});

describe('what was logged per day, before any judgement (plan 5.2, 7.6)', () => {
  it('shows energy and the macronutrients over the days that count, and how they compare with earlier weeks', async () => {
    const tree = await render(<IntakeCard report={R.ordinary!} nutrients={META.nutrients} />);
    expect(byId(tree, 'intake-basis')[0]!.props.children).toBe('Average of the 7 days that count');
    expect(labelled(tree, 'Calories, 1,800 kcal')).toHaveLength(1);
    expect(labelled(tree, 'Protein, 59 g')).toHaveLength(1);
    // The ordinary week's foods carry no carbohydrate or fat values: it says so instead of showing zero.
    expect(labelled(tree, 'Carbs, Not enough data')).toHaveLength(1);
    expect(byId(tree, 'intake-trend')[0]!.props.children).toBe('Compared with your last 3 weeks: calories about the same, protein about the same.');
    expect(all(tree)).toContain('Logged amounts usually run a little low.');
  });

  it('reads "at least" on partial data, gives the share of energy, and rounds no finer than a log can be', async () => {
    const r = R.ordinary!;
    const report = {
      ...r,
      nutrients: r.nutrients.map(n =>
        n.nutrient === 'fat'
          ? { ...n, meanPerAssessedDay: 61.6, isLowerBound: false, shareOfEnergy: 0.308 }
          : n.nutrient === 'protein'
            ? { ...n, meanPerAssessedDay: 52.4, isLowerBound: true, trend: { direction: 'higher' as const, previousMean: 45, weeks: 4 } }
            : n,
      ),
    };
    const tree = await render(<IntakeCard report={report} nutrients={META.nutrients} />);
    expect(labelled(tree, 'Fat, 62 g, 31% of energy')).toHaveLength(1);
    expect(labelled(tree, 'Protein, at least 52 g')).toHaveLength(1);
    expect(intakeFigure(1847, 'kcal')).toBe('1,850 kcal');
    expect(intakeFigure(8.44, 'g')).toBe('8.4 g');
    expect(trendSentence(report.nutrients.filter(n => ['calories', 'protein'].includes(n.nutrient)), META.nutrients)).toBe('Compared with earlier weeks: calories about the same, protein higher.');
  });

  it('says "logged so far" with no comparison in a week that cannot be summarised yet', async () => {
    const tree = await render(<IntakeCard report={R.few_days!} nutrients={META.nutrients} />);
    expect(byId(tree, 'intake-basis')[0]!.props.children).toBe('Logged so far, per day that counts');
    expect(has(tree, 'intake-trend')).toBe(false);
  });

  it('promises comparisons once there are earlier weeks, and is absent with numbers hidden', async () => {
    const tree = await render(<IntakeCard report={R.generic!} nutrients={META.nutrients} />);
    expect(byId(tree, 'intake-trend')[0]!.props.children).toBe('Comparisons with earlier weeks appear after three weeks with at least three counted days each.');
    expect((await render(<IntakeCard report={R.low_pressure!} nutrients={META.nutrients} />)).toJSON()).toBeNull();
  });
});

describe('what is missing or uncertain (plan 7.4, 7.7, 7.8)', () => {
  it('names the foods without values, the amounts worth a check and where the numbers come from, each with its fix', async () => {
    const r = R.check_amounts!;
    const onOpenGaps = jest.fn();
    const onOpenDay = jest.fn();
    const tree = await render(<QualityCard quality={r.quality!} assessedDays={r.coverage.assessedDays} nutrients={META.nutrients} onOpenGaps={onOpenGaps} onOpenDay={onOpenDay} />);
    expect(byId(tree, 'quality-missing')[0]!.props.children).toBe('Missing most often: saturated fat, added sugars, fiber.');
    const t = all(tree);
    expect(byId(tree, 'quality-gaps')[0]!.props.children).toBe('5 foods behind this week are missing values this report uses: 100% of what you logged.');
    expect(t).toContain('The largest: meal 4, meal 2, Rice.');
    expect(byId(tree, 'quality-sources')[0]!.props.children).toBe('Where the numbers come from: pack labels 83%, guesses 17%.');
    expect(t).toContain("A guess or an unrecorded source makes every figure rougher.");
    expect(t).toContain('20 katori of Rice, Tuesday');
    expect(t).toContain('about 2,600 kcal in one item');
    await press(tree, 'Fill in values');
    expect(onOpenGaps).toHaveBeenCalled();
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'quality-amount-2026-10-06' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-06');
  });

  it('says plainly when nothing is missing, and words each kind of unusual amount', () => {
    expect(sourcesSentence({ label: 0, database: 0, recipe: 0, estimate: 0, none: 0 })).toBeNull();
    expect(amountLine({ date: '2026-10-08', name: 'Kheer', quantity: 12, unit: 'katori', kcal: null, reason: 'many_servings' })).toEqual({ title: '12 katori of Kheer, Thursday', why: 'more helpings than usual' });
    expect(amountLine({ date: '2026-10-08', name: 'Biryani', quantity: 2, unit: 'kg', kcal: null, reason: 'large_weight' }).why).toBe('a lot for one item');
    expect(joinNames(['Idli', 'Tea'])).toBe('Idli, Tea');
    expect(keepTargetTogether('a day · target 2,600 mg')).toBe('a day · target\u00A02,600\u00A0mg');
    expect(keepTargetTogether('a day · usual range 20% to 35%')).toBe('a day · usual range 20% to 35%');
    expect(keepTargetTogether('a day · no reference')).toBe('a day · no reference');
    expect(joinNames(['Roti', 'Dal, rice and sabzi', 'Tea'])).toBe('Roti; Dal, rice and sabzi; Tea');
  });

  it('is not shown for a week with nothing counted and nothing to check', async () => {
    const r = R.few_days!;
    const empty = { foodsWithGaps: { count: 0, energyShare: 0, names: [], missing: [] }, valueSources: { label: 0, database: 0, recipe: 0, estimate: 0, none: 0 }, amountsToCheck: [] };
    expect((await render(<QualityCard quality={empty} assessedDays={0} nutrients={META.nutrients} onOpenGaps={jest.fn()} onOpenDay={jest.fn()} />)).toJSON()).toBeNull();
    expect(r.quality).not.toBeNull();
  });
});

// ---- the screens --------------------------------------------------------------------------------------------------

describe('the Report tab', () => {
  it('puts what is useful first: the days, what was logged, what stood out; what is missing after the rows; the score last', async () => {
    const tree = await render(<ReportScreen />);
    const order = tree.root
      .findAll((n: ReactTestInstance) => typeof n.type === 'string' && typeof n.props.testID === 'string')
      .map(n => n.props.testID as string);
    const at = (id: string) => order.findIndex(x => x === id || x.startsWith(id));
    expect(at('week-basis')).toBeLessThan(at('intake-card'));
    expect(at('intake-card')).toBeLessThan(at('insight-'));
    expect(at('insight-')).toBeLessThan(at('energy-card'));
    expect(at('four-week-card')).toBeLessThan(at('quality-card'));
    expect(at('quality-card')).toBeLessThan(at('score-card'));
  });

  it('shows no Nutrient mix at all where the deployment switches it off, and everything else as before', async () => {
    showing(R.score_off!);
    const tree = await render(<ReportScreen />);
    expect(has(tree, 'score-card')).toBe(false);
    expect(all(tree)).not.toContain('Nutrient mix');
    for (const id of ['intake-card', 'energy-card', 'four-week-card', 'quality-card']) expect([id, has(tree, id)]).toEqual([id, true]);
  });

  it('opens the day an unusual amount was logged on, from the insight and from the card', async () => {
    showing(R.check_amounts!);
    const tree = await render(<ReportScreen />);
    expect(all(tree)).toContain('20 katori of Rice on Tuesday looks unusual. Is that right?');
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'quality-amount-2026-10-06' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('Main', { screen: 'Today', params: { date: '2026-10-06' } });
  });

  it('lays out an ordinary week: coverage, what stood out, energy, the leading rows, the four-week vitamins, the mix', async () => {
    const tree = await render(<ReportScreen />);
    const t = all(tree);
    expect(t).toContain('This week · Oct 5 – Oct 11');
    expect(byId(tree, 'week-basis')[0]!.props.children).toBe('Based on 7 of 7 days');
    expect(t).toContain('What stood out');
    expect(['energy_below', 'mineral_gap'].every(id => has(tree, `insight-${id}`))).toBe(true);
    expect(byId(tree, 'insight-mineral_gap').length).toBeGreaterThanOrEqual(2);
    expect(has(tree, 'energy-card')).toBe(true);
    expect(t).toContain('Get enough');
    expect(t).toContain('Keep in check');
    expect(t).toContain('Amounts only');
    for (const name of ['Protein', 'Fiber', 'Potassium', 'Calcium', 'Iron', 'Sodium', 'Sugar']) expect(t).toContain(name);
    expect(has(tree, 'four-week-card')).toBe(true);
    expect(t).toContain('Vitamins over four weeks');
    expect(byId(tree, 'score-figure')[0]!.props.children).toBe('about 90');
    expect(t).toContain('All nutrients');
    expect(t).toContain('Your targets');
    expect(t).toContain(strings.disclaimer.footer);
  });

  it('keeps the priorities straight: at most three insights, safety and data first', async () => {
    showing(R.crash_diet!);
    const tree = await render(<ReportScreen />);
    const ids = tree.root.findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && n.props.testID.startsWith('insight-') && typeof n.type !== 'string').map(n => n.props.testID);
    // "…looks incomplete. Is that everything you ate?" asks the person to say whether a day is complete: not offered while day marking is off.
    expect([...new Set(ids)]).toEqual(['insight-low_intake', 'insight-few_days']);
    expect(all(tree)).toContain('On 7 days you logged under 1,200 kcal.');
    expect(all(tree)).not.toMatch(/looks incomplete|everything you ate/i);
    expect(has(tree, 'score-figure')).toBe(false);
  });

  it('offers the "looks incomplete" insight again when day marking is switched back on', async () => {
    const was = FEATURES.dayCompletion;
    FEATURES.dayCompletion = true;
    try {
      showing(R.crash_diet!);
      const tree = await render(<ReportScreen />);
      const ids = tree.root.findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && n.props.testID.startsWith('insight-') && typeof n.type !== 'string').map(n => n.props.testID);
      expect([...new Set(ids)]).toEqual(['insight-low_intake', 'insight-incomplete_days', 'insight-few_days']);
    } finally {
      FEATURES.dayCompletion = was;
    }
  });

  it('with fewer than three days: the prompt, "logged so far", no verdicts, no score figure', async () => {
    showing(R.few_days!);
    const tree = await render(<ReportScreen />);
    const t = all(tree);
    expect(t).toContain('You logged 2 of 7 days. A summary needs at least 3.');
    expect(t).toContain('Logged so far');
    expect(t).not.toMatch(/On target|Below target|A little low|Above the limit|Within the limit/);
    expect(byId(tree, 'score-withheld')[0]!.props.children).toBe('Not enough days to give a score yet.');
  });

  it('compares with the general reference when there is no health profile, and offers no score or energy verdict', async () => {
    showing(R.generic!);
    const tree = await render(<ReportScreen />);
    expect(byId(tree, 'reference-note')[0]!.props.children).toBe(strings.disclaimer.referenceLong);
    expect(has(tree, 'energy-card')).toBe(false);
    expect(has(tree, 'score-card')).toBe(false);
    const t = all(tree);
    expect(t).toContain('reference 50 g');
    expect(t).toContain('Daily targets');
    expect(t).not.toContain('Your targets');
  });

  it('with no personal targets: amounts only, bars only against a care team\'s numbers', async () => {
    showing(R.reference_only!);
    const tree = await render(<ReportScreen />);
    const t = all(tree);
    expect(t).toContain('No personal targets, so these are amounts only.');
    expect(t).toContain('Bars are drawn against the numbers you typed from your care team.');
    expect(t).toContain('care-team target 70 g');
    expect(has(tree, 'score-card')).toBe(false);
    expect(has(tree, 'energy-card')).toBe(true);
    expect(t).not.toContain('Logs usually run low');
  });

  it('in low-pressure mode shows no number: no energy, no amounts, no score, and insights without digits', async () => {
    showing(R.low_pressure_personal!);
    const tree = await render(<ReportScreen />);
    const t = all(tree);
    expect(t).toContain('Sodium was above the usual limit this week.');
    expect(t).toContain('Fibre was on the low side this week.');
    expect(has(tree, 'energy-card')).toBe(false);
    expect(has(tree, 'score-card')).toBe(false);
    expect(has(tree, 'four-week-card')).toBe(false);
    expect(t).not.toMatch(/Get enough|Keep in check|Amounts only|All nutrients|Your targets/);
    expect(t).toContain(strings.disclaimer.howWeCalculate);
    // nothing with a digit but the dates
    const words = texts(tree).filter(x => x !== weekRangeLabel('2026-10-05') && !x.startsWith('This week ·'));
    expect(words.filter(x => /\d/.test(x))).toEqual([]);
  });

  it('with nothing to say in low-pressure mode, says that in words', async () => {
    showing({ ...R.low_pressure!, insights: [] });
    expect(byId(await render(<ReportScreen />), 'nothing-stood-out')[0]!.props.children).toBe(strings.lowPressure.nothing);
  });

  it('when a week has nothing that stood out, says so', async () => {
    showing({ ...R.ordinary!, insights: [] });
    expect(byId(await render(<ReportScreen />), 'nothing-stood-out')[0]!.props.children).toBe('Nothing stood out this week.');
  });

  it('shows a locked state with a way forward when this phone does not hold the secret', async () => {
    showing(null, { locked: true });
    const tree = await render(<ReportScreen />);
    expect(has(tree, 'report-locked')).toBe(true);
    expect(all(tree)).toContain(strings.report.locked);
    await press(tree, 'Log in again');
    expect(nav.navigate).toHaveBeenCalledWith('Reauthenticate');
  });

  it('shows loading and errors without a report', async () => {
    showing(null, { loading: true });
    expect(all(await render(<ReportScreen />))).toContain('Loading your week…');
    showing(null, { error: 'Request failed' });
    expect(all(await render(<ReportScreen />))).toContain('Request failed');
  });

  it('opens what a person taps: a row, an insight\'s next step, Pending, All nutrients and the targets', async () => {
    const tree = await render(<ReportScreen />);
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel?.startsWith('Protein, 59 g a day') && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('Nutrient', { key: 'protein', start: '2026-10-05', window: 'week' });
    await press(tree, 'All nutrients');
    expect(nav.navigate).toHaveBeenCalledWith('WeeklySummary', { start: '2026-10-05' });
    await press(tree, 'Your targets');
    expect(nav.navigate).toHaveBeenCalledWith('Targets');
    showing(R.pending!);
    const pend = await render(<ReportScreen />);
    await press(pend, 'Open Pending');
    expect(nav.navigate).toHaveBeenCalledWith('Main', { screen: 'Uncached' });
  });

  it('steps between weeks, and asks the Worker for the week it is on', async () => {
    const tree = await render(<ReportScreen />);
    expect((useWeeklyReport as jest.Mock).mock.calls.at(-1)![0]).toBe('2026-10-05');
    const prev = tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Previous week' && typeof n.props.onPress === 'function')[0]!;
    await act(async () => {
      prev.props.onPress();
    });
    expect((useWeeklyReport as jest.Mock).mock.calls.at(-1)![0]).toBe('2026-09-28');
    expect(all(tree)).toContain('Last week · Sep 28 – Oct 4');
  });
});

describe('All nutrients (plan 5.2)', () => {
  it('groups every nutrient: energy and macros, get enough, keep in check, vitamins', async () => {
    const tree = await render(<WeeklySummaryScreen />);
    const t = all(tree);
    for (const g of ['Energy and macros', 'Get enough', 'Keep in check', 'Vitamins and minerals']) expect(t).toContain(g);
    expect(t).toContain('21 nutrients');
    expect(t).toContain('Vitamin D');
    expect(t).toContain(strings.disclaimer.footer);
  });

  it('judges a vitamin over four weeks, and a mineral over the week', async () => {
    const t = all(await render(<WeeklySummaryScreen />));
    const four = R.ordinary!.fourWeek.find(n => n.nutrient === 'vitaminC')!;
    expect(four.assessedDays).toBeGreaterThan(7);
    expect(t).toMatch(/Vitamin C/);
  });

  it('searches by name and filters by how a nutrient reads', async () => {
    const tree = await render(<WeeklySummaryScreen />);
    const search = tree.root.findAll((n: ReactTestInstance) => typeof n.props.onChangeText === 'function')[0]!;
    await act(async () => {
      search.props.onChangeText('vitamin');
    });
    expect(all(tree)).toContain('6 nutrients'); // vitamins A, C, D, E, K and B12
    await act(async () => {
      search.props.onChangeText('zzz');
    });
    expect(all(tree)).toContain('No matches');
    await act(async () => {
      search.props.onChangeText('');
    });
    await press(tree, 'Worth a look');
    const t = all(tree);
    expect(t).toContain('Calcium');
    expect(t).not.toContain('Protein');
  });

  it('switches between amounts and percentages', async () => {
    const tree = await render(<WeeklySummaryScreen />);
    const toggle = tree.root.findAll((n: ReactTestInstance) => typeof n.props.onChange === 'function' && Array.isArray(n.props.options))[0]!;
    await act(async () => {
      toggle.props.onChange('percent');
    });
    expect(all(tree)).toContain('98%');
  });

  it('opens a nutrient on its own screen, for the week and window it was drawn from', async () => {
    const tree = await render(<WeeklySummaryScreen />);
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel?.startsWith('Vitamin D,') && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('Nutrient', { key: 'vitaminD', start: '2026-10-05', window: 'four_weeks' });
  });

  it('opens on the week it was reached from', async () => {
    route.mockReturnValue({ params: { start: '2026-09-28' } });
    await render(<WeeklySummaryScreen />);
    expect((useWeeklyReport as jest.Mock).mock.calls.at(-1)![0]).toBe('2026-09-28');
  });

  it('in low-pressure mode shows no list at all', async () => {
    showing(R.low_pressure!);
    const tree = await render(<WeeklySummaryScreen />);
    const t = all(tree);
    expect(t).toContain(strings.lowPressure.reportBody);
    expect(t).not.toMatch(/Protein|Sodium/);
  });

  it('says it is locked, with a way forward, when the secret is missing', async () => {
    showing(null, { locked: true });
    const tree = await render(<WeeklySummaryScreen />);
    await press(tree, 'Log in again');
    expect(nav.navigate).toHaveBeenCalledWith('Reauthenticate');
  });
});

describe('the four-week vitamins (plan 4.6, 5.2)', () => {
  it('are judged over the window on the Report tab: amounts the week cannot judge, verdicts the four weeks can', async () => {
    showing(R.vitamins!);
    const tree = await render(<ReportScreen />);
    const card = byId(tree, 'four-week-card')[0]!;
    const t = texts({ root: card } as unknown as TestRenderer.ReactTestRenderer).join('\n');
    for (const name of ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Vitamin B12', 'Folate']) expect(t).toContain(name);
    expect(t).toContain('A little low'); // A at 87% of its reference
    expect(t).toContain('On target'); // C and K
    expect(t).toContain('Below target'); // D and E
    expect(t).toContain('Last four weeks');
    expect(t).toContain('These vary a lot from day to day, so they are judged over four weeks, not one.');
    expect(all(tree)).toContain('Over the last four weeks, Vitamin D averaged 3.2 mcg a day against a reference of 15 mcg.');
    expect(all(tree)).toContain('Sunlight and supplements are not counted here.');
  });

  it('open their own detail, for the four-week window, from the insight that names them', async () => {
    showing(R.vitamins!);
    const tree = await render(<ReportScreen />);
    await press(tree, 'See the four-week view');
    expect(nav.navigate).toHaveBeenCalledWith('Nutrient', { key: 'vitaminD', start: '2026-10-05', window: 'four_weeks' });
  });

  it('say "not enough data" when the foods have no vitamin values, instead of a low reading', async () => {
    const tree = await render(<ReportScreen />);
    const card = byId(tree, 'four-week-card')[0]!;
    const t = texts({ root: card } as unknown as TestRenderer.ReactTestRenderer).join('\n');
    expect(t).toContain('Not enough data');
    expect(t).not.toMatch(/Below target|A little low/);
    expect(t).toContain('No figure');
  });
});

describe('one nutrient (plan 5.2)', () => {
  it('compares the week with earlier ones when there are enough of them, in words, with what they averaged', async () => {
    const r = R.ordinary!;
    const protein = rowOf(r, 'protein');
    expect(protein.trend).toMatchObject({ direction: 'about_the_same', weeks: 3 });
    const tree = await render(<NutrientDetail report={protein} name="Protein" unit="g" mode={r.mode} window="week" onSetGoal={jest.fn()} onHowWeCalculate={jest.fn()} onBack={jest.fn()} />);
    expect(all(tree)).toContain('About the same as your last 3 weeks (59 g a day).');
    const higher = { ...protein, trend: { direction: 'higher' as const, previousMean: 48.25, weeks: 4 } };
    expect(all(await render(<NutrientDetail report={higher} name="Protein" unit="g" mode={r.mode} window="week" onSetGoal={jest.fn()} onHowWeCalculate={jest.fn()} onBack={jest.fn()} />))).toContain('Higher than your last 4 weeks, which averaged 48.3 g a day.');
    const none = { ...protein, trend: null };
    expect(has(await render(<NutrientDetail report={none} name="Protein" unit="g" mode={r.mode} window="week" onSetGoal={jest.fn()} onHowWeCalculate={jest.fn()} onBack={jest.fn()} />), 'detail-trend')).toBe(false);
  });

  const detail = (report: WeeklyReport, key: string, window: 'week' | 'four_weeks' = 'week', over: Partial<React.ComponentProps<typeof NutrientDetail>> = {}) => {
    const info = META.nutrients.find(n => n.key === key)!;
    const found = (window === 'week' ? report.nutrients : report.fourWeek).find(n => n.nutrient === key)!;
    return render(
      <NutrientDetail report={found} name={info.label} unit={info.unit} mode={report.mode} window={window} history={report.history} onBack={jest.fn()} onSetGoal={jest.fn()} onHowWeCalculate={jest.fn()} {...over} />,
    );
  };

  it('shows the average, one sentence, the days, the sources and where the target came from', async () => {
    const tree = await detail(R.sodium_high!, 'sodium');
    const t = all(tree);
    expect(t).toContain('Sodium');
    expect(t).toContain('This week');
    expect(t).toContain('4,000');
    expect(byId(tree, 'detail-sentence')[0]!.props.children).toBe('Sodium averaged 4,000 mg a day, well above the limit of 2,300 mg.');
    expect(t).toContain('Within the limit on 0 of 7 days');
    expect(t).toContain('Top sources this week');
    expect(t).toContain('How this target is calculated');
    expect(t).toContain(rowOf(R.sodium_high!, 'sodium').target!.how);
    expect(t).toContain('R: A reference value from a standards body');
    expect(t).toContain('Highest day');
    expect(t).toContain(strings.disclaimer.footer);
    expect(byId(tree, 'detail-data')[0]!.props.children).toBe('Every food you logged has a value for this.');
  });

  it('lists up to three of the person\'s own foods, with their share', async () => {
    const tree = await detail(R.ordinary!, 'sodium');
    const t = all(tree);
    expect(rowOf(R.ordinary!, 'sodium').topSources.length).toBeGreaterThan(0);
    for (const s of rowOf(R.ordinary!, 'sodium').topSources) {
      expect(t).toContain(s.name);
      expect(t).toContain(`${Math.round(s.share * 100)}%`);
    }
  });

  it('shows eight weeks of protein and energy as a share of the target, with a text summary', async () => {
    const tree = await detail(R.ordinary!, 'protein');
    expect(labelled(tree, 'Last eight weeks, as a share of the target: no data, no data, no data, no data, 98%, 98%, 98%, 98%')).toHaveLength(1);
    const energy = await detail(R.ordinary!, 'calories');
    expect(labelled(energy, 'Last eight weeks, as a share of the target: no data, no data, no data, no data, 84%, 84%, 84%, 84%')).toHaveLength(1);
    const sodium = await detail(R.ordinary!, 'sodium');
    expect(sodium.root.findAll((n: ReactTestInstance) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Last eight weeks'))).toHaveLength(0);
  });

  it('reads a vitamin over the four weeks, and says how little of the data has a value when it does not', async () => {
    const tree = await detail(R.ordinary!, 'vitaminD', 'four_weeks');
    expect(all(tree)).toContain('Last four weeks');
    expect(all(tree)).not.toContain('Top sources this week');
  });

  it('says how much of what was logged had a value, when not all of it did', async () => {
    const r = R.thin_data!;
    const key = r.nutrients.find(n => n.dataCoverage < 1 && n.target)!.nutrient;
    const tree = await detail(r, key);
    expect(byId(tree, 'detail-data')[0]!.props.children).toMatch(/^Foods with a value cover \d+% of what you logged\.$/);
  });

  it('goes to the Goals screen to set a target, and to the explainer for how it was calculated', async () => {
    const onSetGoal = jest.fn();
    const onHow = jest.fn();
    const tree = await detail(R.ordinary!, 'protein', 'week', { onSetGoal, onHowWeCalculate: onHow });
    await press(tree, 'Set target');
    await press(tree, strings.disclaimer.howWeCalculate);
    expect([onSetGoal.mock.calls.length, onHow.mock.calls.length]).toEqual([1, 1]);
    const noTarget = await detail(R.ordinary!, 'sugar');
    expect(all(noTarget)).toContain('Set reference');
    expect(all(noTarget)).not.toContain('How this target is calculated');
  });
});

// ---- the India set ------------------------------------------------------------------------------------------------

describe('the India set on the report (ICMR-NIN, plan 4.10)', () => {
  const sentence = (key: string, name: string) => nutrientSentence({ name, report: rowOf(R.indian!, key), mode: 'personalised', window: 'week' });

  it('names iron and zinc by their average requirement, and sodium by India\'s limit', () => {
    expect(sentence('iron', 'Iron')).toBe('Iron averaged 11.9 mg a day, a little under the average requirement of 15 mg.');
    expect(sentence('zinc', 'Zinc')).toBe('Zinc averaged 8.1 mg a day, below the average requirement of 11 mg.');
    expect(sentence('sodium', 'Sodium')).toBe('Sodium averaged 2,520 mg a day, well above the limit of 2,000 mg.');
    expect(sentence('potassium', 'Potassium')).toBe('Potassium averaged 2,750 mg a day, a little under your target of 3,500 mg.');
    // The same iron on the US set is a target, not an average requirement.
    expect(nutrientSentence({ name: 'Iron', report: rowOf(R.ordinary!, 'iron'), mode: 'personalised', window: 'week' })).toMatch(/your target of 18 mg\.$/);
  });

  it('writes the row\'s target line the same way: "average requirement 15 mg", and "target" where there is an allowance', async () => {
    const info = (key: string) => META.nutrients.find(n => n.key === key)!;
    const line = (report: WeeklyReport, key: string) =>
      render(<NutrientLine report={rowOf(report, key)} name={info(key).label} unit={info(key).unit} mode={report.mode} judged />);
    expect(all(await line(R.indian!, 'iron'))).toContain('a day · average requirement 15 mg');
    expect(all(await line(R.indian!, 'calcium'))).toContain('a day · target 1,000 mg');
    expect(all(await line(R.ordinary!, 'iron'))).toContain('a day · target 18 mg');
  });

  it('keeps "your target" for a number the person typed, even for iron', () => {
    const iron = rowOf(R.indian!, 'iron').target!;
    expect(referencePhrase(iron, 'personalised')).toBe('the average requirement of 15 mg');
    expect(referencePhrase({ ...iron, origin: 'custom', value: 12 }, 'personalised')).toBe('your target of 12 mg');
    expect(referencePhrase({ ...iron, origin: 'care_team', value: 12 }, 'personalised')).toBe('your care-team target of 12 mg');
  });

  it('leads with iron, then the minerals furthest below their reference, before calcium and magnesium', async () => {
    showing(R.indian!);
    const tree = await render(<ReportScreen />);
    // What the Worker leads with, and the rows the screen draws for it: the minimums in that order, then the limit.
    expect(R.indian!.lead).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'iron', 'zinc', 'calcium', 'magnesium']);
    expect(tree.root.findAllByType(NutrientLine).map(n => n.props.report.nutrient).slice(0, 8)).toEqual(['protein', 'fiber', 'potassium', 'iron', 'zinc', 'calcium', 'magnesium', 'sodium']);
  });

  it('opens an iron row to the engine\'s own explanation: the Estimated Average Requirement, and no extra for a plant-based diet', async () => {
    const info = META.nutrients.find(n => n.key === 'iron')!;
    const found = rowOf(R.indian!, 'iron');
    const tree = await render(
      <NutrientDetail report={found} name={info.label} unit={info.unit} mode="personalised" window="week" history={R.indian!.history} onBack={jest.fn()} onSetGoal={jest.fn()} onHowWeCalculate={jest.fn()} />,
    );
    const t = all(tree);
    expect(t).toContain('Estimated Average Requirement for women aged 19 to 59 (ICMR-NIN, 2020, India)');
    expect(t).toContain('about 8% absorption');
    expect(t).not.toMatch(/1\.8/);
  });

  it('says which tables each part of the Nutrient mix was measured against', async () => {
    const tree = await render(<ScoreBreakdown report={R.indian!} visible onClose={jest.fn()} />);
    const t = all(tree);
    expect(t).toContain('Iron per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)');
    expect(t).toContain('Fibre per 1,000 kcal against 15 g per 1,000 kcal (ICMR-NIN)');
    expect(t).not.toContain('National Academies');
    expect(all(await render(<ScoreBreakdown report={R.ordinary!} visible onClose={jest.fn()} />))).toContain('Iron per 1,000 kcal against the Recommended Dietary Allowance (National Academies)');
  });

  it('judges fat by the share its own set gives', () => {
    const fat = (r: WeeklyReport) => rowOf(r, 'fat').target!.shareRange;
    expect(fat(R.indian!)).toEqual({ low: 0.15, high: 0.35 });
    expect(fat(R.ordinary!)).toEqual({ low: 0.2, high: 0.35 });
  });
});

// ---- the tone of everything the Worker says ----------------------------------------------------------------------

describe('what the Worker sends in words (plan 5.8, 11.6)', () => {
  it('has no moralising or alarming word in a target\'s explanation or a score standard, in any fixture', () => {
    const bad: string[] = [];
    for (const [name, r] of Object.entries(R)) {
      for (const n of [...r.nutrients, ...r.fourWeek]) if (n.target && MORALISING.test(n.target.how)) bad.push(`${name}/${n.nutrient}: ${n.target.how}`);
      for (const c of r.score.components) if (MORALISING.test(c.standard)) bad.push(`${name}/${c.id}: ${c.standard}`);
    }
    expect(bad).toEqual([]);
  });

  it('never puts a letter grade or a verdict word on the Report tab, whatever the week', async () => {
    const bad: string[] = [];
    for (const [name, r] of Object.entries(R)) {
      showing(r);
      const tree = await render(<ReportScreen />);
      for (const t of texts(tree)) {
        if (MORALISING.test(t) || /^[A-F][+-]?$/.test(t)) bad.push(`${name}: ${t}`);
      }
    }
    // The one place the words appear is the standard disclaimer's denial of a diagnosis: not on this screen.
    expect(bad).toEqual([]);
  });

  it('carries the standard disclaimer on every screen that shows a number', async () => {
    for (const ui of [<ReportScreen key="r" />, <WeeklySummaryScreen key="w" />]) {
      expect(all(await render(ui))).toContain('Estimates from what you logged, not medical advice.');
    }
  });
});

describe('every report the Worker sends is complete', () => {
  it('has seven days, twenty-one nutrients and eight weeks of history, and is clean JSON', () => {
    const bad: string[] = [];
    for (const [name, r] of Object.entries(R)) {
      if (r.coverage.days.length !== 7) bad.push(`${name}: ${r.coverage.days.length} days`);
      if (r.history.length !== 8) bad.push(`${name}: ${r.history.length} weeks of history`);
      if (!(r.nutrients.length === 21 || r.display.numbersHidden)) bad.push(`${name}: ${r.nutrients.length} nutrients`);
      if (/undefined|NaN|Infinity/.test(JSON.stringify(r))) bad.push(`${name}: not clean JSON`);
    }
    expect(bad).toEqual([]);
  });
});

export type { Insight };


it('selects each reporting period and keeps weekly assessments on the weekly view', async () => {
  const tree = await render(<ReportScreen />);
  for (const [label, from, to] of [
    ['Daily', '2026-10-11', '2026-10-11'],
    ['Monthly', '2026-10-01', '2026-10-31'],
    ['Yearly', '2026-01-01', '2026-12-31'],
    ['Custom', '2026-10-05', '2026-10-11'],
    ['Weekly', '2026-10-05', '2026-10-11'],
  ]) {
    await press(tree, label!);
    expect((useRangeReport as jest.Mock).mock.calls.at(-1)).toEqual([from, to]);
    expect(has(tree, 'energy-card')).toBe(label === 'Weekly');
  }
  await act(async () => tree.unmount());
});
