/**
 * The Pending tab in two lists: "My pending items" (what this person logged that cannot be counted yet) and "Global pending items"
 * (everything anyone logged), never mixed, with a mark in the shared list on the items that are also this person's.
 */
import React from 'react';
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
jest.mock('@/state/pendingStore', () => ({ setPendingTotal: jest.fn() }));
jest.mock('@/api/client', () => {
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return { errorMessage, api: { uncached: jest.fn(), getFoodGaps: jest.fn(), addAlias: jest.fn() } };
});

import { api } from '@/api/client';
import type { FoodGaps, Meta, PendingScope, Uncached } from '@/api/types';
import UncachedScreen from '@/screens/UncachedScreen';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { setPendingTotal } from '@/state/pendingStore';
import { ThemeProvider } from '@/theme';
import metaJson from './fixtures/meta.json';

const META = { units: [], meals: [], baseUnits: [], ...(metaJson as object) } as unknown as Meta;
const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const within = (node: ReactTestInstance) => node.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
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

const food = (name: string, over: Record<string, unknown> = {}) => ({
  normalizedName: name,
  examples: [name],
  units: ['bowl'],
  itemCount: 1,
  userCount: 1,
  myItemCount: 0,
  suggestions: [],
  ...over,
});
const unit = (foodId: string, foodName: string, u: string, over: Record<string, unknown> = {}) => ({
  foodId,
  foodName,
  baseUnit: 'katori',
  unit: u,
  itemCount: 1,
  userCount: 1,
  myItemCount: 0,
  ...over,
});

const MINE: PendingScope = {
  totals: { unknownFoods: 1, missingUnits: 1 },
  unknownFoods: [food('quinoa salad', { examples: ['Quinoa salad'], itemCount: 2, myItemCount: 2, lastDate: '2026-10-17', units: ['bowl', 'plate'] })],
  missingUnits: [unit('rice', 'Rice', 'plate', { myItemCount: 1, lastDate: '2026-10-16' })],
};
const FULL: Uncached = {
  totals: { unknownFoods: 3, missingUnits: 2 },
  unknownFoods: [
    food('jackfruit curry', { examples: ['Jackfruit curry'], itemCount: 4, userCount: 3, units: ['katori'] }),
    food('quinoa salad', { examples: ['Quinoa salad'], itemCount: 3, userCount: 2, myItemCount: 2, units: ['bowl', 'plate'] }),
    food('mystery chaat', { examples: ['Mystery chaat'] }),
  ],
  missingUnits: [unit('rice', 'Rice', 'plate', { itemCount: 2, userCount: 2, myItemCount: 1 }), unit('dal', 'Dal', 'handful', { userCount: 1 })],
  mine: MINE,
};
const GAPS: FoodGaps = {
  from: '2026-09-20',
  to: '2026-10-17',
  loggedFoods: 2,
  completeFoods: 0,
  completeShare: 0,
  foods: [{ foodId: 'idli', name: 'Idli', baseUnit: 'piece', share: 0.4, items: 3, missing: ['fiber'], source: null, reviewedAt: null }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', numbersHidden: false });
  api_.uncached.mockResolvedValue(FULL);
  api_.getFoodGaps.mockResolvedValue(GAPS);
});

describe('the Pending tab: my pending items and global pending items', () => {
  it('has two separate, named sections with their own counts, mine first', async () => {
    const tree = await render(<UncachedScreen />);
    const mine = byId(tree, 'pending-mine')[0]!;
    const global = byId(tree, 'pending-global')[0]!;
    expect(within(mine)).toContain('My pending items');
    expect(within(mine)).toContain('2 waiting');
    expect(within(global)).toContain('Global pending items');
    expect(within(global)).toContain('5 waiting');
    expect(all(tree).indexOf('My pending items')).toBeLessThan(all(tree).indexOf('Global pending items'));
    expect(all(tree)).toContain('2 yours · 5 in all');
  });

  it('puts only this person\'s items in their list, with their own counts and when they last logged them', async () => {
    const tree = await render(<UncachedScreen />);
    const mine = within(byId(tree, 'pending-mine')[0]!);
    expect(mine).toContain('Quinoa salad');
    expect(mine).toContain('2 items · bowl, plate · last logged today');
    expect(mine).toContain('Rice in plate');
    expect(mine).toContain('Stored per katori · 1 item · last logged yesterday');
    expect(mine).not.toContain('Jackfruit curry');
    expect(mine).not.toContain('Mystery chaat');
    expect(mine).not.toContain('Dal in handful');
    expect(mine).not.toContain('You logged this');
  });

  it('lists everything in the shared list, and marks only the items the person also logged', async () => {
    const tree = await render(<UncachedScreen />);
    const global = byId(tree, 'pending-global')[0]!;
    const text = within(global);
    for (const name of ['Jackfruit curry', 'Quinoa salad', 'Mystery chaat', 'Rice in plate', 'Dal in handful']) expect(text).toContain(name);
    expect(text).toContain('4 items · 3 people · in katori');
    const marked = (id: string) => within(byId(tree, id)[0]!).includes('You logged this');
    expect(marked('pending-food-global-quinoa salad')).toBe(true);
    expect(marked('pending-unit-global-rice-plate')).toBe(true);
    expect(marked('pending-food-global-jackfruit curry')).toBe(false);
    expect(marked('pending-food-global-mystery chaat')).toBe(false);
    expect(marked('pending-unit-global-dal-handful')).toBe(false);
  });

  it('keeps the two lists apart: an item in both has a card in each, with its own testID', async () => {
    const tree = await render(<UncachedScreen />);
    expect(byId(tree, 'pending-food-mine-quinoa salad').length).toBeGreaterThan(0);
    expect(byId(tree, 'pending-food-global-quinoa salad').length).toBeGreaterThan(0);
    expect(byId(tree, 'pending-food-mine-jackfruit curry')).toHaveLength(0);
  });

  it('says so, and keeps the shared list, when nothing of the person\'s own is waiting', async () => {
    api_.uncached.mockResolvedValue({ ...FULL, mine: { totals: { unknownFoods: 0, missingUnits: 0 }, unknownFoods: [], missingUnits: [] } });
    const tree = await render(<UncachedScreen />);
    expect(within(byId(tree, 'pending-mine')[0]!)).toContain('Nothing you logged is waiting for values.');
    expect(within(byId(tree, 'pending-mine')[0]!)).toContain('0 waiting');
    expect(within(byId(tree, 'pending-global')[0]!)).toContain('Jackfruit curry');
    expect(all(tree)).toContain('0 yours · 5 in all');
  });

  it('is all caught up only when nothing is pending anywhere', async () => {
    const none: PendingScope = { totals: { unknownFoods: 0, missingUnits: 0 }, unknownFoods: [], missingUnits: [] };
    api_.uncached.mockResolvedValue({ ...none, mine: none });
    const tree = await render(<UncachedScreen />);
    expect(all(tree)).toContain('Nothing waiting');
    expect(all(tree)).toContain('All caught up');
    expect(within(byId(tree, 'pending-mine')[0]!)).toContain('Nothing you logged is waiting for values.');
  });

  it('counts the person\'s own pending items on the tab badge, not everyone\'s', async () => {
    await render(<UncachedScreen />);
    expect(setPendingTotal).toHaveBeenLastCalledWith(2);
  });

  it('opens the same editors from either list', async () => {
    const tree = await render(<UncachedScreen />);
    const press = async (id: string, label: string) => {
      const card = byId(tree, id)[0]!;
      const button = card.findAll((n: ReactTestInstance) => typeof n.props.onPress === 'function' && within(n).includes(label))[0]!;
      await act(async () => {
        button.props.onPress();
      });
    };
    await press('pending-food-mine-quinoa salad', 'Enter values');
    expect(nav.navigate).toHaveBeenLastCalledWith('FoodEditor', { name: 'Quinoa salad', unitHint: 'bowl' });
    await press('pending-food-global-jackfruit curry', 'Enter values');
    expect(nav.navigate).toHaveBeenLastCalledWith('FoodEditor', { name: 'Jackfruit curry', unitHint: 'katori' });
    await press('pending-unit-mine-rice-plate', 'How much is 1 plate?');
    expect(nav.navigate).toHaveBeenLastCalledWith('UnitConversion', { foodId: 'rice', foodName: 'Rice', baseUnit: 'katori', unit: 'plate' });
    await press('pending-unit-global-dal-handful', 'How much is 1 handful?');
    expect(nav.navigate).toHaveBeenLastCalledWith('UnitConversion', { foodId: 'dal', foodName: 'Dal', baseUnit: 'katori', unit: 'handful' });
  });

  it('keeps "Foods with gaps" as its own list after both', async () => {
    const t = all(await render(<UncachedScreen />));
    expect(t).toContain('Foods with gaps');
    expect(t.indexOf('Global pending items')).toBeLessThan(t.indexOf('Foods with gaps'));
  });

  it('shows one list, named for what it is, when the Worker is older and sends no "mine"', async () => {
    const older: Partial<Uncached> = { ...FULL };
    delete older.mine;
    api_.uncached.mockResolvedValue(older);
    const tree = await render(<UncachedScreen />);
    expect(byId(tree, 'pending-mine')).toHaveLength(0);
    expect(within(byId(tree, 'pending-global')[0]!)).toContain('Global pending items');
    expect(all(tree)).toContain('5 waiting for values');
    expect(setPendingTotal).toHaveBeenLastCalledWith(5);
  });
});
