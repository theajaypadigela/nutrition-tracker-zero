/**
 * The Targets screen (WEEKLY_BREAKDOWN_PLAN.md 6, 7.7, 9.4): every target the engine makes, with its reason, including the four nutrients of
 * Phase 4, and a quiet note when the weight it rests on is old.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useToday', () => ({ useToday: jest.fn(() => '2026-10-11') }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/api/client', () => ({ errorMessage: (e: unknown) => String(e), api: { getTargets: jest.fn(), updateGoals: jest.fn() } }));

import { api } from '@/api/client';
import type { Meta, TargetsResponse, WeeklyReport } from '@/api/types';
import TargetsScreen from '@/screens/TargetsScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import metaJson from './fixtures/meta.json';
import reportsJson from './fixtures/reports.json';

const META = metaJson as unknown as Meta;
const R = reportsJson as unknown as Record<string, WeeklyReport>;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const trees: TestRenderer.ReactTestRenderer[] = [];
const render = async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <TargetsScreen />
      </ThemeProvider>,
    );
  });
  trees.push(tree);
  return tree;
};
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});

/** The targets the engine made for the ordinary week's person, as `GET /me/targets` serves them. */
const ordinary = R.ordinary!;
const RESPONSE: TargetsResponse = {
  mode: 'personalised',
  numbersHidden: false,
  targetSet: { id: 'ts_asha', effectiveFrom: '2026-01-01', energy: { target: 2150, maintenance: 2150, low: 1910, high: 2390 } } as unknown as TargetsResponse['targetSet'],
  targets: ordinary.nutrients.flatMap(n => (n.target ? [n.target] : [])),
  sources: {},
  checkIn: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  (useHealth as jest.Mock).mockReturnValue({ status: 'ready', mode: 'personalised', numbersHidden: false, checkIn: null, targetSet: { id: 'ts_asha' }, profile: { weightDate: '2026-10-01' }, refresh: jest.fn(() => Promise.resolve()) });
  api_.getTargets.mockResolvedValue(RESPONSE);
});

describe('the Targets screen', () => {
  it('lists every target the engine made, saturated fat, added sugars, B12 and folate included', async () => {
    const t = all(await render());
    expect(t).toContain('Keep in check');
    for (const name of ['Sodium', 'Saturated fat', 'Added sugars']) expect(t).toContain(name);
    for (const name of ['Vitamin D', 'Vitamin B12', 'Folate', 'Zinc']) expect(t).toContain(name);
    expect(t).toContain('24 g'); // saturated fat: 10% of 2,150 kcal
    expect(t).toContain('54 g'); // added sugars
    expect(t).toContain('2.4 mcg'); // vitamin B12
  });

  it('shows a target of every kind the catalogue has, and none the engine did not make (total sugars)', async () => {
    const t = all(await render());
    expect(t).not.toContain('Sugar\n');
    const made = new Set(RESPONSE.targets.map(x => x.nutrient));
    expect(made.has('sugar')).toBe(false);
    expect(['saturatedFat', 'addedSugar', 'vitaminB12', 'folate'].every(k => made.has(k))).toBe(true);
  });

  it('says nothing about the weight when it is recent', async () => {
    expect(all(await render())).not.toContain('Based on your weight in');
  });

  it('puts a quiet note under the energy target when the weight is older than 90 days', async () => {
    (useHealth as jest.Mock).mockReturnValue({ status: 'ready', mode: 'personalised', numbersHidden: false, checkIn: null, targetSet: { id: 'ts_asha' }, profile: { weightDate: '2026-07-04' }, refresh: jest.fn(() => Promise.resolve()) });
    const tree = await render();
    expect(all(tree)).toContain('Based on your weight in July.');
    (useHealth as jest.Mock).mockReturnValue({ status: 'ready', mode: 'personalised', numbersHidden: false, checkIn: null, targetSet: { id: 'ts_asha' }, profile: { weightDate: '2026-07-13' }, refresh: jest.fn(() => Promise.resolve()) }); // 90 days exactly
    expect(all(await render())).not.toContain('Based on your weight in');
  });
});

describe('the Targets screen on the India set (ICMR-NIN, plan 4.10)', () => {
  const indian = R.indian!;
  const INDIAN: TargetsResponse = {
    ...RESPONSE,
    targetSet: { id: 'ts_priya', referenceSet: 'icmr_nin', effectiveFrom: '2026-01-01', energy: { target: 2040, maintenance: 2040, low: 1800, high: 2280 } } as unknown as TargetsResponse['targetSet'],
    targets: indian.nutrients.flatMap(n => (n.target ? [n.target] : [])),
  };

  /** A row is a button that opens its reason: the node whose label starts with the name. */
  const rowButton = (tree: TestRenderer.ReactTestRenderer, name: string) =>
    tree.root.findAll((n: ReactTestInstance) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${name}, `) && typeof n.props.onPress === 'function')[0]!;

  it('shows its own numbers: a sodium limit of 2,000 mg, and iron, zinc and B12 called average requirements', async () => {
    api_.getTargets.mockResolvedValue(INDIAN);
    const tree = await render();
    const labels = (name: string) => rowButton(tree, name).props.accessibilityLabel as string;
    expect(labels('Sodium')).toMatch(/^Sodium, limit 2,000 mg\./);
    expect(labels('Iron')).toMatch(/^Iron, average requirement 15 mg\./);
    expect(labels('Zinc')).toMatch(/^Zinc, average requirement 11 mg\./);
    expect(labels('Vitamin B12')).toMatch(/^Vitamin B12, average requirement 2 mcg\./);
    // Calcium keeps its allowance, and so does the US set's iron.
    expect(labels('Calcium')).toMatch(/^Calcium, target 1,000 mg\./);
    expect(all(tree)).toContain('average requirement');
  });

  it('opens a row to the engine\'s own reason, with the allowance it stands in for', async () => {
    api_.getTargets.mockResolvedValue(INDIAN);
    const tree = await render();
    await act(async () => {
      rowButton(tree, 'Iron').props.onPress();
    });
    const t = all(tree);
    expect(t).toContain('Estimated Average Requirement for women aged 19 to 59 (ICMR-NIN, 2020, India)');
    expect(t).toContain('instead of the Recommended Dietary Allowance (29 mg)');
    await act(async () => {
      rowButton(tree, 'Added sugars').props.onPress();
    });
    expect(all(tree)).toContain('At most 5% of your energy target from added sugars');
  });

  it('keeps iron a target on the US set', async () => {
    const tree = await render();
    expect(rowButton(tree, 'Iron').props.accessibilityLabel).toMatch(/^Iron, target 18 mg\./);
  });

  it('explains the calculation in the words of the India set', async () => {
    api_.getTargets.mockResolvedValue(INDIAN);
    const t = all(await render());
    expect(t).toContain('Sodium is a limit of 2,000 mg a day, about 5 g of salt.');
    expect(t).toContain('Fibre is 15 g for every 1,000 kcal');
    expect(t).toContain('never under the Indian allowance of 0.83 g per kilogram');
    expect(t).toContain('Estimated Average Requirement, the level at which about half of people would still need more');
    expect(t).not.toContain('Iron is 1.8 times higher');
    expect(t).not.toContain('Sodium is a limit of 2,300 mg');
  });

  it('explains it in the National Academies\' words on the US set', async () => {
    const t = all(await render());
    expect(t).toContain('Sodium is a limit of 2,300 mg a day.');
    expect(t).toContain('Fibre is 14 g for every 1,000 kcal');
    expect(t).toContain('Iron is 1.8 times higher if you eat no meat');
    expect(t).not.toContain('Indian allowance');
  });

  it('follows the saved profile when the numbers are hidden and there is no set to read it from', async () => {
    (useHealth as jest.Mock).mockReturnValue({ status: 'ready', mode: 'personalised', numbersHidden: true, checkIn: null, targetSet: null, profile: { referenceSet: 'icmr_nin' }, refresh: jest.fn(() => Promise.resolve()) });
    api_.getTargets.mockResolvedValue({ mode: 'personalised', numbersHidden: true, targets: [], sources: {}, targetSet: null, checkIn: null });
    const t = all(await render());
    expect(t).toContain('Sodium is a limit of 2,000 mg a day, about 5 g of salt.');
  });
});
