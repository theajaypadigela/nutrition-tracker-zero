/**
 * "Foods with gaps" (WEEKLY_BREAKDOWN_PLAN.md 7.4, Phase 4): next to Pending, the foods that lack values the weekly view needs, ranked by
 * their share of the energy logged, so the data gets filled in where it matters.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u', name: 'Zoe' } }) }));
jest.mock('@/state/pendingStore', () => ({ setPendingTotal: jest.fn() }));
jest.mock('@/hooks/useToday', () => ({ useToday: () => '2026-10-11' }));
jest.mock('@/api/client', () => {
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return { errorMessage, api: { uncached: jest.fn(), getFoodGaps: jest.fn(), addAlias: jest.fn() } };
});

import { api } from '@/api/client';
import type { FoodGaps, Meta } from '@/api/types';
import { FoodGapsList } from '@/components/food/FoodGapsList';
import { strings } from '@/i18n/strings';
import UncachedScreen from '@/screens/UncachedScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import metaJson from './fixtures/meta.json';

const META = { units: [], meals: [], baseUnits: [], ...(metaJson as object) } as unknown as Meta;
const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf);
const all = (tree: TestRenderer.ReactTestRenderer) => texts(tree).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const trees: TestRenderer.ReactTestRenderer[] = [];
async function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<ThemeProvider>{ui}</ThemeProvider>);
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});

const GAPS: FoodGaps = {
  from: '2026-09-14',
  to: '2026-10-11',
  loggedFoods: 4,
  completeFoods: 1,
  completeShare: 0.18,
  foods: [
    { foodId: 'rice', name: 'Rice', baseUnit: 'katori', share: 0.46, items: 12, missing: ['fiber', 'potassium', 'calcium'], source: null, reviewedAt: null },
    { foodId: 'dal', name: 'Dal', baseUnit: 'katori', share: 0.3, items: 1, missing: ['sodium', 'addedSugar'], source: 'label', reviewedAt: '2026-10-01T00:00:00.000Z' },
  ],
};

describe('the list of foods with gaps', () => {
  const list = (gaps: FoodGaps, numbersHidden = false, onOpen = jest.fn()) => render(<FoodGapsList gaps={gaps} nutrients={META.nutrients} numbersHidden={numbersHidden} onOpen={onOpen} />);

  it('ranks the foods as the Worker gave them, with their share of what was logged and what each lacks', async () => {
    const tree = await list(GAPS);
    const t = all(tree);
    expect(t).toContain('Foods with gaps');
    expect(t).toContain('Foods you ate in the last four weeks that are missing values the weekly view uses.');
    expect(t).toContain('18% of the energy you logged is from foods that have every value.');
    expect(t).toContain('46% of what you logged · logged 12 times');
    expect(t).toContain('Missing: Fiber, Potassium, Calcium');
    expect(t).toContain('30% of what you logged · logged once');
    expect(t).toContain('Missing: Sodium, Added sugars');
    expect(t.indexOf('Rice')).toBeLessThan(t.indexOf('Dal'));
  });

  it('says where the numbers it has came from, when it knows', async () => {
    const t = all(await list(GAPS));
    expect(t).toContain('A pack label');
  });

  it('opens the food to fill in', async () => {
    const onOpen = jest.fn();
    const tree = await list(GAPS, false, onOpen);
    const button = byId(tree, 'gap-fill-rice').find(n => typeof n.props.onPress === 'function')!;
    await act(async () => {
      button.props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith('rice');
  });

  it('says so when every food has what the weekly view needs, and says nothing when nothing was logged', async () => {
    expect(all(await list({ ...GAPS, foods: [], completeFoods: 4, completeShare: 1 }))).toContain('Every food you logged has the values the weekly view needs.');
    const none = await list({ ...GAPS, foods: [], loggedFoods: 0, completeFoods: 0, completeShare: 0 });
    expect(byId(none, 'food-gaps')).toHaveLength(0);
  });

  it('shows no percentage in low-pressure mode: the order says what matters', async () => {
    const t = all(await list(GAPS, true));
    expect(t).toContain('Missing: Fiber, Potassium, Calcium');
    expect(t).toContain('logged 12 times');
    expect(t).not.toMatch(/%/);
  });

  it('uses no word the copy rules ban', () => {
    const words = Object.values(strings.food.gaps).join(' ');
    expect(words).not.toMatch(/\b(good|bad|clean|cheat|guilt|fail|perfect|poor)\b/i);
  });
});

describe('the Pending tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false });
    api_.uncached.mockResolvedValue({ totals: { unknownFoods: 0, missingUnits: 0 }, unknownFoods: [], missingUnits: [] });
    api_.getFoodGaps.mockResolvedValue(GAPS);
  });

  it('shows the foods with gaps next to what is pending, even when nothing is pending', async () => {
    const tree = await render(<UncachedScreen />);
    const t = all(tree);
    expect(t).toContain('All caught up');
    expect(t).toContain('Foods with gaps');
    expect(t).toContain('Rice');
  });

  it('opens the food editor on a food to fill it in', async () => {
    const tree = await render(<UncachedScreen />);
    await act(async () => {
      byId(tree, 'gap-fill-dal').find(n => typeof n.props.onPress === 'function')!.props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('FoodEditor', { foodId: 'dal' });
  });

  it('hides percentages for a person who asked for numbers to be hidden', async () => {
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: true });
    const t = all(await render(<UncachedScreen />));
    expect(t).toContain('Foods with gaps');
    expect(t).not.toContain('of what you logged');
    expect(t).not.toContain('of the energy you logged');
  });

  it('keeps working when the list cannot be loaded', async () => {
    api_.getFoodGaps.mockRejectedValue(new Error('offline'));
    const t = all(await render(<UncachedScreen />));
    expect(t).toContain('All caught up');
    expect(t).not.toContain('Foods with gaps');
  });
});
