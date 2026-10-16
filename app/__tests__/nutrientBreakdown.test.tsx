/**
 * "Which foods added up to this number?": every nutrient figure on Today and in the report opens the logged items behind it, with the
 * quantity and what each contributed, and a total that is the dashboard's own.
 */
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), addListener: jest.fn(() => () => {}) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useToday', () => ({ useToday: () => '2026-10-17' }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u', name: 'Zoe' } }) }));
jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return { ...actual, errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)), api: { getDay: jest.fn(), getNutrientBreakdown: jest.fn(), deleteItem: jest.fn(), updateItem: jest.fn() } };
});

import { api } from '@/api/client';
import type { BreakdownItem, Day, Item, Meta, NutrientBreakdown, Totals } from '@/api/types';
import { RangeIntakeCard } from '@/components/report/RangeIntakeCard';
import { SummaryCard } from '@/components/today/SummaryCard';
import NutrientBreakdownScreen from '@/screens/NutrientBreakdownScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import {
  breakdownOfDay,
  dailyAverage,
  dashboardTotal,
  dayTitle,
  exactAmount,
  exactTotal,
  groupByDay,
  groupByFood,
  groupByMeal,
  quantityText,
} from '@/utils/breakdown';
import metaJson from './fixtures/meta.json';

const META = { units: ['piece', 'katori', 'bowl'], meals: ['breakfast', 'lunch', 'snack', 'dinner'], baseUnits: [], ...(metaJson as object) } as unknown as Meta;
const rn = jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock>; useRoute: jest.Mock };
const nav = rn.__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const within = (node: ReactTestInstance) => node.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`nothing pressable with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};
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

// ---- data ------------------------------------------------------------------------------------------------------------------------

const item = (id: string, over: Partial<Item> & { protein?: number | null } = {}): Item => {
  const { protein = null, ...rest } = over;
  return {
    id,
    localDate: '2026-10-17',
    meal: 'breakfast',
    rawName: id,
    normalizedName: id,
    quantity: 1,
    unit: 'piece',
    foodId: `f-${id}`,
    foodName: null,
    baseUnit: 'piece',
    status: 'resolved',
    source: 'manual',
    callId: null,
    createdAt: '2026-10-17T05:00:00Z',
    nutrients: { calories: 100, protein },
    weight: null,
    amountCheck: null,
    ...rest,
  };
};

// The request's own example: Idli 6 g, Paneer curry 18 g, Rice and dal 12 g, Eggs 20 g.
const EXAMPLE: Item[] = [
  item('Idli', { quantity: 3, protein: 6, meal: 'breakfast' }),
  item('Eggs', { quantity: 2, protein: 20, meal: 'breakfast' }),
  item('Paneer curry', { quantity: 1, unit: 'katori', protein: 18, meal: 'lunch' }),
  item('Rice and dal', { quantity: 1, unit: 'katori', protein: 12, meal: 'lunch' }),
];

const day = (items: Item[], date = '2026-10-17'): Day => ({
  date,
  status: null,
  items: items.map(i => ({ ...i, localDate: date })),
  totals: {} as Totals,
  goals: { calories: 2000, protein: 50 },
  customGoals: [],
  pendingCount: 0,
  calls: [],
});

const bi = (id: string, date: string, amount: number | null, over: Partial<BreakdownItem> = {}): BreakdownItem => ({
  id,
  date,
  meal: 'lunch',
  rawName: id,
  foodName: null,
  quantity: 1,
  unit: 'katori',
  foodId: `f-${id}`,
  status: 'resolved',
  amount,
  ...over,
});

// ---- the pure parts ----------------------------------------------------------------------------------------------------------------

describe('the breakdown of a day', () => {
  it('lists each item with what it contributed and adds them up: Idli 6, Eggs 20, Paneer curry 18, Rice and dal 12 is 56 g', () => {
    const b = breakdownOfDay(day(EXAMPLE), 'protein');
    expect(b.items.map(i => [i.rawName, i.amount])).toEqual([['Idli', 6], ['Eggs', 20], ['Paneer curry', 18], ['Rice and dal', 12]]);
    expect(b.total).toBe(56);
    expect(b).toMatchObject({ knownItems: 4, missingItems: 0, isLowerBound: false, range: { from: '2026-10-17', to: '2026-10-17' } });
    expect(b.items.reduce((s, i) => s + (i.amount ?? 0), 0)).toBe(b.total);
  });

  it('reads an item with no value as unknown, never as zero, and says the total is a minimum', () => {
    const b = breakdownOfDay(day([...EXAMPLE, item('Mystery', { protein: null }), item('Quinoa', { status: 'pending_food', foodId: null, nutrients: {} })]), 'protein');
    expect(b).toMatchObject({ total: 56, knownItems: 4, missingItems: 2, isLowerBound: true });
    expect(b.items.find(i => i.rawName === 'Mystery')!.amount).toBeNull();
    expect(b.items.find(i => i.rawName === 'Quinoa')!.amount).toBeNull();
  });

  it('works for every nutrient the catalogue has, and for a day with nothing logged', () => {
    const d = day([item('x', { nutrients: { calories: 120, vitaminD: 1.5, iron: 0 } })]);
    expect(breakdownOfDay(d, 'vitaminD').total).toBe(1.5);
    expect(breakdownOfDay(d, 'iron').total).toBe(0);
    expect(breakdownOfDay(d, 'zinc')).toMatchObject({ total: null, missingItems: 1 });
    expect(breakdownOfDay(day([]), 'calories')).toMatchObject({ total: null, items: [], missingItems: 0 });
  });
});

describe('writing the total the way the dashboard does', () => {
  it('Today: a tenth of a gram, a whole number from 100, whole kcal, "≥" for a minimum', () => {
    expect(dashboardTotal('today', 'protein', 'g', 56, false)).toBe('56 g');
    expect(dashboardTotal('today', 'protein', 'g', 48.7, true)).toBe('≥ 48.7 g');
    expect(dashboardTotal('today', 'carbs', 'g', 189.4, false)).toBe('189 g');
    expect(dashboardTotal('today', 'calories', 'kcal', 1347.6, true)).toBe('≥ 1,348 kcal');
    expect(dashboardTotal('today', 'sodium', 'mg', 1259.2, false)).toBe('1259 mg');
  });

  it('the report: its own rounding, and "At least" for a minimum', () => {
    expect(dashboardTotal('report', 'protein', 'g', 56.83, false)).toBe('56.8 g');
    expect(dashboardTotal('report', 'calories', 'kcal', 1234.5, false)).toBe('1,235 kcal');
    expect(dashboardTotal('report', 'iron', 'mg', 3.456, true)).toBe('At least 3.46 mg');
  });

  it('keeps the exact sum for when the dashboard rounds: 56.83 g reads 56.8 g on Today', () => {
    expect(exactAmount(56.83)).toBe('56.83');
    expect(exactAmount(6)).toBe('6');
    expect(exactAmount(1234.5)).toBe('1,234.5');
    expect(exactTotal('today', 'g', 56.83, false)).toBe('56.83 g');
    expect(exactTotal('today', 'g', 56.83, true)).toBe('≥ 56.83 g');
    expect(exactTotal('report', 'g', 56.83, true)).toBe('At least 56.83 g');
    // when the two read the same there is nothing to add
    expect(exactTotal('today', 'g', 56, false)).toBe(dashboardTotal('today', 'protein', 'g', 56, false));
  });
});

describe('grouping', () => {
  const items = [
    bi('a', '2026-10-15', 6, { meal: 'breakfast', rawName: 'Idli', foodId: 'idli', quantity: 3, unit: 'piece' }),
    bi('b', '2026-10-15', 18, { meal: 'lunch', rawName: 'Paneer curry', foodId: 'paneer' }),
    bi('c', '2026-10-16', 4, { meal: 'breakfast', rawName: 'idli', foodName: 'Idli', foodId: 'idli', quantity: 2, unit: 'piece' }),
    bi('d', '2026-10-16', null, { meal: null, rawName: 'Quinoa', foodId: null, status: 'pending_food' }),
    bi('e', '2026-10-17', 0, { meal: 'dinner', rawName: 'Tea', foodId: 'tea', quantity: 1, unit: 'cup' }),
    bi('f', '2026-10-17', 3, { meal: 'lunch', rawName: 'Paneer curry', foodId: 'paneer', quantity: 0.5 }),
  ];

  it('by meal: the order of the day, "Other" last, each with what it adds up to', () => {
    const g = groupByMeal(items);
    expect(g.map(x => [x.title, x.subtotal, x.missing, x.items.length])).toEqual([['Breakfast', 10, 0, 2], ['Lunch', 21, 0, 2], ['Dinner', 0, 0, 1], ['Other', null, 1, 1]]);
  });

  it('by day: oldest first, each day with its own subtotal', () => {
    const g = groupByDay(items, d => `D${d.slice(-2)}`);
    expect(g.map(x => [x.title, x.subtotal, x.missing])).toEqual([['D15', 24, 0], ['D16', 4, 1], ['D17', 3, 0]]);
  });

  it('by food: the same food on several days added together, biggest first, unknown last', () => {
    const g = groupByFood(items);
    expect(g.map(x => [x.title, x.subtotal, x.items.length])).toEqual([['Paneer curry', 21, 2], ['Idli', 10, 2], ['Tea', 0, 1], ['Quinoa', null, 1]]);
    expect(quantityText(g[1]!.items)).toBe('5 piece');
    expect(quantityText([bi('x', 'd', 1, { quantity: 2, unit: 'piece' }), bi('y', 'd', 1, { quantity: 1, unit: 'katori' })])).toBe('2 piece + 1 katori');
  });

  it('every grouping adds up to the same total', () => {
    const total = (g: { subtotal: number | null }[]) => g.reduce((s, x) => s + (x.subtotal ?? 0), 0);
    expect(total(groupByMeal(items))).toBe(31);
    expect(total(groupByDay(items, d => d))).toBe(31);
    expect(total(groupByFood(items))).toBe(31);
  });

  it('names a day for a header, and averages over the days that have food', () => {
    expect(dayTitle('2026-10-17', '2026-10-17')).toBe('Today');
    expect(dayTitle('2026-10-16', '2026-10-17')).toBe('Yesterday');
    expect(dayTitle('2026-10-14', '2026-10-17')).toBe('Wed, Oct 14');
    const b: NutrientBreakdown = { nutrient: 'protein', total: 31, knownItems: 5, missingItems: 1, isLowerBound: true, items };
    expect(dailyAverage(b)).toEqual({ days: 3, average: 10.33 });
    expect(dailyAverage({ ...b, total: null })).toBeNull();
  });
});

// ---- the screens -------------------------------------------------------------------------------------------------------------------

describe('the Today dashboard', () => {
  const totals: Totals = {
    protein: { value: 48.7, missingItems: 3 },
    carbs: { value: 162, missingItems: 2 },
    fat: { value: 36, missingItems: 2 },
    fiber: { value: 13.4, missingItems: 2 },
    sugar: { value: 21.2, missingItems: 2 },
    sodium: { value: 1258, missingItems: 2 },
    calories: { value: 1243, missingItems: 2 },
    vitaminA: { value: 250, missingItems: 7 },
    iron: { value: 0, missingItems: 9 },
  };
  const card = (onOpen = jest.fn()) =>
    render(
      <SummaryCard
        consumed={1243}
        target={2000}
        targetIsReference
        totals={totals}
        itemCount={9}
        goals={{ calories: 2000, protein: 50, vitaminA: 800, iron: 13 }}
        units={Object.fromEntries(META.nutrients.map(n => [n.key, n.unit]))}
        kinds={Object.fromEntries(META.nutrients.map(n => [n.key, n.kind]))}
        nutrients={META.nutrients}
        onOpenNutrient={onOpen}
      />,
    );

  it('opens the breakdown from each of its seven figures', async () => {
    const onOpen = jest.fn();
    const tree = await card(onOpen);
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium']) {
      await press(tree, `summary-metric-${key}`);
      expect(onOpen).toHaveBeenLastCalledWith(key);
    }
    expect(onOpen).toHaveBeenCalledTimes(7);
  });

  it('tells a screen reader what each figure is and what tapping it does', async () => {
    const tree = await card();
    const label = (id: string) => byId(tree, id).find(n => typeof n.props.accessibilityLabel === 'string')!.props.accessibilityLabel as string;
    expect(label('summary-metric-protein')).toBe('Protein, at least 48.7 g, of 50 g. Shows which foods add up to this');
    expect(label('summary-metric-calories')).toContain('Shows which foods add up to this');
  });

  it('keeps every other nutrient behind "All nutrients": saturated fat, added sugars, vitamins and minerals', async () => {
    const onOpen = jest.fn();
    const tree = await card(onOpen);
    expect(byId(tree, 'summary-more-list')).toHaveLength(0);
    await press(tree, 'summary-all-nutrients');
    const list = byId(tree, 'summary-more-list')[0]!;
    const shown = within(list);
    for (const label of ['Saturated fat', 'Added sugars', 'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Vitamin B12', 'Folate', 'Calcium', 'Iron', 'Potassium', 'Magnesium', 'Zinc']) {
      expect(shown).toContain(label);
    }
    expect(shown).not.toContain('Protein');
    expect(shown).toContain('≥ 250');
    expect(shown).toContain('of 800 mcg');
    await press(tree, 'summary-metric-vitaminA');
    expect(onOpen).toHaveBeenLastCalledWith('vitaminA');
    await press(tree, 'summary-metric-iron');
    expect(onOpen).toHaveBeenLastCalledWith('iron');
    await press(tree, 'summary-all-nutrients');
    expect(byId(tree, 'summary-more-list')).toHaveLength(0);
  });

  it('reads a nutrient nothing has a value for as unknown, not zero', async () => {
    const tree = await card();
    await press(tree, 'summary-all-nutrients');
    expect(within(byId(tree, 'summary-metric-iron')[0]!)).toContain('—');
  });

  it('is plain figures, with nothing to tap, when no handler is given', async () => {
    const tree = await render(
      <SummaryCard consumed={0} target={null} targetIsReference={false} totals={{}} itemCount={0} goals={{}} units={{}} kinds={{}} />,
    );
    expect(byId(tree, 'summary-all-nutrients')).toHaveLength(0);
    expect(byId(tree, 'summary-metric-protein').every(n => !n.props.onPress || n.props.disabled)).toBe(true);
  });
});

describe('the report dashboard', () => {
  const report = {
    range: { from: '2026-10-12', to: '2026-10-18', through: '2026-10-17' },
    display: { numbersHidden: false },
    coverage: { calendarDays: 6, loggedDays: 3, skippedDays: 0, itemCount: 9, pendingItems: 1 },
    nutrients: META.nutrients.map((n, i) => ({ nutrient: n.key, total: 100 + i, meanPerLoggedDay: 33 + i, knownItems: 8, missingItems: 1, isLowerBound: true })),
  };

  it('opens the breakdown from a nutrient\'s row, for every nutrient', async () => {
    const onOpen = jest.fn();
    const tree = await render(<RangeIntakeCard report={report} nutrients={META.nutrients} onOpenNutrient={onOpen} />);
    await press(tree, 'range-nutrient-calories');
    expect(onOpen).toHaveBeenLastCalledWith('calories');
    await press(tree, 'report-view-more');
    for (const n of META.nutrients) {
      await press(tree, `range-nutrient-${n.key}`);
      expect(onOpen).toHaveBeenLastCalledWith(n.key);
    }
    expect(onOpen).toHaveBeenCalledTimes(1 + META.nutrients.length);
  });

  it('says in its label that the row opens the foods behind it', async () => {
    const tree = await render(<RangeIntakeCard report={report} nutrients={META.nutrients} onOpenNutrient={jest.fn()} />);
    const label = byId(tree, 'range-nutrient-protein').find(n => typeof n.props.accessibilityLabel === 'string')!.props.accessibilityLabel as string;
    expect(label).toContain('Shows which foods add up to this');
  });
});

describe('the breakdown screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', revision: 0 });
    rn.useRoute.mockReturnValue({ params: { nutrient: 'protein', from: '2026-10-17', to: '2026-10-17', origin: 'today' } });
    api_.getDay.mockResolvedValue(day(EXAMPLE));
  });

  it('shows each item of the day with its quantity and what it contributed, by meal, and the total pinned at the bottom', async () => {
    const tree = await render(<NutrientBreakdownScreen />);
    const t = all(tree);
    expect(t).toContain('Protein');
    expect(t).toContain('Today · Saturday, October 17');
    const breakfast = within(byId(tree, 'breakdown-group-breakfast')[0]!);
    expect(breakfast).toContain('Breakfast');
    expect(breakfast).toContain('26 g');
    expect(breakfast).toContain('Idli');
    expect(breakfast).toContain('3 piece');
    expect(breakfast).toContain('6 g');
    expect(breakfast).toContain('Eggs');
    expect(breakfast).toContain('20 g');
    const lunch = within(byId(tree, 'breakdown-group-lunch')[0]!);
    expect(lunch).toContain('Paneer curry');
    expect(lunch).toContain('1 katori');
    expect(lunch).toContain('18 g');
    expect(lunch).toContain('Rice and dal');
    expect(lunch).toContain('12 g');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('56 g');
    expect(byId(tree, 'breakdown-exact')).toHaveLength(0); // nothing to add: it reads the same as the dashboard
    expect(byId(tree, 'breakdown-missing')).toHaveLength(0);
    // the day comes from getDay (no extra call to the Worker's span route)
    expect(api_.getDay).toHaveBeenCalledWith('2026-10-17');
    expect(api_.getNutrientBreakdown).not.toHaveBeenCalled();
  });

  it('adds up exactly: the amounts shown sum to the total shown', async () => {
    api_.getDay.mockResolvedValue(day([item('a', { protein: 6.44, meal: 'breakfast' }), item('b', { protein: 18.33, meal: 'lunch' }), item('c', { protein: 12.41, meal: 'lunch' }), item('d', { protein: 19.62, meal: 'dinner' })]));
    const tree = await render(<NutrientBreakdownScreen />);
    const amounts = ['6.44', '18.33', '12.41', '19.62'];
    for (const a of amounts) expect(all(tree)).toContain(`${a} g`);
    expect(amounts.reduce((s, a) => s + Number(a), 0).toFixed(2)).toBe('56.80');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('56.8 g');
    expect(byId(tree, 'breakdown-exact')).toHaveLength(0); // 56.80 reads as 56.8 g: no second line
    // a total the dashboard has to round says what the items really add up to
    api_.getDay.mockResolvedValue(day([item('a', { protein: 6.44 }), item('b', { protein: 18.33 }), item('c', { protein: 12.41 }), item('d', { protein: 19.65 })]));
    const rounded = await render(<NutrientBreakdownScreen />);
    expect(textOf(byId(rounded, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('56.8 g');
    expect(all(rounded)).toContain('The items add up to 56.83 g.');
  });

  it('says what an item that adds nothing is: no value yet, or still waiting for its food or its unit', async () => {
    api_.getDay.mockResolvedValue(
      day([
        ...EXAMPLE,
        item('Mystery biscuit', { protein: null, meal: 'snack' }),
        item('Quinoa salad', { status: 'pending_food', foodId: null, nutrients: {}, meal: 'dinner' }),
        item('Rice', { status: 'pending_unit', nutrients: {}, meal: 'dinner', unit: 'plate' }),
      ]),
    );
    const tree = await render(<NutrientBreakdownScreen />);
    const t = all(tree);
    expect(t).toContain('No protein value for this food yet');
    expect(t).toContain('Waiting for its food values: not counted');
    expect(t).toContain('Waiting for its unit: not counted');
    expect(within(byId(tree, 'breakdown-missing')[0]!)).toContain('3 items have no protein value yet');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('≥ 56 g');
  });

  it('lets the missing values be filled in from the Pending tab', async () => {
    api_.getDay.mockResolvedValue(day([...EXAMPLE, item('Mystery', { protein: null })]));
    const tree = await render(<NutrientBreakdownScreen />);
    const open = byId(tree, 'breakdown-missing')[0]!.findAll((n: ReactTestInstance) => typeof n.props.onPress === 'function')[0]!;
    await act(async () => {
      open.props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('Main', { screen: 'Uncached' });
  });

  it('is for the day that was asked for, not today: a past day shows its own items and its own name', async () => {
    rn.useRoute.mockReturnValue({ params: { nutrient: 'protein', from: '2026-10-14', to: '2026-10-14', origin: 'today' } });
    api_.getDay.mockResolvedValue(day([item('Old idli', { protein: 4 })], '2026-10-14'));
    const tree = await render(<NutrientBreakdownScreen />);
    expect(api_.getDay).toHaveBeenCalledWith('2026-10-14');
    expect(all(tree)).toContain('Tuesday · October 14'.replace('Tuesday', 'Wednesday'));
    expect(all(tree)).toContain('Old idli');
  });

  it('says nothing was logged on an empty day, with no total', async () => {
    api_.getDay.mockResolvedValue(day([]));
    const tree = await render(<NutrientBreakdownScreen />);
    expect(all(tree)).toContain('Nothing logged this day.');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('—');
  });

  it('opens an item to edit it, and follows the change: the list and the total are read again after a save', async () => {
    const tree = await render(<NutrientBreakdownScreen />);
    await press(tree, 'breakdown-item-Idli');
    expect(all(tree)).toContain('Edit food item');
    api_.getDay.mockClear();
    api_.getDay.mockResolvedValue(day([item('Idli', { quantity: 5, protein: 10, meal: 'breakfast' }), ...EXAMPLE.slice(1)]));
    api_.updateItem.mockResolvedValue({});
    const save = tree.root.findAll((n: ReactTestInstance) => n.props.label === 'Save changes' && typeof n.props.onPress === 'function')[0]!;
    await act(async () => {
      await save.props.onPress();
    });
    expect(api_.updateItem).toHaveBeenCalledWith('Idli', expect.objectContaining({ unit: 'piece' }));
    expect(api_.getDay).toHaveBeenCalledWith('2026-10-17');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('60 g');
    expect(all(tree)).toContain('10 g');
  });

  it('deletes an item after asking, and the total drops with it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render(<NutrientBreakdownScreen />);
    await press(tree, 'breakdown-item-Eggs');
    const del = tree.root.findAll((n: ReactTestInstance) => n.props.label === 'Delete item' && typeof n.props.onPress === 'function')[0]!;
    await act(async () => {
      del.props.onPress();
    });
    expect(alert).toHaveBeenCalledWith('Delete this item?', 'Eggs', expect.any(Array));
    api_.deleteItem.mockResolvedValue(undefined);
    api_.getDay.mockResolvedValue(day(EXAMPLE.filter(i => i.id !== 'Eggs')));
    const confirm = (alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => Promise<void> }[]).find(b => b.text === 'Delete')!;
    await act(async () => {
      await confirm.onPress!();
    });
    expect(api_.deleteItem).toHaveBeenCalledWith('Eggs');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('36 g');
    expect(all(tree)).not.toContain('Eggs');
  });

  it('shows nothing, and says why, when numbers are hidden', async () => {
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: true, status: 'ready', revision: 0 });
    const tree = await render(<NutrientBreakdownScreen />);
    expect(all(tree)).toContain('Numbers are hidden, so there is nothing to add up.');
    expect(byId(tree, 'breakdown-footer')).toHaveLength(0);
    expect(byId(tree, 'breakdown-group-breakfast')).toHaveLength(0);
  });

  it('shows the error and a way to try again when the list cannot be loaded', async () => {
    api_.getDay.mockRejectedValue(new Error('Could not reach the server'));
    const tree = await render(<NutrientBreakdownScreen />);
    expect(all(tree)).toContain('Could not reach the server');
    expect(all(tree)).toContain('Try again');
  });
});

describe('the breakdown screen over a span of days', () => {
  const RANGE: NutrientBreakdown = {
    nutrient: 'protein',
    total: 31,
    knownItems: 5,
    missingItems: 1,
    isLowerBound: true,
    items: [
      bi('a', '2026-10-15', 6, { meal: 'breakfast', rawName: 'Idli', foodId: 'idli', quantity: 3, unit: 'piece' }),
      bi('b', '2026-10-15', 18, { meal: 'lunch', rawName: 'Paneer curry', foodId: 'paneer' }),
      bi('c', '2026-10-16', 4, { meal: 'breakfast', rawName: 'Idli', foodId: 'idli', quantity: 2, unit: 'piece' }),
      bi('d', '2026-10-16', null, { meal: 'dinner', rawName: 'Quinoa', foodId: null, status: 'pending_food', unit: 'bowl' }),
      bi('f', '2026-10-17', 3, { meal: 'lunch', rawName: 'Paneer curry', foodId: 'paneer', quantity: 0.5 }),
    ],
  };
  beforeEach(() => {
    jest.clearAllMocks();
    (useMeta as jest.Mock).mockReturnValue(META);
    (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false, status: 'ready', revision: 0 });
    rn.useRoute.mockReturnValue({ params: { nutrient: 'protein', from: '2026-10-12', to: '2026-10-18', origin: 'report' } });
    api_.getNutrientBreakdown.mockResolvedValue(RANGE);
  });

  it('asks the Worker for the span, lists it by day with each day\'s subtotal, and totals it the way the report does', async () => {
    const tree = await render(<NutrientBreakdownScreen />);
    expect(api_.getNutrientBreakdown).toHaveBeenCalledWith('2026-10-12', '2026-10-18', 'protein');
    expect(api_.getDay).not.toHaveBeenCalled();
    expect(all(tree)).toContain('Oct 12, 2026 – Oct 18, 2026');
    expect(within(byId(tree, 'breakdown-group-2026-10-15')[0]!)).toContain('Thu, Oct 15');
    expect(within(byId(tree, 'breakdown-group-2026-10-15')[0]!)).toContain('24 g');
    expect(within(byId(tree, 'breakdown-group-2026-10-16')[0]!)).toContain('≥ 4 g');
    expect(within(byId(tree, 'breakdown-group-2026-10-17')[0]!)).toContain('Today');
    // across days the meal is said on the row
    expect(all(tree)).toContain('3 piece · Breakfast');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('At least 31 g');
    expect(textOf(byId(tree, 'breakdown-average').find(n => (n.type as unknown) === 'Text')!)).toBe('Daily average 10.33 g, over 3 logged days');
  });

  it('can list the same items by food: each food added up over the days, the biggest first', async () => {
    const tree = await render(<NutrientBreakdownScreen />);
    await press(tree, 'breakdown-by-food');
    const list = within(byId(tree, 'breakdown-by-food-list')[0]!);
    expect(list.indexOf('Paneer curry')).toBeLessThan(list.indexOf('Idli'));
    expect(list).toContain('1.5 katori · 2 entries');
    expect(list).toContain('21 g');
    expect(list).toContain('5 piece · 2 entries');
    expect(list).toContain('10 g');
    expect(list).toContain('Quinoa');
    expect(list).toContain('Quinoa');
    expect(list).toContain('Waiting for its food values: not counted');
    expect(textOf(byId(tree, 'breakdown-total').find(n => (n.type as unknown) === 'Text')!)).toBe('At least 31 g'); // the same total
    await press(tree, 'breakdown-by-day');
    expect(byId(tree, 'breakdown-group-2026-10-15').length).toBeGreaterThan(0);
  });

  it('opens the same item to edit from a span, with what the list knows of it', async () => {
    const tree = await render(<NutrientBreakdownScreen />);
    await press(tree, 'breakdown-item-c');
    expect(all(tree)).toContain('Edit food item');
  });

  it('asks the log in again, rather than failing, when the secret is needed', async () => {
    const { ApiError } = jest.requireActual('@/api/client');
    api_.getNutrientBreakdown.mockRejectedValue(new ApiError(403, 'profile_secret_required', 'needed'));
    const tree = await render(<NutrientBreakdownScreen />);
    expect(all(tree)).toContain('Log in again to load this list.');
  });

  it('says nothing was logged in an empty period', async () => {
    api_.getNutrientBreakdown.mockResolvedValue({ ...RANGE, items: [], total: null, knownItems: 0, missingItems: 0, isLowerBound: false });
    const tree = await render(<NutrientBreakdownScreen />);
    expect(all(tree)).toContain('Nothing logged in this period.');
  });
});
